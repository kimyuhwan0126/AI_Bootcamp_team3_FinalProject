// ─────────────────────────────────────────────────────────────
// odsay-modes.ts — ODsay 원시 코드(trafficType·trainType) → 우리 수단 표현
//
// 왜 파일을 나눴나: `odsay.ts` 가 371줄이었고 여기 표를 그대로 넣으면 400줄을 넘는다
// (CLAUDE.md §3 "한 파일 400줄을 넘기지 않는다. 넘으면 쪼갠다").
// 표만 따로 두면 다음에 값이 더 나와도 이 파일 한 곳만 늘어난다.
//
// ⚠️ **여기 숫자는 전부 실측이다.** 외부 구현체 3곳이 5·6(고속↔시외)을 서로 다르게
//    적어 놓아서, 자료를 믿지 않고 우리가 직접 호출해 확정했다(2026-08-04).
//    새 값을 추가할 때도 같은 원칙을 지킨다 — **추측으로 채우지 않는다.**
// ─────────────────────────────────────────────────────────────

/**
 * 이동 수단. `"other"` 는 **ODsay 가 우리가 모르는 `trafficType` 을 준 경우**다.
 *
 * ⚠️ 미지 타입을 `"walk"` 로 떨어뜨리지 않는다. 예전에는 `?? "walk"` 였는데,
 * 철도(`trafficType: 4`)가 전부 "도보"로 뭉개져 **"탑승 구간이 없는 응답"으로 보였고**
 * 껍데기 가드에 걸려 KTX·SRT 경로가 통째로 버려졌다(2026-08-03 실측).
 * `"other"` 로 두면 탑승 구간으로는 인정되되 수단명만 모르는 상태가 된다.
 * **이 안전장치를 없애지 말 것.**
 */
export type TransitKind =
  | "walk" | "subway" | "bus" | "expressBus" | "intercityBus" | "train" | "air" | "other";

/** ODsay 가 도보 구간에 쓰는 `trafficType`. 이 값만 "안 탄 구간"이다. */
export const WALK_TRAFFIC_TYPE = 3;

/**
 * 항공. **요금을 표시하지 않는 유일한 수단**이다 — 이유는 `odsay.ts` 의 `fareOf()` 참고.
 */
export const AIR_TRAFFIC_TYPE = 7;

/**
 * `subPath.trafficType` → 수단.
 *
 * **5·6 의 순서가 외부 자료마다 엇갈렸다**(고속↔시외). 2026-08-04 실측으로 확정했고,
 * 근거는 ODsay 가 준 터미널 이름 그 자체다 — 추론이 아니라 관측이다:
 *   · `5`: 센트럴시티터미널 → 전주**고속**버스터미널 / 서울**고속**버스터미널 → 부산종합버스터미널
 *          (출발지가 전부 고속버스 전용 터미널이었다)
 *   · `6`: **서울남부터미널**(시외 전용) → 전주**시외**버스공용터미널 / 동서울 → 해운대**시외**버스터미널
 *   · `7`: 김포국제공항 → 제주국제공항 75분 / 김포 → 김해국제공항 65분 (4개 구간에서 반복 관측)
 */
const TRAFFIC_KIND: Record<number, TransitKind> = {
  1: "subway",
  2: "bus", // 시내·광역버스. 터미널 기반 시외/고속은 2 가 아니라 5·6 으로 온다
  3: "walk",
  4: "train", // KTX·SRT 등 (2026-08-03 실측: 수서→부산 130분, 영등포→김천 145분)
  5: "expressBus",
  6: "intercityBus",
  7: "air",
};

/** 원시 `trafficType` → 수단. 숫자가 아니거나 모르는 값이면 `"other"`(도보 아님). */
export function kindOf(trafficType: unknown): TransitKind {
  return typeof trafficType === "number" ? TRAFFIC_KIND[trafficType] ?? "other" : "other";
}

/** 수단명이 비어 있을 때 쓰는 기본 라벨 — 빈 문자열로 두면 화면에 이름 없는 구간이 뜬다. */
export const KIND_LABEL: Record<TransitKind, string> = {
  walk: "",
  subway: "지하철",
  bus: "버스",
  expressBus: "고속버스",
  intercityBus: "시외버스",
  train: "열차",
  air: "항공",
  other: "대중교통",
};

/**
 * 경로 라벨("열차+지하철 환승 1회")을 만들 때의 수단 나열 순서.
 * 그 경로를 대표하는 수단이 앞에 오도록 둔다.
 */
export const MODE_ORDER: readonly TransitKind[] = [
  "air", "train", "expressBus", "intercityBus", "subway", "bus", "other",
];

/**
 * `subPath.trainType` → 열차 이름. **실측으로 확정한 값만 넣는다.**
 *
 * 관측은 됐지만 이름을 확정하지 못한 값이 둘 더 있다(2026-08-04):
 *   · `3` — 서울→김천 173분 16,400원 · 특실 없음  (무궁화로 **추정**, 미검증)
 *   · `6` — 서울→김천 155분 24,500원 · 특실 없음  (ITX-새마을로 **추정**, 미검증)
 * ⚠️ **추가 실측으로도 못 좁힌다** — ODsay 응답에 열차 이름 필드가 아예 없어서
 *    숫자→이름 대응은 공식 문서로만 확정된다. 그때까지는 "열차"로 폴백한다.
 */
const TRAIN_TYPE_LABEL: Record<number, string> = {
  1: "KTX", // 서울→부산 138분 59,800원(일반실 공시운임과 일치) · 용산→전주(전라선)
  8: "SRT", // 수서 출발에서만 관측 · 수서→부산 130분 52,200원 · 하루 39편
};

/** 철도 구간의 열차 이름. 모르는 `trainType` 이면 `undefined` → 호출부가 "열차"로 폴백한다. */
export function trainTypeLabel(trainType: unknown): string | undefined {
  return typeof trainType === "number" ? TRAIN_TYPE_LABEL[trainType] : undefined;
}

/**
 * 이 구간이 "탑승"인가 — 두 함수가 **같은 기준**을 쓰도록 여기 하나로 모은다.
 *
 * 예전에는 판정이 갈려 있었다:
 *   · `transitRouteOdsay`(추천 이동시간): `trafficType !== 3` → 철도를 통과시킴
 *   · `transitRoutesDetail`(경로 상세):  `kind !== "walk"` → 철도가 "도보"라 탈락
 * 같은 응답을 한쪽은 쓰고 한쪽은 버려서, **추천 시간과 화면이 어긋났다.**
 */
export function isRideType(trafficType: unknown): boolean {
  return typeof trafficType === "number" && trafficType !== WALK_TRAFFIC_TYPE;
}

// ⚠️ **`trainSpSeatYn` 을 "특실"로 표시하지 않는다.**
//    외부 구현체(twowice/myway)는 `trainSpSeatYn === "Y"` 일 때 이름에 "(특실)"을 붙이는데,
//    실측해 보니 이 값은 **"그 열차에 특실 칸이 있다"**는 뜻이지 "이 요금이 특실"이 아니다
//    (KTX·SRT 는 전 구간 "Y", 무궁화 계열은 전부 "N" 이었고, 일반실 `payment` 와
//    특실 `trainSpSeatPayment` 가 따로 온다). 붙였으면 모든 KTX 가 "KTX(특실)"이 됐다.
