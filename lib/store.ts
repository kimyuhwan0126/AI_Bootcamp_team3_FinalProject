// ─────────────────────────────────────────────────────────────
// store.ts — 데이터 계층
//
//  · DATABASE_URL 이 있으면: Neon(Postgres)에 영속 저장 (db/schema.sql)
//  · 키가 없으면: 인메모리 (`npm run dev` 만으로 전체 플로우 시연 가능)
//
//  도메인 로직(누가 무엇을 바꿀 수 있는지, 단계 전환 규칙)은 Meeting 객체를
//  그대로 만지는 방식을 유지하고, 읽기/쓰기만 persistence.ts 를 거친다.
//
//  ⚠️ DB(Neon) 모드에서는 인메모리 캐시를 두지 않고 매 요청마다 DB에서 읽는다.
//     서버리스는 인스턴스가 여러 개라, 한 인스턴스가 캐시를 들고 있으면 다른
//     인스턴스가 쓴 투표·출발지가 1.8초 폴링에 계속 안 보인다.
// ─────────────────────────────────────────────────────────────
import type {
  Meeting,
  MeetingState,
  Participant,
  Transport,
  RegionCandidate,
  PlaceCandidate,
  ChatMsg,
  MeetingPrefs,
  MeetingScope,
  PurposeCategory,
} from "./types";
import { MAX_PARTICIPANTS, MAX_PIN_FAILS } from "./types";
import { geocode, recommendRegions, generatePlaces } from "./geo";
import { hasDb } from "./db";
import {
  loadMeeting,
  meetingExists,
  saveMeeting,
  upsertParticipant,
  upsertParticipants,
  setVote,
  clearVotes,
  deleteParticipantRow,
  deleteMeetingRow,
} from "./persistence";

type Result = { ok: boolean; error?: string };

/**
 * 모임 시간 정규화 — **과거 시간은 받지 않는다** (v16).
 *
 * 빈 값·해석 불가·과거면 `null`(= 미입력)로 떨어뜨린다.
 * 미입력이면 결과 화면에서 신호등이 잠기고 입력 유도 배너가 뜬다 (v7) —
 * 그러니 여기서 조용히 버려도 사용자가 모르고 지나가지 않는다.
 *
 * ⚠️ 이미 만들어진 모임이 시간이 지나 과거가 되는 건 정상이다(→ '지난 모임').
 *    이 함수는 **새로 입력하는 값**에만 쓴다.
 */
function normalizeMeetTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return null;
  if (t.getTime() < Date.now()) return null;
  return t.toISOString();
}

// HMR/serverless 재로드에도 살아남도록 globalThis에 보관.
// DATABASE_URL 미설정 시에는 이 Map 이 유일한 저장소가 된다.
const g = globalThis as unknown as {
  __moimer?: Map<string, Meeting>;
  __moimerAiBusy?: Map<string, boolean>;
};
const memMeetings: Map<string, Meeting> = g.__moimer ?? new Map();
if (!g.__moimer) g.__moimer = memMeetings;
// AI가 판단 중인 모임 표시 (UI: "AI 생각 중…"). 휘발성이라 DB에 두지 않는다.
const aiBusy: Map<string, boolean> = g.__moimerAiBusy ?? new Map();
if (!g.__moimerAiBusy) g.__moimerAiBusy = aiBusy;

// ── 읽기/쓰기 경계 ─────────────────────────────────────────────
async function read(code: string): Promise<Meeting | undefined> {
  const key = (code ?? "").toUpperCase();
  if (!key) return undefined;
  if (!hasDb) return memMeetings.get(key);
  return (await loadMeeting(key)) ?? undefined;
}

/** 모임 행(단계·후보·대화·선호·예약)을 저장. 인메모리 모드면 아무것도 안 한다. */
async function write(m: Meeting): Promise<void> {
  if (!hasDb) {
    memMeetings.set(m.code, m);
    return;
  }
  await saveMeeting(m);
}

async function writeParticipant(m: Meeting, p: Participant): Promise<void> {
  if (!hasDb) {
    memMeetings.set(m.code, m);
    return;
  }
  await upsertParticipant(m.code, p);
}

async function genCode(): Promise<string> {
  // 0/O, 1/I/L 처럼 헷갈리는 글자는 제외 — 코드를 말로 불러주는 경우가 많다
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 12; attempt++) {
    let c = "";
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    const taken = hasDb ? await meetingExists(c) : memMeetings.has(c);
    if (!taken) return c;
  }
  // 12번 연속 충돌은 사실상 불가능하지만, 무한 재귀로 서버를 멈추지는 않는다
  throw new Error("초대 코드를 만들지 못했어요. 다시 시도해 주세요.");
}
function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export async function getMeeting(code: string): Promise<Meeting | undefined> {
  return read(code);
}
export function setAiBusy(code: string, busy: boolean) {
  aiBusy.set(code.toUpperCase(), busy);
}

// ── 생성 (Leader: 모임방 개설 — 모임이름, 비번, 인원수) ──
export async function createMeeting(input: {
  name: string;
  password: string;
  headcount: number;
  leaderName: string;
  // ── v19 (설계_v19.md §4-④ 생성 폼) ──
  /** 확정 범위 — 안 주면 기본 `place`("지점까지", v13) */
  scope?: MeetingScope;
  /** 목적 카테고리 — `scope==="region"` 이면 무시하고 null 로 둔다 */
  purposeCategory?: PurposeCategory | null;
  /** 모임 시간(ISO) — 선택. **과거는 거부**한다 (v16) */
  meetTime?: string | null;
  /** 방장 이동수단 — 생성 폼에 통합됨 (v14) */
  leaderTransport?: Transport;
  /** 방장 카카오 회원번호 — 방장은 로그인 필수라 정상 경로에선 항상 있다 (v7) */
  leaderKakaoId?: string | null;
}): Promise<{ code: string; leaderId: string }> {
  const code = await genCode();
  const leaderId = genId("u_");
  const leader: Participant = {
    id: leaderId,
    name: input.leaderName || "방장",
    isLeader: true,
    headcount: 1,
    origin: null,
    lat: null,
    lng: null,
    transport: input.leaderTransport ?? "transit",
    status: null,
    etaText: null,
    // 방장은 카카오 로그인 필수 → PIN 을 쓰지 않는다 (v15)
    pin: null,
    pinFails: 0,
    kakaoId: input.leaderKakaoId ?? null,
    lateMin: null,
  };
  const scope: MeetingScope = input.scope === "region" ? "region" : "place";
  const meeting: Meeting = {
    code,
    name: input.name,
    password: input.password,
    // v19: 정원은 8명 고정 (v8). 입력값이 와도 8을 넘지 않는다.
    headcount: Math.min(MAX_PARTICIPANTS, Math.max(1, input.headcount || MAX_PARTICIPANTS)),
    leaderName: leader.name,
    stage: "main",
    aiPhase: "region",
    participants: [leader],
    regions: [],
    places: [],
    chat: [],
    prefs: {},
    winnerRegionId: null,
    winnerPlaceId: null,
    regionVotes: {},
    placeVotes: {},
    reservation: null,
    createdAt: new Date().toISOString(),
    // ── v19 ──
    scope,
    // '지역까지' 모임은 지점 단계가 없으므로 카테고리를 두지 않는다 (v15)
    purposeCategory: scope === "region" ? null : (input.purposeCategory ?? null),
    meetTime: normalizeMeetTime(input.meetTime),
    placeVoteOpen: false,
    radiusM: 700,
    stashedPlaces: null,
    archivedAt: null,
  };
  // 참가자 행이 모임 행을 참조하므로(FK) 모임을 먼저 넣는다
  await write(meeting);
  if (hasDb) await upsertParticipants(code, [leader]);
  return { code, leaderId };
}

