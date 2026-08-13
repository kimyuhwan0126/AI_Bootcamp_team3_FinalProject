-- ═══════════════════════════════════════════════════════════════
-- 모이머(Moimer) v8 — DB 스키마 (Neon Postgres)
--
-- 실행 방법: Neon 콘솔 → 프로젝트 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--            (몇 번 다시 실행해도 안전하게 짜여 있다 — if not exists / add column if not exists)
--
-- 설계 원칙
--   · 화면은 항상 "모임 하나 전체"를 읽는다(GET /api/meeting?code=). 그래서
--     후보·대화·선호처럼 통째로만 읽고 쓰는 집합은 jsonb 로 한 행에 둔다.
--   · 반대로 동시에 여러 사람이 각자 쓰는 것(참가자 정보·투표)은 별도 테이블로
--     쪼개 행 단위로 쓴다. 한 행에 몰아넣으면 마지막 쓰기가 앞선 쓰기를
--     덮어써서 표가 사라진다(4명이 동시에 투표하는 화면이라 실제로 발생한다).
--   · 접속은 서버(Next.js API 라우트)만 한다. DATABASE_URL 은 서버 전용이고
--     브라우저에 내려가지 않으므로, Supabase 시절의 RLS 같은 행 단위 보안은
--     두지 않는다 (Neon 에는 anon 키 개념 자체가 없다).
-- ═══════════════════════════════════════════════════════════════

-- ── meetings : 모임 본체 ────────────────────────────────────────
--  방장/AI만 바꾸는 값들이라 한 행에 모아 둔다.
create table if not exists meetings (
  code             text primary key,             -- 초대 코드 (6자, 대문자)
  name             text not null,
  password         text not null,                -- TODO(BE): 해시 처리 (현재 평문 비교)
  headcount        int  not null default 8,      -- 정원
  leader_name      text not null,
  stage            text not null default 'main',   -- main | chat | result
  ai_phase         text not null default 'region', -- region | place | done
  winner_region_id text,
  winner_place_id  text,
  -- 통째로 읽고 쓰는 집합들
  regions          jsonb not null default '[]'::jsonb,  -- RegionCandidate[]
  places           jsonb not null default '[]'::jsonb,  -- PlaceCandidate[]
  chat             jsonb not null default '[]'::jsonb,  -- ChatMsg[] (최근 300개)
  prefs            jsonb not null default '{}'::jsonb,  -- MeetingPrefs (모임 시간 포함)
  reservation      jsonb,                                -- Reservation | null (모의결제)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── participants : 참여자 + 출발지 + 도착 신호등 ─────────────────
--  각자 자기 행만 쓴다 → 출발지 등록·상태 자가신고가 서로 덮어쓰지 않는다.
create table if not exists participants (
  id         text primary key,
  code       text not null references meetings(code) on delete cascade,
  name       text not null,
  is_leader  boolean not null default false,
  headcount  int not null default 1,          -- 이 사람이 데려오는 인원수
  origin     text,                            -- 출발지 텍스트
  lat        double precision,
  lng        double precision,
  transport  text not null default 'transit', -- transit | car
  status     text,                            -- green | yellow | red | null(미신고)
  eta_text   text,                            -- 자가신고 도착 예정 시간(자유 텍스트)
  joined_at  timestamptz not null default now()
);
create index if not exists idx_participants_code on participants(code);

-- ── votes : 거점/가게 투표 (1인 1표) ────────────────────────────
--  primary key (code, target, participant_id) 로 "1인 1표"를 DB가 보장한다.
--  같은 후보를 다시 누르면 행을 지우고(취소), 다른 후보면 upsert 로 옮긴다.
create table if not exists votes (
  code           text not null references meetings(code) on delete cascade,
  target         text not null,                -- region | place
  participant_id text not null references participants(id) on delete cascade,
  candidate_id   text not null,
  voted_at       timestamptz not null default now(),
  primary key (code, target, participant_id)
);
create index if not exists idx_votes_code on votes(code);

-- ── 이미 만들어진 테이블에 뒤늦게 추가된 컬럼 보정 ───────────────
--  (v7 이하 스키마로 먼저 만들어 둔 프로젝트에서도 그대로 Run 할 수 있게)
alter table meetings     add column if not exists prefs       jsonb not null default '{}'::jsonb;
alter table meetings     add column if not exists reservation jsonb;
alter table meetings     add column if not exists updated_at  timestamptz not null default now();
alter table participants add column if not exists status      text;
alter table participants add column if not exists eta_text    text;

-- ── v19 설계 확정판 (migrations/001_v19_설계정렬.sql 반영) ────────
--  자세한 주석은 그 파일에 있다. 여기는 "새로 세팅하는 사람이 이 파일 하나만
--  돌리면 최신 상태가 된다"는 규칙(migrations/README.md §5)을 지키기 위한 사본이다.
alter table meetings     add column if not exists scope            text not null default 'place';
alter table meetings     add column if not exists purpose_category text;
alter table meetings     add column if not exists meet_time        timestamptz;
alter table meetings     add column if not exists place_vote_open  boolean not null default false;
alter table meetings     add column if not exists radius_m         int not null default 700;
alter table meetings     add column if not exists stashed_places   jsonb;
alter table meetings     add column if not exists archived_at      timestamptz;
alter table participants add column if not exists pin              text;
alter table participants add column if not exists pin_fails        int not null default 0;
alter table participants add column if not exists kakao_id         text;
alter table participants add column if not exists late_min         int;

create index if not exists idx_meetings_archived   on meetings(archived_at);
create index if not exists idx_meetings_meet_time  on meetings(meet_time);
create index if not exists idx_participants_kakao  on participants(kakao_id);

-- ⚠️ password · reservation 은 v19 에서 폐기됐지만 컬럼을 남겨 둔다.
--    화면에서 내리는 게 먼저고, 돌아가는 데모를 깨지 않기 위해서다.
--    DROP 은 발표 이후 별도 마이그레이션에서 한다.

-- ── updated_at 자동 갱신 ────────────────────────────────────────
create or replace function moimer_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_meetings_touch on meetings;
create trigger trg_meetings_touch before update on meetings
  for each row execute function moimer_touch_updated_at();
