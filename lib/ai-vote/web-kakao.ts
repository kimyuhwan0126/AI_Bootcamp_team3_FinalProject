// ─────────────────────────────────────────────────────────────
// ai-vote/web-kakao.ts — 카카오맵 "웹"만으로 검색·경로를 얻는다 (API 0콜)
//
//  W1~V12 하네스(_vote.mjs)에서 검증된 것을 이식. 함정 전부 실측 근거:
//   · 요금 표기 3종: "요금 1,750원"(시내) / "요금 약 17,100원"(시외) / "요금정보 없음"(장거리버스)
//   · 도보 거리 2종: "213m" / "10.4km"
//   · 헤더("전체 14")는 경로 카드보다 먼저 뜬다 → 카드 수가 안 늘 때까지 폴링
//   · 동시 페이지 30+ 는 Playwright CRSession assert 로 죽는다 → 12개 상한
//  ⚠️ search.map.kakao.com 은 비공식 엔드포인트다(팀 공지 사항, PoC 용도).
// ─────────────────────────────────────────────────────────────
import type { Browser } from "playwright-core";

const SEARCH = "https://search.map.kakao.com/mapsearch/map.daum?msFlag=A&sort=0&q=";
const RH = { Referer: "https://map.kakao.com/" };

export interface WebPlace {
  name: string; lat: number; lng: number;
  kakaoId: string | null; category: string; catRoot: string;
  address: string; rating: number; reviews: number;
}
export interface RouteResult {
  minutes: number; options?: number; fare?: number | null;
  transfers?: number; via?: string; intercity?: boolean; distanceM?: number; note?: string;
}
export type RouteOrError = RouteResult | { error: string };
export const isRouteError = (r: RouteOrError): r is { error: string } => "error" in r;

