// ─────────────────────────────────────────────────────────────
// scripts/check-live.mjs — 실 환경 점검 (DB · 외부 API · 4인 동시성)
//
//   npm run check:live        # 서버가 떠 있어야 한다 (npm run dev)
//
// 왜 필요한가
//   `npm run verify` 는 **빌드 결과물 + 테스트**를 본다. 하지만 "지금 이 노트북의
//   `.env.local` 로 Neon 과 카카오·ODsay 가 실제로 붙는가"는 따로 봐야 한다 —
//   특히 발표 당일 아침, 네트워크가 바뀐 뒤에.
//
//   이 스크립트는 **실제로 모임을 하나 만들어** 4명을 넣고 동시 투표까지 시켜본다.
//   그래서 "쓰기가 진짜 되는지"를 조회가 아니라 **왕복**으로 확인한다.
//
// ⚠️ 💰 외부 API 를 실제로 호출한다 (카카오 로컬 · ODsay/TMAP 몇 콜).
//    ODsay 무료 한도는 1,000콜/일이다. 하루에 몇 번 돌리는 정도는 문제없지만
//    반복 실행으로 태우지 않는다.
// ⚠️ DB 에 테스트 모임이 하나 생긴다. 끝나면 **스스로 지운다**(방장 권한 삭제).
// ─────────────────────────────────────────────────────────────
const BASE = process.env.CHECK_BASE || "http://localhost:3000";

const ok = (s) => `\x1b[32m✅ ${s}\x1b[0m`;
const bad = (s) => `\x1b[31m❌ ${s}\x1b[0m`;
const warn = (s) => `\x1b[33m⚠️  ${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
function check(pass, label, detail = "") {
  if (pass) console.log(ok(label) + (detail ? dim(` — ${detail}`) : ""));
  else { failures++; console.log(bad(label) + (detail ? dim(` — ${detail}`) : "")); }
}

async function api(body) {
  const r = await fetch(`${BASE}/api/meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { okHttp: r.ok, status: r.status, json };
}
const state = async (code) => (await fetch(`${BASE}/api/meeting?code=${code}`)).json();

console.log(`\n🔍 모이머 실 환경 점검 — ${BASE}\n${"─".repeat(52)}`);

// ── 1. 서버 · 설정 ───────────────────────────────────────────
let status;
try {
  status = await (await fetch(`${BASE}/api/status`)).json();
} catch {
  console.log(bad(`서버에 붙지 못했습니다 — ${BASE}`));
  console.log(dim("   먼저 다른 터미널에서 `npm run dev` 를 띄우세요."));
  process.exit(1);
}
console.log("\n[1] 설정 상태");
check(status.db?.configured, "DATABASE_URL 설정됨", status.db?.configured ? "" : "인메모리로 동작 — 서버 재시작 시 데이터 소멸");
check(status.db?.ready, "Neon 연결", status.db?.ready ? status.store : "db/schema.sql 을 SQL Editor 에서 실행했는지 확인");
check(status.kakao, "카카오 REST 키");
check(status.kakaoJs, "카카오 JS 키 (지도)");
if (!status.odsay) console.log(warn("ODsay 키 없음 — 대중교통 시간이 '거리 추정'으로 나옵니다"));
else console.log(ok("ODsay 키"));
if (!status.tmap) console.log(warn("TMAP 키 없음 — 자차 시간이 '거리 추정'으로 나옵니다"));
else console.log(ok("TMAP 키"));

// 카카오 Redirect 포트가 dev 포트와 맞는지 — 어긋나면 로그인이 거부된다
const port = new URL(BASE).port || "80";
const redirectOk = String(status.kakaoRedirect || "").includes(`:${port}`);
check(redirectOk, "카카오 Redirect URI 포트 일치", status.kakaoRedirect);
if (!redirectOk) console.log(dim(`   → .env.local 의 KAKAO_REDIRECT_URI 를 ${BASE}/api/auth/kakao/callback 로`));

if (status.ai?.ok) console.log(ok(`AI 서버 (${status.ai.model})`) + dim(` — ${status.ai.url}`));
else console.log(warn("AI 서버 미연결 — AI 추천 버튼이 실패합니다"));

