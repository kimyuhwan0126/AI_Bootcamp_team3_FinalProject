-- ══════════════════════════════════════════════════════════════
-- 모이머 v2 스키마 — 그릴링(2026-08-11)에서 정한 것을 담는다
--
-- 적용: 2026-08-11 — v1 을 버리고 이 스키마로 갈아엎었다.
--   v1 데이터(모임 47 · 참가자 105 · 표 24)는 backup_v1_*.json 에 남겼다.
--   돌고 있던 서버(10.40.8.87:3100)는 이 시점부터 v1 테이블을 못 찾는다 —
--   그 데이터는 버려도 된다고 확인받았다(이전 개발 데이터).
--
-- v1 과 달라진 이유
--   · password        삭제 — 설계 v2 '비밀번호 제거'
--   · leader_name     삭제 — 방장을 이름이 아니라 참가자 id 로 가리킨다
--   · 신원 키 신설    — 로그인=카카오 식별자 / 비로그인=이름+PIN(참여 시 필수)
--   · votes 재설계    — '핑=투표'. 한 사람이 여러 곳에 표를 줄 수 있다
--   · chat            삭제 — AI 채팅은 설계 v3 에서 제외(FF_AI_CHAT=0)
--   · 승인 대기       신설 — 강퇴된 사람의 재참여는 방장 승인(24h 자동 거절)
--   · 마무리/삭제     구분 — closed_at 이 있으면 '지난 모임', 삭제는 행 제거
-- ══════════════════════════════════════════════════════════════

-- ── 먼저 v1 을 치운다 ───────────────────────────────────────────
--   순서가 중요하다. 이걸 파일 아래에 두면 create table if not exists 가
--   'v1 테이블이 이미 있다'고 건너뛰고, 뒤따르는 인덱스가 없는 컬럼을 찾아 깨진다.
--   (실제로 한 번 그렇게 실패했다: column "host_id" does not exist)
drop table if exists votes, candidates, participants, meetings, users cascade;

