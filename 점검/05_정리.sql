-- ══════════════════════════════════════════════════════════════════════════════
--
--   ⛔  이 파일은 아직 실행하지 않았다.  실행 전에 백업하라.  ⛔
--
--   한 줄도 돌리지 않았다. 여기 있는 SELECT 만 돌려서 숫자를 쟀고,
--   UPDATE·DELETE·ALTER 는 **글자로만** 적어 뒀다.
--
--   백업 (둘 중 하나는 반드시)
--     · Neon 콘솔 → Branches → "Create branch from ... (point in time)"  ← 가장 빠르고 확실하다
--     · 또는  pg_dump "$DATABASE_URL" -Fc -f moimer_2026-08-12.dump
--
--   돌리는 법
--     통째로 돌리지 마라. 블록을 하나 골라 그 안의 ① 세는 SELECT 를 먼저 돌려
--     숫자가 아래 적힌 것과 맞는지 보고, 맞으면 ② 고치는 문장을 돌린다.
--     아래 첫 문장이 통짜 실행을 막는다 — 지우지 마라.
--
--   숫자 기준 시각: 2026-08-12 05:06 UTC (meetings 271 · participants 560 ·
--                    candidates 773 · votes 920 · users 929 · 서버 PostgreSQL 18.4)
--   ⚠ 다른 갈래 에이전트들이 지금도 이 DB 에 쓰고 있다. 숫자는 흔들린다.
--     반드시 ① 을 다시 돌려 확인하고 ② 로 넘어가라.
--
--   ⚠⚠ 2차 실측(05:06)에서 **D02 가 3 → 19 로 늘었다.** 데이터가 더 깨진 것이 아니라
--      `parked_under` 의 뜻이 코드에서 바뀌었기 때문이다(후보 id → 지역의 ref_id).
--      옛 뜻으로 적힌 16줄이 새 코드에서 영영 안 꺼내진다. D02 블록을 다시 읽어라.
--      그리고 **아래 F3 은 옛 뜻을 전제로 쓴 것이라 지금 붙이면 안 된다** — F3 을 읽어라.
--
-- ══════════════════════════════════════════════════════════════════════════════

do $$ begin
  raise exception '05_정리.sql 을 통째로 돌리지 마라. 블록을 하나씩 골라 실행하라.';
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 0. 지금 상태를 한 줄로 — 무엇을 고치든 먼저 이걸 돌려라
-- ══════════════════════════════════════════════════════════════════════════════
select now() as 잰시각,
  (select count(*)::int from meetings m
     where (m.winner_region_id is not null and not exists (select 1 from candidates c where c.id=m.winner_region_id))
        or (m.winner_place_id  is not null and not exists (select 1 from candidates c where c.id=m.winner_place_id)))            as "D01 댕글링 winner 모임",
  -- D02 는 '새 confirm 이 꺼낼 수 있는가' 로 센다. 새 열쇠는 지역 후보의 ref_id 다 —
  -- 그 열쇠로 맞는 지역 후보가 이 모임에 없으면 무슨 값이 적혀 있든 영영 안 꺼내진다.
  (select count(*)::int from candidates c
     where c.parked_under is not null
       and not exists (select 1 from candidates x
                        where x.code=c.code and x.kind='region' and x.ref_id=c.parked_under))                                    as "D02 닿을 수 없는 park 후보",
  (select count(*)::int from candidates c
     where c.parked_under is not null and exists (select 1 from candidates x where x.id=c.parked_under))                         as "D02a 그 중 옛 열쇠(후보 id)",
  (select count(*)::int from candidates c
     where c.parked_under is not null
       and not exists (select 1 from candidates x where x.id=c.parked_under)
       and not exists (select 1 from candidates x
                        where x.code=c.code and x.kind='region' and x.ref_id=c.parked_under))                                    as "D02b 그 중 앵커가 사라진 것",
  (select count(*)::int from users u where not exists (select 1 from participants p where p.user_id=u.id))                       as "D03 주인 없는 users 행",
  (select count(*)::int from meetings where host_id is null)                                                                    as "D04 방장 없는 모임",
  (select count(*)::int from meetings m join participants p on p.id=m.host_id where p.state<>'active')                           as "D05 방장이 강퇴 상태",
  (select count(*)::int from meetings where closed_at is not null and coalesce(winner_place_id,winner_region_id) is null)        as "D06 정한 것 없이 마무리",
  (select count(*)::int from meetings where closed_at is not null and stage<>'result')                                           as "D07 마무리인데 stage≠result",
  (select count(*)::int from votes v join participants p on p.id=v.participant_id where p.state<>'active')                       as "D08 강퇴자의 표",
  (select count(*)::int from participants where state='pending' and requested_at is null)                                        as "D09 영원한 승인 대기",
  (select count(*)::int from candidates where ref_id is null)                                                                    as "D10 ref_id 없는 후보",
  (select count(*)::int from candidates where created_by is null)                                                                as "D11 주인 뗀 후보",
  (select count(*)::int from meetings m where not exists (select 1 from participants p where p.code=m.code))                     as "D13 사람 0명 모임",
  (select count(*)::int from meetings where trim(name)='')                                                                       as "D14 이름 빈 모임",
  (select count(*)::int from participants where lat is not null and lng is not null
     and not (lat between 33 and 38.7 and lng between 124.5 and 132))                                                            as "D15a 한국 밖 출발지",
  (select count(*)::int from candidates
     where not (lat between 33 and 38.7 and lng between 124.5 and 132))                                                          as "D15b 한국 밖 후보",
  (select count(*)::int from geo_cache
     where not (gy/10000.0 between 33 and 38.7 and gx/10000.0 between 124.5 and 132))                                            as "D15c 한국 밖 동이름 캐시",
  (select count(*)::int from candidates where by_ai)                                                                             as "D16 AI 가 올린 후보(0이면 표시가 안 켜진다)",
  (select count(*)::int from candidates c where not exists (select 1 from votes v where v.candidate_id=c.id) and not c.by_ai)    as "D17 0표 후보(AI 아님)";
-- 2026-08-12 05:06 기준: D01=11 D02=19(D02a=16 D02b=3) D03=661/929 D04=1 D05=2 D06=22
--                        D07=44 D08=15 D09=1 D10=6 D11=7 D13=0 D14=2
--                        D15a=1 D15b=3 D15c=19  D16=0  D17=13


-- ══════════════════════════════════════════════════════════════════════════════
-- D01. 댕글링 winner_*  — 11건 (winner_region 8 · winner_place 3)
--      되돌릴 수 있나: 갈래 (가)=예(아래 밑천을 저장했다면) / (다)=아니오
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT — 몇 건이 걸리는가 · 어떤 모임인가
select m.code, m.name, m.scope, m.stage, m.closed_at,
       m.winner_region_id, m.winner_place_id,
       (m.winner_region_id is not null and not exists (select 1 from candidates c where c.id=m.winner_region_id)) as r_댕글링,
       (m.winner_place_id  is not null and not exists (select 1 from candidates c where c.id=m.winner_place_id))  as p_댕글링,
       (select count(*)::int from participants p where p.code=m.code) as 참가자,
       (select count(*)::int from candidates  c where c.code=m.code) as 후보,
       (select count(*)::int from votes       v where v.code=m.code) as 표
  from meetings m
 where (m.winner_region_id is not null and not exists (select 1 from candidates c where c.id=m.winner_region_id))
    or (m.winner_place_id  is not null and not exists (select 1 from candidates c where c.id=m.winner_place_id))
 order by m.created_at;
-- 기대: 11행. 그 중 closed_at 이 있는 것 8건, 진행 중 3건(6Q42RK · ZT9LLK · JGAGPT).

-- ② 되돌리기 밑천 — 돌리기 전에 이 결과를 파일로 저장하라 (되살릴 때 쓴다)
select code, winner_region_id, winner_place_id, stage, closed_at from meetings
 where code in ('6Q42RK','ZT9LLK','UP5SY3','HGSJ2K','6GYGBG','62YPGA','E9J44T','2EC6T8','ACGJVW','VCY2WM','JGAGPT');

