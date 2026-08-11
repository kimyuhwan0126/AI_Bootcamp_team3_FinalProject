// ─────────────────────────────────────────────────────────────
// scripts/check-station-snap.mjs — **역 스냅을 실 키로 확인한다**
//
//   npm run check:station        # 서버가 떠 있어야 한다 (npm run dev)
//
// 왜 따로 있는가
//   `FLAGS.pingSnapStation` 이 진짜로 하려는 일은 **같은 역을 찍은 사람들을 한
//   후보로 모으는 것**이다. 그런데 그 판정은 **이름 문자열 일치**로 이뤄지고
//   (`lib/store.ts` `addRegionCandidate`), 카카오 SW8 은 같은 역을 노선마다
//   따로 준다 — `사당역 2호선` · `사당역 4호선`.
//
//   그래서 `lib/station-snap.ts` 의 `normalizeStationName` 이 노선 꼬리를 뗀다.
//   **이 함수가 틀리면 기능이 정반대로 동작한다** — 표를 모으려다 쪼갠다.
//
//   그런데 CI 에는 카카오 키가 없다. 키가 없으면 거점 좌표표(이름이 이미 깨끗한)로
//   떨어지므로, **정규화가 틀려도 모든 테스트가 초록으로 통과한다.**
//   즉 이 계약은 **키가 있는 기계에서만** 검증할 수 있다. 그게 이 스크립트다.
//
// 무엇을 보는가
//   ① 역 이름에 노선 꼬리가 안 붙는가          (`사당` 이지 `사당역 2호선` 이 아님)
//   ② 같은 역 양쪽을 찍은 두 사람이 **한 후보**로 합쳐지는가  ← 핵심
//   ③ 후보 좌표가 **역 위로** 옮겨지는가        (찍은 자리 그대로가 아님)
//   ④ 역이 없는 동네는 억지로 스냅하지 않는가    (시·군·구로 떨어짐)
//
// ⚠️ 💰 외부 API 를 실제로 호출한다 — 카카오 로컬 **3콜 안팎**(핑마다 1콜,
//    같은 110m 격자는 30일 캐시라 재실행은 더 적다) + 이동시간 몇 콜.
//    ODsay 무료 한도는 1,000콜/일이다. 반복 실행으로 태우지 않는다.
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
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * 사당역 — `lib/geo.ts` 의 `HUBS` 에 있는 좌표를 그대로 쓴다.
 * (여기서 좌표를 새로 지어내지 않는다 — 저장소가 이미 들고 있는 값이다)
 */
const SADANG = { lat: 37.4765, lng: 126.9816 };
/** 역 양옆 약 200m — 둘 다 스냅 반경(1.2km) 안이라 **같은 역**으로 모여야 한다 */
const WEST = { lat: SADANG.lat + 0.0009, lng: SADANG.lng - 0.0022 };
const EAST = { lat: SADANG.lat - 0.0010, lng: SADANG.lng + 0.0024 };
/** 협성대(봉담) 근처 — 지하철역이 없는 동네. 억지 스냅이 없어야 한다 */
const BONGDAM = { lat: 37.2119, lng: 126.9702 };

console.log(`\n🚇 역 스냅 점검 — ${BASE}\n${"─".repeat(52)}`);

// ── 0. 전제 확인 ─────────────────────────────────────────────
let st0;
try {
  st0 = await (await fetch(`${BASE}/api/status`)).json();
} catch {
  console.log(bad(`서버에 붙지 못했습니다 — ${BASE}`));
  console.log(dim("   다른 터미널에서 먼저: npm run dev"));
  process.exit(1);
}

if (!st0?.flags?.pingSnapStation) {
  console.log(warn("역 스냅이 꺼져 있습니다 — 이 점검은 켜야 의미가 있습니다."));
  console.log(dim("   .env.local 에 아래 한 줄을 넣고 dev 서버를 껐다 켜세요:"));
  console.log(dim("     NEXT_PUBLIC_FF_PING_SNAP_STATION=1"));
  process.exit(1);
}
check(true, "역 스냅 켜짐", "flags.pingSnapStation = true");
if (!st0.kakao) {
  console.log(warn("카카오 REST 키가 없습니다 — 거점 좌표표(폴백)만 확인됩니다."));
  console.log(dim("   이 점검의 목적(카카오가 주는 실제 역 이름)은 키가 있어야 봅니다."));
}
console.log(dim(`   store: ${st0.store} · kakao: ${st0.kakao} · odsay: ${st0.odsay}`));

