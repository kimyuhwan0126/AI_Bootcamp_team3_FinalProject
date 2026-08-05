// ─────────────────────────────────────────────────────────────
// routing.ts — 실 API(카카오/ODsay/TMAP) + 캐싱 + mock 폴백 통합
//
//  · resolveGeocode(text)         : 주소/역명 → 좌표 (카카오 → mock)
//  · travelMinutes(from,to,mode)  : 이동시간(분) (ODsay/TMAP → mock)
//  · recommendRegions(participants): 공평한 중간지역 후보 3 (실 경로 기반)
//    ⚠️ "실시간"이 아니다 — ODsay·TMAP 요청에 시각을 보내지 않는다. 실 API 값은
//       "지금"이 아니라 "실제 노선을 계산한 값"이다. 화면 문구도 `경로 기준` 이다.
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
import { geoCacheGet, geoCacheSet, routeCacheGet, routeCacheSet } from "./cache-store";
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

  // L1 메모리 — 같은 프로세스 안에서 즉시
  const hit = geoCache.get(key);
  if (hit) return hit;

  // L2 DB — 재시작해도 살아남는다. DB 가 없으면(팀원 로컬) null 이라 그냥 넘어간다.
  const stored = await geoCacheGet(key);
  if (stored) {
    geoCache.set(key, stored); // 다음 호출부터는 L1 에서 끝난다
    return stored;
  }

  // L3 외부 API
  const real = await geocodeKakao(text);
  // 실 지오코딩 성공값만 캐시(폴백은 캐시 안 함 → API 복구 시 자동 실값 전환)
  if (real) {
    geoCache.set(key, real);
    void geoCacheSet(key, real); // DB 쓰기는 응답을 막지 않는다
    return real;
  }
  return mockGeocode(text);
}

// ── 이동시간(분) ──
/**
 * 이동시간 + **그게 실 API 값인지**(`real`).
 *
 * 왜 필요한가: 화면의 "실 이동시간 기준" 배지가 `has.odsay || has.tmap`, 즉
 * **키가 있는지**만 봤다. 그래서 키를 넣는 순간 무조건 true 가 되고,
 * 같은 후보 목록에 **실측 40분과 추정 894분이 섞여 있어도 전부 "실시간"** 으로 떴다
 * (2026-08-03 프로덕션 실측). 프록시가 죽어도 화면으로는 알 수가 없다.
 *
 * 캐시 히트는 `real: true` 다 — **실 API 성공값만 캐시에 넣기 때문**이고,
 * 아래에서 폴백을 절대 캐시하지 않는 것이 그 전제를 지킨다.
 */
/**
 * ODsay 가 경로를 거부하는 근거리 임계값(km).
 *
 * 실측: 출발-도착 700m 이내는 `-98 "출, 도착지가 700m이내입니다."` 를 돌려준다
 * (2026-08-04 홍대입구역→홍대입구 거점 70m 재현). 이 구간은 호출해 봐야 실패가
 * 확정이므로 부르지 않고 도보 시간으로 환산한다.
 */
const ODSAY_MIN_KM = 0.7;
/** 보행 환산 속도: 시속 4km ≈ 분당 67m (통상 보행 기준) */
const WALK_MIN_PER_KM = 15;

