/* 지도 위 표식을 **진짜 DOM 엘리먼트**로 짓는다.

   왜 React 컴포넌트가 아닌가 — 카카오 `CustomOverlay` 는 React 가 그리는 나무 밖에 산다.
   `setContent()` 에 문자열이나 엘리먼트를 넘겨야 한다. 그래서 표식을 두 벌(카카오용 문자열 +
   OSM용 JSX)로 두면 같은 자리가 두 지도에서 다르게 보이기 시작한다 — 한쪽만 고치는 날이 온다.
   여기서 한 벌로 짓고, OSM 쪽은 이 엘리먼트를 그대로 붙인다.

   ⚠ **문자열로 짜지 마라.** app/탐색/지도.tsx:44–60 에 그 사고 기록이 둘 있다 —
     ① `::before` 로 박스 밖에 그린 이름표를 카카오 오버레이 래퍼가 잘라 "가" 한 글자만 나왔다
     ② `url("data:…<svg width='30'…>")` 를 `style="…"` 안에 넣었더니 큰따옴표가 style 속성을
        조기에 끊어, 나머지가 화면에 글자로 찍혔다
   `document.createElement` + `textContent` 는 둘 다 안 겪는다. 라벨이 실제 지명(사람이 지은
   아무 글자)으로 바뀌어도 이스케이프가 필요 없다. */

import { 아이콘상자, 아이콘고르기, 색고르기, type 갈래 } from '@/lib/장소갈래';
import { 핀, 핀주소, 출발지상자, 물방울자리 } from './핀그림';

/** 갈래 아이콘을 **DOM 으로** 그린다 — 리액트 쪽은 `app/홈/갈래아이콘.tsx` 가 같은 길을 쓴다.
    `innerHTML` 을 안 쓴다: 위 머리말 ②의 사고(따옴표가 속성을 끊는다)와 같은 갈래다. */
function 아이콘만들기(갈래: 갈래 | null, 크기: number, 두께: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(크기));
  svg.setAttribute('height', String(크기));
  svg.setAttribute('viewBox', 아이콘상자);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(두께));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of 아이콘고르기(갈래)) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/** 둘레 장소 표식 — 갈래 색 동그라미에 갈래 아이콘 하나(2026-08-20 사용자 요청).

    **고르면 물방울로 커진다.** 그 자람은 CSS 가 맡는다(홈.module.css 의 `.장소표식`) —
    여기서 모양을 두 벌 짓지 않는다: 두 벌이면 사이를 잇는 움직임이 없어 톡 바뀌고,
    카카오 오버레이는 내용을 갈아 끼울 때 엘리먼트를 통째로 새로 만들어 그 자람이 안 보인다.
    이 함수는 늘 같은 뼈대를 짓고 `data-고름` 만 다르게 준다.

    ⚠ **가게 이름은 지도에 안 적는다**(2026-08-20 사람이 정했다). 잠깐 이름표를 붙였다가
    같은 날 뺐다 — 한 갈래가 45곳까지 오는데, 그 이름들이 서로 겹치고 골목 이름까지
    덮어서 지도가 글자밭이 됐다. 이름은 **눌렀을 때 시트**가 말한다. 읽어 주는 기계에는
    `aria-label` 로 그대로 남는다 — 눈으로 못 읽는 사람에게서까지 뺏을 일은 아니다. */
export function 장소표식만들기(s: Record<string, string>, 옵션: {
  이름: string;
  갈래: 갈래 | null;
  고름?: boolean;
  누름?: () => void;
}): HTMLButtonElement {
  const 칸 = document.createElement('button');
  칸.type = 'button';
  칸.className = s.장소표식;
  칸.setAttribute('data-slot', '장소표식');
  칸.setAttribute('data-고름', 옵션.고름 ? '예' : '아니오');
  /* 무슨 단추인지가 이름 하나로 끝나지 않는다 — 눌러 두면 켜진 채로 남으므로 그 켜짐도 말한다 */
  칸.setAttribute('aria-pressed', 옵션.고름 ? 'true' : 'false');
  칸.setAttribute('aria-label', 옵션.갈래 ? `${옵션.이름} · ${옵션.갈래}` : 옵션.이름);
  칸.style.position = 'absolute';
  칸.style.left = '0';
  칸.style.top = '0';
  /* 갈래 색은 여기서 한 번만 넘긴다 — 동그라미도 꼬리도 CSS 에서 `var(--c)` 를 본다.
     클래스를 갈래마다 하나씩 두지 않는 까닭이다(갈래가 늘면 CSS 도 늘어야 한다). */
  칸.style.setProperty('--c', 색고르기(옵션.갈래));

  const 핀 = document.createElement('span');
  핀.className = s.장소핀;
  핀.appendChild(아이콘만들기(옵션.갈래, 17, 2.1));

  칸.append(핀);
  if (옵션.누름) {
    칸.addEventListener('click', (e) => { e.stopPropagation(); 옵션.누름!(); });
  }
  return 칸;
}

