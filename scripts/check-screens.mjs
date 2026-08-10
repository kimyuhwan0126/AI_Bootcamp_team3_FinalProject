// ─────────────────────────────────────────────────────────────
// scripts/check-screens.mjs — 모든 화면 · 모든 단계를 열어 런타임 에러를 훑는다.
//
//   npm run dev        # 터미널 1
//   npm run check:screens
//
// 왜 필요한가
//   `npm run verify` 의 스모크는 **핵심 경로**만 본다. 그런데 실제로 터지는 건
//   "그 화면에서 이 버튼을 눌렀을 때" 다 — 하이드레이션 불일치, 단계가 안 맞는
//   버튼(눌리는 것처럼 보이는데 서버가 400 을 주는 것) 같은 것들.
//   여기서는 화면마다 버튼을 눌러 보며 pageerror·console.error 를 모은다.
//
// ⚠️ 💰 외부 API 를 호출하지 않는 조작만 한다 (삭제·확정·투표 시작은 건너뛴다).
// ─────────────────────────────────────────────────────────────
import { chromium } from "@playwright/test";

const B = "http://localhost:3000";
const api = async (d) => (await fetch(`${B}/api/meeting`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
})).json();
const st = async (c) => (await fetch(`${B}/api/meeting?code=${c}`)).json();

// ── 서버가 떠 있는지 먼저 본다 ────────────────────────────────
//  없으면 playwright 가 ERR_CONNECTION_REFUSED 스택을 토한다 — 팀원이
//  "스크립트가 깨졌다"고 읽는다. 무엇을 해야 하는지 한 줄로 말해준다.
try {
  const r = await fetch(`${B}/api/status`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.log(`\n\x1b[31m❌ 서버에 붙지 못했습니다 — ${B}\x1b[0m`);
  console.log("\x1b[2m   다른 터미널에서 먼저 서버를 띄우세요:\x1b[0m");
  console.log("\x1b[2m     npm run dev        (또는 npm run dev:lan)\x1b[0m");
  console.log("\x1b[2m   '✓ Ready' 가 뜬 뒤 이 명령을 다시 실행하세요.\x1b[0m\n");
  process.exit(1);
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);
const found = [];

async function visit(label, url, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  await ctx.addInitScript(() => localStorage.setItem("moimer:v8:splash", "1"));
  if (seed) await ctx.addInitScript(seed.fn, seed.arg);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`💥 ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`🔴 ${m.text()}`); });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // 화면 안의 버튼을 눌러 보며 렌더 에러를 유도한다 (파괴적인 것은 뺀다)
  const skip = /삭제|강퇴|나가기|되돌리|확정|투표 시작|만들기|참여하기|점검 끝/;
  const btns = await page.getByRole("button").all();
  for (const b of btns.slice(0, 12)) {
    const t = (await b.innerText().catch(() => "")).trim();
    if (!t || skip.test(t)) continue;
    await b.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(500);
  if (errs.length) found.push(`\n[${label}] ${url}\n  ` + [...new Set(errs)].join("\n  "));
  else console.log(`✅ ${label}`);
  await ctx.close();
}

// ── 단계별 모임을 만들어 둔다 ────────────────────────────────
const c = await api({ action: "create", name: "훑기", leaderName: "유환", scope: "place", purposeCategory: "food" });
const code = c.code, L = c.participantId;
await api({ action: "origin", code, participantId: L, origin: "강남역", transport: "transit" });
const j = await api({ action: "join", code, name: "지민" });
await api({ action: "origin", code, participantId: j.participantId, origin: "홍대입구", transport: "transit" });
await api({ action: "regions", code });

const leaderSeed = (arg) => {
  localStorage.setItem(`moimer:${arg.c}`, JSON.stringify([{ id: arg.id, name: "유환", isLeader: true }]));
  localStorage.setItem(`moimer:${arg.c}:active`, arg.id);
};

await visit("홈", `${B}/`);
await visit("모임 탭", `${B}/meetings`);
await visit("모임 생성 폼", `${B}/meetings?open=create`);
await visit("내정보", `${B}/me`);
await visit("연결 점검", `${B}/health`);
await visit("초대 링크(신원 없음)", `${B}/m/${code}`);
await visit("⑥ 지역 후보 등록", `${B}/m/${code}`, { fn: leaderSeed, arg: { c: code, id: L } });

await api({ action: "startVote", code, participantId: L });
await visit("⑦ 지역 투표", `${B}/m/${code}`, { fn: leaderSeed, arg: { c: code, id: L } });

const s1 = await st(code);
await api({ action: "confirmManual", code, participantId: L, target: "region", id: s1.regions[0].id });
await visit("⑧ 지점 후보 등록", `${B}/m/${code}`, { fn: leaderSeed, arg: { c: code, id: L } });

const poi = await (await fetch(`${B}/api/place-poi?code=${code}`)).json();
const p0 = poi.items?.[0];
if (p0) await api({ action: "addPlace", code, participantId: L, name: p0.name, category: p0.category, lat: p0.lat, lng: p0.lng });
await api({ action: "startVote", code, participantId: L });
await visit("⑨ 지점 투표", `${B}/m/${code}`, { fn: leaderSeed, arg: { c: code, id: L } });

const s2 = await st(code);
if (s2.places?.[0]) await api({ action: "confirmManual", code, participantId: L, target: "place", id: s2.places[0].id });
await visit("⑩ 결과", `${B}/m/${code}`, { fn: leaderSeed, arg: { c: code, id: L } });

await api({ action: "deleteMeeting", code, participantId: L });
console.log(found.length ? `\n❌ 런타임 에러 ${found.length}개 화면:${found.join("")}` : "\n✅ 전 화면 런타임 에러 없음");
await browser.close();
process.exit(found.length ? 1 : 0);
