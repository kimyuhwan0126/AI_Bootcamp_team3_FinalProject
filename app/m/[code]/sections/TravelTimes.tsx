"use client";

// ─────────────────────────────────────────────────────────────
// 참가자별 이동시간 목록 — 탭하면 경로 상세 시트가 열린다
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import type { MeetingState, RegionCandidate } from "@/lib/types";
import { pinColor } from "@/app/components/KakaoMap";
import { formatMinutes } from "@/lib/format";
import { arrivalStatus, ARRIVAL_COLOR, ARRIVAL_LABEL } from "@/lib/geo";

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
        // 본인이 남긴 상태가 있으면 그걸 우선 — 없으면 이동시간 기반 추정
        const status = p.status ?? (m != null && groupMins.length > 0 ? arrivalStatus(m, groupMins) : null);
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
                    <span className="chip" style={{ fontSize: 8.5, padding: "2px 7px", background: `${statusColor}22`, color: statusColor }}>
                      ● {ARRIVAL_LABEL[status]}
                    </span>
                  )}
                  <span className="chip ok" style={{ fontSize: 8.5, padding: "2px 7px" }}>실시간</span>
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