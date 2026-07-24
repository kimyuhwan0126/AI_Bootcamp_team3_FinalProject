// ─────────────────────────────────────────────────────────────
// routing.ts — 실 API(카카오/ODsay/TMAP) + 캐싱 + mock 폴백 통합
//
//  · resolveGeocode(text)         : 주소/역명 → 좌표 (카카오 → mock)
//  · travelMinutes(from,to,mode)  : 이동시간(분) (ODsay/TMAP → mock)
//  · recommendRegions(participants): 공평한 중간지역 후보 3 (실시간 기반)
//
//  캐시로 중복 호출을 막아 무료 한도(일 1,000콜)를 아낍니다.
// ─────────────────────────────────────────────────────────────
import {
  geocode as mockGeocode,
  estMinutes,
  haversineKm,
  HUBS,
  CANDIDATE_HUBS,
} from "./geo";
import { geocodeKakao, type Coord } from "./kakao";
import { transitRouteOdsay } from "./odsay";
import { carRouteTmap } from "./tmap";
import type { Participant, RegionCandidate } from "./types";

// 프로세스 캐시(재로드에도 유지)
const g = globalThis as unknown as {
  __moimerGeo?: Map<string, Coord>;
  __moimerRoute?: Map<string, number>;
};
const geoCache = g.__moimerGeo ?? (g.__moimerGeo = new Map());
const routeCache = g.__moimerRoute ?? (g.__moimerRoute = new Map());

// ── 지오코딩 ──
export async function resolveGeocode(text: string): Promise<Coord> {
  const key = text.replace(/\s/g, "");
  const hit = geoCache.get(key);
  if (hit) return hit;
  const real = await geocodeKakao(text);
  // 실 지오코딩 성공값만 캐시(폴백은 캐시 안 함 → API 복구 시 자동 실값 전환)
  if (real) {
    geoCache.set(key, real);
    return real;
  }
  return mockGeocode(text);
}

// ── 이동시간(분) ──
export async function travelMinutes(from: Coord, to: Coord, transport: string): Promise<number> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}|${transport}`;
  const hit = routeCache.get(key);
  if (hit != null) return hit;

  let real: number | null = null;
  if (transport === "car") {
    const r = await carRouteTmap(from, to);
    real = r?.min ?? null;
  } else {
    const r = await transitRouteOdsay(from, to);
    real = r?.min ?? null;
  }
  // 실 API 성공값만 캐시. 폴백(haversine 추정)은 캐시하지 않음.
  if (real != null) {
    routeCache.set(key, real);
    return real;
  }
  return estMinutes(haversineKm(from, to), transport);
}

// ── 중간지역 추천(실 이동시간 기반) ──
export async function recommendRegions(participants: Participant[]): Promise<RegionCandidate[]> {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  if (located.length === 0) return [];

  const scored = await Promise.all(
    CANDIDATE_HUBS.map(async (name) => {
      const hub = HUBS[name];
      const per = await Promise.all(
        located.map(async (p) => ({
          pid: p.id,
          name: p.name,
          min: await travelMinutes({ lat: p.lat!, lng: p.lng! }, hub, p.transport),
        }))
      );
      const mins = per.map((x) => x.min);
      const maxMin = Math.max(...mins);
      const devMin = maxMin - Math.min(...mins);
      return { name, hub, per, maxMin, devMin, score: maxMin + devMin * 0.8 };
    })
  );
  scored.sort((a, b) => a.score - b.score);

  return scored.slice(0, 3).map((s, i) => ({
    id: `r${i + 1}`,
    name: s.name,
    lat: s.hub.lat,
    lng: s.hub.lng,
    maxMin: s.maxMin,
    devMin: s.devMin,
    reason:
      i === 0
        ? `가장 균형적 — 최대 ${s.maxMin}분 · 편차 ${s.devMin}분`
        : `최대 ${s.maxMin}분 · 편차 ${s.devMin}분`,
    perParticipant: s.per,
  }));
}