// ── 참여 (User: 모임이름/코드 + 비번 > 참여) ──
export async function joinMeeting(input: {
  code: string;
  /** @deprecated v2 — 비밀번호 폐기. 값이 와도 검사하지 않는다 */
  password?: string;
  name: string;
  headcount?: number;
  ignoreCapacity?: boolean;
  // ── v19 ──
  /** 개인 PIN — 비로그인 참여자만 (v15) */
  pin?: string | null;
  /** 카카오 회원번호 — 로그인 참여자만. 있으면 PIN 을 두지 않는다 */
  kakaoId?: string | null;
  transport?: Transport;
}): Promise<{ ok: true; participantId: string } | { ok: false; error: string }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임을 찾을 수 없어요. 코드를 확인해 주세요." };
  // v2: 비밀번호 검사 없음 — 참여는 초대 링크만으로 한다.
  // v18: 지난 모임은 읽기 전용이라 새로 들어올 수 없다.
  if (m.archivedAt) return { ok: false, error: "이미 지난 모임이에요. 새 모임을 만들어 주세요." };
  // v8: 정원 8명 — 9번째는 입장 거부(초과분은 유료 구간 구상)
  const cap = Math.min(MAX_PARTICIPANTS, m.headcount || MAX_PARTICIPANTS);
  if (!input.ignoreCapacity && m.participants.length >= cap) {
    return {
      ok: false,
      error: `정원이 가득 찼어요 (${m.participants.length}/${cap}명). 현재 한 모임은 ${MAX_PARTICIPANTS}명까지 참여할 수 있어요.`,
    };
  }
  // v4: 이름 중복이면 별칭을 붙이게 돌려보낸다 (PIN 복구는 별도 경로)
  const wanted = (input.name || "").trim();
  if (wanted && m.participants.some((x) => x.name === wanted)) {
    return {
      ok: false,
      error: `이미 '${wanted}' 님이 있어요. 별칭을 붙여 주세요 (예: ${wanted}2).`,
    };
  }
  const id = genId("u_");
  const name = wanted || `참가자${m.participants.length}`;
  const kakaoId = input.kakaoId ?? null;
  const p: Participant = {
    id,
    name,
    isLeader: false,
    headcount: Math.max(1, input.headcount || 1),
    origin: null,
    lat: null,
    lng: null,
    transport: input.transport ?? "transit",
    status: null,
    etaText: null,
    // v15: PIN 은 비로그인만. 로그인 참여자는 계정 기반 복구라 두지 않는다.
    pin: kakaoId ? null : (input.pin || null),
    pinFails: 0,
    kakaoId,
    lateMin: null,
  };
  m.participants.push(p);
  await writeParticipant(m, p);
  // 대화가 이미 시작됐다면 합류 사실을 채팅에도 알림 (AI가 새 참가자를 인지)
  if (m.stage === "chat") {
    pushMsg(m, "system", "", `${name} 님이 모임에 합류했어요.`);
    await write(m);
  }
  return { ok: true, participantId: id };
}

// ── 출발지 등록 (User) ──
export async function setOrigin(input: {
  code: string;
  participantId: string;
  origin: string;
  transport: Transport;
}): Promise<Result> {
  const c = geocode(input.origin);
  return setOriginCoords({ ...input, lat: c.lat, lng: c.lng });
}

// ── 출발지 등록(좌표 주입 버전) — 실 지오코딩 결과를 라우트에서 전달 ──
export async function setOriginCoords(input: {
  code: string;
  participantId: string;
  origin: string;
  transport: Transport;
  lat: number;
  lng: number;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자 없음" };
  p.origin = input.origin;
  p.transport = input.transport;
  p.lat = input.lat;
  p.lng = input.lng;
  await writeParticipant(m, p);
  return { ok: true };
}

// ═════════════════════ AI 대화 계층 ═════════════════════

function pushMsg(m: Meeting, role: ChatMsg["role"], name: string, text: string): ChatMsg {
  const msg: ChatMsg = {
    id: genId("c_"),
    role,
    name: role === "ai" ? "AI" : name,
    text,
    ts: new Date().toISOString(),
  };
  m.chat.push(msg);
  if (m.chat.length > 300) m.chat.splice(0, m.chat.length - 300); // 무한 증가 방지
  return msg;
}

// 대화 시작 (Leader) — 지역 후보를 계산해 chat 스테이지 진입 + AI 오프닝
export async function openChat(
  input: { code: string; participantId: string },
  opts?: { regions?: RegionCandidate[] }
): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 시작할 수 있어요." };
  const regions = opts?.regions ?? recommendRegions(m.participants);
  if (regions.length === 0) return { ok: false, error: "출발지를 등록한 참가자가 없어요." };

  m.regions = regions;
  m.places = [];
  m.winnerRegionId = null;
  m.winnerPlaceId = null;
  m.aiPhase = "region";
  m.stage = "chat";
  m.chat = [];
  pushMsg(m, "system", "", "AI 모임 도우미와 함께 장소·시간을 정하는 대화가 시작됐어요.");
  // 결정적 오프닝 — 아무도 말 안 해도 AI가 먼저 대화를 이끎 (LLM 불필요, 항상 동작)
  const top = regions[0];
  const lines = regions.map((r, i) => `${i + 1}) ${r.name} — 최대 ${r.maxMin}분·편차 ${r.devMin}분`);
  pushMsg(
    m,
    "ai",
    "AI",
    `안녕하세요! 출발지 기준으로 공평한 중간지역을 뽑아봤어요.\n${lines.join("\n")}\n` +
      `데이터상으론 ${top.name}이(가) 가장 균형적이에요. 어디가 끌리세요? ` +
      `다른 동네가 좋으면 이름만 말해주세요 — 이동시간을 바로 계산해 드릴게요 🙂\n` +
      `언제 만날지, 어떤 분위기(조용한/신나는)나 예산 생각도 편하게 말해주시면 반영할게요!`
  );
  await write(m);
  return { ok: true };
}

// 사용자 채팅 추가
export async function appendUserChat(input: {
  code: string;
  participantId: string;
  text: string;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.stage !== "chat") return { ok: false, error: "지금은 대화 단계가 아니에요." };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자 없음" };
  const text = input.text.trim().slice(0, 500);
  if (!text) return { ok: false, error: "빈 메시지" };
  pushMsg(m, "user", p.name, text);
  await write(m);
  return { ok: true };
}

// AI가 대화에서 수집한 선호·일정 병합 (lib/ai.ts의 save_preferences 도구가 호출)
// 모임 시간(meetTime 액션)도 prefs.timeText 로 여기에 들어온다.
export async function updatePrefs(
  code: string,
  partial: MeetingPrefs
): Promise<{ ok: boolean; dateChanged: boolean; prefs?: MeetingPrefs }> {
  const m = await read(code);
  if (!m) return { ok: false, dateChanged: false };
  const before = `${m.prefs.dateText ?? ""}|${m.prefs.timeText ?? ""}`;
  for (const [k, v] of Object.entries(partial)) {
    if (typeof v === "string" && v.trim())
      (m.prefs as Record<string, string>)[k] = v.trim().slice(0, 60);
  }
  const dateChanged = before !== `${m.prefs.dateText ?? ""}|${m.prefs.timeText ?? ""}`;
  if (dateChanged && (m.prefs.dateText || m.prefs.timeText)) {
    pushMsg(m, "system", "", `📅 일정 기록: ${[m.prefs.dateText, m.prefs.timeText].filter(Boolean).join(" ")}`);
  }
  await write(m);
  return { ok: true, dateChanged, prefs: m.prefs };
}

// AI/시스템 메시지 추가 (lib/ai.ts에서 사용)
export async function appendAiChat(code: string, text: string): Promise<void> {
  const m = await read(code);
  if (!m) return;
  pushMsg(m, "ai", "AI", text);
  await write(m);
}
export async function appendSystemChat(code: string, text: string): Promise<void> {
  const m = await read(code);
  if (!m) return;
  pushMsg(m, "system", "", text);
  await write(m);
}

