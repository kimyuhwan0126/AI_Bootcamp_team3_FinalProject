// ─────────────────────────────────────────────────────────────
// 스코어러 등록소 + 조합기
//
// 🔒 이 파일은 통합 세션 소유. 스코어러 담당자가 여기서 하는 일은
//    **import 한 줄 + REGISTRY 배열에 한 줄** 뿐이다.
//    배열 끝에 한 줄씩만 더하면, 두 사람이 동시에 추가해도 충돌이 나봐야
//    "양쪽 줄 다 남기기"로 끝난다.
//
// 조합 방식: 가중합. 각 스코어러가 0~1 을 돌려주므로 총점도 0~1 이다.
//   total = Σ(weight_i × score_i) / Σ(weight_i)
// ─────────────────────────────────────────────────────────────
import { fairness } from "./fairness";
import { weather } from "./weather";
import type { Coord, ScoreContext, ScoredCandidate, Scorer, TravelEntry, WeatherSnapshot } from "./types";

// ── 등록소 ─────────────────────────────────────────────────────
//  새 스코어러를 만들면 여기에 한 줄 추가한다.
const REGISTRY: Scorer[] = [
  fairness,
  // commercial,  // 상권 밀집도 — 담당: (미정)
  weather, // 날씨 조건 — FLAGS.weather(NEXT_PUBLIC_FF_WEATHER) 꺼져 있으면 비활성

  // personal,    // 개인별 선호 — 담당: (미정)
];

/** 지금 켜져 있는 스코어러들 (플래그로 꺼진 것 제외). */
export function activeScorers(): Scorer[] {
  return REGISTRY.filter((s) => (s.enabled ? s.enabled() : true));
}

/** 후보 하나를 모든 스코어러로 평가한다. */
export async function scoreCandidate(ctx: ScoreContext): Promise<Omit<ScoredCandidate, "name" | "hub" | "travel">> {
  const scorers = activeScorers();
  const breakdown = await Promise.all(
    scorers.map(async (s) => {
      // 스코어러 하나가 던져도 추천 전체가 죽으면 안 된다 — 0점으로 처리하고 계속.
      let score = 0;
      try {
        score = await s.score(ctx);
      } catch (e) {
        console.warn(`[scoring] ${s.key} 실패 — 0점 처리`, e);
      }
      if (!Number.isFinite(score)) score = 0;
      // 0~1 계약 위반은 조용히 넘기지 않는다. 하나가 튀면 가중치가 무의미해진다.
      if (score < 0 || score > 1) {
        console.warn(`[scoring] ${s.key} 가 0~1 밖의 값(${score})을 냈다 — clamp. decayScore() 를 쓸 것`);
        score = Math.max(0, Math.min(1, score));
      }
      let explain: string | null = null;
      try {
        explain = s.explain?.(ctx) ?? null;
      } catch {
        explain = null;
      }
      return { key: s.key, label: s.label, weight: s.weight, score, explain };
    })
  );

  const wsum = breakdown.reduce((a, b) => a + b.weight, 0);
  const total = wsum > 0 ? breakdown.reduce((a, b) => a + b.weight * b.score, 0) / wsum : 0;

  const mins = ctx.travel.map((t) => t.min);
  const maxMin = mins.length ? Math.max(...mins) : 0;
  const devMin = mins.length ? maxMin - Math.min(...mins) : 0;

  return { maxMin, devMin, total, breakdown };
}

/**
 * 후보들을 평가해 좋은 순으로 정렬한다.
 *
 * 이동시간(`travelOf`)은 호출부가 넘긴다 — 실 API(ODsay·TMAP)를 쓸지
 * haversine 추정을 쓸지는 스코어러가 알 바가 아니고, 스코어러마다 다시
 * 호출하면 유료 API를 후보 수 × 스코어러 수만큼 때린다(CLAUDE.md §4).
 */
export async function rankCandidates(
  candidates: { name: string; hub: Coord }[],
  base: Omit<ScoreContext, "hub" | "name" | "travel">,
  travelOf: (hub: Coord) => Promise<TravelEntry[]>
): Promise<ScoredCandidate[]> {
  const scored = await Promise.all(
    candidates.map(async ({ name, hub }) => {
      const travel = await travelOf(hub);
      const ctx: ScoreContext = { ...base, hub, name, travel };
      const r = await scoreCandidate(ctx);
      return { name, hub, travel, ...r };
    })
  );
  // 총점이 높을수록 좋다. 동점이면 최대 이동시간이 짧은 쪽.
  scored.sort((a, b) => b.total - a.total || a.maxMin - b.maxMin);
  return scored;
}

export type { Coord, ScoreContext, ScoredCandidate, Scorer, TravelEntry, WeatherSnapshot };
export { decayScore, worstOf } from "./types";
