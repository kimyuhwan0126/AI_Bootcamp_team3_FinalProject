// ─────────────────────────────────────────────────────────────
// ai-vote/api-kakao.ts — 카카오 "공식 API"로 검색·경로를 얻는다 (배포급)
//
//  이전 web-kakao.ts(카카오맵 웹 렌더링 — PoC)를 대체한다. 전환 이유:
//   · Vercel 서버리스에 크롬 실행파일이 없어 배포에서 못 돈다 (PR #54 지적)
//   · 비공식 엔드포인트(search.map.kakao.com)의 약관·차단 리스크 제거
//   · 요금(2026-08 검증): 대중교통·도보 10원/건(각 일 1,000건 무료), 자동차 8원/건(일 10,000건 무료)
//  잃는 것: 별점·리뷰 수 — 공식 로컬 API 엔 평점이 없다 → rating 0(기존 제품 관행 "미표시").
//  ⚠️ 도간(50km+) 대중교통은 이 파일이 아니라 ODsay(travelMinutesEx)를 쓴다 —
//     카카오 대중교통 API 의 도간·KTX 커버리지는 미검증이라 region.ts 분기가 담당한다.
// ─────────────────────────────────────────────────────────────

const KEY = process.env.KAKAO_REST_API_KEY || "";
const KH = { Authorization: `KakaoAK ${KEY}` };

export interface WebPlace {
  name: string; lat: number; lng: number;
  kakaoId: string | null; pageUrl?: string;
  category: string; catRoot: string;
  address: string; rating: number; reviews: number;
}
export interface RouteResult {
  minutes: number; transfers?: number; fare?: number | null; distanceM?: number; note?: string;
}
export type RouteOrError = RouteResult | { error: string };
export const isRouteError = (r: RouteOrError): r is { error: string } => "error" in r;

export const hav = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371, d = Math.PI / 180;
  const la = (b.lat - a.lat) * d, lo = (b.lng - a.lng) * d;
  const h = Math.sin(la / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(lo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 동시 호출 상한 — 다리 32건을 한 번에 쏘면 카카오가 QPS 로 거절할 수 있다. 8개씩.
const CAP = 8;
let active = 0;
const waiters: (() => void)[] = [];
const acquire = (): Promise<void> => (active < CAP ? (active++, Promise.resolve()) : new Promise((r) => waiters.push(r)));
const release = (): void => { active--; const w = waiters.shift(); if (w) { active++; w(); } };

interface LocalDoc { place_name: string; x: string; y: string; id?: string; place_url?: string;
  category_name?: string; category_group_name?: string; category_group_code?: string; address_name?: string }

/** 카카오 로컬 키워드 검색 (공식). 별점은 제공되지 않아 항상 0. */
export async function webSearch(q: string, near?: { lat: number; lng: number; radiusM?: number }): Promise<{ total: number; places: WebPlace[] }> {
  if (!KEY) return { total: 0, places: [] };
  await acquire();
  try {
    const loc = near ? `&x=${near.lng}&y=${near.lat}&radius=${near.radiusM ?? 1500}` : "";
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15${loc}`, { headers: KH });
    if (!r.ok) return { total: 0, places: [] };
    const j = (await r.json()) as { meta?: { total_count?: number }; documents?: LocalDoc[] };
    const places: WebPlace[] = (j.documents ?? []).map((p) => ({
      name: p.place_name, lat: +p.y, lng: +p.x,
      kakaoId: p.id ?? null, pageUrl: p.place_url,
      category: (p.category_name ?? "").split(">").pop()?.trim() ?? "",
      catRoot: p.category_group_name ?? "", address: p.address_name ?? "",
      rating: 0, reviews: 0,
    })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    return { total: j.meta?.total_count ?? places.length, places };
  } catch { return { total: 0, places: [] }; }
  finally { release(); }
}

/** 카카오 공식 경로 API. traffic=대중교통(10원/건) car=자동차(8원/건, 모빌리티) walk=도보(10원/건) */
export async function webRoute(
  mode: "traffic" | "car" | "walk",
  from: { name: string; lat: number; lng: number },
  to: { name: string; lat: number; lng: number }
): Promise<RouteOrError> {
  if (!KEY) return { error: "KAKAO_REST_API_KEY 미설정" };
  if (hav(from, to) < 0.05) return { minutes: 0, note: "같은 지점" };
  await acquire();
  try {
    if (mode === "car") {
      const r = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}`, { headers: KH });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const j = (await r.json()) as { routes?: { result_code: number; summary?: { duration: number; distance: number } }[] };
      const s = j.routes?.[0];
      if (!s || s.result_code !== 0 || !s.summary) return { error: "경로 없음" };
      return { minutes: Math.round(s.summary.duration / 60), distanceM: s.summary.distance };
    }
    const path = mode === "traffic" ? "publictraffic" : "walk";
    const r = await fetch(`https://dapi.kakao.com/v2/routing/${path}?start_x=${from.lng}&start_y=${from.lat}&end_x=${to.lng}&end_y=${to.lat}`, { headers: KH });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    if (mode === "traffic") {
      const j = (await r.json()) as { routes?: { properties: { totalTime: number; transfers?: number; fare?: { value?: number } } }[] };
      const rs = j.routes ?? [];
      if (!rs.length) return { error: "경로 없음" };
      const best = rs.reduce((m, x) => (x.properties.totalTime < m.properties.totalTime ? x : m));
      return { minutes: Math.round(best.properties.totalTime / 60), transfers: best.properties.transfers, fare: best.properties.fare?.value ?? null };
    }
    const j = (await r.json()) as { route?: { legs?: { properties?: { time: number; distance: number } }[] } };
    const leg = j.route?.legs?.[0]?.properties;
    return leg ? { minutes: Math.round(leg.time / 60), distanceM: leg.distance } : { error: "경로 없음" };
  } catch (e) { return { error: String(e).slice(0, 70) }; }
  finally { release(); }
}

/** 일시 오류는 1회 재시도 */
export async function webRouteRetry(
  mode: "traffic" | "car" | "walk",
  from: { name: string; lat: number; lng: number },
  to: { name: string; lat: number; lng: number }
): Promise<RouteOrError> {
  const r = await webRoute(mode, from, to);
  return isRouteError(r) ? webRoute(mode, from, to) : r;
}