// ── 지역 확정 (투표 마감 · AI 도구 · 방장 수동) ──
//  regionId: 기존 후보 id / 또는 커스텀 후보 객체(후보 밖 지역 합의 시)
export async function confirmRegion(
  input: {
    code: string;
    regionId?: string;
    custom?: RegionCandidate;
    by: "ai" | "leader" | "vote";
  },
  opts?: { places?: PlaceCandidate[] } // 카카오 실검색 결과 주입(없으면 mock)
): Promise<{ ok: boolean; error?: string; regionName?: string }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  // 거점 투표는 메인 화면에서도 진행되므로 main 단계 확정도 허용한다.
  if (m.stage === "result") return { ok: false, error: "이미 끝난 모임이에요." };
  if (m.aiPhase !== "region") return { ok: false, error: "이미 지역이 확정됐어요." };

  let region: RegionCandidate | undefined;
  if (input.custom) {
    // 후보 밖 지역 — 목록에 추가하고 그걸 확정
    input.custom.id = `r${m.regions.length + 1}`;
    m.regions.push(input.custom);
    region = input.custom;
  } else {
    region = m.regions.find((r) => r.id === input.regionId);
  }
  if (!region) return { ok: false, error: "해당 지역 후보가 없어요." };

  m.winnerRegionId = region.id;
  const how =
    input.by === "vote" ? "투표 결과" : input.by === "ai" ? "AI 합의 판단" : "방장 확정";

  // ── v19 §3: 확정 범위 분기 — 여기가 전체 흐름이 갈리는 지점이다 ──
  if (m.scope === "region") {
    // '지역까지' 모임: 지점 단계(⑧⑨)를 건너뛰고 바로 결과로 간다.
    // 결과 화면은 지도만 보여준다 — 경로 API·지점 카카오 링크·도착 신호등 전부 숨김 (v11, v14).
    m.stage = "result";
    m.aiPhase = "done";
    m.places = [];
    m.placeVotes = {};
    m.placeVoteOpen = false;
    pushMsg(m, "system", "", `📍 모임 지역이 ${region.name}(으)로 확정됐어요 (${how}).`);
    await write(m);
    await clearVotes(m.code, "place");
    return { ok: true, regionName: region.name };
  }

  // '지점까지' 모임: 확정 동 중심 반경 안에서 지점을 고른다.
  //
  // ── v17 경계 reopen 복원 ──
  //   지점 단계에서 지역으로 되돌아갔다가 **같은 동을 다시 확정**하면,
  //   그때 보관해 둔 지점 후보·표를 되살린다. 다른 동이면 보관분을 버린다.
  //   (되돌렸다가 마음을 바꿔 원래 동으로 돌아온 사람이 후보를 처음부터
  //    다시 등록하지 않아도 되게 하려는 규칙이다)
  const stash = m.stashedPlaces;
  const restorable = stash && stash.regionId === region.id;
  if (restorable) {
    m.places = stash.places;
    m.placeVotes = { ...stash.votes };
  } else {
    // ⚠️ v19: **시스템이 지점 후보를 미리 담지 않는다.**
    //    후보는 사람이 미리보기 핀을 탭해서 만든다(`addPlaceCandidate`) — 그래서
    //    빈 배열로 연다. 예전엔 여기서 `generatePlaces()` 로 4개를 미리 넣었는데,
    //    그러면 "후보 0개면 투표 시작 불가"(v8) 규칙이 영영 안 걸리고
    //    아무도 등록하지 않아도 투표가 열려 버린다.
    //    (AI 지점 추천은 방장 버튼으로 따로 들어온다 — opts.places)
    m.places = opts?.places?.length ? opts.places : [];
    m.placeVotes = {};
  }
  m.stashedPlaces = null; // 한 번 쓰거나 폐기하면 비운다
  m.aiPhase = "place";
  m.stage = "chat"; // 메인에서 확정한 경우에도 지점 단계로 넘어간다
  // v8: 지점도 '등록 → 투표 시작(잠금) → 투표' 2단계다. 지금은 등록 단계로 연다.
  m.placeVoteOpen = false;
  // v15: 반경은 새 지역마다 700m 에서 다시 시작한다(확장 1회는 그 지역 안에서만 유효).
  m.radiusM = 700;
  pushMsg(
    m,
    "system",
    "",
    restorable
      ? `📍 다시 ${region.name}(으)로 확정됐어요 (${how}). 아까 등록한 지점 후보를 되살렸어요.`
      : `📍 중간지역이 ${region.name}(으)로 확정됐어요 (${how}). 이제 장소를 정해요.`
  );
  await write(m);
  if (restorable) {
    // 복원한 표를 votes 테이블에도 되돌려 놓는다 — 모임 행의 placeVotes 만
    // 채우면 DB 모드에서 폴링이 빈 집계를 읽는다(표는 별도 행에만 산다).
    for (const [pid, cid] of Object.entries(m.placeVotes)) {
      if (hasDb) await setVote(m.code, "place", pid, cid);
    }
  } else {
    // 지점 후보가 새로 만들어졌으니 이전 지점 표는 의미가 없다
    await clearVotes(m.code, "place");
  }
  return { ok: true, regionName: region.name };
}

/**
 * '지점도 정하기' 승격 — 방장만 (v11).
 *
 * `지역까지` 로 끝난 모임을 `지점까지` 로 올린다. **역방향은 없다.**
 * 확정된 지역은 그대로 두고, 그 동 중심 반경 700m 에서 지점 후보 등록을 다시 연다.
 */
export async function promoteToPlace(input: {
  code: string;
  participantId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((p) => p.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "방장만 할 수 있어요." };
  if (m.archivedAt) return { ok: false, error: "지난 모임은 되돌릴 수 없어요." };
  if (m.scope !== "region") return { ok: false, error: "이미 '지점까지' 모임이에요." };
  const region = m.regions.find((r) => r.id === m.winnerRegionId);
  if (!region) return { ok: false, error: "확정된 지역이 없어요." };

  m.scope = "place";
  m.stage = "chat";
  m.aiPhase = "place";
  m.places = generatePlaces(region.name, { lat: region.lat, lng: region.lng });
  m.placeVotes = {};
  m.placeVoteOpen = false;
  m.radiusM = 700;
  pushMsg(m, "system", "", `📍 ${region.name} 안에서 만날 지점도 정하기로 했어요.`);
  await write(m);
  await clearVotes(m.code, "place");
  return { ok: true };
}

// ── 장소 확정 (투표 마감 · AI 도구 · 방장 수동) → 결과 화면 ──
export async function confirmPlace(input: {
  code: string;
  placeId: string;
  by: "ai" | "leader" | "vote";
}): Promise<{ ok: boolean; error?: string; placeName?: string }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.stage !== "chat") return { ok: false, error: "대화 단계가 아니에요." };
  if (m.aiPhase !== "place") return { ok: false, error: "먼저 지역을 확정해야 해요." };
  const place = m.places.find((p) => p.id === input.placeId);
  if (!place) return { ok: false, error: "해당 장소 후보가 없어요." };

  m.winnerPlaceId = place.id;
  m.aiPhase = "done";
  m.stage = "result";
  pushMsg(
    m,
    "system",
    "",
    `🎉 ${place.name}(으)로 최종 확정! (${
      input.by === "vote" ? "투표 결과" : input.by === "ai" ? "AI 합의 판단" : "방장 확정"
    })`
  );
  await write(m);
  return { ok: true, placeName: place.name };
}

