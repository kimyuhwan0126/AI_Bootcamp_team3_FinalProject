/* `lib/지도셈.ts` 회귀 시험 — **화면도 DB도 dev 서버도 필요 없다.**

   이 폴더의 다른 시험(`홈.mjs` · `탐색.mjs` · `css.mjs` …)은 살아 있는 dev 서버와 Neon 이
   있어야 돌아서 CI 가 못 돌린다(`.github/workflows/ci.yml` 머리말). 이건 순수 함수만
   건드리므로 CI 에서 그대로 돈다 — 홈에서 처음으로 PR 을 막을 수 있는 시험이다.

   돌리는 법:  npm test        (또는 node --test --experimental-strip-types tests/지도셈.mjs)
   ⚠ node 22 이상이 필요하다 — `.ts` 를 그대로 읽는 데 `--experimental-strip-types` 를 쓴다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, toPx, toLatLng, 상자, 여백맞추기 } from '../lib/지도셈.ts';

const 강남 = { lat: 37.497942, lng: 127.027621 };
const 홍대 = { lat: 37.557192, lng: 126.925381 };
const 판교 = { lat: 37.394776, lng: 127.111211 };
const 셋 = [강남, 홍대, 판교];

/** 지도 가운데가 c·배율 z 일 때 점 p 가 화면 어디에 찍히나 — 시험이 눈 대신 쓰는 자 */
const 화면자리 = (p, c, z, 크기) => {
  const a = toPx(p.lat, p.lng, z), b = toPx(c.lat, c.lng, z);
  return { x: 크기.폭 / 2 + (a.x - b.x), y: 크기.높이 / 2 + (a.y - b.y) };
};

test('toPx ↔ toLatLng 은 서로를 되돌린다', () => {
  for (const z of [4, 11, 17]) for (const p of 셋) {
    const { x, y } = toPx(p.lat, p.lng, z);
    const 되돌린 = toLatLng(x, y, z);
    assert.ok(Math.abs(되돌린.lat - p.lat) < 1e-9, `lat ${되돌린.lat} ≠ ${p.lat}`);
    assert.ok(Math.abs(되돌린.lng - p.lng) < 1e-9, `lng ${되돌린.lng} ≠ ${p.lng}`);
  }
});

test('배율이 하나 오르면 세계는 두 배가 된다', () => {
  const a = toPx(강남.lat, 강남.lng, 10), b = toPx(강남.lat, 강남.lng, 11);
  assert.ok(Math.abs(b.x - a.x * 2) < 1e-6);
  assert.ok(Math.abs(b.y - a.y * 2) < 1e-6);
  assert.equal(TILE, 256);
});

test('상자 — 한 곳뿐이어도 반지름이 0 이 되지 않는다', () => {
  /* 0 이면 배율이 Infinity 로 튄다. `지도.tsx` 가 쓰던 최소 반지름 0.004° 를 지킨다. */
  const b = 상자([강남]);
  assert.equal(b.반y, 0.004);
  assert.equal(b.반x, 0.004);
  assert.deepEqual(b.가운데, 강남);
});

test('상자 — 빈 목록은 null', () => {
  assert.equal(상자([]), null);
  assert.equal(여백맞추기([], { 폭: 400, 높이: 800 }, { 위: 0, 아래: 0, 좌: 0, 우: 0 }), null);
});

test('여백맞추기 — 사방이 같으면 상자 가운데가 곧 지도 가운데다', () => {
  /* 예전 `지도.tsx` 의 균등 여백(FIT=0.72)과 같은 답이어야 한다 —
     이 시험이 빨개지면 카드형 지도가 조용히 다르게 잡히기 시작한 것이다. */
  const 크기 = { 폭: 398, 높이: 340 };
  const 빈 = (1 - 0.72) / 2;
  const r = 여백맞추기(셋, 크기, {
    위: 크기.높이 * 빈, 아래: 크기.높이 * 빈, 좌: 크기.폭 * 빈, 우: 크기.폭 * 빈,
  });
  const c = 상자(셋).가운데;
  assert.ok(Math.abs(r.가운데.lat - c.lat) < 1e-9, `${r.가운데.lat} ≠ ${c.lat}`);
  assert.ok(Math.abs(r.가운데.lng - c.lng) < 1e-9);
  /* 2026-08-19 에 실제로 재 본 값. 예전 셈과 소수점 6자리까지 같았다. */
  assert.ok(Math.abs(r.배율 - 10.716045) < 1e-5, `배율 ${r.배율}`);
});

