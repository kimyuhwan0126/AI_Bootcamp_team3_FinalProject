"use client";

// ─────────────────────────────────────────────────────────────
// v7 모임 탭 — 모임 목록 + 생성/참여 모달 (v3 /api/meeting 재사용)
//  생성 완료 시 초대 URL 자동 생성 + 클립보드 복사 (회의록 결정)
// ─────────────────────────────────────────────────────────────
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BottomNav from "../components/v7/BottomNav";
import V7Header from "../components/v7/V7Header";
import { IcSearch, IcPeople } from "../components/v7/Icons";
import { addIdentity } from "@/lib/identity";
import type { MeetingState } from "@/lib/types";

const STAGE_LABEL: Record<string, { text: string; on: boolean }> = {
  main: { text: "참석자 모집 중", on: false },
  chat: { text: "장소 정하는 중", on: true },
  result: { text: "확정 완료", on: false },
};

function myCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    const m = k.match(/^moimer:([A-Z0-9]{4,8})$/);
    if (m) codes.push(m[1]);
  }
  return codes;
}

function MeetingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [meetings, setMeetings] = useState<MeetingState[]>([]);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // 생성 폼
  const [cName, setCName] = useState("");
  const [cPw, setCPw] = useState("");
  const [cLeader, setCLeader] = useState("");
  const [cTime, setCTime] = useState("");
  // 참여 폼
  const [jCode, setJCode] = useState("");
  const [jPw, setJPw] = useState("");
  const [jName, setJName] = useState("");

  useEffect(() => {
    const open = params.get("open");
    if (open === "create" || open === "join") setModal(open);
  }, [params]);

  useEffect(() => {
    (async () => {
      const codes = myCodes();
      const states = await Promise.all(
        codes.map(async (c) => {
          try {
            const r = await fetch(`/api/meeting?code=${c}`);
            return r.ok ? ((await r.json()) as MeetingState) : null;
          } catch {
            return null;
          }
        })
      );
      setMeetings(states.filter((s): s is MeetingState => s !== null));
    })();
  }, []);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "요청 실패");
    return data;
  }

  async function handleCreate() {
    setErr(null);
    setBusy(true);
    try {
      const d = await post({ action: "create", name: cName, password: cPw, headcount: 8, leaderName: cLeader || "방장" });
      addIdentity(d.code, { id: d.participantId, name: cLeader || "방장", isLeader: true });
      // 모임 시간은 선택 입력 — 비워두면 나중에 홈/결과 화면에서도 정할 수 있다
      if (cTime.trim()) {
        try {
          await post({ action: "meetTime", code: d.code, participantId: d.participantId, time: cTime.trim() });
        } catch {
          /* 시간 저장 실패해도 모임 생성 자체는 이미 완료됐으니 무시 */
        }
      }
      const url = `${window.location.origin}/m/${d.code}`;
      setInviteUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* 클립보드 권한 없음 — URL 표시로 대체 */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setErr(null);
    setBusy(true);
    try {
      // URL 붙여넣기 지원: /m/CODE 형태에서 코드 추출 (회의록: URL 또는 이름+패스워드)
      const m = jCode.match(/\/m\/([A-Za-z0-9]{4,8})/);
      const code = (m ? m[1] : jCode).toUpperCase().trim();
      const d = await post({ action: "join", code, password: jPw, name: jName });
      addIdentity(d.code, { id: d.participantId, name: jName, isLeader: false });
      router.push(`/m/${d.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "요청 실패");
      setBusy(false);
    }
  }

  function closeModal() {
    setModal(null);
    setErr(null);
    setInviteUrl(null);
    setBusy(false);
    router.replace("/meetings");
  }

  const shown = meetings.filter((m) => !filter || m.name.includes(filter));
  const ongoing = shown.filter((m) => m.stage !== "result");
  const done = shown.filter((m) => m.stage === "result");

  return (
    <main className="device v7-page">
      <V7Header />
      <div style={{ padding: "4px 16px 10px" }}>
        <button className="btn" onClick={() => setModal("create")}>
          <span style={{ width: 16, height: 16, display: "inline-flex" }}><IcPeople /></span> 새 모임 만들기
        </button>
      </div>
      <div className="v7-searchwrap">
        <div className="v7-search">
          <IcSearch />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="모임 이름으로 검색" />
        </div>
      </div>

      <div className="label" style={{ padding: "6px 16px 4px" }}>최근 등록 모임</div>
      <div className="v7-list" style={{ paddingBottom: 4 }}>
        {ongoing.length === 0 ? (
          <div className="v7-empty">진행 중인 모임이 없어요. 새 모임을 만들어보세요.</div>
        ) : (
          ongoing.map((m) => {
            const s = STAGE_LABEL[m.stage] || STAGE_LABEL.main;
            return (
              <button key={m.code} className="v7-item" style={{ cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => router.push(`/m/${m.code}`)}>
                <div className="grow">
                  <div className="i-title">{m.name}</div>
                  <div className="i-sub" style={s.on ? { color: "var(--ac)", fontWeight: 800 } : undefined}>
                    {s.text} · {m.totalParticipants}명 · 코드 {m.code}
                  </div>
                </div>
                <span className="faint">›</span>
              </button>
            );
          })
        )}
      </div>

      <div className="label" style={{ padding: "10px 16px 4px" }}>이전 모임</div>
      <div className="v7-list">
        {done.length === 0 ? (
          <div className="v7-empty">아직 결정된 모임이 없어요.</div>
        ) : (
          done.map((m) => (
            <button key={m.code} className="v7-item" style={{ cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => router.push(`/m/${m.code}`)}>
              <div className="grow">
                <div className="i-title">{m.name}</div>
                <div className="i-sub">확정 완료{m.winnerPlace ? ` · ${m.winnerPlace.name}` : ""}</div>
              </div>
              <span className="faint">›</span>
            </button>
          ))
        )}
      </div>

      {/* 생성 모달 */}
      {modal === "create" && (
        <div className="v7-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="v7-modal stack" style={{ gap: 12 }}>
            <div>
              <h2>새 모임 만들기</h2>
              <p className="m-sub">생성하면 초대 URL이 만들어지고 클립보드에 복사돼요.</p>
            </div>
            <div>
              <label className="label">모임 이름</label>
              <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="예: 협성대 브레인파크 모임" />
            </div>
            <div>
              <label className="label">패스워드</label>
              <input className="input" value={cPw} onChange={(e) => setCPw(e.target.value)} placeholder="참여자에게 공유할 비밀번호" />
            </div>
            <div>
              <label className="label">내 이름 (방장)</label>
              <input className="input" value={cLeader} onChange={(e) => setCLeader(e.target.value)} placeholder="예: 유환" />
            </div>
            <div>
              <label className="label">몇 시에 만나요? (선택)</label>
              <input className="input" value={cTime} onChange={(e) => setCTime(e.target.value)} placeholder="예: 이번 주 토요일 저녁 7시" />
            </div>
            {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
            {inviteUrl ? (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <div className="input grow" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteUrl}</div>
                  <button className="btn sm" onClick={() => navigator.clipboard.writeText(inviteUrl).catch(() => {})}>복사</button>
                </div>
                <button className="btn" onClick={() => router.push(inviteUrl.replace(window.location.origin, ""))}>모임으로 이동</button>
              </>
            ) : (
              <button className="btn" onClick={handleCreate} disabled={busy || !cName || !cPw}>
                {busy ? <span className="spinner" /> : "만들기"}
              </button>
            )}
            <button className="btn ghost" onClick={closeModal}>닫기</button>
          </div>
        </div>
      )}

      {/* 참여 모달 */}
      {modal === "join" && (
        <div className="v7-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="v7-modal stack" style={{ gap: 12 }}>
            <div>
              <h2>모임 참여하기</h2>
              <p className="m-sub">초대 URL을 붙여넣거나, 코드+패스워드로 참여할 수 있어요.</p>
            </div>
            <div>
              <label className="label">초대 URL 또는 코드</label>
              <input className="input" value={jCode} onChange={(e) => setJCode(e.target.value)} placeholder="https://…/m/ABC123 또는 ABC123" />
            </div>
            <div>
              <label className="label">패스워드</label>
              <input className="input" value={jPw} onChange={(e) => setJPw(e.target.value)} />
            </div>
            <div>
              <label className="label">내 이름</label>
              <input className="input" value={jName} onChange={(e) => setJName(e.target.value)} placeholder="예: 유나" />
            </div>
            {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
            <button className="btn" onClick={handleJoin} disabled={busy || !jCode || !jPw || !jName}>
              {busy ? <span className="spinner" /> : "참여하기"}
            </button>
            <button className="btn ghost" onClick={closeModal}>닫기</button>
          </div>
        </div>
      )}

      <BottomNav active="meetings" />
    </main>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense>
      <MeetingsInner />
    </Suspense>
  );
}
