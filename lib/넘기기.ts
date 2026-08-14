/* 홈에서 잡아 둔 출발지를 **만들기 폼으로 나르는 길**, 그리고 홈에 다시 왔을 때 지키는 길.

   예전판은 `lib/handoff.ts` 로 같은 일을 했다(예전판 기록 §1). 담는 곳을 여기 하나로 두는 까닭은
   `lib/기본값.ts` 와 같다 — 넣는 쪽과 꺼내는 쪽이 갈라지면 화면이 약속한 말이 곧 거짓말이 된다.

   두 가지를 나눠 담는다. 사는 기간이 다르기 때문이다.
     · 폼으로 넘기는 것  — 이번 한 번뿐이다 (기억에만)
     · 홈에 두고 가는 것 — 이 창을 닫을 때까지다 (sessionStorage) */

import type { Origin, Transport } from '@/app/originfield';

export type 넘길것 = { 출발지들: Origin[]; 이동수단: Transport };

/* ── ① 만들기 폼으로 넘기기 ─────────────────────────────────
   **브라우저 저장소를 안 쓴다.** 까닭이 둘이다.
     · `/new` 는 서버가 먼저 그린다. 서버는 이 기기 저장소를 못 읽는데 브라우저는 읽으니
       첫 그림이 어긋난다(hydration). 기억(모듈 변수)은 서버에서 늘 비어 있고,
       브라우저에서 값이 차 있으려면 **같은 문서 안에서 옮겨 간 것**이라야 한다 —
       그때는 서버가 그리는 일 자체가 없으므로 어긋날 자리가 없다.
     · 주소에 실어 보낼 수도 있었다. 그러면 남의 집 근처 좌표가 주소창과 방문 기록에 남는다.

   그래서 새로고침하면 넘긴 것은 사라지고 폼은 내정보 기본값으로 돌아간다.
   그 편이 맞다 — 폼을 다시 연 사람에게 몇 분 전에 홈에서 만졌던 남의 출발지가
   말없이 얹혀 있으면, 그것이 어디서 왔는지 알 길이 없다. */
let 실은것: 넘길것 | null = null;

export function 실어보내기(v: 넘길것): void {
  실은것 = v;
}

/** 들고 온 것을 보기만 한다 — 지우지 않는다.
 *  개발 모드는 그리기를 두 번 돌린다(reactStrictMode). 꺼내면서 지우면 두 번째에 빈손이 된다. */
export const 엿보기 = (): 넘길것 | null => 실은것;

/** 다 받았으면 내려놓는다 — 뒤로 갔다 다시 와도 옛 출발지가 또 얹히지 않게 */
export function 내려놓기(): void {
  실은것 = null;
}

/* ── ①-2 만들던 폼을 두고 로그인 다녀오기 ────────────────────
   모임 만들기는 로그인이 필요하다(논의123). 로그인은 **이 화면을 떠나야** 한다 —
   `/me` 로 갔다가 카카오까지 다녀온다. 위 ①은 모듈 변수라 그 사이에 통째로 날아간다:
   화면은 "적어 두신 것은 그대로 있어요" 라고 적어 두고 실제로는 빈 폼을 돌려줬다.
   말과 실제를 맞추려면 문서를 넘어가도 남는 곳에 담아야 한다.

   `sessionStorage` 다 — ②와 같은 까닭(어제 적다 만 모임 이름이 오늘 떠 있으면 안 된다).
   좌표가 한 개 들어가지만 ②가 이미 같은 것을 담고 있어 새로 늘어나는 위험은 없다.
   **꺼내면 지운다.** 로그인하고 돌아와 한 번 채워 주면 할 일이 끝난다 — 남겨 두면
   나중에 그냥 만들러 온 사람에게 지난번 폼이 말없이 얹힌다. */
const 폼열쇠 = 'moimer.만들던것.v1';

/** 로그인하러 떠나기 전에 폼을 통째로 담는다. 무엇을 담는지는 부르는 쪽이 정한다 —
 *  여기서 칸 이름을 알면 폼에 칸이 늘 때마다 이 파일도 고쳐야 한다. */
export function 만들던것담기(v: unknown): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(폼열쇠, JSON.stringify(v)); } catch { /* 못 써도 화면은 돈다 */ }
}

/** 돌아왔을 때 꺼낸다 — 한 번뿐이다.
 *  담긴 글자가 우리 것이 아닐 수도 있다(사람이 손댔거나 옛 판이 담았거나) —
 *  객체가 아니면 없는 셈 친다. 칸 하나하나는 부르는 쪽이 본다. */
export function 만들던것꺼내기(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const 글 = window.sessionStorage.getItem(폼열쇠);
    window.sessionStorage.removeItem(폼열쇠);
    if (!글) return null;
    const v = JSON.parse(글);
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}

/* ── ② 홈에 두고 가기 ──────────────────────────────────────
   `sessionStorage` 다. `localStorage` 가 아닌 까닭:
     · 탐색은 '이번에 어디서 만날까'를 재 보는 자리다. 어제 넣어 둔 친구들 출발지가
       오늘 홈에 그대로 남아 있으면 지운 줄 알고 또 넣는다.
     · 남의 집 근처 좌표를 이 기기에 영영 남기지 않는다.
   새로고침·뒤로가기에는 남고, 창을 닫으면 사라진다. */
const 열쇠 = 'moimer.탐색.v1';

/* 저장한 글자는 우리가 쓴 것이 아닐 수도 있다 — 좌표 없는 출발지가 얹히면
   가운데 셈이 NaN 이 되고 지도가 통째로 빈다 (lib/기본값.ts 와 같은 규칙). */
function 하나읽기(v: unknown): Origin | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { name: o.name, address: typeof o.address === 'string' ? o.address : '', lat: o.lat, lng: o.lng };
}

/** `null` 은 '두고 간 것이 없다', `[]` 는 '두고 갔는데 다 뺐다' — 이 둘을 갈라야
 *  기본 출발지를 다시 얹을지 말지가 갈린다 (app/탐색/탐색.tsx) */
export function 두고간것읽기(): Origin[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const 글 = window.sessionStorage.getItem(열쇠);
    if (!글) return null;
    const v = JSON.parse(글);
    if (!Array.isArray(v)) return null;
    return v.map(하나읽기).filter((o): o is Origin => !!o);
  /* 브라우저가 이 기기 저장을 막아 둔 수도 있다 — 그러면 두고 간 것이 없는 셈이다 */
  } catch { return null; }
}

export function 두고가기(list: Origin[]): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(열쇠, JSON.stringify(list)); } catch { /* 못 써도 화면은 돈다 */ }
}
