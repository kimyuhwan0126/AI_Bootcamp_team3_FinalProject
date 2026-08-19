'use client';
/* 홈 지도 — **화면을 꽉 채운다.**

   `app/탐색/지도.tsx` 를 옮긴 것이다. 카카오 우선 + OSM 폴백이라는 얼개와
   그 안의 힘들게 얻은 것들(4초 타임아웃 · `kakao-sdk` id 로 스크립트 중복 막기 ·
   `그릴것있나` 로 헛호출 막기 · 열자마자 위치 묻기)은 **그대로 옮겼다.**
   고친 것은 셋뿐이다:

     ① 340px 짜리 카드가 아니라 `inset:0` 이다. 부모(`.지도칸`)가 자리를 잡는다.
     ② **여백을 네 변 따로 받는다**(`여백` prop). 전체화면 지도는 위(검색바·출발지 줄)와
        아래(바텀시트·탭바)가 서로 다른 만큼 덮어서, 사방을 똑같이 비우면 핀이 시트 밑으로
        반쯤 들어간다. 실제로 402×874 에 상단 190·시트 340 을 주고 재 보니 출발지 셋 중
        하나가 가려졌다(tests/지도셈.mjs 가 그 경우를 못 박아 뒀다).
     ③ 가운데 핀이 빨간 물방울(`.opin[data-goal]`)이 아니라 목업의 **말풍선**이다.
        ⚠ 전역 `.opin[data-goal]` 은 **그대로 둔다** — `app/m/[code]/ui.tsx` 가 같은 그림을
        쓴다(globals.css:225 의 경고). 홈만 새 모양을 쓴다.

   ⚠ 출발지 핀을 **끄는 기능은 안 만든다**(2026-08-19 사람이 정했다). 목업은 카카오
   `Marker({draggable:true})` 로 끌 수 있게 하고 놓을 때마다 지명을 되짚고 가운데를 다시
   셌지만, 그 셋을 다 뺐다. 핀은 **그리기만 한다.**
   덕분에 '끄는 동안 호출이 폭주하는' 위험도 함께 사라졌다(`/api/home-ai` 는 분당 5번이다).

   핀 그림은 `./핀그림.ts` 에 있다 — 모양·색·뜨는 높이를 고치려면 그 파일 맨 위만 보면 된다.
   카카오와 OSM 이 **같은 SVG** 를 쓴다: 갈라 두면 같은 출발지가 두 지도에서 다르게 보인다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import s from './홈.module.css';
import { 가운데표식만들기 } from './표식';
import { 핀주소, 핀밀기, 출발지색고르기 } from './핀그림';
import { TILE, toPx, toLatLng, 여백맞추기, type 여백 as 여백꼴 } from '@/lib/지도셈';

declare global { interface Window { kakao: any } }

export type 점 = { 이름: string; lat: number; lng: number };
/* 경로선의 꺾인 점은 이름이 없다 — 위 점(핀)과는 다른 물건이라 따로 둔다 */
type 좌표 = { lat: number; lng: number };

/* 타일 셈(toPx·toLatLng)과 '이 점들이 다 보이게 맞추기'는 `lib/지도셈.ts` 에 있다 —
   카카오와 OSM 폴백이 **같은 셈**을 써야 같은 출발지가 같은 자리에 찍힌다.
   화면 없이 잴 수 있는 순수 함수라 시험도 거기 붙는다. */

/* 출발지 상자가 지도의 이만큼을 채우게 맞춘다 — 남는 여백은 이름표 몫이다 (osmmap 과 같은 값).
   `여백맞추기` 는 네 변을 따로 받으므로, 예전의 사방 균등 여백을 픽셀로 환산해 넘긴다. */
const FIT = 0.72;

/* 물방울 핀(`목표핀그림`·`가운데핀엘리먼트`)은 여기서 안 쓴다 — 홈은 말풍선을 쓴다(위 머리말 ③).
   그 그림이 필요한 곳은 `app/m/[code]/ui.tsx` 와 `globals.css` 두 곳뿐이고 거기는 그대로다. */

