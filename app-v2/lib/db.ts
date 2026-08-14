/* Neon 접근. 쿼리는 전부 여기 — 화면·라우트는 SQL 을 모른다.
   함수는 '한 가지 일'만 한다. 새 기능이 SQL 을 필요로 하면 여기 한 줄 는다. */
import { neon } from '@neondatabase/serverless';
import type { Meeting, Participant, Candidate, MeetingView, Kind, Stage, Transport, Going } from './types';
import { kstToInstant } from './time';
import { 지금종류 } from './단계';

/* Next 가 fetch 를 가로채 응답을 캐시한다 — Neon 드라이버도 fetch 를 쓰므로
   SELECT 결과가 1년 동안 굳어 버렸다(geo_cache 가 외부 호출을 못 막던 원인).
   DB 왕복은 절대 캐시하지 않는다. */
const sql = neon(process.env.DATABASE_URL!, {
  fetchOptions: { cache: 'no-store' },
});

/* DB 만 아는 거절을 라우트가 그대로 화면 오류 코드로 쓸 수 있게 바꿔 던진다.
   경합으로 뚫리는 검사(같은 이름 동시 참여)는 여기서만 잡힌다 — 라우트의 사전 조회는 늘 한 발 늦다. */
export class DbError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/* 6자리 코드 — 헷갈리는 글자(0/O/1/I)는 뺀다 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const newCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ── 뒤늦게 붙인 칸 ────────────────────────────────────────────
   운영 DB 는 8-11 에 부은 스키마 그대로다. `schema_v2.sql` 을 다시 돌려서 맞출 수는 없다 —
   그 파일 맨 위 drop 이 표를 통째로 비운다. 그래서 코드가 한 번 붙인다.
   같은 모양이 `schema_v2.sql` 에도 적혀 있어야 한다: 새로 부은 DB 와 지금 DB 가 달라지면
   여기가 '있는 칸을 또 만드는' 헛일이 되고, 언젠가 한쪽에만 있는 칸이 생긴다.

   프로세스마다 한 번뿐이다 — 약속을 붙잡아 두고 다시 쓴다. 넘어지면 다음 부름에서 다시 해 본다.
   읽기(getView)도 이 칸들을 고르므로 읽기 앞에서도 기다린다: 두 번째부터는 이미 끝난
   약속이라 한 틱도 안 든다. */
let 칸약속: Promise<void> | null = null;
function 칸준비() {
  return (칸약속 ??= (async () => {
    /* AI 를 이 단계에서 몇 번 썼나 (논의93) — 메모리에 세던 것을 모임 줄로 옮겼다 */
    await sql`alter table meetings add column if not exists ai_used_region integer not null default 0`;
    await sql`alter table meetings add column if not exists ai_used_place  integer not null default 0`;
    /* 신호등 (논의115·116) — null 은 '아직 안 눌렀다' */
    await sql`alter table participants add column if not exists going text`;
    /* 값이 셋뿐인 것은 DB 가 지킨다 — 라우트만 믿으면 새 길이 생길 때마다 검사를 또 적는다.
       constraint 는 add if not exists 가 없다. 있으면 건너뛰게 물어보고 붙인다 —
       드롭하고 다시 붙이면 켤 때마다 표를 통째로 다시 훑는다. */
    await sql`
      do $$
      begin
        if not exists (select 1 from pg_constraint where conname = 'participants_going_chk') then
          alter table participants add constraint participants_going_chk
            check (going is null or going in ('go','late','no'));
        end if;
      end $$
    `;
  })().catch((e) => { 칸약속 = null; throw e; }));
}

/* ── 읽기 ────────────────────────────────────────────────── */

/* Neon 은 timestamptz 를 Date 로 준다. 타입은 string 이라 그냥 두면
   화면에서 meet_at.slice(...) 가 터진다(실제로 설정 화면이 안 열렸다).
   경계는 한 곳뿐이어야 한다 — 여기서 문자열로 맞춰 내보낸다.
   칸 이름을 하나씩 적으면 새 칸이 늘 때마다 빠뜨린다(candidates.created_at 이 실제로 빠져 있었다) —
   줄 전체를 훑는다. */
const isoRow = <T>(r: any): T =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])) as T;

export async function getMeeting(code: string): Promise<Meeting | null> {
  const r = (await sql`select * from meetings where code = ${code}`) as any[];
  return r[0] ? isoRow<Meeting>(r[0]) : null;
}

