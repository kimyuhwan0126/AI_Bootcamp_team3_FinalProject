// ─────────────────────────────────────────────────────────────
// station-snap.ts — 지도에 찍은 핑을 **무엇으로 묶을지** 정한다
//
// 멘토링 2026-08-06 §2: "핑 찍으면 시·군·구 단위로 자동 묶기
//                        **(또는 서울은 지하철역 기준)**"
//
// 핑은 좌표 그대로 두면 안 된다. 3m 옆에 찍은 두 핑이 서로 다른 후보가 되면
// 표가 갈라지기 때문이다(v4). 그래서 항상 **무언가로 스냅**한다. 이 파일은
// 그 '무언가'를 고르는 사슬 하나만 담당한다.
//
//   ① 지하철역   (FLAGS.pingSnapStation · 카카오 SW8 · 반경 1.2km)
//   ② 거점 좌표표 (카카오에 못 물어봤을 때 · lib/geo.ts HUBS · 같은 1.2km)
//   ③ 시·군·구   (= 플래그가 꺼졌을 때의 기본 동작 · coord2RegionKakao)
//   ④ 좌표 이름   (`지도 37.549, 126.850`)
//
// ⚠️ **어느 칸에서 멈춰도 화면은 정상 동작한다.** 키가 없어도 전체 플로우가
//    돌아야 한다는 규칙(CLAUDE.md §3-4)이 여기서도 그대로다.
//
// ⚠️ `null`(못 물어봤다)과 `[]`(물어봤는데 없다)를 **구분한다.**
//    `searchByCategoryKakao` 는 반경 안에 역이 없으면 `[]` 를 주고,
//    **키가 없거나 호출이 실패하면**(429·5xx·타임아웃 포함) `null` 을 준다.
//    이걸 뭉뚱그리면 역이 없는 동네(봉담 등)에서 찍은 핑이 멀리 있는 거점으로
//    튀어버린다 — 있지도 않은 역을 있다고 말하는 셈이다.
//    ⚠️ 뒤집어 말하면 `null` 은 "키 없음"과 "일시적 오류"를 구분하지 못한다.
//       그래서 ②번 칸은 **키 없는 팀원 환경**을 위한 것이면서, 실 키 환경의
//       일시적 실패에도 탄다. ②도 반경이 1.2km 라 엉뚱한 곳으로 가지는 않는다.
//
// 💰 켜져 있을 때만 핑 1개당 카카오 로컬 1콜이 늘어난다. 좌표를 소수 3자리
//    (≈110m 격자)로 끊어 30일 캐시하므로 같은 자리를 다시 찍으면 0콜이다.
//    **실 API 가 답한 것만 캐시한다** — "가장 가까운 역은 여기다" 도, "반경 안에
//    역이 없다" 도 카카오가 답한 사실이라 둘 다 캐시한다. 캐시하지 않는 것은
//    **못 물어본 경우**(키 없음·오류)다 — 그걸 담아 두면 나중에 키를 넣어도
//    계속 폴백이 나온다(CLAUDE.md §3-5).
//
// ⚠️ 캐시 TTL 이 30일이라 **반경 상수를 고치면 옛 답이 한동안 남는다.**
//    검증 중에 `STATION_SNAP_RADIUS_M` 을 바꿨다면 `logs/` 의 캐시를 지우고 볼 것.
// ─────────────────────────────────────────────────────────────
import { FLAGS } from "./flags";
import { coord2RegionKakao, searchByCategoryKakao, type Coord } from "./kakao";
import { HUBS, haversineKm } from "./geo";
import { stationCacheGet, stationCacheSet } from "./cache-store";

/** 카카오 카테고리 그룹 코드 — 지하철역. (`lib/hub-pool.ts` 와 같은 코드) */
const SUBWAY_CODE = "SW8";

/**
 * 역으로 스냅할 최대 거리(m).
 *
 * 1.2km 인 이유: 서울 지하철 역 간격이 대체로 0.8~1.2km 다. 이보다 넓히면
 * "내가 찍은 곳"과 "후보로 올라간 역"이 도보권을 벗어나 딴 동네가 된다.
 * 좁히면 역과 역 사이를 찍었을 때 아무 데도 안 걸려 매번 시·군·구로 떨어진다.
 */
export const STATION_SNAP_RADIUS_M = 1_200;

