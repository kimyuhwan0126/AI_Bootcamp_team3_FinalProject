/* `lib/장소갈래.ts` 회귀 시험 — 화면도 DB도 dev 서버도 필요 없다(`tests/지도셈.mjs` 머리말 참고).

   무엇을 지키는가 둘 —
     ① 카카오가 막혀 OSM 으로 내려가도 갈래 칩이 안 빈다(한글 이름 ↔ 영어 태그).
     ② **술집이 음식점에 섞이지 않는다.** 카카오는 술집을 갈래 코드로 안 주고
        상세 분류명("음식점 > 술집 > …") 안에만 넣어 준다 — 상세를 안 보면 술집 칩이
        늘 비고, 그 자리들이 전부 음식점 칩에 섞인다. 눈으로는 못 알아챈다.

   돌리는 법:  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 갈래고르기, 아이콘고르기, 색고르기, 갈래들, 모름아이콘, 모름색 } from '../lib/장소갈래.ts';

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

test('아이콘 — 갈래마다 하나씩 있고, 모르는 갈래도 그릴 것이 있다', () => {
  /* 2026-08-20 에 이모지에서 선 그림(SVG path)으로 바꿨다 — 값을 눈으로 못 보므로
     '비어 있지 않은가'와 '갈래마다 서로 다른가'로 지킨다. 빈 아이콘은 지도에서
     아무것도 안 그려진 동그라미가 된다. */
  for (const g of 갈래들) {
    const 길들 = 아이콘고르기(g.이름);
    assert.ok(길들.length, `${g.이름} 에 아이콘 길이 없다`);
    assert.ok(길들.every((d) => typeof d === 'string' && d.trim().length > 3), `${g.이름} 아이콘 길이 비었다`);
  }
  const 지문 = 갈래들.map((g) => g.아이콘.join('|'));
  assert.equal(new Set(지문).size, 지문.length, '두 갈래가 같은 그림을 쓴다');
  /* 갈래를 모르는 곳도 지도에는 선다 — 빈손이면 안 된다 */
  assert.equal(아이콘고르기(null), 모름아이콘);
  assert.equal(아이콘고르기(갈래고르기('약국')), 모름아이콘);
  assert.ok(모름아이콘.length);
});

test('색 — 갈래마다 다르고, 시그니처 파랑과 안 겹친다', () => {
  /* 2026-08-20 사용자 요청으로 표식이 갈래마다 다른 색이 됐다. 지켜야 할 것 셋 —
     ① 갈래마다 하나씩 있다  ② 서로 다르다  ③ `--brand`(중간지점 말풍선) 와 안 겹친다.
     ③ 을 어기면 지도에서 '이 화면이 잡아 준 자리'와 '둘레의 가게'가 같은 색이 된다. */
  const 색들 = 갈래들.map((g) => 색고르기(g.이름));
  for (const [i, c] of 색들.entries()) {
    assert.match(c, /^#[0-9a-f]{6}$/, `${갈래들[i].이름} 색이 6자리 hex 가 아니다`);
  }
  assert.equal(new Set(색들).size, 색들.length, '두 갈래가 같은 색을 쓴다');
  assert.ok(!색들.includes('#2f6bff'), '갈래 색이 시그니처 --brand 와 겹친다');
  /* 모르는 갈래도 색이 있어야 한다 — 없으면 CSS 의 `var(--c)` 가 비어 투명해진다 */
  assert.equal(색고르기(null), 모름색);
  assert.equal(색고르기(갈래고르기('약국')), 모름색);
  assert.ok(!색들.includes(모름색), '모름색이 어느 갈래 색과 겹친다');
});

test('갈래마다 물어볼 길이 하나씩 있다 — 코드든 낱말이든', () => {
  /* 둘 다 없으면 그 갈래만 조용히 안 물어보게 된다 — 화면에서는 '그 동네에 없다'로 보인다 */
  for (const g of 갈래들) assert.ok(g.코드 || g.낱말, `${g.이름} 에 코드도 낱말도 없다`);
  const 코드들 = 갈래들.map((g) => g.코드).filter(Boolean);
  assert.equal(new Set(코드들).size, 코드들.length);
});
