// ─────────────────────────────────────────────────────────────
// odsay.ts — ODsay 대중교통 길찾기(searchPubTransPathT)
// 서버 키는 호출 IP 화이트리스트 등록 필요(lab.odsay.com).
// 키 없거나 오류 시 null → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";
import { FLAGS } from "./flags";
import type { Coord } from "./kakao";
// 수단 매핑표(trafficType·trainType)는 별도 파일이다 — 근거가 되는 실측 기록이 길고,
// 이 파일이 400줄 제한에 걸려 있었다.
import {
  AIR_TRAFFIC_TYPE, KIND_LABEL, MODE_ORDER, WALK_TRAFFIC_TYPE,
  isRideType, kindOf, trainTypeLabel, type TransitKind,
} from "./odsay-modes";
// 도시간 응답은 역↔역만 답한다 — 출발지↔역·연계·역↔목적지를 여기서 추정해 더한다.
import { intercityGapMinutes } from "./odsay-access";
// 호출 껍데기(프록시)와 실패 진단 로그. 이 파일은 "응답 해석"만 맡는다.
import { PROXY_INIT, odsayError, warnEmpty, warnHttp, warnThrown } from "./odsay-client";

export interface TransitResult {
  /**
   * 총 이동시간(분). **도시간 경로에서는 ODsay 값 + 접근·연계·도착 추정치**다
   * (ODsay 는 역↔역만 답한다 — `odsay-access.ts` 참고). 순수 ODsay 값이 필요하면
   * `min - estimatedMin` 으로 되돌린다.
   */
  min: number;
  /** 위 `min` 에 포함된 **추정** 시간(분). 0 이면 전부 ODsay 실측이다. */
  estimatedMin?: number;
  transfers: number; // 환승 횟수
  fare: number;      // 요금(원)
  walkM: number;     // 총 도보(m)
  /**
   * 껍데기 응답 가드를 통과한 값인지.
   * `false` 는 진단 모드(FLAGS.odsayProbe)에서만 나오며 **믿을 수 없는 값**이라는 뜻이다.
   * 표시하는 쪽은 이 값이 false 면 실제 경로처럼 그리지 않는다(CLAUDE.md §6).
   */
  verified?: boolean;
}

// ── 경로 후보 상세 (시안1: 경로 상세 바텀시트용) ──
export interface TransitLeg {
  /** 이동 수단. 값의 뜻과 `"other"` 안전장치는 `odsay-modes.ts` 의 `TransitKind` 참고. */
  kind: TransitKind;
  name: string;         // 노선명/버스번호/열차명, 도보는 ""
  from: string;         // 승차 지점 (도보는 "")
  to: string;
  stations: number;     // 정거장 수 (도보 0)
  min: number;          // 구간 소요(분)
  distanceM: number;    // 도보 거리(m), 그 외 0
  /**
   * ODsay 원시 `trafficType`. **1 지하철 · 2 시내버스 · 3 도보 · 4 열차 ·
   * 5 고속버스 · 6 시외버스 · 7 항공**(2026-08-04 실측으로 5·6·7 확정).
   * 그 밖의 값이 오면 `kind` 가 `"other"` 가 된다 — 이 원시값으로 정체를 확인한다.
   */
  rawTrafficType?: number;
  /**
   * 철도 구간의 원시 `subPath.trainType`. 이름을 붙인 값은 `1`(KTX)·`8`(SRT) 뿐이고
   * `3`·`6` 은 관측만 됐다 — 화면엔 "열차"로 뜨므로 **정체를 좁히려면 이 값을 본다.**
   */
  rawTrainType?: number;
  /**
   * 수단명을 못 뽑았을 때의 원시 `lane[0]` (진단 모드에서만 채운다).
   *
   * ⚠️ 도시간 경로(`pathType` 11·12·13)에는 `lane` 이 아예 없다 — 열차명은
   * `subPath.trainType` 에, 요금은 `info.totalPayment` 에 따로 실린다(2026-08-04 실측).
   * "응답에 없다"가 아니라 "내가 본 필드에 없다"였던 사고가 여기서 두 번 났다.
   */
  rawLane?: unknown;
}
export interface TransitPathDetail {
  label: string;        // "지하철 직통" / "버스만" / "열차 직통" 등
  /**
   * ODsay 경로 분류. 1 지하철 · 2 버스 · 3 혼합 · **11 시외**(실측).
   * 값 종류를 다 알지 못하므로 `number` 로 둔다 — 좁게 선언했다가 시외(11)가
   * 타입과 어긋난 적이 있다. 화면은 이 값을 직접 쓰지 않고 `label` 을 쓴다.
   */
  pathType: number;
  min: number;
  fare: number;
  transfers: number;
  walkM: number;
  legs: TransitLeg[];
  /**
   * `min` 에 포함된 **추정** 시간(분) — 출발지→첫 탑승지 · 구간 사이 연계 ·
   * 마지막 하차지→목적지의 합. 도시간 경로에서만 0 보다 크다.
   * 화면은 이 값이 있으면 "추정이 섞였다"고 반드시 밝힌다(CLAUDE.md §6).
   */
  estimatedMin?: number;
  /** 껍데기 가드 통과 여부 — false 면 믿을 수 없는 값(진단 모드에서만 나온다) */
  verified?: boolean;
  /**
   * 폴리라인 식별자(`info.mapObj`) 존재 여부.
   * 껍데기 응답에도 이게 있으면 지도에는 실경로처럼 선이 그려질 수 있다
   * (`transitPathOdsay` 에는 껍데기 가드가 없다) — 실측 확인 항목.
   */
  hasMapObj?: boolean;
}

