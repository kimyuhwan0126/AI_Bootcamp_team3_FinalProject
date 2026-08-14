'use client';
/* 홈 탐색용 지도 — 출발지 핀과 가운데 핀을 얹는다.

   모임 화면의 지도(`app/m/[code]/osmmap.tsx`)를 그대로 못 쓰는 까닭:
   그 물건은 `Candidate` 를 받아 선택 수·이름표 겹침 풀기·묶기·누르면 후보 올리기까지 한다.
   여기는 로그인도 모임도 없는 자리라 후보가 아예 없다 — 핀을 얹는 일만 남는다.
   타일 셈(toPx·toLatLng)은 같은 규칙이라 그쪽에서 그대로 가져왔다. 고칠 일이 생기면 두 곳이다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import s from './탐색.module.css';

export type 점 = { 이름: string; lat: number; lng: number };

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

export default function 지도({ 출발지들, 가운데 }: {
  출발지들: 점[];
  가운데: { lat: number; lng: number } | null;
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

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 출발지가 바뀔 때마다 다시 맞춘다 — 모임 화면과 규칙이 다른 자리다.
     거기서는 남이 찍을 때마다 지도를 되돌리면 지도를 뺏는 셈이라 한 번만 맞췄지만,
     여기서 지도를 움직이는 사람은 나 하나다. 방금 넣은 출발지가 화면 밖이면 넣은 뜻이 없다. */
  const 서명 = 출발지들.map((o) => `${o.lat},${o.lng}`).join('|');
  useEffect(() => {
    if (!출발지들.length) return;
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
  }, [서명, size.w, size.h]);

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

  const down = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 그냥 끌면 된다 */ }
  };
  const move = (e: React.PointerEvent) => {
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
      {/* 그릴 것이 없으면 타일을 아예 안 받는다 — 어차피 안내 문구가 덮는데
          홈에 들를 때마다 타일 열 몇 장을 남의 서버에서 받아 오는 셈이 된다 */}
      {그릴것있나 && tiles.map((t) => (
        <img key={t.k} src={t.url} alt="" draggable={false}
          onLoad={() => { tileFail.current = 0; setTileDead(false); }}
          onError={() => { if (++tileFail.current >= 3) setTileDead(true); }}
          /* 1px 겹쳐 그린다 — 소수 배율에서 타일 사이에 흰 줄이 보인다 */
          style={{ position: 'absolute', width: TS + 1, height: TS + 1, left: t.left, top: t.top,
            visibility: tileDead ? 'hidden' : undefined }} />
      ))}

      {tileDead && (
        <div className="tiledead">
          <b>지도를 불러오지 못했어요</b>
          <span>잠시 뒤에 다시 열어 보세요</span>
        </div>
      )}

      {/* 그릴 것이 하나도 없을 때만 덮는다 — 지도를 띄워 놓고 어디인지도 모르게 두는 것보다 낫다.
          단추는 없다: 위에서 이미 스스로 내 위치를 물어봤다(그래도 안 잡히면 손으로 넣으면 된다). */}
      {!그릴것있나 && !tileDead && (
        <div className="tiledead">
          <b>아직 출발지가 없어요</b>
          <span>위 검색칸에서 출발지를 넣어 보세요</span>
        </div>
      )}

      {!tileDead && 그릴것있나 && (
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
            return <span className="opin" data-first
              style={{ left: w.x, top: w.y, cursor: 'default' }}>가운데</span>;
          })()}
        </>
      )}

      {/* 지도가 안 보이는 동안에는 확대·축소도, 라이선스 표시도 뜻이 없다 */}
      {그릴것있나 && (
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