export default function 지도({ 출발지들, 가운데, 가운데라벨 = '가운데', 경로들,
  여백, 고른출발지 = -1, 출발지누름, 가운데누름, 지도누름 }: {
  출발지들: 점[];
  가운데: { lat: number; lng: number } | null;
  /* 기준(거리·시간)에 따라 가운데 핀 이름표를 바꾼다(탐색.tsx, 2026-08-17) — 같은 자리라도
     '무엇을 기준으로 잡은 자리인지'가 달라지면 핀 글자도 달라져야 헷갈리지 않는다. */
  가운데라벨?: string;
  /* 출발지마다 가운데까지 오는 길 (2026-08-17) — 모임 화면(app/m/[code])에 이미 있는
     경로 그리기와 같은 뜻이다(/api/routes, 카카오 대중교통·TMAP). 여기는 이동수단이
     참가자 전원 하나뿐이라(위 이동칸) 선도 한 가지 색으로 충분하다 — 누구 선인지
     가를 필요가 없다. */
  경로들?: { id: string; points: 좌표[] }[];
  /* 네 변이 각각 몇 픽셀씩 **가려지는가** — 셸이 재서 준다(윗칸 높이 · 시트가 올라온 높이 ·
     탭바). 안 주면 사방을 예전처럼 균등하게 비운다. */
  여백?: 여백꼴;
  /* 지금 고른 출발지 번호(0부터). 그 핀만 살짝 떠오르고 위로 올라온다.
     -1 이면 고른 것이 없다. 목업은 끌 때 뜨게 했지만 우리는 드래그가 없어
     '고름'이 그 자리를 대신한다(목업 raiseFocusedPin 3374–3380 과 같은 뜻). */
  고른출발지?: number;
  /* 출발지 핀을 누르면 — 그 출발지 시트를 연다 */
  출발지누름?: (i: number) => void;
  /* 가운데 말풍선을 누르면 — 시트를 연다 */
  가운데누름?: () => void;
  /* 지도 빈 곳을 누르면 — browse ⇄ clean 을 오간다 */
  지도누름?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(13);
  const [c, setC] = useState({ lat: 37.5665, lng: 126.978 });
  const [size, setSize] = useState({ w: 398, h: 280 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /* 타일까지 못 받으면 깨진 그림만 남는다 — 무슨 일인지 말해 준다 (osmmap 과 같은 규칙) */
  const [tileDead, setTileDead] = useState(false);
  const tileFail = useRef(0);

  /* ── 처음 여는 지도는 **지금 있는 자리**를 보여 준다 ────────────────
     전에는 출발지를 넣기 전까지 회색 상자에 "아직 출발지가 없어요" 만 있었다.
     이 자리는 '가운데를 잡아 주는 곳'이라는 것을 **써 보면서** 알게 하려고 둔 곳인데,
     빈 상자로는 지도가 있다는 것조차 안 보였다.

     오늘부터(2026-08-14) 화면을 열자마자 **곧바로** 물어본다 — 눌러야만 물어보던 단추를
     없앴다(사람이 정했다). 거절해도 다시 조르지 않는다: 못 받으면 그냥 조용히 넘어가고
     출발지는 손으로 넣으면 된다 — 지도가 비어 보이는 것도 아니다(아래 "아직 출발지가
     없어요" 안내가 그 자리를 채운다). */
  const [내자리, set내자리] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => set내자리({ lat: p.coords.latitude, lng: p.coords.longitude }),
      /* 거절·시간초과·못 찾음을 가르지 않는다 — 사람이 할 일은 셋 다 같다(출발지를 손으로 넣는다) */
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  /* 출발지가 하나도 없을 때만 내 자리로 지도를 맞춘다 — 출발지가 들어오면
     아래 '출발지에 맞추기' 가 임자다. 둘이 다투면 방금 넣은 출발지가 화면 밖으로 밀린다. */
  useEffect(() => {
    if (!내자리 || 출발지들.length) return;
    setC(내자리);
    setZ(15);            /* 동네가 보이는 배율 — 어디인지 알아볼 수 있어야 '내 자리' 가 뜻이 있다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [내자리, 출발지들.length]);

  /* 타일을 받을 만한 때인가. 전에는 '출발지가 있을 때만' 이었다 —
     홈에 들를 때마다 남의 타일 서버에서 열 몇 장을 받는 것을 막으려던 것이다.
     내 자리를 아는 것도 **보여 줄 것이 생긴** 때라 같이 연다. 둘 다 없으면 여전히 안 받는다. */
  const 그릴것있나 = !!출발지들.length || !!내자리;

  /* ── 카카오 지도 (먼저 시도한다) ──────────────────────────────
     그릴 것이 생기기 전에는 SDK 를 안 부른다 — 홈에 들를 때마다 카카오 사용량을
     쓰는 것을 막으려는 것이다(위 '타일을 받을 만한 때인가'와 같은 뜻). */
  const 카카오맵칸 = useRef<HTMLDivElement>(null);
  const 카카오맵 = useRef<any>(null);
  const 카카오오버레이 = useRef<any[]>([]);
  const 카카오경로선 = useRef<any[]>([]);
  const [카카오죽음, set카카오죽음] = useState(false);
  const [카카오준비, set카카오준비] = useState(false);

  useEffect(() => {
    if (!그릴것있나 || 카카오죽음 || 카카오맵.current) return;
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    /* 열쇠가 없으면 시도할 것도 없다 — 곧장 OSM 폴백으로 (ui.tsx 와 같은 규칙, 논의105) */
    if (!key) { set카카오죽음(true); return; }
    if (!카카오맵칸.current) return;
    const boot = () => window.kakao.maps.load(() => {
      if (!카카오맵칸.current) return;
      카카오맵.current = new window.kakao.maps.Map(카카오맵칸.current, {
        center: new window.kakao.maps.LatLng(c.lat, c.lng), level: 7,
      });
      set카카오준비(true);
    });
    if (window.kakao?.maps) { boot(); return; }
    /* 모임 화면과 같은 스크립트를 또 붙이면 안 된다 — id 로 막는다(ui.tsx 와 같은 수법) */
    const ID = 'kakao-sdk';
    const had = document.getElementById(ID) as HTMLScriptElement | null;
    const el = had ?? document.createElement('script');
    if (!had) {
      el.id = ID;
      el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
      document.head.appendChild(el);
    }
    el.addEventListener('load', boot);
    el.addEventListener('error', () => set카카오죽음(true));
    /* 막히면 error 가 안 오는 경우도 있다 — 시간으로도 잡는다(ui.tsx 와 같은 4초) */
    const t = setTimeout(() => { if (!window.kakao?.maps) set카카오죽음(true); }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [그릴것있나, 카카오죽음]);

  /* 지도 빈 곳을 한 번 누르면 위아래가 밀려 사라진다(clean 모드).
     ⚠ 카카오 지도는 자기 DOM 을 가지고 있어 React 의 onClick 이 안 닿는다 —
     카카오 자신의 이벤트로 걸어야 한다. OSM 폴백은 아래 JSX 의 onClick 이 맡는다.
     `지도누름` 은 셸이 그릴 때마다 새 함수라 ref 에 담아 둔다 — deps 에 넣으면
     리스너를 매번 떼었다 붙인다. */
  const 지도누름칸 = useRef(지도누름);
  지도누름칸.current = 지도누름;
  useEffect(() => {
    const m = 카카오맵.current;
    if (!카카오준비 || !m) return;
    const 손 = () => 지도누름칸.current?.();
    window.kakao.maps.event.addListener(m, 'click', 손);
    return () => window.kakao.maps.event.removeListener(m, 'click', 손);
  }, [카카오준비]);

  /* 창 크기가 바뀌면 카카오 지도도 다시 그려야 한다 — 스스로 못 알아챈다 */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      카카오맵.current?.relayout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 출발지가 바뀔 때마다 다시 맞춘다 — 모임 화면과 규칙이 다른 자리다.
     거기서는 남이 찍을 때마다 지도를 되돌리면 지도를 뺏는 셈이라 한 번만 맞췄지만,
     여기서 지도를 움직이는 사람은 나 하나다. 방금 넣은 출발지가 화면 밖이면 넣은 뜻이 없다.
     ⚠ OSM 폴백에서만 쓴다 — 카카오가 살아 있으면 아래 카카오 효과가 LatLngBounds 로 맞춘다.
     ⚠ 2026-08-22 — **가운데도 상자에 넣는다**(실사용 신고로 찾은 사고: AI 추천은 출발지들의
     기하학적 가운데가 아니라 AI 가 고른 자리라 출발지 상자 밖으로 나갈 수 있다 — 그러면
     핀 좌표는 맞는데 지금 보이는 지도 범위 밖이라 화면에서 통째로 안 보였다. 카카오 쪽은
     이미 가운데를 상자에 넣고 있었다(아래 카카오 효과의 LatLngBounds) — 여기(OSM)만
     빠져 있던 것을 맞춘다. 거리·시간 가운데는 원래도 출발지 상자 안이라(거리는 평균,
     시간도 근처) 못 느꼈을 뿐 같은 사고였다. */
  /* 여백을 안 주면 예전처럼 사방을 똑같이 비운다 — (1-FIT)/2 씩이 그때와 같은 양이다.
     `여백` 을 객체째 deps 에 넣으면 셸이 그릴 때마다 새 객체라 지도가 계속 튄다 —
     네 숫자를 문자열로 굳혀 값이 진짜 바뀔 때만 다시 맞춘다. */
  const 실여백: 여백꼴 = 여백 ?? {
    위: size.h * ((1 - FIT) / 2), 아래: size.h * ((1 - FIT) / 2),
    좌: size.w * ((1 - FIT) / 2), 우: size.w * ((1 - FIT) / 2),
  };
  const 여백서명 = `${Math.round(실여백.위)},${Math.round(실여백.아래)},${Math.round(실여백.좌)},${Math.round(실여백.우)}`;

  const 서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');
  useEffect(() => {
    if (!카카오죽음 || !출발지들.length) return;
    const 점들 = 가운데 ? [...출발지들, 가운데] : 출발지들;
    const 맞춤 = 여백맞추기(점들, { 폭: size.w, 높이: size.h }, 실여백);
    if (!맞춤) return;
    setC(맞춤.가운데);
    setZ(맞춤.배율);
    /* 서명 하나로 출발지 바뀜을 본다 — 배열을 그대로 두면 그릴 때마다 새 배열이라 늘 다시 맞춘다.
       가운데는 좌표 값으로 본다(객체 참조로 보면 매 그리기마다 새 객체라 늘 다시 맞춘다 —
       지도가 사람 손을 뺏듯 자꾸 튄다). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [카카오죽음, 서명, size.w, size.h, 가운데?.lat, 가운데?.lng, 여백서명]);

  /* ── 카카오 지도가 살아 있을 때 — 핀을 얹고 화면을 맞춘다 ──────────
     핀은 CustomOverlay 로 그린다. `.opin` 스타일을 그대로 쓰기 위해 그 안에
     평범한 HTML 을 담는다 — 카카오 마커 아이콘 대신 우리 이름표 모양 그대로 쓰는 것이다. */
  useEffect(() => {
    const m = 카카오맵.current;
    if (!카카오준비 || !m) return;
    카카오오버레이.current.forEach((o) => o.setMap(null));
    카카오오버레이.current = [];

    /* 카카오의 xAnchor·yAnchor 는 안 쓴다(0,0 그대로) — 대신 `.opin`·`.내자리점` 자신의
       transform:translate(...) 이 자리를 잡게 한다. 그래야 OSM 쪽(`자리()`)과 셈이
       똑같아져 두 지도가 정확히 같은 곳에 핀을 찍는다. left:0;top:0 은 그 기준점이다. */
    const 얹기 = (p: { lat: number; lng: number }, html: string) => {
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng), content: html,
        xAnchor: 0, yAnchor: 0, zIndex: 4,
      });
      ov.setMap(m);
      카카오오버레이.current.push(ov);
    };
    /* 가운데 핀처럼 글자에 따옴표가 섞여도 안전해야 하는 자리는 문자열 대신 진짜
       엘리먼트를 얹는다(위 가운데핀엘리먼트 주석 참고) — setContent 는 카카오가
       String·HTMLElement 를 둘 다 받는다. */
    const 얹기엘리먼트 = (p: { lat: number; lng: number }, el: HTMLElement, 층 = 4) => {
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng),
        xAnchor: 0, yAnchor: 0, zIndex: 층,
      });
      ov.setContent(el);
      ov.setMap(m);
      카카오오버레이.current.push(ov);
    };

    if (내자리) {
      얹기(내자리, `<span class="${s.내자리점}" style="left:0;top:0" aria-hidden></span>`);
    }
    출발지들.forEach((o, i) => {
      /* 번호 물방울. 고른 것 하나만 떠오르고 위로 올라온다.
         `얹기` 는 zIndex 4 로 고정이라 여기서는 못 올린다 — 아래 `얹기엘리먼트` 로
         zIndex 를 따로 주는 갈래를 쓴다. */
      const 고름 = i === 고른출발지;
      const 그림 = document.createElement('img');
      그림.src = 핀주소({ 번호: i + 1, 색: 출발지색고르기(i), 뜬정도: 고름 ? 1 : 0 });
      그림.alt = '';
      그림.setAttribute('aria-hidden', 'true');
      그림.draggable = false;
      const 칸 = document.createElement('button');
      칸.type = 'button';
      칸.className = s.출발지핀;
      칸.setAttribute('data-slot', '출발지핀');
      칸.setAttribute('data-번호', String(i + 1));
      칸.setAttribute('aria-label', `출발지 ${i + 1} ${o.이름}`);
      칸.style.cssText = `position:absolute;left:0;top:0;transform:translate(${핀밀기.x}px,${핀밀기.y}px)`;
      칸.appendChild(그림);
      if (출발지누름) 칸.addEventListener('click', (e) => { e.stopPropagation(); 출발지누름(i); });
      얹기엘리먼트(o, 칸, 고름 ? 12 : 7);
    });
    if (가운데) {
      /* 목업의 말풍선(말풍선 + 줄기 + 점). 진짜 엘리먼트로 짓는다 —
         문자열로 짜면 ::before 도, 따옴표 섞인 그림도 차례로 사고가 났다(표식.ts 머리말). */
      얹기엘리먼트(가운데, 가운데표식만들기(s, { 라벨: 가운데라벨, 누름: 가운데누름 }));
    }

    /* 경로선 — 핀보다 먼저 그려 아래 깔린다(모임 화면과 같은 순서) */
    카카오경로선.current.forEach((pl) => pl.setMap(null));
    카카오경로선.current = [];
    (경로들 ?? []).forEach((r) => {
      if (r.points.length < 2) return;
      const pl = new window.kakao.maps.Polyline({
        path: r.points.map((p) => new window.kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 3, strokeColor: '#2f6bff', strokeOpacity: 0.7, strokeStyle: 'solid',
      });
      pl.setMap(m);
      카카오경로선.current.push(pl);
    });

    /* 화면을 맞춘다 — 출발지가 있으면 그걸 다 담게, 없으면(내 자리만) 그 자리로 가깝게 */
    if (출발지들.length) {
      const bounds = new window.kakao.maps.LatLngBounds();
      [...출발지들, ...(가운데 ? [가운데] : [])].forEach((p) =>
        bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng)));
      /* 카카오는 (위, 오른쪽, 아래, 왼쪽) 순으로 여백을 받는다 — 셸이 준 값을 그대로 넘긴다.
         전에는 사방 56px 고정이었다. 전체화면에서는 그러면 시트가 아래를 340px 이나 덮는데도
         지도는 그걸 모르고 맞춰서, 아래쪽 핀이 시트에 깔렸다. */
      m.setBounds(bounds,
        Math.round(실여백.위), Math.round(실여백.우),
        Math.round(실여백.아래), Math.round(실여백.좌));
    } else if (내자리) {
      m.setCenter(new window.kakao.maps.LatLng(내자리.lat, 내자리.lng));
      m.setLevel(5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [카카오준비, 서명, 가운데?.lat, 가운데?.lng, 가운데라벨, 내자리?.lat, 내자리?.lng, 경로들, 여백서명, 가운데누름, 고른출발지, 출발지누름]);

  const origin = (() => {
    const p = toPx(c.lat, c.lng, z);
    return { ox: p.x - size.w / 2, oy: p.y - size.h / 2 };
  })();

  /* 배율은 소수다(출발지를 화면에 딱 맞추려면 정수로는 못 맞춘다).
     타일은 정수 배율로만 있으니 가장 가까운 것을 가져와 늘려 붙인다. */
  const tz = Math.max(0, Math.min(19, Math.round(z)));
  const TS = TILE * 2 ** (z - tz);
  const tiles: { k: string; url: string; left: number; top: number }[] = [];
  const max = 2 ** tz;
  for (let tx = Math.floor(origin.ox / TS); tx <= Math.floor((origin.ox + size.w) / TS); tx++) {
    for (let ty = Math.floor(origin.oy / TS); ty <= Math.floor((origin.oy + size.h) / TS); ty++) {
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max;
      tiles.push({
        k: `${tz}/${tx}/${ty}`, url: `https://tile.openstreetmap.org/${tz}/${wx}/${ty}.png`,
        left: tx * TS - origin.ox, top: ty * TS - origin.oy,
      });
    }
  }

  /* 카카오가 살아 있으면 이 손짓은 쓸 데가 없다 — 카카오 지도가 제 스스로 끌기를 맡는다.
     아래 두 함수가 건드리는 c·z 는 OSM 폴백에서만 읽는 상태라 그냥 둬도 해는 없지만,
     헛일을 안 하는 편이 낫다. */
  const down = (e: React.PointerEvent) => {
    if (!카카오죽음) return;
    drag.current = { x: e.clientX, y: e.clientY };
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 그냥 끌면 된다 */ }
  };
  const move = (e: React.PointerEvent) => {
    if (!카카오죽음) return;
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < 3) return;
    d.x = e.clientX; d.y = e.clientY;
    const p = toPx(c.lat, c.lng, z);
    setC(toLatLng(p.x - dx, p.y - dy, z));
  };
  const up = useCallback(() => { drag.current = null; }, []);

  /* 화면 밖 핀은 안 그린다 — 안으로 밀어 넣으면 없는 곳을 가리키는 이름표가 된다 */
  const 자리 = (p: { lat: number; lng: number }) => {
    const q = toPx(p.lat, p.lng, z);
    const x = q.x - origin.ox, y = q.y - origin.oy;
    return x >= -40 && x <= size.w + 40 && y >= -40 && y <= size.h + 40 ? { x, y } : null;
  };
  /* 예전에는 여기 `비켜()` 가 있었다 — 왼쪽 위 확대·축소 단추(`.ozoom`)를 이름표가 덮어서,
     그 언저리에 앉는 것 하나를 아래로 밀어냈다. **이제 필요 없다**: 지도가 화면을 꽉 채우면서
     그 단추를 홈 안에서만 아래로 내렸고(홈.module.css 의 `.셸 :global(.ozoom)`),
     출발지도 이름표가 아니라 번호 물방울이 됐다. 근거가 없어진 규칙은 남기지 않는다. */

  return (
    /* 전역 `.osm`(globals.css:196)이 `position:absolute; inset:0` 을 준다 —
       카드였을 때는 `.지도칸` 이 자리를 잡아 줬고, 지금은 셸이 그 노릇을 한다.
       `data-slot` 은 시험이 붙잡는 자리다(모듈 클래스는 해시돼 못 찾는다). */
    <div ref={box} className="osm" data-slot="지도"
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      /* 빈 곳 누르기. 카카오 지도가 **실제로 살아 있을 때만** 위 효과가 맡는다 —
         그때 이 onClick 은 카카오 DOM 밑에 깔려 안 불린다.
         ⚠ `카카오죽음` 으로 가르면 안 된다: 그릴 것이 하나도 없으면(`그릴것있나`=false)
         카카오를 **시작조차 안 해서** 죽지도 살지도 않은 채로 남는다 — 그 상태에서는
         카카오 리스너도 없고 이 onClick 도 안 걸려 탭이 통째로 사라진다(실측으로 확인).
         '카카오가 붙었는가'(`카카오준비`)로 갈라야 세 경우가 다 덮인다. */
      onClick={() => { if (!카카오준비) 지도누름?.(); }}
      role="img" aria-label={출발지들.length ? `출발지 ${출발지들.length}곳과 가운데를 얹은 지도`
        : 내자리 ? '지금 있는 자리를 짚은 지도' : '빈 지도'}>
      {/* 카카오 지도 칸 — 죽지 않은 동안은 늘 마련해 둔다(ref 를 미리 잡아야 로딩 효과가 붙는다).
          그릴 것이 없으면(그릴것있나=false) 로딩 자체를 시작 안 하므로 이 칸도 빈 채로 있다. */}
      {!카카오죽음 && <div ref={카카오맵칸} style={{ position: 'absolute', inset: 0 }} />}

      {/* 카카오가 막혔을 때만 OSM 타일을 그린다(그릴링 논의27과 같은 규칙) */}
      {카카오죽음 && 그릴것있나 && tiles.map((t) => (
        <img key={t.k} src={t.url} alt="" draggable={false}
          onLoad={() => { tileFail.current = 0; setTileDead(false); }}
          onError={() => { if (++tileFail.current >= 3) setTileDead(true); }}
          /* 1px 겹쳐 그린다 — 소수 배율에서 타일 사이에 흰 줄이 보인다 */
          style={{ position: 'absolute', width: TS + 1, height: TS + 1, left: t.left, top: t.top,
            visibility: tileDead ? 'hidden' : undefined }} />
      ))}

      {카카오죽음 && tileDead && (
        <div className="tiledead">
          <b>지도를 불러오지 못했어요</b>
          <span>잠시 뒤에 다시 열어 보세요</span>
        </div>
      )}

      {/* 경로선(OSM 폴백) — 핀보다 먼저 그려 아래 깔린다. 카카오 쪽은 위 Polyline 이 맡는다. */}
      {카카오죽음 && !tileDead && !!경로들?.length && (
        <svg width={size.w} height={size.h}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'none' }}>
          {경로들.map((r) => {
            if (r.points.length < 2) return null;
            const 꺾은선 = r.points
              .map((p) => { const q = toPx(p.lat, p.lng, z); return `${q.x - origin.ox},${q.y - origin.oy}`; })
              .join(' ');
            return (
              <polyline key={r.id} points={꺾은선} fill="none" stroke="#2f6bff"
                strokeWidth={3} strokeOpacity={0.7} strokeLinecap="round" strokeLinejoin="round" />
            );
          })}
        </svg>
      )}

      {/* 그릴 것이 하나도 없을 때만 덮는다 — 지도를 띄워 놓고 어디인지도 모르게 두는 것보다 낫다.
          단추는 없다: 위에서 이미 스스로 내 위치를 물어봤다(그래도 안 잡히면 손으로 넣으면 된다).
          카카오·OSM 어느 쪽이든 같다 — 둘 다 '보여 줄 자리'가 없으면 뜻이 없는 안내다. */}
      {!그릴것있나 && (
        <div className="tiledead">
          <b>아직 출발지가 없어요</b>
          <span>위 검색칸에서 출발지를 넣어 보세요</span>
        </div>
      )}

      {/* 카카오가 막혔을 때만 — 핀을 우리 손으로 얹는다(살아 있으면 위 카카오 효과가
          CustomOverlay 로 같은 일을 한다). */}
      {카카오죽음 && !tileDead && 그릴것있나 && (
        <>
          {/* 지금 있는 자리 — 출발지 핀과 헷갈리면 안 된다. 점은 파랗게 뛰고 이름표가 따로 붙는다.
              출발지가 들어온 뒤에도 그대로 둔다: 내가 어디 있는지가 가운데를 읽는 잣대가 된다. */}
          {내자리 && (() => {
            const q = 자리(내자리);
            if (!q) return null;
            return (
              /* `data-slot` 은 시험이 붙잡는 자리다 — CSS 모듈이 한글 클래스명을 통째로 해시로
                 바꿔 버려(`_________Azf_F`) 클래스로는 못 찾는다. 다른 화면과 같은 방식이다. */
              <span key="내자리" data-slot="내자리" className={s.내자리점}
                style={{ left: q.x, top: q.y }} aria-hidden />
            );
          })()}
          {출발지들.map((o, i) => {
            const q = 자리(o);
            if (!q) return null;
            const 고름 = i === 고른출발지;
            /* 카카오 쪽과 **같은 SVG** 다(핀그림.ts) — 두 지도가 같아 보여야 한다 */
            return (
              <button key={`출발${i}${o.lat}`} type="button" className={s.출발지핀}
                data-slot="출발지핀" data-번호={i + 1}
                aria-label={`출발지 ${i + 1} ${o.이름}`}
                style={{ left: q.x, top: q.y, zIndex: 고름 ? 12 : 7,
                  transform: `translate(${핀밀기.x}px, ${핀밀기.y}px)` }}
                onClick={(e) => { e.stopPropagation(); 출발지누름?.(i); }}>
                <img src={핀주소({ 번호: i + 1, 색: 출발지색고르기(i), 뜬정도: 고름 ? 1 : 0 })}
                  alt="" draggable={false} aria-hidden />
              </button>
            );
          })}
          {가운데 && (() => {
            const q = 자리(가운데);
            if (!q) return null;
            /* 카카오 쪽과 **같은 엘리먼트**를 붙인다(표식.ts) — 두 지도가 갈라지지 않게.
               React 가 만드는 대신 ref 로 넣는 까닭도 거기 적혀 있다. */
            return (
              <span key="가운데" style={{ position: 'absolute', left: q.x, top: q.y }}
                ref={(el) => {
                  if (!el) return;
                  el.replaceChildren(가운데표식만들기(s, { 라벨: 가운데라벨, 누름: 가운데누름 }));
                }} />
            );
          })()}
        </>
      )}

      {/* 확대·축소 단추는 OSM 폴백에만 그린다 — 카카오는 제 손가락 확대·스크롤을 스스로 받는다.
          저작권 표시도 OSM 을 실제로 쓸 때만 뜻이 있다. */}
      {카카오죽음 && 그릴것있나 && (
        <>
          <div className="ozoom" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={(e) => { e.stopPropagation(); setZ((v) => Math.min(18, v + 1)); }} aria-label="확대">＋</button>
            <button onClick={(e) => { e.stopPropagation(); setZ((v) => Math.max(5, v - 1)); }} aria-label="축소">－</button>
          </div>
          {/* 라이선스 표시는 OSM 이용 조건이다 */}
          <a className="ocred" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </>
      )}
    </div>
  );
}
