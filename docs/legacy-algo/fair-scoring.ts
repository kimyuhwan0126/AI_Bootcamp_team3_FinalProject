export type Coord = [number, number] // [lat, lng]

export interface FairScoreWeights {
  max: number
  avg: number
  stddev: number
}

export const FAIR_WEIGHTS: FairScoreWeights = { max: 0.5, avg: 0.3, stddev: 0.2 }
export const LEGACY_WEIGHTS: FairScoreWeights = { max: 0.6, avg: 0.4, stddev: 0 }

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function stddev(xs: readonly number[], m?: number): number {
  if (xs.length <= 1) return 0
  const mu = m ?? mean(xs)
  const variance = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

export function equityIndex(times: readonly number[]): number {
  if (times.length <= 1) return 1
  const mu = mean(times)
  if (mu <= 0) return 1
  const cv = stddev(times, mu) / mu
  return Math.min(1, Math.max(0, 1 - cv))
}

export interface FairScore {
  score: number
  max: number
  avg: number
  stddev: number
  equityIndex: number
  count: number
}

export function computeFairScore(
  times: readonly number[],
  weights: FairScoreWeights = FAIR_WEIGHTS,
): FairScore {
  if (times.length === 0) {
    return { score: 0, max: 0, avg: 0, stddev: 0, equityIndex: 1, count: 0 }
  }
  const max = Math.max(...times)
  const avg = mean(times)
  const sd = stddev(times, avg)
  const score = max * weights.max + avg * weights.avg + sd * weights.stddev
  return { score, max, avg, stddev: sd, equityIndex: equityIndex(times), count: times.length }
}
