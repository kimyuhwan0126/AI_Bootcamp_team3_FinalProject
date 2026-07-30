// ─────────────────────────────────────────────────────────────
// persistence.ts — Meeting 객체 ↔ Supabase 행 매핑
//
//  store.ts 의 도메인 로직은 그대로 Meeting 객체를 만지고, 이 파일이
//  그 객체를 DB에 넣고 꺼내는 일만 맡는다(스키마: supabase/schema.sql).
//
//  쓰기 단위를 셋으로 나눠 두었다 —
//    saveMeeting        : 방장·AI만 바꾸는 값(단계·후보·대화·선호·예약)
//    upsertParticipant  : 참가자 한 명 (출발지·이동수단·도착 신호등)
//    setVote / clearVotes : 투표 한 표
//  같은 모임을 여러 사람이 동시에 쓰는 화면이라, 참가자·투표를 모임 행에
//  같이 담으면 마지막 쓰기가 앞선 쓰기를 덮어써서 표가 사라진다.
// ─────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import type { Meeting, Participant, Transport, ArrivalSelfStatus } from "./types";

// ── 행 타입 (스키마와 1:1) ──
interface MeetingRow {
  code: string;
  name: string;
  password: string;
  headcount: number;
  leader_name: string;
  stage: string;
  ai_phase: string;
  winner_region_id: string | null;
  winner_place_id: string | null;
  regions: unknown;
  places: unknown;
  chat: unknown;
  prefs: unknown;
  reservation: unknown;
  created_at: string;
}
interface ParticipantRow {
  id: string;
  code: string;
  name: string;
  is_leader: boolean;
  headcount: number;
  origin: string | null;
  lat: number | null;
  lng: number | null;
  transport: string;
  status: string | null;
  eta_text: string | null;
  joined_at: string;
}
interface VoteRow {
  target: string;
  participant_id: string;
  candidate_id: string;
}

function toParticipant(r: ParticipantRow): Participant {
  return {
    id: r.id,
    name: r.name,
    isLeader: r.is_leader,
    headcount: r.headcount,
    origin: r.origin,
    lat: r.lat,
    lng: r.lng,
    transport: (r.transport === "car" ? "car" : "transit") as Transport,
    status: (r.status === "green" || r.status === "yellow" || r.status === "red"
      ? r.status
      : null) as ArrivalSelfStatus,
    etaText: r.eta_text,
  };
}

function participantRow(code: string, p: Participant): ParticipantRow {
  return {
    id: p.id,
    code,
    name: p.name,
    is_leader: p.isLeader,
    headcount: p.headcount,
    origin: p.origin,
    lat: p.lat,
    lng: p.lng,
    transport: p.transport,
    status: p.status,
    eta_text: p.etaText,
    // joined_at 은 DB default 를 쓴다 — upsert 시 값을 보내면 참여 시각이 갱신돼
    // 참가자 순서(방장 다음이 누구인지)가 뒤바뀐다.
  } as ParticipantRow;
}

