// ─────────────────────────────────────────────────────────────
// 기능 플래그 — 켜고 끄는 것을 "코드 수정"이 아니라 "환경변수"로 한다.
//
// 왜 상수가 아니라 환경변수인가
//   · 상수(`const AI_CHAT_ENABLED = false`)는 켜려면 파일을 고쳐야 한다.
//     브랜치마다 이 값이 다르면 머지할 때마다 같은 줄에서 충돌난다.
//   · 팀원이 개발하려고 true 로 바꾼 걸 실수로 커밋하면 다른 사람 화면까지 켜진다.
//   · 환경변수면 `.env.local` 한 줄이라 커밋될 일이 없고 충돌도 없다.
//
// ⚠️ Next.js 제약: 클라이언트에서 읽히려면 이름이 `NEXT_PUBLIC_` 로 시작해야 하고,
//    빌드 시점에 문자열로 치환된다. 그래서 `process.env[key]` 처럼 동적으로 읽으면
//    안 되고 반드시 아래처럼 통째로 써야 한다.
//
// ⚠️ 꺼진 기능은 썩는다. 플래그를 켠 상태의 스모크 테스트를 CI에 함께 돌린다
//    (.github/workflows/ci.yml). 안 돌려보는 플래그는 "언제든 켤 수 있는 코드"가
//    아니라 "켤 수 있어 보이는 죽은 코드"다.
// ─────────────────────────────────────────────────────────────

export const FLAGS = {
  /** AI 파실리테이터 채팅 UI. 끄면 투표 UI로 대체된다(코드는 보존). */
  aiChat: process.env.NEXT_PUBLIC_FF_AI_CHAT === "1",

  /** 실시간 전송(WebSocket/Realtime). 끄면 기존 1.8초 폴링. */
  realtime: process.env.NEXT_PUBLIC_FF_REALTIME === "1",

  /** 날씨 조건을 추천 점수에 반영. 끄면 ScoreContext.weather 가 undefined. */
  weather: process.env.NEXT_PUBLIC_FF_WEATHER === "1",

  /** 개인별 선호 알고리즘. 끄면 참가자 prefs 를 점수에 쓰지 않는다. */
  personalPrefs: process.env.NEXT_PUBLIC_FF_PERSONAL === "1",

  /**
   * ODsay 진단 모드 — **로컬 실측 전용. 배포에서는 반드시 0.**
   *
   * 켜면 두 가지가 풀린다:
   *  ① 껍데기 응답 가드 우회 — 탑승 구간이 없는 시외 응답도 그대로 내려온다
   *     (단 `verified: false` 가 붙는다. 가짜를 실제처럼 그리지 않기 위함)
   *  ② 경로 캐시 우회 — 같은 좌표를 반복 호출해 응답을 비교할 수 있다
   *
   * ⚠️ 켠 채로 두면 ODsay 무료 한도(1,000콜/일)를 빠르게 태운다.
   */
  odsayProbe: process.env.NEXT_PUBLIC_FF_ODSAY_PROBE === "1",
} as const;

export type FlagKey = keyof typeof FLAGS;
