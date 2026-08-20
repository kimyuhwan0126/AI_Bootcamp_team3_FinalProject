'use client';
/* 지도 오른쪽에 떠 있는 둥근 단추와 쪽지.

   ⚠ `bottom` 을 여기서도 CSS 에서도 안 준다 — `시트끌기.ts` 의 `배치()` 가 시트 높이에
   맞춰 매 프레임 넣는다. 시트를 올리면 단추도 같이 올라와야 하는데, 그 높이는
   CSS 가 알 수 없는 값이다. 두 곳이 같은 것을 다투면 끄는 동안 단추가 떤다. */

import type { RefObject } from 'react';
import s from './홈.module.css';

/* 나침반 — '둘레를 둘러본다'는 뜻이다. 돋보기는 위 검색바가 이미 쓰고 있어
   같은 그림을 두 자리에 두면 무엇이 다른 일인지 안 읽힌다. */
const 나침반 = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" />
    <path d="M15.2 8.8l-2 4.4-4.4 2 2-4.4z" fill="currentColor" stroke="none" />
  </svg>
);

const 과녁 = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="7.6" />
    <path d="M12 1.4v3.2M12 19.4v3.2M22.6 12h-3.2M4.6 12H1.4" strokeLinecap="round" />
  </svg>
);

export default function 떠있는단추({
  현위치칸, 쪽지칸, 탐색칸, 맞춤, 다음, 맞추기, 쪽지, 탐색보임, 탐색, 탐색누름,
}: {
  현위치칸: RefObject<HTMLButtonElement>;
  쪽지칸: RefObject<HTMLDivElement>;
  탐색칸: RefObject<HTMLButtonElement>;
  /* 지금 어느 범위로 맞춰 뒀나 — 아이콘 색과 바깥 링으로 두 단계를 가른다.
     지도를 손으로 만지면 '없음'으로 풀려 아이콘도 기본 상태로 돌아온다. */
  맞춤: '없음' | '내자리' | '전체';
  /* 지금 누르면 어디로 가나 — 이름표는 **다음에 일어날 일**을 말한다.
     출발지가 1곳 이하면 '전체' 자리가 없어 늘 '내자리'다(셸이 셈한다). */
  다음: '내자리' | '전체';
  맞추기: () => void;
  쪽지: string | null;
  /* 중간지점 핀이 지도에 있나 — 없으면 탐색 단추를 감춘다(2026-08-20 사용자 요청).
     ⚠ 안 그리는 대신 `hidden` 으로 감춘다: 시트끌기.ts 의 `배치()` 가 그 표를 보고
     쪽지를 단추 위에 다시 쌓는다(`탐색 && !탐색.hidden`). ref 가 늘 살아 있어야 한다. */
  탐색보임: boolean;
  탐색: boolean;
  탐색누름: () => void;
}) {
  return (
    <>
      <button ref={현위치칸} type="button" className={s.현위치} data-slot="현위치"
        data-맞춤={맞춤} onClick={맞추기}
        aria-label={다음 === '전체' ? '지도를 출발지 전체에 맞추기' : '지도를 지금 있는 자리로 맞추기'}
        title={다음 === '전체' ? '출발지 전체 보기' : '지금 있는 자리'}>
        {과녁}
      </button>
      {/* 주변 탐색 — 현위치 단추 **위**에 쌓인다(시트끌기.ts 의 `배치()`).
          `bottom` 은 여기서도 CSS 에서도 안 준다(위 머리말). */}
      <button ref={탐색칸} type="button" className={s.탐색단추} data-slot="탐색단추"
        hidden={!탐색보임} aria-pressed={탐색} onClick={탐색누름}
        aria-label={탐색 ? '주변 탐색 끄기' : '중간지점 둘레 둘러보기'}
        title={탐색 ? '주변 탐색 끄기' : '주변 탐색'}>
        {나침반}
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