-- ③ 논의54('지난 모임도 방장이 지울 수 있다') 가 코드에 들어간 뒤 —
--    이 11건 중 몇 건이 SQL 없이 화면에서 치워지는가.
--    지금 route.ts 는 마무리한 모임의 모든 동작을 409 로 막는다(remove 포함).
--    거기에 remove 예외가 생기면 아래 '방장이 지울 수 있다' 는 손 안 대도 된다.
select m.code, m.name, m.closed_at is not null as 마무리됨,
       case when m.host_id is null            then 'SQL 필요 — 방장이 없다(403)'
            when p.state <> 'active'          then 'SQL 필요 — 방장이 강퇴 상태다(403)'
            else '방장이 화면에서 지울 수 있다' end as 판정
  from meetings m left join participants p on p.id = m.host_id
 where (m.winner_region_id is not null and not exists (select 1 from candidates c where c.id=m.winner_region_id))
    or (m.winner_place_id  is not null and not exists (select 1 from candidates c where c.id=m.winner_place_id))
 order by 판정, m.created_at;
-- 기대: 9건 '방장이 화면에서 지울 수 있다' · 2건 SQL 필요 (6Q42RK · ZT9LLK — 방장이 강퇴 상태).
--       즉 논의54 가 들어가면 **아래 (다) 로 지워야 하는 것은 2건뿐**이다.
--       다만 그 2건은 D05 (가) 로 방장을 되살려도 화면에서 지울 수 있게 된다 — 그쪽이 더 작다.


-- ── 갈래 (가) 허공을 가리키는 값만 비운다 ─────────────────────────────────────
--   사용자에게 보이는 것: 끝난 모임은 결과 자리가 "아직 정해지지 않았어요" 가 된다.
--   진행 중 모임은 지점 단계의 '지역 안에서 골라 주세요' 안내와 반경 제한이 그대로 없는 채로 남는다.
--   되돌릴 수 있다 — 위 ② 를 저장했다면 값을 그대로 다시 넣으면 된다.
--
-- 걸리는 행: 8  (winner_region_id)
update meetings m
   set winner_region_id = null
 where m.winner_region_id is not null
   and not exists (select 1 from candidates c where c.id = m.winner_region_id);

-- 걸리는 행: 3  (winner_place_id)
update meetings m
   set winner_place_id = null
 where m.winner_place_id is not null
   and not exists (select 1 from candidates c where c.id = m.winner_place_id);

--   ⚠ (가) 를 돌리면 D06(정한 것 없이 마무리) 이 22 → **27** 로 는다.
--     "지난 모임인데 결과가 비어 있다" 가 5건 새로 생긴다는 뜻이다
--     (마무리된 8건 중 3건은 지역 우승자가 살아 있어 결과가 남는다).
--     그게 싫으면 (가) 대신 (다) 를 쓰거나, 아래 (가-2) 로 단계까지 함께 내린다.

-- ── 갈래 (가-2) 값을 비우고 단계도 함께 내린다 ────────────────────────────────
--   사용자에게 보이는 것: 끝난 모임이 "정하는 중" 으로 되돌아간다. 마무리를 취소하는 셈이다.
--   되돌릴 수 있다(② 저장 시). 다만 사용자 눈에는 "끝난 모임이 다시 열렸다" 로 보인다 —
--   실사용자 데이터라면 알리지 않고 하면 안 된다.
--
-- 걸리는 행: 27  (= (가) 뒤에 결과가 텅 빈 모임 전부. D06 의 22건도 함께 걸린다.
--                D01 에서 새로 생긴 5건만 손대려면 위 ② 에 적힌 code 로 범위를 좁혀라)
update meetings
   set stage = case when scope = 'region' then 'region' else 'place' end,
       closed_at = null
 where closed_at is not null
   and coalesce(winner_place_id, winner_region_id) is null;


-- ── 갈래 (나) 그 후보를 되살린다 ──────────────────────────────────────────────
--   할 수 없다. 지워진 후보의 이름·주소·좌표가 어디에도 남아 있지 않다.
--   (votes 는 후보와 함께 cascade 로 사라졌고, 로그도 없다.)
--   이름과 좌표를 지어내서 후보를 새로 만드는 것은 사용자를 속이는 것이라 하지 않는다.
--   ※ 같은 ref_id 의 후보가 지금 살아 있어 "그리로 다시 가리키면 되는" 경우가 있는지 —
--     아래를 돌려 보면 0행이다. winner_* 에는 ref_id 가 안 적혀 있어 짝을 찾을 길이 없다.
select m.code, m.winner_region_id
  from meetings m
 where m.winner_region_id is not null
   and not exists (select 1 from candidates c where c.id = m.winner_region_id)
   and exists (select 1 from candidates c where c.code = m.code and c.kind = 'region');
-- 기대: 2행 (6Q42RK · ZT9LLK — 지역 후보는 있지만 '어느 것이었는지'는 알 수 없다)


-- ── 갈래 (다) 그 모임을 통째로 지운다 ─────────────────────────────────────────
--   ⛔ 되돌릴 수 없다. participants · candidates · votes 가 cascade 로 함께 사라진다.
--   사용자에게 보이는 것: 링크로 들어가면 "이 모임은 없어졌어요".
--   지금 이 11건은 전부 에이전트가 만든 시험 데이터다(이름: 결함 재현 · G1 · S · T · X ·
--   검증모임 · V-ghost · A_우승자허공 · E_지역실종). 실사용자 것이 아니다.
--
-- ①-다  무엇이 함께 사라지는지 먼저 센다
select
  (select count(*)::int from participants where code in ('6Q42RK','ZT9LLK','UP5SY3','HGSJ2K','6GYGBG','62YPGA','E9J44T','2EC6T8','ACGJVW','VCY2WM','JGAGPT')) as 참가자,
  (select count(*)::int from candidates  where code in ('6Q42RK','ZT9LLK','UP5SY3','HGSJ2K','6GYGBG','62YPGA','E9J44T','2EC6T8','ACGJVW','VCY2WM','JGAGPT')) as 후보,
  (select count(*)::int from votes       where code in ('6Q42RK','ZT9LLK','UP5SY3','HGSJ2K','6GYGBG','62YPGA','E9J44T','2EC6T8','ACGJVW','VCY2WM','JGAGPT')) as 표;
-- 기대: 참가자 16 · 후보 13 · 표 13

-- 걸리는 행: 11 (+ cascade 42)   ⛔ 되돌릴 수 없다
delete from meetings
 where code in ('6Q42RK','ZT9LLK','UP5SY3','HGSJ2K','6GYGBG','62YPGA',
                'E9J44T','2EC6T8','ACGJVW','VCY2WM','JGAGPT');


-- ══════════════════════════════════════════════════════════════════════════════
-- D02. 닿을 수 없는 park 후보 — **19건** (넣어 둔 것 전부)
--      되돌릴 수 있나: 예 (밑천을 저장했다면)
--
--   ⚠ 지난 조사 때는 3건이었다. 데이터가 더 깨진 것이 아니라 **열쇠의 뜻이 바뀌었다.**
--     · 옛 코드: parked_under = 그때 확정돼 있던 **지역 후보의 id**
--     · 새 코드: parked_under = 그 지역 후보의 **ref_id**(행정동 코드)
--       (lib/db.ts confirm/reopen 이 둘 다 `coalesce(ref_id, id)` 로 바뀌었다)
--     새 confirm 은 ref_id 로만 꺼내므로, 옛 뜻으로 적힌 16줄은 **어떤 지역을
--     확정해도 안 꺼내진다.** 앵커가 아예 사라진 3줄은 예전부터 안 꺼내졌다.
--     16 + 3 = 19. 즉 지금 넣어 둔 것 전부가 자동 복원 불가다.
--
--   ※ '영영' 은 아니다 — 사람이 같은 가게를 손으로 다시 찍으면(ping) 되살아난다.
--     다만 ping 의 '꺼냄' CTE 가 **그때 받은 옛 표를 지우고** 되살린다. 표는 잃는다.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT — 열쇠가 어느 뜻으로 적혀 있는가
select c.id, c.code, c.name, c.ref_id, c.parked_under,
       exists (select 1 from candidates x where x.id = c.parked_under)                        as 옛열쇠_후보id,
       exists (select 1 from candidates x
                where x.code=c.code and x.kind='region' and x.ref_id=c.parked_under)          as 새열쇠_지역refid,
       (select count(*)::int from votes v where v.candidate_id = c.id)                        as 표,
       m.stage, m.winner_region_id,
       (select w.ref_id from candidates w where w.id = m.winner_region_id)                    as 지금확정된_지역refid
  from candidates c join meetings m on m.code = c.code
 where c.parked_under is not null
 order by c.code, c.created_at;
