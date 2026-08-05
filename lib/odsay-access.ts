// ─────────────────────────────────────────────────────────────
// odsay-access.ts — 도시간 경로의 "역까지 가는 시간" 보정
//
// 왜 필요한가 (2026-08-05 실측):
//   ODsay 도시간 길찾기(`pathType` 11 열차 · 12 버스 · 13 항공 · 20 복합)는
//   **역↔역 구간만** 답한다. 녹화한 도시간 81경로 **전부** `info.totalTime` 이
//   탑승구간 시간의 단순합이었다(차이 0분). 그래서 이런 값이 나온다:
//
//     강남역 → 제주공항  = 75분   (첫 탑승지가 21km 떨어진 김포국제공항)
//     강남역 → 전주역    = 86분   (첫 탑승지 용산, 6.6km)
//     센트럴시티 → 유스퀘어 = 96분 (도착지 광주송정역에서 유스퀘어까지 8.7km 더 있다)
//
//   도시내 응답(`pathType` 1·2·3)은 도보·환승대기가 subPath 에 들어 있다
//   (실측: totalTime 237 vs 구간합 232). **응답 종류가 다른 것**이라 도시간에만 보정한다.
//
//   ⚠️ 이건 표시 문제가 아니라 **추천 순위 문제**였다 — `travelMinutesEx` 가
//      이 값을 그대로 점수에 넣는다.
// ─────────────────────────────────────────────────────────────
import { estMinutes, haversineKm } from "./geo";
import type { Coord } from "./kakao";

/**
 * 이 값 이상이면 도시간 응답이다.
 * 실측 관측값: **11**(열차) · **12**(버스) · **13**(항공) · **20**(복합).
 * 도시내는 1·2·3 뿐이라 경계가 넉넉하다 — 모르는 도시간 타입이 새로 생겨도 잡힌다.
 */
const INTERCITY_PATH_TYPE = 11;

/**
 * 출발지와 첫 탑승지가 이보다 가까우면 보정하지 않는다.
 *
 * 없으면 서울역 출발·서울역 탑승에도 `estMinutes(0)` = **6분**이 붙는다
 * (그 6분은 "환승·대기" 기본값이라 같은 지점에 쓰면 근거가 없다).
 * 실측에서 서울역→서울 0.0km · 수서역→수서 0.3km 가 나왔다.
 */
const ACCESS_SKIP_KM = 0.5;

/** 도시간 경로인가 — 이 경우에만 접근·도착 시간이 응답에서 빠져 있다. */
export function isIntercityPath(pathType: unknown): boolean {
  return typeof pathType === "number" && pathType >= INTERCITY_PATH_TYPE;
}

/**
 * ODsay subPath 의 좌표를 `Coord` 로. **ODsay 는 X=경도, Y=위도**다(뒤집으면 조용히 틀린다).
 */
export function subPathCoord(
  sub: { startX?: unknown; startY?: unknown; endX?: unknown; endY?: unknown } | undefined,
  side: "start" | "end"
): Coord | null {
  if (!sub) return null;
  const x = side === "start" ? sub.startX : sub.endX;
  const y = side === "start" ? sub.startY : sub.endY;
  return typeof x === "number" && typeof y === "number" ? { lat: y, lng: x } : null;
}

/**
 * 두 지점 사이 이동시간 **추정치**(분). 좌표가 없거나 사실상 같은 지점이면 0.
 *
 * ⚠️ **과대 추정한다.** `estMinutes` 는 직선거리 모델이라 실측 대비 대략 1.7배다:
 *   · 21km(강남역→김포공항) → **107분** (실제 지하철 55~60분대)
 *   · 6.6km(강남역→용산)    → **38분**  (실제 20분대)
 * 그래도 **0분보다는 진실에 가깝다** — 지금은 접근이 통째로 빠져 제주가 75분으로 잡힌다.
 *
 * 여기에 별도 모델을 새로 만들지 않은 이유: `estMinutes` 는 ODsay 가 실패했을 때
 * 경로 전체를 추정하는 데 이미 쓰인다. **모델을 둘로 나누면 고칠 곳도 둘이 된다.**
 * `estMinutes` 개선은 `memory/status.md` §3-2 에 이미 과제로 잡혀 있고, 그게 좋아지면
 * 이 보정도 함께 좋아진다. 정확도가 더 필요하면 접근 구간을 ODsay 로 한 번 더 묻는
 * 방법이 있으나 💰 호출이 2배가 된다(status.md 후속 항목 7 에 기록).
 */
function accessMinutes(a: Coord | null, b: Coord | null): number {
  if (!a || !b) return 0;
  const km = haversineKm(a, b);
  if (km < ACCESS_SKIP_KM) return 0;
  return estMinutes(km, "transit");
}

/** 접근시간을 계산할 때 필요한 subPath 조각 (좌표만 본다). */
type Endpoints = Parameters<typeof subPathCoord>[0];

/**
 * 도시간 경로에서 ODsay 가 답하지 않은 이동시간의 **합**(분). 셋을 모두 더한다:
 *
 *   ① 출발지 → 첫 탑승지        (강남역 → 김포국제공항 21km)
 *   ② 구간 사이 연계            (**오송역 → 청주국제공항** — `pathType 20` 복합 경로에서
 *                               ODsay 는 `35분 + 70분 = 105분` 으로 끝내고 그 사이를 0분으로 둔다)
 *   ③ 마지막 하차지 → 목적지    (광주송정역 → 유스퀘어 8.7km)
 *
 * 도시간이 아니면 0 — 도시내 응답은 이 구간들이 이미 도보·환승 subPath 로 들어 있다.
 */
export function intercityGapMinutes(
  from: Coord,
  to: Coord,
  pathType: unknown,
  subPaths: Endpoints[]
): number {
  if (!isIntercityPath(pathType) || subPaths.length === 0) return 0;
  let sum = accessMinutes(from, subPathCoord(subPaths[0], "start"));
  for (let i = 1; i < subPaths.length; i++) {
    sum += accessMinutes(subPathCoord(subPaths[i - 1], "end"), subPathCoord(subPaths[i], "start"));
  }
  return sum + accessMinutes(subPathCoord(subPaths[subPaths.length - 1], "end"), to);
}
