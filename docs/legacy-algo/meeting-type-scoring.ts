export type Coord = [number, number]

export type MeetingType = 'meal' | 'cafe' | 'drink' | 'study'
export type KakaoCategoryCode = 'FD6' | 'CE7' | 'PO3' | 'CT1' | 'AT4'

export interface CategoryMapping {
  categories: KakaoCategoryCode[]
  keywords?: string[]
}

export const MEETING_TYPE_CATEGORY: Record<MeetingType, CategoryMapping> = {
  meal:  { categories: ['FD6'] },
  cafe:  { categories: ['CE7'] },
  drink: { categories: ['FD6'], keywords: ['술집', '호프', '포차', '이자카야'] },
  study: { categories: ['CE7', 'PO3'] },
}

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  meal: '맛집', cafe: '카페', drink: '술집', study: '스터디 공간',
}

export const PURPOSE_TO_MEETING_TYPE: Record<string, MeetingType> = {
  meal: 'meal', dinner: 'drink', daytrip: 'meal', overnight: 'meal', transit: 'cafe',
}

export function toMeetingType(purpose: string): MeetingType {
  return PURPOSE_TO_MEETING_TYPE[purpose] ?? 'meal'
}

export interface DensityOptions {
  radiusM?: number
  saturationCount?: number
}

export function commercialDensityScore(count: number, opts: DensityOptions = {}): number {
  const sat = opts.saturationCount ?? 30
  if (count <= 0) return 0
  if (count >= sat) return 1
  return Math.min(1, Math.log1p(count) / Math.log1p(sat))
}

export function buildCandidateDescription(p: {
  name: string
  meetingType: MeetingType
  placeCount: number
  avgMinutes: number
  isMostFair?: boolean
}): string {
  const parts = [
    `${MEETING_TYPE_LABEL[p.meetingType]} ${p.placeCount}개`,
    `평균 이동 ${Math.round(p.avgMinutes)}분`,
  ]
  if (p.isMostFair) parts.push('가장 공평한 선택')
  return `${p.name} — ${parts.join(', ')}`
}
