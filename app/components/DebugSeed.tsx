"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCENARIOS, type ScenarioGroup } from "@/lib/scenarios";
import { setIdentities } from "@/lib/identity";

const DEV = process.env.NODE_ENV !== "production";
const GROUPS: ScenarioGroup[] = ["메인", "AI 대화", "결과", "엣지"];

export default function DebugSeed() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!DEV) return null;

  async function seed(id: string) {
    setErr(null);
    setBusy(id);
    try {
      const r = await fetch("/api/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "시드 실패");
      const leader = d.identities.find((x: any) => x.isLeader) || d.identities[0];
      setIdentities(d.code, d.identities, leader?.id);
      router.push(`/m/${d.code}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        border: "1px dashed var(--hair2)",
        borderRadius: 16,
        background: "var(--panel2)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontWeight: 800,
          fontSize: 13,
          color: "var(--ink-soft)",
        }}
      >
        <span>🐞 디버그 · 자동 데이터 시드 <span className="faint" style={{ fontWeight: 600 }}>({SCENARIOS.length}가지)</span></span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: ".2s" }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 12px 14px" }}>
          <p className="faint" style={{ fontSize: 11, margin: "0 0 10px" }}>
            버튼을 누르면 해당 상태로 <b>시드된 모임</b>이 즉시 생성되고, 참가자 전원이 등록된 채 방장으로 진입해요.
          </p>
          {GROUPS.map((g) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{g}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {SCENARIOS.filter((s) => s.group === g).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => seed(s.id)}
                    disabled={!!busy}
                    style={{
                      textAlign: "left",
                      border: "1px solid var(--hair)",
                      background: "var(--panel)",
                      borderRadius: 11,
                      padding: "9px 10px",
                      cursor: "pointer",
                      opacity: busy && busy !== s.id ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 12, color: "var(--ink)" }}>
                      {s.icon} {s.title}
                    </div>
                    <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {busy === s.id ? "생성 중…" : s.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {err && <div className="chip warn">⚠ {err}</div>}
        </div>
      )}
    </div>
  );
}
