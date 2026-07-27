// ─────────────────────────────────────────────────────────────
// capture-feature.mjs — search_more_places 디버깅 데모 캡처
//  · 4인 모임을 장소 단계까지 시드
//  · "고기집 찾아줘!" 발화 → AI 검색·응답 과정을 프레임으로 녹화
//  · 산출물: public/feature-capture/ (스틸 PNG + frames/)
//  실행:  node capture-feature.mjs
// ─────────────────────────────────────────────────────────────
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "public", "feature-capture");
const FRAMES = path.join(OUT, "frames");
fs.mkdirSync(FRAMES, { recursive: true });

async function api(body) {
  const r = await fetch(`${BASE}/api/meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const getState = async (code) => (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) 장소 단계까지 시드 ──
const d = await api({ action: "create", name: "금요일 저녁 번개", password: "1", headcount: 4, leaderName: "지훈" });
const code = d.code;
const ids = { 지훈: d.participantId };
for (const n of ["유나", "민수", "서연"]) {
  ids[n] = (await api({ action: "join", code, password: "1", name: n })).participantId;
}
const origins = { 지훈: "강남역", 유나: "홍대입구", 민수: "잠실", 서연: "사당" };
for (const [n, o] of Object.entries(origins)) {
  await api({ action: "origin", code, participantId: ids[n], origin: o, transport: n === "민수" ? "car" : "transit" });
}
await api({ action: "openChat", code, participantId: ids.지훈 });
let st = await getState(code);
await api({ action: "confirmManual", code, participantId: ids.지훈, target: "region", id: st.regions[0].id });
st = await getState(code);
console.log(`시드 완료: ${code} · 지역 ${st.winnerRegion.name} · 초기 후보 ${st.places.length}개`);

// ── 2) 브라우저 열기 (민수 시점) ──
const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 880, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
const identList = Object.entries(ids).map(([name, id]) => ({ id, name, isLeader: name === "지훈" }));
await page.evaluate(
  (c, list, active) => {
    localStorage.setItem(`moimer:${c}`, JSON.stringify(list));
    localStorage.setItem(`moimer:${c}:active`, active);
  },
  code, identList, ids.민수
);
await page.goto(`${BASE}/m/${code}`, { waitUntil: "networkidle2" });
await sleep(1500);
// 후보 카드 + 채팅이 함께 보이도록 스크롤
await page.evaluate(() => document.querySelector(".chatlog")?.scrollIntoView({ block: "center" }));
await sleep(600);

// ── 프레임 녹화기 ──
let rec = true, fi = 0;
const recorder = (async () => {
  while (rec) {
    try {
      await page.screenshot({ path: path.join(FRAMES, `f${String(fi++).padStart(4, "0")}.png`) });
    } catch {}
    await sleep(500);
  }
})();
const still = (name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });

// ── 3) 스틸 ①: 검색 전 (후보 5개, 고기집 없음) ──
await still("01-검색전-후보5개.png");

// ── 4) 민수가 채팅 입력: "고기집 찾아줘!" ──
const input = await page.$('input[placeholder^="편하게"]');
await input.click();
await input.type("우리 고기 먹자! 고기집 찾아줘 🥩", { delay: 60 });
await sleep(400);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "전송")?.click();
});
console.log("발화 전송 — AI 검색 대기…");

// ── 5) 스틸 ②: AI 생각 중 표시 ──
try {
  await page.waitForSelector(".aithink", { timeout: 15000 });
  await sleep(300);
  await still("02-AI생각중.png");
} catch { console.log("(생각중 표시를 못 잡음 — 응답이 빨랐을 수 있음)"); }

// ── 6) 후보가 늘어날 때까지 대기 (최대 60초) ──
const t0 = Date.now();
let grown = false;
while (Date.now() - t0 < 60000) {
  const n = await page.evaluate(() => document.querySelectorAll(".candmini .cc").length);
  const busy = await page.evaluate(() => !!document.querySelector(".aithink"));
  if (n > 5 && !busy) { grown = true; break; }
  await sleep(1000);
}
await sleep(1200);
await page.evaluate(() => document.querySelector(".chatlog")?.scrollIntoView({ block: "center" }));
await sleep(400);

// ── 7) 스틸 ③: AI 응답 + 후보 8개 ──
await still("03-검색후-후보8개-AI응답.png");
const finalSt = await getState(code);
console.log(`후보: 5 → ${finalSt.places.length}개 (${grown ? "증가 확인 ✅" : "⚠ 증가 미확인"})`);
console.log("추가된 가게:", finalSt.places.slice(4).map((p) => `${p.name}(${p.category})`).join(", "));

// 녹화 종료
await sleep(1500);
rec = false;
await recorder;

// ── 8) 스틸 ④: 이전 테스트(3FCXV3)의 결과 화면 — 검색된 가게로 확정된 모습 ──
try {
  await page.goto(`${BASE}/m/3FCXV3`, { waitUntil: "networkidle2" });
  await sleep(1500);
  await still("04-검색가게로-최종확정-결과화면.png");
} catch { console.log("(3FCXV3 결과 화면 캡처 생략)"); }

await browser.close();
console.log(`완료 — 프레임 ${fi}장, 출력: ${OUT}`);
