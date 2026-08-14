import { redirect, notFound } from 'next/navigation';
import * as db from '@/lib/db';
import { getParticipantId } from '@/lib/auth';
import JoinForm from './form';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { code: string } }) {
  const m = await db.getMeeting(params.code);
  if (!m) notFound();
  /* 마무리한 모임은 참여 폼 대신 열람으로 (그릴링 Q3) */
  if (m.closed_at) redirect(`/m/${params.code}`);
  /* 이미 멤버면 폼을 다시 보여주지 않는다.
     쿠키가 있다는 것만 보고 되돌려 보내면 안 된다 — 내보내진 사람의
     '다시 참여 신청하기'가 강퇴 화면으로 되돌아와 무한 왕복이었다.
     내보내진(=거절된) 기기와, 신원이 사라진 옛 쿠키에는 참여 폼을 보여 준다. */
  const pid = getParticipantId(params.code);
  if (pid) {
    const me = (await db.getView(params.code, pid))?.participants.find((p) => p.id === pid) ?? null;
    if (me && me.state !== 'kicked') redirect(`/m/${params.code}`);
  }
  return <JoinForm code={params.code} name={m.name} />;
}