-- 기대: 19행. 옛열쇠_후보id=true 16행 · 둘 다 false 3행 · 새열쇠=true 0행.
--       표는 합 22개가 이 19개 후보에 달려 있다 — 화면에는 하나도 안 보인다.

-- ② 되돌리기 밑천 — 반드시 먼저 저장하라
select id, code, ref_id, parked_under from candidates where parked_under is not null;


-- ── 갈래 (가) 옛 열쇠를 새 열쇠로 옮긴다  ← 권고 (16건) ──────────────────────
--   무엇을: parked_under 에 적힌 '앵커 후보 id' 를 그 후보의 ref_id 로 바꿔 적는다.
--   사용자에게 보이는 것: 당장은 아무것도. 그 지역을 다시 확정하는 순간
--   넣어 뒀던 지점 후보가 표까지 그대로 돌아온다 — 설계(Q10)가 말하던 그대로다.
--   되돌릴 수 있다 — ② 를 저장했다면 값을 그대로 다시 넣으면 된다.
--
--   ⚠ 먼저 확인: 앵커의 ref_id 가 null 이면 옮길 수 없다. (지금 0건)
select count(*)::int as 옮길수없음
  from candidates c join candidates a on a.id = c.parked_under where a.ref_id is null;
-- 기대: 0

-- 걸리는 행: 16
update candidates c
   set parked_under = a.ref_id
  from candidates a
 where a.id = c.parked_under
   and a.ref_id is not null;

-- ── 갈래 (나) 앵커가 사라진 것은 다시 보이게 한다  ← 권고 (3건) ─────────────
--   무엇을: 옮길 앵커조차 없는 3건은 숨김을 푼다.
--   사용자에게 보이는 것: 숨어 있던 지점 후보 3곳과 표 3개가 목록·지도에 다시 나타난다.
--   (5PNSY2 · CKEJG8 은 지금 '지점 정하는 중' 이라 바로 보인다.)
--   되돌릴 수 있다. 걸리는 행: 3
--   ※ (가) 를 먼저 돌린 뒤에 이걸 돌려라. 순서가 바뀌면 (가) 가 이미 옮긴 줄까지 걸린다.
update candidates c
   set parked_under = null
 where c.parked_under is not null
   and not exists (select 1 from candidates x
                    where x.code=c.code and x.kind='region' and x.ref_id = c.parked_under);

-- ── 갈래 (다) 전부 다시 보이게 한다 (19건 한 번에) ───────────────────────────
--   (가)+(나) 대신 이것만 돌려도 된다. 더 단순하지만 잃는 것이 있다:
--   되돌리기로 '넣어 둔' 지점 후보가 지역을 다시 고르기도 전에 목록에 나타난다 —
--   방장이 지역을 아직 안 정했는데 지점 후보가 보이는 상태가 된다.
--   지금 13건이 stage='region' 인 모임에 있어 실제로 그렇게 된다. 권고하지 않는다.
--   되돌릴 수 있다. 걸리는 행: 19
update candidates set parked_under = null where parked_under is not null;

-- ── 갈래 (라) 지운다 ─────────────────────────────────────────────────────────
--   걸리는 행: 19 (+ 표 22개 cascade)   ⛔ 되돌릴 수 없다
--   사용자에게 보이는 것: 그 지점 후보를 찍은 사람들의 표가 소리 없이 사라진다.
delete from candidates where parked_under is not null;


-- ══════════════════════════════════════════════════════════════════════════════
-- D03. 주인 없는 users 행 — **661 / 929** (05:06 기준. 04:41 에는 485/744 였다)
--      "주인 없는 참가자 379/605" 로 알려져 있던 것의 정체다 — participants 가 아니라 users 다.
--      **참가자가 주인 없는 일은 0건이고 구조적으로 불가능하다** (FK·CHECK 가 막는다).
--      결함이 아니라 새는 것이다. 청소 대상. 다만 새는 구멍(모임 하나에 users 한 줄)은 결함이다.
--      되돌릴 수 있나: 아니오 (다만 아무도 안 가리키는 행이라 잃을 것이 없다)
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select count(*)::int as 지울행,
       (select count(*)::int from users) as 전체,
       min(created_at) as 가장오래된, max(created_at) as 가장최근
  from users u
 where not exists (select 1 from participants p where p.user_id = u.id);
-- 기대: 661 / 929 (그 중 한 시간 넘은 것 400 — 아래 delete 가 실제로 지우는 수)
-- ①-c 참가자에 붙어 있는 users 행은 몇 개인가 (지우면 안 되는 것)
select count(*)::int as 쓰이는행 from users u
 where exists (select 1 from participants p where p.user_id = u.id);

-- ①-b 무엇이 남아 있는지 (닉네임은 사용자가 적은 이름이다 — 개인정보 잔여물)
select nickname, count(*)::int as n from users u
 where not exists (select 1 from participants p where p.user_id = u.id)
 group by nickname order by n desc;

-- ── 지운다 ───────────────────────────────────────────────────────────────────
--   사용자에게 보이는 것: 아무것도. users 행은 화면 어디에도 안 나온다.
--   ⚠ '한 시간 지난 것만' 을 반드시 붙여라. createMeeting 은 users 를 먼저 만들고
--     참가자를 나중에 만드는 3문장짜리라, 그 사이에 있는 행을 지우면 만들던 모임이 깨진다.
--   ⛔ 되돌릴 수 없다 (백업 브랜치에서만 되살릴 수 있다)
--
-- 걸리는 행: 약 400 (전체 661 중 한 시간 넘은 것만)
delete from users u
 where not exists (select 1 from participants p where p.user_id = u.id)
   and u.created_at < now() - interval '1 hour';


-- ══════════════════════════════════════════════════════════════════════════════
-- D04. 방장 없는 모임 — **1건** (HWMPXD '검증모임', 참가자 1명)
--      04:41 에 있던 사람 0명 4건('유령 만들기')은 만든 갈래가 스스로 치웠다.
--      **새로 생기는 길은 막혔다** — lib/db.ts createMeeting 이 sql.transaction 으로
--      묶여 모임·참가자·host_id 가 한꺼번에 들어간다. 남은 1건은 그 전의 흔적이다.
--      다만 `meetings_host_fk … on delete set null` 은 그대로라 방장 참가자 줄이
--      사라지면 여전히 유령이 된다 — 아래 F5 가 그 길을 막는다.
--      되돌릴 수 있나: (가)=예 / (나)=아니오
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select m.code, m.name, m.stage, m.closed_at, m.created_at, m.updated_at,
       (select count(*)::int from participants p where p.code = m.code) as 참가자,
       (select p.id   from participants p where p.code=m.code and p.state='active' order by p.joined_at limit 1) as 첫참가자,
       (select p.name from participants p where p.code=m.code and p.state='active' order by p.joined_at limit 1) as 첫참가자이름
  from meetings m where m.host_id is null order by m.created_at;
-- 기대: 1행 (HWMPXD, 참가자 1명 '영희'). 0 이면 이미 치워진 것이니 이 블록을 건너뛰어라.
-- 참고: created_at = updated_at 인 줄은 '모임 줄만 들어가고 참가자 줄이 실패' 한 흔적이다.
--       HWMPXD 는 다르다(1.4초 뒤 updated) — 방장 참가자 줄이 나중에 사라진 쪽이다.

-- ── 갈래 (가) 남은 사람 중 가장 먼저 들어온 사람을 방장으로 세운다 ───────────
--   사용자에게 보이는 것: 방장이 없던 모임에 방장 도구가 생긴다.
--   되돌릴 수 있다 (host_id = null 로 되돌리면 된다).
--   걸리는 행: 1  (사람이 있는 모임만 걸린다)
update meetings m
   set host_id = (select p.id from participants p
                   where p.code = m.code and p.state = 'active'
                   order by p.joined_at limit 1)
 where m.host_id is null
   and exists (select 1 from participants p where p.code = m.code and p.state = 'active');

-- ── 갈래 (나) 사람이 아무도 없는 모임은 지운다 ───────────────────────────────
--   사용자에게 보이는 것: 아무것도. 아무도 이 코드를 모르고, 쿠키를 가진 사람도 없다.
--   ⛔ 되돌릴 수 없다.
--   걸리는 행: 0 (05:06 기준. 04:41 에는 4였다 — 만든 갈래가 스스로 치웠다)
delete from meetings m
 where m.host_id is null
   and not exists (select 1 from participants p where p.code = m.code);