export const hav = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371, d = Math.PI / 180;
  const la = (b.lat - a.lat) * d, lo = (b.lng - a.lng) * d;
  const h = Math.sin(la / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(lo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** 카카오맵 웹 검색(JSONP). 키 불필요 — 좌표·별점·카테고리까지 온다. */
export async function webSearch(q: string): Promise<{ total: number; places: WebPlace[] }> {
  const t = await (await fetch(SEARCH + encodeURIComponent(q), { headers: RH })).text();
  try {
    const j = JSON.parse(t.replace(/^[^{]*\(/, "").replace(/\);?\s*$/, "")) as {
      page_count?: number;
      place?: { name: string; lat: string; lon: string; confirmid?: string; last_cate_name?: string;
        cate_name_depth1?: string; address?: string; rating_average?: string; rating_count?: string }[];
    };
    const places: WebPlace[] = (j.place ?? []).map((p) => ({
      name: p.name, lat: +p.lat, lng: +p.lon, kakaoId: p.confirmid || null,
      category: p.last_cate_name || "", catRoot: p.cate_name_depth1 || "", address: p.address || "",
      rating: +(p.rating_average || 0), reviews: +(p.rating_count || 0),
    })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    return { total: j.page_count ?? places.length, places };
  } catch { return { total: 0, places: [] }; }
}

// ── 브라우저 싱글턴 + 동시 페이지 상한 ──
let browser: Browser | null = null;
let closing = false;
async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  const { chromium } = await import("playwright-core");
  browser = await chromium.launch({ headless: true });
  return browser;
}
export async function closeKakaoBrowser(): Promise<void> {
  if (closing) return; closing = true;
  try { await browser?.close(); } catch { /* 정리 실패는 무시 */ }
  browser = null; closing = false;
}

const PAGE_CAP = 12;
let active = 0;
const waiters: (() => void)[] = [];
const acquire = (): Promise<void> =>
  active < PAGE_CAP ? (active++, Promise.resolve()) : new Promise((r) => waiters.push(r));
const release = (): void => { active--; const w = waiters.shift(); if (w) { active++; w(); } };

const toMin = (s: string): number =>
  /시간/.test(s) ? parseInt(s) * 60 + (parseInt((s.match(/시간\s*(\d+)/) ?? [])[1] ?? "") || 0) : parseInt(s);

/** 카카오맵 길찾기 페이지를 렌더링해 파싱한다. mode: traffic | car | walk */
export async function webRoute(
  mode: "traffic" | "car" | "walk",
  from: { name: string; lat: number; lng: number },
  to: { name: string; lat: number; lng: number }
): Promise<RouteOrError> {
  if (hav(from, to) < 0.05) return { minutes: 0, note: "같은 지점" };
  await acquire();
  const page = await (await getBrowser()).newPage();
  try {
    await page.goto(
      `https://map.kakao.com/link/by/${mode}/${encodeURIComponent(from.name)},${from.lat},${from.lng}/${encodeURIComponent(to.name)},${to.lat},${to.lng}`,
      { waitUntil: "domcontentloaded", timeout: 45000 });
    const READY = mode === "traffic" ? "도보\\d+분\\s*환승|요금\\s*약" : "(\\d+분|\\d+시간)[\\s\\S]{0,8}[\\d.]+\\s*(km|m)\\b";
    await page.waitForFunction((src: string) => new RegExp(src).test(document.body.innerText), READY, { timeout: 20000 }).catch(() => { /* 폴링으로 재확인 */ });
    if (mode === "traffic") {
      // 안정화 폴링 — 카드 수가 연속 2회(0.8초 창) 불변일 때까지. 안전 불변식(부분 렌더 방지,
      // W7 사고)은 유지하되 간격을 1초→400ms 로 조여 페이지당 최대 8초→4.8초 (시간 최적화).
      let prev = -1, stable = 0;
      for (let w = 0; w < 12; w++) {
        const cnt = await page.evaluate(() => (document.body.innerText.match(/도보\d+분\s*환승|요금\s*약/g) ?? []).length);
        if (cnt > 0 && cnt === prev) { if (++stable >= 2) break; } else stable = 0;
        prev = cnt; await page.waitForTimeout(400);
      }
    } else await page.waitForTimeout(500);
    const txt: string = await page.evaluate(() => document.body.innerText);

    if (mode === "traffic") {
      const re = /(\d+시간\s*\d+분|\d+시간|\d+분)\s*도보(\d+)분\s*환승(없음|\d+회)\s*요금\s*(?:([\d,]+)원|정보 없음)/g;
      const rs: RouteResult[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt)) && rs.length < 8)
        rs.push({ minutes: toMin(m[1]), transfers: m[3] === "없음" ? 0 : parseInt(m[3]), fare: m[4] ? +m[4].replace(/,/g, "") : null });
      rs.sort((x, y) => x.minutes - y.minutes);
      if (rs.length) return { ...rs[0], options: rs.length };
      const reI = /(\d+시간\s*\d+분|\d+시간|\d+분)\s*\n\s*([^\n]*?)요금\s*약\s*([\d,]+)원/g;
      const ic: RouteResult[] = [];
      while ((m = reI.exec(txt)) && ic.length < 8)
        ic.push({ minutes: toMin(m[1]), via: m[2].trim().slice(0, 20), fare: +m[3].replace(/,/g, ""), intercity: true });
      ic.sort((x, y) => x.minutes - y.minutes);
      return ic.length ? { ...ic[0], options: ic.length } : { error: "경로를 못 읽음" };
    }
    const mm = txt.match(/(\d+시간\s*\d+분|\d+시간|\d+분)\s*\n?\s*([\d.]+)\s*(km|m)\b/);
    if (!mm) return { error: "경로를 못 읽음" };
    const meters = Math.round(mm[3] === "km" ? +mm[2] * 1000 : +mm[2]);
    return { minutes: toMin(mm[1]), distanceM: meters };
  } catch (e) { return { error: String(e).slice(0, 70) }; }
  finally { await page.close().catch(() => { /* 이미 닫힘 */ }); release(); }
}

/** 타임아웃·렌더 실패는 1회 재시도로 대부분 살아난다 (W2 실측) */
export async function webRouteRetry(
  mode: "traffic" | "car" | "walk",
  from: { name: string; lat: number; lng: number },
  to: { name: string; lat: number; lng: number }
): Promise<RouteOrError> {
  const r = await webRoute(mode, from, to);
  return isRouteError(r) ? webRoute(mode, from, to) : r;
}
