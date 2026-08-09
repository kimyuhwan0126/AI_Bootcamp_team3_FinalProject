// ─────────────────────────────────────────────────────────────
// /members — **폐기된 라우트** (설계_v19.md §4-② · v6)
//
//  '모임원' 탭은 **모임 탭으로 통합**됐다. 참여자 현황·도착 신호등은
//  각 모임 상세 화면 안에 있다 (`sections/ParticipantList` · `sections/ArrivalPanel`).
//  옛 링크가 404 로 죽지 않도록 리다이렉트만 남긴다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";

export default function MembersRedirect() {
  redirect("/meetings");
}
