'use client';
/* 홈 바텀시트 엔진 — 스냅 자리 셈 · 끌기 · 키보드 · 떠 있는 단추 배치.

   목업 `moimer-core.js` 1638–1811 을 옮긴 것이다.

   ⚠ **`app/m/[code]/ui.tsx` 의 시트와 합치지 마라.**
     · 저건 `max-height` 를 몰아 **위에 있는 `.map`(flex:1)을 줄인다.**
       globals.css:22–26 의 `min-height:0` 이 없어서 데스크톱 크롬에 가로 스크롤바가
       났던 자국이 있다 — 그 배치 모형에 손대는 일이다.
     · 이건 `inset:0` 으로 깔린 지도 **위를** `transform` 으로 덮는다. 지도는 안 줄어든다.
   겹치는 것은 '손 뗀 자리에서 가장 가까운 정착 자리 고르기' 하나뿐이고 그건 이미
   `lib/시트스냅.ts` 에 있다. 둘을 한 물건으로 만들려면 모임 화면의 배치 모형을 통째로
   바꿔야 하는데, 그 화면은 `tests/css.mjs`·`screen.mjs`·`map.mjs` 셋이 겨누는
   이 저장소에서 가장 시험이 두꺼운 자리다. 홈 이식과 그 회귀를 한 덩어리로 묶으면
   되돌릴 수가 없다.

   ⚠ 목업의 `layout()` 은 시트 높이가 100px 미만이면 32ms 뒤 **자신을 다시 예약**한다.
   React 에서는 그 타이머가 언마운트 뒤에도 산다 — `ResizeObserver` 로 바꿨다
   (선례: app/탐색/지도.tsx 가 이미 같은 방식으로 상자 크기를 본다).
   그것이 지키던 규칙은 그대로다: **시트를 `display:none` 으로 감추지 않는다.**
   '숨김'은 화면 밖으로 미는 스냅이지 안 그리는 것이 아니다. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { 가장가까운, 홈스냅 } from '@/lib/시트스냅';

/* 자리 이름. 차례가 곧 '위로 한 칸' 순서다(미니가 가장 낮고 가득이 가장 높다). */
export const 자리들 = ['숨김', '미니', '살짝', '반', '가득'] as const;
export type 자리 = (typeof 자리들)[number];

/* 보여 줄 것이 있으면 네 자리가 살아난다. 없으면 '숨김' 하나뿐이라 끌어도 안 움직인다.
   (목업 snapOrder 1689–1692 와 같은 규칙이되, 가르는 잣대가 다르다 — 아래 머리말 참고.) */
const 펼친자리: 자리[] = ['미니', '살짝', '반', '가득'];

/* 떠 있는 둥근 단추 지름과 사이 틈 — 홈.module.css 의 `.현위치` 크기와 같아야 한다 */
const 단추지름 = 46, 단추틈 = 10;

/* 시트 본문을 맨 위에서 이만큼 아래로 끌면 '닫으려는 손짓'으로 본다.
   너무 작으면 글을 읽으려고 살짝 민 것도 시트를 닫아 버린다. */
const 본문끌기문턱 = 12;
/* 손잡이를 '끌었다'고 보는 최소 거리 — 이 아래는 그냥 누른 것으로 친다 */
const 끌기문턱 = 4;

export type 시트 = ReturnType<typeof use시트>;

/**
 * @param 펼칠수있나 시트에 **보여 줄 것이 있는가**(홈은 '가운데가 잡혔는가').
 *
 * ⚠ 목업은 이 잣대가 화면 모드였다 — browse 면 시트가 통째로 없고 detail 에서만 열렸다.
 * 우리는 **보여 줄 것이 있는지**로 가른다. 까닭은 실측으로 찾았다:
 * 목업은 지도가 늘 살아 있다고 치고 짠 물건이라 시트로 들어가는 길이 지도 위 말풍선
 * 하나뿐인데, 우리 지도는 죽을 수 있다(카카오가 막히거나 OSM 타일까지 못 받으면
 * `.tiledead` 가 뜬다 — globals.css:359). 그러면 말풍선이 안 그려져 시트에 **닿을 길이
 * 사라진다.** 그런데 지금 시트 안에는 만들기 단추·AI 추천·이동 수단·출발지별 상세가
 * 다 들어 있다 — 예전 홈에서는 스크롤만 하면 늘 닿던 것들이다.
 * 그래서 가운데가 잡히면 시트는 늘 '미니'로 남아 요약 줄이 손잡이 노릇을 한다.
 */
