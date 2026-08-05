"use client";

// ─────────────────────────────────────────────────────────────
// 참가자별 이동시간 목록 — 탭하면 경로 상세 시트가 열린다
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import type { MeetingState, RegionCandidate } from "@/lib/types";
import { pinColor } from "@/app/components/KakaoMap";
import { formatMinutes } from "@/lib/format";
import { arrivalStatus, ARRIVAL_COLOR, ARRIVAL_LABEL, type ArrivalStatus } from "@/lib/geo";

/**
 * 자가신고가 **없을 때** 쓰는 문구. `ARRIVAL_LABEL`("정시권·지체·많이 늦음")은
 * 본인이 직접 남긴 상태에만 쓴다.
 *
 * 왜 나눴나 — `arrivalStatus()` 가 재는 건 지각이 아니라 **가장 빨리 오는 사람 대비
 * 거리**다. 아무 말도 안 한 사람에게 빨간 `● 많이 늦음` 을 붙이면, 다른 참가자
 * 화면에는 "지훈이 늦는다고 했다"로 읽힌다. 사실이 아니고 모임 분위기도 해친다.
 */
const DISTANCE_LABEL: Record<ArrivalStatus, string> = {
  green: "가까움",
  yellow: "조금 멀어요",
  red: "멀어요",
};

export default function TravelTimes({
  state,
  dest,
  title,
  onOpen,
}: {
  state: MeetingState;
  dest: RegionCandidate;
  title?: string;
  onOpen: (pid: string) => void;
}) {
  const rows = state.participants.filter((p) => p.lat != null);
  if (rows.length === 0) return null;
  const mins = new Map(dest.perParticipant.map((x) => [x.pid, x.min]));
  // 그 사람 숫자가 실 API 값인지 — `undefined`(옛 데이터)는 참으로 치지 않는다.
  // 모르면 "실시간"이라고 주장하지 않는 쪽이 이 앱의 기준이다(CLAUDE.md §6).
  const realOf = new Map(dest.perParticipant.map((x) => [x.pid, x.real === true]));
  const max = Math.max(1, ...dest.perParticipant.map((x) => x.min));
  // 도착 신호등 — 회의록: 정시권(초록)/지체(노랑)/많이 늦음(빨강).
  // 다들 같은 순간 출발한다고 볼 때 제일 빠른 사람 대비 얼마나 더 걸리는지로 매긴다.
  const groupMins = dest.perParticipant.map((x) => x.min);
  return (
    <div className="card stack" style={{ gap: 2 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="eyebrow">{title ?? "참가자별 이동시간"}</span>
        <span className="faint" style={{ fontSize: 11 }}>→ {dest.name} 기준</span>
      </div>
      {rows.map((p) => {
        const m = mins.get(p.id);
        const isReal = realOf.get(p.id) === true;
        // 본인이 남긴 상태가 있으면 그걸 우선 — 없으면 이동시간 기반 추정
        const status = p.status ?? (m != null && groupMins.length > 0 ? arrivalStatus(m, groupMins) : null);
        // 자가신고인가, 우리가 거리로 추측한 것인가. 둘을 같은 모양으로 그리면
        // "지훈이 늦는다고 말했다"로 읽힌다 — 실제로는 아무 말도 안 했다.
        const selfReported = !!p.status;
        const statusColor = status ? ARRIVAL_COLOR[status] : "var(--ac)";
        return (
          <button key={p.id} className="travelrow" onClick={() => onOpen(p.id)} title="탭하면 경로 상세를 볼 수 있어요">
            <div className={"av" + (p.transport === "car" ? " car" : "")} style={status ? { boxShadow: `0 0 0 2px ${statusColor}` } : undefined}>
              {p.name.slice(0, 1)}
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="between" style={{ marginBottom: 3 }}>
                <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{p.name}</span>
                <span className="row" style={{ gap: 5 }}>
                  {status && (
                    <span
                      className="chip"
                      style={
                        selfReported
                          ? { fontSize: 8.5, padding: "2px 7px", background: `${statusColor}22`, color: statusColor }
                          : // 추정 배지는 채우지 않고 테두리로 — 자가신고와 한눈에 구분된다
                            { fontSize: 8.5, padding: "2px 7px", background: "transparent", color: statusColor, border: `1px solid ${statusColor}55` }
                      }
                      title={selfReported ? "본인이 남긴 상태예요" : "아직 아무도 말하지 않았어요 — 이동시간으로 추측한 거리 표시예요"}
                    >
                      {selfReported ? `● ${ARRIVAL_LABEL[status]}` : `~ ${DISTANCE_LABEL[status]}`}
                    </span>
                  )}
                  {/* 🔴 예전엔 이 칩에 조건이 없어 추정값에도 `실시간` 이 붙었다.
                      2026-08-05 실키 검증에서 한 목록 안에 ODsay 실값 3건과 추정 1건이
                      섞였는데 넷 다 `실시간` 이었다(자월도 참가자만 ODsay `code 3` 실패).
                      같은 화면의 경로 상세 시트는 같은 숫자를 `추정값` 이라 밝혀 모순이었다. */}
                  {isReal ? (
                    <span className="chip ok" style={{ fontSize: 8.5, padding: "2px 7px" }}>실시간</span>
                  ) : (
                    <span className="chip warn" style={{ fontSize: 8.5, padding: "2px 7px" }} title="실시간 경로를 가져오지 못해 직선거리로 추정한 값이에요">
                      추정값
                    </span>
                  )}
                  <b className="tnum" style={{ fontSize: 11.5, color: statusColor }}>{formatMinutes(m)}</b>
                </span>
              </div>
              <div className="bar sm">
                <i style={{ width: `${m != null ? Math.round((m / max) * 100) : 0}%`, background: statusColor }} />
              </div>
              <div className="faint" style={{ fontSize: 10, marginTop: 3 }}>
                {p.transport === "car" ? "🚗 자차" : "🚇 대중교통"} · <b style={{ color: "var(--ac)" }}>경로 상세 ›</b>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}