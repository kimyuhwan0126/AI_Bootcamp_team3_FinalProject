// ─────────────────────────────────────────────────────────────
// hub-pool.ts — 중간지점 "후보 목록"을 만든다
//
// 이 파일이 하는 일은 하나다: 참가자 좌표 N개 → **후보 {이름, 좌표} 목록**.
// 점수 계산·정렬·상위 3개 자르기는 전부 호출부(`routing.ts`·`geo.ts`)가 한다.
//
// ── 왜 만들었나 ────────────────────────────────────────────────
// 예전에는 `CANDIDATE_HUBS`(사람이 고른 28곳)에서만 골랐다. 그래서 **목록에 없는
// 지역은 통째로 후보에서 빠졌다.** 2026-08-06 CEO 실측:
//
//     노원역 + 의정부역  →  추천 "종로3가"
//       중심 37.6961,127.0509 · 반경 안 후보 0곳 → 폴백(가까운 순 4곳)
//       종로3가  중심에서 14.8km   노원 58분 · 의정부 98분 → 최대 98분
//       도봉산역 중심에서  0.9km   노원 25분 · 의정부 32분 → 최대 32분  ← 실제 정답
//
// 두 사람 사이가 아니라 **둘 다에게서 멀어지는 방향**을 골랐다. 계산은 맞았고
// **후보 목록에 서울 북부가 통째로 비어 있던 것**이 원인이다(노원·창동·수유·도봉…).
//
// 그런데 실제 역을 찾는 함수(`searchByCategoryKakao("SW8", …)`)는 **이미 있었다** —
// 화면 아래 `정류장·역` 탭이 쓰고 있었다. 중간지점 후보에만 안 쓰고 있었을 뿐이다.
//
// ── 폴백 사슬 (하드코딩을 지우지 않고 역할만 바꾼다) ───────────────
//
//   ① 카카오 SW8 실제 지하철역        ← 대부분
//   ② CANDIDATE_HUBS 하드코딩 28곳    ← 지하철이 없는 지역 · 키 없음 · API 실패
//   ③ geometricCandidates 순수 좌표   ← 거점 커버리지 밖 (호출부가 처리)
//
// ⚠️ ②를 지우면 안 된다. SW8 은 **지하철역만** 준다 — 전주·목포·창원·강릉엔
//    지하철이 없어 0건이 돌아온다. 그때 ②가 없으면 후보가 하나도 안 생긴다.
// ⚠️ 키가 없으면(팀원 로컬·CI) `searchByCategoryKakao` 가 `null` 을 준다 →
//    자동으로 ②로 떨어진다. **키 없이도 전체 플로우가 돈다**는 규칙 유지(CLAUDE.md §4).
// ─────────────────────────────────────────────────────────────
import { searchByCategoryKakao } from "./kakao";
import { haversineKm, HUBS, nearCentroidHubs } from "./geo";
import { normalizeStationName } from "./station-snap";

/** 카카오 카테고리 그룹 코드 — 지하철역. */
const SUBWAY_CODE = "SW8";

/** 카카오 카테고리 검색이 허용하는 반경 상한(m). 넘겨 보내면 400 이 온다. */
const KAKAO_MAX_RADIUS_M = 20_000;

/**
 * 후보로 인정할 최소 개수. 이보다 적으면 반경을 넓혀 한 번 더 찾고,
 * 그래도 모자라면 하드코딩 폴백으로 간다.
 *
 * 3인 이유: 화면이 후보 3개를 보여준다(`slice(0, 3)`). 2개면 투표가 의미를 잃는다.
 */
const MIN_CANDIDATES = 3;

/** 최종적으로 넘길 후보 상한. 많아도 어차피 상위 3개만 화면에 뜬다. */
const MAX_CANDIDATES = 5;

/**
 * 서로 이만큼 안에 붙어 있는 역은 **같은 곳으로 본다** — 검색 반경에 비례한다(km).
 *
 * 왜 솎아내는가: 중심이 강남 한복판이면 반경 안에 역이 10개 넘게 나오는데 전부
 * 걸어서 갈 거리다. `강남역 · 역삼역 · 선릉역` 이 뜨면 "뭐가 다른데?" 가 된다.
 * 후보는 **고를 이유가 서로 다를 때만** 후보다.
 *
 * 🔴 왜 고정값이 아닌가 (2026-08-06 실측):
 *   고정 1.5km 였을 때 **노원+의정부에서 도봉산역이 잘렸다.**
 *     장암역   중심 431m   최대 30분 · 편차 3분   ← 중심에 더 가까워 먼저 채택
 *     도봉산역 중심 887m   최대 32분 · 편차 7분   ← 장암역과 713m → 1.5km 규칙에 제거
 *   그런데 **도봉산역이 1·7호선 환승역**이라 의정부(1호선)에서 직통이고,
 *   장암역은 7호선 종점이라 환승이 필요하다. 직선거리는 노선을 모른다.
 *
 *   그렇다고 고정 0.6km 로 낮추면 반대쪽이 깨진다 — 강남 일대 역 간격이
 *   841m(강남↔역삼) · 1,185m(역삼↔선릉) 이라 **거의 안 걸러진다.**
 *
 *   → 반경에 비례시키면 둘 다 잡힌다:
 *       노원+의정부  반경  2,813m → 임계   563m   장암↔도봉산 713m  ✅ 둘 다 남음
 *       8인 광역     반경 17,760m → 임계 3,552m   강남↔역삼  841m  ✅ 하나로 합침
 *
 * ⚠️ 최소 500m 는 유지한다 — 같은 역의 다른 출구가 별개 후보로 뜨는 걸 막는다.
 */
