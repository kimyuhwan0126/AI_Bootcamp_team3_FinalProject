// ─────────────────────────────────────────────────────────────
// roles.ts — **누가 무엇을 할 수 있는가**를 한 곳에 모은 표
//
// 왜 만들었나 (멘토링 2026-08-06 §1 · `docs/멘토링_2026-08-06.md`)
//   멘토: "방장과 참여자 화면이 섞여 있어 **구현 시 꼬일 가능성 높음**.
//          화면을 복제해서 두 벌로 명확히 분리하라.
//          방장 아닌 사람은 핵심 투표 결과만 보면 됨 —
//          **굳이 비활성화 처리 불필요**."
//
//   실제로 `isLeader` 조건이 8개 파일 39군데에 흩어져 있었다. 같은 규칙이
//   화면마다 따로 적혀 있으니, 한 곳을 고치면 다른 곳이 어긋난다.
//   (실례: 등록 단계에서 서버는 표를 거부하는데 UI 는 투표 버튼을 그렸다 — v12)
//
// 이 파일이 정하는 것 / 안 정하는 것
//   ✅ **화면이 무엇을 그릴지** — 버튼을 낼지 말지
//   ❌ **서버 권한** — 서버는 이 파일을 믿지 않고 `lib/store.ts` 에서 자기가 다시 본다.
//      화면을 속여도 서버가 막는다. 여기는 "안 보이게" 하는 층이지 "못 하게" 하는 층이 아니다.
//
// ⚠️ 순수 모듈이어야 한다 — DB·서버 전용 모듈을 import 하지 않는다.
//    `lib/store.ts` 의 `PhaseStep` 을 그대로 쓰고 싶지만 그 파일은 `db.ts` 를 끌고 와서
//    클라이언트 번들에 들어갈 수 없다. 그래서 같은 5단계를 여기서 다시 정의한다.
//    **판정 규칙은 `phaseStepOf` 와 반드시 같아야 한다** — 어긋나면
//    "눌리는데 서버가 거부하는" 버튼이 다시 생긴다.
// ─────────────────────────────────────────────────────────────

/** v19 §5 — 다섯 칸. `lib/store.ts` 의 `PhaseStep` 과 같은 값이어야 한다. */
export type Step = "region-register" | "region-vote" | "place-register" | "place-vote" | "result";

/** 보는 사람이 누구인가. `guest` = 아직 참여하지 않은 사람(초대 링크만 연 상태). */
export type ViewerRole = "leader" | "participant" | "guest";

/** `phaseStepOf` 와 같은 판정 — 화면이 가진 조각으로 계산한다. */
export function stepOf(s: {
  stage: "main" | "chat" | "result";
  aiPhase: "region" | "place" | "done";
  placeVoteOpen: boolean;
}): Step {
  if (s.stage === "result") return "result";
  if (s.aiPhase === "place") return s.placeVoteOpen ? "place-vote" : "place-register";
  return s.stage === "chat" ? "region-vote" : "region-register";
}

export function viewerRoleOf(me: { isLeader?: boolean } | null | undefined): ViewerRole {
  if (!me) return "guest";
  return me.isLeader ? "leader" : "participant";
}

/**
 * 이 화면에서 이 사람이 할 수 있는 것.
 *
 * 이름은 **행동**이지 역할이 아니다 — 호출부가 `isLeader &&` 대신
 * `can.startVote &&` 를 쓰면, 나중에 "부방장" 같은 게 생겨도 여기만 고치면 된다.
 */
export interface Abilities {
  // ── 방장 전용 (v19 §7) ──
  /** 투표 시작 = 후보 잠금 */
  startVote: boolean;
  /** 최다득표 확정 · 다른 후보로 확정 */
  confirm: boolean;
  /** 되돌리기 사다리 (확정→투표→후보) — **표는 유지** */
  reopen: boolean;
  /** 재투표 — 후보는 유지, **표만 초기화**. `reopen` 과 정반대다 */
  revote: boolean;
  /** 추천 받기 (LLM 이든 점수 기반이든) */
  recommend: boolean;
  /** 강퇴 */
  kick: boolean;
  /** 모임 이름·카테고리·시간 수정 · 삭제 · 승격 */
  manageMeeting: boolean;

