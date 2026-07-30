"use client";

// ─────────────────────────────────────────────────────────────
// 참가자 추가 모달 (한 기기에서 여러 참가자로 테스트하기 위한 것)
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { addIdentity, type Identity } from "@/lib/identity";

// ── 테스트용 참가자 추가 모달 ──
export default function AddParticipant({ code, onClose, onAdded }: { code: string; onClose: () => void; onAdded: (id: Identity) => void }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code, password: pw, name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const id: Identity = { id: d.participantId, name, isLeader: false };
      addIdentity(code, id);
      onAdded(id);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <b style={{ fontSize: 16 }}>참가자로 참여 (테스트)</b>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 12px" }}>한 기기에서 여러 참가자를 추가해 전체 플로우를 시험할 수 있어요.</p>
        <div className="stack" style={{ gap: 10 }}>
          <input className="input" placeholder="참가자 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="모임 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn" disabled={busy || !name || !pw} onClick={go}>참여</button>
          </div>
        </div>
      </div>
    </div>
  );
}