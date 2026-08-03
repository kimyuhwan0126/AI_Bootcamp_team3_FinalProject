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

/**
 * 금액 표기 — 0이면 "무료", 그 외 천단위 콤마 + 원.
 *
 * ⚠️ **음수는 "무료"가 아니라 "—"다.** 음수 금액은 어떤 화면에서도 실재하지 않고,
 * 외부 API 가 "정보 없음"을 `-1` 로 보내는 경우가 있다(ODsay `payment: -1`).
 * 예전에는 `won <= 0` 을 전부 "무료"로 묶어서, **요금을 모르는 4시간짜리 경로가
 * "무료"로 표시**됐다 — 가짜를 실제처럼 그리지 않는다(CLAUDE.md §6).
 *
 * `0` 은 호출부에 따라 뜻이 갈린다. 통행료 0원은 진짜 "무료"지만, 대중교통 요금
 * 0원은 대개 "제공 안 함"이다. **0 도 모름으로 봐야 하는 화면은 `formatFare()`** 를 쓴다.
 */
export function formatWon(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(won)) return "—";
  if (won < 0) return "—";
  if (won === 0) return "무료";
  return `${won.toLocaleString("ko-KR")}원`;
}

/**
 * 요금 표기 — **0 이하를 "정보 없음"으로 본다.** 대중교통 요금처럼
 * "0원짜리 탑승"이 존재하지 않는 값에 쓴다.
 *
 * ODsay 실측(2026-08-03): 철도(KTX·SRT) 경로는 `payment: 0`, 시외버스 경로는
 * `payment: -1` 로 온다. 둘 다 요금을 안 주는 것이지 공짜가 아니다.
 */
export function formatFare(won: number | null | undefined): string {
  if (won == null || !Number.isFinite(won) || won <= 0) return "요금 정보 없음";
  return `${won.toLocaleString("ko-KR")}원`;
}
