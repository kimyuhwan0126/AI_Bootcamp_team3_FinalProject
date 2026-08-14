/* 운영 데이터 무결성 감시 — 읽기만 한다.
   이 갈래는 데이터를 고치지 않고 각본만 썼다(점검/05_정리.sql). 그래서 시험도
   '고친 것이 되돌아갔는가' 가 아니라 '어긋난 것이 남아 있는가/늘었는가' 를 본다.
   05_정리.sql 을 돌리기 전에는 빨간불이 정상이다 — 돌린 뒤 초록불이 되어야 한다.

     node tests/운영데이터.mjs

   DB 에 SELECT 만 날린다. 문장이 select 로 시작하지 않으면 스스로 거부한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const 뿌리 = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = fs.readFileSync(path.join(뿌리, '.env.local'), 'utf8');
const 접속 = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!접속) { console.error('.env.local 에 DATABASE_URL 이 없다'); process.exit(1); }
const db = neon(접속, { fetchOptions: { cache: 'no-store' } });

/* 태그드 템플릿만 받는 드라이버라 문자열을 그 모양으로 싸서 넘긴다.
   ⚠ 첫 물음은 Neon 이 자다 깨느라 'fetch failed' 로 한 번 흘러갈 때가 있다
   (그래서 늘 맨 앞의 D01 만 '못 쟀다' 로 빨개졌다 — 데이터가 아니라 연결 문제였다).
   붙는 데 실패한 것만 두 번 더 기다렸다 다시 묻는다. SQL 오류는 그냥 올린다. */
async function 세기(sql) {
  if (!/^\s*select/i.test(sql)) throw new Error('SELECT 가 아니다');
  const t = [sql]; t.raw = [sql];
  for (let 남은 = 2; ; 남은--) {
    try { return Number((await db(t))[0].n); }
    catch (e) {
      if (남은 === 0 || !/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 700));
    }
  }
}

/* [이름, 세는 SQL, 허용치] — 허용치는 '05_정리.sql 을 돌린 뒤 이 값이어야 한다' */
const 검사 = [
  ['D01 우승자가 없는 후보를 가리킨다', `
     select count(*)::int n from meetings m
      where (m.winner_region_id is not null and not exists (select 1 from candidates c where c.id=m.winner_region_id))
         or (m.winner_place_id  is not null and not exists (select 1 from candidates c where c.id=m.winner_place_id))`, 0],

  /* 열쇠가 '후보 id' 에서 '지역 후보의 ref_id' 로 바뀌었다(lib/db.ts confirm·reopen).
     그러니 '그 id 가 있는가' 가 아니라 '새 confirm 이 꺼낼 수 있는가' 로 세야 한다 —
     옛 뜻으로 적힌 줄은 id 가 멀쩡히 살아 있어도 영영 안 꺼내진다. */
  ['D02 닿을 수 없는 park 후보', `
     select count(*)::int n from candidates c
      where c.parked_under is not null
        and not exists (select 1 from candidates x
                         where x.code=c.code and x.kind='region' and x.ref_id=c.parked_under)`, 0],

  ['D02a 옛 열쇠(후보 id)로 적힌 park', `
     select count(*)::int n from candidates c
      where c.parked_under is not null
        and exists (select 1 from candidates x where x.id=c.parked_under)`, 0],

  ['D04 방장 없는 모임', `select count(*)::int n from meetings where host_id is null`, 0],

  ['D05 방장이 강퇴 상태', `
     select count(*)::int n from meetings m join participants p on p.id=m.host_id
      where p.state <> 'active'`, 0],

  ['D06 정한 것 없이 마무리', `
     select count(*)::int n from meetings
      where closed_at is not null and coalesce(winner_place_id, winner_region_id) is null`, 0],

  ['D09 신청 시각 없는 승인 대기 (영원히 안 만료)', `
     select count(*)::int n from participants where state='pending' and requested_at is null`, 0],

  ['D10 ref_id 없는 후보 (같은 곳이 무한 증식)', `
     select count(*)::int n from candidates where ref_id is null`, 0],

  ['D13 사람이 한 명도 없는 모임', `
     select count(*)::int n from meetings m
      where not exists (select 1 from participants p where p.code=m.code)`, 0],

  ['D14 이름이 빈 모임', `select count(*)::int n from meetings where trim(name)=''`, 0],

  /* 논의55 — 받아 주는 자리는 한국(위도 33–38.7 · 경도 124.5–132).
     route.ts 는 아직 |lat|<90 만 보므로 도쿄가 통과한다. 이 셋이 그 구멍의 눈금이다. */
  ['D15a 한국 밖 출발지', `
     select count(*)::int n from participants
      where lat is not null and lng is not null
        and not (lat between 33 and 38.7 and lng between 124.5 and 132)`, 0],
  ['D15b 한국 밖 후보', `
     select count(*)::int n from candidates
      where not (lat between 33 and 38.7 and lng between 124.5 and 132)`, 0],
  ['D15c 한국 밖 동이름 캐시', `
     select count(*)::int n from geo_cache
      where not (gy/10000.0 between 33 and 38.7 and gx/10000.0 between 124.5 and 132)`, 0],


  /* 아래는 FK 가 이미 막고 있는 것들 — 0 이 아니면 제약이 떨어져 나갔다는 뜻이다 */
  ['참가자가 없는 모임을 가리킨다', `
     select count(*)::int n from participants p
      where not exists (select 1 from meetings m where m.code=p.code)`, 0],
  ['후보가 없는 모임을 가리킨다', `
     select count(*)::int n from candidates c
      where not exists (select 1 from meetings m where m.code=c.code)`, 0],
  ['표의 code·kind 가 후보와 다르다', `
     select count(*)::int n from votes v join candidates c on c.id=v.candidate_id
      where v.code <> c.code or v.kind <> c.kind`, 0],
  ['표를 준 사람이 그 모임 사람이 아니다', `
     select count(*)::int n from votes v join participants p on p.id=v.participant_id
      where v.code <> p.code`, 0],
  ['우승자가 남의 모임 후보이거나 종류가 다르다', `
     select count(*)::int n from meetings m
      left join candidates cr on cr.id=m.winner_region_id
      left join candidates cp on cp.id=m.winner_place_id
      where (cr.id is not null and (cr.code<>m.code or cr.kind<>'region'))
         or (cp.id is not null and (cp.code<>m.code or cp.kind<>'place'))`, 0],
  ['단계와 확정이 앞뒤가 안 맞는다', `
     select count(*)::int n from meetings
      where not (
        (stage='region' and winner_region_id is null and winner_place_id is null) or
        (stage='place'  and winner_region_id is not null and winner_place_id is null) or
        (stage='result'))`, 0],
  ["'지역까지' 모임에 지점 우승자가 있다", `
     select count(*)::int n from meetings where scope='region' and winner_place_id is not null`, 0],
];

