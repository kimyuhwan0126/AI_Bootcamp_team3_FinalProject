// ─────────────────────────────────────────────────────────────
// 공평성 스코어러 — "아무도 혼자 크게 손해보지 않는가"
//
// v8 까지 이 앱의 유일한 점수식이었다. 원래 lib/geo.ts 와 lib/routing.ts 에
// 같은 식이 복제돼 있었는데(둘 다 `maxMin + devMin * 0.8`), 여기로 모았다.
// 두 곳에 있으면 한쪽만 고치는 사고가 나고, 여러 명이 알고리즘을 만질 때
// 매번 같은 줄에서 머지 충돌이 난다.
// ─────────────────────────────────────────────────────────────
import { decayScore } from "./types";
import type { ScoreContext, Scorer } from "./types";

/**
 * 점수가 0.5 가 되는 이동시간(분). 120분 걸리는 후보가 딱 절반.
 *
 * 구버전 `enhanced-scoring.ts` 가 남긴 경고에서 온 값이다:
 *   *"⚠️ 단위 스케일 주의: fairTimeScore 는 '분'(수십), 나머지는 0~1"*
 * 이 상수가 그 스케일 차이를 흡수한다.
 */
export const FAIRNESS_HALF_MIN = 120;

/** 편차 가중 — 편차가 클수록(누구는 5분, 누구는 90분) 불리하게 본다. */
export const DEVIATION_WEIGHT = 0.8;

/**
 * 원본 공평성 비용. **작을수록 좋다.**
 *
 * 클라이언트에서 즉시 추정할 때(`lib/geo.ts`)도 이 함수를 쓴다 — 거기서는
 * 브라우저라 서버 스코어러를 await 할 수 없기 때문에 스코어러 객체 대신
 * 이 순수 함수만 가져다 쓴다. 식은 한 곳(여기)에만 있다.
 */
export function fairnessRaw(maxMin: number, devMin: number): number {
  return maxMin + devMin * DEVIATION_WEIGHT;
}

function stats(ctx: ScoreContext): { maxMin: number; devMin: number } {
  const mins = ctx.travel.map((t) => t.min);
  if (mins.length === 0) return { maxMin: 0, devMin: 0 };
  const maxMin = Math.max(...mins);
  return { maxMin, devMin: maxMin - Math.min(...mins) };
}

export const fairness: Scorer = {
  key: "fairness",
  label: "공평성",
  weight: 1.0, // TODO(팀): 다른 스코어러가 붙으면 이 값을 함께 정한다 (CLAUDE.md §5)
  score(ctx) {
    const { maxMin, devMin } = stats(ctx);
    return decayScore(fairnessRaw(maxMin, devMin), FAIRNESS_HALF_MIN);
  },
  explain(ctx) {
    const { maxMin, devMin } = stats(ctx);
    if (ctx.travel.length === 0) return null;
    return `최대 ${maxMin}분 · 편차 ${devMin}분`;
  },
};
