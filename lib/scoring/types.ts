// ─────────────────────────────────────────────────────────────
// 추천 점수 계약(contract) — 이 파일이 팀원 사이의 유일한 접점이다.
//
// 🔒 이 파일과 index.ts 는 통합 세션 소유. 개별 스코어러 담당자는 고치지 않는다.
//    (고쳐야 할 일이 생기면 PR 설명에 이유를 쓰고 통합 세션 리뷰를 받는다)
//
// 담당자는 자기 파일 하나만 만든다:
//    fairness.ts / commercial.ts / weather.ts / personal.ts …
//    → 서로 다른 파일이므로 물리적으로 머지 충돌이 날 수 없다.
// ─────────────────────────────────────────────────────────────
import type { Participant } from "@/lib/types";

export interface Coord {
  lat: number;
  lng: number;
}

/** 출발지가 등록된 참가자 — lat/lng 가 null 이 아님이 보장된다. */
export type LocatedParticipant = Omit<Participant, "lat" | "lng"> & {
  lat: number;
  lng: number;
};

/** 참가자 한 명이 이 후보까지 가는 데 걸리는 시간. */
export interface TravelEntry {
  pid: string;
  name: string;
  /** 이동시간(분). 실 API 실패 시 haversine 추정값이 들어온다. */
  min: number;
}

/**
 * 날씨 스냅샷.
 *
 * `real: false` 는 mock 폴백이라는 뜻이다 — CLAUDE.md §6("가짜 데이터를 실제인 것처럼
 * 그리지 않는다")에 따라, UI 는 이 값이 false 면 "예보 기준"이라고 표시하지 않는다.
 */
export interface WeatherSnapshot {
  tempC: number;
  feelsLikeC?: number;
  /** 강수확률 0~1 */
  rainProb: number;
  humidity?: number;
  condition: "clear" | "cloudy" | "rain" | "snow" | "unknown";
  real: boolean;
}

/** 스코어러가 후보 한 곳을 평가할 때 받는 모든 정보. */
export interface ScoreContext {
  /** 후보 지점 좌표 */
  hub: Coord;
  /** 후보 지명 (예: "홍대입구역") */
  name: string;
  /** 출발지를 등록한 참가자만 */
  participants: LocatedParticipant[];
  /** 참가자별 이동시간 — 이미 계산돼 있으니 스코어러가 다시 호출하지 않는다 */
  travel: TravelEntry[];
  /** 모임 일정 (prefs 에서 옴) */
  when?: { dateIso?: string; timeHhmm?: string };
  /** FLAGS.weather 가 꺼져 있으면 undefined */
  weather?: WeatherSnapshot;
}

/**
 * 스코어러 하나 = 관점 하나.
 *
 * ⚠️ `score` 는 **반드시 0~1** 을 돌려준다. 높을수록 좋다.
 *    이걸 지키지 않으면 가중치가 무의미해진다 — 실제로 구버전에서
 *    "fairTimeScore 는 '분'(수십), 나머지는 0~1" 이라 시간 점수 하나가
 *    나머지 전부를 압도한 적이 있다. 정규화는 `decayScore()` 를 쓴다.
 */
export interface Scorer {
  /** 로그·설명에 쓰는 식별자 (예: "fairness") */
  key: string;
  /** 사람이 읽는 이름 (예: "공평성") */
  label: string;
  /** 가중치 — 최종값은 **팀 결정 사항**이다 (CLAUDE.md §5) */
  weight: number;
  /** 플래그로 껐다 켜는 스코어러면 여기서 false 를 돌려준다 */
  enabled?: () => boolean;
  /** 0~1, 높을수록 좋음 */
  score(ctx: ScoreContext): number | Promise<number>;
  /** 발표·디버깅용 근거 한 줄 (예: "비 예보 → 실내 상권 가점"). 없으면 생략 */
  explain?(ctx: ScoreContext): string | null;
}

/** 후보 하나의 최종 결과 — 총점과 함께 관점별 내역을 남긴다. */
export interface ScoredCandidate {
  name: string;
  hub: Coord;
  travel: TravelEntry[];
  maxMin: number;
  devMin: number;
  /** 0~1 가중합 */
  total: number;
  /** 관점별 내역 — "왜 이 장소인가"를 화면에 보여줄 수 있다 */
  breakdown: { key: string; label: string; weight: number; score: number; explain: string | null }[];
}

// ── 스코어러가 공통으로 쓰는 도구 ──────────────────────────────

/**
 * "작을수록 좋은 값"(분·미터·원)을 0~1 점수로 바꾼다. 높을수록 좋다.
 *
 *   decayScore(raw, half) = half / (half + raw)
 *
 * `half` 는 점수가 0.5 가 되는 지점이다. 예를 들어 `decayScore(min, 120)` 이면
 * 120분 걸리는 후보가 0.5점.
 *
 * 왜 `1 - raw/max` 가 아니라 이 식인가: 잘라내기(clamp)가 없어서 **순서를 절대
 * 뒤집지 않는다.** `1 - raw/max` 는 max 를 넘는 후보들이 전부 0으로 뭉개져
 * 원래 있던 우열이 사라진다.
 */
export function decayScore(raw: number, half: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return half / (half + raw);
}

/**
 * 여러 사람의 만족도를 하나로 합칠 때 쓴다 — **평균이 아니라 최솟값**이다.
 *
 * 이 앱의 공평성 정의가 그렇다. 지금 점수식도 평균 이동시간이 아니라
 * `최대 이동시간 + 편차` 를 쓴다. 평균을 쓰면 3명이 만족하고 1명이 지옥인
 * 후보가 1위로 올라온다.
 */
export function worstOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}
