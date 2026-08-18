/* 지도·주소 찾기 API 는 **횟수만** 막는다 (그릴링 논의92).
   잠그지 않는 까닭 — 초대 링크만 받은 사람이 모임에 들어가기 **전에** 출발지를 고른다.
   로그인이나 참여를 조건으로 걸면 그 길이 통째로 막힌다.

   기기를 어떻게 알아보나
     · 우리가 심은 쿠키(moimer.d)를 먼저 본다. IP 만 보면 통신사 NAT 뒤의 수백 명이 한 칸을
       나눠 쓴다 — 같은 자리에서 셋이 켜면 서로를 막는다.
     · 쿠키가 없는 요청은 IP 칸에 모아 센다. 쿠키만 보면 안 보내는 쪽이 무제한이 된다.
       브라우저는 첫 응답에서 쿠키를 받아 다음 요청부터 제 칸으로 옮겨 간다.
     · 쿠키에 서명을 붙인다 — 서명이 없으면 값을 매번 지어내 칸을 무한히 만들 수 있다.
       그래도 쿠키를 새로 받아 가며 부르면 뚫린다. 그건 감수한다(논의92) —
       여기 목적은 사고와 긁어 가기를 늦추는 것이지 막는 것이 아니다.

   세는 곳은 이 프로세스의 메모리다. 서버가 여러 대가 되면 대수만큼 한도가 곱해진다 —
   지금은 한 대라 맞고, 늘어나면 저장할 곳을 옮긴다. */
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/* 30초에 120번 = 초당 4번. 가장 바쁜 정상 사용자의 세 배 넘게 잡았다 —
     · 지도 미리보기: 한 번 누를 때 /api/geo 와 /api/places 를 각 1번. 쉬지 않고 1초에 한 번씩
       눌러도 길마다 30번/창이다.
     · 출발지 이름 찾기: 화면이 350ms 손을 멈춰야 부른다(originfield.tsx) — 이론상 최대가
       초당 2.8번, 실제로는 훨씬 뜸하다.
   긁어 가는 쪽은 초당 수십 번이라 몇 초 만에 걸린다.
   창을 1분이 아니라 30초로 둔 것은 잘못 걸렸을 때 오래 못 쓰게 두지 않으려는 것이다.
   실제 쓰임을 보고 다시 정한다(논의92 "처음엔 넉넉하게"). */
const 창 = 30_000;
const 한도 = 120;

/* 길마다 잣대가 다를 수 있다 (배포 점검 §3⑦, 모임 조회·SSE) —
     · view(GET /api/m/[code]): 내가 직접 부르는 것 말고도 SSE 'changed' 한 번마다
       화면이 한 번씩 다시 읽는다(ui.tsx reload). 사람이 여럿인 모임에서 다 같이
       한꺼번에 찍으면 각자의 화면이 그 수만큼 조회를 낸다 — 지도 한 번 누르기와
       셈이 다르다. 그래서 기본보다 넉넉하게 둔다.
     · stream(GET /api/m/[code]/stream): 새 연결을 여는 순간만 센다(길 안에서 도는
       하트비트·이벤트는 안 센다) — 정상적인 새 연결은 페이지를 열 때, 탭에 돌아올 때,
       망이 끊겼다 돌아올 때뿐이라 기본 한도로도 충분하다. 따로 안 적으면 기본을 쓴다.
   여기 없는 길은 위 기본(창/한도)을 그대로 쓴다 — geo·places·places/search 가 그렇다. */
const 길별한도: Record<string, { 창: number; 한도: number }> = {
  view: { 창: 30_000, 한도: 300 },
  /* 홈 탭 AI 추천(2026-08-22) — geo·places 와 달리 이건 **진짜 토큰이 나간다**(lib/ai.ts).
     모임 화면 AI 는 모임 줄에 새긴 한도(db.useAi, 모임당 3번)가 있는데 홈은 모임이 없어
     그 도구를 못 쓴다 — 기본(30초·120번)을 그대로 두면 순식간에 지갑이 빈다.
     사람이 손으로 눌러야 부르는 자리(opt-in)이니 10분에 5번이면 정상 사용은 안 걸리고,
     연타·긁어 가기만 걸린다. */
  'home-ai': { 창: 10 * 60_000, 한도: 5 },
};

/* PIN 과 같은 솔트를 쓴다 — 서명은 서버만 만들 수 있으면 된다 */
const SALT = process.env.NEXTAUTH_SECRET ?? 'moimer-dev-salt';
const 쿠키이름 = 'moimer.d';
const sign = (id: string) =>
  createHash('sha256').update(`${SALT}:device:${id}`).digest('hex').slice(0, 24);

const 기록 = new Map<string, number[]>();

const 아이피 = () => {
  const h = headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '')
    .trim() || 'unknown';
};

function 기기() {
  const jar = cookies();
  const raw = jar.get(쿠키이름)?.value;
  if (raw) {
    const i = raw.lastIndexOf('.');
    if (i > 0) {
      const want = Buffer.from(sign(raw.slice(0, i)));
      const got = Buffer.from(raw.slice(i + 1));
      if (want.length === got.length && timingSafeEqual(want, got)) return `d:${raw.slice(0, i)}`;
    }
  }
  const id = randomBytes(9).toString('base64url');
  try {
    jar.set(쿠키이름, `${id}.${sign(id)}`, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180,
      secure: process.env.NODE_ENV === 'production',
    });
  } catch { /* 쿠키를 못 심는 자리면 IP 로만 센다 */ }
  return `ip:${아이피()}`;
}

/** 이 요청을 받아도 되나. 길마다 따로 센다 — 지도 한 번 누르기가 두 길을 각 1번씩 쓴다. */
export function 횟수확인(길: string): { ok: true } | { ok: false; 다시: number } {
  const { 창: 이창, 한도: 이한도 } = 길별한도[길] ?? { 창, 한도 };
  const 열쇠 = `${길}:${기기()}`;
  const 이제 = Date.now();
  const 앞선것 = (기록.get(열쇠) ?? []).filter((t) => 이제 - t < 이창);
  기록.set(열쇠, 앞선것);
  if (앞선것.length >= 이한도)
    return { ok: false, 다시: Math.max(1, Math.ceil((이창 - (이제 - 앞선것[0])) / 1000)) };
  앞선것.push(이제);
  /* 안 쓰는 칸이 쌓이면 치운다 — 요청마다 전부 훑으면 그것이 더 비싸다 */
  if (기록.size > 5000) for (const [k, v] of 기록) if (이제 - (v[v.length - 1] ?? 0) >= 이창) 기록.delete(k);
  return { ok: true };
}

/** 셋이 같은 말을 하게 한 곳에 둔다. retryable 은 화면이 '기다리면 된다'를 구별하는 표다(논의101). */
export const 너무잦음 = (다시: number) =>
  NextResponse.json(
    { error: 'too_many', retryable: true, retryAfterSec: 다시 },
    { status: 429, headers: { 'retry-after': String(다시) } },
  );