/** 화면 하나가 필요한 전부를 한 번에. 왕복을 줄인다. */
export async function getView(code: string, participantId: string | null): Promise<MeetingView | null> {
  /* 치울 것을 여기에 얹는다 (논의102 · 논의104) — 아래 '가끔청소' 주석 참고.
     읽기보다 먼저 도는 이유: 이 모임이 치우기 대상이면 아래 getMeeting 이 곧바로 null 을 줘
     화면이 "이 모임은 없어졌어요" 로 받는다 (논의112). 뒤에 두면 방금 지운 모임을 그려 준다. */
  await 가끔청소();
  /* 아래 select 가 뒤늦게 붙인 칸(going)을 고른다 — 없는 DB 에서도 첫 조회에 붙는다 */
  await 칸준비();

  const meeting = await getMeeting(code);
  if (!meeting) return null;

  /* 필요한 칸만 고른다. `select *` 로 가져오면 pin_hash 가 그대로 화면까지 나간다
     (전수 조사에서 실제로 확인됐다). 새 칸이 늘 때 여기 한 줄만 는다. */
  const participants = ((await sql`
    select id, code, user_id, name, origin_name, lat, lng, transport,
           state, requested_at, joined_at, going
      from participants where code = ${code} order by joined_at
  `) as any[]).map((p) => isoRow<Participant>(p));

  /* 후보와 표를 한 번에 — 화면이 표를 다시 세지 않게 미리 붙인다 */
  const candidates = ((await sql`
    select c.*,
           coalesce(count(v.participant_id), 0)::int as votes,
           coalesce(array_agg(v.participant_id) filter (where v.participant_id is not null), '{}') as voters
    from candidates c
    left join votes v on v.candidate_id = c.id
    where c.code = ${code}
    group by c.id
    order by votes desc, c.created_at
  `) as any[]).map((c) => isoRow<Candidate>(c));

  const me = participants.find((p) => p.id === participantId) ?? null;
  /* 지금 단계에서 내가 준 표만 센다. 지역 표와 지점 표를 함께 세면
     지점 단계에서 '1인 1표'가 깨진 것처럼 보인다. */
  /* 끝난 모임은 '실제로 정해진 것'이 종류를 말한다 — 화면(ui.tsx)과 같은 규칙이어야
     내 선정이 사라져 보이지 않는다. 진행 중이면 단계가 말한다. */
  const over = !!meeting.closed_at || meeting.stage === 'result';
  /* 잣대는 `lib/단계.ts` 하나다 — 여기서 따로 셈하던 것을 옮겼다(네 곳이 갈라지면 수가 안 맞는다) */
  const nowKind: Kind = 지금종류(meeting);
  /* 코드만 아는 사람에게 남의 id·좌표까지 줄 이유가 없다.
     id 는 쿠키에 서명이 붙어 주워도 못 쓰지만, 안 주는 편이 낫다.
     멤버에게는 그대로 준다 — 화면이 표 대조·강퇴·방장 넘기기에 쓴다. */
  const 멤버 = !!me && me.state === 'active';
  /* 내보내진 사람에게는 진행 상황을 안 준다 (논의96). 화면은 이미 "진행 상황은 볼 수 없어요"
     라고 말하고 있었는데 서버는 후보도 정해진 곳도 그대로 내줬다 — 말과 실제를 맞춘다.
     내 상태(kicked)는 그대로 준다. 그래야 화면이 '내보내졌어요 · 다시 신청' 을 그린다. */
  const 쫓겨남 = !!me && me.state === 'kicked';
  /* 누가 방장인지, 누가 골랐는지는 **서버가 셈해서 붙인다.** 화면이 id 를 견주게 두면
     코드만 아는 사람에게 id 를 비워 보내는 순간(논의95) 전원이 방장이 되고
     아무도 안 고른 것이 된다 — 실제로 그렇게 보였다. */
  const 고른사람 = new Set(
    candidates.filter((c) => c.kind === nowKind).flatMap((c) => c.voters),
  );
  const 붙임 = participants.map((p) => ({
    ...p, 방장인가: p.id === meeting.host_id, 골랐나: 고른사람.has(p.id),
  }));
  /* 내 것은 늘 그대로 준다 — 강퇴·대기 화면이 '나는 지금 무엇인가'를 알아야 한다 */
  const 참가자 = 멤버 ? 붙임 : 붙임.map((p) => (
    p.id === me?.id ? p : { ...p, id: '', lat: null, lng: null }
  )) as Participant[];

  return {
    meeting: 쫓겨남
      ? { ...meeting, host_id: '', winner_region_id: null, winner_place_id: null }
      : 멤버 ? meeting : { ...meeting, host_id: '' },
    participants: 참가자,
    candidates: 쫓겨남 ? []
      : 멤버 ? candidates : candidates.map((c) => ({ ...c, voters: [] })),
    me: {
      participantId: me?.id ?? null,
      isHost: !!me && me.id === meeting.host_id,
      myVotes: me && !쫓겨남
        ? candidates.filter((c) => c.kind === nowKind && c.voters.includes(me.id)).map((c) => c.id)
        : [],
    },
  };
}

/* ── 내 모임 목록 (논의77) ─────────────────────────────────────
   '내가 들어간 모임' 은 쿠키가 안다 — 브라우저가 `moimer.p.<코드>` 를 전부 실어 보낸다.
   서명을 확인해 살아남은 (코드, 참가자) 짝만 여기로 온다. 서명 확인은 부르는 쪽(라우트)의 일이다:
   여기에 두면 DB 파일이 소금을 알아야 한다.

   ⚠ 타입은 원래 `lib/types.ts` 한 곳에 있어야 한다 — 지금은 그 파일이 다른 갈래의 것이라
   여기 둔다. 옮길 때 이 주석도 함께 지워라. */
export type MyMeeting = {
  code: string; name: string; stage: Stage; closed: boolean; scope: 'region' | 'place';
  meetAt: string | null;
  createdAt: string;                    /* 약속 시간이 없을 때 '언제쯤 일이었나' 를 대신 말한다 (논의109) */
  people: number;                       /* 활동 중인 사람 수 */
  chosen: number;                       /* 지금 단계에서 고른 사람 수 */
  iAmHost: boolean; iChose: boolean;
  winner: string | null;                /* 정해진 곳 이름 */
  updatedAt: string;
};

/** 내가 들어간 모임을 최근 것부터 (논의77).
    **한 번의 질의로 뽑는다** — 모임마다 왕복하면 스무 곳에 들어간 사람에게 스무 번이 된다.
    짝은 JSON 으로 통째로 넘긴다: 코드 수만큼 자리표(placeholder)를 만들면 질의문이 사람마다 달라져
    Postgres 가 계획을 다시 세운다.

    조용히 빠지는 것들 — 없는 모임 · 남의 모임 참가자를 가리키는 쿠키 · 지워진 참가자 ·
    **활동 중이 아닌 나(내보내진 · 승인 대기)**. 마지막 것은 규약에 그 상태를 담을 칸이 없어서다:
    목록에 얹으면 '들어가 있는 모임'과 똑같이 보이고, 내보내진 사람에게는 안 주기로 한
    진행 상황(정해진 곳·고른 사람 수)까지 이 길로 새어 나간다 (논의96).

    `updatedAt` 은 모임 줄의 updated_at 이 아니라 **마지막 움직임**이다. 그 칸은 모임 줄을 고칠 때만
    갱신돼(트리거) 사람이 들어오고 후보를 찍는 동안에는 멈춰 있다 — 그것으로 줄을 세우면
    한창인 모임이 맨 아래로 내려간다. 보는 갈래는 sweepIdleMeetings 와 같은 넷이다. */
