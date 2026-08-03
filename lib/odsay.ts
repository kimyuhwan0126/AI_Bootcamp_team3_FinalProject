// ─────────────────────────────────────────────────────────────
// odsay.ts — ODsay 대중교통 길찾기(searchPubTransPathT)
// 서버 키는 호출 IP 화이트리스트 등록 필요(lab.odsay.com).
// 키 없거나 오류 시 null → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";
import { FLAGS } from "./flags";
import type { Coord } from "./kakao";

export interface TransitResult {
  min: number;       // 총 이동시간(분)
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
  kind: "walk" | "subway" | "bus";
  name: string;         // 노선명/버스번호, 도보는 ""
  from: string;         // 승차 지점 (도보는 "")
  to: string;
  stations: number;     // 정거장 수 (도보 0)
  min: number;          // 구간 소요(분)
  distanceM: number;    // 도보 거리(m), 그 외 0
  /**
   * ODsay 원시 `trafficType`. 1 지하철 · 2 버스 · 3 도보.
   * **그 외 값은 우리가 매핑하지 않은 수단**(시외버스·열차 등일 수 있다)이며
   * `kind` 에는 "walk" 로 떨어진다 — 시외 실측 때 이 원시값을 봐야 정체를 알 수 있다.
   */
  rawTrafficType?: number;
}
export interface TransitPathDetail {
  label: string;        // "지하철 직통" / "버스만" / "버스+지하철" 등
  pathType: 1 | 2 | 3;  // 1 지하철 2 버스 3 혼합
  min: number;
  fare: number;
  transfers: number;
  walkM: number;
  legs: TransitLeg[];
  /** 껍데기 가드 통과 여부 — false 면 믿을 수 없는 값(진단 모드에서만 나온다) */
  verified?: boolean;
  /**
   * 폴리라인 식별자(`info.mapObj`) 존재 여부.
   * 껍데기 응답에도 이게 있으면 지도에는 실경로처럼 선이 그려질 수 있다
   * (`transitPathOdsay` 에는 껍데기 가드가 없다) — 실측 확인 항목.
   */
  hasMapObj?: boolean;
}

const TRAFFIC_KIND: Record<number, TransitLeg["kind"]> = { 1: "subway", 2: "bus", 3: "walk" };

export async function transitRoutesDetail(from: Coord, to: Coord, limit = 3): Promise<TransitPathDetail[] | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng), SY: String(from.lat),
      EX: String(to.lng), EY: String(to.lat),
      apiKey: env.odsay,
    });
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const paths = d?.result?.path;
    if (!Array.isArray(paths) || paths.length === 0) return null;

    const parsed = paths.slice(0, limit).map((path: any): TransitPathDetail => {
      const info = path.info ?? {};
      const legs: TransitLeg[] = (path.subPath ?? [])
        // 0분 도보 제거 — 진단 모드에서는 원시 구간을 하나도 빼지 않는다
        .filter((s: any) => FLAGS.odsayProbe || !(s.trafficType === 3 && !(s.sectionTime > 0)))
        .map((s: any): TransitLeg => ({
          kind: TRAFFIC_KIND[s.trafficType] ?? "walk",
          name: s.lane?.[0]?.name ?? s.lane?.[0]?.busNo ?? "",
          from: s.startName ?? "",
          to: s.endName ?? "",
          stations: s.stationCount ?? 0,
          min: s.sectionTime ?? 0,
          distanceM: s.trafficType === 3 ? (s.distance ?? 0) : 0,
          rawTrafficType: s.trafficType,
        }));
      const rides = legs.filter((l) => l.kind !== "walk");
      const transfers = Math.max(0, rides.length - 1);
      // 라벨은 pathType(ODsay 분류)이 아니라 "실제로 파싱된 구간"으로 만든다.
      // pathType 3 을 그대로 믿고 "버스+지하철"이라 썼더니, 구간이 하나도
      // 안 잡힌 응답에도 그 문구가 붙어 사실과 달랐다(CEO 보고: 시외 경로).
      const hasBus = rides.some((l) => l.kind === "bus");
      const hasSub = rides.some((l) => l.kind === "subway");
      const modeName = hasBus && hasSub ? "버스+지하철" : hasSub ? "지하철" : hasBus ? "버스" : "대중교통";
      const label = transfers === 0 ? `${modeName} 직통` : `${modeName} 환승 ${transfers}회`;
      return {
        label,
        pathType: path.pathType,
        min: Math.round(info.totalTime ?? 0),
        fare: info.payment ?? 0,
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
    const usable = parsed.filter((p) => p.min > 0 && p.legs.some((l) => l.kind !== "walk"));
    if (usable.length) return usable.map((p) => ({ ...p, verified: true }));

    // 진단 모드(FLAGS.odsayProbe)에서는 걸러낸 껍데기도 그대로 돌려준다 —
    // "시외에 뭐가 오는지"를 보려면 이 응답 자체가 관찰 대상이기 때문이다.
    // 대신 verified:false 를 붙여, 표시하는 쪽이 실제 경로처럼 그리지 않게 한다.
    if (FLAGS.odsayProbe && parsed.length) return parsed.map((p) => ({ ...p, verified: false }));
    return null;
  } catch {
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
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const path = d?.result?.path?.[0];
    const info = path?.info;
    if (!info) return null;
    const min = Math.round(info.totalTime ?? 0);
    // 시외 장거리에서 ODsay 가 시간 0(또는 탑승 구간 없음)인 껍데기를 주는 경우가
    // 있다 — 이동시간 계산에 그 값이 들어가면 "서울→김천 82분" 같은 결과가 된다.
    // 쓸 수 없는 응답은 null 로 돌려 거리 기반 추정으로 폴백시킨다.
    const rides = (path.subPath ?? []).filter((s: { trafficType?: number }) => s.trafficType !== 3);
    if (min <= 0 || rides.length === 0) {
      // 진단 모드에서도 **시간이 0 이하면 돌려주지 않는다.** 이동시간 0 은
      // 그 후보를 추천 1위로 만들어 결과를 통째로 왜곡한다(관찰 이득보다 손해가 크다).
      // "탑승 구간 없이 시간만 있는" 케이스(예: 82분·0원·환승 0회)는 실측 대상이라 통과시킨다.
      if (!FLAGS.odsayProbe || min <= 0) return null;
      return {
        min,
        transfers: Math.max(0, rides.length - 1),
        fare: info.payment ?? 0,
        walkM: info.totalWalk ?? 0,
        verified: false,
      };
    }
    return {
      min,
      transfers: Math.max(0, rides.length - 1),
      fare: info.payment ?? 0,
      walkM: info.totalWalk ?? 0,
      verified: true,
    };
  } catch {
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
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const mapObj: string | undefined = d?.result?.path?.[0]?.info?.mapObj;
    if (!mapObj) return null;

    const lp = new URLSearchParams({ mapObject: `0:0@${mapObj}`, apiKey: env.odsay });
    const lr = await fetch(`https://api.odsay.com/v1/api/loadLane?${lp.toString()}`);
    if (!lr.ok) return null;
    const ld = await lr.json();

    const lanes: { section?: { graphPos?: { x: number; y: number }[] }[] }[] = ld?.result?.lane ?? [];
    const pts: Coord[] = [];
    for (const lane of lanes) {
      for (const sec of lane.section ?? []) {
        for (const g of sec.graphPos ?? []) pts.push({ lat: g.y, lng: g.x });
      }
    }
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}
