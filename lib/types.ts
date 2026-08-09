// ─────────────────────────────────────────────────────────────
// 모이머 도메인 타입 — 투표를 AI 대화로 대체한 v2 구조
//   main(출발지) → chat(AI 파실리테이터: 지역→장소) → result
// ─────────────────────────────────────────────────────────────
export type Stage = "main" | "chat" | "result";

// AI 대화 내부 단계: 지역 논의 → 장소 논의 → 완료
export type AiPhase = "region" | "place" | "done";

export type Transport = "transit" | "car";

// ─────────────────────────────────────────────────────────────
// v19 설계 확정판 (docs/설계_v19.md) — 아래 타입들이 전체 흐름을 가른다
// ─────────────────────────────────────────────────────────────

/**
 * 확정 범위 — **모임 생성 시 방장이 고른다. 기본 `place`.**
 * v19 의 전체 분기축이다 (설계_v19.md §3).
 *   · `region` "지역까지" — 지점 단계를 건너뛴다. 결과 화면은 지도만
 *     (경로 API·지점 카카오 링크·도착 신호등 전부 숨김)
 *   · `place`  "지점까지" — 지역 확정 후 반경 700m 안에서 지점을 고른다
 *
 * 승격(`region` → `place`)은 방장의 '지점도 정하기'로 가능하지만 **역방향은 없다**.
 */
export type MeetingScope = "region" | "place";

/**
 * 목적 카테고리 5종 (v13 확정 · 카카오 분류 코드 매핑).
 * 지점 단계에서 기본 포커싱으로 쓰인다. `scope === "region"` 이면 생성 폼에서 숨긴다.
 */
export type PurposeCategory = "food" | "cafe" | "bar" | "culture" | "outdoor";

export const PURPOSE_LABELS: Record<PurposeCategory, string> = {
  food: "음식점",
  cafe: "카페",
  bar: "술집",
  culture: "문화/놀이",
  outdoor: "야외",
};

/**
 * 후보가 어디서 왔는지. AI 추천 후보에는 화면에 'AI 추천' 태그가 붙는다.
 * 수동 핑과 같은 동이면 **병합하고 태그만 남긴다** (v9).
 */
export type CandidateSource = "manual" | "ai";

/**
 * 지점 탐색 반경 — **확정 동 중심 700m 고정, 1회에 한해 1400m 로 확장** (v4, v15).
 * 확장은 누구나 누를 수 있고 전체에 공유된다. 1400 에서 더 늘어나지 않는다.
 */
export type RadiusM = 700 | 1400;

// 도착 신호등 — 본인만 자기 항목을 수정할 수 있다(회의록). null이면 아직
// 자가신고를 안 한 것 — 이때는 이동시간 기반 자동 계산값으로 대신 보여준다.
export type ArrivalSelfStatus = "green" | "yellow" | "red" | null;

export interface Participant {
  id: string;
  name: string;
  isLeader: boolean;
  headcount: number;        // 유료서비스: 개인이 데려오는 인원수
  origin: string | null;    // 출발지 텍스트
  lat: number | null;
  lng: number | null;
  transport: Transport;
  status: ArrivalSelfStatus;  // 자가신고 도착 상태(정상/지체 중/많이 늦음)
  etaText: string | null;     // 자가신고 도착 예정 시간(자유 텍스트, 예: "9:55 도착 예정")

  // ── v19 ──
  /**
   * 개인 PIN — **비로그인 참여자만** 갖는다 (v15).
   * 카카오 로그인 참여자는 계정 기반으로 복구되므로 `null` 이다.
   * 쿠키가 날아갔을 때 "이름 + PIN" 으로 자기 자리를 되찾는 용도다.
   */
  pin: string | null;
  /**
   * PIN 시도 실패 횟수. **5회에서 잠근다** (v16).
   * 잠기면 방장이 강퇴한 뒤 재참여하는 길만 남는다.
   */
  pinFails: number;
  /**
   * 카카오 회원번호 — 로그인한 사람만. 방장은 항상 값이 있다(로그인 필수).
   * **재모임 자동 이전은 이 값이 있는 멤버만** 된다 (v17).
   * ⚠️ 비로그인 → 로그인 계정 병합은 없다 (v19).
   */
  kakaoId: string | null;
  /**
   * 지각 예상 분 — 신호등 노랑을 고르면 입력받아 **전원에게 공유**한다 (v16).
   * 노랑이 아니면 `null`.
   */
  lateMin: number | null;
}

