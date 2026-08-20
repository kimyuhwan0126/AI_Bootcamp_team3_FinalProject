'use client';
/* 홈 상단 — 지도 위에 늘 떠 있는 것들.

   검색바(+워드마크) · 검색 결과 패널 · 출발지 칩 줄.

   ⚠ 칩 줄 아래에 있던 **기준 단추(거리/AI)와 안내 한 줄은 2026-08-19 에 사람이 정해 뺐다.**
   지도 위에 늘 떠 있는 것을 줄이자는 뜻이다. 기준은 시트가 계속 말해 주고(시트요약·눈썹),
   무엇을 하면 무엇이 나오는지도 시트 안 '작은글'이 말한다. 되살릴 일이 생기면 사람에게
   먼저 물어야 한다 — 지금은 기준을 바꿀 길이 화면 어디에도 없다(홈.tsx 의 `기준` 참고).

   ⚠ 이 띠 자체는 `pointer-events:none` 이다(홈.module.css 의 `.윗칸`). 줄과 줄 **사이**
   빈 자리로 지도를 눌러야 하기 때문이다 — 안 그러면 지도 위쪽 3분의 1 에서 탭이 통째로
   사라진다(globals.css:59–62 의 `.acts` 가 같은 사고를 겪고 남긴 교훈).

   ⚠ 검색은 `lib/장소찾기.ts` 를 쓴다 — `app/originfield.tsx`(만들기·참여·내정보)와 **같은
   함수**다. 갈라 두면 카카오가 죽었을 때 어느 화면은 말하고 어느 화면은 조용해진다. */

