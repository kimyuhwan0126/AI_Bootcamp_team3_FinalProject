import type { TravelTime } from '@/types'

export function formatTravelTime(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`
}

export interface ConfidenceBadge {
  level: 'live' | 'estimate'
  label: string
  tone: 'green' | 'amber'
}

export function confidenceBadge(t: Pick<TravelTime, 'isEstimated'>): ConfidenceBadge {
  return t.isEstimated
    ? { level: 'estimate', label: '추정', tone: 'amber' }
    : { level: 'live', label: '실시간', tone: 'green' }
}

function modeLabel(t: Pick<TravelTime, 'transport' | 'carFlexible'>): string {
  if (t.transport === 'car') return t.carFlexible ? '자차(양보)' : '자차'
  return '대중교통'
}

export function getTravelSummary(t: TravelTime): string {
  const parts: string[] = [`${modeLabel(t)} ${formatTravelTime(t.estimatedMinutes)}`]

  if (t.transport === 'public') {
    if (typeof t.transfers === 'number') {
      const tr = Math.max(0, t.transfers)
      parts.push(tr > 0 ? `환승 ${tr}회` : '환승 없음')
    }
    if (typeof t.walkMinutes === 'number' && t.walkMinutes > 0) {
      parts.push(`도보 ${t.walkMinutes}분`)
    }
    if (typeof t.fare === 'number' && t.fare > 0) {
      parts.push(`${t.fare.toLocaleString('ko-KR')}원`)
    }
  }
  if (t.isEstimated) parts.push('추정')
  return parts.join(' · ')
}

export interface DepartureClock {
  clock: string
  dayOffset: number
}

export function calcDepartureClock(
  meetingHHMM: string,
  travelMinutes: number,
  bufferMinutes = 0,
): DepartureClock {
  const m = /^(\d{1,2}):(\d{2})$/.exec(meetingHHMM.trim())
  if (!m) throw new Error('calcDepartureClock: "HH:MM"(24h) 형식 필요')
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) throw new Error('calcDepartureClock: 시각 범위 오류')

  let dep = hh * 60 + mm - Math.round(travelMinutes) - Math.round(bufferMinutes)
  let dayOffset = 0
  while (dep < 0) {
    dep += 1440
    dayOffset -= 1
  }
  const H = String(Math.floor(dep / 60) % 24).padStart(2, '0')
  const M = String(dep % 60).padStart(2, '0')
  return { clock: `${H}:${M}`, dayOffset }
}
