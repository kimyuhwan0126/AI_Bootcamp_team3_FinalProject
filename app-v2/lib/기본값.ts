/* 내정보 기본값 — 모임을 만들 때·참여할 때 폼에 **먼저 채워지는** 값
   (내 출발지 · 이동 수단 · PIN 네 자리).

   ⚠ **이 기기에만 남는다.** 논의52(카카오 로그인)가 아직이라 서버에는 '누구 것인지' 를
   적을 자리가 없다. 계정이 생기면 이 파일의 속만 서버로 갈아 끼우면 된다 — 그래서
   화면은 localStorage 를 직접 만지지 않는다.

   읽고 쓰는 길이 여기 하나뿐이어야 **저장하는 곳과 불러오는 곳이 갈라지지 않는다.**
   예전판이 무너진 자리가 정확히 거기다(예전판 기록 §6·7): 내정보는 저장했는데
   만들기 폼은 아무 데서도 안 읽어, 화면이 약속한 "모임을 만들 때 바로 불러와요" 가
   거짓말이었다. 지금은 출발지 칸(app/originfield.tsx)이 스스로 이 함수를 부른다. */

import type { Origin, Transport } from '@/app/originfield';

/* 예전판은 `moimer:v8:profile` 이었다. 담는 것도 판도 달라 이름을 갈랐다 —
   옛 값이 기기에 남아 있어도 새 판이 그것을 얼결에 읽지 않는다. */
const 열쇠 = 'moimer.기본값.v1';

export type 기본값 = { origin: Origin | null; transport: Transport; pin: string };

/* 아무것도 안 넣어 둔 상태. 이동 수단 첫 값은 만들기·참여 폼과 같아야 한다 —
   여기만 다르면 기본값이 없는 사람에게 화면이 두 가지로 보인다. */
export const 빈값: 기본값 = { origin: null, transport: 'transit', pin: '' };

const 이동수단들: Transport[] = ['transit', 'car'];
/* 이 기기에 'walk' 가 이미 저장돼 있는 사람이 있다 — 걷기를 대중교통에 합치기(lib/types.ts) 전에
   골라 둔 값이다. 모르는 값으로 보고 기본값으로 되돌리면 **자기가 골라 둔 것이 말없이 바뀐다.**
   같은 뜻이 된 값이니 조용히 옮겨 준다. */
const 옛값옮기기 = (t: string) => (t === 'walk' ? 'transit' : t);

/* 이 칸의 글자는 우리가 쓴 것이 아닐 수도 있다(사람이 만졌거나 옛 판이 남겼거나).
   특히 좌표 없는 출발지를 그대로 폼에 얹으면 만들기가 서버에서 막히는데
   사람은 출발지가 채워져 있는 것만 보고 까닭을 모른다. 그래서 하나하나 본다. */
function 출발지읽기(v: unknown): Origin | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { name: o.name, address: typeof o.address === 'string' ? o.address : '', lat: o.lat, lng: o.lng };
}

export function 기본값읽기(): 기본값 {
  /* 서버에서 그릴 때는 이 값이 아예 없다 — 없는 채로 그려야 화면이 뒤늦게 어긋나지 않는다.
     부르는 쪽이 useEffect 안에서 부르는 까닭도 그것이다. */
  if (typeof window === 'undefined') return 빈값;
  try {
    const 글 = window.localStorage.getItem(열쇠);
    if (!글) return 빈값;
    const v = JSON.parse(글) as Record<string, unknown>;
    const t = 옛값옮기기(String(v.transport ?? '')) as Transport;
    return {
      origin: 출발지읽기(v.origin),
      transport: 이동수단들.includes(t) ? t : 빈값.transport,
      pin: typeof v.pin === 'string' && /^\d{4}$/.test(v.pin) ? v.pin : '',
    };
  /* 브라우저가 이 기기 저장을 막아 둔 수도 있다(사생활 모드·쿠키 차단) — 그러면 기본값이 없는 셈이다 */
  } catch { return 빈값; }
}

/** 하나라도 넣어 뒀나 — '지우기' 를 보일지 정할 때 쓴다 */
export const 넣어둔게있나 = (v: 기본값 = 기본값읽기()) =>
  !!v.origin || !!v.pin || v.transport !== 빈값.transport;

export function 기본값쓰기(v: 기본값): void {
  if (typeof window === 'undefined') return;
  try {
    /* 셋 다 비면 자리를 아예 지운다 — '빈 값이 저장돼 있다' 와 '없다' 가 갈리면
       불러오는 쪽이 두 갈래를 다 살펴야 한다 */
    if (!넣어둔게있나(v)) { window.localStorage.removeItem(열쇠); return; }
    window.localStorage.setItem(열쇠, JSON.stringify({
      origin: v.origin,
      transport: v.transport,
      /* 네 자리가 아니면 아예 안 담는다 — 반쯤 적힌 PIN 이 참여 폼에 얹히면
         사람은 자기가 다 적은 줄 알고 그대로 낸다 */
      pin: /^\d{4}$/.test(v.pin) ? v.pin : '',
    }));
  } catch { /* 못 써도 화면은 계속 돌아야 한다 */ }
}

export function 기본값지우기(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(열쇠); } catch { /* 위와 같다 */ }
}
