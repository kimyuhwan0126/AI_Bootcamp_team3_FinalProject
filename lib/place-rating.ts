// ─────────────────────────────────────────────────────────────
// place-rating.ts — 지점 별점 조회 (카카오맵 웹)
//
// 📌 팀 결정 (2026-08-09, docs/설계_v19.md §13-A): **스크래핑 복원**
//
//    v19 가 "별점 = 카카오 웹 스크래핑 유지 · 지점 정렬 별점순"을 요구한다.
//    PR #54 에서 걷어냈던 이유는 **Vercel 서버리스에 크롬이 없어서**였는데,
//    발표가 로컬 시연(docs/발표_로컬시연.md)이라 그 제약이 해당하지 않는다.
//
// ⚠️ 지켜야 할 두 가지 — 이걸 어기면 걷어냈던 이유가 그대로 돌아온다
//
//   ① **실패는 조용히 0 이다.** 별점을 못 구하면 `rating: 0`(= 정보 없음)이고,
//      UI 3곳이 이미 `rating > 0` 가드를 갖고 있어 별이 저절로 사라진다.
//      **그럴듯한 숫자를 지어내지 않는다** (CLAUDE.md §3-6).
//   ② **시연을 멈추지 않는다.** 타임아웃을 짧게 잡고, 브라우저가 없거나
//      느리면 즉시 포기한다. 별점은 있으면 좋은 것이지 없으면 못 도는 게 아니다.
//
// 💰 비용: 카카오맵 **웹 페이지**를 읽는 것이라 API 호출 한도를 쓰지 않는다.
//    다만 요청이 잦으면 차단될 수 있어 캐시를 둔다.
//
// 플래그: `NEXT_PUBLIC_FF_PLACE_RATING=1` 일 때만 동작한다.
//    기본이 꺼짐인 이유 — 팀원 로컬·CI 에는 크롬이 없을 수 있고, 켜지 않아도
//    "정보 없음"으로 정상 동작하기 때문이다. 발표 노트북에서만 켠다.
// ─────────────────────────────────────────────────────────────
import { FLAGS } from "./flags";

/** 이름 → 별점. 실 조회 성공값만 담는다 (CLAUDE.md §3-5: 폴백은 캐시하지 않는다) */
const cache = new Map<string, number>();

/** 한 번에 이 개수까지만 본다 — 전부 훑으면 발표 중에 눈에 띄게 느려진다 */
const MAX_LOOKUPS = 6;
/** 페이지 하나당 상한. 넘으면 그 건은 포기하고 0 으로 둔다 */
const PER_PAGE_MS = 2500;
/** 전체 상한 — 이 시간을 넘기면 남은 건 전부 0 이다 */
const TOTAL_MS = 8000;

type Target = { name: string; url: string };

/**
 * 지점들의 별점을 한꺼번에 조회한다.
 *
 * @returns 이름 → 별점 Map. **조회를 아예 못 했으면 `null`** (호출부가 0 을 유지한다).
 *          Map 안에 없는 이름도 "정보 없음"이다.
 */
export async function ratingsFor(targets: Target[]): Promise<Map<string, number> | null> {
  if (!FLAGS.placeRating) return null;

  const out = new Map<string, number>();
  const todo: Target[] = [];
  for (const t of targets) {
    const hit = cache.get(t.name);
    if (hit !== undefined) out.set(t.name, hit);
    else if (t.url) todo.push(t);
  }
  if (todo.length === 0) return out.size > 0 ? out : null;

  let browser: { close(): Promise<void>; newPage(): Promise<PageLike> } | null = null;
  try {
    browser = await launch();
    if (!browser) return out.size > 0 ? out : null;

    const deadline = Date.now() + TOTAL_MS;
    for (const t of todo.slice(0, MAX_LOOKUPS)) {
      if (Date.now() > deadline) break;
      const r = await scrapeOne(browser, t.url);
      if (r != null) {
        cache.set(t.name, r);   // ✅ 성공값만 캐시
        out.set(t.name, r);
      }
    }
  } catch {
    // 크롬 없음 · 차단 · 구조 변경 — 전부 "정보 없음"으로 떨어진다
  } finally {
    try { await browser?.close(); } catch { /* 이미 닫혔으면 무시 */ }
  }
  return out.size > 0 ? out : null;
}

// ── playwright 를 **선택적 의존성**으로 다룬다 ────────────────────
//  devDependency 라 배포 번들에 없을 수 있다. 없으면 조용히 null 이다.
//  (정적 import 를 쓰면 모듈이 없을 때 라우트 전체가 죽는다)

interface PageLike {
  goto(url: string, opts?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
  textContent(sel: string, opts?: { timeout?: number }): Promise<string | null>;
  close(): Promise<void>;
}

async function launch() {
  try {
    const mod: unknown = await import("playwright-core").catch(() => import("@playwright/test"));
    const chromium = (mod as { chromium?: { launch(o: unknown): Promise<unknown> } }).chromium;
    if (!chromium) return null;
    const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
    const b = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    return b as { close(): Promise<void>; newPage(): Promise<PageLike> };
  } catch {
    return null;
  }
}

/** 카카오맵 장소 페이지에서 별점 하나를 읽는다. 못 읽으면 null. */
async function scrapeOne(
  browser: { newPage(): Promise<PageLike> },
  url: string
): Promise<number | null> {
  let page: PageLike | null = null;
  try {
    page = await browser.newPage();
    await page.goto(url, { timeout: PER_PAGE_MS, waitUntil: "domcontentloaded" });
    // 카카오맵 장소 상세의 평점 영역. 구조가 바뀌면 null → "정보 없음"이 된다.
    const raw =
      (await page.textContent(".link_evaluation .num_rate", { timeout: PER_PAGE_MS }).catch(() => null)) ??
      (await page.textContent(".grade_star .screen_out", { timeout: 500 }).catch(() => null));
    if (!raw) return null;
    const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    // 0~5 범위를 벗어나면 우리가 읽은 게 별점이 아니다 — 지어내지 않고 버린다
    return Number.isFinite(n) && n > 0 && n <= 5 ? Math.round(n * 10) / 10 : null;
  } catch {
    return null;
  } finally {
    try { await page?.close(); } catch { /* 무시 */ }
  }
}
