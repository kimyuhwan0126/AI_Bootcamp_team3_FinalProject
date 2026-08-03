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
  nearCentroidHubs,
  generatePlaces,
  isOutsideHubCoverage,
  geometricCandidates,
} from "./geo";
import { geocodeKakao, coord2AddressKakao, searchPlacesKakao, type Coord } from "./kakao";
import { transitRouteOdsay } from "./odsay";
import { carRouteTmap } from "./tmap";
import type { Participant, RegionCandidate, PlaceCandidate } from "./types";
import { FLAGS } from "./flags";
import { rankCandidates } from "./scoring";
import type { LocatedParticipant } from "./scoring/types";

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
  // 진단 모드에서는 캐시를 건너뛴다 — 이 캐시엔 TTL 이 없어서, 실측 중에
  // 같은 좌표를 반복 호출해도 첫 응답만 계속 돌아온다(값이 안 바뀌는 것처럼 보인다).
  const hit = FLAGS.odsayProbe ? undefined : routeCache.get(key);
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
    if (!FLAGS.odsayProbe) routeCache.set(key, real);
    return real;
  }
  return estMinutes(haversineKm(from, to), transport);
}

type Located = LocatedParticipant;

// 후보들을 스코어러 등록소(lib/scoring)에 넘겨 평가한다.
//
// 점수식을 여기서 직접 쓰지 않는 이유: 담당자 여러 명이 관점(공평성·상권·날씨·
// 개인선호)을 각자 추가할 때, 식이 이 파일에 있으면 전부 같은 줄에서 충돌한다.
// 등록소 방식이면 각자 lib/scoring/<자기파일>.ts 만 만들면 된다.
async function scoreCandidates(
  candidates: { name: string; hub: { lat: number; lng: number } }[],
  located: Located[]
): Promise<RegionCandidate[]> {
  const ranked = await rankCandidates(
    candidates,
    { participants: located },
    // 이동시간은 여기서 한 번만 구해 넘긴다 — 스코어러마다 다시 부르면
    // 유료 API를 (후보 수 × 스코어러 수)만큼 때린다 (CLAUDE.md §4).
    (hub) =>
      Promise.all(
        located.map(async (p) => ({
          pid: p.id,
          name: p.name,
          min: await travelMinutes({ lat: p.lat, lng: p.lng }, hub, p.transport),
        }))
      )
  );

  return ranked.slice(0, 3).map((s, i) => {
    // 스코어러가 남긴 근거를 그대로 이어붙인다. 지금은 공평성 하나뿐이라
    // "최대 N분 · 편차 M분" 이고, 상권·날씨가 붙으면 자동으로 늘어난다.
    const detail = s.breakdown
      .map((b) => b.explain)
      .filter((x): x is string => !!x)
      .join(" · ");
    return {
      id: `r${i + 1}`,
      name: s.name,
      lat: s.hub.lat,
      lng: s.hub.lng,
      maxMin: s.maxMin,
      devMin: s.devMin,
      reason: i === 0 ? `가장 균형적 — ${detail}` : detail,
      perParticipant: s.travel,
    };
  });
}

// 참가자가 수도권 밖(예: 안동·대구)이면 고정 후보 12곳(서울 지하철역)은 전부
// 수백 km 떨어져 있다. 그런데도 "가까운 순 최소 확보" 폴백이 그중 제일 가까운
// 곳(예: 잠실)을 그대로 추천해, 실제로는 중간이 아닌 곳이 1위로 뜨는 문제가
// 있었다. 이럴 때는 이름 있는 서울 후보 대신 참가자 좌표로 직접 계산한 지점을
// 쓰고, 실 좌표 → 지명은 카카오 역지오코딩으로 채운다(키 없으면 "중간지점 N").
async function recommendDynamicRegions(located: Located[]): Promise<RegionCandidate[]> {
  const points = geometricCandidates(located);
  const named = await Promise.all(
    points.map(async (hub, i) => ({ hub, name: (await coord2AddressKakao(hub)) || `중간지점 ${i + 1}` }))
  );
  // 후보 지점이 가까우면 같은 동/읍/면 이름으로 겹칠 수 있다 — 중복 이름 제거
  const seen = new Set<string>();
  const uniq = named.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  return scoreCandidates(uniq, located);
}

// ── 특정 지점의 공평성 점수 — 참가자 전원의 이동시간·편차 ──
//  참가자가 직접 제안한 후보(다른 후보 등록)와 AI evaluate_region 이 함께 쓴다.
export async function scoreRegionForParticipants(
  hub: Coord,
  participants: Participant[]
): Promise<{ maxMin: number; devMin: number; perParticipant: { pid: string; name: string; min: number }[] }> {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  const perParticipant = await Promise.all(
    located.map(async (p) => ({
      pid: p.id,
      name: p.name,
      min: await travelMinutes({ lat: p.lat!, lng: p.lng! }, hub, p.transport),
    }))
  );
  const mins = perParticipant.map((x) => x.min);
  const maxMin = mins.length ? Math.max(...mins) : 0;
  const devMin = mins.length ? maxMin - Math.min(...mins) : 0;
  return { maxMin, devMin, perParticipant };
}

// ── 중간지역 추천(실 이동시간 기반) ──
export async function recommendRegions(participants: Participant[]): Promise<RegionCandidate[]> {
  const located = participants.filter((p) => p.lat != null && p.lng != null) as Located[];
  if (located.length === 0) return [];

  if (isOutsideHubCoverage(located)) return recommendDynamicRegions(located);

  // 거리 기반과 동일하게 후보를 참가자 중심 근처로 좁힌다
  const pool = nearCentroidHubs(located).map((name) => ({ name, hub: HUBS[name] }));
  return scoreCandidates(pool, located);
}

// ── 추천장소(2차 논의 후보): 카카오 로컬 실검색 → 실패 시 mock ──
const PLACE_QUERIES: { kw: string; emoji: string; deposit: number }[] = [
  { kw: "맛집",  emoji: "🍽️", deposit: 15000 },
  { kw: "술집",  emoji: "🍺", deposit: 10000 },
  { kw: "카페",  emoji: "☕", deposit: 5000 },
];
export function emojiFor(category: string, fallback: string): string {
  if (/카페|커피|디저트|베이커리/.test(category)) return "☕";
  if (/호프|술집|포차|바|이자카야|맥주/.test(category)) return "🍺";
  if (/일식|초밥|돈까스|라멘/.test(category)) return "🍽️";
  if (/고기|삼겹|갈비|구이/.test(category)) return "🥩";
  if (/한식|국밥|찌개|백반/.test(category)) return "🍲";
  if (/중식|중국/.test(category)) return "🥟";
  if (/양식|파스타|피자|버거/.test(category)) return "🍕";
  if (/노래|코인노래|유흥/.test(category)) return "🎤";
  if (/와인/.test(category)) return "🍷";
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
        lat: doc.lat,
        lng: doc.lng,
        distanceM: doc.distanceM,
        rating: 0,                      // 카카오 로컬엔 평점이 없음 → UI에서 미표시
        reservable: true,               // 유료서비스(모의 예약) 대상
        depositPerHead: PLACE_QUERIES[qi].deposit,
        url: doc.url || undefined,
      });
      if (merged.length >= 5) break;
    }
  });

  if (merged.length === 0) return generatePlaces(regionName, center); // 키 없음/실패 → mock
  return merged.slice(0, 5).map((p, i) => ({ ...p, id: `p${i + 1}` }));
}
