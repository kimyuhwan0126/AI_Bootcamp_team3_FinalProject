/**
 * outputs/enhanced-scoring.ts
 * ─────────────────────────────────────────────────────────────
 * 미션 A (슬로건4) — 스코어링에 상권 밀집도 + 세부 이동지표 반영.
 *
 * 현재 scoreCandidate 는 대중교통 이동시간(분)만 반영 → 환승/도보/요금/상권밀도 0점.
 * 개선 합산 공식(미션 지정):
 *   finalScore = fairTimeScore × 0.70
 *              + transitPenalty × 0.15   (환승+도보, 0~1)
 *              + farePenalty    × 0.05   (요금, 0~1)
 *              + densityBonus   × 0.10   (1 - 밀집도, 낮을수록 좋음 기준 역전)
 *   - fairTimeScore = computeFairScore(times, FAIR_WEIGHTS).score  (fair-scoring 재사용)
 *   - transitPenalty= clamp01(평균환승/3 + 평균도보/30)
 *   - farePenalty   = clamp01(평균요금/5000)
 *   - densityBonus  = 1 - commercialDensityScore(total, { saturationCount: 30 })
 * (모두 낮을수록 좋음 → 엔진의 오름차순 정렬 그대로)
 *
 * ⚠️ 단위 스케일 주의(추측 아님, 명시): fairTimeScore 는 '분' 단위(수십), 나머지 항은 0~1.
 *   미션 공식 그대로면 시간 항이 지배적이고 penalty/bonus 는 미세 조정 역할.
 *   → 기본은 미션 공식 리터럴 구현. 세 항을 대등하게 쓰려면 opts.normalizeTimeBy(예: 120)로
 *     fairTimeScore 를 0~1 로 정규화하는 옵션 제공(팀 결정용).
 *
 * 통합: recommend-engine.ts scoreCandidate() 를 scoreCandidateEnhanced() 로 교체.
 *   단, 성격(PurposeType)과 ODsay 세부(transfers/walkMinutes/fare)를 넘기도록
 *   buildRegionRecommendation → scoreCandidate 호출부 시그니처 확장 필요(하단 통합 노트).
 *
 * 코드 중복 금지: fair-scoring / meeting-type-scoring 재사용.
 * 검증: labs/moimer-algo/verify-outputs.ts
 */

import { computeFairScore, FAIR_WEIGHTS, mean, type Coord, type FairScoreWeights } from '@/lib/algo/fair-scoring';
import {
  commercialDensityScore,
  MEETING_TYPE_CATEGORY,
  toMeetingType,
  type KakaoCategoryCode,
  type MeetingType,
} from '@/lib/algo/meeting-type-scoring';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** 한 후보에 대한 한 참가자의 대중교통 결과 */
export interface ParticipantTransit {
  minutes: number;
  transfers?: number;
  walkMinutes?: number;
  fare?: number;
}

export interface EnhancedWeights {
  time: number;
  transit: number;
  fare: number;
  density: number;
}
/** 미션 지정 기본 가중치 */
export const ENHANCED_WEIGHTS: EnhancedWeights = { time: 0.7, transit: 0.15, fare: 0.05, density: 0.1 };

export interface EnhancedScore {
  score: number; // 낮을수록 좋음
  fairTimeScore: number;
  transitPenalty: number;
  farePenalty: number;
  densityBonus: number;
  avgTransfers: number;
  avgWalkMinutes: number;
  avgFare: number;
  placeTotal: number;
}

export interface ComputeEnhancedOptions {
  weights?: EnhancedWeights;
  /** fairTimeScore 계산용 fair 가중치 (기본 FAIR_WEIGHTS) */
  fairWeights?: FairScoreWeights;
  /** 지정 시 fairTimeScore 를 clamp01(fair/normalizeTimeBy) 로 정규화 (미지정=리터럴 분단위) */
  normalizeTimeBy?: number;
}