function dedupeKmFor(radiusM: number): number {
  return Math.max(0.5, (radiusM / 1000) * 0.2);
}

export interface HubCandidate {
  name: string;
  hub: { lat: number; lng: number };
}

/**
 * 후보 캐시 TTL. 짧게 잡는다 — 역이 새로 생기는 일은 드물지만, 우리 반경·솎아내기
 * 로직을 고쳤을 때 배포 후에도 옛 결과가 오래 남으면 검증이 헷갈린다.
 */
const POOL_TTL_MS = 10 * 60 * 1000;

// 서버 프로세스 캐시. `globalThis` 에 두는 건 이 저장소의 다른 캐시와 같은 방식이다
// (Next 개발 모드의 모듈 재평가에도 살아남게 하려는 것).
const g = globalThis as unknown as { __moimerHubPool?: Map<string, { at: number; pool: HubCandidate[] }> };
const poolCache = g.__moimerHubPool ?? (g.__moimerHubPool = new Map());

export interface HubPool {
  pool: HubCandidate[];
  /** 어디서 왔는가 — 진단용. 화면에는 쓰지 않는다. */
  source: "station" | "hardcoded";
}

type Pt = { lat: number; lng: number };

/**
 * 기하 중앙값 — **거리의 합**을 최소화하는 점 (Weiszfeld 반복법).
 *
 * 무게중심(평균)은 **거리의 제곱 합**을 최소화해서 멀리 있는 한 명에게 끌려간다.
 * 실측(2026-08-06):
 *
 *     서울 7명 + 부산 1명
 *       서울 7명만의 중심   37.5467, 127.0151
 *       무게중심            37.2428, 127.2684   ← 서울에서 41km 남쪽, 충북 산속
 *       기하 중앙값         37.5305, 127.0232   ← 서울에서 2km  ✅
 *
 * 무게중심을 쓰면 "충북 산속 반경 20km 지하철역"을 물어보게 되고, **서울 역은
 * 후보에 아예 못 올라온다.** 스코어러가 아무리 좋아도 목록에 없으면 못 고른다.
 *
 * ⚠️ 골고루 퍼져 있으면 둘의 차이가 거의 없다(실제 8인 케이스 4.6km).
 *    **한 명이 튈 때만** 효과가 나므로, 평상시 결과를 바꾸지 않는 안전망이다.
 */
export function geometricMedian(pts: Pt[], iterations = 64): Pt {
  if (pts.length === 0) return { lat: 0, lng: 0 };
  if (pts.length === 1) return { lat: pts[0].lat, lng: pts[0].lng };

  let cur: Pt = {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };

  for (let i = 0; i < iterations; i++) {
    let numLat = 0;
    let numLng = 0;
    let den = 0;
    for (const p of pts) {
      // 후보점이 참가자와 정확히 겹치면 0으로 나눈다 — 아주 작은 값으로 막는다.
      const d = haversineKm(cur, p) || 1e-6;
      numLat += p.lat / d;
      numLng += p.lng / d;
      den += 1 / d;
    }
    if (den === 0) break;
    const next: Pt = { lat: numLat / den, lng: numLng / den };
    // 더 안 움직이면 끝. 1e-4 도 ≈ 10m 라 충분히 수렴한 것이다.
    if (haversineKm(cur, next) < 1e-4) return next;
    cur = next;
  }
  return cur;
}

/**
 * 참가자 퍼짐에 맞춘 검색 반경(m).
 *
 * 고정 2km 였을 때의 문제: 노원+의정부(퍼짐 4.7km)는 충분했지만
 * 8인 의정부~수원(퍼짐 29.6km)은 중심 주변만 훑어 후보가 안 나왔다.
 *
 * 퍼짐의 60% 를 쓰되 최소 2km · 최대 20km(카카오 상한).
 * 60% 인 이유: 100% 면 가장 먼 참가자 발밑까지 후보로 잡혀 "중간"이 아니게 된다.
 */