-- ── 갈래 (다) 그대로 둔다 ────────────────────────────────────────────────────
--   사람 1명짜리(HWMPXD)는 그 사람이 영영 아무것도 못 한다 —
--   마무리·되돌리기·사람 관리·모임 삭제가 전부 403. 나가기만 된다.
--   나가고 나면 (나) 와 같은 '사람 0명 모임' 이 된다. 권고하지 않는다.


-- ══════════════════════════════════════════════════════════════════════════════
-- D05. 방장이 강퇴 상태 — 2건 (6Q42RK · ZT9LLK)
--      되돌릴 수 있나: 예
--      ※ D01 (다) 로 이 두 모임을 지우면 이 항목은 저절로 사라진다.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select m.code, m.name, p.id as host_id, p.name as 방장이름, p.state,
       (select count(*)::int from participants x where x.code=m.code and x.state='active') as 남은사람
  from meetings m join participants p on p.id = m.host_id
 where p.state <> 'active' order by m.created_at;
-- 기대: 2행 (둘 다 state='kicked')

-- ── 갈래 (가) 방장을 다시 active 로 ──────────────────────────────────────────
--   사용자에게 보이는 것: 얼어 있던 모임이 다시 움직인다.
--   되돌릴 수 있다 (state='kicked' 로 되돌리면 된다).
--   걸리는 행: 2
update participants p
   set state = 'active', requested_at = null
  from meetings m
 where m.host_id = p.id and p.state <> 'active';

-- ── 갈래 (나) 방장을 남은 사람에게 넘긴다 ────────────────────────────────────
--   사용자에게 보이는 것: 다른 사람이 방장이 된다. 강퇴된 옛 방장은 강퇴된 채 남는다.
--   되돌릴 수 있다. 걸리는 행: 2
update meetings m
   set host_id = (select p.id from participants p
                   where p.code = m.code and p.state = 'active'
                   order by p.joined_at limit 1)
 where exists (select 1 from participants p where p.id = m.host_id and p.state <> 'active')
   and exists (select 1 from participants p where p.code = m.code and p.state = 'active');


-- ══════════════════════════════════════════════════════════════════════════════
-- D06. 정한 것 없이 마무리된 모임 — 22건
--      ⚠ 이건 데이터가 깨진 것인가, 규칙이 정해지지 않은 것인가가 먼저다 (그릴링 G36).
--      사람이 정하기 전에는 아무것도 돌리지 마라.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select code, name, scope, stage, closed_at, created_at,
       (select count(*)::int from candidates c where c.code = meetings.code) as 후보,
       (select count(*)::int from participants p where p.code = meetings.code) as 참가자
  from meetings
 where closed_at is not null and coalesce(winner_place_id, winner_region_id) is null
 order by created_at;
-- 기대: 22행 (전부 stage='region', 전부 시험 데이터: H-0~5 · V-race* · A4 · A4dbg)

-- ── 갈래 (가) 마무리를 취소해 다시 연다 ─────────────────────────────────────
--   사용자에게 보이는 것: 지난 모임이 '지역 정하는 중' 으로 돌아온다.
--   되돌릴 수 있다(closed_at 값을 저장해 뒀다면). 걸리는 행: 22
select code, closed_at from meetings                      -- ← 되돌리기 밑천. 먼저 저장하라
 where closed_at is not null and coalesce(winner_place_id, winner_region_id) is null;
update meetings set closed_at = null
 where closed_at is not null and coalesce(winner_place_id, winner_region_id) is null;

-- ── 갈래 (나) 지운다 ─────────────────────────────────────────────────────────
--   ⛔ 되돌릴 수 없다. 걸리는 행: 22 (+ cascade)
delete from meetings
 where closed_at is not null and coalesce(winner_place_id, winner_region_id) is null;

-- ── 갈래 (다) 그대로 둔다 ────────────────────────────────────────────────────
--   지난 모임 화면이 "아직 정해지지 않았어요" 로 뜬다. 거짓말은 아니다.
--   G36 이 '확정 없이 끝난 모임도 있을 수 있다' 로 정해지면 이게 맞는 답이다.


-- ══════════════════════════════════════════════════════════════════════════════
-- D07. 마무리했는데 stage 가 result 가 아님 — 44건
--      그 중 22건은 D06(정한 것 없음), 나머지 22건은 '지역만 정하고 마무리'.
--      후자는 close() 가 일부러 허용하는 길이라 결함이 아닐 수 있다 (G36).
--      ⚠ 사람이 정하기 전에는 돌리지 마라.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select code, name, scope, stage, closed_at, winner_region_id, winner_place_id
  from meetings where closed_at is not null and stage <> 'result' order by created_at;
-- 기대: 44행

-- ── 갈래 (가) 정해진 곳이 있는 것만 stage 를 result 로 올린다 ────────────────
--   사용자에게 보이는 것: 사실상 아무것도 — 화면은 closed_at 이 있으면 이미 결과로 그린다.
--   DB 안의 앞뒤가 맞게 될 뿐이다. 되돌릴 수 있다. 걸리는 행: 22
update meetings set stage = 'result'
 where closed_at is not null and stage <> 'result'
   and coalesce(winner_place_id, winner_region_id) is not null;


-- ══════════════════════════════════════════════════════════════════════════════
-- D08. 강퇴된 사람의 표 — 15개 / 11개 모임
--      ⚠ 규칙이 안 정해졌다 (그릴링 G02). 사람이 정하기 전에는 돌리지 마라.
--      ⛔ 지우면 되돌릴 수 없다 — 그리고 6개 모임에서 1위가 바뀐다.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT — 몇 표가 걸리는가
select v.code, count(*)::int as 표, m.stage, m.closed_at
  from votes v join participants p on p.id = v.participant_id
       join meetings m on m.code = v.code
 where p.state <> 'active' group by v.code, m.stage, m.closed_at order by 2 desc;
-- 기대: 11행, 합 15표

-- ①-b 지우면 1위가 바뀌는 모임 수
with t as (
  select c.code, c.id, c.kind,
         count(v.*)::int                                  as 지금표,
         count(v.*) filter (where p.state = 'active')::int as 정리후표
    from candidates c
    left join votes v on v.candidate_id = c.id
    left join participants p on p.id = v.participant_id
   where c.parked_under is null
   group by c.code, c.id, c.kind
), r as (
  select code, kind,
         (array_agg(id order by 지금표   desc, id))[1] as 지금1위,
         (array_agg(id order by 정리후표 desc, id))[1] as 정리후1위
    from t group by code, kind
)
select count(*)::int as "1위가 바뀌는 모임" from r where 지금1위 is distinct from 정리후1위;
-- 기대: 6  (76S8P3 · LC8HCJ · NKCKW4 · QZYZ7Q · ZMWX8N · YJN55J)
--        ⚠ YJN55J 는 이미 마무리된 모임이고, 바뀌는 그 1위가 확정된 지역이다 —
--          지우면 '이미 끝난 모임의 결과' 를 뒤에서 바꾸게 된다.

-- ── 갈래 (가) 지운다 ─────────────────────────────────────────────────────────
--   사용자에게 보이는 것: 후보 득표수가 줄고 6개 모임에서 1위가 바뀐다.
--   진행 중 모임이라면 사람들이 보고 있던 순위가 소리 없이 뒤집힌다.
--   ⛔ 되돌릴 수 없다. 걸리는 행: 15
delete from votes v
 using participants p
 where p.id = v.participant_id and p.state <> 'active';

-- ── 갈래 (나) 그대로 둔다 ← 규칙이 정해질 때까지의 기본값
--   지금은 '나가면 표를 빼고, 강퇴하면 남긴다' 로 규칙이 둘이다. 그 자체가 안건이다.


-- ══════════════════════════════════════════════════════════════════════════════
-- D09. 영원히 안 끝나는 승인 대기 — 1건
--      되돌릴 수 있나: 예
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select id, code, name, state, requested_at, joined_at
  from participants where state = 'pending' and requested_at is null;
-- 기대: 1행

-- ── 고친다: 들어온 시각을 신청 시각으로 삼는다 ───────────────────────────────
--   사용자에게 보이는 것: 24시간이 이미 지났으므로 다음 조회 때 자동 거절되어
--   '방장이 받아 주지 않았어요' 상태가 된다. 되돌릴 수 있다. 걸리는 행: 1
update participants set requested_at = joined_at
 where state = 'pending' and requested_at is null;


