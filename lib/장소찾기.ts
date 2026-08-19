/* 이름으로 자리 찾기 — `/api/places/search` 를 부르고, 못 찾았을 때 **무슨 말을 할지**까지.

   `app/originfield.tsx` 안에만 있던 것을 꺼냈다. 그 파일 머리말이 규칙을 이미 적어 뒀다 —
   "만들기·참여와 한 벌이어야 고칠 곳이 하나로 남는다". 홈이 제 검색 패널을 갖게 되면서
   부르는 자리가 둘이 됐으니, 갈라 두면 카카오가 죽었을 때 어느 화면은 말하고 어느 화면은
   조용해진다.

   여기에는 React 가 없다 — 디바운스는 부르는 쪽(화면)이 제 사정에 맞게 건다.
   지금은 두 곳 다 350ms 다. */

import type { Origin } from '@/app/originfield';

/* 봉투의 `retryable` 이 '기다리면 되는가'를 말한다 — 화면이 상태 코드를 다시 해석하지 않는다.
   오늘치를 다 쓴 카카오 몫(quota_kakao)은 429 여도 기다려서 될 일이 아니다. */
export const 못찾은말 = (j: { error?: string; retryable?: boolean } | null) =>
  j?.error === 'too_many' ? '너무 자주 불러서 잠깐 쉬는 중이에요 — 잠시 뒤에 다시 해 주세요'
  : j?.retryable ? '지금은 장소를 찾을 수 없어요 — 잠시 뒤에 다시 해 주세요'
  : '지금은 장소를 찾을 수 없어요';

/* 두 글자 아래는 서버가 어차피 빈손을 준다(`app/api/places/search/route.ts` 의 `최소`) —
   여기서 접어 왕복 하나를 아낀다. 값은 서버와 같아야 한다. */
export const 최소글자 = 2;

/* 서버(`/api/places/search`)는 `lib/places.ts` 의 `Place` 를 돌려준다 — `Origin` 에
   `id` 가 붙은 모양이다. 목록 key 로 그 `id` 를 쓰므로 타입에 남겨 둔다. */
export type 찾은곳 = Origin & { id: string };

export type 찾은것 =
  | { 곳들: 찾은곳[]; 문제: null }
  | { 곳들: null; 문제: string };

/**
 * 이름으로 찾는다. **던지지 않는다** — 망이 끊긴 것도 '기다리면 되는 문제'로 돌려준다.
 *
 * @param 말   찾을 말 (앞뒤 공백은 여기서 턴다)
 * @param 옵션 `근처` 를 주면 그 둘레로 좁혀 찾는다(서버가 `lat`·`lng`·`r` 로 받는다).
 *             `신호` 는 앞 요청을 끊는 AbortSignal.
 */
export async function 장소찾기(
  말: string,
  옵션?: { 근처?: { lat: number; lng: number; r?: number }; 신호?: AbortSignal },
): Promise<찾은것> {
  const s = 말.trim();
  if (s.length < 최소글자) return { 곳들: [], 문제: null };

  const q = new URLSearchParams({ q: s });
  if (옵션?.근처) {
    q.set('lat', String(옵션.근처.lat));
    q.set('lng', String(옵션.근처.lng));
    if (옵션.근처.r != null) q.set('r', String(옵션.근처.r));
  }

  try {
    const res = await fetch(`/api/places/search?${q}`, { signal: 옵션?.신호 });
    if (!res.ok) return { 곳들: null, 문제: 못찾은말(await res.json().catch(() => null)) };
    return { 곳들: (await res.json()).places ?? [], 문제: null };
  } catch (e) {
    /* 부르는 쪽이 스스로 끊은 것은 '못 찾았다'가 아니다 — 빈손으로 조용히 돌려보낸다.
       안 그러면 글자를 칠 때마다 앞 요청이 끊기며 빨간 글이 깜빡인다. */
    if (e instanceof DOMException && e.name === 'AbortError') return { 곳들: [], 문제: null };
    /* 대답조차 못 받은 것은 망이 끊긴 쪽이다 — 그건 다시 해 보면 된다 */
    return { 곳들: null, 문제: 못찾은말({ retryable: true }) };
  }
}
