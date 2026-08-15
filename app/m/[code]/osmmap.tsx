'use client';
/* 카카오가 막혔을 때 대신 그리는 지도 (그릴링 논의27).
   OSM 타일을 직접 붙인다 — 지도 라이브러리를 하나 더 들이면 번들도 배울 것도 는다.
   여기서 하는 일은 세 가지뿐이다: 타일 깔기 · 끌어서 옮기기 · 누른 자리 좌표 주기.
   동 이름은 서버가 알려 준다(/api/geo) — 화면은 외부를 직접 부르지 않는다. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Candidate } from '@/lib/types';
/* 화면(ui.tsx)과 같은 말을 써야 한다 — 한 곳에 둔다 */
import { 고른수 } from '@/lib/말';

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

/* 겹친 핀을 다룬다 — 카카오 쪽과 같은 규칙 (그릴링 논의21 · 논의38 ②).
   폴백 지도라고 규칙이 달라지면 카카오가 막힌 사람만 다른 앱을 쓰는 셈이다. */
const CLUSTER_PX = 46;
/* 이름표를 펼치는 한도 (그릴링 논의67). 430×900 실측: 18곳까지 겹침 0 ·
   20곳에서 1쌍 · 22곳부터 5쌍 이상 · 25곳이면 이름표가 지도의 절반을 덮었다.
   거리가 아니라 곳수로 끊는다 — 거리로 끊으면 확대할 때마다 보이는 개수가 달라져
   같은 지도를 두 번 봐도 결과가 다르다. 넘치는 곳은 점으로 묶는다(이름은 목록에 있다). */
const 이름표한도 = 18;
/* 좁은 자리라 숫자만 보이지만, 읽어 주는 말에는 늘 같은 문장을 넣는다 (그릴링 논의72).
   글자는 ui.tsx 의 고른수() 와 한 글자도 다르면 안 된다 — 같은 것을 두 목소리로 말하는 셈이 된다. */

/* 이름표끼리·붙박이와 이만큼은 떨어뜨린다 */
const GAP = 4;
/* 가장자리에서 이만큼은 안으로 — 조금이라도 잘리면 읽을 수 없다 */
const EDGE = 6;
/* 처음 배율은 후보 외접상자가 지도의 이만큼을 채우게 맞춘다.
   남는 여백은 이름표 몫이다 — 꽉 채우면 가장자리 이름표가 늘 밀려난다. */
const FIT = 0.75;
/* 붙박이를 가리는 것과 이름표끼리 겹치는 것은 값이 다르다 — 겹친 이름표는 읽기 나쁠 뿐이지만
   덮인 단추는 아예 못 눌린다. 자리가 모자랄 때 어느 쪽을 포기할지 이 무게가 정한다. */
const 붙박이무게 = 12;

type 네모 = { l: number; r: number; t: number; b: number };
/* 지도에 그릴 한 덩이 — 후보 하나이거나 뭉친 것 하나.
   이름표를 펼칠지 점으로 묶을지는 다 모아 놓고 표를 보아 가른다 (그릴링 논의67). */
type 단위 = {
  id: string; sx: number; sy: number; votes: number; 차례: number; 이름: string;
  꾸밈: { first?: boolean; mine?: boolean }; 글: React.ReactNode; 누름: () => void;
};
const 겹친넓이 = (a: 네모, b: 네모) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

