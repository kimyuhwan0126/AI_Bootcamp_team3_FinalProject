'use client';
/* 홈 셸 — 목업 ①(탐색) 화면.

   **전체화면 지도 위에** 검색바와 출발지 줄이 떠 있고, 아래에서 바텀시트가
   올라온다. 지금까지의 홈(위→아래로 스크롤하는 문서, app/탐색/탐색.tsx)과 뼈대가 다르다.

   화면 상태 셋 (목업 screens/home.js 3160–3163)
     browse — 검색바 + 출발지 줄 + 현위치 + 탭바.  시트는 화면 밖
     clean  — 현위치만.                            지도를 한 번 탭하면 이리로
     상세    — 바텀시트 + 현위치.                   탭바는 내려간다

   데이터 흐름은 지금 판을 그대로 옮겼다 — 두고 가기(sessionStorage) · AI 자동 갱신 ·
   가운데 지명 되짚기 · 출발지별 경로. 값과 문구를 바꾸지 않았다.

   ⚠ `app/탐색/` 은 **안 지운다.** 이 파일이 잘못되면 `app/page.tsx` 한 줄만 되돌리면
   예전 홈이 그대로 돌아온다. 지우는 것은 F단계 몫이다. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Origin, Transport } from '../originfield';
import { 실어보내기, 두고간것읽기, 두고가기 } from '@/lib/넘기기';
import { 열쇠, 가운데 as 가운데셈, 더할수있나 } from '@/lib/출발지';
import { 수단표기 } from '@/lib/수단표기';
import { 갈래고르기, 갈래그림, 갈래들, type 갈래 as 갈래이름 } from '@/lib/장소갈래';
import { 출발지색고르기 } from './핀그림';
import type { RouteStep } from '@/lib/routes';
import { use시트 } from './시트끌기';
import 지도 from './지도';
import 윗칸 from './윗칸';
import 떠있는단추 from './떠있는단추';
import 시트내용가운데, { type 상세경로 } from './시트내용_가운데';
import 시트내용출발지 from './시트내용_출발지';
import s from './홈.module.css';

type 모드 = 'browse' | 'clean' | '상세';

/* `/api/places` 가 주는 한 곳. 화면이 쓰는 만큼만 적는다. */
type 장소 = {
  id: string; name: string; address: string; lat: number; lng: number;
  category?: string;
  /** 술집을 음식점에서 갈라내는 것은 이것뿐이다(lib/장소갈래.ts) */
  categoryDetail?: string;
};

/* 시트 요약 줄의 '빼기' 그림. 글자('삭제')가 아니라 아이콘인 까닭은 그 줄이 한 줄이라
   이름이 잘리기 때문이다 — 무슨 단추인지는 `aria-label`·`title` 이 말한다. */
const 휴지통 = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" />
  </svg>
);

