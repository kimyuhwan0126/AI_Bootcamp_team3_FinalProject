"use client";

// ─────────────────────────────────────────────────────────────
// 참여자 현황 — 누가 출발지를 넣었고 누가 아직인지
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";
import { MAX_PARTICIPANTS } from "@/lib/types";

export interface ParticipantListProps {
  state: MeetingState;
  /** v10: 방장만 강퇴할 수 있다. 없으면 버튼 자체가 안 뜬다 */
  isLeader?: boolean;
  onKick?: (participantId: string, name: string) => void;
}

export default function ParticipantList({ state, isLeader, onKick }: ParticipantListProps) {
  // v8: 정원 8명 — 남은 자리를 보여줘야 "왜 못 들어오지?" 가 안 생긴다
  const left = Math.max(0, MAX_PARTICIPANTS - state.totalParticipants);

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <span className="eyebrow">참여자 현황</span>
        <span className="faint" style={{ fontSize: 11 }}>
          {state.originsSet}/{state.totalParticipants} 출발지 등록
        </span>
      </div>
      <div className="faint" style={{ fontSize: 10.5, marginTop: -4 }}>
        {left > 0
          ? `${state.totalParticipants}/${MAX_PARTICIPANTS}명 · ${left}자리 남음`
          : `정원이 찼어요 (${MAX_PARTICIPANTS}명) — 더 초대할 수 없어요`}
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
          {/* v10: 강퇴 — 그 사람 핑·표가 함께 지워지고, 재참여는 허용된다 */}
          {isLeader && !p.isLeader && onKick && (
            <button
              className="btn sm ghost"
              style={{ flexShrink: 0 }}
              title={`${p.name} 님을 모임에서 내보냅니다`}
              onClick={() => onKick(p.id, p.name)}
            >
              내보내기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