export function adaptiveRadiusM(spreadKm: number): number {
  const m = Math.round(spreadKm * 0.6 * 1000);
  return Math.min(KAKAO_MAX_RADIUS_M, Math.max(2_000, m));
}

/**
 * 가까이 붙은 역 솎아내기. **입력 순서를 신뢰한다** — 카카오가 `sort=distance` 로
 * 중심에서 가까운 순으로 주므로, 앞에 온 것을 남기고 뒤엣것을 버리면
 * "각 무리에서 중심에 제일 가까운 역"이 남는다.
 */
export function dedupeNearby<T extends { lat: number; lng: number }>(items: T[], minKm: number): T[] {
  const kept: T[] = [];
  for (const it of items) {
    if (kept.every((k) => haversineKm(k, it) >= minKm)) kept.push(it);
  }
  return kept;
}

/** 하드코딩 폴백 — 지금까지 쓰던 그 경로 그대로. */
function hardcodedPool(located: Pt[]): HubPool {
  return {
    pool: nearCentroidHubs(located).map((name) => ({ name, hub: HUBS[name] })),
    source: "hardcoded",
  };
}

/**
 * 후보 목록을 만든다. **참가자 수와 무관하게 같은 경로**를 탄다 —
 * 2명이든 8명이든 "중심점 하나 → 그 주변 역"이라 N명 분기가 없다.
 *
 * 💰 카카오 로컬 **1콜**(후보가 모자라면 반경을 넓혀 최대 2콜). 참가자 수와 무관하다.
 *    오히려 후보가 13곳 → 5곳으로 줄어 **이동시간 계산이 8×13=104회 → 8×5=40회**로
 *    준다. ODsay 키를 넣었을 때 콜 수와 속도 게이트 대기가 그만큼 줄어든다.
 */
export async function resolveHubPool(located: Pt[]): Promise<HubPool> {
  if (located.length === 0) return { pool: [], source: "hardcoded" };

  const center = geometricMedian(located);
  const spreadKm = Math.max(...located.map((p) => haversineKm(p, center)));

  // ── 짧은 캐시 ──────────────────────────────────────────────
  //  화면이 **거리순/시간순을 토글할 때마다** 같은 중심으로 다시 물어보게 되는데,
  //  그 사이 후보가 달라질 이유가 없다. 같은 중심(≈110m 격자)·같은 반경이면 재사용한다.
  //  ⚠️ 실 API 성공값만 담는다 — 하드코딩 폴백을 캐시하면 키를 나중에 넣어도
  //     TTL 이 끝날 때까지 계속 폴백이 나온다(CLAUDE.md §5, 캐시 오염 방지).
  const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}|${Math.round(spreadKm)}`;
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return { pool: hit.pool, source: "station" };

  for (const radius of [adaptiveRadiusM(spreadKm), Math.min(KAKAO_MAX_RADIUS_M, adaptiveRadiusM(spreadKm) * 2)]) {
    // 키가 없거나 실패하면 null — 그대로 하드코딩 폴백으로 간다.
    const found = await searchByCategoryKakao(SUBWAY_CODE, center, 15, radius);
    if (!found || found.length === 0) continue;

    const picked = dedupeNearby(found, dedupeKmFor(radius)).slice(0, MAX_CANDIDATES);
    if (picked.length >= MIN_CANDIDATES) {
      // 카카오가 주는 이름은 `도봉산역` 처럼 대체로 사람이 읽는 형태지만,
      // 노선이 붙어 오는 경우(`강남역 2호선`)가 있다 — **핑 스냅과 같은 함수로**
      // 다듬는다.
      //
      // ⚠️ 여기만 안 다듬으면 같은 역이 후보 **두 개**가 된다. 후보 병합은
      //    이름 일치로 판정하는데(`lib/store.ts` `addRegionCandidate`), 홈/추천이
      //    올린 `강남역 2호선` 과 사람이 찍은 `강남역` 이 서로 다른 이름이라
      //    안 합쳐진다 — 표를 모으려고 만든 기능이 그 자리에서 표를 쪼갠다.
      const pool = picked.map((s) => ({
        name: normalizeStationName(s.name) || s.name,
        hub: { lat: s.lat, lng: s.lng },
      }));
      poolCache.set(key, { at: Date.now(), pool });
      return { pool, source: "station" };
    }
    // 상한 반경에서도 모자랐으면 더 넓힐 수 없다 — 폴백으로 간다.
    if (radius >= KAKAO_MAX_RADIUS_M) break;
  }

  return hardcodedPool(located);
}