export async function myMeetings(
  짝: { code: string; participantId: string }[],
  userId?: string | null,
): Promise<MyMeeting[]> {
  /* 쿠키도 없고 계정도 없으면 물어볼 것이 없다. 둘 중 하나만 있어도 물어봐야 한다 —
     폰을 바꾼 방장에게는 쿠키가 하나도 없고 계정만 있다. */
  if (!짝.length && !userId) return [];
  const 쿠키 = JSON.stringify(짝.map((p) => [p.code, p.participantId]));
  const r = (await sql`
    with 쿠키 as (
      select x->>0 as code, x->>1 as pid from json_array_elements(${쿠키}::json) x
    ),
    /* 내 자리를 찾는 길이 **둘**이다 (논의124).
       ① 쿠키 — 로그인 없이 참여한 사람의 유일한 신원. 이 브라우저가 실제로 쓰고 있는 자리다.
       ② 계정 — 폰을 바꾸거나 브라우저를 지운 사람의 길. 쿠키가 하나도 없어도 자기 모임이 보인다.
          이것이 없으면 '방장은 로그인한다'고 해 놓고도 새 폰에서는 자기 모임이 안 보였다.

       한 모임에 두 길이 겹치면 **쿠키 쪽을 쓴다**(순=0 이 앞). 쿠키가 가리키는 자리가
       지금 이 브라우저가 행세하고 있는 자리라, 다른 자리 기준으로 '내가 골랐나'를 말하면 거짓이 된다.
       ⚠ distinct on 은 order by 의 첫 칸이 distinct 칸과 같아야 한다 — code, 순 차례를 지켜라. */
    내자리 as (
      select distinct on (code) code, id from (
        /* p.code = k.code 까지 봐야 한다 — 안 보면 남의 모임에서 받은 참가자 id 로
           아무 모임이나 '내 모임' 이 된다 */
        select p.id, p.code, 0 as 순
          from 쿠키 k
          join participants p on p.id = k.pid and p.code = k.code and p.state = 'active'
        union all
        /* userId 가 null 이면 비교가 통째로 NULL 이라 한 줄도 안 나온다 — 따로 막을 것이 없다 */
        select p.id, p.code, 1 as 순
          from participants p
         where p.user_id = ${userId ?? null} and p.state = 'active'
      ) t order by code, 순
    ),
    내모임 as (
      select m.code, m.name, m.stage, m.scope, m.meet_at, m.closed_at, m.updated_at, m.host_id, m.created_at,
             coalesce(m.winner_place_id, m.winner_region_id) as 정해진곳,
             p.id as 내id,
             /* 지금 무엇을 고르는 중인가 — getView 와 같은 규칙이어야 화면 둘이 다른 수를 말하지 않는다.
                끝난 모임은 '실제로 정해진 것'이 종류를 말하고, 진행 중이면 단계가 말한다. */
             case when m.closed_at is not null or m.stage = 'result'
                    then case when m.winner_place_id is not null then 'place' else 'region' end
                  when m.stage = 'region' then 'region' else 'place' end as 지금종류
        from 내자리 p
        join meetings m on m.code = p.code
    )
    select 내모임.code, 내모임.name, 내모임.stage, 내모임.scope,
           (내모임.closed_at is not null)                              as closed,
           내모임.meet_at                                              as "meetAt",
           /* 약속 시간 없이 만든 모임이 끝나면 '언제쯤 일이었나' 를 말할 것이 없어진다 —
              그때는 이것으로 대신 짚는다 (논의109 뒤처리). 화면(줄글.ts)이 그 몫을 정한다. */
           내모임.created_at                                           as "createdAt",
           /* 방장 줄이 비어 있어도(옛 '유령 모임') true/false 로만 답한다 —
              그냥 두면 host_id 가 null 인 순간 iAmHost 가 null 로 나가 화면이 셋을 갈라야 한다 */
           coalesce(내모임.host_id = 내모임.내id, false)                as "iAmHost",
           (select count(*)::int from participants p
             where p.code = 내모임.code and p.state = 'active')        as people,
           /* 표의 kind 가 아니라 후보의 kind 로 센다 — 세는 잣대가 둘이면 언젠가 갈라진다 */
           (select count(distinct v.participant_id)::int
              from votes v join candidates c on c.id = v.candidate_id
             where v.code = 내모임.code and c.kind = 내모임.지금종류)   as chosen,
           exists (select 1 from votes v join candidates c on c.id = v.candidate_id
                    where v.code = 내모임.code and v.participant_id = 내모임.내id
                      and c.kind = 내모임.지금종류)                     as "iChose",
           (select c.name from candidates c where c.id = 내모임.정해진곳) as winner,
           greatest(내모임.updated_at,
                    (select max(p.joined_at)  from participants p where p.code = 내모임.code),
                    (select max(c.created_at) from candidates   c where c.code = 내모임.code),
                    (select max(v.voted_at)   from votes        v where v.code = 내모임.code))
                                                                       as "updatedAt"
      from 내모임
     /* 정렬은 서버가 한다 (논의77) — 화면마다 다시 세우면 곧 갈라진다.
        같은 시각이면 코드로 — 새로고침할 때마다 줄이 뒤바뀌면 안 된다. */
     order by "updatedAt" desc, 내모임.code
  `) as any[];
  /* Date 를 문자열로 맞추는 경계는 한 곳뿐이다 — 위 isoRow 주석 참고 */
  return r.map((m) => isoRow<MyMeeting>(m));
}

/* ── 쓰기 ────────────────────────────────────────────────── */

/* 사용자 기록은 로그인한 사람만 남긴다 (논의88) — 모임을 만들 때마다 한 줄씩 쌓여 727줄이 됐다.
   이제 방장은 반드시 로그인하므로(논의123) 열쇠 없이 부르는 길을 아예 없앴다:
   열쇠가 있어야만 줄이 생기고, 같은 열쇠는 늘 같은 줄로 돌아온다 —
   모임을 백 개 만들어도 users 는 한 줄이다.

   칸 이름이 `kakao_id` 인 것은 운영 DB 에 이미 부은 표라 못 바꿔서다. 대신 열쇠 자체가
   무엇으로 들어왔는지를 말한다(카카오는 숫자, 개발용 guest 는 `guest:이름`) — lib/auth.ts 참고. */
/** 이 id 가 지금 `users` 표에 실제로 있나 (2026-08-14 사고 뒤처리).
    세션(JWT)은 DB 를 안 보고 서명만으로 스스로를 증명한다 — 그래서 **DB 가 세션보다 먼저
    비어 버리면** 서명은 멀쩡한데 가리키는 줄이 없는 토큰이 생긴다. 그 토큰으로 모임을 만들면
    `upsertUser` 가 (열쇠로 찾다 없으니) **새 id 로 새 줄**을 만드는데, 세션은 그 새 id 를 모른다 —
    그 사람은 방금 만든 자기 모임의 방장으로도 안 잡힌다(실측: `isHost` 가 false 로 나왔다).
    운영 DB 복구·고아 계정 정리처럼 users 표를 다시 만드는 어떤 일이 생겨도 같은 증상이 난다.
    `지금로그인()` 이 이걸로 걸러 낸다 — 걸러진 사람은 '로그인 안 한 것'과 같이 친다. */
export async function userExists(id: string): Promise<boolean> {
  const r = (await sql`select 1 from users where id = ${id} limit 1`) as unknown[];
  return r.length > 0;
}

export async function upsertUser(o: { accountKey: string; nickname: string }) {
  const id = newId();
  /* last_seen_at 을 **넣을 때도** 찍는다. 표에 기본값이 없어(schema_v2.sql) 처음 만든 줄은
     null 로 남았고, 두 번째 로그인부터야 값이 생겼다 — 오늘 처음 들어온 사람이
     '한 번도 안 온 사람' 으로 보였다. 넣는 순간이 곧 마지막으로 본 순간이다.
     ⚠ 이 주석은 SQL 밖에 둔다 — 안에 백틱을 쓰면 그 자리에서 템플릿 문자열이 닫힌다. */
  const r = (await sql`
    insert into users (id, kakao_id, nickname, last_seen_at)
    values (${id}, ${o.accountKey}, ${o.nickname}, now())
    on conflict (kakao_id) do update set nickname = excluded.nickname, last_seen_at = now()
    returning id
  `) as { id: string }[];
  return r[0].id;
}

