'use client';
/* 지도 오른쪽에 떠 있는 둥근 단추와 쪽지.

   ⚠ `bottom` 을 여기서도 CSS 에서도 안 준다 — `시트끌기.ts` 의 `배치()` 가 시트 높이에
   맞춰 매 프레임 넣는다. 시트를 올리면 단추도 같이 올라와야 하는데, 그 높이는
   CSS 가 알 수 없는 값이다. 두 곳이 같은 것을 다투면 끄는 동안 단추가 떤다. */

import type { RefObject } from 'react';
import s from './홈.module.css';

const 과녁 = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="7.6" />
    <path d="M12 1.4v3.2M12 19.4v3.2M22.6 12h-3.2M4.6 12H1.4" strokeLinecap="round" />
  </svg>
);

export default function 떠있는단추({ 현위치칸, 쪽지칸, 맞춤, 맞추기, 쪽지 }: {
  현위치칸: RefObject<HTMLButtonElement>;
  쪽지칸: RefObject<HTMLDivElement>;
  /* 지금 어느 범위로 맞춰 뒀나 — 아이콘 색과 바깥 링으로 두 단계를 가른다 */
  맞춤: '없음' | '첫곳' | '전체';
  맞추기: () => void;
  쪽지: string | null;
}) {
  return (
    <>
      <button ref={현위치칸} type="button" className={s.현위치} data-slot="현위치"
        data-맞춤={맞춤} onClick={맞추기}
        aria-label="지도 범위 맞추기" title="지도 범위 맞추기">
        {과녁}
      </button>
      {/* 어떤 범위로 맞췄는지 잠깐 알려 준다 — 아이콘만으로는 알 수 없다.
          `role="status"` 라 읽어 주는 기계에도 전해진다. */}
      <div ref={쪽지칸} className={s.쪽지} data-slot="알림쪽지" data-보임={쪽지 ? '예' : '아니오'}
        role="status" aria-live="polite">
        {쪽지}
      </div>
    </>
  );
}