// ── 2. 왕복: 모임 생성 → 4인 → 동시 투표 → 확정 → 삭제 ──────
console.log("\n[2] 쓰기 왕복 (모임 생성 → 4인 → 동시 투표 → 확정)");
let code = null;
try {
  const created = await api({
    action: "create", name: `점검 ${new Date().toISOString().slice(11, 19)}`,
    leaderName: "점검방장", scope: "place", purposeCategory: "food",
    meetTime: new Date(Date.now() + 86400000).toISOString(),
  });
  check(created.okHttp, "모임 생성", created.okHttp ? created.json.code : JSON.stringify(created.json));
  if (!created.okHttp) throw new Error("생성 실패");
  code = created.json.code;
  const ids = [created.json.participantId];

  const st0 = await state(code);
  check(!!st0.meetTime, "모임 시간 저장 (D-day·신호등 기준)");

  await api({ action: "origin", code, participantId: ids[0], origin: "강남역", transport: "transit" });
  for (const [i, o] of ["홍대입구", "잠실", "사당"].entries()) {
    const j = await api({ action: "join", code, name: `점검${i + 2}` });
    if (!j.okHttp) { check(false, "참여", JSON.stringify(j.json)); break; }
    ids.push(j.json.participantId);
    await api({ action: "origin", code, participantId: j.json.participantId, origin: o, transport: "transit" });
  }
  const st1 = await state(code);
  check(st1.totalParticipants === 4, "4인 참여", `${st1.totalParticipants}/4명`);
  check(st1.originsSet === 4, "출발지 4건 저장", `${st1.originsSet}/4`);

  const reg = await api({ action: "regions", code });
  const regions = reg.json.regions ?? [];
  check(regions.length > 0, "중간지점 후보 계산", `${regions.length}곳`);
  // 실 API 로 계산됐는지 — 전부 추정이면 키가 안 먹은 것이다
  const real = regions[0]?.perParticipant?.filter((x) => x.real === true).length ?? 0;
  const total = regions[0]?.perParticipant?.length ?? 0;
  if (total > 0) {
    if (real === total) console.log(ok(`이동시간 실 API (${real}/${total}명 경로 기준)`));
    else console.log(warn(`이동시간 일부 추정 (${real}/${total}명만 경로 기준)`));
  }

  await api({ action: "startVote", code, participantId: ids[0] });
  // ⚠️ 동시에 — 순서대로가 아니라. 표 유실은 여기서만 재현된다.
  await Promise.all(
    ids.map((pid, i) =>
      api({ action: "vote", code, participantId: pid, target: "region", candidateId: regions[i % regions.length].id })
    )
  );
  const st2 = await state(code);
  const votes = Object.keys(st2.regionVotes ?? {}).length;
  check(votes === 4, "4인 동시 투표 (표 유실 없음)", `${votes}/4표`);

  await api({ action: "confirmManual", code, participantId: ids[0], target: "region", id: regions[0].id });
  const st3 = await state(code);
  check(!!st3.winnerRegion, "지역 확정", st3.winnerRegion?.name);
  check(st3.radiusM === 700, "지점 반경 700m 초기화");

  const poi = await (await fetch(`${BASE}/api/place-poi?code=${code}`)).json();
  check((poi.items?.length ?? 0) > 0, "반경 내 POI 조회", `${poi.items?.length ?? 0}곳 · ${poi.mock ? "mock" : "카카오 실데이터"}`);
} catch (e) {
  check(false, "왕복 점검 중단", e instanceof Error ? e.message : String(e));
} finally {
  // 테스트 모임은 남기지 않는다
  if (code) {
    const st = await state(code).catch(() => null);
    const leader = st?.participants?.find((p) => p.isLeader);
    if (leader) await api({ action: "deleteMeeting", code, participantId: leader.id });
    console.log(dim(`\n   (점검용 모임 ${code} 삭제)`));
  }
}

console.log("─".repeat(52));
if (failures === 0) {
  console.log(ok("전부 정상 — 발표 준비 상태입니다\n"));
} else {
  console.log(bad(`${failures}건 실패 — 위 항목을 확인하세요\n`));
  process.exit(1);
}
