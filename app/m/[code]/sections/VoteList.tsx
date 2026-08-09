"use client";

// ─────────────────────────────────────────────────────────────
// 거점/가게 투표 목록 — 서버에 집계되고 전원에게 폴링으로 반영된다.
//
// 👤 담당: 투표·추천 화면 (`.github/CODEOWNERS`)
//
// 표는 DB가 1인 1표를 보장한다(`votes` 테이블 PK). 같은 후보를 다시 누르면
// 취소, 다른 후보를 누르면 옮겨간다 — 그 판단은 서버(`castVote`)가 하고
// 여기서는 "내가 지금 어디에 표를 뒀는지"만 표시한다.
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";
import { formatMinutes, formatGap } from "@/lib/format";

export interface VoteListProps {
  /** region = 1차 거점 · place = 2차 가게 */
  target: "region" | "place";
  state: MeetingState;
  /** 후보 id → 득표수 */
  tally: Record<string, number>;
  /** 내가 투표한 후보 id (없으면 null) */
  myVote: string | null;
  /** 최다득표 후보 id (동점이면 하나만) */
  topId: string | null;
  disabled: boolean;
  onVote: (candidateId: string, candidateName: string, isMine: boolean) => void;
}

export default function VoteList({
  target,
  state,
  tally,
  myVote,
  topId,
  disabled,
  onVote,
}: VoteListProps) {
  const rows =
    target === "region"
      ? state.regions.map((r) => ({
          id: r.id,
          title: r.name,
          plainName: r.name,
          sub: `최대 ${formatMinutes(r.maxMin)} · 편차 ${formatGap(r.devMin)}`,
          // 참가자가 직접 올린 후보임을 밝힌다 — 자동 추천과 구분되어야 판단이 된다.
          // v9: AI 가 같은 동을 추천했으면 **둘 다** 보여준다("○○ 제안 · AI 추천").
          badge: [r.proposedBy ? `${r.proposedBy} 제안` : null, r.aiSuggested ? "AI 추천" : null]
            .filter(Boolean).join(" · ") || null,
        }))
      : state.places.map((p) => ({
          id: p.id,
          title: `${p.emoji} ${p.name}`,
          plainName: p.name,
          sub: `${p.category} · ${p.distanceM}m${p.rating > 0 ? ` · ⭐ ${p.rating}` : ""}`,
          badge: [p.proposedBy ? `${p.proposedBy} 등록` : null, p.aiSuggested ? "AI 추천" : null]
            .filter(Boolean).join(" · ") || null,
        }));

  if (rows.length === 0) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          아직 후보가 없어요.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((row) => {
        const n = tally[row.id] ?? 0;
        const mine = myVote === row.id;
        return (
          <div key={row.id} className="v8-voterow">
            <div className="grow">
              <div className="i-title">
                {row.title}
                {topId === row.id && n > 0 && (
                  <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>
                    최다
                  </span>
                )}
                {row.badge && (
                  <span className="chip line" style={{ marginLeft: 6, fontSize: 9 }}>
                    {row.badge}
                  </span>
                )}
              </div>
              <div className="i-sub">
                <b>{n}표</b> · {row.sub}
              </div>
            </div>
            <button
              className={"v8-votepill" + (mine ? " voted" : "")}
              disabled={disabled}
              onClick={() => onVote(row.id, row.plainName, mine)}
            >
              {mine ? "투표함 ✓" : "투표"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