export interface RegionCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  maxMin: number;           // 참가자 중 최대 이동시간(분)
  devMin: number;           // 편차(분)
  reason: string;           // 선정 근거
  /** 참가자가 직접 제안한 후보면 제안자 이름 (자동 추천 후보에는 없음) */
  proposedBy?: string;

  // ── v19 ──
  /** 출처. `ai` 면 화면에 'AI 추천' 태그가 붙는다 (v9) */
  source?: CandidateSource;
  /**
   * AI 도 이 동을 추천했는가 (v9 병합 규칙).
   *
   * AI 추천 동이 **수동 핑과 같으면 후보를 새로 만들지 않고 병합**한다.
   * 그때 `source` 는 `manual` 그대로 두고(사람이 먼저 찍었으니) 이 표시만 켠다 —
   * 화면은 둘 다 보여준다: "○○님 제안 · AI 추천".
   */
  aiSuggested?: boolean;
  /**
   * 이 후보(동)에 핑을 찍은 사람들의 participantId.
   *
   * **같은 동은 하나로 병합**되므로 후보 하나에 여러 명이 붙는다 (v4).
   * 사람이 빠지거나 강퇴되면 **그 사람 몫만 뺀다** — 배열이 비면 후보를 삭제한다 (v12).
   * 수동 핑 없이 AI 만 제안한 후보는 빈 배열이다(그래서 AI 후보는 이 규칙으로 안 지워진다 —
   * `source === "ai"` 를 함께 본다).
   */
  contributors?: string[];
  /**
   * 참가자별 이동시간.
   *
   * `real` 은 그 **한 사람의 숫자**가 어디서 왔는지다:
   *   · `true`      ODsay/TMAP 실 API 값
   *   · `false`     직선거리(haversine) 추정값 — `estMinutes()`
   *   · `undefined` 이 필드가 생기기 전에 저장된 후보라 **알 수 없다**
   *
   * ⚠️ 목록 전체가 아니라 **사람 단위**로 둔 이유: 화면의 출처 칩(`경로 기준` / `거리 추정`)이 참가자
   *    행마다 붙는데, 실제로 한 목록 안에 실값과 추정이 섞인다(2026-08-05 실측 —
   *    서울 3인은 ODsay 실값, 자월도 1인은 ODsay `code 3` 실패로 추정값이었다).
   *    목록 단위 `live` 하나로는 그 행이 어느 쪽인지 말할 수 없다.
   *    목록 전체 판정이 필요하면 `perParticipant.every(x => x.real === true)` 로 접는다
   *    (`undefined` 는 참으로 치지 않는다 — 모르면 실값이라고 주장하지 않는다).
   */
  perParticipant: { pid: string; name: string; min: number; real?: boolean }[];
}

export interface PlaceCandidate {
  id: string;
  name: string;
  category: string;
  emoji: string;
  /** 지도에 후보 핀을 찍기 위한 좌표 (카카오 검색 결과에서 채움) */
  lat?: number;
  lng?: number;
  distanceM: number;
  rating: number;           // 0 = 정보 없음(실 데이터엔 평점이 없어 미표시)
  /** @deprecated v17 — '선입금' 명칭 폐기. 결제는 범위 외다. 새 코드에서 쓰지 않는다 */
  reservable: boolean;
  /** @deprecated v17 — '선입금' 폐기 → '지점 카카오 링크 연결'. 새 코드에서 쓰지 않는다 */
  depositPerHead: number;
  url?: string;             // 카카오맵 상세 페이지 (실 데이터일 때만)

  // ── v19 ──
  /** 출처. `ai` 면 'AI 추천' 태그 (v9) */
  source?: CandidateSource;
  /** AI 도 이 지점을 추천했는가 — 지역과 같은 병합 규칙 (v9) */
  aiSuggested?: boolean;
  /** 후보를 등록한 사람의 participantId — **본인은 자기 후보만 삭제**할 수 있다 (v7) */
  proposedById?: string;
  /** 등록자 이름 (표시용) */
  proposedBy?: string;
}

// AI가 대화에서 수집하는 모임 선호·일정 (폼 없이 채워짐)
export interface MeetingPrefs {
  purpose?: string;   // 모임 목적 (회식/스터디/데이트…)
  mood?: string;      // 분위기 (조용한/왁자지껄…)
  budget?: string;    // 1인 예산 (예: "2만원대")
  dietary?: string;   // 알러지·채식 등 (예: "새우 알러지 1명")
  alcohol?: string;   // 음주 여부 (예: "가볍게 한잔")
  dateText?: string;  // 날짜 원문 (예: "다음주 토요일")
  dateIso?: string;   // 정규화 날짜 YYYY-MM-DD
  timeText?: string;  // 시간 원문 (예: "저녁 7시")
  timeHhmm?: string;  // 정규화 시간 HH:MM
}

// AI 대화 메시지
export interface ChatMsg {
  id: string;
  role: "user" | "ai" | "system";  // system = 단계 전환 등 안내
  name: string;                    // user일 때 참가자 이름, ai면 "AI"
  text: string;
  ts: string;
}

/**
 * @deprecated v17 — **'선입금' 명칭이 폐기됐다.** 결제는 범위 외이고,
 * 결과 화면의 그 자리는 이제 '지점 카카오 링크 연결'(카카오맵 상세로 이동)이다.
 * 옛 데이터를 읽을 수 있게 타입만 남긴다 — 새 코드에서 만들지 않는다.
 */
export interface Reservation {
  placeId: string;
  headcount: number;
  depositPerHead: number;
  total: number;
  status: "paid";
  paidAt: string;
}

/** 정원 — v8 확정. 9번째는 입장 거부(초과분은 유료 구간 구상) */
export const MAX_PARTICIPANTS = 8;