export default function OsmMap({
  candidates, myVotes, center, canPing, preview, onPick, onToggle, onCluster, cluster = true, origins,
  region, regionRadiusM, routes,
}: {
  candidates: Candidate[];
  myVotes: string[];
  center: { lat: number; lng: number };
  canPing: boolean;
  /* 아직 후보가 아닌 자리 (그릴링 논의81). 무엇을 고른 셈인지는 시트가 말하고(이름은 거기 있다),
     지도는 '그게 어디인지'만 회색으로 짚어 준다 — 좌표를 아는 쪽이 여기다. */
  preview?: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  onToggle: (c: Candidate, mine: boolean) => void;
  onCluster: (ids: string[]) => void;
  /* 지점은 한 동네 안이라 늘 붙어 있다 — 묶으면 지도가 빈다 (그릴링 논의42 ①) */
  cluster?: boolean;
  /* 참가자들이 낸 출발지 (2026-08-15) — 가운데를 셈할 때만 쓰이고 지도에 정작 안 그려졌다.
     "각자 어디서 오는지 지도로 보고 싶다"는 실제 사용 중 나온 말로 추가했다. 후보(candidates)와
     달리 고르는 대상이 아니라서, 정교한 이름표 겹침 회피 계산(자리계산)에는 안 넣는다 —
     참가자 수가 많지 않은 게 보통이라 단순하게 화면 밖만 걸러 그린다. */
  origins?: { name: string; lat: number; lng: number }[];
  /* 확정된 지역의 범위 — 카카오 쪽(ui.tsx 의 regionCircle)과 같은 뜻·같은 반경(regionRadiusM,
     실은 meetings.radius_m). 표시가 없으면 스크롤하다 딴 동네를 고를 수 있다(실사용 신고). */
  region?: { lat: number; lng: number } | null;
  regionRadiusM?: number;
  /* 정해진 지점까지 참가자별로 그리는 이동 경로 (2026-08-15) — 대중교통·자차 API 가 준 꺾은선을
     그대로 잇는다. 카카오 쪽(ui.tsx)은 Polyline 을 쓰고 여기는 SVG 로 같은 모양을 낸다. */
  routes?: { id: string; points: { lat: number; lng: number }[]; color: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(13);
  const [c, setC] = useState(center);
  const [size, setSize] = useState({ w: 430, h: 380 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /* 타일까지 못 받으면 깨진 그림만 남는다 — 무슨 일인지 말해 준다 (그릴링 논의43 ①) */
  const [tileDead, setTileDead] = useState(false);
  const tileFail = useRef(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 주어진 점들이 다 담기는 가운데·배율을 잰다 — 후보 담기와 출발지 담기가 같은 식을 쓴다
     (아래에서 둘 다 부른다). 배율은 실제 지도 요소의 폭·높이로 잰다 — 1024px 같은 어림수로
     잡던 때는 점이 셋이든 스물이든 늘 같은 배율이 나와 첫 화면에 이름표가 하나도 없었다. */
  const 담는배치 = (pts: { lat: number; lng: number }[]) => {
    const la = pts.map((k) => k.lat), ln = pts.map((k) => k.lng);
    const 가운데 = { lat: (Math.min(...la) + Math.max(...la)) / 2, lng: (Math.min(...ln) + Math.max(...ln)) / 2 };
    /* 한 곳뿐이거나 다 붙어 있으면 외접상자가 0이라 배율이 끝까지 튄다 — 동네만큼은 남긴다 */
    const 반y = Math.max((Math.max(...la) - Math.min(...la)) / 2, 0.002);
    const 반x = Math.max((Math.max(...ln) - Math.min(...ln)) / 2, 0.002);
    const 위 = toPx(가운데.lat + 반y, 가운데.lng - 반x, 0);
    const 아래 = toPx(가운데.lat - 반y, 가운데.lng + 반x, 0);
    const el = box.current;
    const w = el?.clientWidth || size.w, h = el?.clientHeight || size.h;
    const 맞는배율 = Math.log2(Math.min((w * FIT) / (아래.x - 위.x), (h * FIT) / (아래.y - 위.y)));
    return { 가운데, z: Math.max(3, Math.min(18, 맞는배율)) };
  };

  /* 후보가 생기면 처음 한 번만 다 담는다 — 카카오 쪽과 같은 규칙.
     확정된 지역이 바뀐 순간에도 다시 맞춘다. 그때뿐이다 —
     손으로 옮긴 지도를 남이 찍을 때마다 되돌리면 지도를 뺏는 셈이다 (그릴링 논의32). */
  const fitted = useRef(false);
  /* 후보도 지역도 아직 없는 첫 화면 — 참가자들의 출발지를 담는다(실사용 신고, 2026-08-15).
     후보 담기와 따로 두는 까닭: 후보가 하나라도 생기면 그쪽이 우선이고, 출발지 담기는
     그 전까지 딱 한 번만 있으면 되는 일이다. */
  const originsFitted = useRef(false);
  const 앞중심 = useRef(center);
  useEffect(() => {
    const 지역바뀜 = center.lat !== 앞중심.current.lat || center.lng !== 앞중심.current.lng;
    앞중심.current = center;
    if (지역바뀜) { fitted.current = false; originsFitted.current = false; }
    if (fitted.current) return;
    if (!candidates.length) {
      /* 지점 단계로 막 넘어왔다 — 후보는 아직 없고 확정된 지역만 있다.
         동네 하나가 다 보이는 배율(z=15)이면 어디서 골라야 할지 보인다. */
      if (지역바뀜) { setC(center); setZ(15); return; }
      /* 아직 지역도 안 정한 첫 화면일 때만 — 지점 단계(region 이 있음)에서 후보가
         아직 없는 것과 혼동하면 안 된다. 그건 위 '지역바뀜' 갈래가 이미 다뤘고, 여기서
         또 손대면 방금 정한 지역 대신 참가자들의 집 근처로 지도가 튄다(실제로 재현됨). */
      if (!region && !originsFitted.current && origins && origins.length >= 2) {
        originsFitted.current = true;
        const { 가운데, z: 맞는배율 } = 담는배치(origins);
        setC(가운데); setZ(맞는배율);
      }
      return;
    }
    fitted.current = true;
    const { 가운데, z: 맞는배율 } = 담는배치(candidates);
    setC(가운데); setZ(맞는배율);
  }, [candidates, origins, region, center.lat, center.lng]);   // eslint-disable-line react-hooks/exhaustive-deps

  const origin = (() => {
    const p = toPx(c.lat, c.lng, z);
    return { ox: p.x - size.w / 2, oy: p.y - size.h / 2 };
  })();

  /* 배율은 소수다(후보를 화면에 딱 맞추려면 정수로는 못 맞춘다).
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
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    /* 포인터가 이미 놓였으면 capture 가 NotFoundError 를 던진다 — 끌기와는 무관한 일이니 삼킨다 */
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* 그냥 끌면 된다 */ }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    /* 손으로 옮긴 지도는 남이 찍었다고 되돌리지 않는다 — 자동 맞춤은 여기서 끝난다 */
    fitted.current = true;
    d.x = e.clientX; d.y = e.clientY;
    const p = toPx(c.lat, c.lng, z);
    setC(toLatLng(p.x - dx, p.y - dy, z));
  };
  const up = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !canPing) return;
    /* 타일을 못 받으면 어디를 누른 것인지 아무도 모른다 — 회색 화면을 누른 것이
       후보가 되면 안 된다 (그릴링 논의43 ①) */
    if (tileDead) return;
    /* 지도 위에 얹힌 것(확대·축소·저작권·핀·묶인 점)을 누른 것은 '자리 고르기'가 아니다.
       전에는 축소를 네 번 누르면 후보가 네 곳 생겼다 (그릴링 논의33). */
    if ((e.target as Element).closest('.ozoom,.ocred,.opin,.odot')) return;
    const r = box.current!.getBoundingClientRect();
    const ll = toLatLng(origin.ox + (e.clientX - r.left), origin.oy + (e.clientY - r.top), z);
    /* 많이 축소하면 지도 밖(= 지구 밖) 좌표가 나온다 — 서버에 보내 봐야 400 이다 */
    if (Math.abs(ll.lat) > 85 || Math.abs(ll.lng) > 180) return;
    /* 누른 자리를 위로 알리기만 한다. 이것이 곧 후보가 되지는 않는다 —
       미리보기로 세워 두고 한 번 더 묻는 일은 화면(ui.tsx)이 한다 (그릴링 논의81). */
    onPick(ll.lat, ll.lng);
  }, [canPing, tileDead, onPick, origin.ox, origin.oy, z]);

  /* ── 이름표 자리잡기 ────────────────────────────────────
     크기는 글자 수로 어림할 수 없다 — 한글은 글자마다 폭이 다르고 굵기·여백도 섞인다.
     그래서 두 단계로 나눈다: ① 제자리에 한 번 그리고 ② getBoundingClientRect 로 잰 뒤
     ③ 겹치지 않는 자리로 옮긴다. 붙박이 단추도 화면에서 직접 재서 피한다. */
  const 자리 = useRef<{ id: string; sx: number; sy: number }[]>([]);
  const 이름표 = useRef(new Map<string, HTMLElement>());
  const 달기 = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) 이름표.current.set(id, el); else 이름표.current.delete(id);
  }, []);
  const [배치, set배치] = useState<Record<string, { dx: number; dy: number; cy: number }>>({});

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const W = size.w, H = size.h;
    const 바탕 = el.getBoundingClientRect();
    /* 지도 위 붙박이(확대·축소 · 저작권 · 방장 버튼)는 이미 자리를 차지한 것으로 친다.
       자리를 코드에 박아 두면 방장이 도구를 펼쳤을 때 그 아래 이름표가 깔린다 — 실제로 잰다. */
    const 붙박이: 네모[] = [];
    /* 방장 도구는 스피드다이얼(.dial-item·.dial-toggle)로 바뀌었다 — 옛 알약(.acts-fix .fab)
       셀렉터만 남겨 두면 다이얼이 펴졌을 때 이름표가 그 위에 그대로 깔린다(실측으로 확인). */
    el.parentElement?.querySelectorAll('.ozoom,.ocred,.acts .fab,.dial-item,.dial-toggle').forEach((n) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      if (!r.width || !r.height) return;
      붙박이.push({ l: r.left - 바탕.left, r: r.right - 바탕.left, t: r.top - 바탕.top, b: r.bottom - 바탕.top });
    });
    /* 이미 자리를 잡은 이름표. 뒤에 오는 이름표는 이것도 피한다 */
    const 놓인것: 네모[] = [];

    const 새배치: Record<string, { dx: number; dy: number; cy: number }> = {};
    자리.current.forEach(({ id, sx, sy }) => {
      const node = 이름표.current.get(id);
      if (!node) return;
      const r = node.getBoundingClientRect();
      const w = r.width, h = r.height;
      if (!w || !h) return;
      /* css 가 이름표를 (-50%, -100%) 옮겨 그린다 — 찍은 자리가 아래 가운데다 */
      const 네모칸 = (dx: number, dy: number): 네모 =>
        ({ l: sx - w / 2 + dx, r: sx + w / 2 + dx, t: sy - h + dy, b: sy + dy });
      /* 조금이라도 화면 밖으로 나가면 안으로 민다. 이름표가 지도보다 넓으면 왼쪽·위를 살린다. */
      const 안으로 = (dx: number, dy: number): [number, number] => {
        const a = 네모칸(dx, dy);
        if (a.l < EDGE) dx += EDGE - a.l;
        else if (a.r > W - EDGE) dx += Math.max(W - EDGE - a.r, EDGE - a.l);
        if (a.t < EDGE) dy += EDGE - a.t;
        else if (a.b > H - EDGE) dy += Math.max(H - EDGE - a.b, EDGE - a.t);
        return [dx, dy];
      };
      const 띄우기 = (q: 네모): 네모 => ({ l: q.l - GAP, r: q.r + GAP, t: q.t - GAP, b: q.b + GAP });
      const 막는것 = () => [
        ...붙박이.map((q) => ({ q: 띄우기(q), 무게: 붙박이무게 })),
        ...놓인것.map((q) => ({ q: 띄우기(q), 무게: 1 })),
      ];
      const 겹침 = (a: 네모) => 막는것().reduce((s, { q, 무게 }) => s + 겹친넓이(a, q) * 무게, 0);
      /* 제자리부터 시작해 사방으로 원을 넓혀 가며 처음 비는 자리를 찾는다.
         이름을 다 보여야 어느 지점인지 알 수 있다 — 자리를 옮겨서라도 다 그린다.
         확대하면 서로 멀어져 옮길 일이 없어지고 이름표가 제 자리로 돌아간다. */
      const 후보자리: [number, number][] = [[0, 0]];
      for (let ring = 1; ring <= 10; ring++) {
        const dy0 = ring * (h + GAP + 2), dx0 = ring * (w / 2 + GAP + 6);
        for (let k = 0; k < 12; k++) {
          const th = (k / 12) * Math.PI * 2;
          후보자리.push([dx0 * Math.sin(th), -dy0 * Math.cos(th)]);
        }
      }
      /* 끝내 빈자리가 없으면 제자리로 되돌리지 않는다 — 그러면 단추 위에 얹힌다.
         가장 덜 겹치는 자리를 고른다 (그릴링 논의42). */
      type 놓기 = { dx: number; dy: number; s: number };
      let 고른: 놓기 = { dx: 0, dy: 0, s: Infinity };
      for (const [ox, oy] of 후보자리) {
        const [dx, dy] = 안으로(ox, oy);
        const s = 겹침(네모칸(dx, dy));
        if (s < 고른.s) 고른 = { dx, dy, s };
        if (s === 0) break;
      }
      /* 격자로 훑기만 하면 가장자리에서 여러 자리가 한 줄로 뭉개져 조금씩 겹친 채로 끝난다 —
         가장 크게 겹친 것 밖으로 최단거리만큼 비켜서 본다. 나아질 때만 받는다. */
      for (let n = 0; n < 6 && 고른.s > 0; n++) {
        const a = 네모칸(고른.dx, 고른.dy);
        let 최악: 네모 | null = null, 최대 = 0;
        막는것().forEach(({ q, 무게 }) => {
          const v = 겹친넓이(a, q) * 무게;
          if (v > 최대) { 최대 = v; 최악 = q; }
        });
        if (!최악) break;
        const q: 네모 = 최악;
        /* 네 갈래를 다 재 본다. 짧은 쪽부터 고르면 화면 밖으로 나가는 갈래가 늘 1등이라
           안으로 밀려 제자리로 돌아오고 거기서 멈춘다. */
        const 갈래: [number, number][] = [[q.l - a.r, 0], [q.r - a.l, 0], [0, q.t - a.b], [0, q.b - a.t]];
        let 나은: 놓기 = 고른;
        for (const [ox, oy] of 갈래) {
          const [dx, dy] = 안으로(고른.dx + ox, 고른.dy + oy);
          const s = 겹침(네모칸(dx, dy));
          if (s < 나은.s) 나은 = { dx, dy, s };
        }
        if (나은.s >= 고른.s) break;
        고른 = 나은;
      }
      새배치[id] = { dx: 고른.dx, dy: 고른.dy, cy: 고른.dy - h / 2 };
      놓인것.push(네모칸(고른.dx, 고른.dy));
    });

    const 같다 = Object.keys(새배치).length === Object.keys(배치).length
      && Object.entries(새배치).every(([k, v]) => {
        const o = 배치[k];
        return o && Math.abs(o.dx - v.dx) < 0.5 && Math.abs(o.dy - v.dy) < 0.5 && Math.abs(o.cy - v.cy) < 0.5;
      });
    if (!같다) set배치(새배치);
  });

  return (
    <div ref={box} className="osm" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      {tiles.map((t) => (
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
          <span>아래 목록에서 고를 수 있어요</span>
        </div>
      )}

      {/* 확정된 지역의 범위 — 반경(m)을 화면 픽셀로 바꾸려고 toPx 를 두 번 쓴다(중심과
         북쪽으로 반경만큼 간 자리) — 계수를 새로 만들지 않고 지도가 이미 쓰는 투영과
         똑같은 잣대를 그대로 쓰는 것이다. 핀보다 먼저 그려 아래에 깔린다. */}
      {region && !tileDead && (() => {
        const p0 = toPx(region.lat, region.lng, z);
        const dLat = ((regionRadiusM ?? 700) / 6371000) * (180 / Math.PI);
        const p1 = toPx(region.lat + dLat, region.lng, z);
        const 반경px = Math.abs(p0.y - p1.y);
        return (
          <span className="oregion" aria-hidden
            style={{ left: p0.x - origin.ox, top: p0.y - origin.oy, width: 반경px * 2, height: 반경px * 2 }} />
        );
      })()}

      {/* 참가자별 이동 경로 — 지역 범위보다는 위, 핀보다는 아래(z-index 2, 위 표 참고).
         선 위에 핀이 얹혀야 어디가 목적지인지 늘 보인다. */}
      {!!routes?.length && !tileDead && (
        <svg width={size.w} height={size.h}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'none' }}>
          {routes.map((rt) => {
            if (rt.points.length < 2) return null;
            const 꺾은선 = rt.points
              .map((p) => { const q = toPx(p.lat, p.lng, z); return `${q.x - origin.ox},${q.y - origin.oy}`; })
              .join(' ');
            return (
              <polyline key={rt.id} points={꺾은선} fill="none" stroke={rt.color}
                strokeWidth={4} strokeOpacity={0.75} strokeLinecap="round" strokeLinejoin="round" />
            );
          })}
        </svg>
      )}

      {(() => {
        /* 안 보이는 지도 위에 핀만 뜨면 안내 문구를 가린다 — 지도가 죽으면 핀도 쉰다 */
        if (tileDead) { 자리.current = []; return null; }

        /* 화면 좌표로 옮겨 가까운 것끼리 묶는다 */
        const pts = candidates.map((k, i) => ({ k, i, p: toPx(k.lat, k.lng, z) }));
        const 덩어리: (typeof pts)[] = [];
        pts.forEach((q) => {
          const g = 덩어리.find((G) => G.some((x) =>
            Math.hypot(x.p.x - q.p.x, x.p.y - q.p.y) < CLUSTER_PX));
          if (g) g.push(q); else 덩어리.push([q]);
        });

        const 잰것: { id: string; sx: number; sy: number }[] = [];
        const 그린것: React.ReactNode[] = [];
        const 이음선: React.ReactNode[] = [];
        const 그리기 = (
          id: string, sx: number, sy: number,
          꾸밈: { first?: boolean; mine?: boolean }, 글: React.ReactNode, 누름: () => void,
          읽을말: string,
        ) => {
          잰것.push({ id, sx, sy });
          const o = 배치[id];
          const dx = o?.dx ?? 0, dy = o?.dy ?? 0;
          const 공통 = {
            className: 'opin',
            'data-first': 꾸밈.first || undefined,
            'data-mine': 꾸밈.mine || undefined,
            /* 핀에는 '가1집 3' 처럼 숫자만 있다 — 읽어 주는 말로는 문장을 준다 (그릴링 논의72) */
            'aria-label': 읽을말,
            style: { left: sx + dx, top: sy + dy, ...(canPing ? null : { cursor: 'default' }) },
          };
          /* 자리를 옮겼으면 어디를 가리키는지 보여야 한다 — 원래 자리에 점을 찍고 선으로 잇는다 */
          if (o && Math.hypot(dx, dy) > 2) {
            이음선.push(
              <line key={id} x1={sx} y1={sy} x2={sx + dx} y2={sy + o.cy}
                stroke="#5b6472" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />,
            );
            그린것.push(<span key={'점' + id} className="odot" style={{ left: sx, top: sy, pointerEvents: 'none' }} />);
          }
          그린것.push(canPing ? (
            <button key={id} ref={달기(id)} {...공통}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); 누름(); }}>{글}</button>
          ) : (
            /* 못 찍는 사람에게 눌리는 시늉을 하면 안 된다 — 눌러 봐야 403 이다 (그릴링 논의34).
               보는 것은 자유라 확대·축소는 그대로 둔다. */
            <span key={id} ref={달기(id)} {...공통}>{글}</span>
          ));
        };

        /* 이름표를 못 받은 곳 — 점으로만 묶어 둔다 (그릴링 논의67).
           이름은 목록에 있다(논의61: 정식 길은 목록). 그래도 표는 여기서도 줄 수 있어야 한다 —
           읽어 주는 기계에는 이름을 남긴다. */
        const 점찍기 = (u: 단위) => {
          const 말 = `${u.이름} · ${고른수(u.votes)}`;
          const 공통 = {
            className: 'odot', 'data-mute': true,
            style: { left: u.sx, top: u.sy },
            /* 이름이 안 보이는 점이라 읽어 주는 말이 유일한 이름이다 (그릴링 논의67 · 논의72) */
            title: 말, 'aria-label': 말,
          };
          그린것.push(canPing ? (
            <button key={u.id} {...공통}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); u.누름(); }} />
          ) : (
            <span key={u.id} {...공통} role="img" />
          ));
        };

        /* 화면 밖 후보는 그리지 않는다 — 안으로 밀어 넣으면 없는 곳을 가리키는 이름표가 된다 */
        const 보임 = (x: number, y: number) => x >= 0 && x <= size.w && y >= 0 && y <= size.h;
        const 단위들: 단위[] = [];
        덩어리.forEach((G) => {
          /* 셋 이상 뭉치면 하나로 합쳐 보여 준다 */
          if (cluster && G.length >= 3) {
            const sx = G[0].p.x - origin.ox, sy = G[0].p.y - origin.oy;
            if (!보임(sx, sy)) return;
            const 표 = G.reduce((a, x) => a + x.k.votes, 0);
            단위들.push({
              id: '뭉' + G[0].k.id, sx, sy, votes: 표, 차례: G[0].i,
              이름: `이 근처 ${G.length}곳`, 꾸밈: {}, 글: <>이 근처 {G.length}곳 {표}</>,
              누름: () => onCluster(G.map((x) => x.k.id)),
            });
            return;
          }
          G.forEach(({ k, i, p }) => {
            const sx = p.x - origin.ox, sy = p.y - origin.oy;
            if (!보임(sx, sy)) return;
            const mine = myVotes.includes(k.id);
            단위들.push({
              id: k.id, sx, sy, votes: k.votes, 차례: i,
              이름: k.name, 꾸밈: { first: i === 0 && k.votes > 0, mine },
              글: <>{k.name} {k.votes}</>, 누름: () => onToggle(k, mine),
            });
          });
        });

        /* 선택이 많은 곳부터 이름표를 준다. 표가 같으면 원래 차례를 지킨다 —
           갱신마다 순서가 뒤집히면 같은 지도인데 이름표가 깜빡인다.
           그리는 차례는 원래대로 둔다: 먼저 그린 것이 좋은 자리를 갖는 규칙이 바뀌면
           표 순위가 자리 다툼까지 흔든다. */
        const 이름줄것 = new Set(
          [...단위들].sort((a, b) => b.votes - a.votes || a.차례 - b.차례)
            .slice(0, 이름표한도).map((u) => u.id),
        );
        단위들.forEach((u) => {
          if (이름줄것.has(u.id)) 그리기(u.id, u.sx, u.sy, u.꾸밈, u.글, u.누름, `${u.이름} · ${고른수(u.votes)}`);
          else 점찍기(u);
        });
        자리.current = 잰것;

        return (
          <>
            {!!이음선.length && (
              <svg width={size.w} height={size.h}
                style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'none' }}>
                {이음선}
              </svg>
            )}
            {그린것}
          </>
        );
      })()}

      {preview && !tileDead && (() => {
        /* 좌표에서 매번 다시 잰다 — 끌거나 확대해도 고른 자리에 그대로 붙어 있어야 한다.
           누르는 자리는 아니다(pointer-events 없음) — 굳히는 단추는 시트에 있다 (그릴링 논의81). */
        const p = toPx(preview.lat, preview.lng, z);
        return <span className="opre" style={{ left: p.x - origin.ox, top: p.y - origin.oy }} />;
      })()}

      {/* 참가자들의 출발지 — 후보와 헷갈리면 안 되니 누를 수 없고(pointer-events 없음) 옅게 그린다.
          겹침 회피 계산에는 안 넣는다(위 그리기 참고) — 화면 밖만 거른다. */}
      {!tileDead && origins?.map((o) => {
        const p = toPx(o.lat, o.lng, z);
        const sx = p.x - origin.ox, sy = p.y - origin.oy;
        if (sx < -20 || sx > size.w + 20 || sy < -20 || sy > size.h + 20) return null;
        return (
          <span key={`origin-${o.name}-${o.lat}-${o.lng}`} className="ofrom" style={{ left: sx, top: sy }}>
            <span className="pt" aria-hidden />
            <span className="lb">{o.name}</span>
          </span>
        );
      })}

      <div className="ozoom" onPointerDown={(e) => e.stopPropagation()}>
        {/* 배율도 손으로 고른 것이다 — 고른 뒤에는 자동 맞춤이 끼어들지 않는다 */}
        <button onClick={(e) => { e.stopPropagation(); fitted.current = true; setZ((v) => Math.min(18, v + 1)); }} aria-label="확대">＋</button>
        <button onClick={(e) => { e.stopPropagation(); fitted.current = true; setZ((v) => Math.max(6, v - 1)); }} aria-label="축소">－</button>
      </div>
      {/* 라이선스 표시는 OSM 이용 조건이다 */}
      <a className="ocred" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
