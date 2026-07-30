"use client";

// ─────────────────────────────────────────────────────────────
// 가게 예약 · 선입금 모달
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// ⚠️ **모의결제다.** 실제 카드·계좌 정보를 받지 않고, 실 결제 연동을 추가하지
//    않는다 (루트 CLAUDE.md §3-1 — 범위 외). 화면에도 그렇게 밝힌다.
// ─────────────────────────────────────────────────────────────
import type { MeetingState, PlaceCandidate } from "@/lib/types";

export interface ReserveModalProps {
  state: MeetingState;
  /** 확정된 가게 — 부모가 null 이 아님을 보장하고 넘긴다 */
  place: PlaceCandidate;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ReserveModal({ state, place, busy, onConfirm, onClose }: ReserveModalProps) {
  const total = place.depositPerHead * state.headcount;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 6 }}>
          <b style={{ fontSize: 16 }}>가게 예약 · 선입금</b>
          <span className="badge-pay">모의결제</span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
          실제 결제가 아닌 <b>프로토타입 모의 결제</b>예요. 카드 정보는 요구하지 않습니다.
        </p>
        <div className="card tight stack" style={{ gap: 4, marginBottom: 12 }}>
          <div className="kv"><span className="k">가게</span><span className="v">{place.emoji} {place.name}</span></div>
          <div className="kv"><span className="k">인원</span><span className="v tnum">{state.headcount}명</span></div>
          <div className="kv"><span className="k">1인 선입금</span><span className="v tnum">{place.depositPerHead.toLocaleString()}원</span></div>
          <div className="divider" />
          <div className="kv"><span className="k">합계</span><span className="v tnum" style={{ color: "var(--ac)", fontSize: 15 }}>{total.toLocaleString()}원</span></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button
            className="btn ok"
            disabled={busy}
            onClick={onConfirm}
          >
            {total.toLocaleString()}원 결제
          </button>
        </div>
      </div>
    </div>
  );
}
