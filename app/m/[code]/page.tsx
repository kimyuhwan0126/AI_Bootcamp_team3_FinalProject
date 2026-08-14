/* 서버는 데이터만 준다. 그리는 일은 ui.tsx 하나가 맡는다.

   ⚠ **첫 그림도 API 와 같은 잣대로 나를 찾아야 한다** (논의124·130).
   전에는 여기서 `getParticipantId` 만 봤다 — 참가자 쿠키 하나뿐이었다.
   그 사이 신원의 열쇠는 셋이 됐는데(쿠키 · 계정 · 이름+PIN) 이 자리만 옛 규칙에 머물러서,
   **폰을 바꿔 로그인만 하고 들어온 사람은 자기 모임에서 "이 모임에 참여하기" 를 봤다.**
   그것이 이 두 결정이 지키기로 한 약속의 정반대다.

   시험이 못 잡은 까닭도 적어 둔다: 시험이 전부 `GET /api/m/<코드>` 만 쟀다.
   그 길은 처음부터 계정을 봤으므로 늘 초록이었다 — **사람이 실제로 거치는 길(첫 그림)만 빠져 있었다.** */
import { notFound } from 'next/navigation';
import * as db from '@/lib/db';
import { getParticipantId, setParticipantCookie, 지금로그인 } from '@/lib/auth';
import { 방장인가 } from '@/lib/방장';
import UI from './ui';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { code: string } }) {
  const code = params.code;
  await db.expirePending(code);

  /* 나를 찾는 길이 둘이다 — 라우트의 `신원()` 과 **같은 규칙**이어야 한다.
     ① 참가자 쿠키 ② 로그인한 계정.
     계정 쪽이 이기는 것이 아니라, **쿠키가 없거나 이 모임 것이 아닐 때** 계정이 메운다. */
  let myId = getParticipantId(code);
  const 나 = await 지금로그인();
  if (나) {
    const 자리 = await db.findByUser(code, 나.id);
    /* 쿠키가 가리키는 줄이 이 모임에 정말 있는지는 `getView` 가 판단한다(없으면 me 가 null).
       여기서는 '쿠키가 아예 없거나, 계정 자리와 다른 줄을 가리킬 때' 계정 쪽으로 맞춘다 —
       계정은 이 모임에서 그 사람의 자리를 하나로 못 박는 열쇠다(participants.user_id). */
    if (자리 && myId !== 자리.id) {
      myId = 자리.id;
      /* 쿠키도 다시 심어 준다 — 그래야 그다음 요청부터는 조회 한 번이 준다.
         (서버 컴포넌트에서 쿠키를 쓰는 것은 `dynamic = 'force-dynamic'` 이라 괜찮다) */
      try { setParticipantCookie(code, 자리.id); } catch { /* 못 심어도 이번 그림은 맞다 */ }
    }
  }

  const view = await db.getView(code, myId);
  if (!view) notFound();

  /* 방장 판정도 API 와 같아야 한다 (논의124). `getView` 는 쿠키만 아는 자리라
     계정 규칙을 여기서 한 번 더 씌운다 — 안 씌우면 첫 그림에만 방장 도구가 없다가
     SSE 로 다시 읽은 뒤에야 나타나서, 사람은 그 사이에 "내 모임이 아닌가" 싶어진다. */
  view.me.isHost = 방장인가(나, await db.hostAccount(code), myId);

  /* 내보내짐·승인 대기 화면은 ui.tsx 가 그린다 (그릴링 논의29 · 논의43 ③).
     여기서 서버 렌더로 끝내면 그 화면에 SSE 가 없어서, 거절당해도·승인돼도
     새로고침 전까지 '기다리는 중' 그대로였다. 화면 쪽 가드는 실시간으로 바뀐다. */
  return <UI code={code} first={view} />;
}
