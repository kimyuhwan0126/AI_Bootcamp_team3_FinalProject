'use client';
/* 홈 상단 — 지도 위에 늘 떠 있는 것들.

   검색바(+워드마크) · 검색 결과 패널 · 출발지 칩 줄 · 중간지점 기준 단추 · 안내 한 줄.

   ⚠ 이 띠 자체는 `pointer-events:none` 이다(홈.module.css 의 `.윗칸`). 줄과 줄 **사이**
   빈 자리로 지도를 눌러야 하기 때문이다 — 안 그러면 지도 위쪽 3분의 1 에서 탭이 통째로
   사라진다(globals.css:59–62 의 `.acts` 가 같은 사고를 겪고 남긴 교훈).

   ⚠ 검색은 `lib/장소찾기.ts` 를 쓴다 — `app/originfield.tsx`(만들기·참여·내정보)와 **같은
   함수**다. 갈라 두면 카카오가 죽었을 때 어느 화면은 말하고 어느 화면은 조용해진다. */

import { useEffect, useRef, useState } from 'react';
import type { Origin } from '../originfield';
import { 장소찾기, 최소글자, type 찾은곳 } from '@/lib/장소찾기';
import { 출발지색고르기 } from './핀그림';
import s from './홈.module.css';

/* 칩 색은 `./핀그림.ts` 에 있다 — 지도 핀과 **같은 색**이어야 '이 칩이 저 핀'이 읽힌다.
   전에는 여기 있었는데 지도가 같은 표를 필요로 하면서 한 곳으로 모았다. */

const 돋보기 = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
  </svg>
);