// ── 원시 응답 조각 (any 금지 — 필요한 필드만 unknown 으로 받고 가드로 좁힌다) ──
interface RawSubPath {
  trafficType?: unknown;
  trainType?: unknown; // 철도 구간에만 온다 (1 KTX · 8 SRT — odsay-modes.ts)
  sectionTime?: unknown;
  distance?: unknown;
  stationCount?: unknown;
  startName?: unknown;
  endName?: unknown;
  lane?: unknown;
  // 승·하차 지점 좌표. **X 가 경도, Y 가 위도**다 (접근시간 보정에 쓴다)
  startX?: unknown;
  startY?: unknown;
  endX?: unknown;
  endY?: unknown;
}
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * 구간의 수단명. 지하철은 `lane[0].name`, 버스는 `lane[0].busNo` 에 있다.
 *
 * **철도는 `lane` 이 아니라 `subPath.trainType` 에 실린다**(2026-08-04 실측).
 * 예전엔 `lane` 만 보고 "ODsay 가 열차 노선 정보를 안 준다"고 결론냈는데 틀렸다.
 * 이름을 확정하지 못한 `trainType` 은 추측하지 않고 기본 라벨("열차")로 떨어뜨린다.
 */
function laneName(sub: RawSubPath, kind: TransitKind): string {
  if (kind === "train") {
    const train = trainTypeLabel(sub.trainType);
    if (train) return train;
  }
  const lane = Array.isArray(sub.lane) ? (sub.lane[0] as Record<string, unknown> | undefined) : undefined;
  const name = str(lane?.name) || str(lane?.busNo);
  return name || KIND_LABEL[kind];
}

/**
 * 경로 요금. 도시내 응답은 `info.payment` 인데 **도시간(`pathType` 11·12·13)은
 * `info.totalPayment`** 다(2026-08-04 실측). 앞쪽만 보다가 KTX 59,800원·
 * 고속버스 39,700원을 "요금 정보 없음"으로 표시하고 있었다.
 *
 * ⚠️ 도시내의 `payment: -1`(시외 정보없음)은 그대로 -1 로 남긴다 —
 *    `formatFare()` 가 0 이하를 "요금 정보 없음"으로 그리는 계약이다.
 *
 * 🔴 **항공이 섞이면 요금을 내리지 않는다(0).** ODsay 는 날짜·시간과 무관하게
 *    김포→제주에 **고정 146,700원**을 주는데, 실제 편도는 평균 3만원대·최저 1만원대다
 *    (2026-08-04 대조). 동적 요금인 항공에 고정값이 오는 것 자체가 구조적으로 맞지 않고,
 *    **응답에 등급·기준시점 표기가 없어 이 숫자가 무엇인지 우리가 말할 수 없다.**
 *    말할 수 없는 값은 그리지 않는다(CLAUDE.md §6). 열차·버스는 현행 운임과 일치해 그대로 쓴다.
 *    원시값이 필요하면 `subPath[].payment` 를 직접 본다.
 */
function fareOf(info: { payment?: unknown; totalPayment?: unknown }, subPaths: RawSubPath[]): number {
  if (subPaths.some((s) => s.trafficType === AIR_TRAFFIC_TYPE)) return 0;
  return typeof info.payment === "number" ? info.payment : num(info.totalPayment, 0);
}

