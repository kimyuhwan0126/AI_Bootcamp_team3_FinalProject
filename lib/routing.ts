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
  generatePlaces,
} from "./geo";
import { geocodeKakao, searchPlacesKakao, type Coord } from "./kakao";
import { transitRouteOdsay } from "./odsay";
import { carRouteTmap } from "./tmap";
import type { Participant, RegionCandidate, PlaceCandidate } from "./types";

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

// ── 추천장소(2차 논의 후보): 카카오 로컬 실검색 → 실패 시 mock ──
const PLACE_QUERIES: { kw: string; emoji: string; deposit: number }[] = [
  { kw: "맛집",  emoji: "🍽️", deposit: 15000 },
  { kw: "술집",  emoji: "🍺", deposit: 10000 },
  { kw: "카페",  emoji: "☕", deposit: 5000 },
];
function emojiFor(category: string, fallback: string): string {
  if (/카페|커피|디저트|베이커리/.test(category)) return "☕";
  if (/호프|술집|포차|바|이자카야|맥주/.test(category)) return "🍺";
  if (/일식|초밥|돈까스|라멘/.test(category)) return "🍽️";
  if (/고기|삼겹|갈비|구이/.test(category)) return "🥩";
  if (/한식|국밥|찌개|백반/.test(category)) return "🍲";
  if (/중식|중국/.test(category)) return "🥟";
  if (/양식|파스타|피자|버거/.test(category)) return "🍕";
  return fallback;
}

export async function recommendPlaces(regionName: string, center: Coord): Promise<PlaceCandidate[]> {
  // 카테고리별로 실제 가게를 검색해 골고루 섞은 후보 4~5개 구성
  const results = await Promise.all(
    PLACE_QUERIES.map((q) => searchPlacesKakao(`${regionName} ${q.kw}`, center, 3))
  );

  const merged: PlaceCandidate[] = [];
  const seen = new Set<string>();
  results.forEach((list, qi) => {
    for (const doc of list ?? []) {
      if (seen.has(doc.name)) continue;
      seen.add(doc.name);
      merged.push({
        id: "tmp",
        name: doc.name,
        category: doc.category,
        emoji: emojiFor(doc.category, PLACE_QUERIES[qi].emoji),
        distanceM: doc.distanceM,
        rating: 0,                      // 카카오 로컬엔 평점이 없음 → UI에서 미표시
        reservable: true,               // 유료서비스(모의 예약) 대상
        depositPerHead: PLACE_QUERIES[qi].deposit,
        url: doc.url || undefined,
      });
      if (merged.length >= 5) break;
    }
  });

  if (merged.length === 0) return generatePlaces(regionName); // 키 없음/실패 → mock
  return merged.slice(0, 5).map((p, i) => ({ ...p, id: `p${i + 1}` }));
}
