export type Coord = [number, number] // [lat, lng]

export interface FlexParticipant {
  name: string
  coord: Coord
  transport: 'public' | 'car'
  carFlexible?: boolean
}

export function isYielder(p: Pick<FlexParticipant, 'transport' | 'carFlexible'>): boolean {
  return p.transport === 'car' && p.carFlexible === true
}

export interface YieldMidpointOptions {
  yieldWeight?: number
}

export function calcYieldMidpoint(
  participants: readonly FlexParticipant[],
  opts: YieldMidpointOptions = {},
): Coord {
  if (participants.length === 0) throw new Error('calcYieldMidpoint: 참가자가 없습니다')
  const yw = opts.yieldWeight ?? 0.3

  let sumW = 0, sumLat = 0, sumLng = 0
  for (const p of participants) {
    const w = isYielder(p) ? yw : 1
    sumW += w
    sumLat += w * p.coord[0]
    sumLng += w * p.coord[1]
  }
  if (sumW <= 0) {
    const n = participants.length
    return [
      participants.reduce((a, p) => a + p.coord[0], 0) / n,
      participants.reduce((a, p) => a + p.coord[1], 0) / n,
    ]
  }
  return [sumLat / sumW, sumLng / sumW]
}

export type MinutesProvider = (from: Coord, to: Coord) => Promise<number | null>

export interface YieldContribution {
  yielderName: string
  extraMinutes: number
  message: string
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function formatContributionMsg(yielderName: string, areaName: string | undefined, extraMinutes: number): string {
  const area = areaName ?? '더 나은 장소'
  const tail = extraMinutes > 0 ? `(+${Math.round(extraMinutes)}분 추가)` : '(추가 부담 없음)'
  return `${yielderName}님 양보 덕분에 ${area} 추천 가능 ${tail}`
}

export interface YieldContributionOptions extends YieldMidpointOptions {
  fallback?: (from: Coord, to: Coord) => number
  areaName?: string
}

export async function calcYieldContributions(
  participants: readonly FlexParticipant[],
  getMinutes: MinutesProvider,
  opts: YieldContributionOptions = {},
): Promise<YieldContribution[]> {
  const fallback = opts.fallback ?? ((from: Coord, to: Coord) => Math.round((haversineKm(from, to) / 20) * 60))
  const withYield = calcYieldMidpoint(participants, opts)
  const withoutYield = calcYieldMidpoint(participants, { yieldWeight: 1 })
  const yielders = participants.filter(isYielder)
  return Promise.all(
    yielders.map(async y => {
      const mYield = (await getMinutes(y.coord, withYield)) ?? fallback(y.coord, withYield)
      const mNo = (await getMinutes(y.coord, withoutYield)) ?? fallback(y.coord, withoutYield)
      const extraMinutes = Math.round(mYield - mNo)
      return {
        yielderName: y.name,
        extraMinutes,
        message: formatContributionMsg(y.name, opts.areaName, extraMinutes),
      }
    })
  )
}