// ── 1. 모임 + 2명 ────────────────────────────────────────────
const created = await api({
  action: "create",
  name: `역스냅 점검 ${new Date().toISOString().slice(11, 19)}`,
  leaderName: "점검방장",
  scope: "place",
  purposeCategory: "food",
});
if (!created.okHttp) {
  console.log(bad("모임 생성 실패"), created.json);
  process.exit(1);
}
const code = created.json.code;
const leader = created.json.participantId;
await api({ action: "origin", code, participantId: leader, origin: "강남역", transport: "transit" });

const mate = await api({ action: "join", code, name: "점검동행" });
const mateId = mate.json.participantId;
await api({ action: "origin", code, participantId: mateId, origin: "사당", transport: "transit" });
check(!!code && !!mateId, "모임 + 2명 준비", `코드 ${code}`);

// ── 2. 같은 역 **양쪽**을 각자 한 번씩 ─────────────────────────
const p1 = await api({ action: "addRegion", code, participantId: leader, ...WEST });
const p2 = await api({ action: "addRegion", code, participantId: mateId, ...EAST });
if (!p1.okHttp || !p2.okHttp) {
  console.log(bad("핑 등록 실패"), p1.json, p2.json);
}
const n1 = p1.json?.candidate?.name;
const n2 = p2.json?.candidate?.name;
console.log(dim(`   서쪽 ${round(WEST.lat)},${round(WEST.lng)} → “${n1}”`));
console.log(dim(`   동쪽 ${round(EAST.lat)},${round(EAST.lng)} → “${n2}”`));

// ① 노선 꼬리가 안 붙는가
const hasLineTail = (s) => /\s(\S*(호선|선|철도))$/.test(String(s || ""));
check(
  !hasLineTail(n1) && !hasLineTail(n2),
  "① 역 이름에 노선 꼬리가 안 붙는다",
  hasLineTail(n1) || hasLineTail(n2)
    ? `“${n1}” / “${n2}” ← normalizeStationName 이 못 뗐다`
    : `“${n1}”`
);

// ② 두 사람이 한 후보로 합쳐지는가  ← 이 스크립트의 존재 이유
const st = await state(code);
const regions = st.regions ?? [];
const merged = regions.length === 1 && (regions[0].contributors ?? []).length === 2;
check(
  merged,
  "② 같은 역을 찍은 두 사람이 한 후보로 합쳐진다",
  merged
    ? `“${regions[0].name}” · 2명`
    : `후보 ${regions.length}개 — ${regions.map((r) => `“${r.name}”(${(r.contributors ?? []).length}명)`).join(" / ")}`
);
if (!merged && regions.length > 1) {
  console.log(warn("표가 갈렸습니다. 위 두 이름을 그대로 알려주세요 — 정규화 규칙을 고쳐야 합니다."));
}

// ③ 후보 좌표가 역 위로 옮겨졌는가 (찍은 자리 그대로가 아님)
if (regions[0]) {
  const movedFromWest =
    Math.abs(regions[0].lat - WEST.lat) > 1e-6 || Math.abs(regions[0].lng - WEST.lng) > 1e-6;
  check(
    movedFromWest,
    "③ 후보 좌표가 찍은 자리가 아니라 역 위로 옮겨졌다",
    `${round(regions[0].lat)}, ${round(regions[0].lng)}`
  );
}

// ── 3. 역이 없는 동네는 억지로 스냅하지 않는가 ─────────────────
const third = await api({ action: "join", code, name: "점검봉담" });
const thirdId = third.json.participantId;
await api({ action: "origin", code, participantId: thirdId, origin: "수원역", transport: "transit" });
const p3 = await api({ action: "addRegion", code, participantId: thirdId, ...BONGDAM });
const n3 = p3.json?.candidate?.name;
console.log(dim(`   봉담 ${round(BONGDAM.lat)},${round(BONGDAM.lng)} → “${n3}”`));
check(
  !!n3 && !/역$/.test(String(n3)),
  "④ 역이 없는 동네는 역으로 스냅하지 않는다",
  `“${n3}” ${st0.kakao ? "(시·군·구로 떨어져야 정상)" : "(키가 없으면 좌표 이름)"}`
);

// ── 4. 뒷정리 — 테스트 모임을 지운다 ──────────────────────────
const del = await api({ action: "deleteMeeting", code, participantId: leader });
check(del.okHttp, "테스트 모임 삭제 (DB 에 쓰레기를 남기지 않는다)", code);

console.log("─".repeat(52));
if (failures === 0) {
  console.log(ok("역 스냅 계약 전부 통과 — 키가 있는 기계에서만 확인 가능한 부분입니다."));
} else {
  console.log(bad(`${failures}건 실패 — 위 상세를 그대로 공유해 주세요.`));
}
process.exit(failures === 0 ? 0 : 1);