/** 이 모임의 방장은 누구이고 **어느 계정인가** (논의124).
    `getView` 로는 알 수 없다 — 멤버가 아닌 사람에게는 id 를 비워 보내기 때문이다(논의95).
    쿠키를 잃은 방장이 바로 그 '멤버가 아닌 사람'이라, 계정으로 되찾으려면 이 길이 따로 있어야 한다.

    ⚠ `user_id` 가 있다고 계정이 있는 것이 아니다. 로그인이 붙기 전에는 모임을 만들 때마다
    **열쇠 없는 users 줄**을 하나씩 만들어 붙였다(논의88 이 잡은 그 구멍이다) — 운영 DB 의
    옛 모임 385건이 전부 그 모양이다. 그것을 계정으로 치면 아무의 세션과도 안 맞아
    **옛 모임이 통째로 주인을 잃는다.** 열쇠(kakao_id)가 있는 줄만 계정으로 센다.
    계정이 없으면 null 을 주고, 부르는 쪽이 쿠키로 판정한다. */
export async function hostAccount(code: string): Promise<{ id: string; userId: string | null } | null> {
  const r = (await sql`
    select p.id, case when u.kakao_id is not null then p.user_id end as user_id
      from meetings m
      join participants p on p.id = m.host_id
      left join users u   on u.id = p.user_id
     where m.code = ${code}
  `) as { id: string; user_id: string | null }[];
  return r[0] ? { id: r[0].id, userId: r[0].user_id ?? null } : null;
}

export async function createMeeting(o: {
  name: string; scope: 'region' | 'place'; purpose: string | null;
  /* 방장은 반드시 로그인한다 (논의123) — users 줄 없이는 모임이 안 만들어진다.
     이 값이 곧 '이 모임은 누구 것인가'다 (논의124). */
  meetAt: string | null; hostUserId: string; hostName: string;
  origin?: string; lat?: number; lng?: number; transport?: Transport;
}) {
  let code = newCode();
  for (let i = 0; i < 5 && (await getMeeting(code)); i++) code = newCode();

  /* 방장도 '그 모임의 참가자'다 — 따로 취급하면 화면마다 분기가 는다.
     참가자가 생기기 전에는 host_id 를 채울 수 없다(meetings_host_fk). 순서를 지킨다:
       모임(host_id 비움) → 참가자 → host_id 채움
     셋을 따로 날리면 가운데서 끊길 때 방장 없는 모임이 남는다 — 아무도 못 지우고 조회에는 뜬다
     (실서비스에서 관찰됐다). 드라이버가 한 번의 왕복으로 begin~commit 을 묶어 준다. */
  const pid = newId();
  await sql.transaction([
    sql`
      insert into meetings (code, name, scope, purpose, meet_at)
      values (${code}, ${o.name}, ${o.scope}, ${o.purpose}, ${kstToInstant(o.meetAt)})
    `,
    sql`
      insert into participants (id, code, user_id, name, origin_name, lat, lng, transport)
      values (${pid}, ${code}, ${o.hostUserId}, ${o.hostName},
              ${o.origin ?? null}, ${o.lat ?? null}, ${o.lng ?? null}, ${o.transport ?? 'transit'})
    `,
    sql`update meetings set host_id = ${pid} where code = ${code}`,
  ]);
  return { code, participantId: pid };
}

export async function join(code: string, o: {
  name: string; pinHash: string | null; userId: string | null;
  origin?: string; lat?: number; lng?: number; transport?: Transport;
}) {
  const id = newId();
  /* 한 모임에 같은 이름은 하나뿐이다(participants_code_name_key). 라우트가 미리 조회해 막지만
     둘이 같은 순간에 들어오면 그 조회를 나란히 통과한다 — 그때 나던 500(빈 본문)을 여기서 잡는다.
     do nothing 이라 돌아온 줄이 없으면 '이미 있는 이름'이다. */
  const r = (await sql`
    insert into participants (id, code, user_id, name, pin_hash, origin_name, lat, lng, transport)
    values (${id}, ${code}, ${o.userId}, ${o.name}, ${o.pinHash},
            ${o.origin ?? null}, ${o.lat ?? null}, ${o.lng ?? null}, ${o.transport ?? 'transit'})
    on conflict (code, name) do nothing
    returning id
  `) as { id: string }[];
  if (!r[0]) throw new DbError('name_taken');
  return id;
}

/** 이 모임에 이 이름이 이미 있나 — 있으면 상태까지.
    이름 하나로 셋이 갈린다 (논의121): 강퇴됐으면 승인 대기로, 승인 대기면 그대로,
    멀쩡한 멤버면 PIN 으로 그 자리를 돌려준다. 강퇴자만 보던 때의 이름(findKicked)은
    이제 하는 일과 어긋난다 — 쓰는 쪽이 '강퇴자만 찾는 함수'로 읽고 지나쳤다. */
export async function findByName(code: string, name: string) {
  const r = (await sql`
    select id, state, name, user_id from participants where code = ${code} and name = ${name} limit 1
  `) as { id: string; state: string; name: string; user_id: string | null }[];
  return r[0] ?? null;
}

/** 이 모임에서 **이 계정의 자리**를 찾는다 (논의130).
    신원의 열쇠가 셋(쿠키 · 계정 · 이름+PIN)이 되면서 생긴 길이다 —
    로그인한 사람은 이름도 PIN 도 아니고 **계정**으로 자기 자리를 되찾는다.
    쿠키를 잃어도, 이름을 잊어도, PIN 을 잊어도 다시 로그인만 하면 된다.

    ⚠ `userId` 가 비면 **아무도 안 나와야 한다.** `user_id = null` 은 SQL 에서 늘 거짓이라
    저절로 그렇게 되지만, 그 사실에 기대지 않고 부르는 쪽에서 먼저 거른다(route.ts). */
export async function findByUser(code: string, userId: string) {
  const r = (await sql`
    select id, state, name, user_id from participants
     where code = ${code} and user_id = ${userId} limit 1
  `) as { id: string; state: string; name: string; user_id: string | null }[];
  return r[0] ?? null;
}

/** PIN 으로 만들어 둔 자리를 **계정에 잇는다** (논의130).
    로그인하기 전에 이름+PIN 으로 참여했던 사람이 나중에 로그인해서 돌아오는 길이다.
    한 번 이어 두면 그다음부터는 PIN 이 필요 없다.

    ⚠ 이미 남의 계정에 이어진 자리는 안 뺏는다 — `user_id is null` 인 것만 채운다.
    안 그러면 PIN 을 아는 사람이 남의 계정 자리를 자기 것으로 옮길 수 있다. */
export async function linkUser(participantId: string, userId: string) {
  const r = (await sql`
    update participants set user_id = ${userId}
     where id = ${participantId} and user_id is null
    returning id
  `) as unknown[];
  return r.length > 0;
}

