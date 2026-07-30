export interface ParticipantDates {
  participantId: string
  availableDates: string[]
}

export type HighlightLevel = 'best' | 'high' | 'mid' | 'low'

export interface DateHighlight {
  date: string
  count: number
  total: number
  ratio: number
  level: HighlightLevel
  isBest: boolean
  isFullOverlap: boolean
  participantIds: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE.test(v.trim())
}

function levelOf(ratio: number, isBest: boolean): HighlightLevel {
  if (isBest) return 'best'
  if (ratio >= 0.75) return 'high'
  if (ratio >= 0.5) return 'mid'
  return 'low'
}

export function computeDateHighlights(
  participants: readonly ParticipantDates[],
  totalParticipants?: number,
): DateHighlight[] {
  const total = totalParticipants ?? participants.length
  const byDate = new Map<string, Set<string>>()

  for (const p of participants) {
    for (const raw of p.availableDates) {
      if (!isValidDate(raw)) continue
      const date = raw.trim()
      let set = byDate.get(date)
      if (!set) { set = new Set<string>(); byDate.set(date, set) }
      set.add(p.participantId)
    }
  }

  if (byDate.size === 0) return []

  let maxCount = 0
  byDate.forEach(ids => { maxCount = Math.max(maxCount, ids.size) })

  const highlights: DateHighlight[] = []
  byDate.forEach((ids, date) => {
    const count = ids.size
    const ratio = total > 0 ? count / total : 0
    const isBest = count === maxCount
    highlights.push({
      date, count, total, ratio,
      level: levelOf(ratio, isBest),
      isBest,
      isFullOverlap: total > 0 && count === total,
      participantIds: Array.from(ids).sort(),
    })
  })

  highlights.sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
  return highlights
}

export function bestDates(highlights: readonly DateHighlight[]): DateHighlight[] {
  return highlights.filter(h => h.isBest)
}

export function toHighlightMap(highlights: readonly DateHighlight[]): Map<string, DateHighlight> {
  return new Map(highlights.map(h => [h.date, h]))
}
