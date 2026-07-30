// ─────────────────────────────────────────────────────────────
// tmap.ts — TMAP 자동차 경로안내(routes)  · SK Open API appKey
// 키 없거나 오류 시 null → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";
import type { Coord } from "./kakao";

export interface CarResult {
  min: number;        // 총 소요시간(분)
  distanceM: number;  // 총 거리(m)
  fare: number;       // 통행요금(원)
}

async function carRouteOnce(from: Coord, to: Coord, searchOption: string): Promise<any | null> {
  const r = await fetch("https://apis.openapi.sk.com/tmap/routes?version=1&format=json", {
    method: "POST",
    headers: { appKey: env.tmap, "Content-Type": "application/json" },
    body: JSON.stringify({
      startX: from.lng,
      startY: from.lat,
      endX: to.lng,
      endY: to.lat,
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      searchOption,
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.features?.[0]?.properties ?? null;
}

/**
 * 자차 경로의 실제 도로 좌표열(polyline).
 * TMAP 응답의 LineString feature 들을 순서대로 이어 붙인다.
 * (carRouteTmap 은 properties 만 쓰고 geometry 는 버리고 있었다)
 */
export async function carPathTmap(from: Coord, to: Coord): Promise<Coord[] | null> {
  if (!env.tmap) return null;
  try {
    const r = await fetch("https://apis.openapi.sk.com/tmap/routes?version=1&format=json", {
      method: "POST",
      headers: { appKey: env.tmap, "Content-Type": "application/json" },
      body: JSON.stringify({
        startX: from.lng, startY: from.lat, endX: to.lng, endY: to.lat,
        reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", searchOption: "0",
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const feats: { geometry?: { type?: string; coordinates?: [number, number][] } }[] = d?.features ?? [];
    const pts: Coord[] = [];
    for (const f of feats) {
      if (f.geometry?.type !== "LineString") continue;
      for (const c of f.geometry.coordinates ?? []) pts.push({ lat: c[1], lng: c[0] });
    }
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}

export async function carRouteTmap(from: Coord, to: Coord): Promise<CarResult | null> {
  if (!env.tmap) return null;
  try {
    const props = await carRouteOnce(from, to, "0");
    if (!props) return null;
    return {
      min: Math.round((props.totalTime ?? 0) / 60),
      distanceM: props.totalDistance ?? 0,
      fare: props.totalFare ?? 0,
    };
  } catch {
    return null;
  }
}

// ── 옵션별 상세 (시안2: 자차 상세 바텀시트용) ──
export interface CarOptionDetail {
  key: string;          // "0" | "2" | "10"
  label: string;        // 교통최적 / 최소시간 / 최단거리
  min: number;
  distanceM: number;
  tollFare: number;     // 통행료(원)
  taxiFare: number;     // 예상 택시요금(원)
}

const CAR_OPTIONS: [string, string][] = [
  ["0", "교통최적"],
  ["2", "최소시간"],
  ["10", "최단거리"],
];

export async function carRoutesDetail(from: Coord, to: Coord): Promise<CarOptionDetail[] | null> {
  if (!env.tmap) return null;
  try {
    const results = await Promise.all(
      CAR_OPTIONS.map(async ([key, label]) => {
        const pr = await carRouteOnce(from, to, key);
        if (!pr) return null;
        return {
          key,
          label,
          min: Math.round((pr.totalTime ?? 0) / 60),
          distanceM: pr.totalDistance ?? 0,
          tollFare: pr.totalFare ?? 0,
          taxiFare: pr.taxiFare ?? 0,
        } as CarOptionDetail;
      })
    );
    const ok = results.filter(Boolean) as CarOptionDetail[];
    return ok.length ? ok : null;
  } catch {
    return null;
  }
}
