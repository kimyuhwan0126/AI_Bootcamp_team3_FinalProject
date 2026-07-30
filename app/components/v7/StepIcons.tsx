"use client";

// ─────────────────────────────────────────────────────────────
// StepIcons — 피그마의 원형 아이콘 스텝퍼
//  (📍 거점 투표) ── (🏪 가게 투표) ── (✓ 최종 확정)
//  · 현재 단계: 파란 채움 원 + 파란 라벨
//  · 완료 단계: 체크 표시
//  · 예정 단계: 회색 외곽선
// ─────────────────────────────────────────────────────────────

const STEPS: { label: string; icon: (active: boolean) => JSX.Element }[] = [
  {
    label: "거점 투표",
    icon: (a) => (
      // 지도 핀
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a ? "#fff" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    ),
  },
  {
    label: "가게 투표",
    icon: (a) => (
      // 가게(차양이 있는 상점)
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a ? "#fff" : "currentColor"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10v9h16v-9" />
        <path d="M3 6l1.5-3h15L21 6c0 1.4-1.1 2.5-2.5 2.5S16 7.4 16 6c0 1.4-1.1 2.5-2.5 2.5S11 7.4 11 6c0 1.4-1.1 2.5-2.5 2.5S6 7.4 6 6c0 1.4-1.1 2.5-2.5 2.5A2.5 2.5 0 0 1 3 6z" />
        <path d="M9.5 19v-5h5v5" />
      </svg>
    ),
  },
  {
    label: "최종 확정",
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a ? "#fff" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
    ),
  },
];

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export default function StepIcons({
  step,
  onStepClick,
  maxClickable,
}: {
  step: 0 | 1 | 2;
  /** 탭을 누르면 그 단계로(과거 단계만 조회 목적으로) */
  onStepClick?: (step: 0 | 1 | 2) => void;
  /** 아직 도달하지 않은 단계는 데이터가 없어 볼 수 없다 — 이보다 뒤는 클릭 비활성 */
  maxClickable?: 0 | 1 | 2;
}) {
  return (
    <div className="stepicons" role="list" aria-label="진행 단계">
      {STEPS.map((s, i) => {
        const state = i < step ? "done" : i === step ? "on" : "todo";
        const clickable = !!onStepClick && (maxClickable == null || i <= maxClickable);
        return (
          <div className={"si " + state} key={s.label} role="listitem" aria-current={state === "on"}>
            {clickable ? (
              <button
                type="button"
                className="dot"
                style={{ padding: 0, cursor: "pointer", font: "inherit" }}
                onClick={() => onStepClick!(i as 0 | 1 | 2)}
                title={i === step ? "현재 진행 중" : "지난 단계 보기"}
              >
                {state === "done" ? CHECK : s.icon(state === "on")}
              </button>
            ) : (
              <div className="dot">{state === "done" ? CHECK : s.icon(state === "on")}</div>
            )}
            <span className="lb">{s.label}</span>
            {i < STEPS.length - 1 && <div className="ln" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