-- ══════════════════════════════════════════════════════════════════════════════
-- D10. ref_id 가 없는 후보 — 6건 (6Q42RK 3 · ZT9LLK 3, 전부 '무명동')
--      옛 코드가 같은 동을 세 줄로 만든 흔적. 지금 라우트는 refId 를 강제한다.
--      ⛔ 지우면 되돌릴 수 없다 (표가 함께 사라진다)
--      ※ D01 (다) 로 그 두 모임을 지우면 이 항목도 저절로 사라진다.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select c.code, c.id, c.kind, c.name, c.created_at,
       (select count(*)::int from votes v where v.candidate_id = c.id) as 표
  from candidates c where c.ref_id is null order by c.code, c.created_at;
-- 기대: 6행

-- ── 갈래 (가) 지운다 (표도 함께) ─────────────────────────────────────────────
--   걸리는 행: 6 (+ 표 cascade). ⛔ 되돌릴 수 없다.
delete from candidates where ref_id is null;

-- ── 갈래 (나) 이름이 같은 것끼리 합친다 ──────────────────────────────────────
--   표를 옮기고(중복은 버리고) 나머지를 지워야 해서 문장이 길고 위험하다.
--   시험 데이터라 값어치가 없다. 실사용자 데이터였다면 이쪽을 짜야 한다.


-- ══════════════════════════════════════════════════════════════════════════════
-- D11. 주인을 뗀 후보 (created_by = null) — 7건
--      결함이 아니다. '남이 찍어 준 내 후보를 두고 나갈 때' 일부러 떼는 값이다(leave).
--      언제 치울지는 그릴링 G39. 지금은 아무것도 하지 마라.
-- ══════════════════════════════════════════════════════════════════════════════
select c.code, c.id, c.kind, c.name, c.created_at,
       (select count(*)::int from votes v where v.candidate_id = c.id) as 표
  from candidates c where c.created_by is null order by c.created_at;
-- 기대: 7행 (그 중 3건은 표가 0 — 아무도 안 찍었는데 영영 남는다)


-- ══════════════════════════════════════════════════════════════════════════════
-- D14. 이름이 빈 모임 — 2건
--      지금 라우트는 빈 이름을 400 으로 막는다. 가드 이전의 흔적.
-- ══════════════════════════════════════════════════════════════════════════════
select code, name, created_at, host_id from meetings where trim(name) = '';
-- 기대: 2행
-- 고치려면 (되돌릴 수 있다. 걸리는 행: 2):
update meetings set name = '이름 없는 모임' where trim(name) = '';


-- ══════════════════════════════════════════════════════════════════════════════
-- D15. 한국 밖 좌표 — 출발지 1 · 후보 3 · 동이름 캐시 19
--      논의55 로 '받아 주는 자리는 한국(위도 33–38.7 · 경도 124.5–132)' 이 정해졌다.
--      그 범위 밖으로 저장된 낡은 줄을 센다.
--      되돌릴 수 있나: 출발지·후보는 아니오(값을 지어낼 수 없다) / 캐시는 예(다시 채워진다)
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select 'participant' as 무엇, p.code, p.id, p.name, p.lat, p.lng, p.joined_at as 시각
  from participants p
 where p.lat is not null and p.lng is not null
   and not (p.lat between 33 and 38.7 and p.lng between 124.5 and 132)
union all
select 'candidate', c.code, c.id, c.name, c.lat, c.lng, c.created_at
  from candidates c
 where not (c.lat between 33 and 38.7 and c.lng between 124.5 and 132)
 order by 시각;
-- 기대: 4행 — SF7H7Q 의 '지구밖'(999,999) · 9WCDXK 의 '90,0' '-90,0' '0,180'.
--       전부 극단값 시험이 만든 것이고, 지금 route.ts 의 좌표유효(|lat|<90·|lng|<180)가
--       이 넷을 이미 막는다. **그런데 도쿄(35.68, 139.76)는 아직 통과한다** —
--       route.ts 는 한국 상자를 안 본다. lib/geo.ts 의 `한국안` 을 거기서도 써야 한다.
--       (SQL 로 고칠 것이 아니라 코드에서 막을 일이다. 아래는 흔적 청소일 뿐이다.)

-- ── 갈래 (가) 그 후보를 지운다 ───────────────────────────────────────────────
--   걸리는 행: 3 (+ 딸린 표 cascade)  ⛔ 되돌릴 수 없다
--   사용자에게 보이는 것: 지도 밖으로 튀어 나가던 핀 3개가 사라진다.
delete from candidates
 where not (lat between 33 and 38.7 and lng between 124.5 and 132);

-- ── 갈래 (나) 그 출발지를 비운다 ─────────────────────────────────────────────
--   걸리는 행: 1. ⛔ 원래 좌표는 못 되살린다(값을 어디에도 안 남겼다).
--   사용자에게 보이는 것: 그 사람이 '출발지를 아직 안 낸 사람' 이 된다.
--   좌표를 지어 넣는 것보다 낫다 — 가운데를 계산할 때 통째로 빠진다.
update participants set lat = null, lng = null, origin_name = null
 where lat is not null and lng is not null
   and not (lat between 33 and 38.7 and lng between 124.5 and 132);

-- ── 갈래 (다) 동이름 캐시를 비운다  ← 권고 ───────────────────────────────────
--   걸리는 행: 19 (도쿄·뉴욕·파리·시드니·레이캬비크·평양). 전부 source='osm'.
--   되돌릴 수 있다 — 캐시라서 필요하면 다시 채워진다. 다만 논의55 뒤에는
--   그 자리를 부를 일 자체가 없어야 하므로 다시 안 채워지는 것이 정상이다.
--   사용자에게 보이는 것: 아무것도.
delete from geo_cache
 where not (gy/10000.0 between 33 and 38.7 and gx/10000.0 between 124.5 and 132);


-- ══════════════════════════════════════════════════════════════════════════════
-- D16. AI 표시가 아무 데서도 안 켜진다 — by_ai 가 켜진 후보 **0건**
--      ⚠ SQL 로 고칠 것이 없다. 코드 결함이라 여기 적어만 둔다.
-- ══════════════════════════════════════════════════════════════════════════════
--   candidates.by_ai 는 스키마에 있고 lib/types.ts 에도 있는데, **쓰는 곳이 한 군데도 없다.**
--   route.ts 의 ai 갈래는 db.ping 을 그대로 부르고, ping 은 by_ai 를 안 넣는다(기본값 false).
--   그래서 지금 DB 의 773개 후보 중 by_ai=true 는 0개다.
--
--   막히는 것:
--     · 논의53 'AI 후보만 0표 삭제 예외' — **가려낼 방법이 없어 넣을 수 없다.**
--     · 논의47 'AI 가 올린 곳은 표 없이 올라간다' — 지금은 방장 이름으로 표까지 준다.
--   먼저 해야 할 코드 수정 (다른 갈래의 파일이다):
--     lib/db.ts ping() 에 byAi 인자 → insert 의 by_ai 로, on conflict 에서는 안 덮는다
--     app/api/m/[code]/route.ts ai 갈래 → db.ping(..., { byAi: true })
select count(*)::int as ai후보 from candidates where by_ai;
-- 기대: 0 — 1 이상이 되면 위 수정이 들어간 것이다.


-- ══════════════════════════════════════════════════════════════════════════════
-- D17. 0표 후보 13건 — 논의50('표가 0이 되면 후보도 사라진다') 을 지금 데이터에 대면
--      ⚠ 그대로 돌리면 **D01(댕글링 winner) 이 8건 새로 생긴다.** 반드시 걸러라.
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 세는 SELECT
select c.id, c.code, c.kind, c.name, c.by_ai,
       (m.winner_region_id = c.id or m.winner_place_id = c.id) as 확정된곳,
       c.parked_under is not null as 넣어둔것, m.stage, m.closed_at is not null as 마무리됨
  from candidates c join meetings m on m.code = c.code
 where not exists (select 1 from votes v where v.candidate_id = c.id)
 order by 확정된곳 desc nulls last, c.code;
-- 기대: 13행. **그 중 8건이 이미 확정된 곳이다** (7건은 마무리된 모임의 결과).
--       표가 0인데 확정된 것은 leave/kick 이 표만 빼고 후보는 남겼기 때문이다 —
--       지금 코드가 우승 후보를 일부러 안 지운다(lib/db.ts unping·leave).
--       AI 가 올린 것은 0건이다(D16 — 표시가 아예 안 켜진다).

