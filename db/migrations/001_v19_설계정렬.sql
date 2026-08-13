-- ═══════════════════════════════════════════════════════════════
-- 001_v19_설계정렬.sql
--
-- 「모이머 설계 확정판 v19」(docs/설계_v19.md)가 요구하는 컬럼을 추가한다.
-- 여러 번 실행해도 안전하다 (add column if not exists).
--
-- 적용: Neon 콘솔 → SQL Editor → 이 파일 전체 붙여넣고 Run.
--
-- ⚠️ 이 마이그레이션은 **아무것도 지우지 않는다.**
--    폐기된 것(password · reservation · depositPerHead)은 컬럼을 남겨 둔다 —
--    화면에서 내리는 게 먼저고, 돌아가는 데모를 깨지 않기 위해서다.
--    실제 DROP 은 발표 이후 별도 마이그레이션에서 한다.
-- ═══════════════════════════════════════════════════════════════

-- ── meetings : 확정 범위 분기축 + 단계 상태 ──────────────────────

--  확정 범위 — v19 전체 흐름을 가르는 축. 기본 'place'("지점까지", v13).
--  'region' 이면 지점 단계를 건너뛰고 결과는 지도만 보여준다.
alter table meetings add column if not exists scope text not null default 'place';

--  목적 카테고리 5종 (v13): food | cafe | bar | culture | outdoor
--  scope='region' 이면 쓰지 않는다. 방장이 나중에 바꿀 수 있다 (v12).
alter table meetings add column if not exists purpose_category text;

--  모임 시간 — 생성 폼 입력으로 이전됨 (v2). 선택 항목이라 null 허용.
--  null 이면 결과 화면에서 신호등이 잠기고 입력 유도 배너가 뜬다 (v7).
--  ⚠️ 과거 시간은 애플리케이션이 거부한다 (v16) — DB 제약으로 두지 않는 이유는
--     "지난 모임"이 되면 meet_time 이 자연히 과거가 되기 때문이다.
alter table meetings add column if not exists meet_time timestamptz;

--  지점 투표가 열렸는지 (v8). 지역은 stage 전환 자체가 잠금이라 필요 없고,
--  지점은 등록·투표가 둘 다 chat/place 안에서 일어나 구분자가 필요하다.
alter table meetings add column if not exists place_vote_open boolean not null default false;

--  지점 탐색 반경 — 700 고정, 1회만 1400 확장 (v4, v15).
alter table meetings add column if not exists radius_m int not null default 700;

--  경계 reopen(지점→지역) 시 보관해 둔 지점 데이터 (v17).
--  같은 동으로 재확정되면 복원, 다른 동이면 폐기.
--  { regionId, places: PlaceCandidate[], votes: Record<pid, candidateId> }
alter table meetings add column if not exists stashed_places jsonb;

--  '지난 모임' 전환 시각 (v9). 모임일 다음날 — 시간 미입력이면 마지막 활동 7일 후.
--  값이 있으면 읽기 전용이고 부활은 불가하다 (v16, v18).
alter table meetings add column if not exists archived_at timestamptz;

--  지난 모임 목록·정렬에 쓰인다.
create index if not exists idx_meetings_archived on meetings(archived_at);
create index if not exists idx_meetings_meet_time on meetings(meet_time);

-- ── participants : PIN · 카카오 · 지각 분 ────────────────────────

--  개인 PIN — **비로그인 참여자만** (v15). 쿠키 유실 시 '이름 + PIN' 으로 복구한다.
--  카카오 로그인 참여자는 계정 기반 복구라 null 이다.
--  ⚠️ 평문이다. PoC 범위이고 4자리 숫자라 해시의 의미가 적지만,
--     운영 전환 시에는 해시로 바꾼다 (meetings.password 와 같은 TODO).
alter table participants add column if not exists pin text;

--  PIN 시도 실패 횟수 — 5회에서 잠근다 (v16).
alter table participants add column if not exists pin_fails int not null default 0;

--  카카오 회원번호. 방장은 항상 값이 있다(로그인 필수, v7).
--  재모임 자동 이전은 이 값이 있는 멤버만 된다 (v17).
alter table participants add column if not exists kakao_id text;

--  지각 예상 분 — 신호등 노랑일 때만. 전원에게 공유된다 (v16).
alter table participants add column if not exists late_min int;

--  재모임 '이 멤버로 다시' 에서 로그인 멤버를 찾을 때 쓴다.
create index if not exists idx_participants_kakao on participants(kakao_id);
