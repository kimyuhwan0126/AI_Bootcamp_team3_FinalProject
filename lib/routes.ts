/* 참여자 출발지 → 정해진 지점까지의 이동 경로 (2026-08-15, "각자 오는 길을 지도로 보고 싶다").
   대중교통은 ODsay, 자차는 TMAP — 화면이 외부 키를 직접 들고 부르지 않는다(places.ts 와 같은 규칙).
   둘 다 "특정 지점"을 잇는 API 라 winner_place_id 가 있을 때만 쓴다 — 지역은 범위일 뿐 한 점이 아니다. */

export type RoutePoint = { lat: number; lng: number };
/* points 가 비어 있을 수 있다(출발지와 도착지가 겹치는 등) — 그때도 거리·시간은 있을 수 있어
   points 만으로 '경로가 없다'를 판정하지 않는다. */
export type RouteResult = { points: RoutePoint[]; distanceM: number | null; durationS: number | null };

/* '못 불러왔다'와 '길이 없다'는 다른 말이다(places.ts 의 PlacesUnavailable 과 같은 결) —
   여기서는 못 불러온 것만 던지고, 길이 정말 없으면(도서·산간 등) null 을 돌려준다. */
export class RouteUnavailable extends Error {
  where: 'odsay' | 'tmap';
  constructor(where: 'odsay' | 'tmap') {
    super(`route_unavailable:${where}`);
    this.name = 'RouteUnavailable';
    this.where = where;
  }
}

const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const T_ODSAY = 8_000;
const T_TMAP = 8_000;

/* ── 저장해 두기 ─────────────────────────────────────────
   같은 회차 안에서 같은 사람이 SSE 로 화면을 다시 그릴 때마다 바깥으로 다시 나가지 않게
   메모리에만 짧게 둔다(places.ts 의 DB 캐시와 달리 여기는 굳이 표를 새로 만들지 않았다 —
   경로는 좌표쌍마다 달라 places 만큼 재사용이 잦지 않고, 서버가 재시작되면 비어도 무방하다).
   좌표는 소수 4자리(약 11m)로 잘라 같은 자리로 묶는다. */
const 유통기한 = 20 * 60_000;
const 캐시 = new Map<string, { at: number; v: RouteResult | null }>();
const 캐시열쇠 = (mode: string, from: RoutePoint, to: RoutePoint) =>
  `${mode}:${Math.round(from.lat * 10000)},${Math.round(from.lng * 10000)}` +
  `>${Math.round(to.lat * 10000)},${Math.round(to.lng * 10000)}`;

function 캐시서읽기(k: string): RouteResult | null | undefined {
  const c = 캐시.get(k);
  if (!c) return undefined;
  if (Date.now() - c.at > 유통기한) { 캐시.delete(k); return undefined; }
  return c.v;
}
function 캐시에쓰기(k: string, v: RouteResult | null) {
  캐시.set(k, { at: Date.now(), v });
  /* 안 쓰는 칸이 쌓이면 치운다 (ratelimit.ts 와 같은 규칙) */
  if (캐시.size > 2000) for (const [key, c] of 캐시) if (Date.now() - c.at > 유통기한) 캐시.delete(key);
}

/* ODsay 좌표는 x=경도·y=위도다(카카오와 같다). 정거장을 지나며 걷는 구간까지 이어 붙이면
   지도에 그릴 만한 꺾은선이 된다 — 실제 도로를 따라가는 상세 선(그리려면 상세 API 를 한 번 더
   불러야 한다)은 아니고, 구간의 꺾이는 점들을 이은 어림선이다. 방향을 보여 주는 데는 충분하다. */
function odsay선(path: any): RoutePoint[] {
  const points: RoutePoint[] = [];
  const 더하기 = (x: unknown, y: unknown) => {
    const lng = Number(x), lat = Number(y);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const 앞 = points[points.length - 1];
    if (앞 && Math.abs(앞.lat - lat) < 1e-6 && Math.abs(앞.lng - lng) < 1e-6) return;
    points.push({ lat, lng });
  };
  for (const sub of path?.subPath ?? []) {
    더하기(sub.startX, sub.startY);
    for (const st of sub.passStopList?.stations ?? []) 더하기(st.x, st.y);
    더하기(sub.endX, sub.endY);
  }
  return points;
}

