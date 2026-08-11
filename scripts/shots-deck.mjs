// ─────────────────────────────────────────────────────────────
// scripts/shots-deck.mjs — 발표 자료용 화면 사진 3장을 다시 찍는다
//
//   npm run shots        # 서버가 떠 있어야 한다 (npm run dev)
//
// `docs/img/발표/` 에 **고정된 이름**으로 저장한다:
//   01-홈.png · 02-핑.png · 03-결과.png
// `docs/발표_중간발표.html` 이 이 이름을 그대로 읽으므로, 다시 찍으면
// 슬라이드가 자동으로 갈린다(PPT 는 사진이 파일 안에 박히므로 파워포인트에서
// 그림을 우클릭 → '그림 바꾸기' 로 교체한다).
//
// ⭐ **카카오 키가 있는 노트북에서 찍을 것.** 키가 없으면 지도 자리에
//    "지도를 불러오지 못했어요" 대체 화면이 찍힌다 — 발표 자료에는 실제
//    카카오 지도가 담긴 사진이 훨씬 낫다.
//
// ⚠️ 💰 실제로 모임을 하나 만들고 지운다 — 카카오/ODsay 를 몇 콜 쓴다.
// ─────────────────────────────────────────────────────────────
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = "docs/img/발표/";
fs.mkdirSync(OUT, { recursive: true });

const api = async (b) =>
  (await fetch(`${BASE}/api/meeting`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  })).json();
const get = async (c) => (await fetch(`${BASE}/api/meeting?code=${c}`)).json();

try {
  const r = await fetch(`${BASE}/api/status`);
  if (!r.ok) throw new Error();
} catch {
  console.log(`\n\x1b[31m❌ 서버에 붙지 못했습니다 — ${BASE}\x1b[0m`);
  console.log("\x1b[2m   다른 터미널에서 먼저: npm run dev\x1b[0m\n");
  process.exit(1);
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR" });
await ctx.addInitScript(() => localStorage.setItem("moimer:v8:splash", "1"));
const page = await ctx.newPage();

/** 로그인 시트 같은 오버레이가 클릭을 가로채는 일이 있다 — 먼저 닫는다 */
async function dismiss() {
  for (let k = 0; k < 3; k++) {
    const ov = page.locator(".v8-overlay").first();
    if (!(await ov.isVisible().catch(() => false))) return;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    if (await ov.isVisible().catch(() => false)) {
      await ov.click({ position: { x: 8, y: 8 } }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

// ── ① 홈 — 출발지 4곳 → 중간지점 ─────────────────────────────
await page.goto(`${BASE}/`);
await page.waitForTimeout(1500);
await dismiss();
const box = page.getByPlaceholder(/출발|어디/).first();
for (const q of ["강남역", "홍대입구", "잠실", "사당"]) {
  await dismiss();
  await box.fill(q);
  await page.waitForTimeout(1200);
  // ⚠️ 엔터로는 추가되지 않는다 — 자동완성 한 줄(.ac-row)이 실제 추가 버튼이다
  const row = page.locator(".ac-row").first();
  if (await row.isVisible().catch(() => false)) await row.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(4500);
await dismiss();
await page.screenshot({ path: OUT + "01-홈.png" });
console.log("✅ 01-홈.png");

// ── 모임 하나를 만들고 4명을 채운다 ──────────────────────────
const c = await api({
  action: "create", name: "협성대 3팀 뒤풀이", leaderName: "유환",
  scope: "place", purposeCategory: "food",
  meetTime: new Date(Date.now() + 2 * 86400000).toISOString(),
});
await api({ action: "origin", code: c.code, participantId: c.participantId, origin: "강남역", transport: "transit" });
const spots = [[37.5665, 126.9780], [37.5563, 126.9236], [37.5133, 127.1000]];
const mates = [["지민", "홍대입구"], ["서연", "잠실"], ["도윤", "사당"]];
for (let i = 0; i < 3; i++) {
  const j = await api({ action: "join", code: c.code, name: mates[i][0] });
  await api({ action: "origin", code: c.code, participantId: j.participantId, origin: mates[i][1], transport: "transit" });
  await api({ action: "addRegion", code: c.code, participantId: j.participantId, lat: spots[i][0], lng: spots[i][1] });
}
await page.addInitScript(([code, id, name]) => {
  localStorage.setItem(`moimer:${code}`, JSON.stringify([{ id, name, isLeader: true }]));
  localStorage.setItem(`moimer:${code}:active`, id);
}, [c.code.toUpperCase(), c.participantId, "유환"]);

// ── ② 지도 핑 — 확인 시트까지 ────────────────────────────────
await page.goto(`${BASE}/m/${c.code}`);
await page.waitForTimeout(2500);
const map = page.locator(".map").first();
const b = await map.boundingBox().catch(() => null);
if (b) await map.click({ position: { x: b.width * 0.45, y: b.height * 0.34 }, timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "02-핑.png" });
console.log("✅ 02-핑.png");
await page.getByRole("button", { name: /여기로 등록/ }).click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1500);

// ── ③ 결과 — 지역·지점까지 확정 ──────────────────────────────
let st = await get(c.code);
const win = (st.regions || [])[0];
if (win) {
  await api({ action: "confirmManual", code: c.code, participantId: c.participantId, target: "region", id: win.id });
  await api({
    action: "addPlace", code: c.code, participantId: c.participantId,
    name: "모이머 포차", category: "술집", emoji: "🍺",
    lat: win.lat + 0.0009, lng: win.lng + 0.0009, rating: 0,
  });
  st = await get(c.code);
  const pl = (st.places || [])[0];
  if (pl) await api({ action: "confirmManual", code: c.code, participantId: c.participantId, target: "place", id: pl.id });
}
await page.goto(`${BASE}/m/${c.code}`);
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT + "03-결과.png" });
console.log("✅ 03-결과.png");

// 뒷정리 — DB 에 테스트 모임을 남기지 않는다
await api({ action: "deleteMeeting", code: c.code, participantId: c.participantId });
console.log(`\n저장 위치: ${OUT}  (모임 ${c.code} 는 지웠습니다)`);
await browser.close();
