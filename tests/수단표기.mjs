/* `lib/수단표기.ts` 회귀 시험 — 화면도 DB도 dev 서버도 필요 없다(`tests/지도셈.mjs` 머리말 참고).

   무엇을 지키는가: **칩에 적히는 말은 사람이 고른 카테고리 그대로다.**
   전에는 카카오가 준 경로를 읽어 '지하철'·'버스'로 갈라 적었는데, 고른 값(대중교통)과
   적히는 말(지하철)이 달라 사람이 되짚게 됐다 — 2026-08-20 에 사람이 정해 그만뒀다.
   이 시험은 그 결정이 조용히 뒤집히지 않게 못 박아 둔다.

   돌리는 법:  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 수단표기, 수단이름 } from '../lib/수단표기.ts';

test('고른 카테고리를 그대로 적는다', () => {
  assert.equal(수단표기('transit'), '대중교통');
  assert.equal(수단표기('car'), '자동차');
});

test('고르는 자리에 쓰는 이름과 칩에 적히는 말이 같다', () => {
  /* 세그 단추(시트내용_출발지.tsx)와 칩(윗칸.tsx)이 다른 말을 쓰면,
     고른 것과 적힌 것이 달라 보인다 — 이 시험이 둘을 한 표에 묶어 둔다. */
  assert.equal(수단표기('transit'), 수단이름.transit);
  assert.equal(수단표기('car'), 수단이름.car);
});
