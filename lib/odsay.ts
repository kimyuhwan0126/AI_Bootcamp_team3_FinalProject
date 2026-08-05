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
  /**
   * 이동 수단. `"other"` 는 **ODsay 가 우리가 모르는 `trafficType` 을 준 경우**다.
   *
   * ⚠️ 미지 타입을 `"walk"` 로 떨어뜨리지 않는다. 예전에는 `?? "walk"` 였는데,
   * 철도(`trafficType: 4`)가 전부 "도보"로 뭉개져 **"탑승 구간이 없는 응답"으로 보였고**
   * 껍데기 가드에 걸려 KTX·SRT 경로가 통째로 버려졌다(2026-08-03 실측).
   * `"other"` 로 두면 탑승 구간으로는 인정되되 수단명만 모르는 상태가 된다.
   */
  kind: "walk" | "subway" | "bus" | "train" | "other";
  name: string;         // 노선명/버스번호/열차명, 도보는 ""
  from: string;         // 승차 지점 (도보는 "")
  to: string;
  stations: number;     // 정거장 수 (도보 0)
  min: number;          // 구간 소요(분)
  distanceM: number;    // 도보 거리(m), 그 외 0
  /**
   * ODsay 원시 `trafficType`. **1 지하철 · 2 버스 · 3 도보 · 4 철도(KTX·SRT·무궁화)**.
   * 그 밖의 값이 오면 `kind` 가 `"other"` 가 된다 — 이 원시값으로 정체를 확인한다.
   */
  rawTrafficType?: number;
  /**
   * 수단명을 못 뽑았을 때의 원시 `lane[0]` (진단 모드에서만 채운다).
   *
   * 철도 구간은 `lane[0].name`·`busNo` 가 비어 열차명이 `""` 로 나온다(실측).
   * 어느 필드에 들어 있는지 확정되지 않아, **추측해서 넣는 대신 원본을 노출**해
   * 다음 실측 때 필드를 특정할 수 있게 한다.
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
  /** 껍데기 가드 통과 여부 — false 면 믿을 수 없는 값(진단 모드에서만 나온다) */
  verified?: boolean;
  /**
   * 폴리라인 식별자(`info.mapObj`) 존재 여부.
   * 껍데기 응답에도 이게 있으면 지도에는 실경로처럼 선이 그려질 수 있다
   * (`transitPathOdsay` 에는 껍데기 가드가 없다) — 실측 확인 항목.
   */
  hasMapObj?: boolean;
}

/** ODsay 가 도보 구간에 쓰는 `trafficType`. 이 값만 "안 탄 구간"이다. */
const WALK_TRAFFIC_TYPE = 3;

const TRAFFIC_KIND: Record<number, TransitLeg["kind"]> = {
  1: "subway",
  2: "bus",
  3: "walk",
  4: "train", // KTX·SRT·무궁화 (2026-08-03 실측: 수서→부산 130분, 영등포→김천 145분)
};

/**
 * 이 구간이 "탑승"인가 — 두 함수가 **같은 기준**을 쓰도록 여기 하나로 모은다.
 *
 * 예전에는 판정이 갈려 있었다:
 *   · `transitRouteOdsay`(추천 이동시간): `trafficType !== 3` → 철도를 통과시킴
 *   · `transitRoutesDetail`(경로 상세):  `kind !== "walk"` → 철도가 "도보"라 탈락
 * 같은 응답을 한쪽은 쓰고 한쪽은 버려서, **추천 시간과 화면이 어긋났다.**
 */
function isRideType(trafficType: unknown): boolean {
  return typeof trafficType === "number" && trafficType !== WALK_TRAFFIC_TYPE;
}

// ── 원시 응답 조각 (any 금지 — 필요한 필드만 unknown 으로 받고 가드로 좁힌다) ──
interface RawSubPath {
  trafficType?: unknown;
  sectionTime?: unknown;
  distance?: unknown;
  stationCount?: unknown;
  startName?: unknown;
  endName?: unknown;
  lane?: unknown;
}
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** 수단명이 비어 있을 때 쓰는 기본 라벨 — 빈 문자열로 두면 화면에 이름 없는 구간이 뜬다. */
const KIND_LABEL: Record<TransitLeg["kind"], string> = {
  walk: "",
  subway: "지하철",
  bus: "버스",
  train: "열차",
  other: "대중교통",
};

/**
 * 구간의 수단명. 지하철은 `lane[0].name`, 버스는 `lane[0].busNo` 에 있다.
 * **철도는 둘 다 비어 있는 것이 실측으로 확인됐고 어느 필드인지는 미확정**이라,
 * 없으면 추측하지 않고 수단 기본 라벨("열차")로 떨어뜨린다.
 */
function laneName(sub: RawSubPath, kind: TransitLeg["kind"]): string {
  const lane = Array.isArray(sub.lane) ? (sub.lane[0] as Record<string, unknown> | undefined) : undefined;
  const name = str(lane?.name) || str(lane?.busNo);
  return name || KIND_LABEL[kind];
}