/** 모임 하나를 통째로 읽어 Meeting 객체로 복원. 없으면 null */
export async function loadMeeting(code: string): Promise<Meeting | null> {
  if (!supabase) return null;
  const key = code.toUpperCase();

  const { data: mRow, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("code", key)
    .maybeSingle<MeetingRow>();
  if (error || !mRow) return null;

  // 참가자는 참여 순서대로 — 방장이 항상 맨 앞에 오도록
  const [{ data: pRows }, { data: vRows }] = await Promise.all([
    supabase
      .from("participants")
      .select("*")
      .eq("code", key)
      .order("joined_at", { ascending: true })
      .returns<ParticipantRow[]>(),
    supabase.from("votes").select("target, participant_id, candidate_id").eq("code", key).returns<VoteRow[]>(),
  ]);

  const regionVotes: Record<string, string> = {};
  const placeVotes: Record<string, string> = {};
  for (const v of vRows ?? []) {
    (v.target === "place" ? placeVotes : regionVotes)[v.participant_id] = v.candidate_id;
  }

  return {
    code: mRow.code,
    name: mRow.name,
    password: mRow.password,
    headcount: mRow.headcount,
    leaderName: mRow.leader_name,
    stage: mRow.stage as Meeting["stage"],
    aiPhase: mRow.ai_phase as Meeting["aiPhase"],
    participants: (pRows ?? []).map(toParticipant),
    regions: (mRow.regions ?? []) as Meeting["regions"],
    places: (mRow.places ?? []) as Meeting["places"],
    chat: (mRow.chat ?? []) as Meeting["chat"],
    prefs: (mRow.prefs ?? {}) as Meeting["prefs"],
    winnerRegionId: mRow.winner_region_id,
    winnerPlaceId: mRow.winner_place_id,
    regionVotes,
    placeVotes,
    reservation: (mRow.reservation ?? null) as Meeting["reservation"],
    createdAt: mRow.created_at,
  };
}

/** 이미 쓰인 초대 코드인지 — 코드 생성 시 충돌 회피용 */
export async function meetingExists(code: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase
    .from("meetings")
    .select("code")
    .eq("code", code.toUpperCase())
    .maybeSingle<{ code: string }>();
  return !!data;
}

/**
 * 모임 행 저장 (참가자·투표는 건드리지 않는다).
 * 새 모임이면 insert, 기존 모임이면 update 로 동작하도록 upsert 를 쓴다.
 */
export async function saveMeeting(m: Meeting): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("meetings").upsert(
    {
      code: m.code,
      name: m.name,
      password: m.password,
      headcount: m.headcount,
      leader_name: m.leaderName,
      stage: m.stage,
      ai_phase: m.aiPhase,
      winner_region_id: m.winnerRegionId,
      winner_place_id: m.winnerPlaceId,
      regions: m.regions,
      places: m.places,
      chat: m.chat,
      prefs: m.prefs,
      reservation: m.reservation,
    },
    { onConflict: "code" }
  );
  if (error) throw new Error(`모임 저장 실패: ${error.message}`);
}

/** 참가자 한 명 저장(추가/수정 공용) */
export async function upsertParticipant(code: string, p: Participant): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("participants")
    .upsert(participantRow(code.toUpperCase(), p), { onConflict: "id" });
  if (error) throw new Error(`참가자 저장 실패: ${error.message}`);
}

/** 참가자 여러 명 저장 — 모임 생성 직후처럼 한 번에 넣을 때 */
export async function upsertParticipants(code: string, ps: Participant[]): Promise<void> {
  if (!supabase || ps.length === 0) return;
  const { error } = await supabase
    .from("participants")
    .upsert(ps.map((p) => participantRow(code.toUpperCase(), p)), { onConflict: "id" });
  if (error) throw new Error(`참가자 저장 실패: ${error.message}`);
}

/**
 * 표 하나를 기록/취소.
 * candidateId=null 이면 표를 지운다(투표 취소).
 * (code, target, participant_id) 가 PK라 DB가 1인 1표를 보장한다.
 */
export async function setVote(
  code: string,
  target: "region" | "place",
  participantId: string,
  candidateId: string | null
): Promise<void> {
  if (!supabase) return;
  const key = code.toUpperCase();
  if (!candidateId) {
    const { error } = await supabase
      .from("votes")
      .delete()
      .eq("code", key)
      .eq("target", target)
      .eq("participant_id", participantId);
    if (error) throw new Error(`투표 취소 실패: ${error.message}`);
    return;
  }
  const { error } = await supabase.from("votes").upsert(
    { code: key, target, participant_id: participantId, candidate_id: candidateId },
    { onConflict: "code,target,participant_id" }
  );
  if (error) throw new Error(`투표 저장 실패: ${error.message}`);
}

/** 한 단계의 표를 전부 비운다 — 후보가 바뀌면 기존 표는 의미가 없다 */
export async function clearVotes(code: string, target?: "region" | "place"): Promise<void> {
  if (!supabase) return;
  let q = supabase.from("votes").delete().eq("code", code.toUpperCase());
  if (target) q = q.eq("target", target);
  const { error } = await q;
  if (error) throw new Error(`투표 초기화 실패: ${error.message}`);
}