// ── 외부 API 속도 게이트 ──────────────────────────────────────
//
//  ODsay 는 초당 호출 한도가 있고(공식 안내: 수치는 비공개),
//  넘으면 `{"error":{"code":"429","message":"Too Many Requests"}}` 를 준다.
//
//  실측(2026-08-05, 동일 14구간):
//    동시 14건 발사 → OK 4 · 429 9      (0.6초에 몰림)
//    순차 250ms 간격 → OK 14 · 429 0     (같은 구간이 전부 성공)
//  즉 구간이 안 풀리는 게 아니라 **너무 빨리 불러서** 거절당한 것이었다.
//
//  왜 여기(travelMinutesEx 안)에 두는가: 실제 팬아웃은 두 겹이다 —
//  lib/scoring/index.ts 가 거점 N개를 동시에, 그 안에서 참가자 M명을 동시에.
//  바깥 겹은 🔒 통합 담당자 소유라 못 건드리므로, **호출 지점 자체를 막는다.**
//  이러면 어느 호출부(추천·상세·AI)로 들어와도 자동으로 보호된다.
//
//  방식: 요청 "시작 시각"만 RATE_GAP_MS 간격으로 벌린다. 응답을 기다리지
//  않으므로 여러 건이 겹쳐 날아가되 초당 유입은 일정하다
//  (14건 × 250ms ≈ 3.5초. 완전 순차였다면 9.4초였다).
//
//  ⚠️ 대기는 무한정 쌓일 수 있다. 캐시가 빈 상태에서 수십 건이 한꺼번에 오면
//     뒤쪽은 몇 초씩 기다린다. 지금 규모(후보 8 × 참가자 8 = 최대 64)에서는
//     최악 16초라 감수하지만, 후보를 더 늘리면 재검토가 필요하다.
const RATE_GAP_MS = 250;
let rateChain: Promise<void> = Promise.resolve();
function rateGate(): Promise<void> {
  const myTurn = rateChain;
  rateChain = myTurn.then(() => new Promise<void>((r) => setTimeout(r, RATE_GAP_MS)));
  return myTurn;
}

