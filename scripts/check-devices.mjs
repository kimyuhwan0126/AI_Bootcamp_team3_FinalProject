// ─────────────────────────────────────────────────────────────
// 4대 기기 실전 리허설 — 발표 당일 그대로 밟는다.
//
//   기기1 방장(노트북) 이 모임을 만들고 초대 링크를 뿌리면
//   기기2·3·4 가 그 링크로 들어와 각자 참여하고, 서로가 보이는지,
//   한쪽이 한 일이 다른 쪽 화면에 **새로고침 없이** 뜨는지 본다.
//
// 각 기기는 **독립된 브라우저 컨텍스트**다 — localStorage·쿠키가 서로 분리돼
// 실제로 다른 폰이다. 한 창에서 탭만 바꾸는 것과는 다르다.
// ─────────────────────────────────────────────────────────────
import { chromium } from "@playwright/test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3000";
// ⚠️ 윈도우에서 `new URL(...).pathname` 은 `/C:/…` 를 준다 — 그대로 쓰면
//    `C:\C:\…` 가 돼 mkdir 이 실패한다 (2026-08-10 팀원 노트북 실측).
const OUT = fileURLToPath(new URL("../test-results/devices/", import.meta.url));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const ok = (m, d = "") => console.log(`\x1b[32m✅ ${m}\x1b[0m${d ? `\x1b[2m — ${d}\x1b[0m` : ""}`);
const bad = (m, d = "") => { fail++; console.log(`\x1b[31m❌ ${m}\x1b[0m${d ? `\x1b[2m — ${d}\x1b[0m` : ""}`); };
const check = (pass, m, d = "") => (pass ? ok(m, d) : bad(m, d));
const state = async (code) => (await fetch(`${BASE}/api/meeting?code=${code}`)).json();

// 컨테이너/CI 마다 크로미움 경로가 다르다 — PW_CHROMIUM_PATH 로 알려줄 수 있다
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const errors = [];

/** 기기 하나 = 독립 컨텍스트 (localStorage 분리) */
async function device(name, width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: "ko-KR" });
  await ctx.addInitScript(() => localStorage.setItem("moimer:v8:splash", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  return { name, ctx, page };
}
const shot = async (d, tag) => d.page.screenshot({ path: `${OUT}${tag}-${d.name}.png` });

console.log(`\n📱 4대 기기 리허설 — ${BASE}\n${"─".repeat(56)}`);

// ── 기기1: 방장이 모임을 만든다 (화면으로) ────────────────────
const d1 = await device("1방장", 1280, 900);
await d1.page.goto(`${BASE}/meetings?open=create`);
await d1.page.getByPlaceholder("예: 협성대 브레인파크 모임").fill("협성대 3팀 뒤풀이");
await d1.page.getByPlaceholder(/예: 유환/).fill("유환");
const when = new Date(Date.now() + 2 * 86400000);
const p2 = (x) => String(x).padStart(2, "0");
await d1.page.locator('input[type="datetime-local"]').fill(
  `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}T19:00`
);
await d1.page.getByRole("button", { name: "만들기", exact: true }).click();
await d1.page.getByText("초대 링크").waitFor({ timeout: 15000 });

const invite = (await d1.page.locator("input").last().inputValue().catch(() => "")) ||
  (await d1.page.locator("code, .mono, input").allTextContents()).join(" ");
await d1.page.getByRole("button", { name: "모임으로 이동" }).click();
await d1.page.waitForURL(/\/m\//, { timeout: 15000 });
const code = d1.page.url().split("/m/")[1].split(/[?#]/)[0];
const link = `${BASE}/m/${code}`;
ok("기기1 모임 생성", `코드 ${code}`);
console.log(`   초대 링크: ${link}${invite.includes(code) ? "" : ""}`);

await d1.page.getByPlaceholder(/예: 강남역/).fill("강남역");
await d1.page.getByRole("button", { name: "출발지 등록" }).click();
await d1.page.waitForTimeout(2500);
check((await state(code)).originsSet === 1, "기기1 출발지 등록");

// ── 기기2·3·4: 초대 링크로 들어와 각자 참여 (전부 화면 조작) ──
const mates = [
  { name: "2지민", who: "지민", from: "홍대입구" },
  { name: "3서연", who: "서연", from: "잠실" },
  { name: "4도윤", who: "도윤", from: "사당" },
];
const devs = [d1];
for (const m of mates) {
  const d = await device(m.name);
  devs.push(d);
  await d.page.goto(link);                       // 단톡방 링크를 탭한 그 상태
  await d.page.getByText("모임 참여").waitFor({ timeout: 15000 });
  await d.page.getByPlaceholder("예: 김철수").fill(m.who);
  await d.page.getByPlaceholder("예: 강남역").fill(m.from);
  await d.page.getByRole("button", { name: "참여하기" }).click();
  await d.page.getByText("참여자 현황").waitFor({ timeout: 15000 });
  ok(`${m.name} 초대 링크로 참여`, `${m.who} · ${m.from}`);
}

const st1 = await state(code);
check(st1.totalParticipants === 4, "4대 전원 참여", `${st1.totalParticipants}/4명`);
check(st1.originsSet === 4, "출발지 4건 저장", `${st1.originsSet}/4`);

// ── 연동 ①: 남이 참여한 게 방장 화면에 새로고침 없이 뜨는가 ──
await d1.page.waitForTimeout(2500);
const seen = await d1.page.getByText("도윤").count();
check(seen > 0, "기기1 화면에 다른 기기 참여자가 떴다 (폴링)", "새로고침 없음");
await Promise.all(devs.map((d) => shot(d, "1-참여")));

// ── 연동 ②: 방장이 투표를 시작하면 전원 화면이 따라 넘어가는가 ──
await d1.page.getByRole("button", { name: /투표 시작/ }).click();
await d1.page.waitForTimeout(3000);
let moved = 0;
for (const d of devs.slice(1)) {
  const hit = await d.page.getByText(/명 투표/).first().isVisible().catch(() => false);
  if (hit) moved++;
}
check(moved === 3, "방장이 넘긴 단계가 3대에 전부 반영", `${moved}/3대`);
await Promise.all(devs.map((d) => shot(d, "2-투표시작")));

// ── 연동 ③: 4대가 각자 자기 화면에서 투표 → 표가 서로 보이는가 ──
const regions = (await state(code)).regions;
for (const [i, d] of devs.entries()) {
  const target = regions[i % regions.length].name;
  const btn = d.page.getByRole("button", { name: "투표" }).nth(i % regions.length);
  await btn.click().catch(async () => {
    await d.page.getByText(target).first().click();
  });
  await d.page.waitForTimeout(400);
}
await d1.page.waitForTimeout(3000);
const st2 = await state(code);
const votes = Object.keys(st2.regionVotes ?? {}).length;
check(votes === 4, "4대 각자 투표 · 표 유실 없음", `${votes}/4표`);

const banner = await d1.page.getByText(/4\/4명/).first().isVisible().catch(() => false);
check(banner, "방장 화면에 4/4명 투표 완료 표시");
await Promise.all(devs.map((d) => shot(d, "3-투표완료")));

// ── 연동 ④: 방장이 확정 → 전원 다음 단계로 ────────────────────
await d1.page.getByRole("button", { name: /투표 종료 및 확정|지금 확정/ }).click();
await d1.page.waitForTimeout(3500);
for (const d of devs) await d.page.waitForTimeout(1200);
const st3 = await state(code);
check(!!st3.winnerRegion, "지역 확정", st3.winnerRegion?.name);
check(st3.radiusM === 700, "지점 반경 700m 초기화");

// 확정 후 각 기기가 최신 상태를 받을 시간을 준다 (폴링 1.8초)
await Promise.all(devs.map((d) => d.page.waitForTimeout(4000)));
let followed = 0;
for (const d of devs.slice(1)) {
  const hit = await d.page.getByText(/지점 후보 등록|에서 어디로/).first().isVisible().catch(() => false);
  if (hit) followed++;
}
check(followed === 3, "확정이 3대 화면에 전부 반영", `${followed}/3대`);
await Promise.all(devs.map((d) => shot(d, "4-지역확정")));

const st4 = await state(code);   // 확정 직후가 아니라 **지금** 상태를 본다
const etas = (st4.winnerRegion?.perParticipant ?? []).length;
console.log("   winner:", st4.winnerRegion?.name, "· perParticipant:",
  (st4.winnerRegion?.perParticipant ?? []).map((x) => x.name).join(",") || "(없음)");
check(etas === 4, "확정 지역에 4명 이동시간이 전부 채워졌다", `${etas}/4명`);
const noEta = await devs[2].page.getByText("이동시간 없음").count();
check(noEta === 0, "참여자 화면에 '이동시간 없음' 이 남지 않았다", `${noEta}건`);

// ── 정리 ──────────────────────────────────────────────────────
await fetch(`${BASE}/api/meeting`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "deleteMeeting", code, participantId: st3.participants.find((p) => p.isLeader).id }),
});

console.log("─".repeat(56));
console.log(errors.length ? `\x1b[31m❌ 콘솔 에러 ${errors.length}건\x1b[0m\n${errors.join("\n")}`
                          : "\x1b[32m✅ 4대 전부 콘솔 에러 없음\x1b[0m");
console.log(fail === 0 ? "\x1b[32m✅ 기기 간 연동 전부 정상\x1b[0m\n" : `\x1b[31m❌ ${fail}건 실패\x1b[0m\n`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
