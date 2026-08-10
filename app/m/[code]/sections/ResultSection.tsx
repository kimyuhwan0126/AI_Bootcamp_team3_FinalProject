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
import { copyText } from "@/lib/clipboard";
import TravelTimes from "./TravelTimes";
import ArrivalPanel from "./ArrivalPanel";
import { openGoogleCalendar, downloadIcs } from "@/lib/calendar";
import { FLAGS } from "@/lib/flags";

/** @deprecated v17 — 옛 모의 선입금 UI. 기본 꺼짐 (NEXT_PUBLIC_FF_MOCK_PAY=1 로만 켠다) */
const mockPayEnabled = FLAGS.mockPay;

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
  /** v11: '지점도 정하기' 승격 (방장 · '지역까지' 모임에만 보인다) */
  onPromoteToPlace: () => void;
  /** v10: 모임 삭제 (방장) — 확인 팝업은 부모가 띄운다 */
  onDeleteMeeting: () => void;
  /** v19 §4-⑩ 도착 신호등 · 시간 변경 — 액션 한 방 (부모가 /api/meeting 으로 보낸다) */
  onAction: (body: Record<string, unknown>, ok?: string) => Promise<unknown>;
  onEditTime: () => void;
  busy: boolean;
  myId: string | undefined;
  /** v18: 지난 모임 — 방장의 '이 멤버로 재모임 만들기' */
  onRecreate: () => void;
}

