'use client';
/* 홈 셸 — 목업 ①(탐색) 화면.

   **전체화면 지도 위에** 검색바·출발지 줄·기준 단추가 떠 있고, 아래에서 바텀시트가
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

export default function 홈() {
  /* 두고 간 것을 읽기 전에는 아무것도 안 얹는다 — 서버가 그린 첫 그림과 어긋나지 않게
     (지금 판 탐색.tsx:61–63 의 `준비` 깃발과 같은 수법). */
  const [준비, set준비] = useState(false);
  const [출발지들, set출발지들] = useState<Origin[]>([]);
  const [이동수단, set이동수단] = useState<Transport>('transit');
  const [알림, set알림] = useState('');
  const [기준, set기준] = useState<'거리' | 'AI'>('거리');
  const [모드, set모드] = useState<모드>('browse');
  const [초점, set초점] = useState(0);
  /* 칩 3단 탭 (목업 chipTap 3603–3623) — 같은 칩을 거듭 누르면 한 단씩 나아간다.
       1 지도만 그 자리로 · 2 시트 열림 · 3 시트만 내려감
     다른 칩을 누르면 1단으로 되돌아간다. `누른칩` 이 -1 이면 아직 아무 칩도 안 눌렀다. */
  const [누른칩, set누른칩] = useState(-1);
  const [탭단계, set탭단계] = useState(0);
  /* 시트가 무엇을 보여 주는가 — 가운데인가, 어느 출발지인가 */
  const [고른것, set고른것] = useState<{ 갈래: '가운데' } | { 갈래: '출발지'; i: number }>({ 갈래: '가운데' });
  const [쪽지, set쪽지] = useState<string | null>(null);
  const [맞춤, set맞춤] = useState<'없음' | '첫곳' | '전체'>('없음');

  const [AI결과, setAI결과] = useState<{ name: string; lat: number; lng: number }[] | null>(null);
  const [AI상태, setAI상태] = useState<'idle' | '구하는중' | '못구함' | '한도끝'>('idle');
  const [AI고름, setAI고름] = useState(0);
  const [가운데지명, set가운데지명] = useState<string | null>(null);
  const [경로들, set경로들] = useState<상세경로[]>([]);
  const [경로구하는중, set경로구하는중] = useState(false);
  const [펼친것, set펼친것] = useState<Set<string>>(new Set());

  useEffect(() => {
    const 두고간것 = 두고간것읽기();
    if (두고간것) set출발지들(두고간것);
    set준비(true);
  }, []);

  const 바꾸기 = useCallback((다음: Origin[]) => { set출발지들(다음); 두고가기(다음); }, []);

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
    if (안되는말) { set알림(안되는말); 알림쪽지(안되는말); return; }
    set알림('');
    바꾸기([...출발지들, o]);
    set초점(출발지들.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [출발지들, 바꾸기]);

  const 빼기 = useCallback((i: number) => {
    set알림('');
    바꾸기(출발지들.filter((_, k) => k !== i));
    set초점((v) => Math.max(0, Math.min(v, 출발지들.length - 2)));
    /* 보고 있던 출발지를 뺐으면 시트가 없는 사람을 가리키게 된다 — 가운데로 되돌린다.
       뒤엣것을 뺐으면 번호가 하나씩 당겨지므로 그것도 맞춰 준다. */
    set고른것((전) => {
      if (전.갈래 !== '출발지') return 전;
      if (전.i === i) return { 갈래: '가운데' };
      return 전.i > i ? { 갈래: '출발지', i: 전.i - 1 } : 전;
    });
    set누른칩(-1); set탭단계(0);
  }, [출발지들, 바꾸기]);

  /* ── 가운데 ─────────────────────────────────────────────
     `app/m/[code]/ui.tsx` 와 **같은 셈**이다(lib/출발지.ts) — 두 화면이 다른 가운데를
     말하면 홈에서 본 자리와 모임에서 여는 자리가 어긋난다. */
  const 거리가운데 = useMemo(() => 가운데셈(출발지들), [출발지들]);
  const 출발지서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');

  /* AI 기준을 켜 두면 출발지가 바뀔 때마다 알아서 다시 묻는다(2026-08-23 사용자 요청).
     손을 멈추면(350ms) 한 번만 부른다 — 연달아 여러 곳 넣어도 다 넣고 나서 한 번이다.
     비용 안전판은 `/api/home-ai` 쪽 기기별 횟수 한도(lib/ratelimit.ts, 1분 5번)가 맡는다. */
  useEffect(() => {
    if (기준 !== 'AI' || !출발지들.length) { setAI결과(null); setAI상태('idle'); setAI고름(0); return; }
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

  /* 출발지마다 지금 뜬 가운데까지 오는 길 — 모임 화면과 같은 `/api/routes` 를 쓴다 */
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
            toLat: String(목적지.lat), toLng: String(목적지.lng), mode: 이동수단,
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
  }, [지도가운데?.lat, 지도가운데?.lng, 출발지서명, 이동수단]);

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
  const 지도누름 = useCallback(() => {
    set모드((m) => (m === '상세' ? 'browse' : m === 'browse' ? 'clean' : 'browse'));
  }, []);

  /* 말풍선을 누르면 상세로 — 시트를 어디에 세울지는 위 효과가 맡는다 */
  const 가운데누름 = useCallback(() => {
    set고른것({ 갈래: '가운데' });
    set누른칩(-1); set탭단계(0);
    set모드('상세');
  }, []);

  /* 출발지 시트에서 '‹ 뒤로' — 가운데로 돌아간다 */
  const 뒤로 = useCallback(() => {
    set고른것({ 갈래: '가운데' });
    set누른칩(-1); set탭단계(0);
  }, []);

  /* 칩을 누를 때. 같은 칩이면 한 단 나아가고, 다른 칩이면 1단으로 되돌아간다. */
  const 칩누름 = useCallback((i: number) => {
    set초점(i);
    set맞춤('없음');
    if (누른칩 !== i) {
      /* 1단 — 지도만 그 자리로 옮긴다. 시트는 안 건드린다. */
      set누른칩(i); set탭단계(1);
      set고른것({ 갈래: '가운데' });
      set모드('browse');
      return;
    }
    if (탭단계 === 1) {
      /* 2단 — 그 출발지 시트를 연다 */
      set탭단계(2);
      set고른것({ 갈래: '출발지', i });
      set모드('상세');
      return;
    }
    if (탭단계 === 2) {
      /* 3단 — 시트만 내린다. 초점은 그 자리에 남는다(지도는 안 움직인다). */
      set탭단계(3);
      set고른것({ 갈래: '가운데' });
      set모드('browse');
      return;
    }
    /* 3단 다음은 다시 2단 — 두 자리를 오간다 */
    set탭단계(2);
    set고른것({ 갈래: '출발지', i });
    set모드('상세');
  }, [누른칩, 탭단계]);

  /* 지도의 핀을 바로 눌렀을 때 — 칩 순환 단계도 맞춰 둔다.
     안 맞추면 그 다음 칩 탭이 '시트 내리기'가 아니라 '처음부터'가 된다. */
  const 출발지핀누름 = useCallback((i: number) => {
    set초점(i); set맞춤('없음');
    set누른칩(i); set탭단계(2);
    set고른것({ 갈래: '출발지', i });
    set모드('상세');
  }, []);

  /* 범위 맞추기 — 두 단계로 돈다. 첫 번째는 눈이 가 있는 출발지와 가운데, 두 번째는 전체. */
  const 맞추기 = useCallback(() => {
    if (!지도가운데) { 알림쪽지('출발지를 2곳 이상 넣어 주세요'); return; }
    const 다음 = 맞춤 === '첫곳' ? '전체' : '첫곳';
    set맞춤(다음);
    알림쪽지(다음 === '전체'
      ? `전체 ${출발지들.length}곳 ↔ ${가운데라벨}`
      : `${초점 + 1}. ${출발지들[초점]?.name ?? '출발지'} ↔ ${가운데라벨}`);
  }, [맞춤, 지도가운데, 출발지들, 초점, 가운데라벨, 알림쪽지]);

  const 지도점들 = useMemo(() => {
    if (맞춤 === '첫곳' && 출발지들[초점]) return [출발지들[초점]];
    return 출발지들;
  }, [맞춤, 출발지들, 초점]);

  /* ── 무슨 말을 할 것인가 ──────────────────────────────── */
  const 안내 = 출발지들.length === 0
    ? '출발지를 2곳 이상 넣으면 가운데와 그 둘레를 보여 드려요.'
    : 출발지들.length === 1
      ? '출발지를 하나 더 넣으면 두 곳의 가운데를 잡아 줘요.'
      : 기준 === '거리' ? '참가자들의 출발지 한가운데를 잡아요.'
      : AI상태 === '구하는중' ? '여러 조건을 살펴 AI가 장소를 추천해요. 추천받는 중…'
      : AI상태 === '한도끝' ? '지금은 너무 여러 번 물었어요 — 잠시 뒤에 다시 시도할게요.'
      : AI상태 === '못구함' ? '지금은 AI 추천을 받을 수 없어요 — 출발지를 살짝 바꾸면 다시 시도해요.'
      : AI결과 ? '여러 조건을 살펴 AI가 장소를 추천해요. 아래에서 다른 곳으로 바꿔 볼 수 있어요.'
      : '여러 조건을 살펴 AI가 장소를 추천해요.';

  /* browse 에서 시트는 화면 밖이다 — 처음 온 사람에게 말을 거는 것은 윗칸의 안내 줄뿐이다.
     둘 이상 넣어 가운데가 잡히면 그 줄은 물러난다(시트가 같은 말을 더 자세히 한다). */
  const 윗안내 = 출발지들.length < 2 ? 안내 : (알림 || null);

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

  const 토글 = useCallback((k: string) => set펼친것((전) => {
    const 다음 = new Set(전);
    if (다음.has(k)) 다음.delete(k); else 다음.add(k);
    return 다음;
  }), []);

  return (
    <div ref={시트.셸칸} className={s.셸} data-slot="홈셸"
      data-모드={모드} data-탐색="off"
      data-출발지수={출발지들.length} data-기준={기준}
      /* 시험이 '고른 기준이 실제로 지도에 닿았는지'를 잴 수 있는 유일한 자리다
         (지금 판 탐색.tsx:272–273 에서 그대로 옮겼다 — 모양도 같다). */
      data-가운데={지도가운데 ? `${지도가운데.lat},${지도가운데.lng}` : ''}>

      <지도
        출발지들={지도점들.map((o) => ({ 이름: o.name, lat: o.lat, lng: o.lng }))}
        가운데={지도가운데} 가운데라벨={가운데라벨} 경로들={경로들}
        여백={여백} 고른출발지={고른것.갈래 === '출발지' ? 고른것.i : -1}
        출발지누름={출발지핀누름} 가운데누름={가운데누름} 지도누름={지도누름} />

      {준비 && (
        <윗칸 출발지들={출발지들} 고름={고름} 빼기={빼기}
          초점={초점} 칩누름={칩누름} 열린칩={고른것.갈래 === '출발지' ? 고른것.i : -1}
          기준={기준} 기준바꾸기={() => set기준((v) => (v === '거리' ? 'AI' : '거리'))}
          안내={윗안내} />
      )}

      <떠있는단추 현위치칸={시트.현위치칸} 쪽지칸={시트.쪽지칸}
        맞춤={맞춤} 맞추기={맞추기} 쪽지={쪽지} />

      {/* ⚠ 시트를 `display:none` 으로 감추지 않는다 — '숨김'은 화면 밖으로 미는 스냅이다
          (시트끌기.ts 머리말). 늘 그려 두고 자리만 옮긴다. */}
      <div ref={시트.시트칸} className={s.시트} data-slot="시트" data-스냅={시트.지금자리}>
        <button ref={시트.손잡이칸} type="button" className={s.손잡이} data-slot="시트손잡이"
          aria-expanded={시트.지금자리 !== '숨김' && 시트.지금자리 !== '미니'}
          aria-controls="시트본문" aria-label="정보 시트 펼치기 또는 접기"
          onPointerDown={시트.손잡이내림} onPointerMove={시트.손잡이이동}
          onPointerUp={시트.손잡이올림} onPointerCancel={시트.손잡이올림}
          onKeyDown={시트.손잡이키}>
          <span className={s.집게} aria-hidden />
          <span className={s.힌트}>
            {시트.지금자리 === '미니' ? '위로 올리면 자세히'
              : 시트.지금자리 === '가득' ? '아래로 끌어 접기'
              : '아래로 내리면 요약만 남아요'}
          </span>
        </button>

        {/* 시트를 끝까지 내려도 이 줄은 남는다 — '지금 무엇을 보고 있는지'가 안 사라진다 */}
        <div ref={시트.요약칸} className={s.시트요약} data-slot="시트요약">
          {고른것.갈래 === '출발지' && 출발지들[고른것.i] ? (
            <>
              <span className={s.그림} style={{ ['--c' as string]: 출발지색고르기(고른것.i) }}
                aria-hidden>{고른것.i + 1}</span>
              <span className={s.이름}>{출발지들[고른것.i].name}</span>
              <span className={s.오른쪽}>
                <span className={s.큰값}>{고른경로?.durationS != null
                  ? `${Math.round(고른경로.durationS / 60)}분` : '—'}</span>
                <span className={s.잔값}>{가운데라벨}까지</span>
              </span>
            </>
          ) : (
            <>
              <span className={s.그림} data-민낯 aria-hidden>중</span>
              <span className={s.이름}>{가운데라벨}</span>
              <span className={s.오른쪽}>
                <span className={s.큰값}>{출발지들.length}곳</span>
                <span className={s.잔값}>{기준 === 'AI' ? 'AI 추천' : '거리 기준'}</span>
              </span>
            </>
          )}
        </div>

        <div ref={시트.본문칸} id="시트본문" className={s.시트본문} data-slot="시트본문"
          onPointerDown={시트.본문내림} onPointerMove={시트.본문이동}
          onPointerUp={시트.본문올림} onPointerCancel={시트.본문올림}>
          {고른것.갈래 === '출발지' && 출발지들[고른것.i] ? (
            <시트내용출발지
              출발지={출발지들[고른것.i]} 번호={고른것.i} 가운데라벨={가운데라벨}
              이동수단={이동수단} 경로={고른경로} 경로구하는중={경로구하는중}
              가장오래={가장오래인가} 뒤로={뒤로}
              지도에서보기={() => { set초점(고른것.i); set맞춤('첫곳'); set모드('browse'); }}
              삭제={() => 빼기(고른것.i)} 뺄수있나={출발지들.length > 1} />
          ) : (
            <시트내용가운데
              출발지들={출발지들} 가운데라벨={가운데라벨} 기준={기준} 안내={안내}
              AI결과={AI결과} AI고름={AI고름} AI고르기={setAI고름}
              이동수단={이동수단} 이동수단정하기={set이동수단}
              경로들={경로들} 경로구하는중={경로구하는중}
              열쇠로={열쇠} 펼친것={펼친것} 토글={토글}
              짐싣기={() => 실어보내기({ 출발지들, 이동수단 })} />
          )}
        </div>
      </div>
    </div>
  );
}
