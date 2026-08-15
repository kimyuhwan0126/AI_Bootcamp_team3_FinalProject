/* 참여자 출발지 → 정해진 지점까지의 이동 경로 (2026-08-15, "각자 오는 길을 지도로 보고 싶다").
   대중교통은 카카오맵 대중교통 경로 조회, 자차는 TMAP — 화면이 외부 키를 직접 들고 부르지 않는다
   (places.ts 와 같은 규칙). 둘 다 "특정 지점"을 잇는 API 라 winner_place_id 가 있을 때만 쓴다 —
   지역은 범위일 뿐 한 점이 아니다.

   ⚠ 2026-08-15 뒤처리 — 처음엔 ODsay 로 짰다가 바꿨다. 로컬에서는 ODsay 가 잘 됐는데
   Vercel 배포에서만 route_unavailable 이 났다(실사용 신고) — ODsay 키가 IP 화이트리스트로
   묶여 있어 서버리스처럼 나가는 IP 가 매번 바뀌는 곳과는 안 맞는다. 마침 카카오가
   2026-07-21 에 대중교통·도보·자전거 길찾기 REST API 를 새로 열었다(신청·심사 없이 카카오
   디벨로퍼스에서 [카카오맵] 사용 설정만 켜면 됨) — Kakao Local 검색과 **같은 REST 키**를 쓰므로
   이미 Vercel 에서 멀쩡히 되던 키 그대로 붙는다. ODsay 를 걷어내고 이걸로 바꿨다. */

export type RoutePoint = { lat: number; lng: number };
/* points 가 비어 있을 수 있다(출발지와 도착지가 겹치는 등) — 그때도 거리·시간은 있을 수 있어
   points 만으로 '경로가 없다'를 판정하지 않는다. */
export type RouteResult = { points: RoutePoint[]; distanceM: number | null; durationS: number | null };

/* '못 불러왔다'와 '길이 없다'는 다른 말이다(places.ts 의 PlacesUnavailable 과 같은 결) —
   여기서는 못 불러온 것만 던지고, 길이 정말 없으면(도서·산간 등) null 을 돌려준다. */
export class RouteUnavailable extends Error {
  where: 'kakao' | 'tmap';
  constructor(where: 'kakao' | 'tmap') {
    super(`route_unavailable:${where}`);
    this.name = 'RouteUnavailable';
    this.where = where;
  }
}

const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const T_KAKAO = 8_000;
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

/** 대중교통 경로 (카카오맵 대중교통 길찾기, dapi.kakao.com/v2/routing/publictraffic).
    Kakao Local 검색과 같은 REST 키를 쓴다 — 키를 새로 받을 필요가 없다.
    routes[] 가 여러 안내(지하철 우선·버스 우선·환승 조합)를 준다 — 첫 번째(가장 빠른 것)를 쓴다.
    각 구간(steps[])의 path.points 가 실제 도로·선로를 따라가는 좌표라 이어 붙이면 그대로 꺾은선이
    된다(ODsay 처럼 정거장 사이를 직선으로 어림잡을 필요가 없다). 좌표는 [경도, 위도] 순서다. */
export async function routeTransit(from: RoutePoint, to: RoutePoint): Promise<RouteResult | null> {
  const key = 캐시열쇠('transit', from, to);
  const 저장된 = 캐시서읽기(key);
  if (저장된 !== undefined) return 저장된;

  const k = process.env.KAKAO_REST_API_KEY;
  if (!k) throw new RouteUnavailable('kakao');
  let status = 0, j: any;
  try {
    const url = 'https://dapi.kakao.com/v2/routing/publictraffic' +
      `?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`;
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${k}` }, cache: 'no-store', signal: AbortSignal.timeout(T_KAKAO),
    });
    status = r.status;
    j = await r.json();
  } catch (e) {
    console.warn(`[routes] 카카오 대중교통 못 부름 — ${why(e)}`);
    throw new RouteUnavailable('kakao');
  }
  /* 인증·한도 오류는 HTTP 상태로 온다(Kakao Local 과 같은 결) — 진짜 장애만 던진다.
     200 인데 'EQUAL_POINTS'(출발=도착) 등으로 routes 가 비면 '길이 없다'로 null 처리한다. */
  if (status !== 200) {
    console.warn(`[routes] 카카오 대중교통 응답 ${status} — ${JSON.stringify(j)?.slice(0, 120)}`);
    throw new RouteUnavailable('kakao');
  }
  const route = (j?.routes ?? [])[0];
  if (!route) { 캐시에쓰기(key, null); return null; }
  const points: RoutePoint[] = [];
  for (const step of route.steps ?? []) {
    for (const p of step?.path?.points ?? []) {
      const lng = Number(p[0]), lat = Number(p[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
    }
  }
  const v: RouteResult = {
    points,
    distanceM: Number.isFinite(route.properties?.totalDistance) ? route.properties.totalDistance : null,
    durationS: Number.isFinite(route.properties?.totalTime) ? route.properties.totalTime : null,
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
