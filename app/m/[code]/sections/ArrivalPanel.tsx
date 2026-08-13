"use client";

// ─────────────────────────────────────────────────────────────
// 도착 신호등 — 결과 화면 (설계_v19.md §4-⑩)
//
//   🟢 도착 예정 / 🟡 지각 (몇 분인지 입력 → 전원 공유) / 🔴 불참
//
// 규칙
//   · **모임 당일에만 활성** (v16)
//   · **시간 미입력이면 잠금 + 입력 유도 배너** (v7)
//   · '지역까지' 모임에는 아예 없다 (v14) — 부모가 렌더 자체를 안 한다
//   · **본인만 자기 항목을 바꾼다.** 남의 줄은 읽기 전용
//
// ⚠️ 여기서 잠그는 것은 **안내**다. 서버(`setParticipantStatus`)가 같은 조건을
//    다시 검사한다 — 화면만 잠그면 폴링 타이밍에 따라 빠져나갈 수 있다 (v12).
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import type { MeetingState, ArrivalSelfStatus } from "@/lib/types";

const OPTIONS: { key: Exclude<ArrivalSelfStatus, null>; label: string; color: string }[] = [
  { key: "green", label: "도착 예정", color: "#16a34a" },
  { key: "yellow", label: "지각", color: "#d97706" },
  { key: "red", label: "불참", color: "#e11d48" },
];

export interface ArrivalPanelProps {
  state: MeetingState;
  myId: string | undefined;
  isLeader: boolean;
  busy: boolean;
  onAction: (body: Record<string, unknown>, ok?: string) => Promise<unknown>;
  /** 방장에게만 — 모임 시간 입력 화면을 연다 (배너의 버튼) */
  onEditTime: () => void;
}

export default function ArrivalPanel({
  state, myId, isLeader, busy, onAction, onEditTime,
}: ArrivalPanelProps) {
  const [lateMin, setLateMin] = useState("15");

  // v7: 시간이 없으면 신호등을 잠그고, 방장에게는 입력 경로를 준다
  if (!state.meetTime) {
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <span className="eyebrow">도착 신호등</span>
        <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ 모임 시간이 아직 없어요</div>
        <p className="faint" style={{ fontSize: 11, margin: 0 }}>
          몇 시에 만나는지 정해야 도착 상황을 나눌 수 있어요.
        </p>
        {isLeader && (
          <button className="btn" disabled={busy} onClick={onEditTime}>
            🕘 모임 시간 정하기
          </button>
        )}
      </div>
    );
  }

  const meet = new Date(state.meetTime);
  const today = new Date();
  const isToday =
    meet.getFullYear() === today.getFullYear() &&
    meet.getMonth() === today.getMonth() &&
    meet.getDate() === today.getDate();

  // D-day — 날짜 단위로 센다(시각이 아니라). "오늘 저녁 7시"도 D-day 다.
  const dayDiff = Math.round(
    (new Date(meet.getFullYear(), meet.getMonth(), meet.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000
  );
  const dLabel = dayDiff === 0 ? "D-DAY" : dayDiff > 0 ? `D-${dayDiff}` : `D+${-dayDiff}`;

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <span className="eyebrow">도착 신호등</span>
        <span className="chip ok" style={{ fontSize: 10.5 }}>
          {dLabel} · {meet.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {!isToday && (
        <p className="faint" style={{ fontSize: 11, margin: 0 }}>
          모임 <b>당일</b>에 열려요. 그날 여기서 늦는지 못 오는지 알릴 수 있어요.
        </p>
      )}

      {state.participants.map((p) => {
        const mine = p.id === myId;
        const opt = OPTIONS.find((o) => o.key === p.status);
        return (
          <div className="stack" key={p.id} style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <div className={"av" + (p.transport === "car" ? " car" : "")}>{p.name.slice(0, 1)}</div>
              <div className="grow">
                <b style={{ fontSize: 13 }}>
                  {p.name}{mine ? " (나)" : ""}
                </b>
                {p.isLeader && <span className="chip leader" style={{ fontSize: 9, marginLeft: 6 }}>방장</span>}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: opt?.color ?? "#98A2B3" }}>
                {opt
                  ? p.status === "yellow" && p.lateMin
                    ? `${p.lateMin}분 지각`
                    : opt.label
                  : "미정"}
              </span>
            </div>

            {/* 본인 줄에만 버튼이 뜬다 — 남의 상태는 바꿀 수 없다 */}
            {mine && isToday && (
              <div className="row" style={{ gap: 4, paddingLeft: 34 }}>
                {OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    className={"chip" + (p.status === o.key ? " ok" : " line")}
                    style={{ cursor: "pointer", fontSize: 11 }}
                    disabled={busy}
                    onClick={() =>
                      void onAction(
                        {
                          action: "status",
                          participantId: myId,
                          status: o.key,
                          // v16: 노랑이면 몇 분인지 함께 보낸다 → 전원에게 공유된다
                          lateMin: o.key === "yellow" ? Number(lateMin) || 15 : null,
                        },
                        o.key === "yellow" ? `${Number(lateMin) || 15}분 지각으로 알렸어요` : `'${o.label}'(으)로 알렸어요`
                      )
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {/* 노랑을 고를 때만 분 입력이 필요하다 */}
            {mine && isToday && p.status === "yellow" && (
              <div className="row" style={{ gap: 6, paddingLeft: 34 }}>
                <input
                  className="input"
                  style={{ maxWidth: 90 }}
                  inputMode="numeric"
                  value={lateMin}
                  onChange={(e) => setLateMin(e.target.value)}
                  aria-label="몇 분 지각"
                />
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    void onAction(
                      { action: "status", participantId: myId, status: "yellow", lateMin: Number(lateMin) || 15 },
                      `${Number(lateMin) || 15}분 지각으로 알렸어요`
                    )
                  }
                >
                  분 알리기
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
