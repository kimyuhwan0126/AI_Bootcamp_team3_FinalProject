"use client";

// ─────────────────────────────────────────────────────────────
// 지난 단계 조회 (읽기전용)
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";
import { formatMinutes, formatGap } from "@/lib/format";

// ── 지난 단계 조회(읽기전용) — 스텝 탭을 눌러서 들어온다 ──
//  실제 진행 단계를 건드리지 않고 그 시점의 후보·득표·확정 결과만 보여준다.
//  다시 편집하려면(투표/확정) 배너의 "현재 단계로"로 나가서 방장 되돌리기를 써야 한다.
export default function PastStepView({ step, state }: { step: 0 | 1 | 2; state: MeetingState }) {
  if (step === 0) {
    const votes = state.regionVotes ?? {};
    const tally = (id: string) => Object.values(votes).filter((v) => v === id).length;
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <span className="eyebrow">① 거점 투표 · 지난 기록</span>
        {state.regions.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>당시 거점 후보가 없었어요.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {state.regions.map((r) => (
              <div key={r.id} className="v8-voterow">
                <div className="grow">
                  <div className="i-title">
                    {r.name}
                    {state.winnerRegion?.id === r.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                  </div>
                  <div className="i-sub">
                    <b>{tally(r.id)}표</b> · 최대 {formatMinutes(r.maxMin)} · 편차 {formatGap(r.devMin)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (step === 1) {
    const votes = state.placeVotes ?? {};
    const tally = (id: string) => Object.values(votes).filter((v) => v === id).length;
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <span className="eyebrow">② 가게 투표 · 지난 기록</span>
        {state.places.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>당시 가게 후보가 없었어요.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {state.places.map((p) => (
              <div key={p.id} className="v8-voterow">
                <div className="grow">
                  <div className="i-title">
                    {p.emoji} {p.name}
                    {state.winnerPlace?.id === p.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                  </div>
                  <div className="i-sub">
                    <b>{tally(p.id)}표</b> · {p.category} · {p.distanceM}m
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}