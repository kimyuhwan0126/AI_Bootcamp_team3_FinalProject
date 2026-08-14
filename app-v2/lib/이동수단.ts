/* 이동 수단을 받아들이는 잣대 — **여기 한 곳**이다.

   전에는 만들기 라우트와 참여 라우트가 각자 `['transit','car','walk'].includes(...)` 를 적어 두었다.
   그래서 걷기를 대중교통에 합칠 때 두 곳을 따로 고쳐야 했고, 한쪽만 고치면
   "만들 때는 되는데 참여할 때는 안 되는" 값이 생긴다. 잣대가 갈리면 언젠가 반드시 어긋난다.

   걷기를 대중교통에 합친 까닭은 `lib/types.ts` 의 Transport 주석에 적어 두었다.
   여기서는 그 결정의 **입구 쪽 뒤처리**만 맡는다: 옛 값 'walk' 는 거절하지 않고 옮겨 받는다.
   먼저 열어 둔 화면이 아직 그 값을 들고 있을 수 있는데, 400 을 주면 새로고침해야만 쓸 수 있다. */
import type { Transport } from './types';

const 받는것: Transport[] = ['transit', 'car'];

/* 같은 뜻이 된 옛 값 — 늘려야 할 일이 생기면 이 표에만 한 줄 는다 */
const 옛값: Record<string, Transport> = { walk: 'transit' };

/**
 * 들어온 값을 우리 값으로 옮긴다.
 *   · `undefined` — 안 보낸 것이다. 부르는 쪽이 제 기본값을 쓰면 된다
 *   · `'잘못됨'`  — 우리가 모르는 값이다. 400 으로 돌려보내야 한다
 *     (그냥 통과시키면 DB check 까지 내려가 본문 없는 500 이 된다 — 실제로 그랬다)
 */
export function 이동수단(v: unknown): Transport | undefined | '잘못됨' {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return '잘못됨';
  const t = 옛값[v] ?? v;
  return 받는것.includes(t as Transport) ? (t as Transport) : '잘못됨';
}
