"use client";

// ─────────────────────────────────────────────────────────────
// 디버그 위젯 — 개발 중 모임을 빠르게 채우는 도구
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// 운영 빌드에서는 아예 그려지지 않는다(부모가 `DEV` 로 감싼다).
// 시연 중 실수로 눌리면 안 되므로 여기에 단계 이동은 넣지 않는다 — 방장 바에만 둔다.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import type { MeetingState } from "@/lib/types";

export interface DebugWidgetProps {
  state: MeetingState;
  isLeader: boolean;
  busy: boolean;
  onAutoOrigins: () => void;
  onAutoOpinions: (mode: "consensus" | "split") => void;
}

export default function DebugWidget({
  state,
  isLeader,
  busy,
  onAutoOrigins,
  onAutoOpinions,
}: DebugWidgetProps) {
  const [open, setOpen] = useState(false);
  return (
    // ⚠️ `right:16` 은 **화면**의 오른쪽 끝이다 — 노트북처럼 넓은 화면에서는
    //    폰 모양 껍데기(`.device`, 440px)를 벗어나 저 멀리 붙는다.
    //    껍데기 오른쪽 안쪽(16px)에 붙이되, 좁은 화면에서는 그대로 16px 이 되게 한다.
    <div style={{ position: "fixed", right: "max(16px, calc(50% - 204px))", bottom: isLeader ? 78 : 20, zIndex: 55, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {open && (
        <div className="card tight" style={{ width: 210, boxShadow: "var(--shadow)" }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>🐞 빠른 채우기 · {state.stage}</div>
          <div className="stack" style={{ gap: 6 }}>
            <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={onAutoOrigins}>📍 출발지 전원 자동</button>
            {state.stage === "chat" ? (
              <>
                <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={() => onAutoOpinions("consensus")}>🗣️ 전원 합의 발화</button>
                <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={() => onAutoOpinions("split")}>🎭 전원 의견 갈림</button>
              </>
            ) : (
              <div className="faint" style={{ fontSize: 10.5 }}>대화 단계에서 자동 발화 사용 가능</div>
            )}
            {isLeader && <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>단계 이동은 하단 방장 바에서</div>}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="디버그"
        style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid var(--hair2)", background: "var(--panel)", boxShadow: "var(--shadow)", fontSize: 20 }}
      >
        🐞
      </button>
    </div>
  );
}
