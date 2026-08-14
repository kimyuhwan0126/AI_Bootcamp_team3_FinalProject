/* 모임 만들기. 만든 사람이 방장이자 첫 참가자다.
   방장은 로그인해야 한다 (논의123) — 신원이 계정에 있어야 폰을 바꿔도 자기 모임으로 돌아온다. */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import { setParticipantCookie, 지금로그인 } from '@/lib/auth';
import { 약속시간유효 } from '@/lib/time';
import { 이동수단 } from '@/lib/이동수단';
import { 한국안 } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  /* 몸을 읽기 전에 세션부터 본다 — 로그인 안 한 사람에게 '이름을 적으세요'부터 돌려주면
     다 채우고 나서야 막힌다. 화면은 이 코드를 보고 로그인으로 보낸다. */
  const 나 = await 지금로그인();
  if (!나) return NextResponse.json({ error: 'login_required' }, { status: 401 });

  const b = (await req.json()) as {
    name?: string; hostName?: string; scope?: 'region' | 'place'; purpose?: string; meetAt?: string | null;
    origin?: string; lat?: number; lng?: number; transport?: string;
  };
  const name = (b.name ?? '').trim();
  const hostName = (b.hostName ?? '').trim();
  if (!name || !hostName) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  /* 설정 저장은 40자에서 막는데 여기만 무제한이라, 긴 이름으로 만든 모임은
     설정을 영영 저장할 수 없었다. 같은 상한을 여기에도 둔다. */
  if (name.length > 40) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });
  if (hostName.length > 12) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });
  /* 방장도 출발지를 낸다 — 그래야 첫 지도가 사람들 가운데에서 열린다 (그릴링 논의35 ①) */
  if (!b.origin || !Number.isFinite(b.lat) || !Number.isFinite(b.lng))
    return NextResponse.json({ error: 'origin_required' }, { status: 400 });
  /* **한국 안이어야 한다** (논의55). 참여·핑·AI 는 다 보는데 **이 문 하나만 안 봤다** —
     도쿄 좌표로 모임이 그대로 만들어졌다(대조 갈래가 실측으로 뚫었다).
     그 모임은 만들어지는 순간 지도도 가운데도 바깥을 물고 돌고, 논의89 가 치운
     '한국 밖 좌표' 가 이 문으로 언제든 되돌아온다. 잣대는 `lib/geo.ts` 의 `한국안` 하나다. */
  if (!한국안(b.lat as number, b.lng as number))
    return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
  /* 아무 문자열이나 DB check 까지 내려가 빈 500 이 됐다 (참여 쪽과 같은 결).
     'walk' 는 거절하지 않고 'transit' 으로 옮겨 받는다 — 걷기를 대중교통에 합쳤다(lib/types.ts).
     먼저 열어 둔 화면이 아직 옛 값을 들고 있을 수 있는데, 거기서 400 을 주면 새로고침해야만
     모임을 만들 수 있다. 뜻이 같아진 값이니 조용히 받는다. */
  const transport = 이동수단(b.transport);
  if (transport === '잘못됨') return NextResponse.json({ error: 'bad_transport' }, { status: 400 });
  /* 약속 시간은 비워도 된다 (그릴링 논의70). 대신 적었으면 설정 화면과 같은 잣대로 본다 —
     여기만 검사가 없어 '내일 저녁 7시'가 저장 직전 null 로 뭉개져
     시간 없는 모임이 조용히 만들어졌다. 잣대는 lib/time.ts 한 곳에만 둔다. */
  const meetAt = typeof b.meetAt === 'string' ? b.meetAt.trim() : '';
  if ((b.meetAt != null && typeof b.meetAt !== 'string') || (meetAt && !약속시간유효(meetAt)))
    return NextResponse.json({ error: 'bad_time' }, { status: 400 });

  /* 논의88 이 여기서 풀린다 — 전에는 모임을 만들 때마다 users 에 한 줄씩 쌓여 727줄이 됐다.
     이제 열쇠(계정)로 잇는다: 같은 사람이 모임을 백 개 만들어도 users 는 한 줄이다.
     닉네임은 로그인 이름을 쓴다 — 폼에 적은 방장 이름은 '이 모임에서 부를 이름'이라 다르다. */
  const userId = await db.upsertUser({ accountKey: 나.key, nickname: 나.nickname });
  const { code, participantId } = await db.createMeeting({
    name, scope: b.scope ?? 'place', purpose: b.purpose ?? null,
    meetAt: meetAt || null, hostUserId: userId, hostName,
    origin: b.origin, lat: b.lat, lng: b.lng, transport,
  });
  setParticipantCookie(code, participantId);
  return NextResponse.json({ code });
}
