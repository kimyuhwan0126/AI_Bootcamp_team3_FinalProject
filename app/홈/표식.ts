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