export async function travelMinutesEx(
  from: Coord,
  to: Coord,
  transport: string
): Promise<{ min: number; real: boolean }> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}|${transport}`;
  // 진단 모드에서는 캐시를 건너뛴다 — 이 캐시엔 TTL 이 없어서, 실측 중에
  // 같은 좌표를 반복 호출해도 첫 응답만 계속 돌아온다(값이 안 바뀌는 것처럼 보인다).
  const hit = FLAGS.odsayProbe ? undefined : routeCache.get(key);
  if (hit != null) return { min: hit, real: true };

  // ── 근거리는 ODsay 를 부르지 않는다 (대중교통일 때만) ──
  //
  //  왜: 참가자가 후보 거점의 700m 안에 있으면(역 이름으로 검색하는 UX 특성상
  //  역세권 참가자는 거의 항상 해당) ODsay 가 -98 로 거부 → 그 구간만 추정
  //  폴백 → live 정의("한 구간이라도 추정이면 false")에 걸려 **전체 목록이
  //  "거리 추정으로 계산" 배지**를 달았다 (2026-08-04 강남·홍대 2인 실측).
  //
  //  이 도보 환산을 `real: true` 로 치는 근거: ODsay 스스로 "이 거리는 경로
  //  없음(걸어가라)"이라 판정하는 구간이라, 도보 환산이 추측이 아니라 그 판정을
  //  따르는 것이다. estMinutes(환승·대기 6분 가정)를 쓰면 70m 에 6분이 나오므로
  //  쓰지 않는다. 자차는 -98 대상이 아니므로 기존대로 TMAP 을 부른다.
  if (transport !== "car") {
    const km = haversineKm(from, to);
    if (km <= ODSAY_MIN_KM) {
      const walkMin = Math.max(1, Math.round(km * WALK_MIN_PER_KM));
      if (!FLAGS.odsayProbe) routeCache.set(key, walkMin);
      return { min: walkMin, real: true };
    }
  }

  // L2 DB — 서버를 재시작해도 남아 있어 유료 호출을 다시 하지 않는다.
  //  근거리 단락보다 뒤에 둔다: 도보 환산은 계산이 공짜라 DB 를 왕복할 이유가 없다.
  //  진단 모드에서는 L1 과 마찬가지로 건너뛴다(실측 중 값이 안 바뀌면 곤란하다).
  if (!FLAGS.odsayProbe) {
    const stored = await routeCacheGet(key);
    if (stored != null) {
      routeCache.set(key, stored); // 다음 호출부터는 L1 에서 끝난다
      return { min: stored, real: true };
    }
  }

  // 캐시(L1·L2)·근거리로 못 끝낸 것만 실제 API 로 간다 — 게이트는 여기서부터.
  await rateGate();

  let real: number | null = null;
  if (transport === "car") {
    const r = await carRouteTmap(from, to);
    real = r?.min ?? null;
  } else {
    const r = await transitRouteOdsay(from, to);
    // ⚠️ `verified === false` 는 진단 모드에서만 나오는 **껍데기 응답**이다
    //    (탑승 구간이 하나도 없는데 시간만 있는 값 — `odsay.ts` 껍데기 가드 참고).
    //    이걸 `real: true` 로 올리면 화면에 `경로 기준` 칩이 붙어, 경로 상세 시트가
    //    같은 값을 "⚠ 검증 안 된 원시 응답"이라 경고하는 것과 정면으로 어긋난다.
    //    믿을 수 없는 값은 실값으로 세지 않는다(CLAUDE.md §6).
    real = r && r.verified !== false ? r.min : null;
  }
  // 실 API 성공값만 캐시. 폴백(haversine 추정)은 캐시하지 않음.
  if (real != null) {
    if (!FLAGS.odsayProbe) {
      routeCache.set(key, real);
      void routeCacheSet(key, real); // DB 쓰기는 응답을 막지 않는다
    }
    return { min: real, real: true };
  }
  // ── 폴백 지점 — 앱의 모든 추정값이 여기서 태어난다 ──
  //  odsay.ts 의 warn(#29)은 "왜"(HTTP·빈 경로)를 남기고, 여기는 "어디"(좌표)를
  //  남긴다. 둘을 짝지으면 어느 구간이 안 풀리는지 로그만으로 확정된다.
  //  (좌표는 비밀이 아니고, URL·키는 찍지 않는다)
  const km = haversineKm(from, to);
  console.warn(
    `[routing] 추정 폴백 ${km.toFixed(2)}km ${transport} ` +
      `(${from.lat.toFixed(4)},${from.lng.toFixed(4)})→(${to.lat.toFixed(4)},${to.lng.toFixed(4)})`
  );
  return { min: estMinutes(km, transport), real: false };
}

/**
 * 기존 시그니처 유지용 래퍼 — `lib/ai.ts`(👤 담당자 소유)가 이 형태로 쓴다.
 * 새 코드는 `travelMinutesEx` 를 쓰고, 이 함수는 건드리지 않는다.
 */
export async function travelMinutes(from: Coord, to: Coord, transport: string): Promise<number> {
  return (await travelMinutesEx(from, to, transport)).min;
}

type Located = LocatedParticipant;

/**
 * 후보 목록 + 그 숫자들이 전부 실 API 값이었는지.
 *
 * `live` 를 별도 타입으로 둔 이유: `RegionCandidate` 는 `lib/types.ts`(🔒 통합 담당자
 * 소유)에 있어 필드를 못 늘린다. 감싸는 형태로 두면 도메인 타입을 안 건드려도 된다.
 */
export interface RegionsWithMeta {
  items: RegionCandidate[];
  /** 하나라도 거리 추정 폴백이 섞였으면 false */
  live: boolean;
}

// 후보들을 스코어러 등록소(lib/scoring)에 넘겨 평가한다.
//
// 점수식을 여기서 직접 쓰지 않는 이유: 담당자 여러 명이 관점(공평성·상권·날씨·
// 개인선호)을 각자 추가할 때, 식이 이 파일에 있으면 전부 같은 줄에서 충돌한다.
// 등록소 방식이면 각자 lib/scoring/<자기파일>.ts 만 만들면 된다.
async function scoreCandidates(
  candidates: { name: string; hub: { lat: number; lng: number } }[],
  located: Located[]
): Promise<RegionsWithMeta> {
  // 하나라도 추정 폴백이 섞였는지 — 화면의 "실 이동시간 기준" 배지 판정에 쓴다.
  //
  // 🗳️ 정의: **한 명이라도 폴백이면 `live: false`.** "과반이 실값이면 true" 도
  //    가능하지만, 이 앱은 "가짜를 실제처럼 그리지 않는다"(CLAUDE.md §6)를 지켜온
  //    쪽이라 보수적인 정의를 택했다. 894분(추정)과 40분(실측)이 한 목록에 섞여
  //    있는데 "실시간"이라 적는 것이 정확히 그 사고였다.
  let allReal = true;
  const ranked = await rankCandidates(
    candidates,
    { participants: located },
    // 이동시간은 여기서 한 번만 구해 넘긴다 — 스코어러마다 다시 부르면
    // 유료 API를 (후보 수 × 스코어러 수)만큼 때린다 (CLAUDE.md §4).
    (hub) =>
      Promise.all(
        located.map(async (p) => {
          const t = await travelMinutesEx({ lat: p.lat, lng: p.lng }, hub, p.transport);
          if (!t.real) allReal = false;
          // `real` 을 사람 단위로 같이 내려보낸다 — 목록 하나에 실값과 추정이
          // 섞이기 때문이다(자월도 참가자만 ODsay 실패 · 2026-08-05 실측).
          // 화면의 `실시간` 칩이 행마다 붙으므로 판정도 행 단위여야 한다.
          return { pid: p.id, name: p.name, min: t.min, real: t.real };
        })
      )
  );

  const items = ranked.slice(0, 3).map((s, i) => {
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

  return { items, live: allReal };
}

// 참가자가 수도권 밖(예: 안동·대구)이면 고정 후보 12곳(서울 지하철역)은 전부
// 수백 km 떨어져 있다. 그런데도 "가까운 순 최소 확보" 폴백이 그중 제일 가까운
// 곳(예: 잠실)을 그대로 추천해, 실제로는 중간이 아닌 곳이 1위로 뜨는 문제가
// 있었다. 이럴 때는 이름 있는 서울 후보 대신 참가자 좌표로 직접 계산한 지점을
// 쓰고, 실 좌표 → 지명은 카카오 역지오코딩으로 채운다(키 없으면 "중간지점 N").
async function recommendDynamicRegions(located: Located[]): Promise<RegionsWithMeta> {
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
): Promise<{
  maxMin: number;
  devMin: number;
  perParticipant: { pid: string; name: string; min: number; real?: boolean }[];
}> {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  const perParticipant = await Promise.all(
    // ⚠️ `travelMinutes`(분만 주는 래퍼)가 아니라 `travelMinutesEx` 를 쓴다.
    //    래퍼는 `real` 을 버려서, 참가자가 직접 등록한 후보만 출처를 알 수 없게 된다
    //    — 그러면 그 후보 화면에서만 `실시간` 칩 판정이 되살아난다.
    located.map(async (p) => {
      const t = await travelMinutesEx({ lat: p.lat!, lng: p.lng! }, hub, p.transport);
      return { pid: p.id, name: p.name, min: t.min, real: t.real };
    })
  );
  const mins = perParticipant.map((x) => x.min);
  const maxMin = mins.length ? Math.max(...mins) : 0;
  const devMin = mins.length ? maxMin - Math.min(...mins) : 0;
  return { maxMin, devMin, perParticipant };
}

// ── 중간지역 추천(실 이동시간 기반) ──
/**
 * 후보 + **이동시간이 전부 실 API 값이었는지**(`live`).
 *
 * `live: false` 는 "키가 없다"가 아니라 **"이 목록의 숫자 중 추정이 섞였다"** 는 뜻이다.
 * 키를 넣어도 프록시·터널이 죽으면 false 가 되므로, 화면이 장애를 감지할 수 있다.
 */
export async function recommendRegionsWithMeta(participants: Participant[]): Promise<RegionsWithMeta> {
  const located = participants.filter((p) => p.lat != null && p.lng != null) as Located[];
  if (located.length === 0) return { items: [], live: false };

  if (isOutsideHubCoverage(located)) return recommendDynamicRegions(located);

  // 거리 기반과 동일하게 후보를 참가자 중심 근처로 좁힌다
  const pool = nearCentroidHubs(located).map((name) => ({ name, hub: HUBS[name] }));
  return scoreCandidates(pool, located);
}

/**
 * 기존 시그니처 유지용 래퍼 — `app/api/meeting/route.ts`(🔒 통합 담당자 소유)가
 * 이 형태로 3곳에서 쓴다. 그 파일을 건드리지 않으려고 남겨 둔다.
 * `live` 가 필요하면 `recommendRegionsWithMeta` 를 쓴다.
 */
export async function recommendRegions(participants: Participant[]): Promise<RegionCandidate[]> {
  return (await recommendRegionsWithMeta(participants)).items;
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