/** 출발지 표식 — **안 고르면 번호 동그라미, 고르면 물방울**(2026-08-20 사용자 요청).

    ⚠ **두 꼴을 둘 다 담는다.** 고른 쪽만 만들면 꼴이 바뀔 때 엘리먼트가 새로 나서
    사이를 잇는 움직임이 없다 — 톡 바뀐다. 겹쳐 두고 `data-고름` 하나로 서로 반대로
    흐려지게 하면 CSS 가 그 사이를 이어 준다(홈.module.css 의 `.출발지핀`).
    안 보이는 쪽은 `opacity:0` 이라 화면에 없고, `aria-hidden` 이라 읽는 기계에도 없다.

    자리 셈(상자 · 좌표점 · 물방울 놓는 자리)은 전부 `핀그림.ts` 가 쥔다 — 여기서는
    받아 적기만 한다. 두 곳에 적어 두면 그림을 고칠 때 다투게 된다. */
export function 출발지표식만들기(s: Record<string, string>, 옵션: {
  번호: number;
  이름: string;
  색: string;
  고름?: boolean;
  누름?: () => void;
}): HTMLButtonElement {
  const 칸 = document.createElement('button');
  칸.type = 'button';
  칸.className = s.출발지핀;
  칸.setAttribute('data-slot', '출발지핀');
  칸.setAttribute('data-번호', String(옵션.번호));
  칸.setAttribute('data-고름', 옵션.고름 ? '예' : '아니오');
  칸.setAttribute('aria-pressed', 옵션.고름 ? 'true' : 'false');
  칸.setAttribute('aria-label', `출발지 ${옵션.번호} ${옵션.이름}`);
  칸.style.cssText = 'position:absolute;left:0;top:0;'
    + `width:${출발지상자.폭}px;height:${출발지상자.높이}px;`
    + `transform:translate(${-출발지상자.좌표x}px,${-출발지상자.좌표y}px)`;
  칸.style.setProperty('--c', 옵션.색);

  /* 안 고른 꼴 — 물방울 머리를 그대로 뗀 것처럼 그린다(색 몸통 · 흰 테 · 흰 속 동그라미에
     핀 색 번호). 자리는 좌표점 한가운데다(CSS 의 translate(-50%,-50%)). */
  const 원 = document.createElement('span');
  원.className = s.출발지동그라미;
  원.setAttribute('aria-hidden', 'true');
  원.style.left = `${출발지상자.좌표x}px`;
  원.style.top = `${출발지상자.좌표y}px`;
  원.style.width = `${출발지상자.원지름}px`;
  원.style.height = `${출발지상자.원지름}px`;
  const 번호칸 = document.createElement('b');
  번호칸.textContent = String(옵션.번호);
  원.appendChild(번호칸);

  /* 고른 꼴 — 물방울 SVG 한 장(핀그림.ts). 끝이 좌표점에 닿게 놓는다. */
  const 그림 = document.createElement('img');
  그림.className = s.출발지물방울;
  그림.src = 핀주소({ 번호: 옵션.번호, 색: 옵션.색 });
  그림.alt = '';
  그림.setAttribute('aria-hidden', 'true');
  그림.draggable = false;
  그림.width = 핀.폭;
  그림.height = 핀.높이;
  그림.style.left = `${물방울자리.x}px`;
  그림.style.top = `${물방울자리.y}px`;

  칸.append(원, 그림);
  if (옵션.누름) {
    칸.addEventListener('click', (e) => { e.stopPropagation(); 옵션.누름!(); });
  }
  return 칸;
}

/** 중간지점 말풍선 — 말풍선 + 줄기 + 점. 어디를 눌러도 같은 곳으로 간다. */
export function 가운데표식만들기(s: Record<string, string>, 옵션: {
  라벨: string;
  고름?: boolean;
  누름?: () => void;
}): HTMLDivElement {
  const 칸 = document.createElement('div');
  칸.className = s.가운데표식;
  칸.setAttribute('data-slot', '가운데표식');
  if (옵션.고름) 칸.setAttribute('data-고름', '예');
  /* 카카오 오버레이는 xAnchor·yAnchor 0 으로 얹으므로 자기 자리를 스스로 잡아야 한다.
     OSM 쪽은 붙이는 span 이 left·top 을 준다 — 둘 다 이 절대 배치를 쓴다. */
  칸.style.position = 'absolute';
  칸.style.left = '0';
  칸.style.top = '0';

  const 말풍선 = document.createElement('div');
  말풍선.className = s.말풍선;
  말풍선.textContent = 옵션.라벨;

  const 줄기 = document.createElement('div');
  줄기.className = s.줄기;

  const 점 = document.createElement('div');
  점.className = s.점;

  칸.append(말풍선, 줄기, 점);

  /* 읽어 주는 기계에도 '누를 수 있는 것' 으로 알린다 — 색과 모양만으로 말하지 않는다 */
  if (옵션.누름) {
    칸.setAttribute('role', 'button');
    칸.setAttribute('tabindex', '0');
    칸.setAttribute('aria-label', `${옵션.라벨} — 자세히 보기`);
    칸.addEventListener('click', (e) => { e.stopPropagation(); 옵션.누름!(); });
    칸.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); 옵션.누름!(); }
    });
  } else {
    칸.setAttribute('aria-label', 옵션.라벨);
  }
  return 칸;
}
