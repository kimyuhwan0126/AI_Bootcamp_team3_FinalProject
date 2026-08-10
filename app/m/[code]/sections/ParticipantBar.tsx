"use client";

// ─────────────────────────────────────────────────────────────
// 참여자 하단 바 — `LeaderBar` 의 짝 (멘토링 2026-08-06 §1)
//
// 왜 만들었나
//   멘토: "방장 아닌 사람은 **핵심 투표 결과만** 보면 됨 — 굳이 비활성화 처리 불필요."
//   그런데 지금까지 참여자 화면 하단은 **아무것도 없었다**(`showLeaderbar = isLeader`).
//   방장 화면에는 "0/4명 · 미투표 지민" 같은 진행 상황이 늘 떠 있는데,
//   참여자는 **지금 무슨 단계인지도, 자기가 뭘 해야 하는지도** 알 수 없었다.
//   그래서 시연에서 참여자가 "이제 뭐 해요?"를 계속 물어보게 된다.
//
// 규칙
//   · **버튼을 흉내내지 않는다.** 방장 전용 동작을 비활성 버튼으로 보여주지 않는다
//     (멘토가 명시적으로 불필요하다고 한 부분). 여기 있는 것은 **상태와 안내**뿐이다.
//   · 한 줄은 "지금 무엇을 하는 칸인가", 한 줄은 "내가 할 일 / 진행률".
//   · 내가 이미 한 일은 ✓ 로 말해준다 — 안 그러면 핑을 찍고도 또 찍는다.
//
// ⚠️ `.leaderbar` 와 같은 자리(fixed · 탭바 위)를 쓴다. 부모가 그 높이만큼
//    `paddingBottom` 을 잡아 주지 않으면 마지막 카드가 가려진다.
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";
import type { Step } from "@/lib/roles";

export interface ParticipantBarProps {
  step: Step;
  state: MeetingState;
  /** 내 participantId (없으면 신원 없는 방문자 — 부모가 이 바를 안 그린다) */
  myId: string | undefined;
}

export default function ParticipantBar({ step, state, myId }: ParticipantBarProps) {
  const total = state.totalParticipants;

  // ── 지역 칸 ──
  const myPing = state.regions.find((r) => r.contributors?.includes(myId ?? ""));
  const regionVoted = !!(myId && state.regionVotes?.[myId]);
  const regionVotes = Object.keys(state.regionVotes ?? {}).length;

  // ── 지점 칸 ──
  const myPlace = state.places.find((p) => p.proposedById === myId);
  const placeVoted = !!(myId && state.placeVotes?.[myId]);
  const placeVotes = Object.keys(state.placeVotes ?? {}).length;

  /** [윗줄 = 이 칸이 무엇인가, 아랫줄 = 내가 할 일 / 진행률] */
  const line = (): [string, string] => {
    switch (step) {
      case "region-register":
        return [
          `지역 후보 등록 중 · 후보 ${state.regions.length}개`,
          myPing
            ? `✓ 내 핑: ${myPing.name} — 다른 곳을 누르면 옮겨가요`
            : "지도를 눌러 만나고 싶은 곳을 찍어 주세요",
        ];
      case "region-vote":
        return [
          `지역 투표 중 · ${regionVotes}/${total}명 투표`,
          regionVoted
            ? "✓ 투표했어요 — 다른 핀을 누르면 바꿀 수 있어요"
            : "지도의 핀을 눌러 투표해 주세요",
        ];
      case "place-register":
        return [
          `지점 후보 등록 중 · 후보 ${state.places.length}개`,
          myPlace
            ? `✓ 내가 올린 후보: ${myPlace.name}`
            : "목록이나 지도에서 가고 싶은 곳을 등록해 주세요",
        ];
      case "place-vote":
        return [
          `지점 투표 중 · ${placeVotes}/${total}명 투표`,
          placeVoted ? "✓ 투표했어요 — 눌러서 바꿀 수 있어요" : "가고 싶은 지점에 투표해 주세요",
        ];
      case "result":
        return [
          state.winnerPlace
            ? `확정 · ${state.winnerPlace.name}`
            : state.winnerRegion
            ? `확정 · ${state.winnerRegion.name}`
            : "확정됐어요",
          // 신호등은 모임 당일에만 열린다(v19 §4-⑩) — 그 판정은 ArrivalPanel 이 한다
          "결과 화면에서 경로와 도착 상황을 확인해 주세요",
        ];
    }
  };

  const [what, todo] = line();
  // 내가 할 일이 남았는지 — 남았으면 눈에 띄게, 끝났으면 조용하게
  const done = todo.startsWith("✓");

  return (
    <div className="leaderbar" aria-label="참여자 상태">
      <div
        className="stack"
        style={{ gap: 2, minWidth: 0, padding: "3px 2px", textAlign: "center" }}
      >
        <span className="lb-sub" style={{ opacity: 0.62 }}>{what}</span>
        <b
          style={{
            fontSize: 12.5,
            fontWeight: 900,
            color: done ? "var(--ink-soft)" : "var(--ac-deep)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {todo}
        </b>
      </div>
    </div>
  );
}