-- ── 갈래 (가) 논의50 을 데이터에도 소급한다 ← 조건부 권고 ────────────────────
--   무엇을: 표가 0인 후보를 지운다. 단 **확정된 곳 · 넣어 둔 것 · AI 것은 뺀다.**
--     · 확정된 곳을 빼는 이유 — 지우면 winner_* 가 허공을 가리킨다(= D01 을 새로 만든다)
--     · 넣어 둔 것을 빼는 이유 — 지금 안 보이는 것이라 '0표' 판정 자체가 부정확하다
--     · AI 것을 빼는 이유 — 논의53. 지금은 0건이지만 D16 이 고쳐지면 생긴다
--   사용자에게 보이는 것: 아무도 안 찍은 후보 5개가 목록에서 사라진다.
--   ⛔ 되돌릴 수 없다. 걸리는 행: 5
delete from candidates c
 using meetings m
 where m.code = c.code
   and not exists (select 1 from votes v where v.candidate_id = c.id)
   and not c.by_ai
   and c.parked_under is null
   and c.id is distinct from m.winner_region_id
   and c.id is distinct from m.winner_place_id;

-- ── 갈래 (나) 지금 것은 두고 앞으로만 적용한다 ← 기본값 ──────────────────────
--   논의50 은 '표가 0이 **되면**' 이다. 이미 0인 옛 줄까지 소급할 이유는 없다.
--   코드(lib/db.ts unping·kick·leave)에만 넣으면 새로 생기지 않는다.
--   ※ 코드에 넣을 때도 위와 **같은 세 가지 예외**가 필요하다. 예외 없이 넣으면
--     강퇴 한 번으로 확정된 곳이 사라져 결과가 허공을 가리킨다.


-- ══════════════════════════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
--
--   여기부터: 다시는 이렇게 안 되게 하는 제약
--
--   ⚠ 아래 제약은 **어긋난 행이 하나라도 남아 있으면 붙지 않는다.**
--     ALTER 는 붙이는 순간 기존 행을 전부 검사한다. 위쪽 정리를 먼저 끝내라.
--
--   순서
--     1) D01 을 치운다            → 없으면 F1·F2 가 안 붙는다 (11건)
--     2) D02 를 옮긴다/푼다        → F3' 을 붙일 거라면 먼저. F3(옛 판)은 아예 붙이지 마라 (19건)
--     3) D04 를 치운다(권고)      → F5 는 null 을 검사하지 않아 안 치워도 붙지만,
--                                   유령 모임을 남긴 채로 잠그면 영영 못 지운다 (1건)
--     4) F1·F2·F4·F5·F6·F7 (외래키)  ※ F3 은 아래 경고를 읽고 판단
--     5) D06·D09·D10·D14 를 치운다 → C5·C6·C8 이 안 붙는다
--     6) C1~C8 (CHECK)
--     7) U1 (후보 유일성 범위) — 사람이 정한 뒤에. 코드도 함께 고쳐야 붙는다
--
--   ⛔ ALTER 는 되돌릴 수 있다 (drop constraint). 다만 붙인 뒤로는
--     지금까지 200 으로 지나가던 요청이 500 으로 바뀔 수 있다 — 아래 각 항의 '무엇이 깨지나' 를 읽어라.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 붙기 전에: 위반 행이 0인지 한 번에 확인 ─────────────────────────────────
select
  (select count(*)::int from meetings m where m.winner_region_id is not null
     and not exists (select 1 from candidates c where c.id=m.winner_region_id))                              as "F1 위반",
  (select count(*)::int from meetings m where m.winner_place_id is not null
     and not exists (select 1 from candidates c where c.id=m.winner_place_id))                               as "F2 위반",
  (select count(*)::int from candidates c where c.parked_under is not null
     and not exists (select 1 from candidates x where x.id=c.parked_under))                                  as "F3 위반(옛 판 — 붙이지 마라)",
  (select count(*)::int from candidates c where c.parked_under is not null
     and not exists (select 1 from candidates x
                      where x.code=c.code and x.kind='region' and x.ref_id=c.parked_under))                  as "F3' 위반",
  (select count(*)::int from votes v join candidates c on c.id=v.candidate_id
     where v.code<>c.code or v.kind<>c.kind)                                                                 as "F6 위반",
  (select count(*)::int from votes v join participants p on p.id=v.participant_id where v.code<>p.code)      as "F7 위반",
  (select count(*)::int from meetings where scope='region' and winner_place_id is not null)                  as "C1 위반",
  (select count(*)::int from meetings where stage='result' and coalesce(winner_place_id,winner_region_id) is null) as "C2 위반",
  (select count(*)::int from meetings where stage='place'  and winner_region_id is null)                     as "C3 위반",
  (select count(*)::int from meetings where stage='region' and (winner_region_id is not null or winner_place_id is not null)) as "C4 위반",
  (select count(*)::int from meetings where closed_at is not null and coalesce(winner_place_id,winner_region_id) is null)     as "C5 위반",
  (select count(*)::int from participants where state='pending' and requested_at is null)                    as "C6 위반",
  (select count(*)::int from candidates where parked_under is not null and (kind<>'place' or parked_under=ref_id)) as "C7 위반",
  (select count(*)::int from candidates where ref_id is null)                                                as "C8 위반";
-- 2026-08-12 05:06 기준: F1=8 F2=3 F3=3 F3'=19 F6=0 F7=0
--                        C1=0 C2=0 C3=0 C4=0 C5=22 C6=1 C7=0 C8=6


-- ══════════════════════════════════════════════════════════════════════════════
-- F1·F2  meetings.winner_region_id / winner_place_id → candidates(id)
--
--   왜:  이 짝에 FK 가 없어서 11건이 허공을 가리킨다. 이 파일이 있는 이유다.
--   ON DELETE 판단:  **no action** (= 우승 후보는 지워지지 않는다)
--     · cascade   ✗ 후보 하나 지웠다고 모임이 통째로 사라지면 안 된다.
--     · set null  △ 조용히 '아무것도 안 정해진 모임' 이 된다. 끝난 모임이라면
--                   결과가 소리 없이 사라진다 — 지금 11건이 겪는 것과 같은 손해다.
--     · no action ○ 우승 후보를 지우려는 시도 자체가 실패한다. 앱은 이미
--                   unping·leave 에서 우승 후보를 안 지우도록 막아 뒀으니
--                   정상 경로에서는 절대 안 걸리고, 경합으로 빠져나가던 구멍만 막힌다.
--   무엇이 깨지나: 확정된 뒤 그 후보를 지우려는 경합이 500 이 된다(지금은 조용히 깨진다).
--                 500 이 나면 화면은 "잠시 뒤 다시 해 주세요" 로 말해야 한다.
--   ⚠ restrict 가 아니라 no action 을 쓰는 이유: 모임을 지울 때 candidates 가
--     cascade 로 함께 지워지는데, restrict 는 그 자리에서 바로 막아 remove 가 깨진다.
--     no action 은 문장이 끝날 때 보므로 그때는 meetings 행도 이미 없어 통과한다.
alter table meetings add constraint meetings_winner_region_fk
  foreign key (winner_region_id) references candidates(id) on delete no action;
alter table meetings add constraint meetings_winner_place_fk
  foreign key (winner_place_id)  references candidates(id) on delete no action;

--   더 세게 걸고 싶으면(같은 모임의 후보만 우승자로 삼도록):
--     alter table candidates add constraint candidates_id_code_key unique (id, code);
--     alter table meetings add constraint meetings_winner_region_pair_fk
--       foreign key (winner_region_id, code) references candidates(id, code) on delete no action;
--     alter table meetings add constraint meetings_winner_place_pair_fk
--       foreign key (winner_place_id, code)  references candidates(id, code) on delete no action;
--   위반 0행이라 지금 바로 붙는다. kind(region/place)까지는 FK 로 못 묶는다 — C1~C4 가 대신 본다.


-- ══════════════════════════════════════════════════════════════════════════════
-- F3  candidates.parked_under → candidates(id)      ⛔ **붙이지 마라 (폐기)**
--
--   이건 parked_under 에 '후보 id' 가 들어간다는 옛 전제로 쓴 것이다.
--   코드가 바뀌어 지금은 **지역 후보의 ref_id**(행정동 코드)가 들어간다.
--   붙이면 두 가지가 한꺼번에 망가진다:
--     ① 지금 19줄이 전부 위반이라 ALTER 자체가 실패한다.
--     ② 설령 데이터를 비우고 붙여도, 새 reopen() 이 ref_id 를 써 넣는 순간
--        FK 위반 500 이 난다 — 되돌리기가 통째로 죽는다.
--   아래 F3' 을 대신 쓴다.
--
-- alter table candidates add constraint candidates_parked_under_fk
--   foreign key (parked_under) references candidates(id) on delete set null;


