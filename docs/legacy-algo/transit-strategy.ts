/**
 * outputs/transit-strategy.ts
 * ─────────────────────────────────────────────────────────────
 * 미션 B — ODsay 다중 경로: 최소시간 외 환승적은순·도보적은순 선택.
 *
 * 현재 /api/transit-time/route.ts 는 totalTime 최소 경로 1개만 반환:
 *   const best = paths.reduce((a,b) => (a.info.totalTime < b.info.totalTime ? a : b))
 * 개선: strategy 파라미터로 경로 선택 전략 분기.
 *   - fastest          : totalTime 최소 (기본)
 *   - fewest_transfers : 환승 수 최소, 동률이면 totalTime
 *   - least_walk       : totalWalk 최소, 동률이면 totalTime
 *
 * 통합: route.ts 에서
 *   const strategy = parseStrategy(searchParams.get('strategy'))
 *   const best = selectPath(paths, strategy)
 *   if (!best?.info) return NextResponse.json({ minutes: null, error: '경로 없음' })
 *   const r = pathToResult(best.info)   // { minutes, fare, transfers, walkMinutes }
 *   return NextResponse.json(r)
 *
 * 의존성: 없음(순수). OdsayPathInfo 는 route.ts 의 인터페이스와 동일.
 * 검증: labs/moimer-algo/verify-outputs.ts
 */

/** ODsay 경로 info (route.ts 와 동일 필드) */
export interface OdsayPathInfo {
  totalTime: number;
  payment: number;
  busTransitCount: number;
  subwayTransitCount: number;
  totalWalk: number;
}
export interface OdsayPath {
  info?: OdsayPathInfo;
}

export type TransitStrategy = 'fastest' | 'fewest_transfers' | 'least_walk';

const VALID_STRATEGIES: readonly TransitStrategy[] = ['fastest', 'fewest_transfers', 'least_walk'];

/** 쿼리스트링 → 전략 (불명확하면 fastest) */
export function parseStrategy(raw: string | null | undefined): TransitStrategy {
  return VALID_STRATEGIES.includes(raw as TransitStrategy) ? (raw as TransitStrategy) : 'fastest';
}

/** 환승 수 = 버스+지하철 탑승 - 1 (음수는 0) */
export function transferCount(info: OdsayPathInfo): number {
  return Math.max(0, info.busTransitCount + info.subwayTransitCount - 1);
}

/**
 * 전략별 최적 경로 선택. info 없는 경로는 제외. 후보 없으면 null.
 * 동률(primary 키 같음)이면 totalTime 이 작은 경로 우선.
 */
export function selectPath(
  paths: readonly OdsayPath[],
  strategy: TransitStrategy = 'fastest',
): OdsayPath | null {
  const valid = paths.filter((p): p is Required<OdsayPath> => p.info !== undefined);
  if (valid.length === 0) return null;

  const primary = (info: OdsayPathInfo): number => {
    if (strategy === 'fewest_transfers') return transferCount(info);
    if (strategy === 'least_walk') return info.totalWalk;
    return info.totalTime;
  };

  return valid.reduce((best, cur) => {
    const pb = primary(best.info);
    const pc = primary(cur.info);
    if (pc < pb) return cur;
    if (pc === pb && cur.info.totalTime < best.info.totalTime) return cur; // 동률 → 시간
    return best;
  });
}

export interface TransitTimeResult {
  minutes: number;
  fare: number;
  transfers: number;
  walkMinutes: number;
}

/** OdsayPathInfo → route 응답 형태 (route.ts 의 walkMinutes = totalWalk/60 규칙 동일) */
export function pathToResult(info: OdsayPathInfo): TransitTimeResult {
  return {
    minutes: info.totalTime,
    fare: info.payment,
    transfers: transferCount(info),
    walkMinutes: info.totalWalk ? Math.round(info.totalWalk / 60) : 0,
  };
}

/** paths + 전략 → 응답 결과(없으면 null) */
export function pickTransit(
  paths: readonly OdsayPath[],
  strategy: TransitStrategy = 'fastest',
): TransitTimeResult | null {
  const best = selectPath(paths, strategy);
  return best?.info ? pathToResult(best.info) : null;
}
