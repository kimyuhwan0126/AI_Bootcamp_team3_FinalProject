// ─────────────────────────────────────────────────────────────
// store.ts — 데이터 계층 (v2: 투표 → AI 대화)
//
//  · 기본: 인메모리 스토어 (기기에서 즉시 실행 / 데모용)
//  · DATABASE_URL 설정 시: Neon(Postgres)로 확장 (schema.sql 참고)
//
//  Vercel 서버리스에서는 인스턴스 간 메모리가 공유되지 않으므로
//  운영 배포는 반드시 Neon(DATABASE_URL)을 사용하세요.
// ─────────────────────────────────────────────────────────────
import type {
  Meeting,
  MeetingState,
  Participant,
  Transport,
  RegionCandidate,
  PlaceCandidate,
  ChatMsg,
} from "./types";
import { geocode, recommendRegions, generatePlaces } from "./geo";

const USE_NEON = !!process.env.DATABASE_URL;

// HMR/serverless 재로드에도 살아남도록 globalThis에 보관
const g = globalThis as unknown as {
  __moimer?: Map<string, Meeting>;
  __moimerAiBusy?: Map<string, boolean>;
};
const meetings: Map<string, Meeting> = g.__moimer ?? new Map();
if (!g.__moimer) g.__moimer = meetings;
// AI가 판단 중인 모임 표시 (UI: "AI 생각 중…")
const aiBusy: Map<string, boolean> = g.__moimerAiBusy ?? new Map();
if (!g.__moimerAiBusy) g.__moimerAiBusy = aiBusy;

function genCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return meetings.has(c) ? genCode() : c;
}
function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function getMeeting(code: string): Meeting | undefined {
  return meetings.get(code.toUpperCase());
}
export function setAiBusy(code: string, busy: boolean) {
  aiBusy.set(code.toUpperCase(), busy);
}

// ── 생성 (Leader: 모임방 개설 — 모임이름, 비번, 인원수) ──
export function createMeeting(input: {
  name: string;
  password: string;
  headcount: number;
  leaderName: string;
}): { code: string; leaderId: string } {
  const code = genCode();
  const leaderId = genId("u_");
  const leader: Participant = {
    id: leaderId,
    name: input.leaderName || "방장",
    isLeader: true,
    headcount: 1,
    origin: null,
    lat: null,
    lng: null,
    transport: "transit",
  };
  const meeting: Meeting = {
    code,
    name: input.name,
    password: input.password,
    headcount: Math.max(1, input.headcount || 1),
    leaderName: leader.name,
    stage: "main",
    aiPhase: "region",
    participants: [leader],
    regions: [],
    places: [],
    chat: [],
    winnerRegionId: null,
    winnerPlaceId: null,
    reservation: null,
    createdAt: new Date().toISOString(),
  };
  meetings.set(code, meeting);
  return { code, leaderId };
}

// ── 참여 (User: 모임이름/코드 + 비번 > 참여) ──
export function joinMeeting(input: {
  code: string;
  password: string;
  name: string;
  headcount?: number;
  ignoreCapacity?: boolean;
}): { ok: true; participantId: string } | { ok: false; error: string } {
  const m = meetings.get(input.code.toUpperCase());
  if (!m) return { ok: false, error: "모임을 찾을 수 없어요. 코드를 확인해 주세요." };
  if (m.password !== input.password) return { ok: false, error: "비밀번호가 일치하지 않아요." };
  if (!input.ignoreCapacity && m.participants.length >= m.headcount) {
    return { ok: false, error: `정원이 가득 찼어요 (${m.participants.length}/${m.headcount}명). 방장에게 정원 상향을 요청하세요.` };
  }
  const id = genId("u_");
  const name = input.name || `참가자${m.participants.length}`;
  m.participants.push({
    id,
    name,
    isLeader: false,
    headcount: Math.max(1, input.headcount || 1),
    origin: null,
    lat: null,
    lng: null,
    transport: "transit",
  });
  // 대화가 이미 시작됐다면 합류 사실을 채팅에도 알림 (AI가 새 참가자를 인지)
  if (m.stage === "chat") {
    pushMsg(m, "system", "", `${name} 님이 모임에 합류했어요.`);
  }
  return { ok: true, participantId: id };
}