/** 이 사람이 그 PIN 의 주인인가 — 신원을 돌려주기 전 본인 확인 (그릴링 점검 B02 · 논의121).
    PIN 이 없는 줄(방장처럼 로그인으로 들어온 사람)은 어떤 PIN 으로도 안 맞는다 —
    비어 있는 것끼리 맞아 남의 자리를 차지하는 길이 생기면 안 된다. */
export async function pinOk(participantId: string, pinHash: string) {
  const r = (await sql`
    select 1 from participants where id = ${participantId} and pin_hash = ${pinHash} limit 1
  `) as unknown[];
  return r.length > 0;
}

/** 출발지 고치기 — 재참여할 때 새로 낸 출발지를 버리지 않게.
    안 준 값은 그대로 둔다 — 한 칸만 고치러 와서 나머지가 비는 일이 없게. */
export async function setOrigin(participantId: string, o: {
  origin?: string; lat?: number; lng?: number; transport?: Transport;
}) {
  await sql`
    update participants
       set origin_name = coalesce(${o.origin ?? null}, origin_name),
           lat         = coalesce(${o.lat ?? null}, lat),
           lng         = coalesce(${o.lng ?? null}, lng),
           transport   = coalesce(${o.transport ?? null}, transport)
     where id = ${participantId}
  `;
}

/** 신호등 — 내가 제때 가는지 (논의115·116). null 은 '아직 안 눌렀다'.
    표에도 가운데 계산에도 안 들어간다: 이 값을 세기 시작하면 '안 누른 사람'을 어떻게 셀지가
    곧 새 규칙이 된다. 논의116 이 정한 것은 알리는 것 하나뿐이다.
    누구 것을 바꿀지는 라우트가 정한다 — 여기는 받은 사람의 줄만 고친다. */
export async function setGoing(participantId: string, going: Going | null) {
  await 칸준비();
  await sql`update participants set going = ${going} where id = ${participantId}`;
}

export async function setState(participantId: string, state: 'active' | 'kicked' | 'pending') {
  await sql`
    update participants
       set state = ${state}, requested_at = ${state === 'pending' ? new Date().toISOString() : null}
     where id = ${participantId}
  `;
}

/** 핑 = 투표. 후보를 만들고(있으면 재사용) 그 자리에서 표까지 준다.
    byAi 로 올린 곳만 표 없이 올라간다 (논의47) — 부른 사람이 고른 것이 아니기 때문이다. */
export async function ping(code: string, by: string, o: {
  kind: Kind; refId: string; name: string; lat: number; lng: number; address?: string; byAi?: boolean;
}) {
  const id = newId();
  /* 넣어 뒀던 곳을 꺼내는 길은 없어졌다 (논의87) — 지역이 바뀌면 지점 후보는 남지 않는다.
     그래서 '옛 지역에서 받은 표를 물고 되살아나는 후보'도 생길 수 없다(A14). */
  const r = (await sql`
    insert into candidates (id, code, kind, ref_id, name, address, lat, lng, by_ai, created_by)
    values (${id}, ${code}, ${o.kind}, ${o.refId}, ${o.name}, ${o.address ?? null}, ${o.lat}, ${o.lng},
            ${o.byAi ?? false}, ${by})
    /* by_ai 는 여기서 건드리지 않는다 — 사람이 올린 곳을 AI 가 같은 곳을 짚었다고 해서
       'AI 가 올린 곳'으로 바꿔 버리면, 0표가 됐을 때 사라지지 않는 곳이 된다 (논의47) */
    on conflict (code, kind, ref_id) do update set
      /* 이름은 올린 사람만 고친다 — 남이 덮어쓰면 올린 사람이 모르는 이름으로 바뀐다 */
      name = case when candidates.created_by = ${by} or candidates.created_by is null
                  then excluded.name else candidates.name end,
      /* 주소는 비어 있을 때만 채운다 — 늦게 온 주소는 붙이고, 이미 있는 것은 남이 못 갈아치운다 */
      address = coalesce(candidates.address, excluded.address),
      /* 좌표는 늘 지금 찍은 자리로 — 같은 ref_id 가 다른 지역에서 되살아나면 옛 지역에 찍혔다 */
      lat = excluded.lat, lng = excluded.lng,
      /* 주인이 나가 비어 버린 후보는 다시 찍은 사람이 맡는다 — 아무도 못 지우는 후보가 남지 않게 */
      created_by = coalesce(candidates.created_by, ${by})
    returning id
  `) as { id: string }[];
  const cid = r[0].id;
  /* AI 가 올린 곳에는 표가 안 붙는다 (논의47) — 부른 것과 고른 것은 다르다.
     사람이 찍은 것은 그대로 표가 된다: 지역은 여러 곳 가능, 같은 곳은 한 번(스키마가 막는다). */
  if (!o.byAi) {
    await sql`
      insert into votes (code, candidate_id, participant_id, kind)
      values (${code}, ${cid}, ${by}, ${o.kind})
      on conflict do nothing
    `;
  }
  return cid;
}

/* 표가 0이 된 후보는 후보째 사라진다 (논의50). 둘만 남는다 (논의65 · 논의87) —
     ① 확정된 곳   : 지우면 결과가 허공을 가리킨다. winner_* 에 외래키가 없어
                     DB 가 막아 주지 않는다(실서비스에서 11건 깨졌고, 지금도 8건이 0표다).
     ② AI 가 올린 곳: 애초에 표 없이 올라온다 — 0표가 '버려진 후보'라는 뜻이 아니다.
   예외 '넣어 둔 곳'은 없어졌다 — 논의87 로 넣어 두는 장치 자체가 사라졌다.
   표가 빠지는 길은 셋(unping·kick·leave)이고 규칙은 하나여야 한다 —
   어느 길로 빠졌느냐에 따라 남은 후보가 달라지면 1위가 길마다 달라진다. */

/** 다시 누르면 취소. 마지막 표가 빠지면 후보도 함께 사라진다 (논의50).
    올린 사람만 지울 수 있던 규칙은 없어졌다 — 아무도 안 찍은 곳이 목록에 남아 있으면
    '누가 찍은 곳'과 구별이 안 된다. */
export async function unping(candidateId: string, by: string) {
  await sql`delete from votes where candidate_id = ${candidateId} and participant_id = ${by}`;
  await sql`
    delete from candidates c
     where c.id = ${candidateId}
       and not c.by_ai
       and not exists (select 1 from votes v where v.candidate_id = c.id)
       and not exists (
         select 1 from meetings m
          where m.code = c.code and (m.winner_region_id = c.id or m.winner_place_id = c.id))
  `;
}

/* 이 사람의 표를 통째로 뺀다 — 내보내기와 나가기가 같이 쓴다 (논의45).
   후보를 먼저 지운다: votes 는 후보를 따라 cascade 로 지워지므로 '이 표가 마지막인가'를
   그 자리에서 물어볼 수 있다. 표부터 지우면 누구의 표였는지가 사라져 되물을 수 없다. */
