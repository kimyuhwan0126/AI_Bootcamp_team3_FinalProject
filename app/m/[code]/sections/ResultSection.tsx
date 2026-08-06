"use client";

// ─────────────────────────────────────────────────────────────
// 최종 결과 화면 (STAGE: RESULT)
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// ⚠️ 선입금은 **모의결제**다 (루트 CLAUDE.md §3-1). 실제 카드·계좌 정보를
//    받지 않고, 실 결제 연동을 추가하지 않는다.
// ─────────────────────────────────────────────────────────────
import type { MeetingState, RegionCandidate } from "@/lib/types";
import TravelTimes from "./TravelTimes";
import { openGoogleCalendar, downloadIcs } from "@/lib/calendar";

export interface ResultSectionProps {
  state: MeetingState;
  /** 이동시간을 계산할 목적지 (확정 전이면 null) */
  destRegion: RegionCandidate | null;
  isLeader: boolean;
  /** 투표로 정했는지 AI 대화로 정했는지 — 문구만 달라진다 */
  aiChatEnabled: boolean;
  onOpenRoute: (participantId: string) => void;
  onOpenReserve: () => void;
  onToast: (msg: string) => void;
}

export default function ResultSection({
  state,
  destRegion,
  isLeader,
  aiChatEnabled,
  onOpenRoute,
  onOpenReserve,
  onToast,
}: ResultSectionProps) {
  return (
    <>
      <div className="card center stack" style={{ gap: 6 }}>
        <span style={{ fontSize: 34 }}>🎉</span>
        <span className="eyebrow">3. 결과 · 추천장소 확정</span>
        {state.winnerPlace ? (
          <>
            <h2 className="sec" style={{ fontSize: 20 }}>{state.winnerPlace.emoji} {state.winnerPlace.name}</h2>
            <p className="muted" style={{ fontSize: 12.5 }}>
              {state.winnerRegion?.name} · {state.winnerPlace.category}
              {state.winnerPlace.rating > 0 ? ` · ⭐ ${state.winnerPlace.rating}` : ""} · {state.winnerPlace.distanceM}m
            </p>
            {(state.prefs.dateText || state.prefs.timeText) && (
              <span className="chip ok" style={{ fontSize: 11 }}>
                📅 {[state.prefs.dateText, state.prefs.timeText].filter(Boolean).join(" ")}
              </span>
            )}
            <div className="row" style={{ gap: 6, justifyContent: "center" }}>
              <span className="chip ac" style={{ fontSize: 10.5 }}>{aiChatEnabled ? "💬 AI 대화로 함께 정했어요" : "🗳️ 투표로 함께 정했어요"}</span>
              {state.winnerPlace.url && (
                <a
                  className="chip line"
                  style={{ fontSize: 10.5, textDecoration: "none" }}
                  href={state.winnerPlace.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  🗺️ 카카오맵에서 보기
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="muted">확정된 장소가 없어요.</p>
        )}
      </div>

      {destRegion ? (
        <TravelTimes
          state={state}
          dest={destRegion}
          title={`참여자 ${state.totalParticipants}명 · 이동시간`}
          onOpen={onOpenRoute}
        />
      ) : (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="eyebrow">참여자 {state.totalParticipants}명</span>
          {state.participants.map((p) => (
            <div className="row" key={p.id} style={{ gap: 10 }}>
              <div className={"av" + (p.transport === "car" ? " car" : "")}>{p.name.slice(0, 1)}</div>
              <div className="grow"><b style={{ fontSize: 13 }}>{p.name}</b>{p.isLeader && <span className="chip leader" style={{ fontSize: 9, marginLeft: 6 }}>방장</span>}</div>
              <span className="faint" style={{ fontSize: 11 }}>{p.origin || "-"}</span>
            </div>
          ))}
        </div>
      )}

      {/* 유료서비스: 가게 예약 > 결제(선입금) */}
      {state.winnerPlace && (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="between">
            <span className="eyebrow">유료서비스 · 가게 예약</span>
            <span className="badge-pay">💳 선입금</span>
          </div>
          {state.reservation ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="chip ok" style={{ alignSelf: "flex-start" }}>✓ 예약 완료 (모의결제)</div>
              <div className="kv"><span className="k">가게</span><span className="v">{state.winnerPlace.name}</span></div>
              <div className="kv"><span className="k">인원</span><span className="v tnum">{state.reservation.headcount}명</span></div>
              <div className="kv"><span className="k">선입금</span><span className="v tnum">{state.reservation.depositPerHead.toLocaleString()}원 × {state.reservation.headcount} = {state.reservation.total.toLocaleString()}원</span></div>
            </div>
          ) : state.winnerPlace.reservable ? (
            <>
              {/* ⚠️ 금액 줄에 `(모의)` 를 붙인다. 예전엔 버튼과 완료 칩에만 있어서
                  `선입금 1인 15,000원 × 4명 / 합계 60,000원` 만 보면 실제 가격으로 읽혔다.
                  가게 이름·좌표는 카카오 실데이터인데 금액은 카테고리별 고정 상수라
                  (`lib/routing.ts` PLACE_QUERIES), 실존 가게에 지어낸 값이 붙는 모양이 된다. */}
              <div className="kv"><span className="k">선입금 (모의)</span><span className="v tnum">1인 {state.winnerPlace.depositPerHead.toLocaleString()}원 × {state.headcount}명</span></div>
              <div className="between">
                <b className="tnum" style={{ fontSize: 15 }}>합계 {(state.winnerPlace.depositPerHead * state.headcount).toLocaleString()}원 <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>(모의)</span></b>
              </div>
              <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
                금액은 카테고리별 예시값이에요 — 가게가 실제로 받는 선입금이 아니고, 예약 가능 여부도 확인된 값이 아닙니다.
              </p>
              <button className="btn ok" disabled={!isLeader} onClick={onOpenReserve}>
                {isLeader ? "예약 · 선입금 결제 (모의)" : "방장만 결제할 수 있어요"}
              </button>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 12.5 }}>이 가게는 예약 대상이 아니에요.</p>
          )}
        </div>
      )}

      {/* 부가기능 */}
      <div className="card stack" style={{ gap: 8 }}>
        <span className="eyebrow">부가기능</span>
        <button className="btn" onClick={() => openGoogleCalendar(state)}>📅 Google 캘린더에 추가</button>
        <button className="btn ghost" onClick={() => downloadIcs(state)}>📄 .ics 다운로드 (Apple·Outlook용)</button>
        <button
          className="btn ghost"
          onClick={() => {
            navigator.clipboard?.writeText(`${location.origin}/m/${state.code}`);
            onToast("모임 링크를 복사했어요");
          }}
        >
          🔗 모임 링크 공유
        </button>
      </div>
    </>
  );
}