test('여백맞추기 — 상자는 가려지지 않는 자리의 한가운데에 놓인다', () => {
  /* 홈 셸의 실제 모양: 위에 검색바+슬라이더+기준줄, 아래에 바텀시트+탭바.
     위아래를 다른 만큼 덮으므로 화면 한가운데에 놓으면 핀이 시트 밑으로 들어간다. */
  const 크기 = { 폭: 402, 높이: 874 };
  const 여백 = { 위: 190, 아래: 340, 좌: 24, 우: 24 };
  const r = 여백맞추기(셋, 크기, 여백);
  const 보이는가운데 = {
    x: (여백.좌 + (크기.폭 - 여백.우)) / 2,
    y: (여백.위 + (크기.높이 - 여백.아래)) / 2,
  };
  const s = 화면자리(상자(셋).가운데, r.가운데, r.배율, 크기);
  assert.ok(Math.abs(s.x - 보이는가운데.x) < 0.01, `x ${s.x} ≠ ${보이는가운데.x}`);
  assert.ok(Math.abs(s.y - 보이는가운데.y) < 0.01, `y ${s.y} ≠ ${보이는가운데.y}`);
});

test('여백맞추기 — 점이 하나도 가려진 자리로 나가지 않는다', () => {
  const 크기 = { 폭: 402, 높이: 874 };
  const 여백 = { 위: 190, 아래: 340, 좌: 24, 우: 24 };
  const r = 여백맞추기(셋, 크기, 여백);
  for (const p of 셋) {
    const s = 화면자리(p, r.가운데, r.배율, 크기);
    assert.ok(s.x >= 여백.좌 - 0.5 && s.x <= 크기.폭 - 여백.우 + 0.5, `x ${s.x} 가 가려진다`);
    assert.ok(s.y >= 여백.위 - 0.5 && s.y <= 크기.높이 - 여백.아래 + 0.5, `y ${s.y} 가 가려진다`);
  }
});

test('여백맞추기 — 사방 균등으로 잡으면 실제로 하나가 가려진다 (비대칭이 필요한 까닭)', () => {
  /* 이 시험은 '고치기 전'을 못 박아 둔 것이다 — 비대칭 여백을 누가 되돌리면
     위 시험이 빨개지고 이 시험이 그 까닭을 말해 준다. */
  const 크기 = { 폭: 402, 높이: 874 };
  const 여백 = { 위: 190, 아래: 340, 좌: 24, 우: 24 };
  const 빈 = (1 - 0.72) / 2;
  const 옛 = 여백맞추기(셋, 크기, {
    위: 크기.높이 * 빈, 아래: 크기.높이 * 빈, 좌: 크기.폭 * 빈, 우: 크기.폭 * 빈,
  });
  const 가려진수 = 셋.filter((p) => {
    const s = 화면자리(p, 옛.가운데, 옛.배율, 크기);
    return s.y < 여백.위 || s.y > 크기.높이 - 여백.아래;
  }).length;
  assert.equal(가려진수, 1);
});

test('여백맞추기 — 여백이 상자보다 커도 안 터진다', () => {
  /* 아주 작은 화면 + 가득 올린 시트. 보이는 자리가 0 이 되면 배율이 -Infinity 로 간다. */
  const r = 여백맞추기(셋, { 폭: 200, 높이: 300 }, { 위: 200, 아래: 200, 좌: 150, 우: 150 });
  assert.ok(Number.isFinite(r.배율), `배율 ${r.배율}`);
  assert.ok(Number.isFinite(r.가운데.lat) && Number.isFinite(r.가운데.lng));
});

test('여백맞추기 — 배율은 4~17 을 벗어나지 않는다', () => {
  const 아주넓게 = 여백맞추기(
    [{ lat: 33.4996, lng: 126.5312 }, { lat: 38.2070, lng: 128.5918 }],
    { 폭: 100, 높이: 100 }, { 위: 0, 아래: 0, 좌: 0, 우: 0 });
  const 아주좁게 = 여백맞추기([강남], { 폭: 4000, 높이: 4000 }, { 위: 0, 아래: 0, 좌: 0, 우: 0 });
  assert.ok(아주넓게.배율 >= 4, `${아주넓게.배율}`);
  assert.ok(아주좁게.배율 <= 17, `${아주좁게.배율}`);
});
