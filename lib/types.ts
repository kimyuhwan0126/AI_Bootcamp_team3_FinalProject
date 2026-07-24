// ─────────────────────────────────────────────────────────────
// 모이머 도메인 타입 — 투표를 AI 대화로 대체한 v2 구조
//   main(출발지) → chat(AI 파실리테이터: 지역→장소) → result
// ─────────────────────────────────────────────────────────────
export type Stage = "main" | "chat" | "result";

// AI 대화 내부 단계: 지역 논의 → 장소 논의 → 완료
export type AiPhase = "region" | "place" | "done";

export type Transport = "transit" | "car";

export interface Participant {
  id: string;
  name: string;
  isLeader: boolean;
  headcount: number;        // 유료서비스: 개인이 데려오는 인원수
  origin: string | null;    // 출발지 텍스트
  lat: number | null;
  lng: number | null;
  transport: Transport;
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
  distanceM: number;
  rating: number;           // 0 = 정보 없음(실 데이터엔 평점이 없어 미표시)
  reservable: boolean;
  depositPerHead: number;   // 유료서비스: 1인 선입금
  url?: string;             // 카카오맵 상세 페이지 (실 데이터일 때만)
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
  winnerRegionId: string | null;
  winnerPlaceId: string | null;
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
  winnerRegion: RegionCandidate | null;
  winnerPlace: PlaceCandidate | null;
  reservation: Reservation | null;
  originsSet: number;
  totalParticipants: number;
  overCapacity: boolean;         // 정원 초과 여부
}