async function 표빼기(code: string, participantId: string) {
  await sql`
    delete from candidates c
     where c.code = ${code}
       and not c.by_ai
       and exists (
         select 1 from votes v where v.candidate_id = c.id and v.participant_id = ${participantId})
       and not exists (
         select 1 from votes v where v.candidate_id = c.id and v.participant_id <> ${participantId})
       and not exists (
         select 1 from meetings m
          where m.code = c.code and (m.winner_region_id = c.id or m.winner_place_id = c.id))
  `;
  await sql`delete from votes where code = ${code} and participant_id = ${participantId}`;
}

/** AI 를 다시 부르기 전에 앞엣것을 치운다 (논의53) — 아무도 안 찍은 것만.
    누가 찍었으면 그건 사람이 고른 진짜 후보라 AI 것이어도 남는다.
    지운 수를 준다 — 라우트가 '알릴 일이 있었는가'를 안다. */
export async function clearAiPicks(code: string, kind: Kind): Promise<number> {
  const r = (await sql`
    delete from candidates c
     where c.code = ${code} and c.kind = ${kind} and c.by_ai
       and not exists (select 1 from votes v where v.candidate_id = c.id)
       and not exists (
         select 1 from meetings m
          where m.code = c.code and (m.winner_region_id = c.id or m.winner_place_id = c.id))
     returning c.id
  `) as unknown[];
  return r.length;
}

/* ── AI 횟수 (논의93) ──────────────────────────────────────────
   전에는 route.ts 가 프로세스 메모리(globalThis)에 셌다. 개발 서버는 파일을 고칠 때마다,
   운영은 서버가 여러 대가 되는 순간 0부터 다시 셌다 — 한도라고 부를 수 없는 것이었다.
   모임 줄에 둔다: 모임을 지우면 셈도 함께 사라지고(remove·마지막 사람 나가기),
   되돌려도 안 돌아온다 — 되돌리기로 횟수가 되살아나면 그것도 한도가 아니다. */
export const AI한도 = 3;

/** AI 를 한 번 쓴다 — 한도 안이면 남은 횟수를, 다 썼으면 null 을 준다 (논의93).
    묻고 나서 올리면 그 사이 들어온 두 번째 요청이 같은 값을 보고 함께 지나간다 —
    세는 것과 막는 것을 한 문장에 둔다. 단계마다 칸이 따로라 지점으로 넘어가면 다시 셋이다. */
export async function useAi(code: string, kind: Kind): Promise<number | null> {
  await 칸준비();
  const r = (await sql`
    update meetings set
      ai_used_region = ai_used_region + (case when ${kind}::text = 'region' then 1 else 0 end),
      ai_used_place  = ai_used_place  + (case when ${kind}::text = 'place'  then 1 else 0 end)
     where code = ${code}
       and (case when ${kind}::text = 'region' then ai_used_region else ai_used_place end)
           < ${AI한도}::int
    returning (case when ${kind}::text = 'region' then ai_used_region else ai_used_place end) as n
  `) as { n: number }[];
  return r[0] ? AI한도 - r[0].n : null;
}

/** 못 붙었으면 한 번을 돌려준다 (논의93).
    세는 것은 먼저 해야 경합에 안 뚫린다 — 부르고 나서 세면 동시에 넷이 들어와 한도를 넘는다.
    그래서 먼저 세고, 한 푼도 안 든 것으로 드러나면 여기서 되돌린다.
    답을 받았다면(쓸 것이 없어도) 돌려주지 않는다 — 토큰은 이미 나갔다. */
export async function refundAi(code: string, kind: Kind): Promise<void> {
  await sql`
    update meetings set
      ai_used_region = greatest(ai_used_region - (case when ${kind}::text = 'region' then 1 else 0 end), 0),
      ai_used_place  = greatest(ai_used_place  - (case when ${kind}::text = 'place'  then 1 else 0 end), 0)
     where code = ${code}
  `;
}

/** 모임 이름·시간 고치기 (방장) */
export async function updateMeeting(code: string, o: { name?: string; meetAt?: string | null }) {
  if (o.name !== undefined) await sql`update meetings set name = ${o.name} where code = ${code}`;
  /* 들어오는 값은 늘 한국시간 벽시계다 — 여기서 한 번만 바꾼다 (논의28) */
  if (o.meetAt !== undefined) {
    const 새시간 = kstToInstant(o.meetAt);
    await sql`update meetings set meet_at = ${새시간} where code = ${code}`;
    /* 시간을 비우면 켜 둔 신호등도 비운다 (논의116). 신호등은 '그날 갈 수 있나' 를 묻는 것이라
       날이 없어지면 대답도 뜻을 잃는다. 안 비우면 시간을 다시 넣는 순간 옛 대답이 되살아나
       아무도 다시 안 눌렀는데 '못 간다' 가 켜져 있었다. */
    if (!새시간) await sql`update participants set going = null where code = ${code} and going is not null`;
  }
}

export async function setStage(code: string, stage: string) {
  await sql`update meetings set stage = ${stage} where code = ${code}`;
}

export async function confirm(code: string, kind: Kind, candidateId: string) {
  if (kind === 'region') {
    /* 지역을 확정하면 그 전에 모아 둔 지점 후보는 전부 버린다 (논의87).
       같은 지역을 다시 골라도 버린다 — '어느 지역에서 모은 것인가'를 따지기 시작하면
       넣어 두기 장치가 그대로 돌아온다. 규칙은 한 줄이어야 한다: 지역을 정하면 지점은 처음부터.
       확정이 실제로 먹었을 때만 버린다 — 한 문장에 묶어야 그 사이 남이 되돌렸을 때
       후보만 사라지고 단계는 그대로인 어긋난 자리가 안 생긴다.
       (논의59·113 이 '모은 지점 N곳이 사라져요' 를 미리 묻는 이유가 이것이다.)

       '지역까지' 모임은 여기서 끝, '지점까지'면 지점 후보 모으기로.
       읽은 단계에서만 바꾼다 — 전에는 confirm 과 reopen 이 겹치면 방장의 확정이 말없이 사라졌다. */
    await sql`
      with 확정 as (
        update meetings
           set winner_region_id = ${candidateId},
               stage = case when scope = 'region' then 'result' else 'place' end
         where code = ${code} and stage = 'region' and closed_at is null
        returning code
      )
      delete from candidates c
       where c.code in (select code from 확정)
         and c.kind = 'place'
         /* 정해진 곳은 어떤 길로도 안 지운다 — 지우면 결과가 허공을 가리킨다 */
         and not exists (
           select 1 from meetings m
            where m.code = c.code and (m.winner_region_id = c.id or m.winner_place_id = c.id))
    `;
  } else {
    await sql`update meetings set winner_place_id = ${candidateId}, stage = 'result'
                where code = ${code} and stage = 'place' and closed_at is null`;
  }
}

