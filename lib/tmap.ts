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

export async function carRouteTmap(from: Coord, to: Coord): Promise<CarResult | null> {
  if (!env.tmap) return null;
  try {
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
        searchOption: "0",
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const props = d?.features?.[0]?.properties;
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
