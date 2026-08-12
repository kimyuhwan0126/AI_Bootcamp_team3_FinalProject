// ─────────────────────────────────────────────────────────────
// scripts/demo-record.mjs — 시연영상 자동 촬영
//
//   npm run dev            # 터미널 1
//   npm run demo -- --yes  # 터미널 2
//
// 무엇이 나오나
//   demo/steps/NN-*.png    4대를 한 장에 붙인 장면 사진 (자막 포함) ← 이걸로 영상 만든다
//   demo/video/*.webm      기기별 원본 영상 4개 (ffmpeg 있으면 4분할 합성 가능)
//   demo/자막.txt          장면별 나레이션 원고
//
// ── `check-devices.mjs` 와 무엇이 다른가 ──────────────────────
//   저건 **검증**이라 최대한 빨리 돈다. 이건 **촬영**이라 사람이 따라올 속도로
//   천천히 돌고, 각 장면에서 4대를 동시에 찍어 한 장으로 붙인다.
//   흐름 자체는 같은 것을 밟는다 — 그래야 영상이 실제 동작과 어긋나지 않는다.
//
// ⚠️ 💰 이 스크립트는 **실제 외부 API 를 호출한다** (키가 설정돼 있을 때).
//    그래서 `--yes` 없이는 실행되지 않는다. 자세한 비용은 아래 안내 참조.
// ─────────────────────────────────────────────────────────────
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3000";
/** 장면 사이 기본 대기(ms). 느리게 찍고 싶으면 PACE=2500 처럼 올린다. */
const PACE = Number(process.env.PACE || 1400);

// ⚠️ 윈도우에서 `new URL(...).pathname` 은 `/C:/…` 를 준다 — `fileURLToPath` 를 쓴다
//    (2026-08-10 팀원 노트북 실측. check-devices.mjs 와 같은 이유)
const ROOT = fileURLToPath(new URL("../demo/", import.meta.url));
const STEPS = path.join(ROOT, "steps");
const VIDEO = path.join(ROOT, "video");

// ── 💰 비용 안내 — 승인 없이는 돌지 않는다 (CLAUDE.md §4) ──────
if (!process.argv.includes("--yes")) {
  console.log(`
\x1b[33m💰 [비용 발생 가능] 이 스크립트는 실제 외부 API 를 호출합니다.\x1b[0m

  4인 모임 1회 촬영 기준 예상 호출량
    · 카카오 로컬   약 10~20콜  (출발지 지오코딩 · 핑 스냅 · 지점 검색)
    · ODsay         약  4~8콜   (확정 시 참가자별 대중교통 경로)  ← 무료 1,000콜/일
    · TMAP          0콜         (이 시나리오는 전원 대중교통)
    · AI            0콜         (AI 버튼을 누르지 않습니다)

  여러 번 다시 찍으면 그만큼 늘어납니다. ODsay 하루 한도를 태우면
  이동시간이 추정값으로 떨어져 **실제보다 약 1.7배 길게** 나옵니다.

  키가 없는 상태(mock)로 리허설하려면 .env.local 을 비우고 돌리세요 — 0콜입니다.

\x1b[1m  진행하려면:  npm run demo -- --yes\x1b[0m
`);
  process.exit(1);
}

// ── 서버 확인 ─────────────────────────────────────────────────
let status;
try {
  const r = await fetch(`${BASE}/api/status`);
  if (!r.ok) throw new Error(String(r.status));
  status = await r.json();
} catch {
  console.log(`\n\x1b[31m❌ 서버에 붙지 못했습니다 — ${BASE}\x1b[0m`);
  console.log("\x1b[2m   다른 터미널에서 먼저:  npm run dev\x1b[0m\n");
  process.exit(1);
}

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(STEPS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
console.log(`\n🎬 시연영상 촬영 — ${BASE}`);
console.log(dim(`   키: 카카오 ${status.kakao ? "✔" : "✘"} · ODsay ${status.odsay ? "✔" : "✘"} · TMAP ${status.tmap ? "✔" : "✘"} · 저장소 ${status.store}`));
if (!status.kakao) console.log(dim("   ⚠ 카카오 키가 없어 지도가 회색으로 나오고 지명이 좌표로 뜹니다 (mock 리허설용)"));
console.log(dim(`   속도 PACE=${PACE}ms · 출력 ${ROOT}`));
console.log("─".repeat(60));

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
);

/** 기기 하나 = 독립 컨텍스트 (localStorage 분리 — 실제로 다른 폰이다) */
const PHONE = { width: 390, height: 844 };
async function device(label) {
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    locale: "ko-KR",
    recordVideo: { dir: VIDEO, size: PHONE },
  });
  await ctx.addInitScript(() => localStorage.setItem("moimer:v8:splash", "1"));
  const page = await ctx.newPage();
  return { label, ctx, page };
}

