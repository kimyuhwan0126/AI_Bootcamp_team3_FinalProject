"use client";

// ─────────────────────────────────────────────────────────────
// 방장 컨트롤 바 — 화면 하단 고정 (탭바 위에 쌓인다)
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// 설계 의도
//   · 마감은 **자동이 아니라 방장 확정**이다. 전원이 투표해도 자동으로 넘어가지
//     않는다(피그마 설계). 대신 버튼 문구가 진행률을 말해준다 —
//     "0/3명 투표 중 · 지금 확정" → "3/3명 투표 완료 · 투표 종료 및 확정".
//     예전 문구("강제 확정(방장 권한)")는 정상 마감도 월권처럼 읽혔다.
//   · 지난 단계를 보는 중에는 부모가 이 바를 아예 숨긴다 — 읽기전용 화면에서
//     실제 단계를 건드리는 버튼을 누르는 사고를 막기 위해서다.
//
// ⚠️ `.leaderbar` 는 `position: fixed` 다. `sticky` 로 두면 문서 끝에서 흐름
//    위치보다 올라앉아 마지막 버튼을 덮는다(실제로 겪은 버그).
// ─────────────────────────────────────────────────────────────
import type { MeetingState, Stage } from "@/lib/types";

/** 버튼 두 개가 나란히 놓여 폭이 좁다 — 이름이 길면 바가 뚱뚱해진다. */
function shortName(name: string | undefined): string {
  const n = String(name ?? "");
  return n.length > 9 ? n.slice(0, 8) + "…" : n;
}

export interface LeaderBarProps {
  stage: Stage;
  state: MeetingState;
  busy: boolean;
  aiChatEnabled: boolean;
  /** 최다득표 후보 id (없으면 null) */
  topRegionId: string | null;
  topPlaceId: string | null;
  regionVoteCount: number;
  placeVoteCount: number;
  /** `/api/meeting` 액션 한 방 — 이 바가 하는 일이 전부 그것이라 그대로 받는다 */
  onAction: (body: Record<string, unknown>, ok?: string) => Promise<unknown>;
  participantId: string | undefined;
  onOpenManual: (target: "region" | "place") => void;
}

export default function LeaderBar({
  stage,
  state,
  busy,
  aiChatEnabled,
  topRegionId,
  topPlaceId,
  regionVoteCount,
  placeVoteCount,
  onAction,
  participantId,
  onOpenManual,
}: LeaderBarProps) {
  /** 최다득표 후보로 확정하는 버튼 — 문구가 투표 진행률을 말한다. */
  const confirmBtn = (target: "region" | "place") => {
    const pool: { id: string; name: string }[] = target === "region" ? state.regions : state.places;
    const topId = target === "region" ? topRegionId : topPlaceId;
    const voteCount = target === "region" ? regionVoteCount : placeVoteCount;
    const total = state.totalParticipants;
    const name = pool.find((c) => c.id === topId)?.name;
    const allVoted = total > 0 && voteCount >= total;
    const noOrigins = target === "region" && state.originsSet === 0;
    return (
      <button
        className={"btn" + (allVoted && topId ? "" : " ghost")}
        disabled={busy || !topId}
        title={name}
        onClick={() =>
          onAction({ action: "confirmManual", participantId, target, id: topId }, `${name}(으)로 확정했어요`)
        }
      >
        <span className="lb-sub">
          {!topId
            ? "후보 준비 중"
            : allVoted
            ? `${voteCount}/${total}명 투표 완료`
            : `${voteCount}/${total}명 투표 중`}
        </span>
        <b>
          {noOrigins
            ? "출발지를 등록하면 확정할 수 있어요"
            : !topId
            ? "후보를 계산하는 중…"
            : `${allVoted ? "투표 종료 및 확정" : "지금 확정"} · ‘${shortName(name)}’`}
        </b>
      </button>
    );
  };

  const votePhase: "region" | "place" = state.aiPhase === "region" ? "region" : "place";

  return (
    <div className="leaderbar">
      {stage === "main" &&
        (aiChatEnabled ? (
          <button
            className="btn"
            disabled={busy || state.originsSet < 1}
            onClick={() => onAction({ action: "openChat", participantId }, "AI 대화를 시작했어요")}
          >
            💬 AI와 함께 정하기 · 대화 시작
          </button>
        ) : (
          confirmBtn("region")
        ))}

      {stage === "chat" && (
        <>
          <button
            className="btn ghost"
            disabled={busy}
            title="출발지·거점 투표 화면으로 돌아갑니다"
            onClick={() =>
              // v8은 거점 투표가 메인 화면에 있으므로 뒤로가기는 항상 메인이다.
              // (AI 모드에서는 기존대로 거점 논의만 다시 연다)
              aiChatEnabled && state.aiPhase === "place"
                ? onAction({ action: "reopen", participantId, target: "region" }, "거점부터 다시 정해요")
                : onAction({ action: "backToMain", participantId }, "거점 투표로 돌아갔어요")
            }
          >
            ← 거점 다시
          </button>

          {!aiChatEnabled ? (
            confirmBtn(votePhase)
          ) : (
            <button
              className="btn"
              disabled={busy}
              onClick={() => onOpenManual(votePhase)}
              title="방장이 장소를 확정합니다"
            >
              ✍ 직접 확정
            </button>
          )}

          {aiChatEnabled && (
            <button
              className="btn"
              disabled={busy || state.aiBusy}
              onClick={() => onAction({ action: "aiDecide", participantId }, "AI에게 결정을 요청했어요")}
            >
              🤖 AI에게 결정 요청
            </button>
          )}
        </>
      )}

      {stage === "result" && (
        <>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              onAction({ action: "reopen", participantId, target: "place" }, "장소 논의를 다시 열었어요")
            }
          >
            🔄 장소 다시 논의
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => onAction({ action: "backToMain", participantId }, "메인으로 돌아갔어요")}
          >
            처음부터
          </button>
        </>
      )}
    </div>
  );
}
