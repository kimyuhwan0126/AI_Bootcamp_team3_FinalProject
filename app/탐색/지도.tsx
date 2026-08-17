'use client';
/* 홈 탐색용 지도 — 출발지 핀과 가운데 핀을 얹는다.

   모임 화면의 지도(`app/m/[code]/ui.tsx` · `osmmap.tsx`)를 그대로 못 쓰는 까닭:
   그 물건은 `Candidate` 를 받아 선택 수·이름표 겹침 풀기·묶기·누르면 후보 올리기까지 한다.
   여기는 로그인도 모임도 없는 자리라 후보가 아예 없다 — 핀을 얹는 일만 남는다.

   ⚠ 2026-08-14 — **카카오를 먼저 시도하고, 막히면 OSM으로 내려간다**(그릴링 논의27과
   같은 규칙 — 모임 화면과 여기가 서로 다른 지도를 쓰면 안 된다는 게 원래 논의였다).
   전에는 여기만 OSM 을 곧장 썼는데(카카오 시도조차 안 함), 그러면 카카오가 멀쩡히
   살아 있어도 맛보기 화면만 늘 OSM 으로 보였다 — 그건 그릴링과 다른 동작이었다.
   `ui.tsx` 의 카카오 로딩 방식을 그대로 옮겨 왔다 — 고칠 일이 생기면 두 곳이다.
   타일 셈(toPx·toLatLng)은 OSM 폴백에서만 쓴다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import s from './탐색.module.css';

declare global { interface Window { kakao: any } }

export type 점 = { 이름: string; lat: number; lng: number };
/* 경로선의 꺾인 점은 이름이 없다 — 위 점(핀)과는 다른 물건이라 따로 둔다 */
type 좌표 = { lat: number; lng: number };

const TILE = 256;
const toPx = (lat: number, lng: number, z: number) => {
  const n = 2 ** z * TILE;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  };
};
const toLatLng = (x: number, y: number, z: number) => {
  const n = 2 ** z * TILE;
  const k = Math.PI - (2 * Math.PI * y) / n;
  return {
    lng: (x / n) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))),
  };
};

/* 출발지 상자가 지도의 이만큼을 채우게 맞춘다 — 남는 여백은 이름표 몫이다 (osmmap 과 같은 값) */
const FIT = 0.72;

/* 가운데(확정된 자리) 핀 — 물방울 그림 + 이름표(2026-08-21).
   처음엔 `.opin[data-goal]::before`(globals.css, content:attr(data-label))로 얹었는데,
   실제 카카오 지도(Vercel)에서 이름표가 "가" 한 글자만 핀에 겹쳐 나오는 사고가 났다
   — 카카오 CustomOverlay 가 이 자리(가운데)만 raw HTML 문자열로 넣는데, 그 오버레이
   래퍼가 넘치는(::before 로 박스 밖까지 삐져나오는) 그림을 잘라내는 것으로 보인다
   (OSM 폴백·모임 화면은 각각 진짜 React DOM·JS 로 자식 엘리먼트를 쌓아서 넘칠 일이
   없었고, 그래서 실제로는 안 걸렸다). 그래서 여기(카카오 raw HTML)만은 이름표·꼬리·
   핀을 처음부터 겹치지 않는 형제 엘리먼트로 쌓는다 — app/m/[code]/ui.tsx 의
   목표핀만들기() 와 같은 생각, DOM 대신 문자열로 짠 것만 다르다.
   ⚠ 그림을 바꾸면 globals.css(.opin[data-goal])·ui.tsx(목표핀만들기)도 같이 고쳐라. */
const 목표핀그림 = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40' viewBox='0 0 30 40'><path d='M15 0C6.716 0 0 6.716 0 15c0 11.25 15 25 15 25s15-13.75 15-25C30 6.716 23.284 0 15 0z' fill='%23FF3B4E'/><circle cx='15' cy='15' r='6' fill='white'/></svg>\") no-repeat center/contain";
const 가운데핀HTML = (라벨: string) => `
  <div style="position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:default" aria-label="${라벨}">
    <span style="background:#FF3B4E;color:#fff;font-size:12px;font-weight:800;padding:6px 13px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(20,26,40,.28);margin-bottom:2px">${라벨}</span>
    <span style="width:0;height:0;margin-bottom:3px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #FF3B4E"></span>
    <span style="width:30px;height:40px;background:${목표핀그림}"></span>
  </div>`;

