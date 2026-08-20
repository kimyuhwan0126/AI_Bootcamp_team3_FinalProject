/* `lib/장소갈래.ts` 회귀 시험 — 화면도 DB도 dev 서버도 필요 없다(`tests/지도셈.mjs` 머리말 참고).

   무엇을 지키는가 둘 —
     ① 카카오가 막혀 OSM 으로 내려가도 갈래 칩이 안 빈다(한글 이름 ↔ 영어 태그).
     ② **술집이 음식점에 섞이지 않는다.** 카카오는 술집을 갈래 코드로 안 주고
        상세 분류명("음식점 > 술집 > …") 안에만 넣어 준다 — 상세를 안 보면 술집 칩이
        늘 비고, 그 자리들이 전부 음식점 칩에 섞인다. 눈으로는 못 알아챈다.

   돌리는 법:  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 갈래고르기, 갈래그림, 갈래들, 모름그림 } from '../lib/장소갈래.ts';

test('카카오가 준 갈래 이름을 그대로 알아본다', () => {
  for (const g of 갈래들.filter((x) => x.코드)) assert.equal(갈래고르기(g.이름), g.이름);
});

test('OSM 태그도 같은 갈래로 모인다 — 폴백이 떠도 칩이 안 빈다', () => {
  assert.equal(갈래고르기('restaurant'), '음식점');
  assert.equal(갈래고르기('fast_food'), '음식점');
  assert.equal(갈래고르기('cafe'), '카페');
  assert.equal(갈래고르기('park'), '관광명소');
  assert.equal(갈래고르기('parking'), '주차장');
});

test('술집 — 상세 분류명으로 음식점에서 갈라낸다', () => {
  /* 카카오는 갈래 이름을 늘 '음식점'으로 준다. 상세를 안 보면 술집 칩이 통째로 빈다. */
  assert.equal(갈래고르기('음식점', '음식점 > 술집 > 호프,요리주점'), '술집');
  assert.equal(갈래고르기('음식점', '음식점 > 술집 > 포장마차'), '술집');
  /* 상세가 있어도 술집이 아니면 그대로 음식점이다 */
  assert.equal(갈래고르기('음식점', '음식점 > 한식 > 육류,고기'), '음식점');
  /* 상세가 아예 없으면(옛 캐시) 갈래 이름으로 물러난다 — 터지지 않는다 */
  assert.equal(갈래고르기('음식점'), '음식점');
  assert.equal(갈래고르기('음식점', null), '음식점');
});

test('OSM 의 bar·pub 도 술집이다 — 폴백에서도 갈래가 안 어긋난다', () => {
  assert.equal(갈래고르기('bar'), '술집');
  assert.equal(갈래고르기('pub'), '술집');
});

test('대소문자가 섞여 와도 걸린다 — 태그는 손으로 적힌 값이다', () => {
  assert.equal(갈래고르기('Cafe'), '카페');
  assert.equal(갈래고르기('RESTAURANT'), '음식점');
});

test('모르는 말은 null — 버리지 않는다', () => {
  /* 없애 버리면 지도에 있는 자리가 없는 자리가 된다. 갈래 칩에서만 빠진다. */
  assert.equal(갈래고르기('약국'), null);
  assert.equal(갈래고르기('hospital'), null);
  assert.equal(갈래고르기(''), null);
  assert.equal(갈래고르기(null), null);
  assert.equal(갈래고르기(undefined), null);
});

test('핀 그림 — 모르는 갈래도 그림이 있다', () => {
  assert.equal(갈래그림('카페'), '☕');
  assert.equal(갈래그림('park'), '🏞');
  assert.equal(갈래그림('음식점', '음식점 > 술집 > 호프,요리주점'), '🍻');
  assert.equal(갈래그림('약국'), 모름그림);
});

test('갈래마다 물어볼 길이 하나씩 있다 — 코드든 낱말이든', () => {
  /* 둘 다 없으면 그 갈래만 조용히 안 물어보게 된다 — 화면에서는 '그 동네에 없다'로 보인다 */
  for (const g of 갈래들) assert.ok(g.코드 || g.낱말, `${g.이름} 에 코드도 낱말도 없다`);
  const 코드들 = 갈래들.map((g) => g.코드).filter(Boolean);
  assert.equal(new Set(코드들).size, 코드들.length);
});