import { useEffect, useRef, useState } from 'react';
import type { Origin } from '../originfield';
import { 장소찾기, 최소글자, type 찾은곳 } from '@/lib/장소찾기';
import type { 갈래 as 갈래이름, 아이콘 } from '@/lib/장소갈래';
import { 출발지색고르기 } from './핀그림';
import 갈래아이콘 from './갈래아이콘';
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
  출발지들, 고름, 초점, 칩누름, 수단표기,
  기준, AI열림, AI상태, AI결과, AI고름, AI누름, AI고르기, AI끄기, AI닫기,
  탐색, 켠갈래, 갈래누름, 갈래들, 장소상태, 장소수,
}: {
  출발지들: Origin[];
  고름: (o: Origin) => void;
  /* 지금 눈이 가 있는 칩 — **지도가 그 자리로 가 있다**는 표시다.
     시트가 무엇을 말하는지와는 다른 값이다: 가운데 말풍선을 누르면 시트만 가운데로
     돌아가고 지도는 그대로라, 그때도 이 칩은 켜져 있다(홈.tsx 의 `초점`/`고른것`). */
  초점: number;
  /* 누르면 지도가 그 출발지로 가고 **그 출발지 시트가 '반'까지 올라온다**
     (2026-08-20 사용자 요청). 거듭 눌러 시트를 여닫던 3단 순환은 아니다 —
     몇 번을 눌러도 늘 '반'이다(홈.tsx 의 `칩누름`). */
  칩누름: (i: number) => void;
  /* 칩에 붙는 '· 대중교통' 한 마디. 무엇을 적을지는 `lib/수단표기.ts` 가 정한다 —
     사람이 **고른 카테고리 그대로**다(2026-08-20 사용자 요청). */
  수단표기: (i: number) => string;

  /* ── AI 추천 둥근 단추 (2026-08-20 사용자 요청) ──────────────
     출발지 줄 **아래 오른쪽**에 붙는다. 셸이 모든 상태를 쥐고 여기는 그리기만 한다 —
     기준을 켜고 끄는 것도, 어느 곳을 골랐는지도 지도와 시트가 함께 봐야 하는 값이다. */
  기준: '거리' | 'AI';
  /** 추천 칩 줄이 펼쳐져 있나 */
  AI열림: boolean;
  AI상태: 'idle' | '구하는중' | '못구함' | '한도끝';
  AI결과: { name: string; lat: number; lng: number }[] | null;
  AI고름: number;
  AI누름: () => void;
  AI고르기: (i: number) => void;
  /** 'off' 칩 — 기준을 거리로 되돌린다 */
  AI끄기: () => void;
  /** 화면 딴 데를 눌렀을 때 — 칩 줄만 닫는다(기준은 그대로) */
  AI닫기: () => void;

  /* ── 주변 탐색 (E단계) ────────────────────────────────────
     켜지면 출발지 줄이 숨고 갈래 줄이 그 자리에 선다(홈.module.css 의 `.셸[data-탐색]`) */
  탐색: boolean;
  /* 지금 켜 둔 갈래 — **한 번에 하나뿐이다**(2026-08-20 사용자 요청).
     같은 칩을 다시 누르면 꺼지고 null 이 된다. */
  켠갈래: 갈래이름 | null;
  갈래누름: (g: 갈래이름) => void;
  /** 지금 받아 온 장소에 **실제로 있는** 갈래만 온다 — 눌러도 비는 칩을 안 만든다 */
  갈래들: { 이름: 갈래이름; 아이콘: 아이콘 }[];
  장소상태: 'idle' | '구하는중' | '못구함' | '한도끝';
  장소수: number;
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

  /* AI 칩 줄도 바깥을 누르면 닫힌다 — 검색 패널(위)과 **같은 수법**이다.
     캡처 단계에서 듣되 자기 칸은 뺀다: 칩을 누르기도 전에 닫히면 안 된다.
     지도를 누른 것도 '바깥'이다 — 그때 닫히는 것이 사람이 바라는 바다. */
  const AI칸 = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!AI열림) return;
    const 손 = (e: PointerEvent) => {
      if (!AI칸.current?.contains(e.target as Node)) AI닫기();
    };
    document.addEventListener('pointerdown', 손, true);
    return () => document.removeEventListener('pointerdown', 손, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [AI열림]);

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
            /* ⚠ `type="search"` 가 아니다 — 웹킷이 글자를 넣는 순간 칸 안에 제 ✕(지우기)
               단추를 그려 넣는데, 그것을 2026-08-20 에 사람이 정해 뺐다. 타입을 되돌리면
               그 단추도 같이 돌아온다(CSS 로도 한 번 더 막아 뒀다 — 홈.module.css 의
               `.검색바 input::-webkit-search-cancel-button`). */
            type="text" value={말}
            /* 탐색 모드에서는 지도에 뜬 것이 출발지가 아니라 둘레의 장소다 —
               같은 칸이지만 지금 무엇을 찾는 자리인지 문구가 말해 준다(2026-08-20 사용자 요청).
               ⚠ 하는 일은 그대로다: 골라 넣으면 **출발지로** 들어간다(아래 `골랐다`). */
            placeholder={탐색 ? '장소 주소 검색' : '어디에서 출발하시나요?'}
            aria-label={탐색 ? '장소 주소 검색' : '출발지 지역 검색'}
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
              {/* `aria-pressed` 는 '지도가 이 자리를 보고 있다'. 시트가 열렸는지를
                  `aria-expanded` 로 말하지는 않는다 — 칩은 시트를 **여닫는** 것이 아니라
                  늘 '반'으로 세우기만 하고, 닫는 일은 손잡이와 지도 탭이 맡는다. */}
              <button type="button" className={s.칩속} aria-pressed={i === 초점}
                onClick={() => 칩누름(i)}>
                <span className={s.번호} aria-hidden>{i + 1}</span>
                <span className={s.이름}>{o.name}</span>
                {/* 이름과 한 단추 안에 둔다 — 따로 두면 이 말만 눌러도 아무 일이 없다 */}
                <span className={s.칩수단}>· {수단표기(i)}</span>
              </button>
              {/* ⚠ 여기 있던 ✕(빼기) 는 2026-08-20 에 사람이 정해 뺐다. 삭제로 가는 길은
                  시트 요약 줄의 휴지통 하나뿐이다 — 칩을 누르면 그 출발지 시트가 '반'까지
                  올라오므로 키보드만 쓰는 사람도 '칩 → 휴지통' 두 번이면 닿는다. */}
            </div>
          ))}
        </div>
      )}

      {/* ── AI 추천 ─────────────────────────────────────────
          출발지가 2곳 이상일 때만 뜬다 — 한 곳뿐이면 잡을 가운데가 없어(홈.tsx) 추천할
          것도 없다. 칩 줄은 단추 **아래**, 단추와 같은 오른쪽 끝에 붙는다. */}
      {출발지들.length >= 2 && (
        <div className={s.AI줄} data-slot="AI줄" ref={AI칸}>
          <div className={s.AI단추줄}>
            {/* 추천을 받아 오는 동안만 도는 고리. 단추 **왼쪽**이다 — 단추 위에 겹치면
                'AI' 글자가 가려져 무슨 단추인지 못 읽는다. */}
            {AI상태 === '구하는중' && (
              <span className={s.AI뱅뱅} data-slot="AI뱅뱅" role="status"
                aria-label="AI 추천을 받는 중이에요" />
            )}
            <button type="button" className={s.AI단추} data-slot="AI단추"
              aria-pressed={기준 === 'AI'} aria-expanded={AI열림}
              onClick={AI누름}
              title="AI 추천 중간지점"
              aria-label={기준 === 'AI' ? 'AI 추천 목록 여닫기' : 'AI 로 중간지점 추천받기'}>
              AI
            </button>
          </div>

          {AI열림 && 기준 === 'AI' && (
            <div className={s.AI칩줄} data-slot="AI칩줄" role="group" aria-label="AI 추천 중간지점">
              {AI상태 === '구하는중' && <span className={s.AI빔}>추천받는 중…</span>}
              {AI상태 === '한도끝' && <span className={s.AI빔}>너무 여러 번 물었어요</span>}
              {AI상태 === '못구함' && <span className={s.AI빔}>추천을 못 받았어요</span>}
              {(AI결과 ?? []).map((p, i) => (
                <button key={`${p.name}${p.lat}`} type="button" className={s.AI칩}
                  aria-pressed={i === AI고름} onClick={() => AI고르기(i)}>{p.name}</button>
              ))}
              {/* 기준을 거리로 되돌리는 단 하나의 길 — 단추를 다시 눌러도 안 꺼진다 */}
              <button type="button" className={s.AI칩} data-끄기 onClick={AI끄기}
                aria-label="AI 추천 끄고 거리 기준으로">off</button>
            </div>
          )}
        </div>
      )}

      {/* ── 갈래 줄 (주변 탐색) ───────────────────────────────
          출발지 줄과 **자리를 나눠 쓴다** — 어느 쪽을 보일지는 CSS 가 `data-탐색` 으로
          가른다(홈.module.css). 그리기 자체는 늘 하되 탐색이 꺼져 있으면 안 그린다. */}
      {탐색 && (
        <div className={s.갈래줄} data-slot="갈래줄" role="group" aria-label="주변 장소 갈래">
          {/* '전체' 칩은 2026-08-20 에 뺐다 — 아무것도 안 켠 처음 자리가 곧 전체 끄기다.
              한 번에 하나만 켜진다(같은 날 사용자 요청): 갈래를 겹쳐 켜면 핀이 100개를
              넘어 중간지점 말풍선이 묻혔다. `aria-pressed` 가 그 켜짐을 읽어 주는
              기계에도 그대로 전한다 — 라디오가 아니라 **누름 단추**로 말하는 까닭은
              같은 칩을 다시 눌러 끌 수 있기 때문이다. */}
          {갈래들.map((g) => {
            const 켬 = 켠갈래 === g.이름;
            return (
              <button key={g.이름} type="button" className={s.갈래칩} aria-pressed={켬}
                onClick={() => 갈래누름(g.이름)}
                aria-label={`${g.이름} ${켬 ? '지도에서 감추기' : '지도에 보이기'}`}>
                {/* 그림은 2026-08-20 에 이모지에서 선 그림으로 바뀌었다(lib/장소갈래.ts).
                    색을 안 준다 — 칩 글자색을 그대로 물려받아 켜질 때 함께 짙어진다. */}
                <갈래아이콘 아이콘={g.아이콘} 크기={16} />{g.이름}
              </button>
            );
          })}
          {/* 칩만 있고 아무 말이 없으면 '켜졌는데 아무 일도 안 났다'가 된다 */}
          {장소상태 === '구하는중' && <span className={s.갈래빔}>둘레를 찾는 중…</span>}
          {장소상태 === '한도끝' && <span className={s.갈래빔}>너무 여러 번 물었어요</span>}
          {장소상태 === '못구함' && <span className={s.갈래빔}>둘레에서 찾은 곳이 없어요</span>}
          {/* '갈래를 눌러 보세요' 는 2026-08-20 에 사람이 정해 뺐다 — 칩이 여섯 개
              늘어서 있는 것이 이미 '눌러 보라'는 말이고, 아무것도 안 켠 첫 자리에서
              그 한 마디가 칩 줄 끝을 늘 차지하고 있었다. 남은 셋은 **일이 어긋났을 때**
              하는 말이라 그대로 둔다. 되살릴 일이 생기면 사람에게 먼저 묻는다. */}
          {장소상태 === 'idle' && !!켠갈래 && !장소수 && (
            <span className={s.갈래빔}>고른 갈래는 둘레에 없어요</span>
          )}
        </div>
      )}
    </div>
  );
}
