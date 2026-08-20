'use client';
/* 카카오맵 길찾기로 넘기는 주소를 짓는다 — 출발지 시트의 '카카오맵에서 길찾기'
   (2026-08-20 사용자 요청).

   ── 왜 이렇게 복잡한가 ────────────────────────────────────
   카카오맵 웹은 길찾기 주소에 **WGS84(위경도)를 안 받는다.** `rt` 파라미터는
   WCONGNAMUL — 카카오 제 좌표계다. 그래서 넘기기 전에 한 번 바꿔야 하고, 바꿔 주는
   것은 지도 SDK 의 `services` 라이브러리뿐이다(app/홈/지도.tsx 가 `libraries=services`
   로 부른다). 그래서 이 함수는 **비동기**이고, SDK 가 없으면 null 이다.
   ⚠ 우리 손으로 투영식을 옮겨 적지 않는다 — 몇 백 미터 틀린 길찾기는 안 뜨는 것보다 나쁘다.

   ── 무엇을 재 봤나 (2026-08-20, 실제로 열어서 확인) ────────
     target=car            자동차 경로가 **바로** 나온다. 소요시간·통행료까지.
     target=walk           도보 경로가 바로 나온다(우리는 안 쓴다 — 수단이 둘뿐이다).
     target=publictransit  대중교통 길찾기 화면이 열리고 **출발·도착 칸이 채워져 있다.**
                           다만 결과는 자동으로 안 돈다 — 사람이 한 번 더 눌러야 한다.
                           `rtIds`·`rtTypes` 를 붙여야 '대중교통'으로 열린다(안 붙이면
                           자동차로 열렸다). 카카오가 그렇게 만들어 둔 것이라 우리 쪽에서
                           더 할 수 있는 것이 없다.
   그래서 자동차는 결과까지, 대중교통은 결과 직전까지 간다. 둘 다 손으로 주소를 다시
   적는 것보다는 훨씬 가깝다.

   ⚠ 앱 스킴(`kakaomap://route?...&by=PUBLICTRANSIT`)은 안 쓴다 — 그것이면 대중교통도
   결과까지 가지만, 카카오맵 앱이 없는 기기(데스크톱 · 앱 안 깐 폰)에서는 눌러도
   **아무 일도 안 일어난다.** 웹 주소는 어디서든 열린다. */

import type { Transport } from '../originfield';

type 점 = { lat: number; lng: number };

/* 카카오가 파라미터로 받는 수단 이름. 우리 수단(`lib/이동수단.ts`)은 둘뿐이다.
   ⚠ `lib/수단표기.ts` 의 `수단이름`(사람에게 보이는 '대중교통'·'자동차')과 **다른 표다** —
   이름을 갈라 둔다: 한 이름으로 두 표를 부르면 어느 쪽을 고칠지 매번 헷갈린다. */
const 카카오수단: Record<Transport, string> = { car: 'car', transit: 'publictransit' };

/** 위경도를 카카오 제 좌표(WCONGNAMUL)로. SDK 가 없거나 못 바꾸면 null. */
function 좌표바꾸기(p: 점): Promise<{ x: number; y: number } | null> {
  const k = (window as any).kakao;
  const 서비스 = k?.maps?.services;
  if (!서비스?.Geocoder || !서비스?.Coords) return Promise.resolve(null);
  return new Promise((풀기) => {
    try {
      new 서비스.Geocoder().transCoord(
        p.lng, p.lat,
        (결과: { x: number; y: number }[], 상태: string) => {
          풀기(상태 === 서비스.Status.OK && 결과?.[0] ? { x: 결과[0].x, y: 결과[0].y } : null);
        },
        { input_coord: 서비스.Coords.WGS84, output_coord: 서비스.Coords.WCONGNAMUL },
      );
    } catch { 풀기(null); }
  });
}

/**
 * 카카오맵 길찾기 주소. 못 지으면 null — 부르는 쪽은 그때 단추를 안 그린다.
 * 거짓 주소를 내미느니 단추가 없는 편이 낫다.
 */
export async function 길찾기주소(
  출발: 점 & { 이름: string },
  도착: 점 & { 이름: string },
  수단: Transport,
): Promise<string | null> {
  const [ㅅ, ㄷ] = await Promise.all([좌표바꾸기(출발), 좌표바꾸기(도착)]);
  if (!ㅅ || !ㄷ) return null;
  const q = new URLSearchParams({
    map_type: 'TYPE_MAP',
    target: 카카오수단[수단],
    rt: `${ㅅ.x},${ㅅ.y},${ㄷ.x},${ㄷ.y}`,
    rt1: 출발.이름,
    rt2: 도착.이름,
    /* 둘 다 빈 채로 쉼표만 — 이 둘이 있어야 대중교통으로 열린다(위 머리말).
       자동차에는 있으나 없으나 같다: 한 가지 꼴로 두어 가르는 자리를 안 만든다. */
    rtIds: ',',
    rtTypes: ',',
  });
  return `https://map.kakao.com/?${q}`;
}