// ── 출발지 등록 (User) ──
export function setOrigin(input: {
  code: string;
  participantId: string;
  origin: string;
  transport: Transport;
}): { ok: boolean; error?: string } {
  const m = meetings.get(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자 없음" };
  p.origin = input.origin;
  p.transport = input.transport;
  const c = geocode(input.origin);
  p.lat = c.lat;
  p.lng = c.lng;
  return { ok: true };
}

// ── 출발지 등록(좌표 주입 버전) — 실 지오코딩 결과를 라우트에서 전달 ──
export function setOriginCoords(input: {
  code: string;
  participantId: string;
  origin: string;
  transport: Transport;
  lat: number;
  lng: number;
}): { ok: boolean; error?: string } {
  const m = meetings.get(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자 없음" };
  p.origin = input.origin;
  p.transport = input.transport;
  p.lat = input.lat;
  p.lng = input.lng;
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
export function openChat(
  input: { code: string; participantId: string },
  opts?: { regions?: RegionCandidate[] }
): { ok: boolean; error?: string } {
  const m = meetings.get(input.code);
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
      `다른 동네가 좋으면 이름만 말해주세요 — 이동시간을 바로 계산해 드릴게요 🙂`
  );
  return { ok: true };
}

// 사용자 채팅 추가
export function appendUserChat(input: {
  code: string;
  participantId: string;
  text: string;
}): { ok: boolean; error?: string } {
  const m = meetings.get(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.stage !== "chat") return { ok: false, error: "지금은 대화 단계가 아니에요." };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p) return { ok: false, error: "참가자 없음" };
  const text = input.text.trim().slice(0, 500);
  if (!text) return { ok: false, error: "빈 메시지" };
  pushMsg(m, "user", p.name, text);
  return { ok: true };
}

// AI/시스템 메시지 추가 (lib/ai.ts에서 사용)
export function appendAiChat(code: string, text: string) {
  const m = meetings.get(code.toUpperCase());
  if (m) pushMsg(m, "ai", "AI", text);
}
export function appendSystemChat(code: string, text: string) {
  const m = meetings.get(code.toUpperCase());
  if (m) pushMsg(m, "system", "", text);
}

// ── 지역 확정 (AI 도구 또는 방장 수동) ──
//  regionId: 기존 후보 id / 또는 커스텀 후보 객체(후보 밖 지역 합의 시)
export function confirmRegion(
  input: {
    code: string;
    regionId?: string;
    custom?: RegionCandidate;
    by: "ai" | "leader";
  },
  opts?: { places?: PlaceCandidate[] } // 카카오 실검색 결과 주입(없으면 mock)
): { ok: boolean; error?: string; regionName?: string } {
  const m = meetings.get(input.code.toUpperCase());
  if (!m) return { ok: false, error: "모임 없음" };
  if (m.stage !== "chat") return { ok: false, error: "대화 단계가 아니에요." };
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
  m.places = opts?.places?.length ? opts.places : generatePlaces(region.name);
  m.aiPhase = "place";
  pushMsg(
    m,
    "system",
    "",
    `📍 중간지역이 ${region.name}(으)로 확정됐어요 (${input.by === "ai" ? "AI 합의 판단" : "방장 확정"}). 이제 장소를 정해요.`
  );
  return { ok: true, regionName: region.name };
}

// ── 장소 확정 (AI 도구 또는 방장 수동) → 결과 화면 ──
export function confirmPlace(input: {
  code: string;
  placeId: string;
  by: "ai" | "leader";
}): { ok: boolean; error?: string; placeName?: string } {
  const m = meetings.get(input.code.toUpperCase());
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
    `🎉 ${place.name}(으)로 최종 확정! (${input.by === "ai" ? "AI 합의 판단" : "방장 확정"})`
  );
  return { ok: true, placeName: place.name };
}

// ── 다시 논의 (Leader): 장소 단계 → 지역 단계로, 결과 → 장소 단계로 ──
export function reopenDiscussion(
  input: { code: string; participantId: string; target: "region" | "place" },
  opts?: { regions?: RegionCandidate[] }
): { ok: boolean; error?: string } {
  const m = meetings.get(input.code.toUpperCase());
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
    if (opts?.regions?.length) m.regions = opts.regions;
    pushMsg(m, "system", "", "🔄 방장이 중간지역 논의를 다시 열었어요. 의견을 말해주세요!");
  } else {
    if (!m.winnerRegionId) return { ok: false, error: "확정된 지역이 없어요." };
    m.winnerPlaceId = null;
    m.aiPhase = "place";
    m.stage = "chat";
    pushMsg(m, "system", "", "🔄 방장이 장소 논의를 다시 열었어요. 어디가 좋을까요?");
  }
  return { ok: true };
}

// ── 처음으로 (Leader) ──
export function backToMain(input: { code: string; participantId: string }): { ok: boolean; error?: string } {
  const m = meetings.get(input.code.toUpperCase());
  if (!m) return { ok: false, error: "모임 없음" };
  const p = m.participants.find((x) => x.id === input.participantId);
  if (!p?.isLeader) return { ok: false, error: "방장만 조작할 수 있어요." };
  m.stage = "main";
  m.aiPhase = "region";
  m.winnerRegionId = null;
  m.winnerPlaceId = null;
  m.places = [];
  m.reservation = null;
  return { ok: true };
}

// ── 유료서비스: 가게 예약 > 결제(선입금) — 모의결제 ──
export function reserve(input: {
  code: string;
  participantId: string;
  placeId: string;
}): { ok: boolean; error?: string } {
  const m = meetings.get(input.code);
  if (!m) return { ok: false, error: "모임 없음" };
  const place = m.places.find((p) => p.id === input.placeId);
  if (!place) return { ok: false, error: "가게를 찾을 수 없어요." };
  if (!place.reservable) return { ok: false, error: "예약 불가한 가게예요." };
  const total = place.depositPerHead * m.headcount;
  m.reservation = {
    placeId: place.id,
    headcount: m.headcount,
    depositPerHead: place.depositPerHead,
    total,
    status: "paid",
    paidAt: new Date().toISOString(),
  };
  return { ok: true };
}

// ── 상태 조회 (비밀번호 제외) ──
export function getState(code: string): MeetingState | null {
  const m = meetings.get(code.toUpperCase());
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
    winnerRegion: m.regions.find((r) => r.id === m.winnerRegionId) ?? null,
    winnerPlace: m.places.find((p) => p.id === m.winnerPlaceId) ?? null,
    reservation: m.reservation,
    originsSet: m.participants.filter((p) => p.lat != null).length,
    totalParticipants: m.participants.length,
    overCapacity: m.participants.length > m.headcount,
  };
}

export const storeInfo = { backend: USE_NEON ? "neon" : ("memory" as const) };