/**
 * 거점 좌표표에도 **같은 반경**을 쓴다.
 *
 * 한때 이 값을 3km 로 크게 잡았다 — 거점표가 34곳뿐이라 좁게 잡으면 키 없는
 * 환경에서 거의 안 걸리기 때문이었다. 그런데 3km 면 강남·역삼·선릉·삼성이
 * 전부 "강남역"으로 뭉친다. **2km 떨어진 두 곳을 같은 곳이라고 말하는 것**은
 * 핑을 묶는 게 아니라 뭉개는 것이다.
 *
 * 좁게 잡아 안 걸리면 그냥 다음 칸(시·군·구/좌표)으로 간다 — 지금까지의 동작
 * 그대로라 손해가 없다. **넓게 잡아 틀리는 쪽이 손해다.**
 *
 * ⚠️ 이 칸은 카카오에 **못 물어봤을 때만** 탄다(키 없음·호출 실패). 물어봐서
 *    "역 없음"을 받았으면 억지로 거점을 붙이지 않고 시·군·구로 내려간다.
 */
export const HUB_SNAP_RADIUS_M = STATION_SNAP_RADIUS_M;

export type SnapSource = "station" | "hub" | "region" | "coord";

export interface SnapResult {
  name: string;
  lat: number;
  lng: number;
  /** 어느 칸에서 결정됐나 — **진단용**. 화면 문구를 이걸로 갈라 쓰지 않는다. */
  source: SnapSource;
}

/**
 * 카카오가 주는 역 이름에서 **뒤에 붙는 꼬리를 뗀다.**
 *
 *   "강남역 2호선"            → "강남역"
 *   "신촌역 경의중앙선"        → "신촌역"
 *   "홍대입구역 공항철도"      → "홍대입구역"
 *   "총신대입구(이수)역 4호선" → "총신대입구(이수)역"
 *   "강남역 2호선 3번출구"     → "강남역"
 *
 * ⚠️ **이게 없으면 이 기능이 정반대로 동작한다.** 후보 병합은 이름 일치로
 *    판정하는데(`lib/store.ts` `addRegionCandidate`), 카카오 SW8 은 같은 역을
 *    **노선마다 따로** 준다. 2호선 쪽을 찍은 사람과 신분당선 쪽을 찍은 사람이
 *    서로 다른 후보가 되어 표가 갈린다 — 표를 모으려고 만든 기능이 표를 쪼갠다.
 *
 * ⚠️ **카카오 응답 형식을 이 저장소 안에서는 확정할 수 없다.**
 *    `lib/hub-pool.ts:215` 주석은 `place_name` 이 이미 `도봉산역` 이라고 하고,
 *    `lib/kakao.ts:157` 주석은 노선 정보가 `category_name` 쪽에 있다고 한다 —
 *    두 주석이 서로 다른 그림을 그린다. 실 키 응답을 한 번 찍어야 확정된다
 *    (💰 카카오 로컬 1콜 · `docs/발표_로컬시연.md` 의 확인 절차).
 *
 *    그래서 **둘 중 어느 쪽이어도 같은 답이 나오게** 짰다:
 *      ① `역` 으로 끝나는 첫 토큰이 있으면 **거기서 자른다** (뒤는 전부 버린다)
 *      ② 없으면 뒤에서부터 노선처럼 생긴 토큰(`…호선`·`…선`·`…철도`)만 뗀다
 *    꼬리가 없는 `강남역` 은 ①에서 그대로 남는다.
 */
export function normalizeStationName(placeName: string): string {
  const raw = String(placeName || "").trim().split(/\s+/).filter(Boolean);
  if (raw.length === 0) return "";
  // ⓪ 노선처럼 생긴 토큰을 **위치와 상관없이** 먼저 버린다. 카카오가 노선을 앞에
  //    붙여 주더라도(`2호선 강남역`) 같은 답이 나와야 병합이 깨지지 않는다.
  //    전부 노선 토큰이면(있을 리 없지만) 원본 첫 토큰으로 되돌아간다.
  const parts = raw.filter((p) => !/(호선|선|철도)$/.test(p));
  if (parts.length === 0) return raw[0];
  // ① 역 이름은 거의 항상 한 토큰이고 `역` 으로 끝난다. 그 뒤는 출구든 뭐든
  //    우리에게 필요 없다 — 같은 역이 하나로 묶이는 것이 목적이다.
  const i = parts.findIndex((p) => p.endsWith("역"));
  if (i >= 0) return parts.slice(0, i + 1).join(" ");
  // ② `역` 이 안 붙는 이름(경전철 일부 등)은 남은 것을 그대로 쓴다.
  return parts.join(" ");
}

/**
 * 키 없이 쓰는 거점 좌표표 — `HUBS` 에서 **별칭을 걷어낸 것**.
 *
 * `HUBS` 아래쪽에는 "대전"→대전역 처럼 지오코딩용 별칭이 붙어 있는데, 좌표가
 * 원본과 **완전히 같다.** 그래서 좌표가 겹치면 나중 것을 버린다 — 사람이 목록을
 * 다시 손으로 고르지 않아도 되고, `HUBS` 에 거점이 추가되면 여기도 따라온다.
 * (`Object.entries` 는 선언 순서를 지키므로 원본이 먼저 들어온다)
 */
