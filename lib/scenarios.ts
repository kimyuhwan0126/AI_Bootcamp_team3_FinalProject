// ─────────────────────────────────────────────────────────────
// scenarios.ts — 디버그 시나리오 메타데이터 (클라이언트 안전: store 미import)
// v2: 투표 상태공간 → AI 대화 상태공간으로 재구성
// ─────────────────────────────────────────────────────────────
export type ScenarioGroup = "메인" | "AI 대화" | "결과" | "엣지";

export interface ScenarioMeta {
  id: string;
  title: string;
  desc: string;
  group: ScenarioGroup;
  icon: string;
}

export const SCENARIOS: ScenarioMeta[] = [
  // ── 메인 ──
  { id: "main_empty",   group: "메인", icon: "◻️", title: "메인 · 출발지 0명",       desc: "4인, 아무도 출발지 미등록" },
  { id: "main_partial", group: "메인", icon: "◧",  title: "메인 · 출발지 2/4",       desc: "4인 중 2명만 등록" },
  { id: "main_ready",   group: "메인", icon: "✅", title: "메인 · 전원 등록",         desc: "4인 전원(대중교통3+자차1)" },
  { id: "main_allcar",  group: "메인", icon: "🚗", title: "메인 · 전원 자차",         desc: "4인 전원 자차 이동" },
  { id: "main_large",   group: "메인", icon: "👥", title: "메인 · 대규모 8인",        desc: "정원 8명(유료), 전원 등록" },

  // ── AI 대화 (투표 대체) ──
  { id: "chat_open",        group: "AI 대화", icon: "💬", title: "대화 · 시작 직후",     desc: "AI 오프닝만 있고 무발화" },
  { id: "chat_opinions",    group: "AI 대화", icon: "🗣️", title: "대화 · 일부 의견",     desc: "4인 중 2명만 의견 발화" },
  { id: "chat_split",       group: "AI 대화", icon: "⚖️", title: "대화 · 의견 갈림",     desc: "후보별로 지지 분산(동점 상황)" },
  { id: "chat_region_done", group: "AI 대화", icon: "📍", title: "대화 · 지역 확정",     desc: "지역 확정, 장소 논의 중" },

  // ── 결과 ──
  { id: "result",          group: "결과", icon: "🎉", title: "결과 · 확정(예약 전)",   desc: "장소 확정, 예약 대기" },
  { id: "result_reserved", group: "결과", icon: "💳", title: "결과 · 선입금 완료",     desc: "예약·선입금 결제까지" },

  // ── 엣지 ──
  { id: "main_solo",       group: "엣지", icon: "1️⃣", title: "엣지 · 1인 모임",       desc: "방장 혼자(출발지 등록)" },
  { id: "result_noreserve",group: "엣지", icon: "🚫", title: "엣지 · 예약불가 확정",   desc: "예약 불가 장소(카페)로 확정" },
  { id: "chat_stall",      group: "엣지", icon: "😴", title: "엣지 · 무응답 정체",     desc: "의견 없이 대화 정체 → 방장 개입 유도" },
  { id: "capacity_over",   group: "엣지", icon: "🚨", title: "엣지 · 정원 초과",       desc: "정원 3명에 5명 참여" },
];
