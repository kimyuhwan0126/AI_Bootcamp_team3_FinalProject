"use client";

// ─────────────────────────────────────────────────────────────
// /health — 발표 당일 "지금 이 기기가 붙어 있나"를 폰에서 직접 보는 화면
//
// 왜 필요한가
//   `npm run check:live` 는 **노트북에서** 도는 스크립트다. 그런데 발표에서
//   막히는 건 대부분 **폰 쪽**이다 — 다른 Wi-Fi, 방화벽, IP 변경, 카카오 미등록.
//   폰에서 열어 볼 수 있는 화면이 하나도 없었다.
//
// 무엇을 보나
//   1) 이 기기가 실제로 어느 주소로 붙었는지 (초대 링크가 localhost 로 나가는 사고 방지)
//   2) 서버가 Neon 을 쓰는지 인메모리인지 · 키가 있는지
//   3) **이 기기가 등록해야 할** 카카오 Redirect URI (폰마다 다르다)
//   4) 기기 간 연동 — 여러 기기가 같은 코드로 들어와 **서로가 보이는지**
//
// ⚠️ 4번은 **실제 모임 API 를 그대로 쓴다.** 별도 경로를 만들면 "점검은 되는데
//    본 화면은 안 되는" 상황이 생긴다. 여기서 초록이면 발표 경로도 초록이다.
// ⚠️ 💰 외부 API 를 호출하지 않는다. 만들기·참여·조회만 한다(카카오·ODsay 0콜).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";

interface Status {
  kakao: boolean; kakaoJs: boolean; kakaoRedirect: string;
  odsay: boolean; tmap: boolean;
  db: { configured: boolean; ready: boolean; error?: string };
  store: string;
  ai: { ok: boolean; model: string };
}
interface Participant { id: string; name: string; isLeader: boolean }
interface State { name: string; participants: Participant[]; totalParticipants: number }

/** 기기를 사람이 알아볼 이름으로 — 목록에서 "누가 내 폰인지" 구분해야 한다 */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "아이폰"
    : /iPad/.test(ua) ? "아이패드"
    : /Android/.test(ua) ? "안드로이드"
    : /Windows/.test(ua) ? "윈도우"
    : /Mac/.test(ua) ? "맥"
    : "기기";
  const br = /Edg\//.test(ua) ? "엣지"
    : /SamsungBrowser/.test(ua) ? "삼성"
    : /Chrome\//.test(ua) ? "크롬"
    : /Safari\//.test(ua) ? "사파리"
    : "브라우저";
  return `${os} ${br}`;
}

const KEY = "moimer:health";

