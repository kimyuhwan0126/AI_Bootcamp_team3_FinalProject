"use client";

// ─────────────────────────────────────────────────────────────
// v8 모임원 탭 — 참여자 목록 + 도착 신호등 자가신고
//  본인 항목만 눌러서 상태(정상/지체 중/많이 늦음)와 도착 예정 시간을 남길 수
//  있다. 다른 참여자 항목은 조회만 가능(회의록).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import BottomNav from "../components/v8/BottomNav";
import V8Header from "../components/v8/V8Header";
import type { ArrivalSelfStatus, MeetingState } from "@/lib/types";
import { getActive } from "@/lib/identity";
// 홈·지도와 같은 팔레트 사용 (신호등 색과 겹치지 않는 색만 들어있다)
import { pinColor } from "../components/KakaoMap";
import { ARRIVAL_COLOR, ARRIVAL_LABEL } from "@/lib/geo";

const STATUS_OPTIONS: { key: NonNullable<ArrivalSelfStatus>; label: string }[] = [
  { key: "green", label: "정상" },
  { key: "yellow", label: "지체 중" },
  { key: "red", label: "많이 늦음" },
];

function myCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    const m = k.match(/^moimer:([A-Z0-9]{4,8})$/);
    if (m) codes.push(m[1]);
  }
  return codes;
}

export default function MembersPage() {
  const [meetings, setMeetings] = useState<MeetingState[]>([]);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<ArrivalSelfStatus>(null);
  const [draftEta, setDraftEta] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const codes = myCodes();
    const states = await Promise.all(
      codes.map(async (c) => {
        try {
          const r = await fetch(`/api/meeting?code=${c}`, { cache: "no-store" });
          return r.ok ? ((await r.json()) as MeetingState) : null;
        } catch {
          return null;
        }
      })
    );
    setMeetings(states.filter((s): s is MeetingState => s !== null));
  }
  useEffect(() => {
    reload();
  }, []);

  const m = meetings[selected] || null;
  const me = m ? getActive(m.code) : null;
  const meRow = m && me ? m.participants.find((p) => p.id === me.id) : null;

  function openEdit() {
    setDraftStatus(meRow?.status ?? "green");
    setDraftEta(meRow?.etaText ?? "");
    setEditing(true);
  }

  async function saveStatus() {
    if (!m || !me) return;
    setBusy(true);
    try {
      await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: m.code,
          action: "status",
          participantId: me.id,
          status: draftStatus,
          etaText: draftEta,
        }),
      });
      await reload();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="device v8-page">
      <V8Header />
      {meetings.length > 1 && (
        <div className="pad" style={{ paddingBottom: 0 }}>
          <select className="input" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {meetings.map((mm, i) => (
              <option key={mm.code} value={i}>{mm.name} ({mm.code})</option>
            ))}
          </select>
        </div>
      )}
      {!m ? (
        <div className="v8-empty" style={{ marginTop: 40 }}>
          아직 참여 중인 모임이 없어요.
          <br />
          모임 탭에서 새 모임을 만들거나 참여해보세요.
        </div>
      ) : (
        <>
          <div className="label" style={{ padding: "12px 16px 4px" }}>
            {m.name} · 참여자 <b style={{ color: "var(--ink)" }}>{m.totalParticipants}명</b>
          </div>
          <div className="v8-list">
            {m.participants.map((p, i) => {
              const isMe = p.id === me?.id;
              return (
                <button
                  key={p.id}
                  className="v8-item"
                  style={{ textAlign: "left", font: "inherit", cursor: isMe ? "pointer" : "default" }}
                  onClick={isMe ? openEdit : undefined}
                  title={isMe ? "탭해서 내 도착 상태를 남겨요" : undefined}
                >
                  <div
                    className="i-thumb"
                    style={{
                      borderRadius: "50%", background: pinColor(i), color: "#fff", fontWeight: 900, fontSize: 13,
                      boxShadow: p.status ? `0 0 0 2.5px ${ARRIVAL_COLOR[p.status]}` : undefined,
                    }}
                  >
                    {p.name.slice(0, 2)}
                  </div>
                  <div className="grow">
                    <div className="i-title">
                      {p.name} {p.isLeader && <span className="chip leader" style={{ marginLeft: 4 }}>방장</span>}
                      {isMe && <span className="chip line" style={{ marginLeft: 4, fontSize: 9 }}>나</span>}
                    </div>
                    <div className="i-sub">
                      {p.origin ? `${p.origin} 출발` : "출발지 미입력"} ·{" "}
                      {p.transport === "car" ? "차량" : "대중교통"}
                    </div>
                  </div>
                  {p.status ? (
                    <div className="stack" style={{ alignItems: "flex-end", gap: 2 }}>
                      <span
                        className="chip"
                        style={{ background: `${ARRIVAL_COLOR[p.status]}22`, color: ARRIVAL_COLOR[p.status], fontSize: 10 }}
                      >
                        ● {ARRIVAL_LABEL[p.status]}
                      </span>
                      {p.etaText && <span className="faint" style={{ fontSize: 10 }}>{p.etaText}</span>}
                    </div>
                  ) : isMe ? (
                    <span className="chip line" style={{ fontSize: 10 }}>상태 남기기</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      {editing && meRow && (
        <div className="v8-overlay" onClick={(e) => e.target === e.currentTarget && setEditing(false)}>
          <div className="v8-modal stack" style={{ gap: 12 }}>
            <div>
              <h2>{meRow.name} · 출발지 {meRow.origin || "미입력"}</h2>
              <p className="m-sub">본인 항목만 상태와 도착 예정 시간을 수정할 수 있어요. 다른 참여자는 조회만 가능합니다.</p>
            </div>
            <div className="statusseg">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={draftStatus === o.key ? "on" : ""}
                  style={draftStatus === o.key ? { background: ARRIVAL_COLOR[o.key] } : undefined}
                  onClick={() => setDraftStatus(o.key)}
                >
                  <span className="dot" style={{ background: draftStatus === o.key ? "#fff" : ARRIVAL_COLOR[o.key] }} />
                  {o.label}
                </button>
              ))}
            </div>
            <div>
              <label className="label">도착 예정 시간</label>
              <input
                className="input"
                value={draftEta}
                onChange={(e) => setDraftEta(e.target.value)}
                placeholder="예: 14분 후 (9:55 도착 예정)"
              />
            </div>
            <button className="btn" disabled={busy} onClick={saveStatus}>
              {busy ? <span className="spinner" /> : "저장"}
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)}>닫기</button>
          </div>
        </div>
      )}

      <BottomNav active="members" />
    </main>
  );
}