// ── 시연 시나리오 ────────────────────────────────────────────
//  **수도권 안에서 최대한 흩어지게** 잡았다. 넷이 다 서울 도심이면
//  "중간 지점을 찾는다"는 말이 와닿지 않는다 — 북서(일산) · 북동(노원) ·
//  남(수원) · 서(인천) 네 방향이라 중간이 어디인지 눈으로 안 보인다.
//  이동수단도 **대중교통 2 · 자차 2** 로 섞는다. 같은 목적지라도 수단에 따라
//  걸리는 시간이 달라지는 것이 이 앱이 계산하는 값이기 때문이다.
const CAST = {
  leader: { label: "유환", role: "방장", from: "일산", transport: "car" },
  mates: [
    { label: "지민", role: "참여자1", from: "노원", transport: "transit" },
    { label: "서연", role: "참여자2", from: "수원역", transport: "car" },
    { label: "도윤", role: "참여자3", from: "인천", transport: "transit" },
  ],
};
const TR = { transit: "대중교통", car: "자차" };
/** 폼에서 이동수단 버튼을 누른다. 기본값이 대중교통이라 자차일 때만 누르면 된다. */
const pickTransport = async (page, transport) => {
  if (transport !== "car") return;
  await page.getByRole("button", { name: /🚗 자차/ }).first().click({ timeout: 5000 }).catch(() => {});
};

const devs = [];
const narration = [];
let beatNo = 0;

/**
 * 한 장면을 남긴다 — 4대를 동시에 찍어 가로로 붙이고 자막을 얹는다.
 *
 * 합성은 **Playwright 로 한다.** 이미지 라이브러리(sharp 등)를 새로 깔면
 * 팀원 환경마다 설치 실패가 나므로, 이미 있는 브라우저에 HTML 을 그려 찍는다.
 */