export default function ResultSection({
  state,
  destRegion,
  isLeader,
  aiChatEnabled,
  onOpenRoute,
  onOpenReserve,
  onToast,
  onPromoteToPlace,
  onDeleteMeeting,
  onAction,
  onEditTime,
  busy,
  myId,
  onRecreate,
}: ResultSectionProps) {
  // v19 §3: 확정 범위가 '지역까지'인 모임. 경로 API·지점 카카오 링크·도착 신호등을
  // 전부 숨긴다 (v11, v14). 이 화면의 분기는 전부 이 한 값에서 나온다.
  const isRegionOnly = state.scope === "region";

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
              {/* 링크 자체는 그대로 카카오맵 장소 페이지다. **이름만** 사람들이 실제로
                  찾는 것으로 바꿨다 — "카카오맵에서 보기"는 무엇이 있는지 안 말해줘서
                  잘 안 눌린다(2026-08-06 CEO 지적: "메뉴만 보고 싶은 사람들이 있을 텐데").

                  ⚠️ **"예약하기"로는 만들지 않는다.** 카카오 로컬 응답에는 예약 가능
                     여부도 메뉴도 전화번호도 없다(`lib/kakao.ts` 반환 타입은
                     name·category·path·distanceM·lat·lng·url 뿐). 예약을 안 받는 가게에
                     `예약하기` 를 달면 **확인 안 된 것을 확인된 것처럼 말하는** 셈이라,
                     방금 고친 `실시간` 배지와 같은 문제를 새로 만든다(CLAUDE.md §6).
                     메뉴·사진·리뷰는 그 페이지에 실제로 있는 것들이라 이름으로 써도 된다. */}
              {state.winnerPlace.url && (
                <a
                  className="chip line"
                  style={{ fontSize: 10.5, textDecoration: "none" }}
                  href={state.winnerPlace.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  🍽 메뉴 · 사진 · 리뷰 보기
                </a>
              )}
            </div>
          </>
        ) : isRegionOnly && state.winnerRegion ? (
          // v11·v14: '지역까지' 모임 — 지역만 확정하고 끝난다.
          // 경로·지점 카카오 링크·도착 신호등은 이 모임에 아예 없다.
          <>
            <h2 className="sec" style={{ fontSize: 20 }}>📍 {state.winnerRegion.name}</h2>
            <p className="muted" style={{ fontSize: 12.5 }}>
              이 동네에서 만나기로 했어요 — 정확한 장소는 각자 정해요.
            </p>
            <span className="chip ac" style={{ fontSize: 10.5 }}>
              {aiChatEnabled ? "💬 AI 대화로 함께 정했어요" : "🗳️ 투표로 함께 정했어요"}
            </span>
          </>
        ) : (
          <p className="muted">확정된 장소가 없어요.</p>
        )}
      </div>

      {/* v11: '지역까지' 모임은 경로 API 를 쓰지 않는다 — 지도만 보여준다.
             방장은 '지점도 정하기'로 승격할 수 있다(역방향 없음). */}
      {isRegionOnly && isLeader && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="eyebrow">방장</span>
          <button className="btn ok" onClick={onPromoteToPlace}>
            📍 지점도 정하기
          </button>
          <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
            {state.winnerRegion?.name} 안에서 만날 지점을 다시 정합니다. 되돌릴 수 없어요.
          </p>
        </div>
      )}

      {isRegionOnly ? null : destRegion ? (
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

      {/* ── v17: '선입금' 명칭 폐기 → '지점 카카오 링크 연결' ──
             결제는 범위 외다(루트 CLAUDE.md §3-1). 이 자리는 이제 카카오맵 상세로
             보내주는 링크 하나이고, **지점 모임에만** 뜬다.

             ⚠️ 아래 옛 선입금 블록은 `FF_MOCK_PAY` 플래그 뒤로 내렸다 — 지우지 않은 이유는
                옛 모임 데이터(state.reservation) 가 남아 있을 수 있어서다. 기본은 꺼짐. */}
      {!isRegionOnly && state.winnerPlace && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="eyebrow">지점</span>
          {state.winnerPlace.url ? (
            <a
              className="btn ok"
              style={{ textDecoration: "none", textAlign: "center" }}
              href={state.winnerPlace.url}
              target="_blank"
              rel="noreferrer"
            >
              🗺 카카오맵에서 {state.winnerPlace.name} 열기
            </a>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              이 지점은 카카오맵 상세 링크가 없어요.
            </p>
          )}
          <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
            길찾기·메뉴·전화는 카카오맵에서 확인하세요. 예약·결제는 모이머가 대신하지 않아요.
          </p>
        </div>
      )}

      {/* @deprecated v17 — 옛 모의 선입금. 기본 숨김이고 옛 데이터가 있을 때만 그린다. */}
      {mockPayEnabled && state.winnerPlace && (
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
                  (`lib/routing.ts` PLACE_QUERIES), 실존 가게에 지어낸 값이 붙는 모양이 된다.

                  ⚠️ `(모의)` 는 **값 쪽**에 둔다. 라벨(`.kv .k`)이 72px 고정폭이라
                     `선입금 (모의)` 는 "선입금 (모" / "의)" 로 줄바꿈됐다(2026-08-06 실측).

                  ⚠️ 인원은 `headcount`(모임 **정원**)가 아니라 `totalParticipants`
                     (**실제 참여자 수**)다. 정원 8명·참여 2명인 모임에서 화면 위쪽은
                     "참여자 2명"인데 여기만 "× 8명 / 합계 80,000원"이 떠서 오류로 읽혔다.
                     `ReserveModal.tsx` 와 `lib/store.ts` 의 `reserve()` 도 같은 기준이다 —
                     **셋이 어긋나면 미리보기와 결제 결과가 달라진다.** */}
              <div className="kv"><span className="k">선입금</span><span className="v tnum">1인 {state.winnerPlace.depositPerHead.toLocaleString()}원 × {state.totalParticipants}명 <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>(모의)</span></span></div>
              <div className="between">
                <b className="tnum" style={{ fontSize: 15 }}>합계 {(state.winnerPlace.depositPerHead * state.totalParticipants).toLocaleString()}원 <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>(모의)</span></b>
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

      {/* ── v19 §4-⑩ 도착 신호등 ──
             '지역까지' 모임엔 아예 없다 (v14). 지난 모임도 읽기 전용이라 숨긴다 (v18). */}
      {!isRegionOnly && !state.isPast && (
        <ArrivalPanel
          state={state}
          myId={myId}
          isLeader={isLeader}
          busy={busy}
          onAction={onAction}
          onEditTime={onEditTime}
        />
      )}

      {/* ── v18 §4-⑪ 지난 모임 — 읽기 전용 + 방장의 재모임 ── */}
      {state.isPast && (
        <div className="card stack" style={{ gap: 8 }}>
          <div className="between">
            <span className="eyebrow">지난 모임</span>
            <span className="chip line" style={{ fontSize: 10 }}>종료됨</span>
          </div>
          <p className="faint" style={{ fontSize: 11, margin: 0 }}>
            기록 열람만 돼요. 되살릴 수는 없고, 같은 멤버로 새 모임을 만들 수 있어요.
          </p>
          {isLeader && (
            <button className="btn ok" disabled={busy} onClick={onRecreate}>
              🔁 이 멤버로 재모임 만들기
            </button>
          )}
          <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
            카카오 로그인한 멤버는 자동으로 옮겨가고, 그 외에는 새 초대 링크로 다시 참여해요.
          </p>
        </div>
      )}

      {/* 부가기능 */}
      <div className="card stack" style={{ gap: 8 }}>
        <span className="eyebrow">부가기능</span>
        <button className="btn" onClick={() => openGoogleCalendar(state)}>📅 Google 캘린더에 추가</button>
        <button className="btn ghost" onClick={() => downloadIcs(state)}>📄 .ics 다운로드 (Apple·Outlook용)</button>
        {/* ── v16·v18: 카카오톡 알리기 — **상시 버튼**이다(자동 팝업 없음) ──
               메시지와 링크를 자동으로 완성해 공유 시트에 넘긴다.
               ⚠️ 카카오톡 SDK 연동이 아니라 **OS 공유 시트**다 — 폰에서는 카카오톡이
                  목록에 뜨고, 데스크톱은 시트가 없어 클립보드 복사로 떨어진다.
                  (`navigator.share` 는 HTTPS/localhost 에서만 동작한다 — LAN 시연은
                   http 라 자동으로 복사 경로를 탄다) */}
        <button
          className="btn"
          style={{ background: "#FDD835", color: "#3A2B00", borderColor: "#E5C300" }}
          onClick={() => {
            const url = `${location.origin}/m/${state.code}`;
            const where = state.winnerPlace?.name ?? state.winnerRegion?.name ?? "";
            const when = state.meetTime
              ? new Date(state.meetTime).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                })
              : "";
            const text =
              `[${state.name}] 장소가 정해졌어요!\n` +
              (where ? `📍 ${where}\n` : "") +
              (when ? `🕘 ${when}\n` : "") +
              url;
            if (navigator.share) {
              void navigator.share({ title: state.name, text }).catch(() => {});
            } else {
              void copyText(text);
              onToast("메시지를 복사했어요 — 카카오톡에 붙여넣으세요");
            }
          }}
        >
          💬 카카오톡 알리기
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            void copyText(`${location.origin}/m/${state.code}`);
            onToast("모임 링크를 복사했어요");
          }}
        >
          🔗 모임 링크만 복사
        </button>
      </div>

      {/* v10: 방장 모임 삭제 — 되돌릴 수 없어 맨 아래에 따로 둔다 */}
      {isLeader && !state.isPast && (
        <div className="card stack" style={{ gap: 6 }}>
          <span className="eyebrow">위험 구역</span>
          <button className="btn ghost" style={{ color: "var(--danger, #E11D48)" }} onClick={onDeleteMeeting}>
            🗑 모임 삭제
          </button>
          <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
            참여자·후보·표가 전부 사라지고 되돌릴 수 없어요.
          </p>
        </div>
      )}
    </>
  );
}
