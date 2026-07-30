// ─────────────────────────────────────────────────────────────
// format.ts — 화면에 숫자를 사람이 읽는 방식으로 내보내는 유틸
//
//  "82분"처럼 60분을 넘는 값을 분으로만 쓰면 얼마나 먼지 감이 안 온다.
//  1시간을 넘으면 "1시간 22분"으로 끊어 준다(CEO 지적사항).
// ─────────────────────────────────────────────────────────────

/**
 * 이동시간 표기. 60분 미만은 "42분", 그 이상은 "1시간 22분"(딱 맞으면 "2시간").
 * null/undefined/음수는 "—".
 */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min < 0) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`;
}

/**
 * 편차 표기 — 이동시간과 같은 규칙이지만 0분을 "0분"으로 남긴다
 * ("편차 —"는 계산 실패처럼 읽히므로).
 */
export function formatGap(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min <= 0) return "0분";
  return formatMinutes(min);
}

/** 거리 표기 — 1km 미만은 m, 그 이상은 소수 한 자리 km */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 요금·금액 — 0이면 "무료", 그 외 천단위 콤마 + 원 */
export function formatWon(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(won)) return "—";
  if (won <= 0) return "무료";
  return `${won.toLocaleString("ko-KR")}원`;
}