export const SNAP_HUBS: { name: string; lat: number; lng: number }[] = (() => {
  const out: { name: string; lat: number; lng: number }[] = [];
  for (const [name, c] of Object.entries(HUBS)) {
    if (out.some((h) => h.lat === c.lat && h.lng === c.lng)) continue;
    out.push({ name, lat: c.lat, lng: c.lng });
  }
  return out;
})();

/** 반경 안에서 가장 가까운 거점. 없으면 null. */
export function nearestHub(c: Coord, radiusM = HUB_SNAP_RADIUS_M): SnapResult | null {
  let best: { h: (typeof SNAP_HUBS)[number]; km: number } | null = null;
  for (const h of SNAP_HUBS) {
    const km = haversineKm(c, h);
    if (!best || km < best.km) best = { h, km };
  }
  if (!best || best.km * 1000 > radiusM) return null;
  return { name: best.h.name, lat: best.h.lat, lng: best.h.lng, source: "hub" };
}

/** 좌표 캐시 키 — 소수 3자리(≈110m)로 끊는다. 같은 격자면 같은 역이다. */
const gridKey = (c: Coord) => `sw8:${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;

/**
 * 반경 안에서 가장 가까운 **실제 지하철역** (카카오 SW8).
 *
 * @returns 역 / `[]`(물어봤는데 없음) 은 `null` + `asked: true`,
 *          못 물어봤으면 `null` + `asked: false`
 */
export async function nearestStationKakao(
  c: Coord
): Promise<{ station: SnapResult | null; asked: boolean }> {
  const key = gridKey(c);
  const hit = await stationCacheGet(key);
  // 이름이 빈 값이면 "여긴 역이 없다"를 캐시해 둔 것이다 (아래 참고)
  if (hit) return { station: hit.name ? { ...hit, source: "station" } : null, asked: true };

  // 카카오는 `sort=distance` 로 가까운 순을 준다 — 첫 번째가 가장 가까운 역이다.
  const found = await searchByCategoryKakao(SUBWAY_CODE, c, 1, STATION_SNAP_RADIUS_M);
  if (found === null) return { station: null, asked: false }; // 키 없음·오류 → 캐시하지 않는다
  const doc = found[0];
  const name = doc ? normalizeStationName(doc.name) : "";
  // 💰 **"역이 없다"도 캐시한다.** 이것도 실 API 가 성공적으로 답한 값이다
  //    (CLAUDE.md §3-5 가 금지하는 것은 *폴백값* 캐시다 — 위 `null` 은 캐시하지 않는다).
  //    안 하면 역이 없는 동네(봉담·화성 — 우리 학교 근처다)에서 찍을 때마다
  //    카카오를 다시 부른다. 같은 자리를 열 번 찍으면 열 콜이다.
  //    좌표를 담아 두는 이유는 캐시 항목 모양을 하나로 유지하기 위해서다(값은 안 쓴다).
  await stationCacheSet(key, { name, lat: doc?.lat ?? c.lat, lng: doc?.lng ?? c.lng });
  if (!name) return { station: null, asked: true }; // 반경 안에 역이 없다
  return { station: { name, lat: doc!.lat, lng: doc!.lng, source: "station" }, asked: true };
}

/**
 * 지도에 찍은 좌표 → 후보로 올릴 **{이름, 좌표}**.
 *
 * 호출부(`app/api/meeting/route.ts` 의 `addRegion`)는 이 함수만 부르면 된다 —
 * 어느 칸에서 결정됐든 항상 쓸 수 있는 값이 나온다(실패 없음).
 */
export async function snapPing(c: Coord): Promise<SnapResult> {
  if (FLAGS.pingSnapStation) {
    const { station, asked } = await nearestStationKakao(c);
    if (station) return station;
    // 못 물어본 경우(키 없음)에만 거점 좌표표로 간다.
    // 물어봤는데 없었다면(`asked`) 그 동네에 역이 없는 것이다 → 시·군·구로.
    if (!asked) {
      const hub = nearestHub(c);
      if (hub) return hub;
    }
  }

  // 시·군·구(또는 `FLAGS.pingSnapDong` 이면 행정동) — 지금까지의 기본 동작
  const region = await coord2RegionKakao(c);
  if (region) return { ...region, source: "region" };

  // 마지막 칸: 좌표를 소수 3자리로 끊어 이름을 만든다 — 같은 자리를 두 번 찍으면
  // 같은 이름이 나와 병합 규칙(이름 일치)이 그대로 산다.
  return {
    name: `지도 ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`,
    lat: c.lat,
    lng: c.lng,
    source: "coord",
  };
}
