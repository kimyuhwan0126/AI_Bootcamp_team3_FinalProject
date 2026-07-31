// ─────────────────────────────────────────────────────────────
// weather.ts — 날씨 조회 (Open-Meteo → mock 폴백)
//
//  · getWeather(coord, when?) : 좌표·일시 → WeatherSnapshot
//
//  Open-Meteo(https://open-meteo.com)는 **키가 필요 없는 무료 API**다.
//  그래도 프로젝트 규칙(CLAUDE.md §4)은 그대로 지킨다:
//   · 네트워크가 없어도 mock 폴백으로 전체 플로우가 돈다
//   · 실 API 성공값만 캐시한다 (폴백을 캐시하면 복구 후에도 계속 mock)
//   · mock 은 `real: false` 로 내려보내 UI 가 실제 예보처럼 그리지 않는다
//
//  예보는 최대 16일 앞까지만 가능하다. 그 밖(과거·먼 미래·일시 미정)은
//  네트워크를 부르지 않고 바로 mock(계절 평균 기반 추정)으로 간다.
// ─────────────────────────────────────────────────────────────
import type { Coord } from "./kakao";
import type { WeatherSnapshot } from "./scoring/types";

export interface WeatherWhen {
  dateIso?: string;  // "2026-08-14"
  timeHhmm?: string; // "19:00"
}

/** 예보 API 가 커버하는 범위(일). Open-Meteo forecast 는 16일. */
const FORECAST_MAX_DAYS = 15;
/** 모임 시간이 없을 때 가정하는 시각 — 저녁 모임이 기본이다. */
const DEFAULT_HOUR = 19;
const FETCH_TIMEOUT_MS = 3000;
/** 실패 후 이 시간 동안은 재시도하지 않는다 — 후보마다 3초씩 기다리지 않게. */
const FAIL_COOLDOWN_MS = 60_000;

// 프로세스 캐시(재로드에도 유지) — routing.ts 와 같은 패턴. 실 성공값만 넣는다.
const g = globalThis as unknown as { __moimerWeather?: Map<string, WeatherSnapshot> };
const cache = g.__moimerWeather ?? (g.__moimerWeather = new Map());
let failUntil = 0;

// ── 좌표·일시 → 캐시 키 (소수 2자리 ≈ 1km — 날씨 해상도로 충분) ──
function cacheKey(c: Coord, dateIso: string, hour: number): string {
  return `${c.lat.toFixed(2)},${c.lng.toFixed(2)}|${dateIso}|${hour}`;
}

function todayIso(): string {
  const now = new Date();
  // 한국 서비스라 KST 기준 날짜로 맞춘다 (서버가 UTC 여도 어긋나지 않게)
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function daysFromToday(dateIso: string): number {
  const target = Date.parse(`${dateIso}T00:00:00+09:00`);
  const base = Date.parse(`${todayIso()}T00:00:00+09:00`);
  if (!Number.isFinite(target) || !Number.isFinite(base)) return NaN;
  return Math.round((target - base) / 86_400_000);
}

function parseHour(timeHhmm?: string): number {
  const m = /^(\d{1,2})/.exec(timeHhmm ?? "");
  const h = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR;
}

// ── Open-Meteo 응답 파싱 — any 금지: unknown + 가드 ──
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function numArray(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : null;
}
function strArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

/** WMO weather code → 앱의 4분류. */
function conditionOf(code: number): WeatherSnapshot["condition"] {
  if (code === 0) return "clear";
  if ([1, 2, 3, 45, 48].includes(code)) return "cloudy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "unknown";
}

async function fetchOpenMeteo(c: Coord, dateIso: string, hour: number): Promise<WeatherSnapshot | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(4)}&longitude=${c.lng.toFixed(4)}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
    `&timezone=Asia%2FSeoul&start_date=${dateIso}&end_date=${dateIso}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    const d: unknown = await r.json();
    if (!isRecord(d) || !isRecord(d.hourly)) return null;
    const times = strArray(d.hourly.time);
    const temps = numArray(d.hourly.temperature_2m);
    const feels = numArray(d.hourly.apparent_temperature);
    const probs = numArray(d.hourly.precipitation_probability);
    const codes = numArray(d.hourly.weather_code);
    if (!times || !temps || !probs || !codes) return null;
    const idx = times.indexOf(`${dateIso}T${String(hour).padStart(2, "0")}:00`);
    if (idx < 0 || idx >= temps.length || idx >= probs.length || idx >= codes.length) return null;
    return {
      tempC: temps[idx],
      feelsLikeC: feels?.[idx],
      rainProb: Math.max(0, Math.min(1, probs[idx] / 100)),
      condition: conditionOf(codes[idx]),
      real: true,
    };
  } catch {
    return null; // 네트워크/타임아웃/파싱 오류 → 상위에서 mock 폴백
  } finally {
    clearTimeout(timer);
  }
}

// ── mock: 계절 평균 기반의 결정적 추정 (real: false) ──
// 같은 좌표·날짜면 항상 같은 값 — 폴링마다 값이 널뛰면 추천 순위가 흔들린다.
const MONTH_TEMP_C = [2, 4, 9, 14, 19, 23, 26, 27, 23, 17, 10, 4];
const MONTH_RAIN_P = [0.15, 0.15, 0.2, 0.25, 0.25, 0.4, 0.55, 0.5, 0.3, 0.2, 0.2, 0.15];

function seededUnit(key: string): number {
  // FNV-1a 해시 → 0~1. 의사난수면 충분하다(실제 날씨가 아님을 UI 에 밝힌다).
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export function mockWeather(c: Coord, dateIso: string, hour: number): WeatherSnapshot {
  const month = parseInt(dateIso.slice(5, 7), 10);
  const mi = Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : 0;
  const r = seededUnit(cacheKey(c, dateIso, hour));
  const tempC = Math.round(MONTH_TEMP_C[mi] + (r - 0.5) * 6);
  const rainProb = Math.max(0.05, Math.min(0.9, MONTH_RAIN_P[mi] + (r - 0.5) * 0.2));
  const condition: WeatherSnapshot["condition"] =
    rainProb >= 0.5 ? (tempC <= 1 ? "snow" : "rain") : rainProb >= 0.3 ? "cloudy" : "clear";
  return { tempC, rainProb: Math.round(rainProb * 100) / 100, condition, real: false };
}

/**
 * 좌표·일시의 날씨. 실패해도 항상 값을 돌려준다(mock 은 `real: false`).
 * 일시가 없으면 "오늘 저녁"으로 가정한다 — 모임 기본 시간대.
 */
export async function getWeather(c: Coord, when?: WeatherWhen): Promise<WeatherSnapshot> {
  const dateIso = when?.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(when.dateIso) ? when.dateIso : todayIso();
  const hour = parseHour(when?.timeHhmm);
  const key = cacheKey(c, dateIso, hour);
  const hit = cache.get(key);
  if (hit) return hit;

  const days = daysFromToday(dateIso);
  const inForecastRange = Number.isFinite(days) && days >= 0 && days <= FORECAST_MAX_DAYS;

  if (inForecastRange && Date.now() >= failUntil) {
    const real = await fetchOpenMeteo(c, dateIso, hour);
    if (real) {
      cache.set(key, real); // 실 성공값만 캐시
      return real;
    }
    failUntil = Date.now() + FAIL_COOLDOWN_MS;
  }
  return mockWeather(c, dateIso, hour); // 폴백은 캐시하지 않는다
}
