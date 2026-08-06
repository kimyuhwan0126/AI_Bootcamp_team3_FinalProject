import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { transitRoutesDetail, type TransitPathDetail } from "@/lib/odsay";
import { carRoutesDetail, type CarOptionDetail } from "@/lib/tmap";
import { FLAGS } from "@/lib/flags";

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
  /**
   * 목적지 좌표. **화면이 카카오맵 길찾기 링크를 만들 때 쓴다.**
   *
   * 왜 이름만으로는 안 되나: 카카오맵의 공식 URL 스킴은
   * `map.kakao.com/link/to/{이름},{위도},{경도}` 로 **좌표를 요구**한다.
   * 2026-08-06 에 `?sName=&eName=`(이름만) 형식으로 붙였다가 **카카오맵이 그대로
   * 무시해서 출발지·도착지가 빈 채로 열렸다** — 링크가 있으나 마나였다.
   */
  to: { lat: number; lng: number };
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
  // 진단 모드에서는 10분 캐시를 건너뛴다 — 실측 중 같은 좌표를 다시 물어도
  // 10분 동안 첫 응답만 돌아와, 코드를 고쳐도 안 바뀌는 것처럼 보인다.
  const hit = FLAGS.odsayProbe ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    // ⚠️ `to` 도 함께 덮는다. 캐시 키는 좌표를 **소수 4자리로 반올림**해서 만들므로
    //    같은 키라도 원래 요청 좌표와 미세하게 다를 수 있다 — 링크에 실릴 값이라
    //    캐시에 남은 값이 아니라 **이번 요청 값**을 쓴다.
    return NextResponse.json({ ...hit.data, participantName: p.name, origin: p.origin, destName: toName, to: { lat: toLat, lng: toLng } });
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
      to,
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
      to,
      live: !!transit,
      transit: transit ?? undefined,
    };
  }

  // 실 API 성공값만 캐시 (폴백 캐시 오염 방지 — routing.ts와 동일 원칙)
  if (data.live && !FLAGS.odsayProbe) cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data);
}