// ── 참가자 자가신고 도착 상태(정상/지체 중/많이 늦음) + 도착 예정 시간 ──
//  본인 항목만 수정 가능(회의록). 타인 id를 넣어도 서버에서 막지는 않으므로
//  API 라우트에서 participantId === 요청자 확인 후에만 호출해야 한다.
export async function setParticipantStatus(input: {
  code: string;
  participantId: string;
  status: "green" | "yellow" | "red" | null;
  etaText?: string | null;
  /** v16: 노랑(지각)일 때 몇 분 늦는지 — 전원에게 공유된다 */
  lateMin?: number | null;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자를 찾을 수 없어요." };

  // ── v19 §4-⑩ 신호등 가드 ──
  // ⚠️ 화면도 같은 조건으로 잠그지만, **서버가 최종 관문**이다 (v12).
  if (m.archivedAt) return { ok: false, error: "지난 모임이에요." };
  // v14: '지역까지' 모임엔 신호등이 아예 없다
  if (m.scope === "region") return { ok: false, error: "'지역까지' 모임에는 도착 신호등이 없어요." };
  // v7: 시간을 안 정했으면 잠긴다 — 언제 도착인지 기준이 없기 때문이다
  if (!m.meetTime) return { ok: false, error: "모임 시간을 먼저 정해 주세요." };
  // v16: 모임 당일에만 활성
  if (!isSameLocalDay(m.meetTime)) return { ok: false, error: "도착 신호등은 모임 당일에만 쓸 수 있어요." };

  p.status = input.status;
  if (input.etaText !== undefined) p.etaText = input.etaText?.trim().slice(0, 40) || null;
  // 노랑일 때만 지각 분을 갖는다 — 색을 바꾸면 이전 분은 지운다
  p.lateMin =
    input.status === "yellow"
      ? Math.max(1, Math.min(600, Math.round(Number(input.lateMin) || 0))) || null
      : null;
  await writeParticipant(m, p);
  return { ok: true };
}

// ── 거점/가게 후보 투표 (1인 1표) ──────────────────────────────
//  같은 후보를 다시 누르면 취소, 다른 후보를 누르면 표를 옮긴다.
//  DB(Neon) 모드에서는 votes 테이블의 PK(code,target,participant_id)가
//  1인 1표를 보장하므로, 여러 명이 동시에 눌러도 표가 유실되지 않는다.
export async function castVote(input: {
  code: string;
  participantId: string;
  target: "region" | "place";
  candidateId: string | null;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자를 찾을 수 없어요." };

  // ── v12: 늦은 표는 서버가 거부한다 ──
  //   확정·잠금이 일어난 직후에 도착한 표를 그냥 받으면, 화면에는 표가 늘었는데
  //   집계에는 없는 상태가 된다. 폴링(1.8초) 화면이라 실제로 겹친다.
  const step = phaseStepOf(m);
  const votable =
    (input.target === "region" && step === "region-vote") ||
    (input.target === "place" && step === "place-vote");
  if (!votable)
    // ⚠️ **"새로고침하세요" 라고 하지 않는다.** 이 화면은 1.8초마다 스스로 당겨오고,
    //    실패하면 클라이언트가 그 자리에서 최신 상태를 다시 읽는다(MeetingClient.act).
    //    사람에게 새로고침을 시키면 시연 내내 새로고침을 하게 된다(2026-08-10 제보).
    return { ok: false, error: "단계가 바뀌었어요 — 방금 넘어간 화면에서 다시 해주세요." };

  if (!m.regionVotes) m.regionVotes = {};
  if (!m.placeVotes) m.placeVotes = {};
  const box = input.target === "region" ? m.regionVotes : m.placeVotes;

  // 취소: 후보를 비워 보냈거나, 이미 찍은 후보를 다시 누른 경우
  const candidateId = input.candidateId;
  if (!candidateId || box[p.id] === candidateId) {
    delete box[p.id];
    if (hasDb) await setVote(m.code, input.target, p.id, null);
    else memMeetings.set(m.code, m);
    return { ok: true };
  }

  const pool: { id: string }[] = input.target === "region" ? m.regions : m.places;
  if (!pool.some((c) => c.id === candidateId))
    return { ok: false, error: "해당 후보가 없어요." };

  box[p.id] = candidateId;
  if (hasDb) await setVote(m.code, input.target, p.id, candidateId);
  else memMeetings.set(m.code, m);
  return { ok: true };
}

// ── 후보 직접 등록 — 방장 포함 누구나 원하는 지역을 후보에 올린다 ──
//  자동 추천 3곳이 마음에 안 들 때(특히 서울↔부산처럼 중간이 애매할 때)의
//  핵심 탈출구. id 를 "rc_" 접두사로 구분해, 출발지 변경으로 자동 후보가
//  재계산돼도 살아남게 한다(재계산 쪽에서 rc_* 를 보존·지표 갱신).
export async function addRegionCandidate(input: {
  code: string;
  name: string;
  lat: number;
  lng: number;
  maxMin: number;
  devMin: number;
  // `real` 은 그 사람 숫자가 실 API 값인지다 — 화면의 출처 칩(`경로 기준`) 판정에 쓰므로
  // 여기서 떨어뜨리면 참가자 제안 후보만 출처를 잃는다 (lib/types.ts 참고)
  perParticipant: { pid: string; name: string; min: number; real?: boolean }[];
  proposedBy: string;
  /** v4: 핑은 인원당 1개 — 누가 찍었는지 알아야 병합·이동·이탈을 계산한다 */
  participantId?: string;
}): Promise<{ ok: boolean; error?: string; candidate?: RegionCandidate; existing?: boolean }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  // ── v5·v12: 투표가 시작되면 핑이 잠긴다. 늦은 핑은 서버가 거부한다 ──
  if (phaseStepOf(m) !== "region-register")
    return { ok: false, error: "단계가 바뀌었어요 — 후보 등록이 끝났어요." };

  // 같은 동은 병합한다 (v4) — 새 후보를 만들지 않고 기존 후보에 사람만 더한다.
  // 공백 무시 비교.
  const norm = (s: string) => s.replace(/\s/g, "");
  const dup = m.regions.find((r) => norm(r.name) === norm(input.name));
  if (dup) {
    // v9: AI 추천 동과 겹치면 병합하고 'AI 추천' 태그는 남긴다.
    if (input.participantId) {
      dup.contributors = Array.from(new Set([...(dup.contributors ?? []), input.participantId]));
      await write(m);
    }
    return { ok: true, candidate: dup, existing: true };
  }

  // v4: 핑은 인원당 1개다 — 이미 찍은 사람은 옮긴다(옛 후보에서 자기 몫을 뺀다).
  if (input.participantId) {
    for (const r of m.regions) {
      if (!r.contributors?.includes(input.participantId)) continue;
      r.contributors = r.contributors.filter((x) => x !== input.participantId);
      // v12: 병합 핑에서 마지막 한 명이 빠지면 후보 자체가 사라진다.
      // (AI 후보는 사람이 0명이어도 유지된다 — source 로 구분)
      if (r.contributors.length === 0 && r.source !== "ai") {
        m.regions = m.regions.filter((x) => x.id !== r.id);
        delete m.regionVotes[input.participantId];
      }
    }
  }

  const candidate: RegionCandidate = {
    id: genId("rc_"),
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    maxMin: input.maxMin,
    devMin: input.devMin,
    proposedBy: input.proposedBy,
    reason: `${input.proposedBy} 님 제안 — 최대 ${input.maxMin}분 · 편차 ${input.devMin}분`,
    perParticipant: input.perParticipant,
    // ── v19 ── 수동 핑. 같은 동에 여러 명이 붙으면 여기 쌓인다(병합).
    source: "manual",
    contributors: input.participantId ? [input.participantId] : [],
  };
  m.regions.push(candidate);
  await write(m);
  // 후보가 "늘어나는" 것은 기존 표를 무효화하지 않는다 — 표는 그대로 둔다
  return { ok: true, candidate };
}

// ── 거점 후보 갱신 (출발지가 바뀌면 재계산) ──
//  stage 는 건드리지 않는다 — 메인 화면에서도 투표할 수 있게 하기 위함.
export async function setRegionCandidates(
  code: string,
  regions: RegionCandidate[]
): Promise<Result> {
  const m = await read(code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.winnerRegionId) return { ok: true }; // 이미 확정된 뒤엔 후보를 흔들지 않는다

  // ── v19 §5: 투표가 시작되면 후보는 잠긴다 ──
  //  `addRegionCandidate` 는 이미 이 관문을 갖고 있는데 여기만 뚫려 있었다.
  //  뚫린 결과: **투표 중에 누가 출발지를 고치면** 자동 재계산이 돌아 후보 목록이
  //  갈리고 `clearVotes` 로 **모두의 표가 사라졌다.** 발표 중 한 명이 "아 저 사당이
  //  아니라 사당역이었어요" 하고 고치는 순간 투표가 초기화된다.
  if (phaseStepOf(m) !== "region-register") return { ok: true };

  // 사람이 등록한 후보(rc_* = 핑·검색)와 **AI 추천 후보(ra_*)** 는
  // 재계산에 밀려 사라지면 안 된다.
  // 호출자(regions 액션)가 지표를 갱신해 함께 넘기는 게 정석이지만,
  // 빠뜨린 호출이 있어도 유실되지 않게 여기서 한 번 더 보존한다.
  //
  // ⚠️ `ra_`(AI)를 빠뜨렸던 버그: 방장이 AI 추천을 받은 뒤 **누군가 출발지를 바꾸면**
  //    자동 재계산이 돌면서 AI 후보 3곳이 통째로 사라졌다. 발표 시연에서
  //    "AI 추천 → 다른 사람 참여 → 후보 사라짐" 순서로 정확히 재현된다.
  const passedIds = new Set(regions.map((r) => r.id));
  const keptProposals = m.regions.filter(
    (r) => (r.id.startsWith("rc_") || r.id.startsWith("ra_")) && !passedIds.has(r.id)
  );
  const nextList = [...regions, ...keptProposals];

  // ⚠️ **"후보 목록이 바뀐 것"과 "지표만 갱신된 것"은 다른 사건이다.**
  //    예전엔 이름만 비교해 둘을 한 덩어리로 봤고, 그래서 이름이 같으면
  //    **새로 계산한 이동시간을 통째로 버렸다.** 결과:
  //      2인이 후보를 계산 → 3·4번째가 합류 → 추천 동네 이름은 그대로
  //      → 저장 안 함 → 늦게 온 두 명은 `perParticipant` 에 영영 없음
  //      → 결과 화면에서 **"이동시간 없음"** 으로 남는다.
  //    발표에서 팀원이 한 명씩 들어오는 순서 그대로 재현된다(2026-08-10 실측).
  //
  //  · 이름 목록이 달라졌다 → 표가 의미를 잃는다 ⇒ 저장 + 표 비움
  //    (자동 후보 id 는 순위(r1·r2·r3)라 후보가 완전히 바뀌어도 그대로다.
  //     id 로 비교하면 달라진 걸 감지할 수 없어 엉뚱한 표가 남았던 버그가 있다)
  //  · 이름은 같고 지표만 달라졌다 → ⇒ 저장만. **표는 지킨다**
  const namesOf = (list: RegionCandidate[]) => list.map((r) => r.name).join(",");
  const metricsOf = (list: RegionCandidate[]) =>
    list
      .map(
        (r) =>
          `${r.id}:${r.maxMin}/${r.devMin}:` +
          (r.perParticipant ?? [])
            .map((x) => `${x.pid}=${x.min}`)
            .sort()
            .join("+")
      )
      .join(",");

  const listChanged = namesOf(m.regions) !== namesOf(nextList);
  // 둘 다 그대로면 쓸 이유가 없다 — 폴링마다 DB에 쓰지 않도록 막는다
  if (!listChanged && metricsOf(m.regions) === metricsOf(nextList)) return { ok: true };

  m.regions = nextList;
  if (listChanged) m.regionVotes = {};
  await write(m);
  if (listChanged) await clearVotes(m.code, "region");
  return { ok: true };
}

/**
 * AI 도구가 후보 목록을 직접 손질한 뒤 저장하는 통로.
 * (search_more_places 로 가게를 더 찾거나, evaluate_region 으로 참가자가 제안한
 *  동네를 후보에 추가하는 경우 — 인메모리 시절엔 객체를 그 자리에서 고치면
 *  그게 곧 저장이었지만, DB 모드에서는 명시적으로 써 줘야 한다)
 */
export async function saveCandidates(
  code: string,
  patch: { regions?: RegionCandidate[]; places?: PlaceCandidate[] }
): Promise<Result> {
  const m = await read(code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (patch.regions) m.regions = patch.regions;
  if (patch.places) m.places = patch.places;
  await write(m);
  return { ok: true };
}

// ── 다시 논의 (Leader): 장소 단계 → 지역 단계로, 결과 → 장소 단계로 ──
// ═══════════════════════════════════════════════════════════════
// v19 AI 추천 (설계_v19.md §8)
//
//  **AI 는 방장이 누르는 버튼 하나뿐이다. 안 누르면 0원.**
//  여기서는 "AI 가 만들어 온 후보를 기존 후보에 어떻게 섞는가"만 다룬다 —
//  실제 생성은 `lib/ai-vote/` 가 맡는다.
// ═══════════════════════════════════════════════════════════════

/** 재호출 시 이전 AI 후보를 어떻게 할지 (v14 — 교체/추가 선택 팝업) */
export type AiMergeMode = "replace" | "append";

const normName = (s: string) => s.replace(/\s/g, "");

/**
 * AI 후보를 기존 후보에 병합한다 (v9 · v14).
 *
 * 규칙
 *  1. **같은 이름이 이미 있으면 새로 만들지 않는다** — 기존 후보에 `aiSuggested` 만 켠다.
 *     사람이 먼저 찍은 핑이면 `source` 는 `manual` 그대로다(그 사람 몫이 사라지면 안 된다).
 *  2. `replace` 는 **순수 AI 후보만** 지운다 — 수동 병합 후보는 유지한다 (v14).
 *     그래야 "AI 다시 돌리기"가 남의 핑을 지우지 않는다.
 *  3. 후보가 늘어나는 것은 기존 표를 무효화하지 않는다. 다만 `replace` 로
 *     **사라진 후보에 찍혀 있던 표는 함께 사라진다** (v10 과 같은 규칙).
 */
export async function applyAiCandidates(input: {
  code: string;
  participantId: string;
  mode: AiMergeMode;
  regions?: RegionCandidate[];
  places?: PlaceCandidate[];
}): Promise<{ ok: boolean; error?: string; added?: number; merged?: number }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "AI 추천은 방장만 쓸 수 있어요." };

  // v8: AI 호출은 **후보 등록 단계에서만**
  const step = phaseStepOf(m);
  const isRegion = step === "region-register";
  const isPlace = step === "place-register";
  if (!isRegion && !isPlace)
    return { ok: false, error: "후보 등록 단계에서만 AI 추천을 쓸 수 있어요." };

  let added = 0;
  let merged = 0;
  const dropped: string[] = [];

  if (isRegion) {
    if (input.mode === "replace") {
      // 수동 핑이 붙지 않은 **순수 AI 후보만** 걷어낸다 (v14)
      for (const r of m.regions) {
        if (r.source === "ai" && (r.contributors?.length ?? 0) === 0) dropped.push(r.id);
      }
      m.regions = m.regions.filter((r) => !dropped.includes(r.id));
    }
    for (const cand of input.regions ?? []) {
      const dup = m.regions.find((r) => normName(r.name) === normName(cand.name));
      if (dup) {
        dup.aiSuggested = true;   // 병합 — 후보를 새로 만들지 않는다 (v9)
        merged++;
        continue;
      }
      m.regions.push({ ...cand, id: genId("ra_"), source: "ai", aiSuggested: true, contributors: [] });
      added++;
    }
  } else {
    if (input.mode === "replace") {
      for (const p of m.places) {
        if (p.source === "ai" && !p.proposedById) dropped.push(p.id);
      }
      m.places = m.places.filter((p) => !dropped.includes(p.id));
    }
    const region = m.regions.find((r) => r.id === m.winnerRegionId);
    for (const cand of input.places ?? []) {
      const dup = m.places.find((p) => normName(p.name) === normName(cand.name));
      if (dup) {
        dup.aiSuggested = true;
        merged++;
        continue;
      }
      // 반경 밖 추천은 버린다 — 사람이 등록할 때와 같은 잣대여야 한다 (v4)
      if (region && cand.lat != null && cand.lng != null) {
        const d = distanceM(region, { lat: cand.lat, lng: cand.lng });
        if (d > m.radiusM) continue;
      }
      m.places.push({ ...cand, id: genId("pa_"), source: "ai", aiSuggested: true });
      added++;
    }
  }

  // replace 로 사라진 후보의 표만 정리한다
  const box = isRegion ? m.regionVotes : m.placeVotes;
  const orphaned = Object.entries(box ?? {})
    .filter(([, cid]) => dropped.includes(cid))
    .map(([pid]) => pid);
  for (const pid of orphaned) delete box[pid];

  await write(m);
  if (hasDb) {
    for (const pid of orphaned) await setVote(m.code, isRegion ? "region" : "place", pid, null);
  }
  return { ok: true, added, merged };
}