async function beat(title, note = "") {
  beatNo++;
  await Promise.all(devs.map((d) => d.page.waitForTimeout(PACE)));

  const shots = await Promise.all(
    devs.map(async (d) => ({
      label: d.label,
      b64: (await d.page.screenshot()).toString("base64"),
    }))
  );

  const W = 380, H = 822, GAP = 16, BAR = 76;
  const total = {
    width: shots.length * W + (shots.length + 1) * GAP,
    height: BAR + H + GAP * 2 + 30,
  };
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:${total.width}px;height:${total.height}px;background:#0f1626;
      font-family:"Malgun Gothic","Noto Sans KR",-apple-system,sans-serif;color:#fff}
    .bar{height:${BAR}px;display:flex;align-items:center;gap:14px;padding:0 ${GAP}px}
    .no{font-size:15px;font-weight:800;color:#0f1626;background:#4d8bff;
      border-radius:8px;padding:5px 11px}
    .ti{font-size:24px;font-weight:800;letter-spacing:-.02em}
    .no2{font-size:14px;color:#9fb0cc;margin-left:auto;max-width:640px;text-align:right}
    .row{display:flex;gap:${GAP}px;padding:0 ${GAP}px}
    .ph{width:${W}px}
    .ph img{width:${W}px;height:${H}px;object-fit:cover;object-position:top;
      border-radius:14px;display:block;box-shadow:0 6px 24px rgba(0,0,0,.45)}
    .cap{text-align:center;font-size:13px;font-weight:700;color:#9fb0cc;padding-top:7px}
  </style>
  <div class="bar"><span class="no">${String(beatNo).padStart(2, "0")}</span>
    <span class="ti">${title}</span><span class="no2">${note}</span></div>
  <div class="row">${shots.map((s) => `<div class="ph">
    <img src="data:image/png;base64,${s.b64}"><div class="cap">${s.label}</div></div>`).join("")}</div>`;

  const ctx = await browser.newContext({ viewport: total, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(120);
  const safe = title.replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
  await page.screenshot({ path: path.join(STEPS, `${String(beatNo).padStart(2, "0")}-${safe}.png`) });
  await ctx.close();

  narration.push(`${String(beatNo).padStart(2, "0")}. ${title}\n    ${note}`);
  console.log(`  📸 ${String(beatNo).padStart(2, "0")} ${title}${note ? dim(` — ${note}`) : ""}`);
}

// ══ 시연 시작 ═══════════════════════════════════════════════════
const d1 = await device(`${CAST.leader.label} (${CAST.leader.role} · ${TR[CAST.leader.transport]})`);
devs.push(d1);

// ── ① 방장이 모임을 만든다 ────────────────────────────────────
await d1.page.goto(`${BASE}/meetings?open=create`);
await beat("모임 만들기", "방장이 이름과 날짜만 정합니다");

await d1.page.getByPlaceholder("예: 협성대 브레인파크 모임").fill("협성대 3팀 뒤풀이");
await d1.page.getByPlaceholder(/예: 유환/).fill(CAST.leader.label);
const when = new Date(Date.now() + 2 * 86400000);
const p2 = (x) => String(x).padStart(2, "0");
await d1.page.locator('input[type="datetime-local"]').fill(
  `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}T19:00`
);
await beat("모임 정보 입력", "확정 범위는 기본값 '지점까지' — 가게까지 정합니다");

await d1.page.getByRole("button", { name: "만들기", exact: true }).click();
await d1.page.getByText("초대 링크").waitFor({ timeout: 20000 });
await beat("초대 링크 발급", "이 링크를 단톡방에 붙여넣기만 하면 됩니다");

await d1.page.getByRole("button", { name: "모임으로 이동" }).click();
await d1.page.waitForURL(/\/m\//, { timeout: 20000 });
const code = d1.page.url().split("/m/")[1].split(/[?#]/)[0];
const link = `${BASE}/m/${code}`;
console.log(dim(`   모임 코드 ${code}`));

await d1.page.getByPlaceholder(/예: 강남역/).fill(CAST.leader.from);
await pickTransport(d1.page, CAST.leader.transport);
await d1.page.getByRole("button", { name: "출발지 등록" }).click();
await beat(
  `${CAST.leader.role} 출발지 등록`,
  `${CAST.leader.label} · ${CAST.leader.from} · ${TR[CAST.leader.transport]}`
);

// ── ② 친구 3명이 링크로 들어온다 ──────────────────────────────
for (const [i, m] of CAST.mates.entries()) {
  const d = await device(`${m.label} (${m.role} · ${TR[m.transport]})`);
  devs.push(d);
  await d.page.goto(link);
  await d.page.getByText("구경 중이에요").waitFor({ timeout: 20000 });

  // 지도를 누르면 참여 모달이 뜬다 — **참여와 핑이 한 번에** 끝난다
  const map = d.page.locator(".map").first();
  const b = await map.boundingBox().catch(() => null);
  if (b) {
    await map.click({ position: { x: b.width * (0.3 + i * 0.15), y: b.height * 0.3 }, timeout: 6000 }).catch(() => {});
    await d.page.waitForTimeout(500);
  }
  const viaMap = await d.page.getByPlaceholder("예: 김철수").isVisible().catch(() => false);
  if (!viaMap) await d.page.getByRole("button", { name: "나도 참여" }).click({ timeout: 6000 }).catch(() => {});
  await d.page.getByPlaceholder("예: 김철수").fill(m.label);
  await d.page.getByPlaceholder("예: 강남역").fill(m.from);
  await pickTransport(d.page, m.transport);
  await d.page.getByRole("button", { name: "참여하기" }).click();
  await d.page.getByText("🙋 참가자").waitFor({ timeout: 20000 }).catch(() => {});
  await beat(
    `${m.role} ${m.label} 참여`,
    `${m.from} · ${TR[m.transport]} · 지도를 누르니 참여와 후보 등록이 한 번에`
  );
}

await beat(
  "네 명이 모였습니다",
  `${[CAST.leader, ...CAST.mates].map((c) => `${c.label}(${c.from}·${TR[c.transport]})`).join(" · ")}`
);

// ── ③ 각자 만나고 싶은 곳에 핑을 찍는다 ───────────────────────
for (const [i, d] of devs.entries()) {
  const map = d.page.locator(".map").first();
  const b = await map.boundingBox().catch(() => null);
  if (!b) continue;
  // 아래 1/3 은 후보 칩이 깔려 클릭을 먹는다 — 위쪽만 누른다
  await map.click({
    position: { x: b.width * (0.2 + i * 0.18), y: b.height * (0.22 + i * 0.06) },
    timeout: 6000,
  }).catch(() => {});
  await d.page.waitForTimeout(600);
  await d.page.getByRole("button", { name: /여기로 등록/ }).click({ timeout: 4000 }).catch(() => {});
}
const stPing = await (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
await beat(
  "각자 원하는 곳에 핑",
  `핑 하나가 곧 후보이자 한 표입니다 · 후보 ${(stPing.regions ?? []).length}개`
);

// ── ④ 방장이 지역을 확정한다 ──────────────────────────────────
//  ⚠️ 실패를 조용히 삼키면 **확정 전 화면을 '지역 확정'이라 자막 붙여 찍는다.**
//     실제로 그랬다(첫 촬영). 화면으로 눌러 보고, 서버 상태로 확인하고,
//     그래도 안 됐으면 API 로 밀어 촬영은 끝까지 가게 한다.
const leaderPre = (await (await fetch(`${BASE}/api/meeting?code=${code}`)).json());
const leaderId = leaderPre.participants?.find((p) => p.isLeader)?.id;
try {
  await d1.page.getByRole("button", { name: /로 정하기|투표 종료 및 확정|지금 확정/ })
    .first().click({ timeout: 8000 });
} catch (e) {
  console.log(dim(`   ⚠ 확정 버튼 클릭 실패 — ${String(e).split("\n")[0]}`));
}
await Promise.all(devs.map((d) => d.page.waitForTimeout(4000)));
let st3 = await (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
if (!st3.winnerRegion) {
  console.log(dim("   ⚠ 화면 클릭으로 확정되지 않아 API 로 확정합니다 (촬영 계속)"));
  await fetch(`${BASE}/api/meeting`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirmManual", code, participantId: leaderId, target: "region", id: st3.regions?.[0]?.id }),
  });
  await Promise.all(devs.map((d) => d.page.waitForTimeout(4000)));
  st3 = await (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
}
await beat("지역 확정", `${st3.winnerRegion?.name ?? "(확정 실패)"} — 전원 화면이 다음 단계로 넘어갑니다`);

// ── ⑤ 지점 후보 등록 → 투표 ───────────────────────────────────
const poi = await (await fetch(`${BASE}/api/place-poi?code=${code}`)).json();
for (const p of (poi.items ?? []).slice(0, 3)) {
  await fetch(`${BASE}/api/meeting`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "addPlace", code, participantId: leaderId, name: p.name, category: p.category, lat: p.lat, lng: p.lng }),
  });
}
await Promise.all(devs.map((d) => d.page.waitForTimeout(2500)));
await beat("지점 후보 등록", "확정 지역 반경 700m 안에서만 찾습니다");

await fetch(`${BASE}/api/meeting`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "startVote", code, participantId: leaderId }),
});
await Promise.all(devs.map((d) => d.page.waitForTimeout(2500)));
await beat("투표 시작", "이 순간 후보가 잠깁니다 — 이후 추가·이동 불가");

for (const d of devs) {
  await d.page.getByRole("button", { name: "투표" }).first().click({ timeout: 5000 }).catch(() => {});
  await d.page.waitForTimeout(400);
}
await beat("네 명이 투표", "누가 몇 표인지 모두의 화면에 실시간으로 보입니다");

// ── ⑥ 최종 확정 → 결과 ───────────────────────────────────────
const st5 = await (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
await fetch(`${BASE}/api/meeting`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "confirmManual", code, participantId: leaderId, target: "place", id: st5.places?.[0]?.id }),
});
await Promise.all(devs.map((d) => d.page.waitForTimeout(4500)));
const st6 = await (await fetch(`${BASE}/api/meeting?code=${code}`)).json();
await beat("최종 확정", `${st6.winnerPlace?.name ?? "?"} — 모이는 일만 남았습니다`);

// 결과 화면 아래쪽(이동시간·신호등)까지 보여준다
for (const d of devs) await d.page.mouse.wheel(0, 700);
await beat("각자 얼마나 걸리나", "가장 빨리 오는 사람 대비 얼마나 더 걸리는지 색으로 보입니다");

// ── 정리 ─────────────────────────────────────────────────────
console.log("─".repeat(60));
for (const d of devs) await d.ctx.close();   // 영상은 컨텍스트를 닫아야 저장된다
await browser.close();

// 촬영본은 남기고 모임만 지운다
if (leaderId) {
  await fetch(`${BASE}/api/meeting`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "deleteMeeting", code, participantId: leaderId }),
  }).catch(() => {});
}

fs.writeFileSync(path.join(ROOT, "자막.txt"),
  `모이머 시연 — 장면별 나레이션 원고\n${"=".repeat(50)}\n\n${narration.join("\n\n")}\n`, "utf-8");

const steps = fs.readdirSync(STEPS);
const vids = fs.readdirSync(VIDEO);
console.log(`\x1b[32m✅ 촬영 완료\x1b[0m`);
console.log(`   장면 사진 ${steps.length}장 — ${STEPS}`);
console.log(`   기기별 영상 ${vids.length}개 — ${VIDEO}`);
console.log(`   나레이션 원고 — ${path.join(ROOT, "자막.txt")}\n`);
console.log(dim("영상으로 만들려면 (ffmpeg 필요):"));
console.log(dim(`  · 장면 사진 슬라이드쇼 (장면당 3초)`));
console.log(`     ffmpeg -framerate 1/3 -pattern_type glob -i "${STEPS}/*.png" -c:v libx264 -pix_fmt yuv420p -vf "scale=1600:-2" demo/시연.mp4`);
console.log(dim(`  · 기기별 영상 4분할 합성`));
console.log(`     ffmpeg -i 유환.webm -i 지민.webm -i 서연.webm -i 도윤.webm -filter_complex hstack=inputs=4 demo/4분할.mp4`);
console.log(dim("\nffmpeg 이 없으면 장면 사진을 파워포인트에 순서대로 넣고 '비디오로 내보내기' 해도 됩니다.\n"));