/** 대중교통 경로 (ODsay). 길이 여럿이면 첫 안내(가장 추천되는 것)를 쓴다. */
export async function routeTransit(from: RoutePoint, to: RoutePoint): Promise<RouteResult | null> {
  const key = 캐시열쇠('transit', from, to);
  const 저장된 = 캐시서읽기(key);
  if (저장된 !== undefined) return 저장된;

  const k = process.env.ODSAY_API_KEY;
  if (!k) throw new RouteUnavailable('odsay');
  let j: any;
  try {
    const url = 'https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=' + encodeURIComponent(k) +
      `&SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}`;
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(T_ODSAY) });
    j = await r.json();
  } catch (e) {
    console.warn(`[routes] ODsay 못 부름 — ${why(e)}`);
    throw new RouteUnavailable('odsay');
  }
  /* ODsay 는 오류를 배열로 준다. '경로 없음' 류는 서비스 장애가 아니라 정말 길이 없다는 뜻이라
     여기서는 던지지 않고 null 로 돌려준다 — 인증 실패 같은 진짜 장애만 던진다. */
  const err = Array.isArray(j?.error) ? j.error[0] : j?.error;
  if (err) {
    const msg = String(err.message || err.msg || '');
    if (/ApiKeyAuthFailed|잘못된.*apikey/i.test(msg)) {
      console.warn(`[routes] ODsay 인증 실패 — ${err.code} ${msg}`);
      throw new RouteUnavailable('odsay');
    }
    캐시에쓰기(key, null);
    return null;
  }
  const path = (j?.result?.path ?? [])[0];
  if (!path) { 캐시에쓰기(key, null); return null; }
  const v: RouteResult = {
    points: odsay선(path),
    distanceM: Number.isFinite(path.info?.totalDistance) ? path.info.totalDistance : null,
    /* ODsay totalTime 은 분 단위다 */
    durationS: Number.isFinite(path.info?.totalTime) ? path.info.totalTime * 60 : null,
  };
  캐시에쓰기(key, v);
  return v;
}

/** 자차 경로 (TMAP). 응답은 GeoJSON — LineString 조각을 순서대로 이어 붙인다. */
export async function routeCar(from: RoutePoint, to: RoutePoint): Promise<RouteResult | null> {
  const key = 캐시열쇠('car', from, to);
  const 저장된 = 캐시서읽기(key);
  if (저장된 !== undefined) return 저장된;

  const k = process.env.TMAP_APP_KEY;
  if (!k) throw new RouteUnavailable('tmap');
  let j: any, status = 0;
  try {
    const r = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', appKey: k },
      body: JSON.stringify({
        startX: String(from.lng), startY: String(from.lat),
        endX: String(to.lng), endY: String(to.lat),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
      }),
      cache: 'no-store', signal: AbortSignal.timeout(T_TMAP),
    });
    status = r.status;
    j = await r.json();
  } catch (e) {
    console.warn(`[routes] TMAP 못 부름 — ${why(e)}`);
    throw new RouteUnavailable('tmap');
  }
  /* 인증·한도 오류(4xx/5xx)는 장애로 던진다. 200 인데 길이 없는 경우(출발·도착이 겹치는 등)는
     features 가 비어 오거나 error 필드가 실려 온다 — 그건 '길이 없다'로 null 처리한다. */
  if (status !== 200) {
    console.warn(`[routes] TMAP 응답 ${status} — ${JSON.stringify(j)?.slice(0, 120)}`);
    if (status === 401 || status === 403 || status === 429) throw new RouteUnavailable('tmap');
    캐시에쓰기(key, null);
    return null;
  }
  const features = j?.features ?? [];
  if (!features.length || j?.error) { 캐시에쓰기(key, null); return null; }
  const points: RoutePoint[] = [];
  for (const f of features) {
    if (f?.geometry?.type === 'LineString') {
      for (const c of f.geometry.coordinates ?? []) {
        const lng = Number(c[0]), lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
      }
    }
  }
  const 요약 = features[0]?.properties ?? {};
  const v: RouteResult = {
    points,
    distanceM: Number.isFinite(요약.totalDistance) ? 요약.totalDistance : null,
    durationS: Number.isFinite(요약.totalTime) ? 요약.totalTime : null,
  };
  캐시에쓰기(key, v);
  return v;
}