// ═══════════════════════════════════════════════════════════════
// v19 결과 · 신호등 · 지난 모임 (설계_v19.md §4-⑩ · §4-⑪)
// ═══════════════════════════════════════════════════════════════

/** 그 시각이 '오늘'인지 — 도착 신호등은 **모임 당일만** 활성이다 (v16) */
export function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * '지난 모임'이 될 때가 됐는지 (v9).
 *
 *   · 모임 시간이 있으면 → **모임일 다음날 0시**부터
 *   · 없으면            → **마지막 활동 7일 후**부터
 *
 * ⚠️ 시간이 지나 과거가 되는 것은 정상이다 — 여기서 판정하는 건 "끝난 모임인가"이지
 *    "시간 입력이 잘못됐나"가 아니다 (그건 `normalizeMeetTime` 이 본다).
 */
export function archiveDueAt(m: Meeting): number {
  if (m.meetTime) {
    const d = new Date(m.meetTime);
    // 모임일 **다음날 0시** — 모임이 밤 11시에 끝나도 그날 안엔 '지난 모임'이 아니다
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }
  const last = new Date(m.updatedAt ?? m.createdAt).getTime();
  return last + 7 * 24 * 60 * 60 * 1000;
}

/**
 * 때가 됐으면 '지난 모임'으로 넘긴다. 넘겼으면 `true`.
 *
 * 스케줄러가 없으므로 **읽을 때 판정한다**(`getState`). 폴링이 1.8초마다 들어오지만
 * 전환은 한 번뿐이라 쓰기도 한 번이다.
 */
