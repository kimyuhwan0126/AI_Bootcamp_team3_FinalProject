"use client";

// ─────────────────────────────────────────────────────────────
// ✍ 다른 후보로 정하기 — 최다득표가 아닌 후보로도 정할 수 있는 예외 수단.
//
// 👤 담당: 투표·추천 화면 (`.github/CODEOWNERS`)
//
// 방장 전용이다. 예약이 안 되거나 사정이 있을 때 쓴다.
// 후보 버튼을 바로 누르면 오클릭으로 확정되므로 **라디오 선택 + 확정 버튼** 2단계다.
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";
import { formatMinutes, formatGap } from "@/lib/format";

export interface ManualPickModalProps {
  target: "region" | "place";
  state: MeetingState;
  /** 라디오로 고른 후보 id (아직 안 골랐으면 null) */
  picked: string | null;
  onPick: (id: string) => void;
  busy: boolean;
  onConfirm: (id: string, name: string) => void;
  onClose: () => void;
}

export default function ManualPickModal({
  target,
  state,
  picked,
  onPick,
  busy,
  onConfirm,
  onClose,
}: ManualPickModalProps) {
  const rows =
    target === "region"
      ? state.regions.map((r) => ({
          id: r.id,
          name: r.name,
          title: r.name,
          sub: `최대 ${formatMinutes(r.maxMin)} · 편차 ${formatGap(r.devMin)}`,
        }))
      : state.places.map((p) => ({
          id: p.id,
          name: p.name,
          title: `${p.emoji} ${p.name}`,
          sub: `${p.category} · ${p.distanceM}m${p.rating > 0 ? ` · ⭐${p.rating}` : ""}`,
        }));

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal stack" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <b style={{ fontSize: 16 }}>✍ 다른 후보로 정하기</b>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.55 }}>
            최다득표가 아닌 곳으로도 정할 수 있어요. 예약이 안 되거나 사정이 있을 때 쓰세요.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {rows.length === 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              아직 후보가 없어요.
            </p>
          )}
          {rows.map((row) => (
            <label
              key={row.id}
              className={"opt" + (picked === row.id ? " sel" : "")}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="manualPick"
                checked={picked === row.id}
                onChange={() => onPick(row.id)}
              />
              <div className="grow">
                <b style={{ fontSize: 13 }}>{row.title}</b>
                <div className="faint" style={{ fontSize: 11 }}>
                  {row.sub}
                </div>
              </div>
            </label>
          ))}
        </div>
        <button
          className="btn"
          disabled={busy || !picked}
          onClick={() => {
            const row = rows.find((r) => r.id === picked);
            if (row) onConfirm(row.id, row.name);
          }}
        >
          이 후보로 확정
        </button>
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
