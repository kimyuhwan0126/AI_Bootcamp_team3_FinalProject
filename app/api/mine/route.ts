/* 내가 들어간 모임 목록. 나를 찾는 길이 **둘**이고, 둘 다 있어야 한다 (논의124).

   ① 쿠키 — **로그인 없이 된다.** 브라우저가 `moimer.p.<코드>` 쿠키를 경로 `/` 로 달아 두어(auth.ts)
      어느 주소로 오든 전부 실어 보낸다. 그 쿠키 하나하나가 '이 모임에서 나는 누구인가' 다.
      로그인 안 하고 참여만 한 사람에게는 이것이 유일한 신원이다.
   ② 계정 — 로그인했으면 참가자 줄의 `user_id` 로도 찾는다. **폰을 바꾼 사람에게는 쿠키가 하나도 없다.**
      이것이 없으면 '방장은 로그인한다'고 해 놓고도 새 폰에서는 자기 모임이 하나도 안 보였다.

   둘 다 없으면 401 이 아니라 빈 목록이다 — 아직 아무 모임에도 안 들어간 사람일 뿐이고,
   화면은 그 자리에 '모임을 만들어 보세요'를 그린다. */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as db from '@/lib/db';
import { getParticipantId, 지금로그인 } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* 쿠키 이름은 auth.ts 의 `key()` 가 짓는다. 여기서 다시 짓지 않고 접두만 안다 —
   두 곳에서 이름을 지으면 한쪽만 고치는 날 목록이 통째로 빈다. */
const 접두 = 'moimer.p.';

/* 쿠키 이름에 뭐든 들어올 수 있다. 코드 모양이 아닌 것은 여기서 끊는다 —
   글자 수를 안 보면 남이 심어 둔 긴 쿠키가 그대로 질의로 내려간다.
   있는 코드인지는 db 가 본다(없는 모임은 조용히 빠진다). */
const 코드모양 = /^[A-Za-z0-9_-]{1,32}$/;

export async function GET() {
  const 병 = cookies();
  const 짝 = 병.getAll()
    .filter((c) => c.name.startsWith(접두))
    .map((c) => c.name.slice(접두.length))
    .filter((code) => 코드모양.test(code))
    /* 서명 확인은 auth.ts 만 한다 — 소금과 서명 규칙을 여기 베끼면 규칙이 바뀌는 날
       한쪽만 고쳐 놓고 '왜 목록이 비지' 하게 된다. 서명이 틀리면 null 이라 아래에서 빠진다.
       ⚠ getParticipantId 는 모임 하나짜리라 쿠키 수만큼 부른다(해시 한 번씩, 값싸다).
          여러 쿠키를 한 번에 훑는 길이 auth.ts 에 생기면 그것으로 바꿔라. */
    .map((code) => ({ code, participantId: getParticipantId(code) }))
    .filter((x): x is { code: string; participantId: string } => !!x.participantId);

  /* 로그인했으면 계정으로도 찾는다 (논의124) — 폰을 바꾼 사람에게는 쿠키가 하나도 없다.
     로그인이 **필요한** 것은 아니다: 쿠키만 가진 참가자도 그대로 자기 목록을 본다.
     `지금로그인().id` 가 곧 users 줄의 id 다(auth.ts 의 jwt 콜백이 upsertUser 결과를 실어 둔다) —
     여기서 계정을 다시 찾아 users 를 건드리면 목록을 볼 때마다 쓰기가 일어난다. */
  const 나 = await 지금로그인();

  /* 정렬도 걸러내기도 db 가 한 번의 질의로 한다 — 모임마다 왕복하지 않는다 */
  return NextResponse.json({ meetings: await db.myMeetings(짝, 나?.id ?? null) });
}