/** 되돌리기 — 한 칸씩 내려가고, 그 칸의 확정도 함께 지운다 (그릴링 논의39 ④).
    '지역 정하는 중' 인데 속으로 '성수동 확정' 을 들고 있으면,
    아무것도 안 고른 모임이 마무리 가드를 통과해 '성수동으로 끝난 모임' 이 됐다.
    지역 표는 그대로 둔다. 지점 후보는 버린다 (논의87) — 넣어 두는 장치는 없어졌다.
    돌아갈 칸이 없으면 아무것도 하지 않고 false 를 준다 — 화면이 그대로 말한다. */
export async function reopen(code: string): Promise<boolean> {
  const m = await getMeeting(code);
  if (!m || m.stage === 'region') return false;      /* 첫 칸에서는 더 못 내려간다 */

  if (m.stage === 'place') {
    /* 지점 → 지역: 지역 확정을 지우고, 모아 둔 지점 후보도 함께 버린다 (논의87).
       내려간 그 자리에서 버린다 — 지역 단계에 지점 후보가 남아 있으면 화면이
       '무엇을 고르는 중인가'를 두 가지로 말하게 된다.
       읽은 단계에서만, 그리고 아직 안 끝난 모임만 — 라우트의 closed 가드는 미리 읽은 값이라
       마무리와 동시에 들어오면 진다. 한 문장에 묶어야 되돌리기가 진 판에서 후보만 사라지지 않는다. */
    const r = (await sql`
      with 되돌림 as (
        update meetings set stage = 'region', winner_region_id = null, winner_place_id = null
         where code = ${code} and stage = 'place' and closed_at is null
        returning code
      ),
      버림 as (
        delete from candidates c
         where c.code in (select code from 되돌림) and c.kind = 'place'
           /* 정해진 곳은 어떤 길로도 안 지운다 — confirm 과 같은 가드 */
           and not exists (
             select 1 from meetings m
              where m.code = c.code and (m.winner_region_id = c.id or m.winner_place_id = c.id))
      )
      select code from 되돌림
    `) as unknown[];
    return r.length > 0;
  }

  /* 확정됨 → 한 칸 뒤로. '지역까지' 모임은 지역으로, '지점까지' 모임은 지점으로. */
  const r = (await sql`
    update meetings set
      stage = case when scope = 'region' then 'region' else 'place' end,
      winner_place_id = null,
      winner_region_id = case when scope = 'region' then null else winner_region_id end
    where code = ${code} and stage = 'result' and closed_at is null returning code
  `) as unknown[];
  return r.length > 0;
}

/** 마무리 — 지우지 않는다. closed_at 이 있으면 '지난 모임'.
    '정해진 곳이 실재하는가'를 같은 문장에서 본다. 라우트에서 미리 읽어 판단하면
    그 사이 남이 되돌렸을 때 아무것도 안 정해진 모임이 마무리돼 버린다(경합으로 재현됐다). */
export async function close(code: string): Promise<boolean> {
  const r = (await sql`
    update meetings m set closed_at = now()
     where m.code = ${code}
       and exists (
         select 1 from candidates c
          where c.id = coalesce(m.winner_place_id, m.winner_region_id))
     returning code
  `) as unknown[];
  return r.length > 0;
}

/** 정하지 않고 끝내기 (논의106) — 약속은 깨지기도 한다. 지우는 것 말고 닫는 길.
    확정이 없어도 지나가되 이미 닫힌 모임은 두 번 안 닫는다 — '언제 끝난 모임인가'가
    눌러 볼 때마다 바뀌면 안 된다. */
export async function closeWithoutPick(code: string): Promise<boolean> {
  const r = (await sql`
    update meetings set closed_at = now()
     where code = ${code} and closed_at is null returning code
  `) as unknown[];
  return r.length > 0;
}

/** 내보내기 — 표도 함께 뺀다 (논의45). 나가기와 규칙이 달라서,
    내보낸 사람이 두고 간 표가 그대로 1위를 만들고 있었다. */
export async function kick(code: string, participantId: string) {
  await setState(participantId, 'kicked');
  await 표빼기(code, participantId);
}

/** 스스로 나가기 — 그리고 내가 마지막이면 모임도 함께 사라진다 (논의69).
    '내가 마지막인가'를 라우트가 미리 조회해 판단하던 것을 여기로 옮겼다: 조회와 실행 사이에
    남이 들어오거나 함께 나가면 판단이 이미 낡는다 — 셋이 동시에 나가기를 누르면 셋 다
    '내가 마지막'을 보고 셋 다 모임을 지웠다고 답했다(시험으로 재현). 판단과 실행이 한 문장이면
    나중에 온 쪽은 지울 것을 못 찾는다.

    방장 판정도 여기서 한다 — **방장은 아예 못 나간다** (논의125). 넘길 곳이 없어졌으니
    빠지고 싶으면 모임을 지운다. 그 검사만 라우트에 남겨 두면 '누가 방장인가'를 보는 곳이 둘이 된다.
    혼자 남은 방장도 못 나간다 — '마지막 사람'보다 '방장인가'를 먼저 본다.
    그래서 논의69(마지막이 나가면 모임이 사라진다)는 사실상 안 도는 규칙이 됐다:
    방장이 늘 남아 있어 활동 중인 사람이 0이 될 수 없다. 버려진 모임은 논의104 가 맡는다.

    표·후보 정리(논의45·50)도 같은 문장이다. 참가자를 먼저 지우면 votes 가 cascade 로 사라져
    '이 표가 마지막이었나'를 되물을 수 없다 — 그래서 데이터를 고치는 CTE 들로 묶는다.
    모임째 사라질 때는 아무것도 안 훑는다: participants·candidates·votes 가 cascade 로 따라간다. */