/* 세기만 하고 판정은 사람이 하는 것 — 규칙이 아직 안 정해졌다 (그릴링 G02·G36·G39) */
const 참고 = [
  ['D03 주인 없는 users 행', `
     select count(*)::int n from users u
      where not exists (select 1 from participants p where p.user_id=u.id)`],
  ['D07 마무리인데 stage 가 result 가 아님', `
     select count(*)::int n from meetings where closed_at is not null and stage<>'result'`],
  ['D08 강퇴된 사람의 표', `
     select count(*)::int n from votes v join participants p on p.id=v.participant_id
      where p.state <> 'active'`],
  ['D11 주인을 뗀 후보', `select count(*)::int n from candidates where created_by is null`],
  ['D12 숨은 후보에 달린 표', `
     select count(*)::int n from votes v join candidates c on c.id=v.candidate_id
      where c.parked_under is not null`],
  /* by_ai 를 켜는 코드가 아직 없다. 1 이상이 되면 논의47·53 을 넣을 수 있다는 뜻이다 */
  ['D16 AI 가 올린 후보', `select count(*)::int n from candidates where by_ai`],
  ['D17 0표 후보 (AI 아님)', `
     select count(*)::int n from candidates where by_ai = false
       and not exists (select 1 from votes v where v.candidate_id = candidates.id)`],
  /* 표를 준 사람이 다 나가면 확정된 곳이 0표가 된다 — 그 자체는 결함이 아니다.
     논의50(0표면 사라진다)을 넣을 때 '확정된 곳은 뺀다' 예외가 왜 필요한지가 이 숫자다.
     예외를 빼고 넣으면 이만큼이 그대로 D01(우승자가 허공) 이 된다. */
  ['D17b 표가 0인데 확정된 곳 (논의50 예외가 덮어야 하는 수)', `
     select count(*)::int n from candidates c join meetings m on m.code=c.code
      where not exists (select 1 from votes v where v.candidate_id=c.id)
        and (m.winner_region_id=c.id or m.winner_place_id=c.id)`],
];

