-- ─────────────────────────────────────────────────────────────
-- 모이머 · Neon(Postgres) 스키마
-- Vercel 배포 시 Neon 데이터베이스에 이 스크립트를 한 번 실행하세요.
--   psql "$DATABASE_URL" -f schema.sql
-- lib/store.ts 를 이 스키마 기반 어댑터로 교체하면 확장됩니다.
-- ─────────────────────────────────────────────────────────────

create table if not exists meetings (
  code          text primary key,
  name          text not null,
  password      text not null,
  headcount     int  not null default 4,      -- 유료서비스: 정원(인원수)
  leader_name   text not null,
  stage         text not null default 'main', -- main | chat | result
  ai_phase      text not null default 'region', -- region | place | done
  winner_region text,
  winner_place  text,
  created_at    timestamptz not null default now()
);

create table if not exists participants (
  id         text primary key,
  code       text not null references meetings(code) on delete cascade,
  name       text not null,
  is_leader  boolean not null default false,
  headcount  int not null default 1,
  origin     text,
  lat        double precision,
  lng        double precision,
  transport  text not null default 'transit'  -- transit | car
);
create index if not exists idx_participants_code on participants(code);

-- AI 추천 중간지역 후보(1차 논의 대상)
create table if not exists regions (
  id       text not null,
  code     text not null references meetings(code) on delete cascade,
  name     text not null,
  lat      double precision,
  lng      double precision,
  max_min  int,
  dev_min  int,
  reason   text,
  primary key (code, id)
);

-- 추천장소 후보(2차 논의 대상)
create table if not exists places (
  id              text not null,
  code            text not null references meetings(code) on delete cascade,
  name            text not null,
  category        text,
  emoji           text,
  distance_m      int,
  rating          double precision,
  reservable      boolean default true,
  deposit_per_head int default 0,
  primary key (code, id)
);

-- AI 대화 메시지 (투표 대체 — user/ai/system 발화 기록)
create table if not exists chat_messages (
  id    text not null,
  code  text not null references meetings(code) on delete cascade,
  role  text not null,          -- user | ai | system
  name  text not null default '',
  text  text not null,
  ts    timestamptz not null default now(),
  primary key (code, id)
);
create index if not exists idx_chat_code_ts on chat_messages(code, ts);

-- 유료서비스: 예약/선입금
create table if not exists reservations (
  code             text primary key references meetings(code) on delete cascade,
  place_id         text not null,
  headcount        int not null,
  deposit_per_head int not null,
  total            int not null,
  status           text not null default 'paid',
  paid_at          timestamptz not null default now()
);