export async function transitRoutesDetail(from: Coord, to: Coord, limit = 3): Promise<TransitPathDetail[] | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng), SY: String(from.lat),
      EX: String(to.lng), EY: String(to.lat),
      apiKey: env.odsay,
    });
    const r = await fetch(`${env.odsayBase}/v1/api/searchPubTransPathT?${p.toString()}`, PROXY_INIT);
    if (!r.ok) { warnHttp("경로상세", r.status); return null; }
    const d = await r.json();
    if (odsayError(d)) return null;
    const paths = d?.result?.path;
    if (!Array.isArray(paths) || paths.length === 0) { warnEmpty("경로상세"); return null; }

    const parsed = paths.slice(0, limit).map((path: any): TransitPathDetail => {
      const info = path.info ?? {};
      const subPaths: RawSubPath[] = Array.isArray(path.subPath) ? path.subPath : [];
      const legs: TransitLeg[] = subPaths
        // 0분 도보 제거 — 진단 모드에서는 원시 구간을 하나도 빼지 않는다
        .filter((s) => FLAGS.odsayProbe || !(s.trafficType === WALK_TRAFFIC_TYPE && !(num(s.sectionTime) > 0)))
        .map((s): TransitLeg => {
          // ⚠️ 모르는 trafficType 을 "walk" 로 떨어뜨리지 않는다 — 철도가 그렇게
          //    사라졌다. 모르면 "other" 로 두어 탑승 구간으로는 남긴다(kindOf).
          const kind = kindOf(s.trafficType);
          const name = laneName(s, kind);
          return {
            kind,
            name,
            from: str(s.startName),
            to: str(s.endName),
            stations: num(s.stationCount),
            min: num(s.sectionTime),
            distanceM: s.trafficType === WALK_TRAFFIC_TYPE ? num(s.distance) : 0,
            rawTrafficType: typeof s.trafficType === "number" ? s.trafficType : undefined,
            rawTrainType: typeof s.trainType === "number" ? s.trainType : undefined,
            // 수단명을 못 뽑았을 때만, 그것도 진단 모드에서만 원본을 실어 보낸다
            ...(FLAGS.odsayProbe && name === KIND_LABEL[kind] ? { rawLane: s.lane } : {}),
          };
        });
      // 탑승 판정은 `isRideType` 과 같은 기준이어야 한다(도보만 제외).
      const rides = legs.filter((l) => l.kind !== "walk");
      const transfers = Math.max(0, rides.length - 1);
      // 라벨은 pathType(ODsay 분류)이 아니라 "실제로 파싱된 구간"으로 만든다.
      // pathType 3 을 그대로 믿고 "버스+지하철"이라 썼더니, 구간이 하나도
      // 안 잡힌 응답에도 그 문구가 붙어 사실과 달랐다(CEO 보고: 시외 경로).
      const kinds = new Set(rides.map((l) => l.kind));
      const modeName =
        kinds.size === 0
          ? "대중교통"
          : MODE_ORDER.filter((k) => kinds.has(k))
              .map((k) => KIND_LABEL[k])
              .join("+");
      const label = transfers === 0 ? `${modeName} 직통` : `${modeName} 환승 ${transfers}회`;
      // 도시간 응답은 역↔역만 답한다 — 빠진 이동을 추정해 더한다.
      const estimatedMin = intercityGapMinutes(from, to, path.pathType, subPaths);
      return {
        label,
        pathType: path.pathType,
        min: Math.round(info.totalTime ?? 0) + estimatedMin,
        estimatedMin,
        fare: fareOf(info, subPaths),
        transfers,
        walkM: info.totalWalk ?? 0,
        legs,
        hasMapObj: !!info.mapObj,
      };
    });

    // ⚠️ 쓸 수 없는 응답 걸러내기.
    //  ODsay 는 수도권·광역 도시 대중교통 중심이라, 시외 장거리(예: 서울→김천)에는
    //  탑승 구간이 하나도 없고 시간·요금·도보가 전부 0인 껍데기 경로를 돌려주기도 한다.
    //  그걸 그대로 그리면 "ODsay 실시간 82분 · 0원 · 환승 0회" 처럼 실제와 전혀
    //  다른 값이 사실처럼 보인다. 탑승 구간이 있고 시간이 잡힌 것만 남기고,
    //  하나도 못 건지면 null 을 돌려 상위에서 추정값으로 폴백하게 한다.
    // ⚠️ 가드는 **ODsay 가 준 시간**으로 판정한다. `min` 에는 우리가 더한 접근 추정치가
    //    섞여 있어서, 그걸로 보면 "시간 0인 껍데기"가 추정치 덕에 통과해 버린다.
    const usable = parsed.filter(
      (p) => p.min - (p.estimatedMin ?? 0) > 0 && p.legs.some((l) => l.kind !== "walk")
    );
    if (usable.length) return usable.map((p) => ({ ...p, verified: true }));

    // 진단 모드(FLAGS.odsayProbe)에서는 걸러낸 껍데기도 그대로 돌려준다 —
    // "시외에 뭐가 오는지"를 보려면 이 응답 자체가 관찰 대상이기 때문이다.
    // 대신 verified:false 를 붙여, 표시하는 쪽이 실제 경로처럼 그리지 않게 한다.
    if (FLAGS.odsayProbe && parsed.length) return parsed.map((p) => ({ ...p, verified: false }));
    return null;
  } catch (e) {
    warnThrown("경로상세", e);
    return null;
  }
}

