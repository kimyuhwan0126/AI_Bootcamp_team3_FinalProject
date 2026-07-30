// ─────────────────────────────────────────────────────────────
// 모이머 도메인 타입 — 투표를 AI 대화로 대체한 v2 구조
//   main(출발지) → chat(AI 파실리테이터: 지역→장소) → result
// ─────────────────────────────────────────────────────────────
export type Stage = "main" | "chat" | "result";

// AI 대화 내부 단계: 지역 논의 → 장소 논의 → 완료
export type AiPhase = "region" | "place" | "done";

export type Transport = "transit" | "car";

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
}

export interface RegionCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  maxMin: number;           // 참가자 중 최대 이동시간(분)
  devMin: number;           // 편차(분)
  reason: string;           // 선정 근거
  perParticipant: { pid: string; name: string; min: number }[];
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
  reservable: boolean;
  depositPerHead: number;   // 유료서비스: 1인 선입금
  url?: string;             // 카카오맵 상세 페이지 (실 데이터일 때만)
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

export interface Reservation {
  placeId: string;
  headcount: number;
  depositPerHead: number;
  total: number;
  status: "paid";
  paidAt: string;
}

export interface Meeting {
  code: string;
  name: string;
  password: string;
  headcount: number;        // 유료서비스: 모임 정원(인원수)
  leaderName: string;
  stage: Stage;
  aiPhase: AiPhase;         // chat 스테이지 내부 단계
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
  reservation: Reservation | null;
  createdAt: string;
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