-- ══════════════════════════════════════════════════════════════════════════════
-- F3'  candidates.(code, parked_under) → candidates(code, kind, ref_id)   [새 열쇠용]
--
--   왜:  넣어 둔 지점 후보가 '이 모임에 없는 지역'을 가리키면 영영 안 꺼내진다(지금 19건).
--        열쇠가 ref_id 로 바뀌었으니 FK 도 (code, kind='region', ref_id) 를 가리켜야 한다.
--   전제: candidates 에 이미 unique (code, kind, ref_id) 가 있다 — 그대로 참조한다.
--        kind 를 상수로 고정할 방법이 없어 생성 칸을 하나 둔다(값을 손으로 넣지 않는다).
--        MATCH SIMPLE 이라 parked_under 가 null 이면 검사 자체를 건너뛴다.
--   ON DELETE 판단:  **set null (parked_under)**  ← PostgreSQL 15+ 의 칸 지정 문법.
--                    이 DB 는 18.4 라 쓸 수 있다.
--     · no action ✗ 지역 후보를 지우는 정상 동작(0표 후보 빼기·논의50)이 500 이 된다.
--     · cascade   ✗ 지역 후보 하나 뺐다고 그 아래 넣어 둔 지점 후보가 표까지 사라진다.
--     · set null  ○ 매달 곳이 없어지면 숨김이 풀려 **도로 보인다.** 사용자가 알아채고
--                   손쓸 수 있는 상태가 '영영 안 보임' 보다 낫다.
--     ⚠ 생성 칸은 set null 의 대상이 될 수 없다 — 그래서 칸을 지정해 parked_under 만 비운다.
--       (칸 지정 없이 `on delete set null` 만 쓰면 ALTER 가 거절된다.)
--   무엇이 깨지나: 지역 후보를 뺀 순간 숨어 있던 지점 후보가 목록에 갑자기 나타난다 —
--                 화면이 이걸 어떻게 말할지는 그릴링 안건(P5).
--   ⚠ 먼저 D02 (가)+(나) 를 돌려 위반을 0으로 만들어라. 안 그러면 안 붙는다.
alter table candidates add column parked_kind text
  generated always as (case when parked_under is null then null else 'region' end) stored;
alter table candidates add constraint candidates_parked_ref_fk
  foreign key (code, parked_kind, parked_under)
  references candidates (code, kind, ref_id) on delete set null (parked_under);

--   생성 칸을 늘리기 싫다면 (더 약하지만 아무것도 안 늘린다):
--     FK 를 포기하고 tests/운영데이터.mjs 의 D02 검사로만 지킨다.
--     그러면 어긋난 줄이 생기는 것을 막지는 못하고 '생겼다'는 것만 알게 된다.


-- ══════════════════════════════════════════════════════════════════════════════
-- F4  candidates.created_by → participants(id)   [이미 있다. ON DELETE 만 바꾼다]
--
--   왜:  지금은 ON DELETE 가 없어(no action) 남이 찍어 준 내 후보를 두고 나가면
--        FK 위반 500 이 났다. leave() 가 나가기 직전에 created_by 를 손수 null 로
--        밀어 넣어 겨우 피하고 있다 — DB 가 할 일을 코드가 대신하고 있다.
--   ON DELETE 판단:  **set null** (지금 코드가 손으로 하는 것과 똑같다)
--   무엇이 깨지나: 아무것도. 오히려 lib/db.ts 의 leave() 에서
--                 "update candidates set created_by = null ..." 한 줄을 지울 수 있다.
alter table candidates drop constraint candidates_created_by_fkey;
alter table candidates add  constraint candidates_created_by_fk
  foreign key (created_by) references participants(id) on delete set null;


-- ══════════════════════════════════════════════════════════════════════════════
-- F5  meetings.host_id → participants(id)   [이미 있다. ON DELETE 만 바꾼다]
--
--   왜:  지금 set null 이라 방장 줄이 사라지면 모임이 소리 없이 '방장 없는 모임' 이 된다.
--        그러면 마무리·되돌리기·사람 관리·모임 삭제가 전부 403 — 아무도 못 지운다.
--   ON DELETE 판단:  **no action** (= 방장인 채로는 지워질 수 없다)
--     앱 규칙이 이미 '방장은 넘긴 뒤에야 나갈 수 있다' 이므로 DB 규칙과 같아진다.
--     모임을 지울 때는 meetings 행이 먼저 없어지므로 문장 끝 검사에서 통과한다.
--   무엇이 깨지나: 방장을 지우려는 경로가 500 이 된다. 정상 경로에는 없다.
--   ⚠ 먼저 D04 를 치워라. 이미 null 인 5건은 FK 검사 대상이 아니라 그냥 남는다 —
--     제약을 붙였다고 저절로 고쳐지지 않는다.
alter table meetings drop constraint meetings_host_fk;
alter table meetings add  constraint meetings_host_fk
  foreign key (host_id) references participants(id) on delete no action;


-- ══════════════════════════════════════════════════════════════════════════════
-- F6·F7  votes 의 code·kind 가 후보·참가자와 어긋나지 못하게 (복합 FK)
--
--   왜:  지금 votes.code·votes.kind 는 각자 따로 들어가는 값이라
--        후보의 code·kind 와 달라져도 DB 가 모른다. 지금은 0건이지만 막을 것이 없다.
--   ON DELETE 판단: **cascade** — 지금 단일 FK 와 같다. 후보나 사람이 사라지면 표도 사라진다.
--   무엇이 깨지나: 아무것도 (위반 0행).
alter table candidates   add constraint candidates_id_kind_key   unique (id, kind);
alter table participants add constraint participants_id_code_key unique (id, code);
alter table votes add constraint votes_cand_kind_fk
  foreign key (candidate_id, kind) references candidates(id, kind) on delete cascade;
alter table votes add constraint votes_part_code_fk
  foreign key (participant_id, code) references participants(id, code) on delete cascade;
-- 붙인 뒤에는 기존 votes_candidate_id_fkey · votes_participant_id_fkey 가 겹치므로
-- 지워도 된다(인덱스 하나가 줄어든다). 지우지 않아도 해롭지 않다.


-- ══════════════════════════════════════════════════════════════════════════════
-- C1~C8  CHECK — FK 로는 못 묶는 '앞뒤가 맞는가'
-- ══════════════════════════════════════════════════════════════════════════════

-- C1  '지역까지' 모임에는 지점 우승자가 있을 수 없다            [위반 0]
alter table meetings add constraint meetings_scope_winner_chk
  check (scope <> 'region' or winner_place_id is null);

-- C2  결과 단계면 정해진 곳이 있어야 한다                        [위반 0]
alter table meetings add constraint meetings_result_winner_chk
  check (stage <> 'result' or coalesce(winner_place_id, winner_region_id) is not null);

-- C3  지점 단계면 지역이 먼저 정해져 있어야 한다                 [위반 0]
-- C4  지역 단계면 아직 아무것도 정해지지 않았어야 한다           [위반 0]
alter table meetings add constraint meetings_stage_winner_chk
  check (
    (stage = 'region' and winner_region_id is null and winner_place_id is null) or
    (stage = 'place'  and winner_region_id is not null and winner_place_id is null) or
    (stage = 'result')
  );
--   ⚠ 이걸 붙이면 reopen()·confirm() 이 winner 와 stage 를 **한 문장에서 함께** 바꿔야 한다.
--     지금은 이미 그렇다(confirm·reopen 둘 다 한 update 에서 같이 바꾼다). 그래서 붙는다.

-- C5  마무리했으면 정해진 곳이 있어야 한다                       [위반 22 — D06 먼저]
--   ⚠ G36('확정 없이 끝난 모임을 허용할 것인가')이 '허용' 으로 정해지면 이 제약은 붙이면 안 된다.
alter table meetings add constraint meetings_closed_winner_chk
  check (closed_at is null or coalesce(winner_place_id, winner_region_id) is not null);

-- C5b '마무리했으면 stage 도 result' 는 **붙이지 마라**          [위반 44]
--   지금 close() 는 '지역만 정한 채 마무리' 를 일부러 허용한다. 규칙이 정해지기 전에는
--   이 제약이 정상 동작을 막는다. G36 이 정해진 뒤에 다시 본다.
-- alter table meetings add constraint meetings_closed_result_chk
--   check (closed_at is null or stage = 'result');