async function archiveIfDue(m: Meeting): Promise<boolean> {
  if (m.archivedAt) return false;
  if (Date.now() < archiveDueAt(m)) return false;
  m.archivedAt = new Date().toISOString();
  await write(m);
  return true;
}

/**
 * 모임 시간 설정·변경 — 방장만. **과거는 거부한다** (v16).
 * 비우면(`null`) 미입력으로 되돌아가고, 결과 화면은 다시 입력 유도 배너를 띄운다.
 */
export async function setMeetTime(input: {
  code: string;
  participantId: string;
  meetTime: string | null;
}): Promise<{ ok: boolean; error?: string; meetTime?: string | null }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "방장만 시간을 정할 수 있어요." };
  if (m.archivedAt) return { ok: false, error: "지난 모임은 시간을 바꿀 수 없어요." };

  if (input.meetTime) {
    const norm = normalizeMeetTime(input.meetTime);
    if (!norm) return { ok: false, error: "지난 시각은 정할 수 없어요." };
    m.meetTime = norm;
  } else {
    m.meetTime = null;
  }
  await write(m);
  return { ok: true, meetTime: m.meetTime };
}

/**
 * '이 멤버로 재모임 만들기' — **방장만** (v18).
 *
 * 지난 모임은 **부활하지 않는다** (v16). 대신 멤버를 이어받은 **새 모임**을 만든다.
 * **카카오 로그인 멤버만 자동 이전**되고, 비로그인 참여자는 링크로 재참여한다 (v17) —
 * 비로그인은 기기(localStorage)에만 신원이 있어 서버가 옮겨줄 수가 없다.
 */
export async function recreateMeeting(input: {
  code: string;
  participantId: string;
  name?: string;
  meetTime?: string | null;
}): Promise<{ ok: boolean; error?: string; code?: string; leaderId?: string; carried?: number }> {
  const old = await read(input.code);
  if (!old) return { ok: false, error: "모임 없음" };
  const me = old.participants.find((x) => x.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "방장만 재모임을 만들 수 있어요." };

  const { code, leaderId } = await createMeeting({
    name: (input.name || `${old.name} (다시)`).slice(0, 40),
    password: "",
    headcount: old.headcount,
    leaderName: me.name,
    scope: old.scope,
    purposeCategory: old.purposeCategory,
    meetTime: input.meetTime ?? null,
    leaderTransport: me.transport,
    leaderKakaoId: me.kakaoId,
  });

  // v17: 카카오 로그인 멤버만 자동으로 옮긴다
  const carried = old.participants.filter((p) => !p.isLeader && p.kakaoId);
  if (carried.length > 0) {
    const fresh = await read(code);
    if (fresh) {
      for (const p of carried) {
        fresh.participants.push({
          ...p,
          id: genId("u_"),
          // 새 모임에서 다시 정할 것들 — 출발지는 유지(같은 사람이니까),
          // 도착 신호등·지각 분은 지난 모임의 상태라 가져오지 않는다.
          status: null,
          etaText: null,
          lateMin: null,
          pin: null,
          pinFails: 0,
        });
      }
      await write(fresh);
      if (hasDb) await upsertParticipants(code, fresh.participants);
    }
  }
  return { ok: true, code, leaderId, carried: carried.length };
}

// ═══════════════════════════════════════════════════════════════
// v19 참여·인증 (설계_v19.md §4-⑤ · §7)
// ═══════════════════════════════════════════════════════════════

/**
 * 이름 + PIN 으로 자기 자리 되찾기 — **비로그인 참여자 전용** (v15).
 *
 * 쿠키(localStorage)가 날아가면 참여자는 자기 신원을 잃는다. 다시 참여하면
 * 정원만 차고 표가 갈라지므로, 이름과 PIN 으로 기존 자리를 돌려준다.
 *
 * ⚠️ **5회 실패하면 잠근다** (v16). 잠긴 뒤에는 방장이 강퇴해야 다시 들어올 수 있다.
 *    4자리 숫자라 무제한이면 사실상 아무나 남의 자리를 가져갈 수 있다.
 */
export async function recoverParticipant(input: {
  code: string;
  name: string;
  pin: string;
}): Promise<{ ok: boolean; error?: string; participantId?: string; isLeader?: boolean }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임을 찾을 수 없어요." };

  const name = (input.name || "").trim();
  const p = m.participants.find((x) => x.name === name);
  if (!p) return { ok: false, error: "그 이름으로 참여한 사람이 없어요." };
  if (!p.pin) return { ok: false, error: "이 참여자는 PIN 이 없어요 (카카오 로그인으로 참여했어요)." };

  if (p.pinFails >= MAX_PIN_FAILS)
    return { ok: false, error: `PIN 을 ${MAX_PIN_FAILS}회 틀려 잠겼어요. 방장에게 요청해 주세요.` };

  if (p.pin !== String(input.pin)) {
    p.pinFails += 1;
    await writeParticipant(m, p);
    const left = MAX_PIN_FAILS - p.pinFails;
    return {
      ok: false,
      error: left > 0 ? `PIN 이 달라요. ${left}번 더 틀리면 잠겨요.` : "PIN 을 5회 틀려 잠겼어요.",
    };
  }

  // 성공 — 실패 횟수를 되돌린다
  if (p.pinFails !== 0) {
    p.pinFails = 0;
    await writeParticipant(m, p);
  }
  return { ok: true, participantId: p.id, isLeader: p.isLeader };
}

/**
 * 강퇴 — 방장만 (v10). **그 사람의 핑·표를 함께 지우고, 재참여는 허용한다.**
 *
 * 병합 핑에서는 **그 사람 몫만** 빠진다 (v12). 마지막 한 명이면 후보가 사라지고,
 * 그 후보에 찍혀 있던 표도 함께 사라진다.
 */
export async function kickParticipant(input: {
  code: string;
  participantId: string;
  targetId: string;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "방장만 내보낼 수 있어요." };
  const target = m.participants.find((x) => x.id === input.targetId);
  if (!target) return { ok: false, error: "해당 참여자가 없어요." };
  if (target.isLeader) return { ok: false, error: "방장은 내보낼 수 없어요." };

  m.participants = m.participants.filter((x) => x.id !== input.targetId);

  // 지역 핑에서 그 사람 몫만 뺀다 — 마지막 한 명이면 후보 삭제 (v12)
  const droppedRegions: string[] = [];
  for (const r of m.regions) {
    if (!r.contributors?.includes(input.targetId)) continue;
    r.contributors = r.contributors.filter((x) => x !== input.targetId);
    if (r.contributors.length === 0 && r.source !== "ai") droppedRegions.push(r.id);
  }
  m.regions = m.regions.filter((r) => !droppedRegions.includes(r.id));

  // 그 사람이 등록한 지점 후보도 정리한다
  const droppedPlaces = m.places.filter((p) => p.proposedById === input.targetId).map((p) => p.id);
  m.places = m.places.filter((p) => !droppedPlaces.includes(p.id));

  // 표 정리: 본인 표 + 사라진 후보에 찍힌 표
  delete m.regionVotes[input.targetId];
  delete m.placeVotes[input.targetId];
  for (const [pid, cid] of Object.entries(m.regionVotes)) {
    if (droppedRegions.includes(cid)) delete m.regionVotes[pid];
  }
  for (const [pid, cid] of Object.entries(m.placeVotes)) {
    if (droppedPlaces.includes(cid)) delete m.placeVotes[pid];
  }

  pushMsg(m, "system", "", `${target.name} 님이 모임에서 나갔어요.`);
  await write(m);
  if (hasDb) {
    await deleteParticipantRow(input.targetId);
    // 고아가 된 표를 votes 테이블에서도 지운다
    for (const p of m.participants) {
      if (m.regionVotes[p.id] === undefined) await setVote(m.code, "region", p.id, null);
      if (m.placeVotes[p.id] === undefined) await setVote(m.code, "place", p.id, null);
    }
  }
  return { ok: true };
}

