// ─────────────────────────────────────────────────────────────
// persistence.ts — Meeting 객체 ↔ DB(Neon Postgres) 행 매핑
//
//  store.ts 의 도메인 로직은 그대로 Meeting 객체를 만지고, 이 파일이
//  그 객체를 DB에 넣고 꺼내는 일만 맡는다(스키마: db/schema.sql).
//
//  쓰기 단위를 셋으로 나눠 두었다 —
//    saveMeeting        : 방장·AI만 바꾸는 값(단계·후보·대화·선호·예약)
//    upsertParticipant  : 참가자 한 명 (출발지·이동수단·도착 신호등)
//    setVote / clearVotes : 투표 한 표
//  같은 모임을 여러 사람이 동시에 쓰는 화면이라, 참가자·투표를 모임 행에
//  같이 담으면 마지막 쓰기가 앞선 쓰기를 덮어써서 표가 사라진다.
//
//  Supabase 시절과 달리 쿼리는 전부 SQL 직접 작성이다. upsert 는
//  `insert … on conflict … do update` 로, PK 가 의미를 지킨다:
//    meetings(code) · participants(id) · votes(code,target,participant_id)=1인1표
// ─────────────────────────────────────────────────────────────
import { db } from "./db";
import type {
  Meeting, Participant, Transport, ArrivalSelfStatus, PurposeCategory,
} from "./types";
import { PURPOSE_LABELS } from "./types";

/**
 * DB 의 목적 카테고리 문자열을 좁은 타입으로. 모르는 값이면 null.
 * (컬럼이 text 라 어떤 문자열이든 들어올 수 있다 — `as` 로 우겨넣지 않는다)
 */
function toPurpose(v: string | null | undefined): PurposeCategory | null {
  return v && v in PURPOSE_LABELS ? (v as PurposeCategory) : null;
}

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
  created_at: string | Date;
  // ── v19 (001_v19_설계정렬.sql) ──
  // 마이그레이션을 아직 안 돌린 DB 도 있을 수 있어 전부 optional 로 읽고
  // 아래 매핑에서 기본값을 채운다 — 컬럼이 없으면 undefined 로 온다.
  scope?: string | null;
  purpose_category?: string | null;
  meet_time?: string | Date | null;
  place_vote_open?: boolean | null;
  radius_m?: number | null;
  stashed_places?: unknown;
  archived_at?: string | Date | null;
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
  // ── v19 ──
  pin?: string | null;
  pin_fails?: number | null;
  kakao_id?: string | null;
  late_min?: number | null;
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
    // ── v19 ── 마이그레이션 전 DB 는 컬럼이 없어 undefined 로 온다 → 기본값으로 채운다
    pin: r.pin ?? null,
    pinFails: r.pin_fails ?? 0,
    kakaoId: r.kakao_id ?? null,
    lateMin: r.late_min ?? null,
  };
}