/** PIN 시도 제한 — v16 */
export const MAX_PIN_FAILS = 5;

export interface Meeting {
  code: string;
  name: string;
  /** @deprecated v2 — 비밀번호 제거. 참여는 초대 링크만. 빈 문자열로 두고 검사하지 않는다 */
  password: string;
  headcount: number;        // 정원 — v19 는 MAX_PARTICIPANTS(8) 고정
  leaderName: string;
  stage: Stage;
  aiPhase: AiPhase;         // chat 스테이지 내부 단계

  // ── v19: 분기축 ──
  /** 확정 범위 — 전체 흐름을 가른다 (설계_v19.md §3). 기본 `place` */
  scope: MeetingScope;
  /** 목적 카테고리 — `scope === "region"` 이면 안 쓴다. 방장 수정 가능 (v12) */
  purposeCategory: PurposeCategory | null;
  /**
   * 모임 시간 (ISO). **생성 폼에서 받는다** (v2 가 result 입력에서 이전).
   * 선택 항목이라 `null` 일 수 있고, 그때는 **신호등이 잠기고 입력 유도 배너**가 뜬다 (v7).
   * ⚠️ **과거 시간 입력 불가** (v16).
   */
  meetTime: string | null;

  // ── v19: 단계 상태 ──
  /**
   * 지점 투표가 열렸는지 (v8 — 지점도 '등록 → 투표 시작(잠금) → 투표' 2단계).
   *
   * ⚠️ 지역 단계는 이 값이 필요 없다: `main`(등록) → `chat`(투표) 라는
   *    **stage 전환 자체가 잠금**이기 때문이다. 지점 단계는 등록·투표가 둘 다
   *    `chat`/`place` 안에서 일어나므로 구분자가 따로 있어야 한다.
   */
  placeVoteOpen: boolean;
  /** 지점 탐색 반경 — 700 에서 시작, 1회만 1400 으로 확장 가능 (v15) */
  radiusM: RadiusM;
  /**
   * 지점→지역 경계 reopen 시 **보관해 둔 지점 데이터** (v17).
   * 같은 동으로 재확정되면 복원하고, 다른 동이면 폐기한다.
   * `regionId` 는 보관 시점의 확정 지역 id — 복원 판정에 쓴다.
   */
  stashedPlaces: { regionId: string; places: PlaceCandidate[]; votes: Record<string, string> } | null;
  /**
   * '지난 모임' 전환 시각 (v9).
   * 모임일 다음날 — 시간 미입력이면 마지막 활동 7일 후. **부활 불가** (v16).
   */
  archivedAt: string | null;
  participants: Participant[];
  regions: RegionCandidate[];
  places: PlaceCandidate[];
  chat: ChatMsg[];
  prefs: MeetingPrefs;
  winnerRegionId: string | null;
  winnerPlaceId: string | null;
  /** 거점 투표: 참가자 id → 후보 id (1인 1표, 재투표는 덮어쓰기) */
  regionVotes: Record<string, string>;
  /** 가게 투표: 참가자 id → 후보 id */
  placeVotes: Record<string, string>;
  /** @deprecated v17 — '선입금' 폐기. 항상 null 로 두고 화면에 그리지 않는다 */
  reservation: Reservation | null;
  createdAt: string;
  /**
   * 마지막으로 무언가 바뀐 시각 (DB `updated_at` — 트리거가 자동 갱신).
   *
   * **모임 시간을 안 정한 모임**의 '지난 모임' 판정에 쓴다: 마지막 활동 7일 후 (v9).
   * 인메모리 모드에는 트리거가 없어 `undefined` 이고, 그때는 `createdAt` 으로 대신한다.
   */
  updatedAt?: string;
}

// 클라이언트로 내려주는 상태(비밀번호 제외)
export interface MeetingState {
  code: string;
  name: string;
  headcount: number;
  leaderName: string;
  stage: Stage;
  aiPhase: AiPhase;
  aiBusy: boolean;               // AI 판단 진행 중(생각 중… 표시)

  // ── v19 (Meeting 과 같은 뜻 — 화면이 분기에 쓴다) ──
  scope: MeetingScope;
  purposeCategory: PurposeCategory | null;
  meetTime: string | null;
  placeVoteOpen: boolean;
  radiusM: RadiusM;
  archivedAt: string | null;
  /** 지난 모임인가 — `archivedAt` 이 있으면 화면 전체가 읽기 전용이다 (v18) */
  isPast: boolean;
  participants: Participant[];
  regions: RegionCandidate[];
  places: PlaceCandidate[];
  chat: ChatMsg[];               // 최근 대화
  prefs: MeetingPrefs;           // AI가 대화에서 수집한 선호·일정
  winnerRegion: RegionCandidate | null;
  winnerPlace: PlaceCandidate | null;
  regionVotes: Record<string, string>;
  placeVotes: Record<string, string>;
  reservation: Reservation | null;
  originsSet: number;
  totalParticipants: number;
  overCapacity: boolean;         // 정원 초과 여부
}
