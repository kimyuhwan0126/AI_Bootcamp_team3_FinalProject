/* 지도 셈 — 웹 메르카토르 좌표 바꾸기와 '이 점들이 다 보이게 맞추기'.

   바깥으로 나가는 것도 DOM 도 없다 — 순수 함수만 있다. 그래야 두 가지가 된다.
     ① 카카오와 OSM 폴백이 **같은 셈**을 쓴다. 갈라 두면 같은 출발지가 두 지도에서
        다른 자리에 찍히고, 어느 쪽이 맞는지 눈으로는 판별이 안 된다.
     ② 시험이 화면 없이 잰다. 여백 셈은 눈으로 보면 "대충 맞는 것 같다" 밖에 안 나온다.

   `app/탐색/지도.tsx` 의 `TILE`·`toPx`·`toLatLng`·`FIT` 과 그 파일의 맞춤 효과에서 옮겨 왔다. */

export type 점 = { lat: number; lng: number };

export const TILE = 256;

/** 위경도 → 배율 z 에서의 세계 픽셀 자리 */
export const toPx = (lat: number, lng: number, z: number) => {
  const n = 2 ** z * TILE;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  };
};

/** 세계 픽셀 자리 → 위경도 */
export const toLatLng = (x: number, y: number, z: number): 점 => {
  const n = 2 ** z * TILE;
  const k = Math.PI - (2 * Math.PI * y) / n;
  return {
    lng: (x / n) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))),
  };
};

/* 한 곳뿐이거나 다 붙어 있으면 상자가 0이라 배율이 끝까지 튄다 — 지역만큼은 남긴다.
   `지도.tsx` 가 쓰던 값 그대로다(0.004° ≈ 440m). */
const 최소반 = 0.004;
/* 배율 한도 — 4 보다 작으면 한반도가 점이 되고, 17 보다 크면 타일이 없다 */
const 배율최소 = 4, 배율최대 = 17;

/** 점들을 감싸는 상자의 가운데와 반지름(도 단위). 빈 목록이면 null. */
export function 상자(점들: 점[]) {
  if (!점들.length) return null;
  const la = 점들.map((p) => p.lat), ln = 점들.map((p) => p.lng);
  const 가운데: 점 = {
    lat: (Math.min(...la) + Math.max(...la)) / 2,
    lng: (Math.min(...ln) + Math.max(...ln)) / 2,
  };
  return {
    가운데,
    반y: Math.max((Math.max(...la) - Math.min(...la)) / 2, 최소반),
    반x: Math.max((Math.max(...ln) - Math.min(...ln)) / 2, 최소반),
  };
}

export type 여백 = { 위: number; 아래: number; 좌: number; 우: number };

/* 예전 `지도.tsx` 는 여백을 `FIT = 0.72` 하나로 잡았다 — 사방이 똑같이 14% 씩.
   전체화면 지도에서는 그걸로 안 된다: 위에는 검색바+출발지 슬라이더가, 아래에는
   바텀시트와 탭바가 **서로 다른 만큼** 덮는다. 그래서 여백을 네 변 따로 받는다.
   전처럼 쓰고 싶으면 네 변에 같은 값을 주면 된다. */

/**
 * 점들이 **가려지지 않는 자리** 안에 다 들어오도록 지도의 가운데와 배율을 고른다.
 *
 * 상자를 화면 한가운데가 아니라 '남는 자리'의 한가운데에 놓는다 —
 * 안 그러면 위아래를 다른 만큼 덮었을 때 핀이 시트 밑으로 반쯤 들어간다.
 * (실제로 났던 사고의 전체화면판: OSM 폴백만 가운데를 상자에 안 넣어
 *  AI 추천 핀이 화면 밖에 있었다 — `지도.tsx` 2026-08-22 주석.)
 *
 * @param 상자크기 지도 상자의 픽셀 크기
 * @param 안여백   네 변이 각각 몇 픽셀씩 가려지는가
 */
export function 여백맞추기(점들: 점[], 상자크기: { 폭: number; 높이: number }, 안여백: 여백) {
  const b = 상자(점들);
  if (!b) return null;

  /* 남는 자리. 여백이 상자보다 크면(아주 작은 화면 + 큰 시트) 0 이 되어 배율이 -Infinity 로
     간다 — 최소 1px 로 못 박아 NaN 이 아래로 새지 않게 한다. */
  const 보이는폭 = Math.max(1, 상자크기.폭 - 안여백.좌 - 안여백.우);
  const 보이는높이 = Math.max(1, 상자크기.높이 - 안여백.위 - 안여백.아래);

  /* 배율 0 에서 상자가 몇 픽셀인지 재고, 남는 자리에 맞을 때까지 키운다 */
  const 왼위 = toPx(b.가운데.lat + b.반y, b.가운데.lng - b.반x, 0);
  const 오른아래 = toPx(b.가운데.lat - b.반y, b.가운데.lng + b.반x, 0);
  const 맞는배율 = Math.log2(Math.min(
    보이는폭 / (오른아래.x - 왼위.x),
    보이는높이 / (오른아래.y - 왼위.y),
  ));
  const 배율 = Math.max(배율최소, Math.min(배율최대, 맞는배율));

  /* 상자 가운데를 '남는 자리의 가운데'에 놓는다.
     남는 자리의 가운데는 화면 가운데에서 이만큼 벗어나 있다 — 지도 가운데는 그 반대로 민다. */
  const 밀기x = (안여백.좌 - 안여백.우) / 2;
  const 밀기y = (안여백.위 - 안여백.아래) / 2;
  const 상자px = toPx(b.가운데.lat, b.가운데.lng, 배율);
  const 가운데 = toLatLng(상자px.x - 밀기x, 상자px.y - 밀기y, 배율);

  return { 가운데, 배율 };
}