/** 모임 삭제 — 방장만 (v10). 확인 팝업은 화면이 띄운다. */
export async function deleteMeeting(input: {
  code: string;
  participantId: string;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me?.isLeader) return { ok: false, error: "방장만 삭제할 수 있어요." };

  if (hasDb) await deleteMeetingRow(m.code);
  memMeetings.delete(m.code);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// v19 지점 단계 (설계_v19.md §4-⑧)
//
//  확정 동 중심 **반경 700m** 안에서만 고른다. 밖은 거부한다.
//  확장은 **700 → 1400m, 1회 한정**이고 누구나 누를 수 있으며 전체에 공유된다 (v15).
// ═══════════════════════════════════════════════════════════════

/** 두 좌표 사이 거리(m) — haversine. 반경 판정에만 쓰므로 지구 반지름 상수 하나면 충분하다. */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * 반경 확장 — **700 → 1400m, 1회 한정. 누구나. 전체 공유** (v15).
 *
 * 방장 전용이 아닌 이유: 후보가 안 나와서 막힌 사람이 직접 풀 수 있어야 하기 때문이다.
 * 대신 전체에 적용되므로 한 번 넓히면 모두가 넓은 반경을 본다.
 */
export async function expandRadius(input: {
  code: string;
  participantId: string;
}): Promise<{ ok: boolean; error?: string; radiusM?: number }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (!m.participants.some((x) => x.id === input.participantId))
    return { ok: false, error: "참가자를 찾을 수 없어요." };
  if (m.aiPhase !== "place") return { ok: false, error: "지점 단계가 아니에요." };
  if (m.radiusM >= 1400)
    return { ok: false, error: "이미 최대(1400m)까지 넓혔어요. 다른 카테고리나 검색을 써보세요." };

  m.radiusM = 1400;
  pushMsg(m, "system", "", "🔍 검색 반경을 1400m(도보 20분)로 넓혔어요.");
  await write(m);
  return { ok: true, radiusM: m.radiusM };
}

/**
 * 지점 후보 등록 — **전원 가능 · 상한 없음** (v7, v10).
 *
 * 반경 밖이면 거부한다. 같은 지점을 두 번 등록하면 기존 것을 돌려준다.
 */
export async function addPlaceCandidate(input: {
  code: string;
  participantId: string;
  place: {
    name: string;
    category: string;
    emoji?: string;
    lat: number;
    lng: number;
    rating?: number;
    url?: string;
  };
}): Promise<{ ok: boolean; error?: string; candidate?: PlaceCandidate; existing?: boolean }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me) return { ok: false, error: "참가자를 찾을 수 없어요." };

  // v12: 잠긴 뒤 도착한 등록은 서버가 거부한다
  if (phaseStepOf(m) !== "place-register")
    return { ok: false, error: "단계가 바뀌었어요 — 후보 등록이 끝났어요." };

  const region = m.regions.find((r) => r.id === m.winnerRegionId);
  if (!region) return { ok: false, error: "확정된 지역이 없어요." };

  // v4·v15: 확정 동 중심 반경 밖은 거부
  const d = distanceM(region, input.place);
  if (d > m.radiusM)
    return {
      ok: false,
      error: `${region.name} 중심에서 ${d}m 떨어져 있어요 (제한 ${m.radiusM}m). 반경을 넓히거나 더 가까운 곳을 골라주세요.`,
    };

  const norm = (s: string) => s.replace(/\s/g, "");
  const dup = m.places.find((p) => norm(p.name) === norm(input.place.name));
  if (dup) return { ok: true, candidate: dup, existing: true };

  const candidate: PlaceCandidate = {
    id: genId("pc_"),
    name: input.place.name,
    category: input.place.category,
    emoji: input.place.emoji || "📍",
    lat: input.place.lat,
    lng: input.place.lng,
    distanceM: d,
    // ⚠️ 0 = 정보 없음. 없는 별점을 지어내지 않는다 (CLAUDE.md §3-6).
    rating: input.place.rating ?? 0,
    reservable: false,
    depositPerHead: 0,
    url: input.place.url,
    source: "manual",
    proposedById: me.id,
    proposedBy: me.name,
  };
  m.places.push(candidate);
  await write(m);
  // 후보가 늘어나는 것은 기존 표를 무효화하지 않는다
  return { ok: true, candidate };
}

/**
 * 지점 후보 삭제 — **방장은 임의 후보, 본인은 자기 후보만** (v7).
 * 삭제된 후보에 찍힌 표는 함께 사라진다 (v10 — "삭제된 후보의 표만 사라진다").
 */
export async function removePlaceCandidate(input: {
  code: string;
  participantId: string;
  placeId: string;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const me = m.participants.find((x) => x.id === input.participantId);
  if (!me) return { ok: false, error: "참가자를 찾을 수 없어요." };
  if (m.aiPhase !== "place" || m.stage === "result")
    return { ok: false, error: "지금은 후보를 지울 수 없어요." };

  const target = m.places.find((p) => p.id === input.placeId);
  if (!target) return { ok: false, error: "해당 후보가 없어요." };
  if (!me.isLeader && target.proposedById !== me.id)
    return { ok: false, error: "내가 등록한 후보만 지울 수 있어요." };

  m.places = m.places.filter((p) => p.id !== input.placeId);
  // v10: **그 후보에 찍힌 표만** 사라진다. 다른 후보의 표는 건드리지 않는다.
  const orphaned = Object.entries(m.placeVotes ?? {})
    .filter(([, cid]) => cid === input.placeId)
    .map(([pid]) => pid);
  for (const pid of orphaned) delete m.placeVotes[pid];
  await write(m);
  if (hasDb) for (const pid of orphaned) await setVote(m.code, "place", pid, null);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// v19 단계 규칙 (설계_v19.md §5·§6)
//
// 두 단계(지역·지점)가 **똑같은 모양**이다:
//     등록 → 투표 시작(잠금) → 투표 → 방장 확정
//
// 지금 어느 칸에 있는지는 (stage, aiPhase, placeVoteOpen) 셋이 정한다.
// 판정을 이 한 곳에 모아 둔 이유: 화면·API·store 가 각자 조건을 쓰면
// "잠겼는데 등록이 되는" 구멍이 생긴다 (v12 가 서버 거부를 못박은 이유).
// ═══════════════════════════════════════════════════════════════

/** 지금 모임이 서 있는 칸 */
export type PhaseStep =
  | "region-register"   // ⑥ 지역 후보 핑 등록      (main · region)
  | "region-vote"       // ⑦ 지역 투표              (chat · region)
  | "place-register"    // ⑧ 지점 후보 등록         (chat · place · !placeVoteOpen)
  | "place-vote"        // ⑨ 지점 투표              (chat · place ·  placeVoteOpen)
  | "result";           // ⑩ 확정

export function phaseStepOf(m: Meeting): PhaseStep {
  if (m.stage === "result") return "result";
  if (m.aiPhase === "place") return m.placeVoteOpen ? "place-vote" : "place-register";
  return m.stage === "chat" ? "region-vote" : "region-register";
}

/**
 * 후보 수에 따른 투표 시작 판정 (v8).
 *   0개 → 시작 불가 · 1개 → 투표 생략(방장 바로 확정) · 2개 이상 → 정상 투표
 */
export function candidateGate(count: number): "blocked" | "skip" | "vote" {
  if (count === 0) return "blocked";
  if (count === 1) return "skip";
  return "vote";
}

/**
 * 투표 시작 — 방장만. **이 순간 후보가 잠긴다** (v5, v8).
 *
 * 지역이면 `main → chat`, 지점이면 `placeVoteOpen = true`.
 * 후보가 1개면 투표를 열지 않고 `skipped` 를 돌려준다 — 호출부가 바로 확정을 부른다.
 * 미배정 핑(홈에서 넘어온 출발지)은 이때 사라진다 (v9).
 */
export async function startVote(input: {
  code: string;
  participantId: string;
}): Promise<{ ok: boolean; error?: string; skipped?: boolean; onlyCandidateId?: string }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 시작할 수 있어요." };
  if (m.archivedAt) return { ok: false, error: "지난 모임이에요." };

  const step = phaseStepOf(m);
  if (step !== "region-register" && step !== "place-register")
    return { ok: false, error: "이미 투표가 시작됐어요." };

  const isRegion = step === "region-register";
  const pool: { id: string }[] = isRegion ? m.regions : m.places;
  const gate = candidateGate(pool.length);

  if (gate === "blocked")
    return {
      ok: false,
      error: isRegion
        ? "후보가 없어요. 지도를 눌러 후보를 먼저 등록해 주세요."
        : "후보가 없어요. 지도에서 장소를 눌러 후보로 등록해 주세요.",
    };

  if (isRegion) {
    m.stage = "chat";
    m.aiPhase = "region";
    // v9: 미배정 핑은 여기서 사라진다 (홈에서 넘어온 뒤 아무도 안 가져간 출발지)
    m.regions = m.regions.filter((r) => r.source === "ai" || (r.contributors?.length ?? 1) > 0);
  } else {
    m.placeVoteOpen = true;
  }

  // v8: 후보가 하나면 투표 화면을 띄우지 않는다 — 방장이 바로 확정한다.
  if (gate === "skip") {
    await write(m);
    return { ok: true, skipped: true, onlyCandidateId: pool[0].id };
  }

  pushMsg(m, "system", "", isRegion ? "🗳️ 지역 투표가 시작됐어요." : "🗳️ 지점 투표가 시작됐어요.");
  await write(m);
  return { ok: true };
}

/**
 * 되돌리기 — **reopen 사다리. 누를 때마다 한 칸씩** (v10).
 *
 *     확정 → 투표 다시 → 후보부터 다시
 *
 * **표는 유지된다.** 삭제된 후보의 표만 사라진다.
 *
 * 지점 등록 → 지역 투표로 넘어가는 칸이 **경계 reopen** 이다 (v17):
 * 지점 데이터를 통째로 보관해 뒀다가, **같은 동으로 재확정되면 복원**하고
 * 다른 동이면 폐기한다 (복원은 `confirmRegion` 이 아니라 여기 stash 를 보고 판단).
 */
export async function reopenStep(input: {
  code: string;
  participantId: string;
}): Promise<{ ok: boolean; error?: string; step?: PhaseStep }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 되돌릴 수 있어요." };
  if (m.archivedAt) return { ok: false, error: "지난 모임은 되돌릴 수 없어요." };

  const step = phaseStepOf(m);
  let clearPlaceVotes = false;

  switch (step) {
    case "result": {
      // '지역까지' 모임은 지점 단계가 없으니 지역 투표로 (v4)
      if (m.scope === "region") {
        m.stage = "chat";
        m.aiPhase = "region";
        m.winnerRegionId = null;
      } else {
        m.stage = "chat";
        m.aiPhase = "place";
        m.placeVoteOpen = true;
        m.winnerPlaceId = null;
      }
      break;
    }
    case "place-vote": {
      // 투표 → 등록. 표는 그대로 둔다(다시 열면 이어서 찍는다).
      m.placeVoteOpen = false;
      m.winnerPlaceId = null;
      break;
    }
    case "place-register": {
      // ── 경계 reopen (v17) — 지점 데이터를 보관하고 지역 투표로 돌아간다 ──
      if (m.winnerRegionId) {
        m.stashedPlaces = {
          regionId: m.winnerRegionId,
          places: m.places,
          votes: { ...(m.placeVotes ?? {}) },
        };
      }
      m.places = [];
      m.placeVotes = {};
      m.placeVoteOpen = false;
      m.winnerPlaceId = null;
      m.winnerRegionId = null;
      m.aiPhase = "region";
      m.stage = "chat";
      m.radiusM = 700;
      clearPlaceVotes = true;
      break;
    }
    case "region-vote": {
      m.stage = "main";
      m.aiPhase = "region";
      m.winnerRegionId = null;
      break;
    }
    case "region-register":
      return { ok: false, error: "더 되돌릴 단계가 없어요." };
  }

  const next = phaseStepOf(m);
  pushMsg(m, "system", "", `🔄 방장이 이전 단계로 되돌렸어요 (${STEP_LABEL[next]}).`);
  await write(m);
  if (clearPlaceVotes) await clearVotes(m.code, "place");
  return { ok: true, step: next };
}