export async function transitRouteOdsay(from: Coord, to: Coord): Promise<TransitResult | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng),
      SY: String(from.lat),
      EX: String(to.lng),
      EY: String(to.lat),
      apiKey: env.odsay, // URLSearchParams가 인코딩 처리
    });
    const r = await fetch(`${env.odsayBase}/v1/api/searchPubTransPathT?${p.toString()}`, PROXY_INIT);
    if (!r.ok) { warnHttp("이동시간", r.status); return null; }
    const d = await r.json();
    if (odsayError(d)) return null;
    const path = d?.result?.path?.[0];
    const info = path?.info;
    if (!info) { warnEmpty("이동시간"); return null; }
    const min = Math.round(info.totalTime ?? 0);
    // 시외 장거리에서 ODsay 가 시간 0(또는 탑승 구간 없음)인 껍데기를 주는 경우가
    // 있다 — 이동시간 계산에 그 값이 들어가면 "서울→김천 82분" 같은 결과가 된다.
    // 쓸 수 없는 응답은 null 로 돌려 거리 기반 추정으로 폴백시킨다.
    // 탑승 판정은 transitRoutesDetail 과 **같은 기준**을 쓴다(isRideType).
    // 예전엔 이쪽만 철도를 통과시켜, 추천에 쓰는 시간과 화면에 뜨는 경로가 어긋났다.
    const subPaths: RawSubPath[] = Array.isArray(path.subPath) ? path.subPath : [];
    const rides = subPaths.filter((s) => isRideType(s.trafficType));
    if (min <= 0 || rides.length === 0) {
      // 진단 모드에서도 **시간이 0 이하면 돌려주지 않는다.** 이동시간 0 은
      // 그 후보를 추천 1위로 만들어 결과를 통째로 왜곡한다(관찰 이득보다 손해가 크다).
      // "탑승 구간 없이 시간만 있는" 케이스(예: 82분·0원·환승 0회)는 실측 대상이라 통과시킨다.
      if (!FLAGS.odsayProbe || min <= 0) return null;
      return {
        min,
        transfers: Math.max(0, rides.length - 1),
        fare: fareOf(info, subPaths),
        walkM: info.totalWalk ?? 0,
        verified: false,
      };
    }
    // 껍데기 가드를 통과한 뒤에 보정한다 — 위 `min <= 0` 판정은 **ODsay 가 준 시간**으로
    // 해야 한다. 먼저 더하면 시간 0인 껍데기가 접근 추정치 덕에 살아난다.
    const estimatedMin = intercityGapMinutes(from, to, path.pathType, subPaths);
    return {
      min: min + estimatedMin,
      estimatedMin,
      transfers: Math.max(0, rides.length - 1),
      fare: fareOf(info, subPaths),
      walkM: info.totalWalk ?? 0,
      verified: true,
    };
  } catch (e) {
    warnThrown("이동시간", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 대중교통 실제 경로 좌표(polyline)
//
// ODsay 는 경로 좌표를 바로 주지 않는다. 2단계가 필요하다:
//   1) searchPubTransPathT → path[i].info.mapObj  (경로 식별자)
//   2) loadLane?mapObject=0:0@{mapObj} → lane[].section[].graphPos[]
// graphPos 는 {x: 경도, y: 위도} 형식이다.
// ─────────────────────────────────────────────────────────────
export async function transitPathOdsay(from: Coord, to: Coord): Promise<Coord[] | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng), SY: String(from.lat),
      EX: String(to.lng), EY: String(to.lat),
      apiKey: env.odsay,
    });
    const r = await fetch(`${env.odsayBase}/v1/api/searchPubTransPathT?${p.toString()}`, PROXY_INIT);
    if (!r.ok) { warnHttp("폴리라인", r.status); return null; }
    const d = await r.json();
    if (odsayError(d)) return null;
    const mapObj: string | undefined = d?.result?.path?.[0]?.info?.mapObj;
    if (!mapObj) return null;

    const lp = new URLSearchParams({ mapObject: `0:0@${mapObj}`, apiKey: env.odsay });
    const lr = await fetch(`${env.odsayBase}/v1/api/loadLane?${lp.toString()}`, PROXY_INIT);
    if (!lr.ok) { warnHttp("폴리라인(loadLane)", lr.status); return null; }
    const ld = await lr.json();
    if (odsayError(ld)) return null;

    const lanes: { section?: { graphPos?: { x: number; y: number }[] }[] }[] = ld?.result?.lane ?? [];
    const pts: Coord[] = [];
    for (const lane of lanes) {
      for (const sec of lane.section ?? []) {
        for (const g of sec.graphPos ?? []) pts.push({ lat: g.y, lng: g.x });
      }
    }
    return pts.length >= 2 ? pts : null;
  } catch (e) {
    warnThrown("폴리라인", e);
    return null;
  }
}
