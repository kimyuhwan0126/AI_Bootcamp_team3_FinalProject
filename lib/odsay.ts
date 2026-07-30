// ─────────────────────────────────────────────────────────────
// odsay.ts — ODsay 대중교통 길찾기(searchPubTransPathT)
// 서버 키는 호출 IP 화이트리스트 등록 필요(lab.odsay.com).
// 키 없거나 오류 시 null → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";
import type { Coord } from "./kakao";

export interface TransitResult {
  min: number;       // 총 이동시간(분)
  transfers: number; // 환승 횟수
  fare: number;      // 요금(원)
  walkM: number;     // 총 도보(m)
}

// ── 경로 후보 상세 (시안1: 경로 상세 바텀시트용) ──
export interface TransitLeg {
  kind: "walk" | "subway" | "bus";
  name: string;         // 노선명/버스번호, 도보는 ""
  from: string;         // 승차 지점 (도보는 "")
  to: string;
  stations: number;     // 정거장 수 (도보 0)
  min: number;          // 구간 소요(분)
  distanceM: number;    // 도보 거리(m), 그 외 0
}
export interface TransitPathDetail {
  label: string;        // "지하철 직통" / "버스만" / "버스+지하철" 등
  pathType: 1 | 2 | 3;  // 1 지하철 2 버스 3 혼합
  min: number;
  fare: number;
  transfers: number;
  walkM: number;
  legs: TransitLeg[];
}

const TRAFFIC_KIND: Record<number, TransitLeg["kind"]> = { 1: "subway", 2: "bus", 3: "walk" };

export async function transitRoutesDetail(from: Coord, to: Coord, limit = 3): Promise<TransitPathDetail[] | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng), SY: String(from.lat),
      EX: String(to.lng), EY: String(to.lat),
      apiKey: env.odsay,
    });
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const paths = d?.result?.path;
    if (!Array.isArray(paths) || paths.length === 0) return null;

    return paths.slice(0, limit).map((path: any): TransitPathDetail => {
      const info = path.info ?? {};
      const legs: TransitLeg[] = (path.subPath ?? [])
        .filter((s: any) => !(s.trafficType === 3 && !(s.sectionTime > 0))) // 0분 도보 제거
        .map((s: any): TransitLeg => ({
          kind: TRAFFIC_KIND[s.trafficType] ?? "walk",
          name: s.lane?.[0]?.name ?? s.lane?.[0]?.busNo ?? "",
          from: s.startName ?? "",
          to: s.endName ?? "",
          stations: s.stationCount ?? 0,
          min: s.sectionTime ?? 0,
          distanceM: s.trafficType === 3 ? (s.distance ?? 0) : 0,
        }));
      const rides = legs.filter((l) => l.kind !== "walk");
      const transfers = Math.max(0, rides.length - 1);
      const label =
        path.pathType === 1 ? (transfers === 0 ? "지하철 직통" : `지하철 환승 ${transfers}회`)
        : path.pathType === 2 ? (transfers === 0 ? "버스 직통" : `버스 환승 ${transfers}회`)
        : "버스+지하철";
      return {
        label,
        pathType: path.pathType,
        min: Math.round(info.totalTime ?? 0),
        fare: info.payment ?? 0,
        transfers,
        walkM: info.totalWalk ?? 0,
        legs,
      };
    });
  } catch {
    return null;
  }
}

export async function transitRouteOdsay(from: Coord, to: Coord): Promise<TransitResult | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng),
      SY: String(from.lat),
      EX: String(to.lng),
      EY: String(to.lat),
      apiKey: env.odsay, // URLSearchParams가 인코딩 처리
    });
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const path = d?.result?.path?.[0];
    const info = path?.info;
    if (!info) return null;
    return {
      min: Math.round(info.totalTime),
      transfers: Math.max(0, (path.subPathCount ?? 1) - 1),
      fare: info.payment ?? 0,
      walkM: info.totalWalk ?? 0,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 대중교통 실제 경로 좌표(polyline)
//
// ODsay 는 경로 좌표를 바로 주지 않는다. 2단계가 필요하다:
//   1) searchPubTransPathT → path[i].info.mapObj  (경로 식별자)
//   2) loadLane?mapObject=0:0@{mapObj} → lane[].section[].graphPos[]
// graphPos 는 {x: 경도, y: 위도} 형식이다.
// ─────────────────────────────────────────────────────────────
export async function transitPathOdsay(from: Coord, to: Coord): Promise<Coord[] | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng), SY: String(from.lat),
      EX: String(to.lng), EY: String(to.lat),
      apiKey: env.odsay,
    });
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const mapObj: string | undefined = d?.result?.path?.[0]?.info?.mapObj;
    if (!mapObj) return null;

    const lp = new URLSearchParams({ mapObject: `0:0@${mapObj}`, apiKey: env.odsay });
    const lr = await fetch(`https://api.odsay.com/v1/api/loadLane?${lp.toString()}`);
    if (!lr.ok) return null;
    const ld = await lr.json();

    const lanes: { section?: { graphPos?: { x: number; y: number }[] }[] }[] = ld?.result?.lane ?? [];
    const pts: Coord[] = [];
    for (const lane of lanes) {
      for (const sec of lane.section ?? []) {
        for (const g of sec.graphPos ?? []) pts.push({ lat: g.y, lng: g.x });
      }
    }
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}
