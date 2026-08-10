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
  /** v19 §8: 추천 (방장 opt-in). `hasPrev` 면 교체/추가를 먼저 묻는다 (v14) */
  onAiRecommend: (hasPrev: boolean) => void;
  /**
   * **LLM** 추천이 켜져 있는지 (`NEXT_PUBLIC_FF_AI_VOTE`).
   *
   * ⚠️ 꺼져 있어도 버튼은 사라지지 않는다 — 점수 기반 추천(`suggestRegions`)으로
   *    떨어질 뿐이다. 예전엔 이 값이 `false` 면 버튼이 통째로 없어졌고, 그 자리를
   *    서버의 자동 채움이 몰래 메우고 있었다(2026-08-10 "AI 추천은 어디 있냐" 제보).
   */
  aiRecommendEnabled: boolean;
  /**
   * 지역이 **한 칸으로 합쳐졌는가** (핑 = 표 · `FLAGS.regionVoteStep` 의 반대).
   * 부모가 판단해 넘긴다 — 이 컴포넌트가 플래그를 직접 읽으면 테스트가 어려워진다.
   */
  regionMerged: boolean;
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
  onAiRecommend,
  aiRecommendEnabled,
  regionMerged,
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
    // v6: 아직 투표하지 않은 사람들 — 방장의 확정 판단 근거
    const box = target === "region" ? state.regionVotes : state.placeVotes;
    const pending = state.participants.filter((p) => !box?.[p.id]).map((p) => p.name);
    const pendingLabel =
      pending.length === 0 ? "없음"
        : pending.length <= 2 ? pending.join(", ")
        : `${pending[0]} 외 ${pending.length - 1}명`;
    return (
      <button
        className={"btn" + (allVoted && topId ? "" : " ghost")}
        disabled={busy || !topId}
        title={
          // v6: 아직 안 찍은 사람 이름 — 방장이 "지금 확정해도 되나"를 판단하는 근거다
          pending.length > 0 ? `미투표: ${pending.join(", ")}` : name
        }
        onClick={() =>
          onAction({ action: "confirmManual", participantId, target, id: topId }, `${name}(으)로 확정했어요`)
        }
      >
        <span className="lb-sub">
          {!topId
            ? "아직 표 없음"
            : allVoted
            ? `${voteCount}/${total}명 투표 완료`
            // v6: 숫자만으로는 "누구를 기다리는지" 알 수 없다 — 이름을 함께 보여준다
            : `${voteCount}/${total}명 · 미투표 ${pendingLabel}`}
        </span>
        <b>
          {noOrigins
            ? "출발지를 등록하면 확정할 수 있어요"
            : !topId
            // ⚠️ 예전 문구는 "후보를 계산하는 중…" 이었다. 후보는 이미 잠긴 뒤라
            //    계산 중일 리가 없다 — 기다리면 되는 줄 알게 만드는 문구였다.
            ? "한 표라도 들어와야 확정할 수 있어요"
            : `${allVoted ? "투표 종료 및 확정" : "지금 확정"} · ‘${shortName(name)}’`}
        </b>
      </button>
    );
  };

  const votePhase: "region" | "place" = state.aiPhase === "region" ? "region" : "place";

  // ── v19 §5: 지금 어느 칸인가 ──
  //   등록 칸에서는 '투표 시작'(= 후보 잠금)만 뜬다. 확정 버튼은 투표 칸부터다.
  //   판정 규칙은 서버(`phaseStepOf`)와 같아야 한다 — 어긋나면
  //   "눌리는데 서버가 거부하는" 버튼이 생긴다.
  const isRegistering =
    stage === "main" || (stage === "chat" && state.aiPhase === "place" && !state.placeVoteOpen);
  const registerPool = state.aiPhase === "place" ? state.places : state.regions;

  /**
   * v19 §8 — 추천 버튼. **방장에게만 보이고, 안 누르면 호출하지 않는다.**
   * 후보 등록 단계에서만 뜨고, 재호출 시 교체/추가를 묻는다 (v14).
   * 로딩(`state.aiBusy`)도 방장 화면에서만 그린다.
   *
   * 두 갈래인데 **버튼은 하나다** (부모가 어느 액션을 부를지 고른다):
   *   · `NEXT_PUBLIC_FF_AI_VOTE=1` → LLM 추천 (💰 Ollama Cloud · 지역 ~25초)
   *   · 꺼짐(기본)                 → 점수 기반 추천 (`suggestRegions` · 즉시)
   * 문구를 갈라 놓은 이유: 점수 계산을 "AI 가 골랐다"고 쓰면 과장이다
   * (루트 `CLAUDE.md` §3-6 — 가짜를 실제처럼 그리지 않는다).
   */
  const aiBtn = () => {
    const already = registerPool.some((c) => "aiSuggested" in c && c.aiSuggested);
    const what = state.aiPhase === "place" ? "지점" : "지역";
    // 지점 추천은 LLM 경로에만 있다 — 꺼져 있으면 지점 단계에선 버튼을 숨긴다
    if (!aiRecommendEnabled && state.aiPhase === "place") return null;
    return (
      <button
        className="btn"
        style={{ background: "#F1EDFF", color: "#6C5CE7", borderColor: "#6C5CE7" }}
        disabled={busy || state.aiBusy}
        title={
          aiRecommendEnabled
            ? `AI가 ${what} 후보 3곳을 제안합니다 (방장만 · 안 누르면 호출 안 함)`
            : "모두의 이동시간·편차를 계산해 공평한 지역 3곳을 후보에 올립니다 (방장만)"
        }
        onClick={() => onAiRecommend(already)}
      >
        {state.aiBusy ? (
          <>
            <span className="spinner" /> AI 추천 중… {state.aiPhase === "place" ? "(~9초)" : "(~25초)"}
          </>
        ) : aiRecommendEnabled ? (
          <>🤖 AI {what} 추천{already ? " 다시" : ""}</>
        ) : (
          <>🤖 추천 지역 3곳{already ? " 다시" : ""}</>
        )}
      </button>
    );
  };

  /** 투표 시작 = 후보 잠금 (v5, v8). 0개면 못 누르고, 1개면 서버가 투표를 생략한다. */
  const startVoteBtn = () => (
    <button
      className="btn ok"
      disabled={busy || registerPool.length === 0}
      title={
        registerPool.length === 0
          ? "후보가 없어요 — 지도를 눌러 후보를 먼저 등록해 주세요"
          : "후보를 잠그고 투표를 시작합니다"
      }
      onClick={() => onAction({ action: "startVote", participantId }, "투표를 시작했어요")}
    >
      <b>
        {registerPool.length === 0
          ? "후보 0개 — 먼저 등록해 주세요"
          : registerPool.length === 1
            ? "후보 1개 — 바로 확정하기"
            : `🗳️ 투표 시작 · 후보 ${registerPool.length}개 잠금`}
      </b>
    </button>
  );

  /**
   * 통합 모드의 **지역 확정** 버튼 (멘토링 2026-08-06 §2).
   *
   * 지역에는 '투표 시작'이 없다 — 핑이 곧 표다. 방장은 **언제든** 최다 핑 지역으로
   * 확정할 수 있다("참여자는 핑 찍지 않아도 되고, 방장이 다음 단계로 강제로 넘어갈 수 있음").
   * 그래서 `confirmBtn` 과 달리 **전원이 찍기를 기다리지 않는다.**
   */
  const confirmRegionBtn = () => {
    const pool = state.regions;
    const tally = (id: string) =>
      pool.find((r) => r.id === id)?.contributors?.length ?? 0;
    const name = pool.find((c) => c.id === topRegionId)?.name;
    const pinned = new Set(pool.flatMap((r) => r.contributors ?? [])).size;
    return (
      <button
        className={"btn" + (topRegionId ? " ok" : " ghost")}
        disabled={busy || !topRegionId}
        title={
          topRegionId
            ? `${name} — ${tally(topRegionId)}명이 찍었어요 (전원이 안 찍어도 확정할 수 있어요)`
            : "아직 아무도 지도를 누르지 않았어요"
        }
        onClick={() =>
          onAction({ action: "confirmManual", participantId, target: "region", id: topRegionId }, `${name}(으)로 정했어요`)
        }
      >
        <span className="lb-sub">
          {topRegionId
            ? `${pinned}/${state.totalParticipants}명 찍음 · ${tally(topRegionId)}표`
            : "지도를 눌러 시작하세요"}
        </span>
        <b>
          {topRegionId ? `📍 ‘${shortName(name)}’ 로 정하기` : "아직 찍힌 곳이 없어요"}
        </b>
      </button>
    );
  };

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
          <>
            {aiBtn()}
            {/* 통합 모드: 지역엔 '투표 시작'이 없다 — 바로 확정한다 */}
            {regionMerged ? confirmRegionBtn() : startVoteBtn()}
          </>
        ))}

      {stage === "chat" && (
        <>
          <button
            className="btn ghost"
            disabled={busy}
            title="이전 단계로 한 칸 되돌립니다 (표는 유지돼요)"
            onClick={() =>
              // v10: reopen 사다리 — 확정 → 투표 → 후보, 한 칸씩.
              aiChatEnabled && state.aiPhase === "place"
                ? onAction({ action: "reopen", participantId, target: "region" }, "거점부터 다시 정해요")
                : onAction({ action: "reopenStep", participantId }, "이전 단계로 돌아갔어요")
            }
          >
            ← 이전 단계
          </button>

          {!aiChatEnabled ? (
            isRegistering ? (
              <>
                {aiBtn()}
                {startVoteBtn()}
              </>
            ) : (
              confirmBtn(votePhase)
            )
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

      {stage === "result" && !state.isPast && (
        // ── 멘토링 8/6 §3: "결과 보고 **끝나는 흐름 방지**" ──
        //  결과 화면에서 빠져나갈 문이 두 개다. 헷갈리기 쉬워 **문구로 갈라 놓는다**:
        //   · 되돌리기 = "**후보**가 마음에 안 든다" → 한 칸 내려간다 · 표는 남는다
        //   · 재투표   = "후보는 괜찮은데 **표**가 이상하다" → 후보 그대로 · 표만 지운다
        //  v10: 예전의 '처음부터'(backToMain)는 표를 통째로 날려서 v19 의
        //  "표는 유지된다"와 어긋났다 — 그래서 뺐다.
        <>
          <button
            className="btn ghost"
            disabled={busy}
            title="확정 → 투표 → 후보, 한 칸씩 되돌립니다 (표는 유지돼요)"
            onClick={() => onAction({ action: "reopenStep", participantId }, "이전 단계로 돌아갔어요")}
          >
            <span className="lb-sub">후보부터 다시</span>
            <b>🔄 되돌리기</b>
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            title="후보는 그대로 두고 표만 지웁니다 — 같은 후보로 다시 투표해요"
            onClick={() => {
              // 네이티브 confirm 은 마크다운을 못 그린다 — 평문으로 쓴다
              if (!confirm("재투표를 열까요?\n\n후보는 그대로 두고 표만 초기화됩니다.\n(후보부터 바꾸려면 '되돌리기'를 쓰세요)")) return;
              void onAction({ action: "revote", participantId }, "재투표를 열었어요 — 표가 초기화됐어요");
            }}
          >
            <span className="lb-sub">표만 초기화</span>
            <b>🗳️ 재투표</b>
          </button>
        </>
      )}
    </div>
  );
}