export function use시트(펼칠수있나: boolean) {
  const 셸칸 = useRef<HTMLDivElement | null>(null);
  const 시트칸 = useRef<HTMLDivElement | null>(null);
  const 손잡이칸 = useRef<HTMLButtonElement | null>(null);
  const 요약칸 = useRef<HTMLDivElement | null>(null);
  const 본문칸 = useRef<HTMLDivElement | null>(null);
  /* 떠 있는 것들 — 아래에서 위로 쌓는다: 현위치 → 탐색 → 쪽지 */
  const 현위치칸 = useRef<HTMLButtonElement | null>(null);
  const 탐색칸 = useRef<HTMLButtonElement | null>(null);
  const 쪽지칸 = useRef<HTMLDivElement | null>(null);

  const [지금자리, set지금자리] = useState<자리>('숨김');

  /* 스냅 자리(px). 그릴 때마다 다시 셈하지 않는다 — 크기가 바뀔 때만 잰다.
     state 가 아니라 ref 인 까닭: 끄는 동안 매 프레임 읽는데 state 면 그때마다 다시 그린다. */
  const 스냅 = useRef<Record<자리, number>>({ 숨김: 0, 미니: 0, 살짝: 0, 반: 0, 가득: 0 });
  const 치우침 = useRef(0);
  const 잴수있나 = useRef(false);

  const 쓸자리 = useCallback(
    (): 자리[] => (펼칠수있나 ? 펼친자리 : ['숨김']),
    [펼칠수있나],
  );

  /* ── 떠 있는 단추 쌓기 ────────────────────────────────────
     시트가 올라온 만큼 단추도 같이 올라가야 한다. CSS 에 `bottom` 을 안 둔 까닭이 이것이다
     (목업 placeLocate 1721–1740). 끄는 동안 매 프레임 돈다 — 여기서 레이아웃을 읽지 말고
     이미 잰 값만 쓴다. */
  const 배치 = useCallback(() => {
    const 시트 = 시트칸.current;
    if (!시트) return;
    const 탭바 = 탭바높이();
    /* 시트가 화면 안으로 들어온 높이. 숨김이면 0 이하가 된다. */
    const 보이는높이 = 시트.offsetHeight - 치우침.current;
    const 바닥 = 보이는높이 <= 0 ? 탭바 + 30 : 탭바 + 보이는높이 + 12;

    if (현위치칸.current) 현위치칸.current.style.bottom = `${바닥}px`;
    let 쌓기 = 바닥 + 단추지름 + 단추틈;
    const 탐색 = 탐색칸.current;
    if (탐색 && !탐색.hidden) { 탐색.style.bottom = `${쌓기}px`; 쌓기 += 단추지름 + 단추틈; }
    if (쪽지칸.current) 쪽지칸.current.style.bottom = `${쌓기 + 10}px`;
  }, []);

  /* ── 자리 옮기기 ──────────────────────────────────────── */
  const 가기 = useCallback((이름: 자리, 애니 = true) => {
    const 시트 = 시트칸.current;
    if (!시트) return;
    /* ⚠ 애니 여부를 React state 로 켜면 **첫 이동이 안 움직인다** — setState 는 다음
       그리기에 반영되는데 바로 아래 `transform` 은 지금 바뀌므로, 브라우저가
       transition 이 없는 상태에서 새 값을 그대로 적용해 버린다.
       그래서 DOM 에 직접 쓰고, 쓴 값을 한 번 확정시킨 뒤(offsetHeight 읽기)
       transform 을 건드린다. transition 값 자체는 CSS 가 쥐고 있어야
       `prefers-reduced-motion` 덮개가 그대로 듣는다(인라인으로 주면 미디어 쿼리가 못 이긴다). */
    시트.setAttribute('data-움직임', 애니 ? '예' : '아니오');
    if (애니) void 시트.offsetHeight;
    치우침.current = 스냅.current[이름];
    시트.style.transform = `translateY(${치우침.current}px)`;
    /* 시트 밑단이 탭바 밑으로 내려간 양 — `.시트본문` 의 아래 여백이 이걸 먹는다.
       없으면 마지막 줄이 글자 중간에서 잘린다. */
    시트.style.setProperty('--시트잘림', `${Math.max(0, 치우침.current)}px`);
    set지금자리(이름);
    배치();
  }, [배치]);

  /* ── 크기 재기 ────────────────────────────────────────── */
  const 재기 = useCallback(() => {
    const 셸 = 셸칸.current, 시트 = 시트칸.current, 손잡이 = 손잡이칸.current;
    if (!셸 || !시트 || !손잡이) return;
    const 셸높이 = 셸.clientHeight, 시트높이 = 시트.offsetHeight;
    /* 아직 붙기 전이라 잴 것이 없다. 목업은 여기서 32ms 뒤 자신을 다시 불렀지만
       우리는 ResizeObserver 가 크기가 생기는 순간 다시 부른다 — 타이머를 안 남긴다. */
    if (셸높이 < 200 || 시트높이 < 100) { 잴수있나.current = false; return; }

    const 탭바 = 탭바높이();
    시트.style.bottom = `${탭바}px`;

    /* 셈 자체는 `lib/시트스냅.ts` 에 있다 — 화면을 안 읽는 순수 함수라 CI 가 잰다.
       여기서는 재는 일만 한다. */
    스냅.current = 홈스냅({
      시트높이, 셸높이, 탭바높이: 탭바,
      손잡이높이: 손잡이.offsetHeight,
      요약높이: 요약칸.current?.offsetHeight || 60,
    });
    잴수있나.current = true;
    /* 지금 자리를 다시 적용한다 — 창이 바뀌면 같은 이름이라도 픽셀이 달라진다 */
    가기(지금자리, false);
  }, [가기, 지금자리]);

  /* 크기가 바뀌면 다시 잰다. `resize` 만으로는 부족하다 —
     모바일은 주소창이 접히며 `visualViewport` 만 바뀌는 때가 있고,
     시트 안 내용이 늘어 요약 줄 높이가 바뀌는 때도 있다. */
  useEffect(() => {
    재기();
    const 셸 = 셸칸.current, 시트 = 시트칸.current;
    const 관찰 = new ResizeObserver(() => 재기());
    if (셸) 관찰.observe(셸);
    if (시트) 관찰.observe(시트);
    if (요약칸.current) 관찰.observe(요약칸.current);
    window.addEventListener('resize', 재기);
    window.visualViewport?.addEventListener('resize', 재기);
    return () => {
      관찰.disconnect();
      window.removeEventListener('resize', 재기);
      window.visualViewport?.removeEventListener('resize', 재기);
    };
  }, [재기]);

  /* 보여 줄 것이 없어지면(출발지를 다 뺐다) 시트도 내려간다 — 빈 시트가 남아 있으면
     '뭔가 있는데 안 보이는' 것으로 읽힌다. 어디에 세울지는 셸이 정한다(홈.tsx). */
  useEffect(() => {
    if (!펼칠수있나) 가기('숨김', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [펼칠수있나]);

  /* ── 손잡이 끌기 ──────────────────────────────────────── */
  const 끌기 = useRef<{ 시작Y: number; 시작치우침: number; 움직였나: boolean } | null>(null);

  const 손잡이내림 = useCallback((e: React.PointerEvent) => {
    if (!잴수있나.current || 쓸자리().length < 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    끌기.current = { 시작Y: e.clientY, 시작치우침: 치우침.current, 움직였나: false };
  }, [쓸자리]);

  const 손잡이이동 = useCallback((e: React.PointerEvent) => {
    const d = 끌기.current, 시트 = 시트칸.current;
    if (!d || !시트) return;
    const 간거리 = e.clientY - d.시작Y;
    if (!d.움직였나 && Math.abs(간거리) < 끌기문턱) return;
    d.움직였나 = true;
    const 차례 = 쓸자리();
    /* 바닥은 가장 낮은 자리(상세면 미니), 천장은 가득보다 24px 더 —
       끝에서 살짝 넘겨야 '더는 없다'가 손에 느껴진다(목업 값). */
    const 바닥 = 스냅.current[차례[0]];
    const 천장 = 스냅.current['가득'] - 24;
    치우침.current = Math.max(천장, Math.min(바닥, d.시작치우침 + 간거리));
    시트.style.transform = `translateY(${치우침.current}px)`;
    배치();
  }, [배치, 쓸자리]);

  const 손잡이올림 = useCallback(() => {
    const d = 끌기.current;
    끌기.current = null;
    if (!d) return;
    const 차례 = 쓸자리();
    if (!d.움직였나) {
      /* 끌지 않고 눌렀으면 한 칸 위로. 맨 위였으면 맨 아래로 돌아온다 —
         눌러서만 쓰는 사람도 모든 자리에 닿을 수 있어야 한다. */
      가기(다음자리(차례, 지금자리), true);
      return;
    }
    가기(가장가까운(치우침.current, 차례, (자리) => 스냅.current[자리]), true);
  }, [가기, 지금자리, 쓸자리]);

  /* ── 본문을 맨 위에서 아래로 끌면 닫는다 ──────────────────
     시트가 가득 찼을 때 손잡이까지 손을 옮기지 않고도 내릴 수 있어야 한다.
     본문이 이미 스크롤 중이면(맨 위가 아니면) 안 걸린다 — 글을 읽는 손짓과 안 다툰다. */
  const 본문끌기 = useRef<{ 시작Y: number; 시작치우침: number; 걸렸나: boolean } | null>(null);

  const 본문내림 = useCallback((e: React.PointerEvent) => {
    const 본문 = 본문칸.current;
    if (!본문 || 본문.scrollTop > 0 || 쓸자리().length < 2) return;
    본문끌기.current = { 시작Y: e.clientY, 시작치우침: 치우침.current, 걸렸나: false };
  }, [쓸자리]);

  const 본문이동 = useCallback((e: React.PointerEvent) => {
    const d = 본문끌기.current, 시트 = 시트칸.current, 본문 = 본문칸.current;
    if (!d || !시트 || !본문) return;
    const 간거리 = e.clientY - d.시작Y;
    if (!d.걸렸나) {
      /* 위로 미는 것은 스크롤이다 — 아래로 문턱을 넘을 때만 시트를 잡는다 */
      if (간거리 < 본문끌기문턱) return;
      if (본문.scrollTop > 0) { 본문끌기.current = null; return; }
      d.걸렸나 = true;
      시트.setAttribute('data-움직임', '아니오');
    }
    const 차례 = 쓸자리();
    const 바닥 = 스냅.current[차례[0]];
    치우침.current = Math.max(스냅.current['가득'] - 24, Math.min(바닥, d.시작치우침 + 간거리));
    시트.style.transform = `translateY(${치우침.current}px)`;
    배치();
  }, [배치, 쓸자리]);

  const 본문올림 = useCallback(() => {
    const d = 본문끌기.current;
    본문끌기.current = null;
    if (!d?.걸렸나) return;
    가기(가장가까운(치우침.current, 쓸자리(), (자리) => 스냅.current[자리]), true);
  }, [가기, 쓸자리]);

  /* ── 키보드 ───────────────────────────────────────────
     손가락으로만 되는 물건을 두지 않는다 — 목업도 ↑↓Esc 를 걸어 뒀다. */
  const 손잡이키 = useCallback((e: React.KeyboardEvent) => {
    const 차례 = 쓸자리();
    if (차례.length < 2) return;
    const i = Math.max(0, 차례.indexOf(지금자리));
    if (e.key === 'ArrowUp') { e.preventDefault(); 가기(차례[Math.min(차례.length - 1, i + 1)], true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); 가기(차례[Math.max(0, i - 1)], true); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      가기(다음자리(차례, 지금자리), true);
    }
  }, [가기, 지금자리, 쓸자리]);

  return {
    셸칸, 시트칸, 손잡이칸, 요약칸, 본문칸, 현위치칸, 탐색칸, 쪽지칸,
    지금자리, 가기, 배치, 재기,
    손잡이내림, 손잡이이동, 손잡이올림, 손잡이키,
    본문내림, 본문이동, 본문올림,
  };
}

/** 눌렀을 때 갈 다음 자리 — 한 칸 위로, 맨 위였으면 맨 아래로 돈다 */
function 다음자리(차례: 자리[], 지금: 자리): 자리 {
  const i = 차례.indexOf(지금);
  if (i < 0) return 차례[0];
  return i >= 차례.length - 1 ? 차례[0] : 차례[i + 1];
}

/* 전역 탭바(app/tabbar.tsx)의 실제 높이. `--tabbar-h`(58px)에 홈 표시줄 여백이 더해진다 —
   globals.css:132 가 `padding-bottom:env(safe-area-inset-bottom)` 를 준다.
   숫자를 여기 베끼지 않고 실제로 잰다: 한쪽만 고치는 날이 오지 않게. */
function 탭바높이() {
  if (typeof document === 'undefined') return 0;
  const 탭바 = document.querySelector<HTMLElement>('nav.tabbar');
  /* `/` 에서 탭바는 안 지운다 — 미끄러져 내려갈 뿐이다(globals.css 의 홈모드 규칙).
     내려가 있는 동안은 자리를 안 먹으므로 0 으로 친다. */
  if (!탭바) return 0;
  if (document.body.getAttribute('data-홈모드') === '숨김') return 0;
  return 탭바.offsetHeight;
}