-- ── 사용자 (NextAuth: JWT 세션 + users 테이블만) ─────────────────
--   세션·계정 테이블은 만들지 않는다(JWT 전략). 카카오 식별자만 붙잡아 둔다.
create table if not exists users (
  id            text primary key,               -- 우리 발급 id (cuid/uuid)
  kakao_id      text unique,                    -- 카카오 계정 식별자. 비로그인은 null
  nickname      text        not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

-- ── 모임 ────────────────────────────────────────────────────────
create table if not exists meetings (
  code            text primary key,             -- 6자리 참여 코드
  name            text        not null,
  scope           text        not null default 'place'
                    check (scope in ('region','place')),   -- 지역까지 / 지점까지
  purpose         text,                                     -- 음식·카페·술집·문화·야외
  stage           text        not null default 'region'
                    check (stage in ('region','place','result')),
  -- ⚠ '핑=투표' 로 ⑥⑦ 이 합쳐져 vote_region 이 사라졌고(5→4),
  --    지점도 같은 규칙이 되면서 vote_place 까지 사라졌다(4→3) — 그릴링 논의34.
  --    '선정 시작'을 눌러도 후보가 안 잠겼다. 두 단계가 이름만 다르고 하는 일이 같았다.
  meet_at         timestamptz,                  -- 비워도 된다(도착 신호등만 잠긴다)
  radius_m        integer     not null default 700,
  -- 방장은 '그 모임의 참가자' 다. users 를 가리키면 한 사람이 여러 모임에서
  -- 서로 다른 참가자인 경우를 못 담고, 방장 판정도 두 단계가 된다.
  -- participants 는 meetings 뒤에 만들어지므로 제약은 파일 끝에서 건다.
  host_id         text,
  winner_region_id text,
  winner_place_id  text,
  closed_at       timestamptz,                  -- 방장이 '마무리' 누른 시각. null 이면 진행 중
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- [2026-08-12 논의93 · H] AI 추천을 이 단계에서 몇 번 썼나. 단계마다 3번이다.
  --   모임 줄에 두는 까닭: 전에는 프로세스 메모리(globalThis)에 셌다 — 개발 서버가 파일을
  --   다시 구울 때마다, 운영이 여러 대가 되는 순간 0부터 다시 셌다. 한도가 아니었다.
  --   여기 있으면 모임을 지울 때 셈도 함께 사라지고, 되돌려도 안 돌아온다
  --   (되돌리기로 횟수가 되살아나면 그것도 한도가 아니다).
  --   운영 DB 에는 이 파일을 다시 못 돌리므로(맨 위 drop) `lib/db.ts` 의 AI칸준비() 가
  --   `add column if not exists` 로 한 번 붙인다. 두 곳이 같은 모양이어야 한다.
  ai_used_region  integer     not null default 0,
  ai_used_place   integer     not null default 0,
  -- [C1 · 2026-08-12 논의91] '지역까지' 모임에는 지점 우승자가 있을 수 없다.
  --   scope 를 정해 놓고 그보다 깊은 곳을 확정하는 길은 없어야 한다.
  constraint meetings_scope_winner_chk
    check (scope <> 'region' or winner_place_id is null)
);
create index if not exists meetings_host_idx   on meetings(host_id);
create index if not exists meetings_closed_idx on meetings(closed_at);

-- ── 참가자 ──────────────────────────────────────────────────────
--   신원 키: 로그인 = users.kakao_id / 비로그인 = (code, name) + pin_hash
--   같은 모임 안에서 이름은 유일하다(지금 앱도 중복을 막는다).
create table if not exists participants (
  id            text primary key,
  code          text        not null references meetings(code) on delete cascade,
  user_id       text        references users(id),   -- 비로그인은 null
  name          text        not null,
  pin_hash      text,                                -- 비로그인 필수, 로그인은 null
  origin_name   text,
  lat           double precision,
  lng           double precision,
  transport     text default 'transit'
                  check (transport in ('transit','bus','car','walk')),
  status        text,                                -- 도착 신호등
  eta_text      text,
  state         text        not null default 'active'
                  check (state in ('active','kicked','pending')),
  -- active  : 정상 멤버
  -- kicked  : 방장이 내보냄. 다시 들어오려면 승인 필요
  -- pending : 승인 대기(강퇴됐던 사람만). 24h 뒤 자동 거절
  requested_at  timestamptz,                        -- pending 이 된 시각(자동 거절 기준)
  joined_at     timestamptz not null default now(),
  -- [2026-08-12 논의115·116 · H] 신호등. null = 아직 안 눌렀다.
  --   약속 시간이 정해진 모임에서만 켠다. 다시 누르면 null 로 돌아간다.
  --   ⚠ 표에도 가운데 계산에도 절대 넣지 않는다 — 논의116 이 정한 것은 '알린다' 하나뿐이다.
  --   서버 칸이어야 하는 까닭: 브라우저에만 두면 나만 보인다. "빨간불이 켜지면 모두에게
  --   알린다" 가 성립하지 않는다(실제로 localStorage 에 있었다).
  --   운영 DB 에는 이 파일을 다시 못 돌리므로(맨 위 drop) `lib/db.ts` 의 칸준비() 가
  --   `add column if not exists` + 같은 CHECK 로 한 번 붙인다. 두 곳이 같은 모양이어야 한다.
  going         text
                  constraint participants_going_chk
                  check (going is null or going in ('go','late','no')),
  unique (code, name),                              -- 한 모임에 같은 이름 둘 금지
  -- 비로그인이면 PIN 이 반드시 있어야 한다
  constraint pin_required_for_guest
    check (user_id is not null or pin_hash is not null)
);
-- meetings.host_id → participants.id (뒤늦게 거는 이유는 생성 순서 때문)
-- [F5 · 2026-08-12 논의91] on delete set null → **no action** 으로 바꿨다.
--   set null 은 방장 참가자 줄이 사라지면 모임을 소리 없이 '방장 없는 모임' 으로 만들었다.
--   그러면 확정·되돌리기·마무리·삭제가 전부 403 이 되어 **아무도 그 모임을 못 지운다**
--   (실서비스에서 HWMPXD 1건이 그렇게 갇혔다). 앱 규칙이 이미 '방장은 넘긴 뒤에야 나간다'
--   (논의97)이므로 DB 규칙을 같게 맞춘 것뿐이다.
--   모임을 지울 때는 meetings 행이 먼저 없어지고 no action 은 문장 끝에 보므로 remove 는 안 깨진다.
alter table meetings drop constraint if exists meetings_host_fk;
alter table meetings add constraint meetings_host_fk
  foreign key (host_id) references participants(id) on delete no action;

create index if not exists participants_code_idx  on participants(code);
create index if not exists participants_state_idx on participants(code, state);
-- 로그인한 사람의 자리를 계정으로 되찾는 길(hostAccount·myMeetings 의 '내자리' ②)이 이 인덱스를 탄다.
-- user_id 는 대부분 null(비로그인)이라 부분 인덱스로 좁힌다 — 운영 DB에는 이미 있었는데
-- 이 파일에만 빠져 있었다: 이대로 다시 부으면 그 길이 순차 스캔으로 떨어진다.
create index if not exists participants_user_idx on participants(user_id) where user_id is not null;

-- ── 후보 (지역 = 행정동 / 지점 = 장소) ──────────────────────────
create table if not exists candidates (
  id            text primary key,
  code          text not null references meetings(code) on delete cascade,
  kind          text not null check (kind in ('region','place')),
  -- [C8 · 2026-08-12 논의91] ref_id 는 반드시 있어야 한다.
  --   null 이면 아래 unique (code, kind, ref_id) 가 NULL 을 서로 다르게 보아 제약이 안 먹고,
  --   같은 동을 누를 때마다 새 줄이 생겼다(실서비스에서 '무명동' 이 6줄까지 늘었다).
  ref_id        text not null,            -- 지역=행정동 코드 / 지점=카카오 place id
  name          text not null,
  address       text,
  lat           double precision not null,
  lng           double precision not null,
  by_ai         boolean not null default false,
  -- [F4 · 2026-08-12 논의91] on delete **set null**.
  --   전에는 아무 동작도 없어서(no action) '남이 찍어 준 내 후보' 를 두고 나가면 FK 위반 500 이 났고,
  --   leave() 가 나가기 직전에 created_by 를 손으로 null 로 밀어 넣어 겨우 피하고 있었다.
  --   DB 가 할 일을 코드가 대신하던 것을 제자리로 돌린다.
  created_by    text constraint candidates_created_by_fk
                  references participants(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- 되돌리기로 지역 단계까지 내려가면 그때까지 모은 지점 후보를 버리지 않고 넣어 둔다
  -- (그릴링 Q10 = '넣어 둔다'). 값은 '그때 정해져 있던 지역 후보 id'.
  -- 같은 지역을 다시 확정하면 그대로 돌아오고, 다른 지역을 고르면 숨은 채로 남는다.
  --   ⚠ 2026-08-12 현재 값의 뜻이 '지역 후보 id' 에서 '그 지역 후보의 ref_id' 로 바뀌었다.
  --      그리고 논의87('지역이 바뀌면 지점 후보를 모두 버린다')로 이 장치 자체를 없애는 중이다.
  --      그래서 parked_under 에는 **FK 를 걸지 않는다** — 걸면 reopen() 이 500 이 난다.
  parked_under  text,
  unique (code, kind, ref_id),            -- 같은 동/같은 장소는 한 줄로 합친다
  -- [C7 · 2026-08-12 논의91] 넣어 두는 것은 지점 후보뿐이고, 자기 ref_id 를 앵커로 삼을 수 없다.
  constraint candidates_parked_kind_chk
    check (parked_under is null or (kind = 'place' and parked_under <> ref_id))
);
create index if not exists candidates_code_idx on candidates(code, kind);

-- ── 확정된 곳은 실재해야 한다 (F1 · F2 · 2026-08-12 논의91) ──────
--   meetings 를 만들 때는 candidates 가 아직 없으므로 host_id 와 같은 이유로 여기서 건다.
--
--   왜: 이 짝에 FK 가 없어서 winner_region_id·winner_place_id 가 **없는 후보를 가리키는**
--       모임이 실서비스에서 11건 생겼다. 끝난 모임인데 결과 자리가 "아직 정해지지 않았어요" 가
--       되고, 진행 중이면 반경 제한이 통째로 꺼져 정한 지역과 무관한 가게가 후보로 올라갔다.
--
--   on delete 판단: **no action** (= 확정된 후보는 지워지지 않는다)
--     · cascade   ✗ 후보 하나 지웠다고 모임이 통째로 사라지면 안 된다
--     · set null  ✗ 끝난 모임의 결론이 소리 없이 사라진다 — 위 11건이 겪은 손해와 같다
--     · restrict  ✗ 모임을 지울 때 candidates 가 cascade 로 함께 지워지는데
--                   restrict 는 그 자리에서 막아 '모임 삭제(remove)' 가 깨진다
--     · no action ○ 문장이 끝날 때 보므로 remove 는 통과하고, 확정된 후보를 지우려는
--                   경합만 막힌다. 앱은 이미 unping·leave 에서 안 지우므로 정상 경로엔 안 걸린다
--
--   붙인 뒤: 확정된 뒤 그 후보를 지우려는 경합이 조용히 깨지는 대신 **500** 이 된다.
--            화면이 그걸 "잠시 뒤 다시 해 주세요" 로 옮겨야 한다.
alter table meetings drop constraint if exists meetings_winner_region_fk;
alter table meetings add constraint meetings_winner_region_fk
  foreign key (winner_region_id) references candidates(id) on delete no action;
alter table meetings drop constraint if exists meetings_winner_place_fk;
alter table meetings add constraint meetings_winner_place_fk
  foreign key (winner_place_id) references candidates(id) on delete no action;

-- ── 표 ──────────────────────────────────────────────────────────
--   [핑 = 투표]  지역 단계에서는 '찍는 것'이 곧 표다.
--   · 한 사람이 여러 동에 찍을 수 있다 (제한 없음)
--   · 같은 동에는 하나만  → unique(candidate_id, participant_id)
--   · 다시 누르면 취소    → 그 행을 지운다
--   지점도 같다(그릴링 논의26 ① · 2026-08-11 갱신) — 후보를 올리는 것이 곧 표이고
--   여러 곳을 찍어도 된다. 1인 1표는 폐기했다.
create table if not exists votes (
  code            text not null references meetings(code) on delete cascade,
  candidate_id    text not null references candidates(id) on delete cascade,
  participant_id  text not null references participants(id) on delete cascade,
  kind            text not null check (kind in ('region','place')),
  voted_at        timestamptz not null default now(),
  primary key (candidate_id, participant_id)
);
create index if not exists votes_code_idx on votes(code, kind);
-- 지점도 지역과 같다: 찍는 것이 곧 표, 여러 곳을 찍어도 된다 (그릴링 논의26 ①).
-- 전에는 place 에 1인 1표를 걸어 뒀는데, 후보를 모으는 단계에서 세 곳을 올리면
-- 첫 곳만 1표고 나머지가 0표로 남았다 — 올린 사람조차 안 찍은 것처럼 보였다.
-- 한 사람이 같은 곳을 두 번 찍는 것만 primary key 가 막는다.
drop index if exists votes_one_per_person_place;

-- ── 갱신 시각 자동 반영 ─────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists meetings_touch on meetings;
create trigger meetings_touch before update on meetings
  for each row execute function touch_updated_at();

-- ══════════════════════════════════════════════════════════════
-- [아직 정하지 않은 것] — 다음 그릴링에서
--   1. '미배정 핑은 투표 시작 시 삭제'(v9) 인데, 지역은 '투표 시작'이 사라졌다.
--      언제 지울 것인가? (확정할 때 / 아예 안 지움 / 다른 시점)
--   2. 진행률의 분모 — '핑을 하나라도 찍은 사람 수 / 전체' 로 볼 것인가.
--   (1~3 은 정해졌다: 1=확정할 때까지 남긴다 / 2=핑을 하나라도 낸 사람 수 / 3=candidates.parked_under)
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- [일부러 안 붙인 것] — 2026-08-12 논의91. 붙이려다 위반이 남아 멈춘 것들이다.
--   붙일 수 있게 되면 여기서 옮겨 적어라. 위반 수는 `점검/05_정리.sql` 0번으로 다시 센다.
--
--   · parked_under → candidates 의 FK  ⛔ **붙이지 마라**
--       열쇠 뜻이 ref_id 로 바뀌었고 논의87 이 장치 자체를 없앤다. 붙이면 reopen() 이 500.
--
--   · check (closed_at is null or coalesce(winner_place_id, winner_region_id) is not null)   [C5]
--       '정한 것 없이 마무리된 모임' 이 아직 남아 있어 안 붙는다.
--       G36/P8('확정 없이 끝난 모임을 허용할 것인가')이 '허용' 으로 정해지면 아예 붙이면 안 된다.
--
--   · check (state <> 'pending' or requested_at is not null)                                  [C6]
--       requested_at 이 없는 승인 대기가 남아 있어 안 붙는다(그 줄은 영원히 안 만료된다).
--
--   · stage 와 winner_* 의 앞뒤를 보는 CHECK                                                  [C2·C3·C4]
--       'stage=place 인데 확정된 지역이 없다' 가 남아 있어 안 붙는다.
--       댕글링 winner_* 를 D01(가)로 **값만** 비웠기 때문에 생긴 자리다 —
--       단계까지 함께 내리는 것은 '끝난 모임을 다시 여는 것' 이라 사람이 정할 일이다.
--
--   · votes(candidate_id, kind) → candidates(id, kind) · votes(participant_id, code) →
--     participants(id, code)  [F6·F7]  위반은 0이지만 논의91 이 시킨 목록에 없어 안 붙였다.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- [적용 기록]
--   2026-08-11 — 이 파일을 그대로 Neon 에 돌렸다(v1 → v2).
--   되돌리려면 backup_v1_*.json 을 참고한다(스키마가 달라 그대로는 못 넣는다).
--   다시 돌려도 안전하다 — 맨 위 drop 이 매번 비우고 새로 만든다.
--
--   2026-08-12 — 논의89(청소) · 논의91(FK) 를 운영 DB 에 적용하고 이 파일에 옮겨 적었다.
--     운영 DB 에는 파일을 다시 돌리지 않고 ALTER 7개로 붙였다(데이터를 지울 수 없으므로).
--     붙인 것: F1 F2 (winner_* → candidates, no action) · F4 (created_by, set null) ·
--             F5 (host_id, no action) · C1 · C7 · C8(ref_id not null)
--     `participants.code`·`candidates.code`·`votes.code` → `meetings(code)` cascade 는
--     처음부터 있었다 — 그래서 '주인 없는 참가자' 가 늘 0건이었다.
--     지운 행의 기록은 `점검/05_지운것.md`, 판단 근거는 `점검/05_운영데이터_정리.md`.
--   되돌리려면: alter table … drop constraint <이름>;
--     (candidates.ref_id 만 `alter column ref_id drop not null`)
-- ══════════════════════════════════════════════════════════════

-- ── 좌표 → 동 이름 캐시 (그릴링 논의27-2) ────────────────────────
-- 카카오가 막히면 OSM 으로 바꾼다. 그런데 Nominatim 운영 정책은 초당 1회·벌크 금지라
-- 브라우저가 누를 때마다 직접 부르면 정책 위반이고 금세 막힌다.
-- 그래서 서버가 대신 부르고, 같은 자리는 저장해 두고 다시 안 부른다.
-- 키는 소수 4자리(약 11m) — 같은 동네를 누르면 사실상 같은 칸으로 떨어진다.
create table if not exists geo_cache (
  gx          integer not null,          -- round(lng * 10000)
  gy          integer not null,          -- round(lat * 10000)
  region_code text,                      -- 행정동 코드(있으면)
  name        text not null,             -- 동 이름
  source      text not null,             -- 'kakao' | 'osm'
  -- [2026-08-12 논의60 · H] ISO 3166-1 두 글자(소문자). 못 읽었으면 'zz'.
  --   한국 상자(위 33~38.7 · 경 124.5~132) 안에 대마도가 통째로 들어온다 — 상자만으로는
  --   국외를 못 막는다. `lib/geo.ts` 가 이 칸을 읽어 마지막으로 거른다.
  --   운영 DB 에는 이미 붙어 있었는데 이 파일에만 빠져 있었다: 이대로 다시 부으면 geo 가 죽는다.
  country     text,
  hit_at      timestamptz not null default now(),
  primary key (gx, gy)
);

-- ── 좌표 → 가게 목록 캐시 (lib/places.ts) ─────────────────────────
-- geo_cache 와 짝이지만 유통기한이 훨씬 짧다(가게는 문을 닫고 새로 생긴다) — lib/places.ts 참고.
-- ⚠ 운영 DB 에는 이 표가 있지만 지금까지 이 파일에는 없었다: `lib/places.ts` 의 표준비() 가
--   `create table if not exists` 로 처음 쓸 때 직접 만든다(이 파일을 다시 못 돌리므로, 위 drop 참고).
--   그 함수의 정의와 여기가 같은 모양이어야 한다 — 자리(칸 차례)까지 맞춘다: jsonb 가 아니라
--   json 인 것도 같은 이유다(칸 차례를 제 맘대로 다시 세우지 않아야 캐시가 그대로 돌려주는 값이 된다).
create table if not exists places_cache (
  gx      integer not null,          -- round(lng * 10000)
  gy      integer not null,          -- round(lat * 10000)
  radius  integer not null,          -- 반경(m) — 열쇠의 일부
  places  json not null,
  made_at timestamptz not null default now(),
  primary key (gx, gy, radius)
);
