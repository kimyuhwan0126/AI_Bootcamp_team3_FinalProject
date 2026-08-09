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
import { MAX_PARTICIPANTS } from "./types";
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
  m.places = opts?.places?.length
    ? opts.places
    : generatePlaces(region.name, { lat: region.lat, lng: region.lng });
  m.aiPhase = "place";
  m.stage = "chat"; // 메인에서 확정한 경우에도 가게 단계로 넘어간다
  m.placeVotes = {};
  pushMsg(
    m,
    "system",
    "",
    `📍 중간지역이 ${region.name}(으)로 확정됐어요 (${
      input.by === "vote" ? "투표 결과" : input.by === "ai" ? "AI 합의 판단" : "방장 확정"
    }). 이제 장소를 정해요.`
  );
  await write(m);
  // 가게 후보가 새로 만들어졌으니 이전 가게 표는 의미가 없다
  await clearVotes(m.code, "place");
  return { ok: true, regionName: region.name };
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
}): Promise<Result> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자를 찾을 수 없어요." };
  p.status = input.status;
  if (input.etaText !== undefined) p.etaText = input.etaText?.trim().slice(0, 40) || null;
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
}): Promise<{ ok: boolean; error?: string; candidate?: RegionCandidate; existing?: boolean }> {
  const m = await read(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.stage === "result") return { ok: false, error: "이미 끝난 모임이에요." };
  if (m.aiPhase !== "region") return { ok: false, error: "이미 거점이 확정됐어요." };

  // 같은 지역 중복 등록 방지 (공백 무시 비교)
  const norm = (s: string) => s.replace(/\s/g, "");
  const dup = m.regions.find((r) => norm(r.name) === norm(input.name));
  if (dup) return { ok: true, candidate: dup, existing: true };

  if (m.regions.length >= 8) return { ok: false, error: "후보는 최대 8개까지예요. 기존 후보로 투표해주세요." };

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

  // 참가자가 직접 등록한 후보(rc_*)는 재계산에 밀려 사라지면 안 된다.
  // 호출자(regions 액션)가 지표를 갱신해 함께 넘기는 게 정석이지만,
  // 빠뜨린 호출이 있어도 유실되지 않게 여기서 한 번 더 보존한다.
  const passedIds = new Set(regions.map((r) => r.id));
  const keptProposals = m.regions.filter((r) => r.id.startsWith("rc_") && !passedIds.has(r.id));
  const nextList = [...regions, ...keptProposals];

  // ⚠️ 자동 후보 id 는 순위(r1·r2·r3)라 후보가 완전히 바뀌어도 그대로다 —
  //    id 로 비교하면 "달라졌는지"를 절대 감지할 수 없어(예전 버그),
  //    엉뚱한 지역에 찍힌 표가 그대로 남았다. 지역 이름으로 비교한다.
  const prev = m.regions.map((r) => r.name).join(",");
  const next = nextList.map((r) => r.name).join(",");
  // 후보가 그대로면 쓸 이유가 없다 — 1.8초 폴링마다 DB에 쓰지 않도록 막는다
  if (prev === next) return { ok: true };

  m.regions = nextList;
  m.regionVotes = {};
  await write(m);
  // 후보가 달라졌으니 기존 표는 의미가 없다 (출발지가 바뀌어 지표가 전부 달라진 상황)
  await clearVotes(m.code, "region");
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