const STEP_LABEL: Record<PhaseStep, string> = {
  "region-register": "지역 후보 등록",
  "region-vote": "지역 투표",
  "place-register": "지점 후보 등록",
  "place-vote": "지점 투표",
  result: "결과",
};

export async function reopenDiscussion(
  input: { code: string; participantId: string; target: "region" | "place" },
  opts?: { regions?: RegionCandidate[] }
): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 되돌릴 수 있어요." };

  if (input.target === "region") {
    // 지역부터 다시 — 후보 재계산(늦게 합류/출발지 변경 반영)
    m.winnerRegionId = null;
    m.winnerPlaceId = null;
    m.places = [];
    m.aiPhase = "region";
    m.stage = "chat";
    m.regionVotes = {};
    m.placeVotes = {};
    if (opts?.regions?.length) m.regions = opts.regions;
    pushMsg(m, "system", "", "🔄 방장이 중간지역 논의를 다시 열었어요. 의견을 말해주세요!");
    await write(m);
    await clearVotes(m.code);
  } else {
    if (!m.winnerRegionId) return { ok: false, error: "확정된 지역이 없어요." };
    m.winnerPlaceId = null;
    m.placeVotes = {};
    m.aiPhase = "place";
    m.stage = "chat";
    pushMsg(m, "system", "", "🔄 방장이 장소 논의를 다시 열었어요. 어디가 좋을까요?");
    await write(m);
    await clearVotes(m.code, "place");
  }
  return { ok: true };
}

// ── 처음으로 (Leader) ──
export async function backToMain(input: { code: string; participantId: string }): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 조작할 수 있어요." };
  m.stage = "main";
  m.aiPhase = "region";
  m.winnerRegionId = null;
  m.winnerPlaceId = null;
  m.places = [];
  m.regionVotes = {};
  m.placeVotes = {};
  m.reservation = null;
  await write(m);
  await clearVotes(m.code);
  return { ok: true };
}

// ── 유료서비스: 가게 예약 > 결제(선입금) — 모의결제 ──
export async function reserve(input: {
  code: string;
  participantId: string;
  placeId: string;
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const place = m.places.find((p) => p.id === input.placeId);
  if (!place) return { ok: false, error: "가게를 찾을 수 없어요." };
  if (!place.reservable) return { ok: false, error: "예약 불가한 가게예요." };
  // ⚠️ 모임 **정원**(`m.headcount`)이 아니라 **실제 참여자 수**로 센다.
  //    정원 8명·참여 2명인 모임에서 화면은 "참여자 2명"인데 결제는 "× 8명"이었다
  //    (2026-08-06 실측 — CEO 결정으로 참여자 수 기준으로 통일).
  //    ⚠️ `ResultSection.tsx`(미리보기)·`ReserveModal.tsx`(모달)와 **같은 기준이어야 한다.**
  //       셋 중 하나만 고치면 "미리보기 20,000원 → 결제하니 80,000원"이 된다.
  const headcount = m.participants.length;
  const total = place.depositPerHead * headcount;
  m.reservation = {
    placeId: place.id,
    headcount,
    depositPerHead: place.depositPerHead,
    total,
    status: "paid",
    paidAt: new Date().toISOString(),
  };
  await write(m);
  return { ok: true };
}

// ── 상태 조회 (비밀번호 제외) ──
export async function getState(code: string): Promise<MeetingState | null> {
  const m = await read(code);
  if (!m) return null;
  // v9: 스케줄러가 없으므로 **읽을 때** '지난 모임' 전환을 판정한다.
  //     전환은 한 번뿐이라 폴링이 잦아도 쓰기는 한 번이다.
  await archiveIfDue(m);
  return {
    code: m.code,
    name: m.name,
    headcount: m.headcount,
    leaderName: m.leaderName,
    stage: m.stage,
    aiPhase: m.aiPhase,
    aiBusy: aiBusy.get(m.code) ?? false,
    participants: m.participants,
    regions: m.regions,
    places: m.places,
    chat: m.chat.slice(-80),
    prefs: m.prefs,
    winnerRegion: m.regions.find((r) => r.id === m.winnerRegionId) ?? null,
    winnerPlace: m.places.find((p) => p.id === m.winnerPlaceId) ?? null,
    regionVotes: m.regionVotes ?? {},
    placeVotes: m.placeVotes ?? {},
    reservation: m.reservation,
    originsSet: m.participants.filter((p) => p.lat != null).length,
    totalParticipants: m.participants.length,
    overCapacity: m.participants.length > m.headcount,
    // ── v19 ── 화면이 확정 범위·단계·읽기전용 여부를 여기서만 읽는다
    scope: m.scope,
    purposeCategory: m.purposeCategory,
    meetTime: m.meetTime,
    placeVoteOpen: m.placeVoteOpen,
    radiusM: m.radiusM,
    archivedAt: m.archivedAt,
    isPast: m.archivedAt != null,
  };
}

export const storeInfo = { backend: hasDb ? ("neon" as const) : ("memory" as const) };
