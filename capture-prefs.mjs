// prefs(선호 7종) 기능 스틸 캡처 — H2T3JS 모임 사용
import puppeteer from "puppeteer";
import path from "node:path";

const BASE = "http://localhost:3000";
const CODE = "H2T3JS";
const OUT = path.join(process.cwd(), "public", "feature-capture");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const st = await (await fetch(`${BASE}/api/meeting?code=${CODE}`)).json();
const leader = st.participants.find((p) => p.isLeader);

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 880, deviceScaleFactor: 2 });

// ① 채팅 화면 — 선호 칩 6종
await page.goto(`${BASE}/m/${CODE}`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.screenshot({ path: path.join(OUT, "05-선호칩-채팅화면.png"), fullPage: true });
console.log("① 채팅+선호칩 캡처 완료");

// ② 장소 확정 → 결과 화면 (일정 배지 + .ics 실일정)
if (st.stage === "chat" && st.aiPhase === "place") {
  const target = st.places.find((p) => p.reservable) ?? st.places[0];
  await fetch(`${BASE}/api/meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirmManual", code: CODE, participantId: leader.id, target: "place", id: target.id }),
  });
  console.log(`장소 확정: ${target.name}`);
}
await page.goto(`${BASE}/m/${CODE}`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.screenshot({ path: path.join(OUT, "06-결과-일정배지.png"), fullPage: true });
console.log("② 결과+일정배지 캡처 완료");

await browser.close();