export async function leaveOrRemove(code: string, participantId: string):
  Promise<'removed' | 'left' | 'host_cannot_leave' | 'not_found'> {
  const r = (await sql`
    with 나 as (
      select p.id, (m.host_id = p.id) as 방장인가
        from participants p join meetings m on m.code = p.code
       where p.id = ${participantId} and p.code = ${code}
    ),
    남은 as (
      select count(*)::int as n from participants
       where code = ${code} and state = 'active' and id <> ${participantId}
    ),
    갈길 as (
      /* 방장을 먼저 본다 (논의125) — 혼자 남았어도 나가는 것이 아니라 지우는 것이다 */
      select case when not exists (select 1 from 나)  then 'not_found'
                  when (select 방장인가 from 나)      then 'host_cannot_leave'
                  when (select n from 남은) = 0       then 'removed'
                  else 'left' end as 길
    ),
    모임지움 as (
      delete from meetings m
       where m.code = ${code} and (select 길 from 갈길) = 'removed'
      returning m.code
    ),
    /* 나만 찍은 곳과 내가 올려 두고 아무도 안 찍은 곳을 한꺼번에 — 둘 다 '나가면 주인이
       사라지는 후보'다. 정해진 곳과 AI 가 올린 곳은 어느 길로도 안 지운다 (논의50·65). */
    후보치움 as (
      delete from candidates c
       where (select 길 from 갈길) = 'left'
         and c.code = ${code} and not c.by_ai
         and (c.created_by = ${participantId}
              or exists (select 1 from votes v
                          where v.candidate_id = c.id and v.participant_id = ${participantId}))
         and not exists (select 1 from votes v
                          where v.candidate_id = c.id and v.participant_id <> ${participantId})
         and not exists (select 1 from meetings m
                          where m.code = c.code
                            and (m.winner_region_id = c.id or m.winner_place_id = c.id))
    ),
    표치움 as (
      delete from votes
       where code = ${code} and participant_id = ${participantId}
         and (select 길 from 갈길) = 'left'
    ),
    /* 남이 찍어 준 내 후보는 남는다. 주인만 떼어 내는 일은 DB 가 한다 —
       candidates_created_by_fk 가 on delete set null 이다(논의91). */
    나감 as (
      delete from participants p
       where p.id = ${participantId} and (select 길 from 갈길) = 'left'
      returning p.id
    )
    /* 갈 길은 스냅숏으로 정해지지만 지우기는 그 뒤에 벌어진다. 동시에 두 번 누르면
       둘 다 '내가 지웠다'고 답해 "모임이 사라졌어요" 가 두 번 떴다(실측 200/404/200).
       실제로 지운 쪽만 그렇게 말하게 한다 — 진 쪽에게는 이미 없는 것이다. */
    select case
             when (select 길 from 갈길) = 'removed'
                  and not exists (select 1 from 모임지움) then 'not_found'
             when (select 길 from 갈길) = 'left'
                  and not exists (select 1 from 나감)     then 'not_found'
             else (select 길 from 갈길)
           end as 길
  `) as { 길: 'removed' | 'left' | 'host_cannot_leave' | 'not_found' }[];
  return r[0]?.길 ?? 'not_found';
}

/* 방장 넘기기(handover)는 없앴다 (논의125) — 넘겨받는 사람이 로그인 안 했으면 그 모임이
   다시 '쿠키만 가진 방장'이 되어 벽돌 위험(논의122)이 그대로 돌아온다.
   기능을 없애서 그 구멍을 막는다. 방장이 빠지고 싶으면 모임을 지운다. */

export async function remove(code: string) {
  await sql`delete from meetings where code = ${code}`;
}

/** 승인 대기가 24시간 지나면 자동 거절 — 조회할 때 같이 정리한다 */
export async function expirePending(code: string) {
  await sql`
    update participants set state = 'kicked'
     where code = ${code} and state = 'pending' and requested_at < now() - interval '24 hours'
  `;
}

/* ── 치우기 (논의102 · 논의104) ──────────────────────────────────
   때맞춰 도는 별도 프로세스가 없다(서버 하나, 크론 없음). 그래서 조회에 얹는다 —
   승인 대기 자동 거절(expirePending)이 이미 쓰는 결이다. 다만 이쪽은 모임 하나가 아니라
   표 전체를 훑으므로 매 조회마다 돌릴 수 없다. */

/** 유효기간 지난 캐시를 지운다 (논의102). 사람이 비우는 단추는 두지 않는다.
    기준은 캐시를 읽는 쪽(lib/geo.ts · lib/places.ts)이 '지났다'고 보는 시각과 같아야 한다 —
    여기가 더 짧으면 멀쩡한 답을 버리고, 더 길면 안 쓰는 줄이 표에 눌러앉는다. */
export async function sweepCaches(): Promise<{ geo: number; places: number }> {
  /* 동 이름은 잘 안 바뀐다 — 1년. 나라를 모르는 옛 줄은 읽는 쪽이 늘 없는 셈 치므로(geo.ts)
     남겨 둘 값이 아니다. */
  const g = (await sql`
    delete from geo_cache
     where hit_at < now() - interval '1 year' or country is null
     returning gx
  `) as unknown[];
  /* 가게는 문을 닫고 새로 생긴다 — 6시간. 빈손은 30분(places.ts 의 빈손유통기한과 같다):
     아직 아무것도 안 올라온 동네가 반나절 내내 빈 채로 굳지 않게. */
  const p = (await sql`
    delete from places_cache
     where made_at < now() - (case when json_array_length(places) = 0
                                   then interval '30 minutes' else interval '6 hours' end)
     returning gx
  `) as unknown[];
  return { geo: g.length, places: p.length };
}

/** 90일 아무 움직임이 없는 모임을 지운다 (논의104).
    마무리한 모임은 기록이라 남긴다 — 정하다 말고 버려진 것만 치운다.
    '움직임'을 meetings.updated_at 하나로 보면 안 된다: 그 값은 모임 줄을 고칠 때만 갱신돼
    (트리거) 사람이 들어오고 후보를 찍는 동안에는 그대로다 — 한창인 모임이 지워진다.
    네 갈래를 모두 본다. 지우면 참가자·후보·표는 cascade 로 따라 사라진다. */
export async function sweepIdleMeetings(): Promise<number> {
  const r = (await sql`
    delete from meetings m
     where m.closed_at is null
       and m.updated_at < now() - interval '90 days'
       and not exists (
         select 1 from participants p where p.code = m.code and p.joined_at  > now() - interval '90 days')
       and not exists (
         select 1 from candidates  c where c.code = m.code and c.created_at > now() - interval '90 days')
       and not exists (
         select 1 from votes       v where v.code = m.code and v.voted_at   > now() - interval '90 days')
     returning m.code
  `) as unknown[];
  return r.length;
}

/* 조회 100번에 한 번만 치운다. 매번 돌리면 왕복 셋이 모든 조회에 붙고,
   안 돌리면 영영 안 치워진다 — 그 사이 어디쯤이면 된다.
   서버가 뜬 뒤 첫 조회에서 한 번 도는 것도 일부러다: 다시 켤 때마다 한 번은 확실히 돈다.
   치우다 넘어져도 조회는 살아야 한다 — 캐시·묵은 모임은 이번에 못 치우면 다음에 치우면 된다. */
let 청소틱 = 0;
async function 가끔청소() {
  if (청소틱++ % 100 !== 0) return;
  try {
    const { geo, places } = await sweepCaches();
    const 모임 = await sweepIdleMeetings();
    if (geo || places || 모임)
      console.log(`[db] 치웠다 — 동이름 ${geo} · 가게목록 ${places} · 조용한 모임 ${모임}`);
  } catch (e) {
    console.warn(`[db] 치우다 넘어졌다 — ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
}
