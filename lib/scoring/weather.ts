// ─────────────────────────────────────────────────────────────
// 날씨 스코어러 — "그날 그 동네에서 모여도 괜찮은 날씨인가"
//
// FLAGS.weather(NEXT_PUBLIC_FF_WEATHER=1) 뒤에 있다. 꺼져 있으면 등록소가
// 이 스코어러를 제외하므로 추천 결과는 지금과 완전히 같다.
//
// 데이터 소스: ctx.weather 가 채워져 있으면 그걸 쓴다(통합 세션이 나중에
// routing.ts 에서 채우면 자동으로 우선된다). 아직 안 채워져 있으므로
// 후보 좌표(ctx.hub)로 lib/weather.ts 를 직접 부른다 — 후보끼리 지역이
// 멀리 떨어진 경우(수도권 밖 시나리오) 지역별 날씨 차이도 점수에 반영된다.
// 키 없는 무료 API(Open-Meteo)라 비용이 없고, 실패하면 mock(real:false)이다.
// 이동시간(ctx.travel)은 절대 다시 계산하지 않는다(§절대 규칙 4).
// ─────────────────────────────────────────────────────────────
import { decayScore, worstOf } from "./types";
import type { ScoreContext, Scorer, WeatherSnapshot } from "./types";
import { FLAGS } from "@/lib/flags";
import { getWeather } from "@/lib/weather";

// 쾌적 기온 구간 — 이 안이면 기온 점수 만점.
const COMFORT_MIN_C = 18;
const COMFORT_MAX_C = 23;
/** 구간에서 이만큼(°C) 벗어나면 기온 점수 0.5 (decayScore 의 half). */
const TEMP_HALF_C = 10;
/** 눈은 강수확률이 같아도 이동 자체가 힘들다 — 추가 감점 배율. */
const SNOW_FACTOR = 0.7;

// score() 가 구한 스냅샷을 explain() 이 재사용한다 — explain 은 동기라
// 직접 fetch 할 수 없고, 같은 ctx 객체로 score → explain 순서가 보장된다.
const snapshotOf = new WeakMap<ScoreContext, WeatherSnapshot>();

/** 강수 점수: 비 올 확률이 낮을수록 좋다. 눈이면 추가 감점. */
function precipScore(w: WeatherSnapshot): number {
  const base = 1 - Math.max(0, Math.min(1, w.rainProb));
  return w.condition === "snow" ? base * SNOW_FACTOR : base;
}

/** 기온 점수: 체감온도가 쾌적 구간(18~23°C)에서 멀수록 나쁘다. */
function tempScore(w: WeatherSnapshot): number {
  const t = w.feelsLikeC ?? w.tempC;
  const off = t < COMFORT_MIN_C ? COMFORT_MIN_C - t : t > COMFORT_MAX_C ? t - COMFORT_MAX_C : 0;
  return decayScore(off, TEMP_HALF_C);
}

const ICON: Record<WeatherSnapshot["condition"], string> = {
  clear: "☀️",
  cloudy: "☁️",
  rain: "☔",
  snow: "❄️",
  unknown: "🌡️",
};

export const weather: Scorer = {
  key: "weather",
  label: "날씨",
  weight: 0.3, // TODO(팀): 최종값은 팀이 정한다 (CLAUDE.md §5)
  enabled: () => FLAGS.weather,
  async score(ctx) {
    const w = ctx.weather ?? (await getWeather(ctx.hub, ctx.when));
    snapshotOf.set(ctx, w);
    // 평균이 아니라 최솟값 — 폭우면 기온이 아무리 쾌적해도 나쁜 날씨다.
    // 사람 만족도뿐 아니라 조건 조합에도 같은 원칙(worstOf)을 쓴다.
    return worstOf([precipScore(w), tempScore(w)]);
  },
  explain(ctx) {
    const w = ctx.weather ?? snapshotOf.get(ctx);
    if (!w) return null;
    // real:false 를 실제 예보처럼 말하지 않는다 (CLAUDE.md §6 "가짜를 실제처럼 그리지 않는다")
    const tag = w.real ? "예보" : "계절 추정";
    return `${ICON[w.condition]} 강수 ${Math.round(w.rainProb * 100)}% · ${Math.round(w.tempC)}°C (${tag})`;
  },
};
