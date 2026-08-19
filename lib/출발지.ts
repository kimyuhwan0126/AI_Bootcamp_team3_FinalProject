/* 출발지를 다루는 잣대 — 같은 곳인가 · 몇 곳까지 · 가운데는 어디인가.

   홈(`app/탐색/탐색.tsx`)과 모임 화면(`app/m/[code]/ui.tsx`)이 **같은 답**을 내야 하는
   셈들이다. 특히 `가운데` 는 그 파일 주석이 못 박아 뒀다 —
   "두 화면이 다른 가운데를 말하면 홈에서 본 자리와 모임에서 여는 자리가 어긋난다."
   베껴 두면 언젠가 한쪽만 고친다. */

import type { Origin } from '@/app/originfield';
import { 한국안 } from './한국상자';

export { 한국안 };

/* 예전판과 같은 한도 — 모임 정원도 8이다 */
export const 최대출발지 = 8;

/* 같은 곳을 두 번 넣지 않는다. 이름만 보면 '스타벅스'가 하나뿐이 되고,
   좌표만 보면 같은 건물의 다른 출입구가 두 곳이 된다 — 둘을 함께 본다. */
export const 열쇠 = (o: { name: string; lat: number; lng: number }) =>
  `${o.name}@${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;

/** 모두의 출발지 가운데(무게중심). 한 곳도 없으면 null. */
export function 가운데(출발지들: { lat: number; lng: number }[]) {
  if (!출발지들.length) return null;
  return {
    lat: 출발지들.reduce((a, o) => a + o.lat, 0) / 출발지들.length,
    lng: 출발지들.reduce((a, o) => a + o.lng, 0) / 출발지들.length,
  };
}

/** 이미 넣은 목록에 이 곳을 더할 수 있는가 — 안 되면 사람에게 할 말을 돌려준다. */
export function 더할수있나(있는것: Origin[], 새것: Origin): string | null {
  if (!한국안(새것.lat, 새것.lng)) return '한국 안에서만 가운데를 잡아 줘요';
  if (있는것.length >= 최대출발지) return `출발지는 ${최대출발지}곳까지 넣을 수 있어요`;
  if (있는것.some((p) => 열쇠(p) === 열쇠(새것))) return '이미 넣은 출발지예요';
  return null;
}