export default function 홈() {
  /* 두고 간 것을 읽기 전에는 아무것도 안 얹는다 — 서버가 그린 첫 그림과 어긋나지 않게
     (지금 판 탐색.tsx:61–63 의 `준비` 깃발과 같은 수법). */
  const [준비, set준비] = useState(false);
  const [출발지들, set출발지들] = useState<Origin[]>([]);
/* 이동 수단은 **출발지마다** 하나씩이다(2026-08-19 사용자 요청) — 차를 가져오는 사람과
     지하철로 오는 사람이 한 모임에 섞이므로, 하나로 묶으면 둘 중 한쪽은 늘 틀린 시간을 본다.
     고르는 자리는 그 출발지의 시트다(시트내용_출발지.tsx).

     열쇠는 `lib/출발지.ts` 의 `열쇠(o)` 다 — 차례(index)로 잡으면 앞엣것을 뺐을 때
     남은 사람들의 수단이 한 칸씩 밀린다. 안 적힌 사람은 대중교통이다(만들기 폼의 기본값과 같다).
     ⚠ 두고 가는 것(sessionStorage)에는 안 담는다 — `lib/넘기기.ts` 가 담는 것은 출발지뿐이라
     탭을 다시 열면 모두 대중교통으로 돌아온다. 담으려면 그 파일의 꼴부터 바꿔야 한다. */
  const [수단들, set수단들] = useState<Record<string, Transport>>({});
  const 수단보기 = useCallback((o: Origin): Transport => 수단들[열쇠(o)] ?? 'transit', [수단들]);
  /* 기준(거리/AI). 2026-08-19 에 칩 줄 아래 기준 단추를 빼면서 바꿀 길이 없어졌다가,
     2026-08-20 에 **AI 둥근 단추**로 돌아왔다(윗칸.tsx 의 `.AI줄`) — 그 단추가 이것을
     'AI' 로 켜고, 펼쳐진 칩 줄의 'off' 가 '거리' 로 되돌린다. */
  const [기준, set기준] = useState<'거리' | 'AI'>('거리');
  /* AI 추천 칩 줄이 펼쳐져 있나. 단추를 다시 누르거나 화면 딴 데를 누르면 닫힌다. */
  const [AI열림, setAI열림] = useState(false);
  const [모드, set모드] = useState<모드>('browse');
  const [초점, set초점] = useState(0);
  /* 칩 3단 탭(목업 chipTap 3603–3623 — 지도 이동 → 시트 열기 → 시트 내리기)은
     2026-08-20 에 사람이 정해 뺐다. 칩은 이제 **지도를 그 자리로 옮기는 일 하나만** 한다:
     같은 단추가 세 가지 일을 하면 무엇이 일어날지 누르기 전에 알 수 없었다.
     그 출발지 시트는 지도 핀을 눌러 연다. */
  /* 시트가 무엇을 보여 주는가 — 가운데인가, 어느 출발지인가 */
  const [고른것, set고른것] = useState<{ 갈래: '가운데' } | { 갈래: '출발지'; i: number }>({ 갈래: '가운데' });
  const [쪽지, set쪽지] = useState<string | null>(null);
  /* 과녁 단추가 지도를 어디에 맞춰 뒀나 — 두 자리를 오간다(내자리 ↔ 전체).
     **지도를 손으로 만지면 '없음'으로 풀린다**(2026-08-20 사용자 요청) — 지도가 이미
     그 자리를 떠났는데 단추만 켜져 있으면 거짓말이 된다. 푸는 일은 지도가 알려 준다
     (`손댐알림`). 아이콘 색·바깥 링이 이 값을 그대로 읽는다. */
  const [맞춤, set맞춤] = useState<'없음' | '내자리' | '전체'>('없음');
  /* 지도에게 "지금 한 번 맞춰라"고 시키는 표. 갈래만 보내면 같은 갈래를 거듭 눌렀을 때
     아무 일도 안 일어난다 — 회차를 함께 올려 누를 때마다 닿게 한다. */
  const [맞춤요청, set맞춤요청] = useState<{
    갈래: '내자리' | '전체' | '한곳';
    /** '한곳' 일 때 어디로 — 칩을 누른 그 출발지다 */
    점?: { lat: number; lng: number };
    회차: number;
  }>({ 갈래: '전체', 회차: 0 });
  /* ── 주변 탐색(E단계) ──────────────────────────────────
     중간지점 핀이 있을 때만 켤 수 있다 — 둘레를 물어볼 한가운데가 없으면 뜻이 없다.
     켜면 상단 출발지 줄이 갈래 줄로 바뀌고(홈.module.css 의 `.셸[data-탐색]`),
     중간지점 둘레의 장소가 지도에 핀으로 얹힌다. */
  const [탐색, set탐색] = useState(false);
  /* 켜 둔 갈래 — **한 번에 하나뿐이다**(2026-08-20 사용자 요청). 한 번 누르면 지도에
     뜨고, 같은 칩을 다시 누르면 사라진다. 다른 칩을 누르면 그리로 갈아탄다.
     '전체' 칩은 같은 날 뺐다 — 아무것도 안 켠 처음 자리가 곧 예전의 '전체 끄기'다.
     ⚠ 처음에는 **비어 있다**: 탐색을 켜자마자 수십 개가 쏟아지면 중간지점 말풍선이
     묻힌다. 무엇을 볼지는 사람이 고른다. */
  const [켠갈래, set켠갈래] = useState<갈래이름 | null>(null);
  const [장소들, set장소들] = useState<장소[]>([]);
  const [장소상태, set장소상태] = useState<'idle' | '구하는중' | '못구함' | '한도끝'>('idle');
  const [고른장소, set고른장소] = useState<string | null>(null);

  /* 지금 있는 자리 — 묻는 곳은 지도 하나뿐이라(app/홈/지도.tsx) 알아내면 이리로 알려 준다.
     여기서 또 물으면 권한 팝업이 두 번 뜬다. 모르면 null 이고, 그때는 과녁 단추가
     '내자리' 단계를 건너뛴다. */
  const [내자리, set내자리] = useState<{ lat: number; lng: number } | null>(null);

  const [AI결과, setAI결과] = useState<{ name: string; lat: number; lng: number }[] | null>(null);
  const [AI상태, setAI상태] = useState<'idle' | '구하는중' | '못구함' | '한도끝'>('idle');
  const [AI고름, setAI고름] = useState(0);
  const [가운데지명, set가운데지명] = useState<string | null>(null);
  const [경로들, set경로들] = useState<상세경로[]>([]);
  const [경로구하는중, set경로구하는중] = useState(false);

  useEffect(() => {
    const 두고간것 = 두고간것읽기();
    if (두고간것) { set출발지들(두고간것.출발지들); set수단들(두고간것.수단들); }
    set준비(true);
  }, []);

  /* 출발지와 수단은 **함께 담는다**(lib/넘기기.ts 머리말) — 따로 담으면 한쪽만 살아
     돌아오는 날이 온다. 뺀 사람의 수단은 여기서 함께 버린다: 안 버리면 담기는 글자가
     계속 늘고, 같은 곳을 뺐다가 다시 넣었을 때 전에 골라 둔 값이 말없이 되살아난다. */
  const 바꾸기 = useCallback((다음: Origin[]) => {
    const 남는열쇠 = new Set(다음.map(열쇠));
    const 다음수단 = Object.fromEntries(
      Object.entries(수단들).filter(([k]) => 남는열쇠.has(k)),
    ) as Record<string, Transport>;
    set출발지들(다음);
    set수단들(다음수단);
    두고가기(다음, 다음수단);
  }, [수단들]);

  /* 쪽지는 잠깐만 뜬다. 목업은 1800ms 다. */
  const 쪽지시계 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const 알림쪽지 = useCallback((말: string) => {
    set쪽지(말);
    if (쪽지시계.current) clearTimeout(쪽지시계.current);
    쪽지시계.current = setTimeout(() => set쪽지(null), 1800);
  }, []);
  useEffect(() => () => { if (쪽지시계.current) clearTimeout(쪽지시계.current); }, []);

  const 고름 = useCallback((o: Origin) => {
    /* 한국 밖 · 8곳 넘음 · 이미 넣은 곳 — 셋을 가르는 잣대와 문구는 `lib/출발지.ts` 하나다 */
    const 안되는말 = 더할수있나(출발지들, o);
    /* 안내 줄이 없어진 뒤로 이 말을 전하는 것은 쪽지 하나뿐이다(윗칸.tsx 머리말) */
    if (안되는말) { 알림쪽지(안되는말); return; }
    바꾸기([...출발지들, o]);
    set초점(출발지들.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [출발지들, 바꾸기]);

  const 빼기 = useCallback((i: number) => {
    바꾸기(출발지들.filter((_, k) => k !== i));
    set초점((v) => Math.max(0, Math.min(v, 출발지들.length - 2)));
    /* 보고 있던 출발지를 뺐으면 시트가 없는 사람을 가리키게 된다 — 가운데로 되돌린다.
       뒤엣것을 뺐으면 번호가 하나씩 당겨지므로 그것도 맞춰 준다. */
    set고른것((전) => {
      if (전.갈래 !== '출발지') return 전;
      if (전.i === i) return { 갈래: '가운데' };
      return 전.i > i ? { 갈래: '출발지', i: 전.i - 1 } : 전;
    });
  }, [출발지들, 바꾸기]);

  /* ── 가운데 ─────────────────────────────────────────────
     `app/m/[code]/ui.tsx` 와 **같은 셈**이다(lib/출발지.ts) — 두 화면이 다른 가운데를
     말하면 홈에서 본 자리와 모임에서 여는 자리가 어긋난다.

     ⚠ **출발지가 1곳 이하면 가운데를 아예 안 잡는다**(2026-08-20 사용자 요청).
     한 곳뿐일 때의 '가운데'는 그 출발지 자신이라, 같은 자리에 핀을 두 번 찍고
     '가운데까지 0분' 같은 뜻 없는 값이 줄줄이 따라 나왔다. 여기서 null 로 끊으면
     핀 · 오는 길 · 지명 되짚기 · 시트 펼치기가 **한꺼번에** 멎는다 — 그 넷이 모두
     `지도가운데` 를 보고 있기 때문이다(아래). */
  const 거리가운데 = useMemo(
    () => (출발지들.length >= 2 ? 가운데셈(출발지들) : null),
    [출발지들],
  );
  const 출발지서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');
  /* 누구 하나라도 수단을 바꾸면 이 글자가 바뀐다 — 경로 다시 찾기의 방아쇠다 */
  const 수단서명 = 출발지들.map((o) => 수단보기(o)).join('|');

  /* AI 기준을 켜 두면 출발지가 바뀔 때마다 알아서 다시 묻는다(2026-08-23 사용자 요청).
     손을 멈추면(350ms) 한 번만 부른다 — 연달아 여러 곳 넣어도 다 넣고 나서 한 번이다.
     비용 안전판은 `/api/home-ai` 쪽 기기별 횟수 한도(lib/ratelimit.ts, 1분 5번)가 맡는다. */
  useEffect(() => {
    /* 2곳 미만이면 잡을 가운데가 없다(위 `거리가운데`) — 물어봐야 얹을 자리가 없다 */
    if (기준 !== 'AI' || 출발지들.length < 2) { setAI결과(null); setAI상태('idle'); setAI고름(0); return; }
    let 살아있나 = true;
    setAI상태('구하는중');
    const t = setTimeout(() => {
      fetch('/api/home-ai', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origins: 출발지들.map((o) => ({ name: o.name, lat: o.lat, lng: o.lng })) }),
      }).then(async (r) => {
        if (!살아있나) return;
        if (r.status === 429) { setAI상태('한도끝'); setAI결과(null); return; }
        if (!r.ok) { setAI상태('못구함'); setAI결과(null); return; }
        const j = await r.json().catch(() => null);
        const picks = Array.isArray(j?.picks) ? j.picks : [];
        if (!picks.length) { setAI상태('못구함'); setAI결과(null); return; }
        setAI고름(0); setAI결과(picks); setAI상태('idle');
      }).catch(() => { if (살아있나) { setAI상태('못구함'); setAI결과(null); } });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [기준, 출발지서명]);

  const AI가운데 = 기준 === 'AI' ? (AI결과?.[AI고름] ?? null) : null;
  const 지도가운데 = 기준 === 'AI' ? AI가운데 : 거리가운데;

  /* 시트를 펼칠 수 있는가 = 보여 줄 가운데가 잡혔는가.
     화면 모드가 아니라 **내용이 있는가**로 가른다 — 까닭은 시트끌기.ts 머리말에 적었다
     (지도가 죽으면 말풍선이 없어져 시트에 닿을 길이 사라진다). */
  const 펼칠수있나 = !!지도가운데;
  const 시트 = use시트(펼칠수있나);

  /* 핀 이름표는 "가운데" 같은 우리 말이 아니라 그 자리의 실제 지명이다(2026-08-22 사용자 요청).
     AI 는 예외다 — AI 가 이미 그 자리의 이름을 주었다(왕복 하나를 아끼고, AI 가 추천한
     이름과 어긋나지도 않는다). */
  useEffect(() => {
    set가운데지명(null);
    if (!지도가운데 || 기준 === 'AI') return;
    let 살아있나 = true;
    const { lat, lng } = 지도가운데;
    const t = setTimeout(() => {
      fetch(`/api/geo?lat=${lat}&lng=${lng}`).then((r) => (r.ok ? r.json() : null))
        .then((g) => { if (살아있나) set가운데지명(g?.name ?? null); })
        .catch(() => { if (살아있나) set가운데지명(null); });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [지도가운데?.lat, 지도가운데?.lng, 기준]);

  const 가운데라벨 = 기준 === 'AI'
    ? (AI가운데?.name ?? 'AI 추천')
    : 가운데지명 ?? '가운데';

  /* 출발지마다 지금 뜬 가운데까지 오는 길 — 모임 화면과 같은 `/api/routes` 를 쓴다.
     수단이 사람마다 다르므로 `mode` 도 사람마다 다르다. 한 사람 것만 바꿔도 여기서
     전부 다시 부르지만, 카카오·TMAP 응답은 `lib/routes.ts` 가 좌표+수단별로 20분 담아
     두므로 실제로 바깥까지 나가는 것은 바뀐 그 하나다. */
  useEffect(() => {
    const 목적지 = 지도가운데;
    if (!목적지 || !출발지들.length) { set경로들([]); set경로구하는중(false); return; }
    let 살아있나 = true;
    set경로구하는중(true);
    const t = setTimeout(async () => {
      const 결과 = await Promise.all(출발지들.map(async (o) => {
        try {
          const qs = new URLSearchParams({
            fromLat: String(o.lat), fromLng: String(o.lng),
            toLat: String(목적지.lat), toLng: String(목적지.lng), mode: 수단보기(o),
          });
          const r = await fetch(`/api/routes?${qs}`);
          if (!r.ok) return null;
          const j = await r.json();
          if (!j.found) return null;
          return {
            id: 열쇠(o), points: Array.isArray(j.points) ? j.points : [],
            distanceM: j.distanceM ?? null, durationS: j.durationS ?? null,
            steps: Array.isArray(j.steps) ? (j.steps as RouteStep[]) : undefined,
          } as 상세경로;
        } catch { return null; }
      }));
      if (살아있나) { set경로들(결과.filter((x): x is 상세경로 => !!x)); set경로구하는중(false); }
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [지도가운데?.lat, 지도가운데?.lng, 출발지서명, 수단서명]);

  /* ── 주변 탐색 — 중간지점 둘레의 장소 ────────────────────
     `/api/places` 는 카카오 카테고리 검색을 쓰고 막히면 OSM 으로 내려간다(lib/places.ts).
     화면이 카카오를 직접 안 부른다 — 키를 숨기고 한도 오류를 한 곳에서 옮긴다.

     ⚠ 가운데가 사라지면(출발지가 1곳 이하로 줄면) 탐색 자체를 끈다 — 둘레를 물어볼
     한가운데가 없는데 칩 줄만 남으면 고를 것 없는 칩이 된다.
     반경 1km 는 '걸어서 갈 만한 둘레'다(기본값 300m 는 역 하나도 못 담았다). */
  useEffect(() => {
    if (!탐색 || !지도가운데) { set장소들([]); set장소상태('idle'); set고른장소(null); return; }
    let 살아있나 = true;
    set장소상태('구하는중');
    const { lat, lng } = 지도가운데;
    const t = setTimeout(() => {
      fetch(`/api/places?lat=${lat}&lng=${lng}&r=1000&for=home`)
        .then(async (r) => {
          if (!살아있나) return;
          if (r.status === 429) { set장소상태('한도끝'); set장소들([]); return; }
          if (!r.ok) { set장소상태('못구함'); set장소들([]); return; }
          const j = await r.json().catch(() => null);
          const 곳들 = Array.isArray(j?.places) ? (j.places as 장소[]) : [];
          if (!곳들.length) { set장소상태('못구함'); set장소들([]); return; }
          set장소들(곳들); set장소상태('idle');
        })
        .catch(() => { if (살아있나) { set장소상태('못구함'); set장소들([]); } });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [탐색, 지도가운데?.lat, 지도가운데?.lng]);

  /* 가운데가 없어지면 탐색도 함께 내려간다 — 단추가 사라지는데 모드만 남으면
     출발지 줄이 갈래 줄에 가려진 채 되돌릴 길이 없다. */
  useEffect(() => { if (!지도가운데 && 탐색) set탐색(false); }, [지도가운데, 탐색]);

  /* 지금 갈래로 걸러 낸 것 — '전체'는 갈래를 모르는 곳까지 다 보여 준다(lib/장소갈래.ts) */
  const 보일장소들 = useMemo(
    () => (켠갈래 ? 장소들.filter((p) => 갈래고르기(p.category, p.categoryDetail) === 켠갈래) : []),
    [켠갈래, 장소들],
  );
  const 갈래누름 = useCallback((g: 갈래이름) => {
    set고른장소(null);
    /* 같은 칩이면 끄고, 다른 칩이면 그리로 갈아탄다 — 한 번에 하나뿐이다 */
    set켠갈래((전) => (전 === g ? null : g));
  }, []);
  /* 칩은 **실제로 있는 갈래만** 세운다 — 눌러도 지도가 비는 칩을 두지 않는다 */
  const 있는갈래들 = useMemo(() => {
    const 셈 = new Set(장소들.map((p) => 갈래고르기(p.category, p.categoryDetail)).filter(Boolean));
    return 갈래들.filter((g) => 셈.has(g.이름));
  }, [장소들]);
  /* 지도에 얹을 꼴로 — 그림은 갈래가 정한다. 새 배열이 매번 나면 지도가 핀을 다시 그리므로
     서명이 같으면 같은 배열을 쥐고 있게 useMemo 로 묶는다. */
  const 지도장소들 = useMemo(
    () => 보일장소들.map((p) => ({
      id: p.id, name: p.name, lat: p.lat, lng: p.lng, 그림: 갈래그림(p.category, p.categoryDetail),
    })),
    [보일장소들],
  );

  const 장소누름 = useCallback((id: string) => {
    const p = 장소들.find((x) => x.id === id);
    if (!p) return;
    set고른장소(id);
    알림쪽지(p.address ? `${p.name} · ${p.address}` : p.name);
  }, [장소들, 알림쪽지]);

  const 탐색누름 = useCallback(() => {
    set고른장소(null);
    set켠갈래(null);          /* 껐다 켜면 다시 아무것도 안 켜진 자리에서 시작한다 */
    set탐색((v) => !v);
  }, []);

  /* ── AI 추천 단추 ────────────────────────────────────────
     첫 누름은 기준을 'AI' 로 켜고 칩 줄을 편다. 그 다음부터는 칩 줄만 여닫는다 —
     기준을 되돌리는 것은 칩 줄의 'off' 하나뿐이다(2026-08-20 사용자 요청). */
  const AI누름 = useCallback(() => {
    if (출발지들.length < 2) return;
    if (기준 === 'AI') { setAI열림((v) => !v); return; }
    set기준('AI'); setAI열림(true);
  }, [기준, 출발지들.length]);

  const AI끄기 = useCallback(() => {
    /* 기준이 '거리'로 돌아가면 위 효과가 AI결과·상태·고름을 스스로 지운다 */
    set기준('거리'); setAI열림(false);
  }, []);

  /* ── 탭바에 모드를 알린다 ────────────────────────────────
     탭바는 셸 **밖**(app/layout.tsx)에 있어 CSS 로 못 닿는다. body 에 적어 두면
     globals.css 의 한 규칙이 그걸 보고 미끄러뜨린다. 지우지는 않는다 —
     `.tabdot`(아직 안 고른 모임이 있다는 표)이 죽으면 안 된다. */
  useEffect(() => {
    const 값 = 모드 === 'browse' ? '보임' : '숨김';
    document.body.setAttribute('data-홈모드', 값);
    return () => document.body.removeAttribute('data-홈모드');
  }, [모드]);

  /* 시트가 쉬는 자리 — 모드마다 다르다.
       clean  숨김  지도만 보는 자리다
       browse 미니  요약 한 줄만. **이 줄이 시트로 들어가는 늘 열린 길이다** —
                    지도가 죽어 말풍선이 안 그려져도 여기로 닿는다(시트끌기.ts 머리말)
       상세    반    말풍선을 눌러 들어온 자리
     사람이 손으로 끌어 둔 자리를 덮지 않으려면, 모드가 **바뀔 때만** 세운다.

     ⚠ 탭바가 오르내리면(.3s) 시트가 쓸 수 있는 높이도 달라져 다시 재야 하는데,
     그 타이머 안에서 `시트.재기` 를 **그대로 부르면 안 된다.** 이 효과는 모드가 바뀔 때만
     도므로 클로저가 그때의 `시트` 를 붙잡고 있고, 그 안의 `재기` 는 자기가 만들어질 때의
     `지금자리` 로 시트를 되돌린다 — 실제로 첫 화면에서 '미니'로 섰다가 340ms 뒤
     '숨김'으로 되돌아가는 사고가 났다(실측으로 확인). 살아 있는 값을 ref 로 집어 온다. */
  const 시트참 = useRef(시트);
  시트참.current = 시트;
  useEffect(() => {
    if (!펼칠수있나) return;
    시트참.current.재기();
    시트참.current.가기(모드 === 'clean' ? '숨김' : 모드 === '상세' ? '반' : '미니', true);
    /* 탭바가 다 움직인 뒤 한 번 더 — 그때의 높이로 스냅을 다시 잡는다 */
    const t = setTimeout(() => 시트참.current.재기(), 340);
    return () => clearTimeout(t);
  }, [모드, 펼칠수있나]);

  /* ── 지도에 줄 여백 ─────────────────────────────────────
     위는 윗칸이 실제로 덮는 높이, 아래는 시트가 올라온 높이 + 탭바.
     사방을 똑같이 비우면 핀이 시트 밑으로 반쯤 들어간다(tests/지도셈.mjs 가 못 박은 경우). */
  const [여백, set여백] = useState({ 위: 120, 아래: 120, 좌: 24, 우: 24 });
  useEffect(() => {
    const 재기 = () => {
      const 윗 = document.querySelector<HTMLElement>('[data-slot="윗칸"]');
      const 시트칸 = 시트.시트칸.current;
      const 셸 = 시트.셸칸.current;
      if (!셸) return;
      const 윗높이 = 모드 === 'browse' && 윗 ? 윗.offsetHeight + 12 : 24;
      const 탭바 = document.querySelector<HTMLElement>('nav.tabbar');
      const 탭바높이 = 모드 === 'browse' && 탭바 ? 탭바.offsetHeight : 0;
      const 시트보임 = 시트칸
        ? Math.max(0, 시트칸.offsetHeight - (시트칸.getBoundingClientRect().top - 셸.getBoundingClientRect().top))
        : 0;
      set여백({ 위: 윗높이, 아래: 탭바높이 + 시트보임 + 24, 좌: 24, 우: 24 });
    };
    /* 시트가 미끄러지는 동안(.32s) 여러 번 재면 지도가 계속 튄다 — 끝난 뒤 한 번만 잰다 */
    const t = setTimeout(재기, 360);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [모드, 시트.지금자리, 출발지서명]);

  /* ── 손짓 ──────────────────────────────────────────────── */
  /* 사람이 지도를 끌거나 눌렀다 — 지도는 이제 우리가 맞춰 둔 자리에 없다.
     과녁 단추를 기본 상태로 되돌린다(2026-08-20 사용자 요청): 켜진 채로 두면
     '지금 현위치를 보고 있다'는 거짓말이 된다. 다음 누름은 다시 1단부터다.
     ⚠ 핀 목록(`홀로`)은 안 건드린다 — 여기서 되돌리면 핀이 하나에서 전부로 바뀌며
     지도가 다시 맞춰져, 손댄 지도를 안 건드리려던 뜻이 무너진다. */
  const 손댐 = useCallback(() => set맞춤('없음'), []);

  const 지도누름 = useCallback(() => {
    set모드((m) => (m === '상세' ? 'browse' : m === 'browse' ? 'clean' : 'browse'));
  }, []);

  /* 말풍선을 누르면 상세로 — 시트를 어디에 세울지는 위 효과가 맡는다 */
  const 가운데누름 = useCallback(() => {
    set고른것({ 갈래: '가운데' });
    set모드('상세');
  }, []);

  /* 시트의 '‹ 뒤로' 는 2026-08-20 에 머리 블록과 함께 사라졌다 — 가운데로 돌아가는 길은
     지도의 가운데 말풍선을 누르는 것이다. */

  /* 칩을 누르면 — **지도를 그 출발지로 옮긴다. 그것뿐이다**(2026-08-20 사용자 요청).
     시트도 화면 모드도 안 건드린다. 그 출발지의 자세한 것은 지도 핀을 눌러 연다. */
  const 칩누름 = useCallback((i: number) => {
    const o = 출발지들[i];
    if (!o) return;
    set초점(i);
    /* 지도가 그 자리로 가니 과녁 단추의 '내자리/전체' 도 더는 참이 아니다 */
    set맞춤('없음');
    set맞춤요청((전) => ({ 갈래: '한곳', 점: { lat: o.lat, lng: o.lng }, 회차: 전.회차 + 1 }));
  }, [출발지들]);

  /* 지도의 핀을 바로 눌렀을 때 — 그 출발지 시트를 연다 */
  const 출발지핀누름 = useCallback((i: number) => {
    set초점(i); set맞춤('없음');
    set고른것({ 갈래: '출발지', i });
    set모드('상세');
  }, []);

  /* 범위 맞추기 — 두 단계로 돈다(2026-08-20 사용자 요청).
       한 번째  지금 있는 자리로 (내 위치를 모르면 이 단계를 건너뛴다)
       두 번째  출발지 전체 + 가운데가 다 보이게
     전에는 첫 단계가 '눈이 가 있는 출발지 하나'였다 — 칩을 눌러 이미 갈 수 있는 자리라
     단추 하나를 더 쓸 값이 없었고, 정작 '내가 지금 어디인지'로 돌아올 길이 없었다.

     ⚠ **출발지가 1곳 이하면 두 번째 자리가 없다**(2026-08-20 사용자 요청) — 한 점을
     담는 것은 그 점을 가운데에 놓는 것이라 '지금 있는 자리'와 하는 일이 다를 바 없고,
     한 곳도 없으면 담을 것 자체가 없다. 그때는 몇 번을 눌러도 현위치에 머문다.
     전에는 두 번째 누름이 "출발지를 2곳 이상 넣어 주세요" 쪽지만 띄우고 아무 데도
     안 갔다 — 누른 값이 없는 누름이었다. */
  const 전체쓸수있나 = 출발지들.length >= 2 && !!지도가운데;
  /* 다음 누름이 어디로 갈 것인가. 단추 이름표(떠있는단추.tsx)와 `맞추기` 가 같은 셈을
     봐야 '이름표는 전체라는데 현위치로 가는' 어긋남이 안 생긴다. */
  const 다음맞춤: '내자리' | '전체' = !전체쓸수있나 ? '내자리'
    : !내자리 ? '전체'
    : 맞춤 === '내자리' ? '전체' : '내자리';

  const 맞추기 = useCallback(() => {
    if (다음맞춤 === '내자리' && !내자리) {
      알림쪽지(출발지들.length
        ? '지금 위치를 알 수 없어요 — 출발지를 2곳 이상 넣어 주세요'
        : '지금 위치를 알 수 없어요 — 출발지를 넣어 보세요');
      return;
    }
    set맞춤(다음맞춤);
    set맞춤요청((전) => ({ 갈래: 다음맞춤, 회차: 전.회차 + 1 }));
    /* 쪽지는 **'전체 N곳 ↔ 중간지점' 을 보여 줄 때만** 띄운다(2026-08-20 사용자 요청) —
       현위치로 갈 때는 지도가 내 자리로 옮겨 간 것이 그대로 보이므로 덧붙일 말이 없다.
       'N곳'과 '어디까지'는 그 자리에 안 적혀 있으니 그때만 말로 거든다.
       못 간 까닭(위치를 모른다 · 출발지가 모자라다)은 위에서 따로 말한다. */
    if (다음맞춤 === '전체') 알림쪽지(`전체 ${출발지들.length}곳 ↔ ${가운데라벨}`);
  }, [다음맞춤, 내자리, 출발지들.length, 가운데라벨, 알림쪽지]);

  /* ── 무슨 말을 할 것인가 ──────────────────────────────────
     시트는 가운데가 잡혔을 때만 펼쳐진다(= 출발지 2곳 이상) — 그래서 '출발지를 더 넣어
     주세요' 갈래는 여기 없다. 그 말은 지도 위 쪽지가 한다(`알림쪽지`).
     '참가자들의 출발지 한가운데를 잡아요.' 도 2026-08-20 에 뺐다 — 요약 줄이 이미
     '추천 중간지점 · 거리 기준'이라 적고 있어 같은 말이 두 번이었다.
     빈 글자면 시트가 그 줄 자체를 안 그린다(시트내용_가운데.tsx). */
  const 안내 = 기준 === '거리' ? ''
    : AI상태 === '구하는중' ? '여러 조건을 살펴 AI가 장소를 추천해요. 추천받는 중…'
    : AI상태 === '한도끝' ? '지금은 너무 여러 번 물었어요 — 잠시 뒤에 다시 시도할게요.'
    : AI상태 === '못구함' ? '지금은 AI 추천을 받을 수 없어요 — 출발지를 살짝 바꾸면 다시 시도해요.'
    /* 후보가 왔으면 시트는 아무 말도 안 한다(2026-08-20 사용자 요청) — 고르는 칩줄은
       윗칸에 있고, 잡힌 곳 이름은 시트 제목이 이미 크게 적고 있다. */
    : AI결과 ? ''
    : '여러 조건을 살펴 AI가 장소를 추천해요.';

  const 수단정하기 = useCallback((o: Origin, t: Transport) => {
    const 다음 = { ...수단들, [열쇠(o)]: t };
    set수단들(다음);
    두고가기(출발지들, 다음);
  }, [수단들, 출발지들]);

  /* 칩에 붙는 '· 대중교통' — 무엇을 적을지는 `lib/수단표기.ts` 가 정한다.
     **고른 카테고리 그대로**다(2026-08-20 사용자 요청) — 경로를 읽어 '지하철'로 갈라
     적던 것을 그만뒀다. 실제 구간은 그 출발지 시트의 '오는 길'이 말해 준다. */
  const 칩수단 = useCallback((i: number) => {
    const o = 출발지들[i];
    if (!o) return '';
    return 수단표기(수단보기(o));
  }, [출발지들, 수단보기]);

  /* 지금 고른 출발지의 경로와 '이 사람이 가장 오래 걸리는가'.
     시트 요약 줄과 출발지 시트가 함께 쓴다. */
  const 고른경로 = 고른것.갈래 === '출발지' && 출발지들[고른것.i]
    ? (경로들.find((r) => r.id === 열쇠(출발지들[고른것.i])) ?? null)
    : null;
  const 가장오래인가 = (() => {
    if (고른경로?.durationS == null) return false;
    const 잰것 = 경로들.map((r) => r.durationS).filter((v): v is number => v != null);
    return 잰것.length > 1 && 고른경로.durationS === Math.max(...잰것);
  })();

  return (
    <div ref={시트.셸칸} className={s.셸} data-slot="홈셸"
      data-모드={모드} data-탐색={탐색 ? 'on' : 'off'}
      data-출발지수={출발지들.length} data-기준={기준}
      /* 시험이 '고른 기준이 실제로 지도에 닿았는지'를 잴 수 있는 유일한 자리다
         (지금 판 탐색.tsx:272–273 에서 그대로 옮겼다 — 모양도 같다). */
      data-가운데={지도가운데 ? `${지도가운데.lat},${지도가운데.lng}` : ''}>

      <지도
        출발지들={출발지들.map((o) => ({ 이름: o.name, lat: o.lat, lng: o.lng }))}
        가운데={지도가운데} 가운데라벨={가운데라벨} 경로들={경로들}
        여백={여백} 고른출발지={고른것.갈래 === '출발지' ? 고른것.i : -1}
        출발지누름={출발지핀누름} 가운데누름={가운데누름} 지도누름={지도누름}
        내자리알림={set내자리} 맞춤요청={맞춤요청} 손댐알림={손댐}
        장소들={지도장소들} 고른장소={고른장소} 장소누름={장소누름} />

      {준비 && (
        <윗칸 출발지들={출발지들} 고름={고름} 빼기={빼기}
          초점={초점} 칩누름={칩누름}
          수단표기={칩수단}
          기준={기준} AI열림={AI열림} AI상태={AI상태} AI결과={AI결과} AI고름={AI고름}
          AI누름={AI누름} AI고르기={setAI고름} AI끄기={AI끄기} AI닫기={() => setAI열림(false)}
          탐색={탐색} 켠갈래={켠갈래} 갈래누름={갈래누름} 갈래들={있는갈래들}
          장소상태={장소상태} 장소수={보일장소들.length} />
      )}

      <떠있는단추 현위치칸={시트.현위치칸} 쪽지칸={시트.쪽지칸} 탐색칸={시트.탐색칸}
        맞춤={맞춤} 다음={다음맞춤} 맞추기={맞추기} 쪽지={쪽지}
        /* 탐색 단추는 **중간지점 핀이 지도에 있을 때만** 뜬다(2026-08-20 사용자 요청) —
           둘레를 물어볼 한가운데가 없으면 누를 값이 없다. `hidden` 으로 감춘다:
           시트끌기.ts 의 `배치()` 가 그 표를 보고 쪽지 높이를 다시 쌓는다. */
        탐색보임={!!지도가운데} 탐색={탐색} 탐색누름={탐색누름} />

      {/* ⚠ 시트를 `display:none` 으로 감추지 않는다 — '숨김'은 화면 밖으로 미는 스냅이다
          (시트끌기.ts 머리말). 늘 그려 두고 자리만 옮긴다. */}
      <div ref={시트.시트칸} className={s.시트} data-slot="시트" data-스냅={시트.지금자리}>
        <button ref={시트.손잡이칸} type="button" className={s.손잡이} data-slot="시트손잡이"
          aria-expanded={시트.지금자리 !== '숨김' && 시트.지금자리 !== '미니'}
          aria-controls="시트본문" aria-label="정보 시트 펼치기 또는 접기"
          onPointerDown={시트.손잡이내림} onPointerMove={시트.손잡이이동}
          onPointerUp={시트.손잡이올림} onPointerCancel={시트.손잡이올림}
          onKeyDown={시트.손잡이키}>
          {/* 집게(그립) 하나만 둔다 — 조작 안내 문구는 2026-08-20 에 사람이 정해 뺐다.
              끌 수 있다는 것은 집게 모양이 이미 말하고, 시트가 서는 자리마다 문구가 바뀌어
              눈길을 뺏었다. 되살릴 일이 생기면 사람에게 먼저 묻는다. */}
          <span className={s.집게} aria-hidden />
        </button>

        {/* 시트를 끝까지 내려도 이 줄은 남는다 — '지금 무엇을 보고 있는지'가 안 사라진다.
            출발지 갈래는 2026-08-20 에 **한 줄 폼**이 됐다(사람이 정했다):
              (번호) (출발지)   (가운데)까지 (소요시간)   [빼기]
            시트 본문에 있던 머리 블록(이름·거리 줄·[지도에서 보기/삭제])이 같은 것을 또
            말하고 있어 통째로 뺐고, 그 삭제 단추가 이 줄의 휴지통으로 왔다
            (시트내용_출발지.tsx 머리말). */}
        <div ref={시트.요약칸} className={s.시트요약} data-slot="시트요약">
          {고른것.갈래 === '출발지' && 출발지들[고른것.i] ? (
            <>
              <span className={s.그림} style={{ ['--c' as string]: 출발지색고르기(고른것.i) }}
                aria-hidden>{고른것.i + 1}</span>
              <span className={s.이름}>{출발지들[고른것.i].name}</span>
              <span className={s.요약값}>
                {가운데라벨}까지 <b>{고른경로?.durationS != null
                  ? `${Math.round(고른경로.durationS / 60)}분` : '—'}</b>
              </span>
              {/* 마지막 한 곳까지 빼면 가운데가 사라져 화면이 통째로 빈다 — 막되
                  **왜 막혔는지**를 읽어 주는 기계에도 말해 준다(옛 삭제 단추와 같은 규칙) */}
              <button type="button" className={s.요약삭제} data-slot="시트삭제"
                onClick={() => 빼기(고른것.i)} disabled={출발지들.length <= 1}
                aria-label={`${출발지들[고른것.i].name} 빼기`}
                title={출발지들.length > 1 ? '이 출발지 빼기' : '출발지는 최소 한 곳은 남아야 해요'}>
                {휴지통}
              </button>
            </>
          ) : (
            <>
              <span className={s.그림} data-민낯 aria-hidden>중</span>
              <span className={s.이름}>{가운데라벨}</span>
              {/* 시트 안 눈썹('추천 중간지점 · 거리 기준')이 2026-08-20 에 이리로 왔다 —
                  자리를 대신한 '2곳 / 거리 기준'은 아래 '이동 요약'이 이미 세고 있었다. */}
              <span className={s.요약값}>추천 중간지점 · {기준 === 'AI' ? 'AI 추천' : '거리 기준'}</span>
            </>
          )}
        </div>

        <div ref={시트.본문칸} id="시트본문" className={s.시트본문} data-slot="시트본문"
          onPointerDown={시트.본문내림} onPointerMove={시트.본문이동}
          onPointerUp={시트.본문올림} onPointerCancel={시트.본문올림}>
          {고른것.갈래 === '출발지' && 출발지들[고른것.i] ? (
            <시트내용출발지
              출발지={출발지들[고른것.i]}
              이동수단={수단보기(출발지들[고른것.i])}
              이동수단정하기={(t) => 수단정하기(출발지들[고른것.i], t)}
              경로={고른경로} 경로구하는중={경로구하는중} 가장오래={가장오래인가} />
          ) : (
            <시트내용가운데
              출발지들={출발지들} 가운데라벨={가운데라벨} 안내={안내}
              경로들={경로들}
              /* 폼은 수단을 하나만 받는다 — 첫 출발지의 것을 싣는다. 폼이 첫 출발지로
                 채워진다고 바로 위에서 말하고 있으니, 수단도 같은 사람 것이라야 말이 맞는다. */
              짐싣기={() => 실어보내기({ 출발지들, 이동수단: 출발지들[0] ? 수단보기(출발지들[0]) : 'transit' })} />
          )}
        </div>
      </div>
    </div>
  );
}