// ── 프록시 경유 ────────────────────────────────────────────────
// ODsay 서버 키는 호출 IP 화이트리스트가 필요한데 Vercel 은 나가는 IP 가 유동이다.
// `ODSAY_BASE_URL` 로 고정 IP 프록시를 가리키게 하고, 공유 비밀이 있으면 헤더로 보낸다.
// ⚠️ 둘 다 비어 있으면 base 는 api.odsay.com, init 은 undefined 라 **기존과 동일**하다.
const PROXY_INIT: RequestInit | undefined = env.odsayProxySecret
  ? { headers: { "x-proxy-secret": env.odsayProxySecret } }
  : undefined;

/**
 * ODsay 는 **인증 실패에도 HTTP 200** 을 준다:
 *   `{"error":[{"code":"500","message":"[ApiKeyAuthFailed] ..."}]}`
 * `if (!r.ok)` 로는 못 잡고 뒤에서 우연히 걸러질 뿐이라, 여기서 명시적으로 본다.
 *
 * `console.warn` 을 남기는 게 핵심이다 — Vercel 로그에서 **"터널 장애"와 "키 문제"를
 * 구분**할 수 있어야 프록시를 붙인 의미가 있다.
 */
function odsayError(d: unknown): boolean {
  if (typeof d !== "object" || d === null) return false;
  const err = (d as { error?: unknown }).error;
  if (err === null || err === undefined) return false;

  // ⚠️ ODsay 는 error 를 **두 가지 형태**로 보낸다 — 배열만 보면 절반을 놓친다.
  //    배열: {"error":[{"code":"500","message":"[ApiKeyAuthFailed] ..."}]}   인증 실패
  //    객체: {"error":{"code":"429","message":"Too Many Requests"}}          속도 제한
  //          {"error":{"code":"-98","msg":"출, 도착지가 700m이내입니다."}}   근거리
  //
  //    예전엔 `!Array.isArray(err) → return false` 라 **객체형이 통과**했고,
  //    뒤에서 `result.path` 가 없다는 이유로 warnEmpty 가 찍혀
  //    **"구간을 못 푸는 것으로 보인다"** 는 사실과 다른 진단이 남았다.
  //    실제 사유는 429(호출 과다)였다 — 같은 구간이 순차 호출에선 전부 성공한다
  //    (2026-08-05 동시 14건 vs 순차 14건 실측: 429 9건 → 0건).
  //
  //    ⚠️ `msg` 키도 함께 본다. -98 은 `message` 가 아니라 `msg` 로 온다.
  const first = (Array.isArray(err) ? err[0] : err) as
    | { message?: unknown; msg?: unknown; code?: unknown }
    | undefined;
  if (!first) return false;

  // code 는 실측상 전부 문자열이었지만("429"·"-98"·"500"), 숫자로 와도
  // 진단이 "unknown" 으로 죽지 않게 둘 다 받는다.
  const code =
    typeof first.code === "number" ? String(first.code) : str(first.code);
  const text = str(first.message) || str(first.msg);
  console.warn("[odsay]", text || "(메시지 없음)", code ? `(code ${code})` : "");
  return true;
}

/**
 * 로그에 실을 호출 대상. **호스트만** 쓴다 — 전체 URL 에는 `apiKey` 가 들어 있어
 * 그대로 찍으면 Vercel 로그에 키가 평문으로 남는다.
 */
function odsayHost(): string {
  try {
    return new URL(env.odsayBase).host;
  } catch {
    return `(ODSAY_BASE_URL 형식 오류: ${env.odsayBase.slice(0, 30)})`;
  }
}

/**
 * 2xx 가 아닌 응답. **프록시·터널 장애가 여기로 온다** — Cloudflare 502/1033(터널
 * 다운) · 프록시 401/403(공유 비밀 불일치)이 전부 이 경로다.
 *
 * ⚠️ 예전에는 `if (!r.ok) return null` 이라 **로그 한 줄 없이 사라졌다.**
 *    #28 이 "로그로 터널 장애와 키 문제를 구분한다"고 했지만 실제로는 구분이
 *    안 됐다 — 2026-08-04 종단 확인에서 `live:false` 의 원인을 좁히지 못해 드러났다.
 */
function warnHttp(label: string, status: number): void {
  console.warn(`[odsay] ${label} HTTP ${status} (via ${odsayHost()}) — 프록시/터널 응답으로 보인다`);
}

/** fetch 가 던진 경우. 터널 주소가 죽었거나 DNS 가 안 풀린다. */
function warnThrown(label: string, e: unknown): void {
  console.warn(`[odsay] ${label} 요청 실패 (via ${odsayHost()}): ${e instanceof Error ? e.message : String(e)}`);
}

/** HTTP 200 · 에러본문도 없는데 경로가 비어 있는 경우 — ODsay 가 못 푸는 구간이다. */
function warnEmpty(label: string): void {
  console.warn(`[odsay] ${label} 200 인데 경로가 비어 있다 (via ${odsayHost()}) — 구간을 못 푸는 것으로 보인다`);
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
          //    사라졌다. 모르면 "other" 로 두어 탑승 구간으로는 남긴다.
          const kind: TransitLeg["kind"] =
            typeof s.trafficType === "number" ? TRAFFIC_KIND[s.trafficType] ?? "other" : "other";
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
          : (["train", "subway", "bus", "other"] as const)
              .filter((k) => kinds.has(k))
              .map((k) => KIND_LABEL[k])
              .join("+");
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
