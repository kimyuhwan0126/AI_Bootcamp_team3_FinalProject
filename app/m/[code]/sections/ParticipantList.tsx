"use client";

// ─────────────────────────────────────────────────────────────
// 참여자 현황 — 누가 출발지를 넣었고 누가 아직인지
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";

export default function ParticipantList({ state }: { state: MeetingState }) {
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <span className="eyebrow">참여자 현황</span>
        <span className="faint" style={{ fontSize: 11 }}>
          {state.originsSet}/{state.totalParticipants} 출발지 등록
        </span>
      </div>
      {state.participants.map((p) => (
        <div className="row" key={p.id} style={{ gap: 10 }}>
          <div className={"av" + (p.transport === "car" ? " car" : "")}>{p.name.slice(0, 1)}</div>
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <b style={{ fontSize: 13 }}>{p.name}</b>
              {p.isLeader && (
                <span className="chip leader" style={{ fontSize: 9 }}>
                  방장
                </span>
              )}
            </div>
            <div className="faint" style={{ fontSize: 11 }}>
              {p.origin ? `${p.transport === "car" ? "🚗" : "🚌"} ${p.origin}` : "출발지 미등록"}
            </div>
          </div>
          {p.lat != null ? <span className="chip ok">등록</span> : <span className="chip line">대기</span>}
        </div>
      ))}
    </div>
  );
}
