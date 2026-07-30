"use client";

// ─────────────────────────────────────────────────────────────
// v8 모임 탭 — 모임 목록 + 생성/참여/생성완료 모달 (/api/meeting)
//  생성 완료 시 초대 URL 자동 생성 + 클립보드 복사 (회의록 결정)
// ─────────────────────────────────────────────────────────────
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BottomNav from "../components/v8/BottomNav";
import V8Header from "../components/v8/V8Header";
import { IcSearch, IcPeople } from "../components/v8/Icons";
import { addIdentity } from "@/lib/identity";
import { useSession } from "../components/v8/useSession";
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
  // 로그인해 들어왔으면 이름을 다시 묻지 않는다 — 비워두면 세션 이름을 쓴다
  const { session } = useSession();
  const [meetings, setMeetings] = useState<MeetingState[]>([]);
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 생성 완료 요약 — 방장이 무엇을 만들었는지 한 화면에서 확인하고 링크를 공유한다.
  // (URL만 던져주면 정원·방장·모임 시간이 제대로 들어갔는지 확인할 데가 없었다)
  const [created, setCreated] = useState<{
    code: string;
    name: string;
    leaderName: string;
    headcount: number;
    timeText: string;
    url: string;
  } | null>(null);

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
      // 비워두면 로그인 이름 → 그것도 없으면 "방장"
      const leaderName = cLeader.trim() || session?.name || "방장";
      const headcount = 8;
      const d = await post({ action: "create", name: cName, password: cPw, headcount, leaderName });
      addIdentity(d.code, { id: d.participantId, name: leaderName, isLeader: true });
      // 모임 시간은 선택 입력 — 비워두면 나중에 홈/결과 화면에서도 정할 수 있다
      let timeText = "";
      if (cTime.trim()) {
        try {
          await post({ action: "meetTime", code: d.code, participantId: d.participantId, time: cTime.trim() });
          timeText = cTime.trim();
        } catch {
          /* 시간 저장 실패해도 모임 생성 자체는 이미 완료됐으니 무시 */
        }
      }
      const url = `${window.location.origin}/m/${d.code}`;
      setCreated({ code: d.code, name: cName, leaderName, headcount, timeText, url });
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
    // 이름을 비웠으면 로그인 이름으로 참여한다 (임시/카카오 공통).
    // 로그인도 안 한 채 직접 URL로 열었다면 이름이 필요하다.
    const name = jName.trim() || session?.name || "";
    if (!name) {
      setErr("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      // URL 붙여넣기 지원: /m/CODE 형태에서 코드 추출 (회의록: URL 또는 이름+패스워드)
      const m = jCode.match(/\/m\/([A-Za-z0-9]{4,8})/);
      const code = (m ? m[1] : jCode).toUpperCase().trim();
      const d = await post({ action: "join", code, password: jPw, name });
      addIdentity(d.code, { id: d.participantId, name, isLeader: false });
      router.push(`/m/${d.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "요청 실패");
      setBusy(false);
    }
  }

  function closeModal() {
    setModal(null);
    setErr(null);
    setCreated(null);
    setBusy(false);
    router.replace("/meetings");
  }

  const shown = meetings.filter((m) => !filter || m.name.includes(filter));
  const ongoing = shown.filter((m) => m.stage !== "result");
  const done = shown.filter((m) => m.stage === "result");

  return (
    <main className="device v8-page">
      <V8Header />
      <div style={{ padding: "4px 16px 10px" }}>
        <button className="btn" onClick={() => setModal("create")}>
          <span style={{ width: 16, height: 16, display: "inline-flex" }}><IcPeople /></span> 새 모임 만들기
        </button>
      </div>
      <div className="v8-searchwrap">
        <div className="v8-search">
          <IcSearch />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="모임 이름으로 검색" />
        </div>
      </div>

      <div className="label" style={{ padding: "6px 16px 4px" }}>최근 등록 모임</div>
      <div className="v8-list" style={{ paddingBottom: 4 }}>
        {ongoing.length === 0 ? (
          <div className="v8-empty">진행 중인 모임이 없어요. 새 모임을 만들어보세요.</div>
        ) : (
          ongoing.map((m) => {
            const s = STAGE_LABEL[m.stage] || STAGE_LABEL.main;
            return (
              <button key={m.code} className="v8-item" style={{ cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => router.push(`/m/${m.code}`)}>
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
      <div className="v8-list">
        {done.length === 0 ? (
          <div className="v8-empty">아직 결정된 모임이 없어요.</div>
        ) : (
          done.map((m) => (
            <button key={m.code} className="v8-item" style={{ cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => router.push(`/m/${m.code}`)}>
              <div className="grow">
                <div className="i-title">{m.name}</div>
                <div className="i-sub">확정 완료{m.winnerPlace ? ` · ${m.winnerPlace.name}` : ""}</div>
              </div>
              <span className="faint">›</span>
            </button>
          ))
        )}
      </div>

      {/* 생성 모달 — 만들기 전엔 입력 폼, 만든 뒤엔 요약 + 초대 링크로 바뀐다 */}
      {modal === "create" && (
        <div className="v8-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          {created ? (
            <div className="v8-modal stack" style={{ gap: 12 }}>
              <div className="center stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 30 }}>🎉</span>
                <h2 style={{ margin: 0 }}>모임이 만들어졌어요</h2>
                <p className="m-sub" style={{ margin: "2px 0 0" }}>
                  아래 링크를 공유하면 참여자가 바로 들어올 수 있어요.
                </p>
              </div>
              <div
                style={{
                  background: "var(--panel2)",
                  border: "1px solid var(--hair)",
                  borderRadius: 14,
                  padding: "12px 14px",
                }}
              >
                <div className="kv"><span className="k">모임 이름</span><span className="v grow">{created.name}</span></div>
                <div className="kv"><span className="k">모임 코드</span><span className="v grow"><b className="tnum">{created.code}</b></span></div>
                <div className="kv"><span className="k">정원</span><span className="v grow">{created.headcount}명</span></div>
                <div className="kv"><span className="k">방장</span><span className="v grow">{created.leaderName}</span></div>
                <div className="kv">
                  <span className="k">모임 시간</span>
                  <span className="v grow">
                    {created.timeText || <span className="faint">미정 — 나중에 정해도 돼요</span>}
                  </span>
                </div>
              </div>
              <div>
                <label className="label">초대 링크</label>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input" value={created.url} readOnly />
                  <button
                    className="btn sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => navigator.clipboard.writeText(created.url).catch(() => {})}
                  >
                    복사
                  </button>
                </div>
              </div>
              <button className="btn" onClick={() => router.push(`/m/${created.code}`)}>모임으로 이동</button>
              <button className="btn ghost" onClick={closeModal}>닫기</button>
            </div>
          ) : (
            <div className="v8-modal stack" style={{ gap: 12 }}>
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
                <label className="label">내 이름 (방장{session ? " · 선택" : ""})</label>
                <input
                  className="input"
                  value={cLeader}
                  onChange={(e) => setCLeader(e.target.value)}
                  placeholder={session ? `비워두면 '${session.name}'(으)로 만들어요` : "예: 유환"}
                />
              </div>
              <div>
                <label className="label">몇 시에 만나요? (선택)</label>
                <input className="input" value={cTime} onChange={(e) => setCTime(e.target.value)} placeholder="예: 이번 주 토요일 저녁 7시" />
              </div>
              {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
              <button className="btn" onClick={handleCreate} disabled={busy || !cName || !cPw}>
                {busy ? <span className="spinner" /> : "만들기"}
              </button>
              <button className="btn ghost" onClick={closeModal}>닫기</button>
            </div>
          )}
        </div>
      )}

      {/* 참여 모달 */}
      {modal === "join" && (
        <div className="v8-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="v8-modal stack" style={{ gap: 12 }}>
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
              <label className="label">내 이름{session ? " (선택)" : ""}</label>
              <input
                className="input"
                value={jName}
                onChange={(e) => setJName(e.target.value)}
                placeholder={session ? `비워두면 '${session.name}'(으)로 참여해요` : "예: 유나"}
              />
            </div>
            {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
            {/* 이름은 로그인 상태면 선택사항 — 비회원이 직접 URL로 연 경우에만 필수 */}
            <button className="btn" onClick={handleJoin} disabled={busy || !jCode || !jPw || (!jName.trim() && !session)}>
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