export default function 지도({ 출발지들, 가운데, 가운데라벨 = '가운데', 경로들 }: {
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
     ⚠ OSM 폴백에서만 쓴다 — 카카오가 살아 있으면 아래 카카오 효과가 LatLngBounds 로 맞춘다. */
  const 서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');
  useEffect(() => {
    if (!카카오죽음 || !출발지들.length) return;
    const la = 출발지들.map((o) => o.lat), ln = 출발지들.map((o) => o.lng);
    const 상자가운데 = {
      lat: (Math.min(...la) + Math.max(...la)) / 2,
      lng: (Math.min(...ln) + Math.max(...ln)) / 2,
    };
    setC(상자가운데);
    /* 한 곳뿐이거나 다 붙어 있으면 상자가 0이라 배율이 끝까지 튄다 — 지역만큼은 남긴다 */
    const 반y = Math.max((Math.max(...la) - Math.min(...la)) / 2, 0.004);
    const 반x = Math.max((Math.max(...ln) - Math.min(...ln)) / 2, 0.004);
    const 위 = toPx(상자가운데.lat + 반y, 상자가운데.lng - 반x, 0);
    const 아래 = toPx(상자가운데.lat - 반y, 상자가운데.lng + 반x, 0);
    const 맞는배율 = Math.log2(Math.min((size.w * FIT) / (아래.x - 위.x), (size.h * FIT) / (아래.y - 위.y)));
    setZ(Math.max(4, Math.min(17, 맞는배율)));
    /* 서명 하나로 출발지 바뀜을 본다 — 배열을 그대로 두면 그릴 때마다 새 배열이라 늘 다시 맞춘다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [카카오죽음, 서명, size.w, size.h]);

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

    if (내자리) {
      얹기(내자리, `<span class="${s.내자리점}" style="left:0;top:0" aria-hidden></span>`);
    }
    출발지들.forEach((o) => {
      얹기(o, `<span class="opin" style="left:0;top:0;cursor:default">${o.이름}</span>`);
    });
    if (가운데) {
      /* 물방울 지도 핀 + 이름표(사용자가 준 참고 이미지, 2026-08-18 · 2026-08-21) —
         `.opin[data-goal]` 을 안 쓰고 가운데핀HTML() 로 직접 짠다(위 주석 — 카카오
         raw HTML 에서 ::before 가 잘려 나오는 사고 때문). */
      얹기(가운데, 가운데핀HTML(가운데라벨));
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
      m.setBounds(bounds, 56, 56, 56, 56);
    } else if (내자리) {
      m.setCenter(new window.kakao.maps.LatLng(내자리.lat, 내자리.lng));
      m.setLevel(5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [카카오준비, 서명, 가운데?.lat, 가운데?.lng, 가운데라벨, 내자리?.lat, 내자리?.lng, 경로들]);

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
  /* 왼쪽 위는 확대·축소 단추 자리다(globals.css 의 .ozoom — 12px 부터 84px 까지).
     이름표는 찍은 자리의 왼쪽 위로 펼쳐지므로 그 언저리에 앉으면 단추를 덮는다.
     모임 화면 지도처럼 제대로 푸는 물건(osmmap.tsx 의 이름표 자리잡기)은 여기에 과하다 —
     덮이는 자리 하나만 아래로 비켜세운다. 덮인 단추는 아예 못 눌리지만 이름표는 조금 밀려도 읽힌다. */
  const 비켜 = (q: { x: number; y: number }) =>
    q.x < 175 && q.y < 120 ? { x: q.x, y: 120 } : q;

  return (
    <div ref={box} className={`osm ${s.지도}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}
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
            const w = 비켜(q);
            return <span key={`출발${i}${o.lat}`} className="opin"
              style={{ left: w.x, top: w.y, cursor: 'default' }}>{o.이름}</span>;
          })}
          {가운데 && (() => {
            const q = 자리(가운데);
            if (!q) return null;
            const w = 비켜(q);
            return <span className="opin" data-first data-goal data-label={가운데라벨} aria-label={가운데라벨}
              style={{ left: w.x, top: w.y }} />;
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
