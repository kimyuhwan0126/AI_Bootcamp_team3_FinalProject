/* `lib/넘기기.ts` 의 '홈에 두고 가기' 회귀 시험 — 진짜 브라우저가 필요 없다.
   `sessionStorage` 를 흉내 낸 상자를 `globalThis.window` 에 얹고 잰다.

   무엇을 지키는가 (셋 다 눈으로는 못 알아챈다):
     ① **`null`(둔 적 없다)과 `[]`(다 뺐다)의 갈림.** 뭉개면 옛 홈이 방금 손으로 다 뺀 자리에
        내정보 기본 출발지를 새로고침마다 다시 얹는다(app/탐색/탐색.tsx:85–89).
     ② **출발지와 수단은 함께 산다.** 반쪽만 돌아오면, 자동차로 바꿔 둔 사람이 그것을
        눈치채지 못한 채 대중교통 시간을 제 시간으로 읽는다.
     ③ **옛 꼴(v1)은 읽지 않고 치운다.** 남겨 두면 옛 판으로 되돌렸을 때 지운 지 한참 된
        목록이 말없이 얹힌다.

   돌리는 법:  npm test */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { 두고간것읽기, 두고가기 } from '../lib/넘기기.ts';

const 열쇠 = 'moimer.탐색.v2';
const 옛열쇠 = 'moimer.탐색.v1';

/* 브라우저의 sessionStorage 를 흉내 낸다 — 쓰는 것은 세 가지뿐이다 */
const 상자 = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (k) => (상자.has(k) ? 상자.get(k) : null),
    setItem: (k, v) => 상자.set(k, String(v)),
    removeItem: (k) => 상자.delete(k),
  },
};

const 강남 = { name: '강남역', address: '서울 강남구', lat: 37.4979, lng: 127.0276 };
const 홍대 = { name: '홍대입구역', address: '서울 마포구', lat: 37.5569, lng: 126.9237 };
const 열쇠로 = (o) => `${o.name}@${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;

beforeEach(() => 상자.clear());

test('둔 적이 없으면 null — 다 뺀 것과 다른 말이다', () => {
  assert.equal(두고간것읽기(), null);
});

test('다 뺐으면 빈 배열 — null 이 아니다', () => {
  두고가기([], {});
  const 나온것 = 두고간것읽기();
  assert.notEqual(나온것, null, '다 뺀 것을 null 로 읽으면 기본 출발지가 되살아난다');
  assert.deepEqual(나온것.출발지들, []);
});

test('출발지와 수단이 함께 돌아온다', () => {
  const 수단들 = { [열쇠로(강남)]: 'car' };
  두고가기([강남, 홍대], 수단들);
  const 나온것 = 두고간것읽기();
  assert.deepEqual(나온것.출발지들.map((o) => o.name), ['강남역', '홍대입구역']);
  assert.deepEqual(나온것.수단들, 수단들);
});

test('수단을 안 주면 빈 것으로 담긴다 — 옛 홈 몫', () => {
  두고가기([강남]);
  assert.deepEqual(두고간것읽기().수단들, {});
});

test('옛 꼴(v1)은 읽지 않고 치운다', () => {
  상자.set(옛열쇠, JSON.stringify([강남, 홍대]));
  assert.equal(두고간것읽기(), null, 'v1 배열을 읽어 주면 갈아타는 갈래가 영영 안 죽는다');
  assert.equal(상자.has(옛열쇠), false, '찌꺼기를 남기면 옛 판으로 되돌렸을 때 말없이 얹힌다');
});

test('배열이 통째로 담겨 있어도(옛 꼴이 새 열쇠에) null 이다', () => {
  상자.set(열쇠, JSON.stringify([강남]));
  assert.equal(두고간것읽기(), null);
});

test('출발지 칸이 없으면 우리가 쓴 글이 아니다', () => {
  상자.set(열쇠, JSON.stringify({ 수단들: { a: 'car' } }));
  assert.equal(두고간것읽기(), null);
});

test('좌표 없는 출발지는 걸러진다 — 가운데 셈이 NaN 이 되면 지도가 통째로 빈다', () => {
  상자.set(열쇠, JSON.stringify({
    출발지들: [강남, { name: '망가진 곳' }, { name: '', lat: 1, lng: 2 }],
    수단들: {},
  }));
  assert.deepEqual(두고간것읽기().출발지들.map((o) => o.name), ['강남역']);
});

test('모르는 수단 값은 버린다 — 버려도 대중교통으로 읽힌다', () => {
  상자.set(열쇠, JSON.stringify({ 출발지들: [강남], 수단들: { a: 'car', b: '자전거', c: 3 } }));
  assert.deepEqual(두고간것읽기().수단들, { a: 'car' });
});

test('망가진 글자는 두고 간 것이 없는 셈 친다', () => {
  상자.set(열쇠, '{이건 JSON 이 아니다');
  assert.equal(두고간것읽기(), null);
});