-- C6  승인 대기에는 신청 시각이 있어야 한다 (없으면 영원히 안 만료)  [위반 1 — D09 먼저]
alter table participants add constraint participants_pending_time_chk
  check (state <> 'pending' or requested_at is not null);

-- C7  넣어 둔 후보는 지점 후보다                                    [위반 0]
--   ⚠ 옛 판에 있던 `parked_under <> id` 는 뺐다. 열쇠가 ref_id 로 바뀌어
--     '자기 자신을 가리킨다' 는 말 자체가 성립하지 않는다(지역 ref_id vs 지점 id).
--     대신 자기 ref_id 를 가리키는 것은 막는다 — 지점이 자기를 지역으로 삼을 수는 없다.
alter table candidates add constraint candidates_parked_kind_chk
  check (parked_under is null or (kind = 'place' and parked_under <> ref_id));

-- C8  후보에는 ref_id 가 있어야 한다 (없으면 같은 곳이 무한 증식)   [위반 6 — D10 먼저]
--   지금 라우트는 refId 를 강제하고, AI 도 'ai:이름' 을 붙인다. 남은 건 옛 흔적뿐이다.
--   ※ F3' 을 붙일 거라면 이걸 **먼저** 해라 — 참조되는 열쇠에 null 이 섞이면 안 된다.
alter table candidates alter column ref_id set not null;


-- ══════════════════════════════════════════════════════════════════════════════
-- U1  후보 유일성의 범위 — unique (code, kind, ref_id) 를 지역별로 쪼갤 것인가
--
--   ⚠ **사람이 정하기 전에는 붙이지 마라.** 그릴링 안건 B9/P13 이다.
--     그리고 **코드를 함께 고치지 않으면 붙이는 순간 ping 이 깨진다** —
--     lib/db.ts ping() 의 `on conflict (code, kind, ref_id)` 는 그 이름의 유일 제약이
--     있어야 돌아간다. 제약을 갈면 on conflict 대상도 같이 갈아야 한다.
--
--   무엇이 문제인가 (실측)
--     지금 유일성이 지역과 무관하다. 그래서 성수에서 2표 받은 가게를 연남으로 옮겨
--     다시 찍으면 **같은 줄이 재사용되어 옛 표 2개가 새 지역으로 딸려 온다.**
--     좌표도 옛 지역 것이 남았다(실측: 연남-닭갈비 표 2 @ 성수 좌표).
--     지금 코드는 그중 절반만 손봤다 — ping 이 좌표는 새로 덮고(lat/lng = excluded),
--     '넣어 둔 줄' 을 다시 찍을 때는 옛 표를 지운다. 그러나 **넣어 두지 않은 줄**
--     (되돌리기를 안 거친 경우)은 여전히 표를 그대로 물려받는다.
--
--   갈래
--     ⓐ 지역별로 쪼갠다 — 지점 후보에 '어느 지역 밑인가' 를 적는 칸을 두고 열쇠에 넣는다.
--        같은 가게라도 지역이 다르면 딴 줄이 된다. 표가 넘어오는 일이 사라진다.
--        대가: 칸이 하나 늘고, 넣어 두기(parked_under)와 뜻이 겹친다 —
--              '지금 어느 지역 밑인가' 와 '어느 지역에 넣어 뒀는가' 를 둘 다 들고 있게 된다.
--        ⛔ 되돌릴 수 있지만(제약을 떼면 된다) 늘린 칸은 데이터가 쌓인 뒤엔 못 지운다.
--     ⓑ 지역이 바뀌면 표를 비운다 — 칸을 안 늘리고 ping 쪽에서 지운다.
--        지금 '넣어 둔 줄' 에만 있는 처리를 모든 줄로 넓히는 것이다.
--        대가: 지역을 다시 확정해 되돌아오면 표가 안 살아난다(Q10 과 부딪힌다).
--     ⓒ 그대로 둔다 — 같은 가게가 지역을 넘어 표를 물려받는 것을 '이어받기' 로 본다.
--        대가: 성수에서 받은 표로 연남의 1위가 정해진다.
--
--   ⓐ 를 고른다면 (칸 이름은 예시다. 아직 아무것도 안 돌렸다):
--     -- 1) 칸을 늘린다. 지역 후보는 늘 null 이다.
--     -- alter table candidates add column region_ref text;
--     -- 2) 지금 있는 지점 후보에 값을 채운다 — 넣어 둔 것은 그 열쇠, 나머지는 지금 확정된 지역.
--     -- update candidates c set region_ref = coalesce(
--     --          c.parked_under,
--     --          (select w.ref_id from meetings m join candidates w on w.id = m.winner_region_id
--     --            where m.code = c.code))
--     --  where c.kind = 'place';
--     -- 3) 열쇠를 간다.
--     -- alter table candidates drop constraint candidates_code_kind_ref_id_key;
--     -- alter table candidates add  constraint candidates_ref_scope_key
--     --   unique (code, kind, ref_id, region_ref);
--     --    ⚠ unique 는 NULL 을 서로 다르게 본다 — region_ref 가 null 인 지점 후보가
--     --      생기면 같은 가게가 다시 무한 증식한다(D10 과 같은 함정).
--     --      PostgreSQL 15+ 라면 `unique nulls not distinct (…)` 로 막는 편이 안전하다.
--     -- 4) lib/db.ts ping() 의 on conflict 를 (code, kind, ref_id, region_ref) 로 바꾸고
--     --    insert 에 region_ref 를 넣는다. 안 바꾸면 ping 이 전부 500 이 된다.
--     -- 5) F3' 은 그대로 쓸 수 있다 — 참조되는 열쇠는 지역 후보 쪽(kind='region')이고
--     --    지역 후보의 region_ref 는 늘 null 이라 (code, kind, ref_id) 유일성이 필요하다.
--     --    그래서 3) 에서 옛 제약을 떼면 F3' 이 함께 떨어진다. **F3' 을 먼저 떼고,
--     --    지역용 유일 제약을 따로 남긴 뒤(예: 부분 유일 인덱스가 아니라 제약이어야 한다)
--     --    다시 붙여라.** 순서를 어기면 F3' 이 안 붙는다.
--
--   ※ ⓐ 와 F3' 은 같은 칸을 두고 부딪힌다. 둘 다 하려면 U1 을 **먼저** 정하고,
--     F3' 은 그 뒤에 붙이는 것이 문장이 적다.


-- ══════════════════════════════════════════════════════════════════════════════
-- 붙인 뒤 확인 — 제약이 다 들어갔는가
-- ══════════════════════════════════════════════════════════════════════════════
select conrelid::regclass::text as 테이블, conname as 이름, contype as 종류,
       pg_get_constraintdef(oid) as 정의
  from pg_constraint
 where connamespace = 'public'::regnamespace and contype in ('f','c')
 order by 1, 3, 2;


-- ══════════════════════════════════════════════════════════════════════════════
-- 되돌리기 (제약만) — 붙인 것이 앱을 막으면 이걸로 뗀다
-- ══════════════════════════════════════════════════════════════════════════════
-- alter table meetings     drop constraint if exists meetings_winner_region_fk;
-- alter table meetings     drop constraint if exists meetings_winner_place_fk;
-- alter table candidates   drop constraint if exists candidates_parked_ref_fk;
-- alter table candidates   drop column     if exists parked_kind;      -- F3' 의 생성 칸
-- alter table candidates   drop constraint if exists candidates_created_by_fk;
-- alter table meetings     drop constraint if exists meetings_scope_winner_chk;
-- alter table meetings     drop constraint if exists meetings_result_winner_chk;
-- alter table meetings     drop constraint if exists meetings_stage_winner_chk;
-- alter table meetings     drop constraint if exists meetings_closed_winner_chk;
-- alter table participants drop constraint if exists participants_pending_time_chk;
-- alter table candidates   drop constraint if exists candidates_parked_kind_chk;
-- alter table votes        drop constraint if exists votes_cand_kind_fk;
-- alter table votes        drop constraint if exists votes_part_code_fk;
-- alter table candidates   drop constraint if exists candidates_id_kind_key;
-- alter table participants drop constraint if exists participants_id_code_key;
-- alter table candidates   alter column ref_id drop not null;
-- -- host_id 를 옛 규칙(set null)으로:
-- alter table meetings drop constraint meetings_host_fk;
-- alter table meetings add  constraint meetings_host_fk
--   foreign key (host_id) references participants(id) on delete set null;