// Neon(pg-types)은 timestamptz 를 Date 객체로 돌려준다. 도메인은 문자열을 쓴다.
function isoOf(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

/** 모임 하나를 통째로 읽어 Meeting 객체로 복원. 없으면 null */
export async function loadMeeting(code: string): Promise<Meeting | null> {
  if (!db) return null;
  const key = code.toUpperCase();

  try {
    const mRows = (await db`select * from meetings where code = ${key} limit 1`) as unknown as MeetingRow[];
    const mRow = mRows[0];
    if (!mRow) return null;

    // 참가자는 참여 순서대로 — 방장이 항상 맨 앞에 오도록.
    // 참가자 순서는 화면에 그대로 쓰인다 — 칩·지도 핀 색이 PIN_COLORS[순번] 이라
    // 폴링(1.8초)마다 순서가 흔들리면 사람마다 색이 계속 바뀐다.
    // joined_at 만으로는 동순위가 생길 수 있으므로(Postgres now()는 트랜잭션
    // 시작 시각이라 같은 문장에서 넣은 행끼리 값이 같다), PK(id)까지 걸어
    // 순서를 완전히 결정적으로 만든다.
    const [pRows, vRows] = await Promise.all([
      db`select * from participants where code = ${key}
         order by is_leader desc, joined_at asc, id asc` as unknown as Promise<ParticipantRow[]>,
      db`select target, participant_id, candidate_id from votes where code = ${key}` as unknown as Promise<VoteRow[]>,
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
      createdAt: isoOf(mRow.created_at),
      // ── v19 ──
      // 옛 행(마이그레이션 전 또는 v19 이전 생성)은 값이 없다.
      // 기본값은 **새 모임과 같은 값**으로 맞춘다 — 옛 모임이 열렸을 때
      // '지점까지 · 700m · 지점 투표 안 열림' 이라는 자연스러운 상태가 된다.
      scope: mRow.scope === "region" ? "region" : "place",
      purposeCategory: toPurpose(mRow.purpose_category),
      meetTime: mRow.meet_time ? isoOf(mRow.meet_time) : null,
      placeVoteOpen: mRow.place_vote_open ?? false,
      radiusM: mRow.radius_m === 1400 ? 1400 : 700,
      stashedPlaces: (mRow.stashed_places ?? null) as Meeting["stashedPlaces"],
      archivedAt: mRow.archived_at ? isoOf(mRow.archived_at) : null,
    };
  } catch {
    // 접속 실패는 "모임 없음"과 같게 처리한다 — Supabase 시절과 동일한 동작.
    // (원인 진단은 /api/status 가 맡는다)
    return null;
  }
}

/** 이미 쓰인 초대 코드인지 — 코드 생성 시 충돌 회피용 */
export async function meetingExists(code: string): Promise<boolean> {
  if (!db) return false;
  try {
    const rows = (await db`select code from meetings where code = ${code.toUpperCase()} limit 1`) as unknown as {
      code: string;
    }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * 모임 행 저장 (참가자·투표는 건드리지 않는다).
 * 새 모임이면 insert, 기존 모임이면 update — PK(code) upsert.
 * jsonb 값은 명시적으로 문자열화해 ::jsonb 로 캐스팅한다(드라이버 차이에 안 흔들리게).
 */
export async function saveMeeting(m: Meeting): Promise<void> {
  if (!db) return;
  try {
    await db`
      insert into meetings
        (code, name, password, headcount, leader_name, stage, ai_phase,
         winner_region_id, winner_place_id, regions, places, chat, prefs, reservation,
         scope, purpose_category, meet_time, place_vote_open, radius_m, stashed_places, archived_at)
      values
        (${m.code}, ${m.name}, ${m.password}, ${m.headcount}, ${m.leaderName}, ${m.stage}, ${m.aiPhase},
         ${m.winnerRegionId}, ${m.winnerPlaceId},
         ${JSON.stringify(m.regions ?? [])}::jsonb, ${JSON.stringify(m.places ?? [])}::jsonb,
         ${JSON.stringify(m.chat ?? [])}::jsonb, ${JSON.stringify(m.prefs ?? {})}::jsonb,
         ${m.reservation ? JSON.stringify(m.reservation) : null}::jsonb,
         ${m.scope}, ${m.purposeCategory}, ${m.meetTime}, ${m.placeVoteOpen}, ${m.radiusM},
         ${m.stashedPlaces ? JSON.stringify(m.stashedPlaces) : null}::jsonb, ${m.archivedAt})
      on conflict (code) do update set
        name = excluded.name,
        password = excluded.password,
        headcount = excluded.headcount,
        leader_name = excluded.leader_name,
        stage = excluded.stage,
        ai_phase = excluded.ai_phase,
        winner_region_id = excluded.winner_region_id,
        winner_place_id = excluded.winner_place_id,
        regions = excluded.regions,
        places = excluded.places,
        chat = excluded.chat,
        prefs = excluded.prefs,
        reservation = excluded.reservation,
        scope = excluded.scope,
        purpose_category = excluded.purpose_category,
        meet_time = excluded.meet_time,
        place_vote_open = excluded.place_vote_open,
        radius_m = excluded.radius_m,
        stashed_places = excluded.stashed_places,
        archived_at = excluded.archived_at`;
  } catch (e) {
    throw new Error(`모임 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// joined_at 은 insert 시 DB default 를 쓰고 update 에서 건드리지 않는다 —
// 값을 보내면 참여 시각이 갱신돼 참가자 순서(방장 다음이 누구인지)가 뒤바뀐다.
async function upsertOne(code: string, p: Participant): Promise<void> {
  if (!db) return;
  await db`
    insert into participants
      (id, code, name, is_leader, headcount, origin, lat, lng, transport, status, eta_text,
       pin, pin_fails, kakao_id, late_min)
    values
      (${p.id}, ${code}, ${p.name}, ${p.isLeader}, ${p.headcount}, ${p.origin},
       ${p.lat}, ${p.lng}, ${p.transport}, ${p.status}, ${p.etaText},
       ${p.pin}, ${p.pinFails}, ${p.kakaoId}, ${p.lateMin})
    on conflict (id) do update set
      code = excluded.code,
      name = excluded.name,
      is_leader = excluded.is_leader,
      headcount = excluded.headcount,
      origin = excluded.origin,
      lat = excluded.lat,
      lng = excluded.lng,
      transport = excluded.transport,
      status = excluded.status,
      eta_text = excluded.eta_text,
      pin = excluded.pin,
      pin_fails = excluded.pin_fails,
      kakao_id = excluded.kakao_id,
      late_min = excluded.late_min`;
}

/** 참가자 한 명 저장(추가/수정 공용) */
export async function upsertParticipant(code: string, p: Participant): Promise<void> {
  if (!db) return;
  try {
    await upsertOne(code.toUpperCase(), p);
  } catch (e) {
    throw new Error(`참가자 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 참가자 여러 명 저장 — 모임 생성 직후처럼 한 번에 넣을 때 */
export async function upsertParticipants(code: string, ps: Participant[]): Promise<void> {
  if (!db || ps.length === 0) return;
  try {
    const key = code.toUpperCase();
    // 생성 직후 방장 1명이 대부분이라 행 수가 작다 — 단순 반복으로 충분하다.
    for (const p of ps) await upsertOne(key, p);
  } catch (e) {
    throw new Error(`참가자 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 표 하나를 기록/취소.
 * candidateId=null 이면 표를 지운다(투표 취소).
 * (code, target, participant_id) 가 PK라 DB가 1인 1표를 보장한다 —
 * 같은 사람이 다른 후보를 누르면 insert 가 아니라 update 로 표가 "옮겨진다".
 */
export async function setVote(
  code: string,
  target: "region" | "place",
  participantId: string,
  candidateId: string | null
): Promise<void> {
  if (!db) return;
  const key = code.toUpperCase();
  if (!candidateId) {
    try {
      await db`delete from votes
               where code = ${key} and target = ${target} and participant_id = ${participantId}`;
    } catch (e) {
      throw new Error(`투표 취소 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }
  try {
    await db`
      insert into votes (code, target, participant_id, candidate_id)
      values (${key}, ${target}, ${participantId}, ${candidateId})
      on conflict (code, target, participant_id) do update set
        candidate_id = excluded.candidate_id`;
  } catch (e) {
    throw new Error(`투표 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 한 단계의 표를 전부 비운다 — 후보가 바뀌면 기존 표는 의미가 없다 */
/**
 * 참가자 한 명을 지운다 — 강퇴 (v10).
 * `votes` 는 `participant_id` FK 에 `on delete cascade` 가 걸려 있어 함께 사라진다.
 */
export async function deleteParticipantRow(participantId: string): Promise<void> {
  if (!db) return;
  try {
    await db`delete from participants where id = ${participantId}`;
  } catch (e) {
    throw new Error(`참가자 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 모임을 통째로 지운다 — 방장 삭제 (v10).
 * `participants` · `votes` 는 `code` FK 의 `on delete cascade` 로 함께 사라진다.
 */
export async function deleteMeetingRow(code: string): Promise<void> {
  if (!db) return;
  try {
    await db`delete from meetings where code = ${code.toUpperCase()}`;
  } catch (e) {
    throw new Error(`모임 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function clearVotes(code: string, target?: "region" | "place"): Promise<void> {
  if (!db) return;
  const key = code.toUpperCase();
  try {
    if (target) {
      await db`delete from votes where code = ${key} and target = ${target}`;
    } else {
      await db`delete from votes where code = ${key}`;
    }
  } catch (e) {
    throw new Error(`투표 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}