export default function 윗칸({
  출발지들, 고름, 빼기, 초점, 칩누름, 열린칩 = -1,
  기준, 기준바꾸기, 안내,
}: {
  출발지들: Origin[];
  고름: (o: Origin) => void;
  빼기: (i: number) => void;
  /* 지금 눈이 가 있는 칩 — 지도가 그 자리로 가 있다는 표시다 */
  초점: number;
  /* 거듭 누르면 3단으로 돈다(지도 이동 → 시트 열기 → 시트 내리기). 셸이 그 단계를 쥔다. */
  칩누름: (i: number) => void;
  /* 지금 시트가 보여 주고 있는 출발지. 칩에 '열려 있다'고 표시한다. */
  열린칩?: number;
  기준: '거리' | 'AI';
  기준바꾸기: () => void;
  안내: string | null;
}) {
  const [말, set말] = useState('');
  const [결과, set결과] = useState<찾은곳[] | null>(null);
  const [문제, set문제] = useState<string | null>(null);
  const [열림, set열림] = useState(false);
  const 칸 = useRef<HTMLDivElement>(null);
  const 시계 = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 타이핑마다 부르지 않는다 — 손을 멈추면 찾는다(originfield 와 같은 350ms). */
  useEffect(() => {
    if (시계.current) clearTimeout(시계.current);
    const 다듬은 = 말.trim();
    if (다듬은.length < 최소글자) { set결과(null); set문제(null); return; }
    시계.current = setTimeout(async () => {
      const { 곳들, 문제: 탈 } = await 장소찾기(다듬은);
      set문제(탈);
      set결과(곳들);
    }, 350);
    return () => { if (시계.current) clearTimeout(시계.current); };
  }, [말]);

  /* 바깥을 누르면 패널이 닫힌다 — 키보드만 쓰는 사람은 Esc 로 닫는다(아래 onKeyDown).
     캡처 단계에서 듣는다: 패널 안 단추가 제 일을 하기 전에 닫히면 안 되므로 자기 칸은 뺀다. */
  useEffect(() => {
    if (!열림) return;
    const 손 = (e: PointerEvent) => {
      if (!칸.current?.contains(e.target as Node)) set열림(false);
    };
    document.addEventListener('pointerdown', 손, true);
    return () => document.removeEventListener('pointerdown', 손, true);
  }, [열림]);

  const 골랐다 = (곳: 찾은곳) => {
    고름(곳);
    /* 방금 넣은 곳이 목록에 계속 떠 있으면, 그것을 또 눌렀을 때 아무 일도 안 일어난다 */
    set말(''); set결과(null); set열림(false);
  };

  const 결과있나 = 말.trim().length >= 최소글자;

  return (
    <div className={s.윗칸} data-slot="윗칸">
      <div className={s.검색칸} ref={칸}>
        <div className={s.검색바}>
          {돋보기}
          <input
            id="og"                       /* 지금 시험이 붙잡는 이름 — 옮겨도 그대로 둔다 */
            data-slot="홈검색칸"
            type="search" value={말}
            placeholder="어디에서 출발하시나요?"
            aria-label="출발지 지역 검색"
            autoComplete="off" role="combobox"
            aria-expanded={열림 && 결과있나}
            aria-controls="홈검색패널"
            onChange={(e) => { set말(e.target.value); set열림(true); }}
            onFocus={() => set열림(true)}
            onKeyDown={(e) => { if (e.key === 'Escape') { set열림(false); e.currentTarget.blur(); } }}
          />
          {/* 로고는 이름이지 글이 아니다 — 옛 머리말(app/홈머리말.tsx)에서 여기로 왔다.
              `data-slot` 을 그대로 물려받아 시험이 워드마크를 계속 찾을 수 있게 한다. */}
          <span className={s.워드마크} data-slot="홈머리말" aria-hidden="true">MOIMER</span>
        </div>

        {열림 && 결과있나 && (
          <div className={s.검색패널} id="홈검색패널" data-slot="홈검색패널" role="listbox" aria-label="검색 결과">
            {문제 && <div className={s.패널빔}>{문제}</div>}
            {!문제 && 결과 && !결과.length && (
              <div className={s.패널빔}>찾는 곳이 없어요 — 가까운 역 이름으로 해보세요.</div>
            )}
            {!문제 && !결과 && <div className={s.패널빔}>찾는 중이에요…</div>}
            {!문제 && (결과 ?? []).slice(0, 6).map((곳) => (
              <button key={곳.id} type="button" className={s.패널줄} data-slot="홈검색줄"
                role="option" aria-selected={false} onClick={() => 골랐다(곳)}>
                <span className={s.그림} aria-hidden>📍</span>
                <span className={s.가운데}>
                  <span className={s.이름}>{곳.name}</span>
                  {곳.address && <span className={s.주소}>{곳.address}</span>}
                </span>
                <span className={s.꼬리} aria-hidden>＋ 추가</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 넣은 출발지 — 옆으로 밀어 넘긴다. 한 곳도 없으면 줄 자체를 안 그린다(빈 자리를 안 남긴다). */}
      {!!출발지들.length && (
        <div className={s.출발지줄} data-slot="출발지슬라이더" aria-label="출발지 목록, 옆으로 밀어서 확인">
          {출발지들.map((o, i) => (
            <div key={`${o.name}${o.lat}`} className={s.출발지칩} data-slot="출발지칩" data-번호={i + 1}
              style={{ ['--c' as string]: 출발지색고르기(i) }}>
              {/* `aria-pressed` 는 '지도가 이 자리를 보고 있다', `aria-expanded` 는
                  '이 출발지 시트가 열려 있다' — 두 상태가 다르므로 따로 말한다.
                  칩을 거듭 누르면 셸이 3단으로 돌린다. */}
              <button type="button" className={s.칩속} aria-pressed={i === 초점}
                aria-expanded={i === 열린칩}
                onClick={() => 칩누름(i)}>
                <span className={s.번호} aria-hidden>{i + 1}</span>
                <span className={s.이름}>{o.name}</span>
              </button>
              {/* ✕ 는 남긴다 — 삭제를 시트 안으로만 옮기면 키보드만 쓰는 사람은
                  '칩 누르기 → 시트 열기 → 삭제' 로 세 번을 눌러야 한다(지금 판은 한 번이다). */}
              <button type="button" className={s.칩빼기} aria-label={`${o.name} 빼기`}
                onClick={() => 빼기(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 중간지점 기준. 목업은 여기가 거리순/시간순이었지만 우리 값은 거리 / AI 다 —
          시간 기준은 2026-08-23 에 사람이 정해 뺐다(app/탐색/탐색.tsx:36–42). */}
      <div className={s.기준줄}>
        <button type="button" className={s.기준단추} data-slot="기준" data-기준={기준}
          onClick={기준바꾸기}
          aria-label={`중간지점 기준: ${기준} — 눌러서 ${기준 === '거리' ? 'AI' : '거리'}로 전환`}>
          {기준 === '거리' ? '거리 기준' : 'AI 추천'}
        </button>
      </div>

      {/* browse 에서는 시트가 화면 밖이라, 처음 온 사람에게 말을 거는 것은 이 줄뿐이다 */}
      {안내 && <p className={s.안내줄} data-slot="안내줄">{안내}</p>}
    </div>
  );
}
