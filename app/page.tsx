"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addIdentity } from "@/lib/identity";
import DebugSeed from "./components/DebugSeed";

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kakaoName, setKakaoName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 카카오 로그인 콜백 결과(?name=/?err=) 처리
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const name = q.get("name");
    const e = q.get("err");
    if (name) {
      setKakaoName(name);
      setCLeader(name);
      setJName(name);
    }
    if (e === "nokey") setNotice("카카오 키가 아직 설정되지 않았어요. .env.local 에 KAKAO_REST_API_KEY 를 넣고 서버를 재시작하세요.");
    else if (e === "login" || e === "nocode") setNotice("카카오 로그인에 실패했어요. 다시 시도해 주세요.");
    if (name || e) window.history.replaceState({}, "", "/");
  }, []);

  // 외부 API 연결 상태
  const [status, setStatus] = useState<{
    kakao: boolean; odsay: boolean; tmap: boolean;
    ai?: { ok: boolean; active: string; model: string; url: string };
  } | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, [kakaoName]);
  const mapKey = !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  // create (Leader)
  const [cName, setCName] = useState("8월 팀 회식");
  const [cPw, setCPw] = useState("1234");
  const [cHead, setCHead] = useState(4);
  const [cLeader, setCLeader] = useState("지훈");

  // join (User)
  const [jCode, setJCode] = useState("");
  const [jPw, setJPw] = useState("");
  const [jName, setJName] = useState("");

  async function post(body: any) {
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
      const d = await post({
        action: "create",
        name: cName,
        password: cPw,
        headcount: cHead,
        leaderName: cLeader,
      });
      addIdentity(d.code, { id: d.participantId, name: cLeader, isLeader: true });
      router.push(`/m/${d.code}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  async function handleJoin() {
    setErr(null);
    setBusy(true);
    try {
      const d = await post({
        action: "join",
        code: jCode.toUpperCase(),
        password: jPw,
        name: jName,
      });
      addIdentity(d.code, { id: d.participantId, name: jName, isLeader: false });
      router.push(`/m/${d.code}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="device">
      <div style={{ padding: "40px 20px 24px", textAlign: "center" }}>
        <div className="brand" style={{ justifyContent: "center", fontSize: 22 }}>
          <span className="dot" />
          모이머
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
          흩어진 우리, 딱 중간에서
        </p>
        <p className="faint" style={{ margin: "3px 0 0", fontSize: 12 }}>
          각자 위치에서 가장 공평한 중간 지점을 찾아드려요
        </p>
      </div>

      <div className="pad stack" style={{ gap: 16 }}>
        {/* 카카오 로그인 */}
        {kakaoName ? (
          <div className="chip ok" style={{ alignSelf: "center", padding: "7px 14px" }}>✅ 카카오 로그인됨 · {kakaoName}</div>
        ) : (
          <a href="/api/auth/kakao" className="btn kakao" style={{ textDecoration: "none" }}>● 카카오로 시작하기</a>
        )}
        {notice && (
          <div className="chip warn" style={{ alignSelf: "stretch", justifyContent: "flex-start", padding: "8px 12px", whiteSpace: "normal", lineHeight: 1.5 }}>⚠ {notice}</div>
        )}

        <div className="tabbar">
          <button className={tab === "create" ? "on" : ""} onClick={() => setTab("create")}>
            👑 모임 만들기 (방장)
          </button>
          <button className={tab === "join" ? "on" : ""} onClick={() => setTab("join")}>
            🙋 모임 참여 (참가자)
          </button>
        </div>

        {tab === "create" ? (
          <div className="card stack" style={{ gap: 14 }}>
            <div>
              <span className="eyebrow">Leader · 모임방 개설</span>
              <h2 className="sec" style={{ marginTop: 4 }}>새 모임 만들기</h2>
            </div>
            <div>
              <label className="label">모임 이름</label>
              <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="예: 8월 팀 회식" />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="grow">
                <label className="label">비밀번호</label>
                <input className="input" value={cPw} onChange={(e) => setCPw(e.target.value)} placeholder="참여 시 필요" />
              </div>
              <div style={{ width: 110 }}>
                <label className="label">인원수 <span className="badge-pay">유료</span></label>
                <input
                  className="input tnum"
                  type="number"
                  min={1}
                  max={50}
                  value={cHead}
                  onChange={(e) => setCHead(Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className="label">내 이름 (방장)</label>
              <input className="input" value={cLeader} onChange={(e) => setCLeader(e.target.value)} placeholder="예: 지훈" />
            </div>
            {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}
            <button className="btn" onClick={handleCreate} disabled={busy}>
              {busy ? <span className="spinner" /> : "모임 개설하기"}
            </button>
            <p className="hint">개설 후 참여 코드가 발급돼요. 참가자에게 코드와 비밀번호를 공유하세요.</p>
          </div>
        ) : (
          <div className="card stack" style={{ gap: 14 }}>
            <div>
              <span className="eyebrow">User · 모임 참여</span>
              <h2 className="sec" style={{ marginTop: 4 }}>초대받은 모임에 참여</h2>
            </div>
            <div>
              <label className="label">참여 코드</label>
              <input
                className="input"
                style={{ letterSpacing: 3, fontWeight: 800, textTransform: "uppercase" }}
                value={jCode}
                onChange={(e) => setJCode(e.target.value.toUpperCase())}
                placeholder="예: ABC123"
                maxLength={6}
              />
            </div>
            <div>
              <label className="label">비밀번호</label>
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
          </div>
        )}

        {/* 외부 API 연결 상태 */}
        {status && (
          <div className="card tight" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>외부 API 연결 상태</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                ["카카오 로그인·지오코딩", status.kakao],
                ["카카오맵 SDK", mapKey],
                ["ODsay 대중교통", status.odsay],
                ["TMAP 자차", status.tmap],
              ].map(([label, on]) => (
                <span key={label as string} className={"chip " + (on ? "ok" : "line")}>
                  {on ? "● 연결됨" : "○ mock"} · {label}
                </span>
              ))}
              {status.ai && (
                <span
                  className={"chip " + (status.ai.ok ? "ok" : "warn")}
                  title={status.ai.url}
                >
                  {status.ai.ok
                    ? `● AI 챗봇 · Ollama ${status.ai.active === "primary" ? "원격" : "로컬"} · ${status.ai.model}`
                    : "✕ AI 챗봇 · Ollama 연결 안 됨 (방장 직접 확정만 가능)"}
                </span>
              )}
            </div>
            <p className="hint" style={{ marginTop: 8, textAlign: "left" }}>
              키 미설정 항목은 자동으로 mock 데이터로 동작해요. 키 입력 후 서버 재시작 시 연결됩니다.
            </p>
          </div>
        )}

        <DebugSeed />

        <p className="hint" style={{ marginTop: 4 }}>
          Next.js · Neon(Postgres) 확장 구조 · Vercel 배포 준비 프로토타입
        </p>
      </div>
    </main>
  );
}
