/**
 * outputs/yield-message-integration.ts
 * ─────────────────────────────────────────────────────────────
 * 미션 C — 자차 양보 기여도 메시지를 buildRegionRecommendation 결과에 연결.
 *
 * car-flexible-logic.calcYieldContributions() 는 이미 존재하나 앱에서 호출 안 됨.
 * 이 파일은 그 결과를 RegionRecommendation.yieldMessages 로 넣는 연결 로직을 제공한다.
 *
 * 코드 중복 금지: car-flexible-logic 재사용.
 * 검증: labs/moimer-algo/verify-outputs.ts
 */

import {
  calcYieldContributions,
  type Coord,
  type FlexParticipant,
  type MinutesProvider,
} from '@/lib/algo/car-flexible-logic';

/**
 * ── RegionRecommendation 타입 확장안 (projects/moimer/src/types/index.ts) ──
 * 현재:
 *   export interface RegionRecommendation {
 *     candidates: RegionCandidate[]
 *     selectedIndex?: number
 *     votes?: Record<string, number>
 *     centerCalcDescription: string
 *     confidence: number
 *   }
 * 추가 (1줄):
 *   yieldMessages?: string[]   // 자차 양보 기여 메시지 (없으면 미표시)
 *
 * 아래 인터페이스는 확장 결과의 참고 미러(앱 타입을 대체하지 않음).
 */
export interface RegionRecommendationYieldPatch {
  /** 자차 양보 기여 메시지. 예: ["철수님 양보 덕분에 강남 추천 가능 (+15분 추가)"] */
  yieldMessages?: string[];
}

export interface BuildYieldMessagesOptions {
  /** 엔진 Step2 와 동일하게 0.3 (양보 반영 정도) */
  yieldWeight?: number;
  /** 상위 후보 지역명 (예: 확정 후보 candidates[0].name) */
  areaName?: string;
  /** provider null 시 폴백 (기본 직선거리 20km/h) */
  fallback?: (from: Coord, to: Coord) => number;
  /** 이 값 미만의 추가시간은 메시지 생략(노이즈 제거). 기본 1분 */
  minExtraMinutes?: number;
}

/**
 * 양보 기여 메시지 배열 생성.
 * 양보자(car+carFlexible)가 없으면 [] 반환.
 * @param participants 엔진 Step2 의 flexParticipants 그대로 전달
 * @param getMinutes   양보자(자차) 이동시간 provider — 보통 TMAP(/api/car-time) 사용
 */
export async function buildYieldMessages(
  participants: readonly FlexParticipant[],
  getMinutes: MinutesProvider,
  opts: BuildYieldMessagesOptions = {},
): Promise<string[]> {
  const minExtra = opts.minExtraMinutes ?? 1;
  const contributions = await calcYieldContributions(participants, getMinutes, {
    yieldWeight: opts.yieldWeight ?? 0.3,
    areaName: opts.areaName,
    fallback: opts.fallback,
  });
  return contributions.filter((c) => c.extraMinutes >= minExtra).map((c) => c.message);
}

/**
 * getMinutes provider 예시 — TMAP 자차 라우트(/api/car-time)를 추상화.
 * 양보자는 자차 이용자이므로 자차 소요시간으로 손해를 계산한다.
 * fetchImpl 주입 가능(테스트/SSR). 실패 시 null → buildYieldMessages 가 폴백 적용.
 */
export function createCarMinutesProvider(
  fetchImpl: typeof fetch = fetch,
): MinutesProvider {
  return async (from, to) => {
    try {
      const params = new URLSearchParams({
        sx: String(from[1]), sy: String(from[0]),
        ex: String(to[1]),   ey: String(to[0]),
      });
      const res = await fetchImpl(`/api/car-time?${params.toString()}`);
      if (!res.ok) return null;
      const data = (await res.json()) as unknown;
      const rec = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
      return rec && typeof rec.minutes === 'number' ? rec.minutes : null;
    } catch {
      return null;
    }
  };
}

/**
 * ── 통합 노트 (recommend-engine.ts buildRegionRecommendation) ──
 * Step 6 에서 candidates 생성 직후, 상위 1위(candidates[0]) 확정 후:
 *
 *   import { buildYieldMessages, createCarMinutesProvider } from './algo/yield-message-integration'
 *   ...
 *   const yieldMessages = await buildYieldMessages(
 *     flexParticipants,                    // Step2 에서 이미 만든 배열 재사용
 *     createCarMinutesProvider(),
 *     { areaName: candidates[0]?.name, yieldWeight: 0.3 },
 *   )
 *   return { candidates, centerCalcDescription, confidence, yieldMessages }
 *
 * UI 표시 위치: 후보 카드 하단 배지 또는 투표 완료/확정 화면 상단 안내 문구.
 */
