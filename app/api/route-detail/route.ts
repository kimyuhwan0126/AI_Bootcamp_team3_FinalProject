import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { transitRoutesDetail, type TransitPathDetail } from "@/lib/odsay";
import { carRoutesDetail, type CarOptionDetail } from "@/lib/tmap";

export const dynamic = "force-dynamic";

// 유류비 추정: km당 원 (연비 12km/L · 휘발유 1,900원/L 기준 ≈ 158원 → 160원)
const FUEL_WON_PER_KM = 160;

// 10분 캐시 — 무료 한도 보호 (실시간성과 절충)
const g = globalThis as unknown as { __routeDetail?: Map<string, { at: number; data: any }> };
const cache = g.__routeDetail ?? (g.__routeDetail = new Map());
const TTL = 10 * 60 * 1000;

export interface RouteDetailResponse {
  mode: "transit" | "car";
  participantName: string;
  origin: string;
  destName: string;
  live: boolean;                       // 실 API 성공 여부
  transit?: TransitPathDetail[];       // mode=transit
  car?: CarOptionDetail[];             // mode=car
  carpool?: {                          // mode=car: 정산 미리보기
    tollFare: number;
    fuelWon: number;
    perHead: { people: number; won: number }[];
  };
}

// GET /api/route-detail?code=&participantId=&toLat=&toLng=&toName=
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code") ?? "";
  const pid = q.get("participantId") ?? "";
  const toLat = parseFloat(q.get("toLat") ?? "");
  const toLng = parseFloat(q.get("toLng") ?? "");
  const toName = q.get("toName") ?? "목적지";

  if (!code || !pid || !Number.isFinite(toLat) || !Number.isFinite(toLng)) {
    return NextResponse.json({ error: "code/participantId/toLat/toLng 필요" }, { status: 400 });
  }
  const state = await getState(code);
  if (!state) return NextResponse.json({ error: "모임 없음" }, { status: 404 });
  const p = state.participants.find((x) => x.id === pid);
  if (!p) return NextResponse.json({ error: "참가자 없음" }, { status: 404 });
  if (p.lat == null || p.lng == null) {
    return NextResponse.json({ error: "출발지가 등록되지 않았어요" }, { status: 400 });
  }

  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}|${p.transport}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ ...hit.data, participantName: p.name, origin: p.origin, destName: toName });
  }

  const from = { lat: p.lat, lng: p.lng };
  const to = { lat: toLat, lng: toLng };

  let data: RouteDetailResponse;
  if (p.transport === "car") {
    const car = await carRoutesDetail(from, to);
    let carpool: RouteDetailResponse["carpool"];
    if (car && car.length) {
      const best = car[0];
      const fuelWon = Math.round((best.distanceM / 1000) * FUEL_WON_PER_KM / 10) * 10;
      const total = best.tollFare + fuelWon;
      carpool = {
        tollFare: best.tollFare,
        fuelWon,
        perHead: [2, 3, 4].map((n) => ({ people: n, won: Math.round(total / n / 10) * 10 })),
      };
    }
    data = {
      mode: "car",
      participantName: p.name,
      origin: p.origin ?? "",
      destName: toName,
      live: !!car,
      car: car ?? undefined,
      carpool,
    };
  } else {
    const transit = await transitRoutesDetail(from, to, 3);
    data = {
      mode: "transit",
      participantName: p.name,
      origin: p.origin ?? "",
      destName: toName,
      live: !!transit,
      transit: transit ?? undefined,
    };
  }

  // 실 API 성공값만 캐시 (폴백 캐시 오염 방지 — routing.ts와 동일 원칙)
  if (data.live) cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data);
}