/** 순수 코어: 참가자 대중교통 결과 + 밀집도 개수 → 종합 점수/지표 */
export function computeEnhancedScore(
  participants: readonly ParticipantTransit[],
  placeTotal: number,
  opts: ComputeEnhancedOptions = {},
): EnhancedScore {
  const w = opts.weights ?? ENHANCED_WEIGHTS;
  if (participants.length === 0) {
    return {
      score: 0, fairTimeScore: 0, transitPenalty: 0, farePenalty: 0, densityBonus: 0,
      avgTransfers: 0, avgWalkMinutes: 0, avgFare: 0, placeTotal,
    };
  }

  const times = participants.map((p) => p.minutes);
  const fairRaw = computeFairScore(times, opts.fairWeights ?? FAIR_WEIGHTS).score;
  const fairTimeScore = opts.normalizeTimeBy ? clamp01(fairRaw / opts.normalizeTimeBy) : fairRaw;

  const avgTransfers = mean(participants.map((p) => p.transfers ?? 0));
  const avgWalkMinutes = mean(participants.map((p) => p.walkMinutes ?? 0));
  const avgFare = mean(participants.map((p) => p.fare ?? 0));

  const transitPenalty = clamp01(avgTransfers / 3 + avgWalkMinutes / 30);
  const farePenalty = clamp01(avgFare / 5000);
  const densityBonus = 1 - commercialDensityScore(placeTotal, { saturationCount: 30 });

  const score =
    fairTimeScore * w.time +
    transitPenalty * w.transit +
    farePenalty * w.fare +
    densityBonus * w.density;

  return {
    score, fairTimeScore, transitPenalty, farePenalty, densityBonus,
    avgTransfers, avgWalkMinutes, avgFare, placeTotal,
  };
}

// ── DI provider ───────────────────────────────────────────────
export type TransitResultProvider = (from: Coord, to: Coord) => Promise<ParticipantTransit | null>;
export type DensityCountProvider = (
  coord: Coord,
  categories: KakaoCategoryCode[],
  radiusM: number,
  keywords?: string[],
) => Promise<number>;

export interface EnhancedScoreOptions extends ComputeEnhancedOptions {
  /** 앱 PurposeType (예: 'meal'|'dinner'…) → toMeetingType 로 카테고리 결정 */
  purposeType?: string;
  /** 직접 지정 시 purposeType 보다 우선 */
  meetingType?: MeetingType;
  /** 밀집도 검색 반경(m), 기본 500 */
  radiusM?: number;
  /** 대중교통 결과 null 시 minutes 폴백 (기본 직선거리 20km/h) */
  fallbackMinutes?: (from: Coord, to: Coord) => number;
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function defaultPublicFallback(from: Coord, to: Coord): number {
  return Math.round((haversineKm(from, to) / 20) * 60);
}

/** 세부 지표까지 반환하는 개선 scoreCandidate */
export async function scoreCandidateEnhancedDetailed(
  coord: Coord,
  publicParticipants: readonly { coord: Coord; transport: 'public' | 'car' }[],
  getTransit: TransitResultProvider,
  getDensityCount: DensityCountProvider,
  opts: EnhancedScoreOptions = {},
): Promise<EnhancedScore> {
  if (publicParticipants.length === 0) {
    return computeEnhancedScore([], 0, opts);
  }
  const fallback = opts.fallbackMinutes ?? defaultPublicFallback;
  const participants: ParticipantTransit[] = await Promise.all(
    publicParticipants.map(async (p) => {
      const r = await getTransit(p.coord, coord);
      if (r) return r;
      return { minutes: fallback(p.coord, coord), transfers: 0, walkMinutes: 0, fare: 0 };
    }),
  );

  const meetingType = opts.meetingType ?? toMeetingType(opts.purposeType ?? '');
  const mapping = MEETING_TYPE_CATEGORY[meetingType];
  const placeTotal = await getDensityCount(coord, mapping.categories, opts.radiusM ?? 500, mapping.keywords);

  return computeEnhancedScore(participants, placeTotal, opts);
}

/** 엔진 교체용 — score(number, 낮을수록 좋음)만 반환 */
export async function scoreCandidateEnhanced(
  coord: Coord,
  publicParticipants: readonly { coord: Coord; transport: 'public' | 'car' }[],
  getTransit: TransitResultProvider,
  getDensityCount: DensityCountProvider,
  opts: EnhancedScoreOptions = {},
): Promise<number> {
  return (await scoreCandidateEnhancedDetailed(coord, publicParticipants, getTransit, getDensityCount, opts)).score;
}
