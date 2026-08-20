/* 갈래 아이콘을 리액트로 그린다 — 갈래 칩(윗칸) · 시트 요약 줄 · 장소 시트가 쓴다.

   모양(길)은 여기 없다. `lib/장소갈래.ts` 한 곳이 쥔다 — 지도 핀은 리액트 밖(카카오
   CustomOverlay)이라 같은 길을 `app/홈/표식.ts` 가 DOM 으로 그린다. 두 곳이 그리되
   **보고 있는 표는 하나**라야 칩과 핀이 안 갈라진다.

   색은 안 정한다 — `currentColor` 다. 부르는 자리가 정한다(칩은 글자색, 지도 핀은 흰색). */

import { 아이콘상자, type 아이콘 } from '@/lib/장소갈래';

export default function 갈래아이콘({ 아이콘: 길들, 크기 = 18, 두께 = 2 }: {
  아이콘: 아이콘;
  크기?: number;
  /** 작게 그릴수록 획이 두꺼워야 뭉개지지 않는다 — 부르는 쪽이 정한다 */
  두께?: number;
}) {
  return (
    <svg width={크기} height={크기} viewBox={아이콘상자} fill="none" stroke="currentColor"
      strokeWidth={두께} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {길들.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