function Row({ ok, label, detail, warn }: { ok: boolean; label: string; detail?: string; warn?: boolean }) {
  return (
    <div className="between" style={{ padding: "7px 0", borderBottom: "1px solid var(--hair)" }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span className={"chip " + (ok ? "ok" : warn ? "warn" : "line")} style={{ maxWidth: "58%" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ok ? "✓ " : warn ? "⚠ " : "· "}{detail ?? (ok ? "정상" : "없음")}
        </span>
      </span>
    </div>
  );
}

export default function HealthPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const [room, setRoom] = useState<State | null>(null);
  const [beat, setBeat] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const codeRef = useRef("");

  // ── 설정 상태 ───────────────────────────────────────────────
  useEffect(() => {
    setOrigin(window.location.origin);
    // 이 기기가 이미 점검방에 들어가 있으면 이어서 본다
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as { code: string; id: string };
        setCode(s.code); setMyId(s.id); codeRef.current = s.code;
      }
    } catch { /* 저장이 깨졌으면 무시하고 새로 시작한다 */ }
    const q = new URLSearchParams(window.location.search).get("code");
    if (q) setInput(q.toUpperCase());

    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setErr("서버에 붙지 못했습니다 — 노트북에서 서버가 떠 있는지, 같은 Wi-Fi 인지 확인하세요."));
  }, []);

  // ── 기기 목록 폴링 (본 화면과 같은 1.8초) ────────────────────
  const poll = useCallback(async () => {
    const c = codeRef.current;
    if (!c) return;
    try {
      const r = await fetch(`/api/meeting?code=${c}`, { cache: "no-store" });
      if (!r.ok) return;
      setRoom(await r.json());
      setBeat((n) => n + 1);
    } catch { /* 폴링 실패는 다음 주기에 다시 시도한다 */ }
  }, []);

  useEffect(() => {
    if (!code) return;
    codeRef.current = code;
    poll();
    const t = setInterval(poll, 1800);
    return () => clearInterval(t);
  }, [code, poll]);

  async function act(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/meeting", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
      return j as { code: string; participantId: string };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function remember(c: string, id: string) {
    localStorage.setItem(KEY, JSON.stringify({ code: c, id }));
    setCode(c); setMyId(id); codeRef.current = c;
  }

  async function start() {
    const j = await act({
      action: "create", name: "🔧 기기 연동 점검", leaderName: deviceLabel(),
      // scope: "region" — 점검방은 지점 단계까지 갈 일이 없다(외부 호출 0)
      scope: "region", purposeCategory: "food",
    });
    if (j) remember(j.code, j.participantId);
  }

  async function join() {
    const c = input.trim().toUpperCase();
    if (!c) return;
    // 이름이 겹치면 서버가 막는다 — 같은 기종이 여러 대일 수 있으니 번호를 붙인다
    const j = await act({ action: "join", code: c, name: `${deviceLabel()} ${Math.floor(Math.random() * 90 + 10)}` });
    if (j) remember(c, j.participantId);
  }

  async function finish() {
    if (myId && code) await act({ action: "deleteMeeting", code, participantId: myId });
    localStorage.removeItem(KEY);
    setCode(""); setMyId(null); setRoom(null); codeRef.current = "";
  }

  function leave() {
    localStorage.removeItem(KEY);
    setCode(""); setMyId(null); setRoom(null); codeRef.current = "";
  }

  const joinUrl = code ? `${origin}/health?code=${code}` : "";
  const isLeader = !!room?.participants.find((p) => p.id === myId)?.isLeader;

  return (
    <main className="device pad" style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "8px 0 2px" }}>🔧 연결 점검</h1>
      <p className="faint" style={{ fontSize: 12, margin: "0 0 14px" }}>
        발표 전에 이 화면을 <b>기기마다</b> 열어 보세요.
      </p>

      {err && <div className="chip warn" style={{ marginBottom: 12 }}>⚠ {err}</div>}

      {/* ── 1. 이 기기 ─────────────────────────────────────────── */}
      <div className="card stack" style={{ gap: 0, marginBottom: 12 }}>
        <span className="eyebrow" style={{ marginBottom: 6 }}>1 · 이 기기</span>
        <Row ok={!!origin && !origin.includes("localhost")} warn={origin.includes("localhost")}
          label="접속한 주소" detail={origin.replace(/^https?:\/\//, "")} />
        <Row ok label="기기" detail={typeof navigator !== "undefined" ? deviceLabel() : ""} />
        {origin.includes("localhost") && (
          <p className="faint" style={{ fontSize: 11, margin: "8px 0 0" }}>
            ⚠️ <b>방장도 IP 주소로 접속하세요.</b> localhost 로 열면 여기서 만든 초대 링크가
            <b> localhost 로 나가서</b> 팀원 폰에서 안 열립니다.
          </p>
        )}
      </div>

      {/* ── 2. 서버 · DB · 키 ──────────────────────────────────── */}
      <div className="card stack" style={{ gap: 0, marginBottom: 12 }}>
        <span className="eyebrow" style={{ marginBottom: 6 }}>2 · 서버 · 데이터</span>
        {!st ? (
          <div className="row" style={{ gap: 8, padding: "8px 0" }}><span className="spinner" /> 확인 중…</div>
        ) : (
          <>
            <Row ok={st.db.ready} warn={!st.db.ready} label="데이터 저장"
              detail={st.db.ready ? "Neon (기기 간 공유)" : st.store === "memory" ? "인메모리 (재시작 시 소멸)" : "연결 실패"} />
            <Row ok={st.kakao} label="카카오 REST 키" />
            <Row ok={st.kakaoJs} label="카카오 지도 키" />
            <Row ok={st.odsay} warn={!st.odsay} label="ODsay (대중교통)" detail={st.odsay ? "정상" : "거리 추정으로 대체"} />
            <Row ok={st.tmap} warn={!st.tmap} label="TMAP (자차)" detail={st.tmap ? "정상" : "거리 추정으로 대체"} />
            <Row ok={st.ai?.ok} warn={!st.ai?.ok} label="AI 서버" detail={st.ai?.ok ? st.ai.model : "AI 추천 버튼 비활성"} />
            {!st.db.ready && st.db.error && (
              <p className="faint" style={{ fontSize: 10.5, margin: "8px 0 0", wordBreak: "break-all" }}>{st.db.error}</p>
            )}
          </>
        )}
      </div>

      {/* ── 3. 카카오 로그인 — 기기마다 등록 값이 다르다 ────────── */}
      {st && (
        <div className="card stack" style={{ gap: 6, marginBottom: 12 }}>
          <span className="eyebrow">3 · 이 기기의 카카오 Redirect URI</span>
          <p className="faint" style={{ fontSize: 11, margin: 0 }}>
            아래 값이 <b>개발자 콘솔 &gt; 카카오 로그인 &gt; Redirect URI</b> 목록에 글자 그대로 있어야
            이 기기에서 로그인이 됩니다.
          </p>
          <code style={{ fontSize: 11, background: "var(--panel2)", padding: "8px 10px", borderRadius: 8, wordBreak: "break-all" }}>
            {st.kakaoRedirect}
          </code>
          <button className="btn ghost sm" style={{ alignSelf: "flex-start" }}
            onClick={() => navigator.clipboard?.writeText(st.kakaoRedirect)}>
            📋 복사
          </button>
        </div>
      )}

      {/* ── 4. 기기 간 연동 ───────────────────────────────────── */}
      <div className="card stack" style={{ gap: 10 }}>
        <span className="eyebrow">4 · 기기 간 연동</span>

        {!code ? (
          <>
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>
              <b>노트북(또는 첫 기기)</b> 에서 [점검 시작] 을 누르고, 나온 링크를 단톡방에 뿌리세요.
              팀원이 링크를 열면 <b>서로의 기기가 아래 목록에 뜹니다.</b>
            </p>
            <button className="btn" disabled={busy} onClick={start}>
              {busy ? <span className="spinner" /> : "점검 시작 (이 기기가 첫 번째)"}
            </button>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" placeholder="점검 코드" value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())} />
              <button className="btn sm" disabled={busy || !input.trim()} onClick={join}>참여</button>
            </div>
          </>
        ) : (
          <>
            <div className="between">
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                연결된 기기 {room?.totalParticipants ?? 0}대
              </span>
              {/* 폴링이 살아 있다는 증거 — 숫자가 멈추면 연결이 끊긴 것이다 */}
              <span className="chip line" style={{ fontSize: 10 }}>● {beat}회 갱신</span>
            </div>

            <div className="stack" style={{ gap: 6 }}>
              {(room?.participants ?? []).map((p) => (
                <div key={p.id} className="row"
                  style={{
                    gap: 8, padding: "9px 11px", borderRadius: 10,
                    background: p.id === myId ? "var(--ac-soft)" : "var(--panel2)",
                    border: "1px solid var(--hair)",
                  }}>
                  <span style={{ fontSize: 14 }}>{p.isLeader ? "💻" : "📱"}</span>
                  <b style={{ fontSize: 13 }}>{p.name}</b>
                  {p.id === myId && <span className="chip ac" style={{ fontSize: 9 }}>이 기기</span>}
                </div>
              ))}
            </div>

            <div className="stack" style={{ gap: 4 }}>
              <span className="label" style={{ margin: 0 }}>다른 기기에서 열 주소</span>
              <code style={{ fontSize: 11, background: "var(--panel2)", padding: "8px 10px", borderRadius: 8, wordBreak: "break-all" }}>
                {joinUrl}
              </code>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(joinUrl)}>📋 링크 복사</button>
                <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(code)}>코드 {code}</button>
              </div>
            </div>

            <p className="faint" style={{ fontSize: 11, margin: 0 }}>
              다른 기기가 참여하면 <b>새로고침 없이</b> 위 목록에 나타나야 합니다.
              안 나타나면 그 기기는 서버에 못 붙은 것입니다(다른 Wi-Fi · 방화벽).
            </p>

            <div className="row" style={{ gap: 6 }}>
              {isLeader ? (
                <button className="btn ghost sm" disabled={busy} onClick={finish}>점검 끝 (기록 삭제)</button>
              ) : (
                <button className="btn ghost sm" onClick={leave}>이 기기만 나가기</button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