  // ── 누구나 (참여자 포함) ──
  /** 지도 핑으로 지역 후보 등록 */
  ping: boolean;
  /** 지점 후보 등록 */
  addPlace: boolean;
  /** 투표 (1인 1표) */
  vote: boolean;
  /** 내 도착 신호등 */
  setStatus: boolean;
}

const NONE: Abilities = {
  startVote: false, confirm: false, reopen: false, revote: false, recommend: false,
  kick: false, manageMeeting: false,
  ping: false, addPlace: false, vote: false, setStatus: false,
};

/**
 * @param role   보는 사람
 * @param step   지금 어느 칸인가
 * @param isPast 지난 모임이면 **전부 읽기 전용**이다 (v19 §4-⑪ · 부활 불가)
 */
export function abilitiesOf(role: ViewerRole, step: Step, isPast = false): Abilities {
  // 지난 모임 · 신원 없는 사람 → 아무것도 못 한다. 화면은 읽기 전용으로 그린다.
  if (isPast || role === "guest") return NONE;

  const leader = role === "leader";
  const registering = step === "region-register" || step === "place-register";
  const voting = step === "region-vote" || step === "place-vote";

  return {
    // 등록 칸에서만 잠글 것이 있다. 투표 칸·결과에서는 '투표 시작'이 의미 없다.
    startVote: leader && registering,
    /**
     * 확정 — **등록 칸에서도 된다.**
     *
     * v19 §5 의 정상 흐름은 등록 → 투표 시작 → 투표 → 확정이지만,
     * 멘토링 8/6 §2 가 "방장이 투표 귀찮을 경우 **바로 확정**할 수 있는 옵션도
     * 있으면 좋음"을 명시했다. 서버도 main 단계 확정을 허용한다(`confirmRegion`).
     * 그래서 여기서 막지 않는다 — 막았더니 '✍ 다른 후보로 확정'이 사라져
     * `modals.spec.ts` 가 즉시 걸렸다(2026-08-10).
     *
     * 다만 **하단 방장 바의 큰 확정 버튼은 투표 칸부터**다(`LeaderBar`) —
     * 등록 칸의 기본 동작은 어디까지나 '투표 시작'이어야 하기 때문이다.
     * 등록 칸의 확정은 투표 카드 안의 작은 보조 버튼으로만 낸다.
     */
    confirm: leader && step !== "result",
    // 결과에서도 한 칸 되돌릴 수 있어야 한다 (멘토: "결과에서 끝나지 않게")
    reopen: leader && (voting || step === "result"),
    recommend: leader && registering,
    /**
     * 재투표 — 후보는 두고 표만 지운다. `reopen`(단계를 내리고 표 유지)과 **정반대**다.
     * 표가 있는 칸에서만 말이 된다: 투표 칸(동점 재투표)과 결과(확정을 풀고 다시).
     */
    revote: leader && (voting || step === "result"),
    kick: leader,
    manageMeeting: leader,

    // ⭐ 핑은 이 앱에서 가장 중요한 기능이다 — **참여자도 방장도 똑같이** 찍는다.
    //    (멘토링 §2: "참여자/방장이 지도에 핑을 찍어 지역 후보를 등록")
    ping: step === "region-register",
    addPlace: step === "place-register",
    // 등록 칸에서는 서버가 표를 거부한다(v12) → 버튼 자체를 그리지 않는다
    vote: voting,
    // 신호등은 확정된 뒤의 이야기다 (당일 여부는 화면이 따로 본다)
    setStatus: step === "result",
  };
}
