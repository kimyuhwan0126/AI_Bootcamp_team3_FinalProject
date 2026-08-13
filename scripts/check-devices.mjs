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
// ── 서버가 떠 있는지 먼저 본다 ────────────────────────────────
//  없으면 playwright 가 ERR_CONNECTION_REFUSED 스택을 토한다 — 팀원이
//  "스크립트가 깨졌다"고 읽는다. 무엇을 해야 하는지 한 줄로 말해준다.
try {
  const r = await fetch(`${BASE}/api/status`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.log(`\n\x1b[31m❌ 서버에 붙지 못했습니다 — ${BASE}\x1b[0m`);
  console.log("\x1b[2m   다른 터미널에서 먼저 서버를 띄우세요:\x1b[0m");
  console.log("\x1b[2m     npm run dev        (또는 npm run dev:lan)\x1b[0m");
  console.log("\x1b[2m   '✓ Ready' 가 뜬 뒤 이 명령을 다시 실행하세요.\x1b[0m\n");
  process.exit(1);
}

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
// ⚠️ 링크를 열자마자 폼으로 막지 않는다 (멘토링 8/6 §2 — `FLAGS.joinGate` 기본 꺼짐).
//    먼저 모임을 구경하다가 **지도를 누르는 순간** 이름·출발지 모달이 뜨고,
//    참여와 핑이 한 번에 끝난다. 여기서 그 순서를 그대로 밟는다.
let viaMapCount = 0;
for (const [i, m] of mates.entries()) {
  const d = await device(m.name);
  devs.push(d);
  await d.page.goto(link);                       // 단톡방 링크를 탭한 그 상태
  await d.page.getByText("구경 중이에요").waitFor({ timeout: 15000 });
  // 지도를 눌러 참여를 연다. 위쪽을 누른다 — 아래 1/3 은 후보 칩이 깔린다.
  const gbox = d.page.locator(".map").first();
  const gb = await gbox.boundingBox().catch(() => null);
  if (gb) {
    await gbox
      .click({ position: { x: gb.width * (0.3 + i * 0.15), y: gb.height * 0.3 }, timeout: 5000 })
      .catch(() => {});
    await d.page.waitForTimeout(400);
  }
  const viaMap = await d.page.getByPlaceholder("예: 김철수").isVisible().catch(() => false);
  // 지도가 안 눌린 기기(SDK 초기화 타이밍 등)는 버튼으로도 참여할 수 있어야 한다
  if (!viaMap) await d.page.getByRole("button", { name: "나도 참여" }).click({ timeout: 5000 });
  if (viaMap) viaMapCount++;
  await d.page.getByPlaceholder("예: 김철수").fill(m.who);
  await d.page.getByPlaceholder("예: 강남역").fill(m.from);
  await d.page.getByRole("button", { name: "참여하기" }).click();
  // ⚠️ '참여자 현황'을 기다리면 안 된다 — **구경 중일 때 이미 보인다.** 그래서
  //    참여가 끝나기 전에 다음 줄로 넘어가고, 마지막 기기의 핑이 서버에 닿기 전에
  //    상태를 읽어 "3대 중 2대만 찍혔다"는 유령 실패가 났다 (2026-08-10).
  //    참여가 실제로 끝난 신호는 헤더 배지가 '구경 중' → '참가자' 로 바뀌는 것이다.
  await d.page.getByText("🙋 참가자").waitFor({ timeout: 15000 });
  // 핑이 같이 찍혔는지는 토스트가 말해 준다 — 실패했을 때 이유를 남긴다
  // (이게 없으면 "3대 중 2대만 찍혔다"는 결과만 보고 원인을 못 찾는다)
  const note = await d.page.locator(".toast, [role=status]").first().innerText().catch(() => "");
  ok(
    `${m.name} 초대 링크로 참여`,
    `${m.who} · ${m.from}${viaMap ? " · 지도 탭으로" : " · 버튼으로"}${note ? ` · “${note.trim().slice(0, 30)}”` : ""}`
  );
}

const st1 = await state(code);
check(st1.totalParticipants === 4, "4대 전원 참여", `${st1.totalParticipants}/4명`);
check(st1.originsSet === 4, "출발지 4건 저장", `${st1.originsSet}/4`);
// 멘토링 8/6 §2 — 지도를 눌러 참여한 기기는 **그 자리에 핑까지** 찍혀 있어야 한다.
//  (여기서 0이면 "먼저 구경 → 핑 → 모달" 순서가 화면에서 끊긴 것이다)
const joinPinged = new Set((st1.regions ?? []).flatMap((r) => r.contributors ?? [])).size;
check(
  viaMapCount === 3 && joinPinged === 3,
  "3대가 지도를 눌러 참여 — 참여와 핑이 한 번에",
  `지도 탭 ${viaMapCount}/3대 · 핑 ${joinPinged}명 · 후보 ${(st1.regions ?? []).length}개`
);

// ── 연동 ①: 남이 참여한 게 방장 화면에 새로고침 없이 뜨는가 ──
await d1.page.waitForTimeout(2500);
const seen = await d1.page.getByText("도윤").count();
check(seen > 0, "기기1 화면에 다른 기기 참여자가 떴다 (폴링)", "새로고침 없음");
await Promise.all(devs.map((d) => shot(d, "1-참여")));

// ── 연동 ②-0: 지도 핑 — **이 앱에서 가장 중요한 기능** (멘토링 8/6 §2) ──
//  2026-08-10 이전엔 서버가 후보를 자동으로 깔아서 이 단계가 없어도 투표가 됐다.
//  이제 후보는 사람이 찍어야 생긴다 → 4대가 각자 자기 화면에서 지도를 누른다.
//  (지도 SDK 가 못 뜬 기기도 폴백 지도를 눌러 핑을 찍을 수 있어야 한다)
const pingHits = [];
for (const [i, d] of devs.entries()) {
  const box = d.page.locator(".map").first();
  const b = await box.boundingBox().catch(() => null);
  if (!b) { pingHits.push(`${d.name}:지도없음`); continue; }
  // ⚠️ `page.mouse.click` 은 **뷰포트 좌표**다. 참여 폼을 지나온 기기는 화면이
  //    스크롤돼 있어 지도 아랫부분이 뷰포트 밖이고, 그 자리를 누르면 클릭이
  //    빗나간다 — 4대 중 2대가 이것 때문에 핑이 안 찍혔다(2026-08-10).
  //    `locator.click({position})` 은 요소 기준이고 스크롤도 알아서 맞춘다.
  // 기기마다 다른 자리를 눌러야 후보가 갈린다 (같은 동이면 서버가 병합한다)
  // ⚠️ **아래쪽 1/3 은 피한다.** 폴백 지도는 등록된 후보를 하단에 칩으로 깔아 두는데
  //    (z-index 6), 뒷 순서 기기일수록 칩이 늘어 그 자리를 누르면 핑이 아니라
  //    칩(=투표)을 누르게 된다 — 4번째 기기가 여기 막혔다(2026-08-10).
  const px = b.width * (0.2 + i * 0.18);
  const py = b.height * (0.22 + i * 0.06);
  // 실패했을 때 "무엇이 클릭을 먹었는지"를 남긴다 — 이게 없으면 원인을 찾는 데
  // 매번 별도 진단 스크립트를 새로 써야 한다 (실제로 세 번 그랬다).
  await box.click({ position: { x: px, y: py }, timeout: 5000 }).catch(() => {});
  await d.page.waitForTimeout(500);
  // 오등록 방지 확인 시트 — 뜨면 확정한다
  const confirmBtn = d.page.getByRole("button", { name: /여기로 등록/ });
  const sheet = await confirmBtn.isVisible().catch(() => false);
  const enabled = sheet ? await confirmBtn.isEnabled().catch(() => false) : false;
  await confirmBtn.click({ timeout: 3000 }).catch(() => {});
  await d.page.waitForTimeout(900);
  const toast = await d.page.locator(".toast, [role=status]").first().innerText().catch(() => "");
  pingHits.push(`${d.name}:시트=${sheet}/활성=${enabled}${toast ? `/“${toast.trim().slice(0, 22)}”` : ""}`);
}
const stPing = await state(code);
// ⚠️ "후보가 하나라도 생겼다"로 통과시키면 **절반이 실패해도 초록불**이다.
//    실제로 4대 중 2대만 등록되던 것을 이 검사로 잡았다 (2026-08-10).
const pingedIds = new Set((stPing.regions ?? []).flatMap((r) => r.contributors ?? []));
if (pingedIds.size !== 4) console.log(`\x1b[2m   핑 상세: ${pingHits.join(" · ")}\x1b[0m`);
check(
  pingedIds.size === 4,
  "4대가 각자 핑을 찍었다 (인원당 1개)",
  `${pingedIds.size}/4명 · 후보 ${(stPing.regions ?? []).length}개`
);
check(
  (stPing.regions ?? []).every((r) => (r.contributors?.length ?? 0) > 0),
  "후보가 전부 사람이 찍은 것 (자동 채움 없음)",
  (stPing.regions ?? []).map((r) => r.name).join(", ")
);
await Promise.all(devs.map((d) => shot(d, "1b-핑등록")));

// ── 연동 ②: 4대가 찍은 표가 서로의 화면에 보이는가 ──
//  ⚠️ 통합 모드(기본)에선 위 ②-0 의 **핑이 곧 표**다 (멘토링 8/6 §2) —
//     '투표 시작'도 별도 투표 동작도 없다. 그래서 여기서 확인할 것은
//     "내가 찍은 것이 남의 화면에 뜨는가"이고, 그건 이미 서버 상태로 확인했다.
//     화면 쪽은 **4/4명 표시**로 본다.
await d1.page.waitForTimeout(3000);
const st2 = await state(code);
const voters = new Set((st2.regions ?? []).flatMap((r) => r.contributors ?? [])).size;
check(voters === 4, "4대 각자 표(핑) · 유실 없음", `${voters}/4표`);

let moved = 0;
for (const d of devs.slice(1)) {
  const hit = await d.page.getByText(/4\/4명/).first().isVisible().catch(() => false);
  if (hit) moved++;
}
check(moved === 3, "남들이 찍은 표가 3대 화면에 전부 반영", `${moved}/3대`);

const banner = await d1.page.getByText(/4\/4명/).first().isVisible().catch(() => false);
check(banner, "방장 화면에 4/4명 표시");
await Promise.all(devs.map((d) => shot(d, "2-표집계")));

// ── 연동 ③: 방장이 확정 → 전원 다음 단계로 ────────────────────
//  통합 모드의 지역 확정 버튼은 "‘○○구’ 로 정하기" 다 (옛 문구는 '지금 확정').
await d1.page.getByRole("button", { name: /로 정하기|투표 종료 및 확정|지금 확정/ }).click();
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