/* ── 낡은 줄과 새 줄을 가른다 ────────────────────────────────
   이 시험은 오래 **늘 빨간불**이었다: 8-12 감사 때 일부러 깨뜨려 만든 표본
   (`V-race*` · `A_우승자허공` · `E_지역실종` · `H-1`~`H-5` 따위)이 운영 DB 에 그대로 남아서다.
   `05_정리.sql` 을 돌리면 없어지지만 **아직 안 돌렸다** — 그 판단은 사람 몫이다.

   그런데 늘 빨간 시험은 아무것도 못 잡는다. 새 결함이 하나 더 생겨도 색이 그대로다.
   그래서 **언제 생겼는지**로 가른다:
     · 아래 날짜보다 **먼저** 생긴 것 → 알려진 낡은 줄. 숫자만 적고 넘어간다
     · 그 뒤에 생긴 것 → **지금 코드가 만든 것.** 빨간불이다

   ⚠ 이 날짜를 뒤로 미루지 마라. 미루는 순간 새로 만든 결함이 낡은 것으로 둔갑한다.
      낡은 줄을 없애려면 `05_정리.sql` 을 돌려라 — 그러면 이 가름 자체가 필요 없어진다. */
const 낡은기준 = '2026-08-13';
/* 세는 문장에 '언제 것만' 을 끼워 넣는다. 문장마다 다는 표가 달라(meetings·participants·candidates)
   그 표의 시간 칸을 여기서 정해 준다 — 못 정하면 가르지 않고 통째로 본다(안전한 쪽). */
const 시간칸 = [
  [/from meetings\b(?![^]*\bjoin participants\b)/i, 'meetings', 'created_at'],
  [/from participants\b/i, 'participants', 'joined_at'],
  [/from candidates\b/i, 'candidates', 'created_at'],
  [/from users\b/i, 'users', 'created_at'],
];
/* `from meetings m` 의 `m` 은 별칭이지만 `from meetings where …` 의 `where` 는 아니다.
   낱말만 보고 가리면 `where.created_at` 같은 문장을 지어내 문법 오류가 난다(실제로 그랬다). */
const 별칭아님 = /^(where|join|left|right|inner|outer|group|order|having|limit|on|as|union)$/i;
function 새것만(sql) {
  for (const [재개, 표, 칸] of 시간칸) {
    if (!재개.test(sql)) continue;
    const m = sql.match(new RegExp(`from\\s+${표}\\s+(\\w+)`, 'i'));
    const 앞 = m && !별칭아님.test(m[1]) ? m[1] + '.' : '';
    return /\bwhere\b/i.test(sql)
      ? sql.replace(/\bwhere\b/i, `where ${앞}${칸} >= '${낡은기준}' and `)
      : `${sql} where ${앞}${칸} >= '${낡은기준}'`;
  }
  return null;
}

let 통과 = 0, 실패 = 0, 낡은합 = 0;
for (const [이름, sql, 허용] of 검사) {
  let n;
  try { n = await 세기(sql); }
  catch (e) { console.log(`✗ ${이름} — 못 쟀다: ${e.message}`); 실패++; continue; }
  if (n === 허용) { console.log(`✓ ${이름}`); 통과++; continue; }

  /* 어긋난 것이 있다 — 낡은 것인가 새 것인가 */
  const 새문장 = 새것만(sql);
  if (!새문장) { console.log(`✗ ${이름} — ${n}건 (허용 ${허용}) · 언제 것인지 못 갈랐다`); 실패++; continue; }
  let 새n;
  try { 새n = await 세기(새문장); }
  catch (e) { console.log(`✗ ${이름} — ${n}건, 새 것을 못 쟀다: ${e.message}`); 실패++; continue; }

  if (새n === 허용) {
    낡은합 += n - 허용;
    console.log(`✓ ${이름} — 새로 생긴 것 없음 (낡은 줄 ${n - 허용}건은 05_정리.sql 이 치울 것)`);
    통과++;
  } else {
    console.log(`✗ ${이름} — **${낡은기준} 뒤에 ${새n}건이 새로 생겼다** (전체 ${n}건)`);
    실패++;
  }
}
if (낡은합) console.log(`\n  ⚠ 아직 안 치운 낡은 줄이 모두 ${낡은합}건이다 — 점검/05_정리.sql`);

console.log('\n— 규칙이 정해지기 전이라 세기만 하는 것 —');
for (const [이름, sql] of 참고) {
  try { console.log(`  · ${이름}: ${await 세기(sql)}건`); }
  catch (e) { console.log(`  · ${이름}: 못 쟀다 — ${e.message}`); }
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
if (실패) process.exit(1);
