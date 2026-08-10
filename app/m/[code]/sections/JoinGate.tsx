"use client";

// ─────────────────────────────────────────────────────────────
// 참여 게이트 — 초대 링크로 들어왔는데 아직 신원이 없을 때 (설계_v19.md §4-⑤)
//
//  v19: **링크 진입 = 참여 폼**이다. 이름·출발지·이동수단이 **원스텝 필수**이고,
//  PIN 은 비로그인만 받는다(v15). 정원 8명 초과·이름 중복은 서버가 거부한다.
//
// ⚠️ 이 화면이 없으면 팀원이 카톡 링크를 눌렀을 때 **뭘 해야 할지 모른다** —
//    모임 화면이 그냥 열리고 자기 자리가 없다. 발표 시연 3단계가 여기서 멈춘다.
//
// ⚠️ 참여와 출발지 등록을 **한 번에** 끝낸다. 참여만 시키고 출발지를 나중에 받으면
//    "출발지 미등록" 상태의 참가자가 쌓여 중간지점이 계산되지 않는다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { addIdentity, type Identity } from "@/lib/identity";

const PROFILE_KEY = "moimer:v8:profile";

export interface JoinGateProps {
  code: string;
  /** 모임 이름 — 어디에 들어가는지 보여준다 */
  meetingName?: string;
  onJoined: (id: Identity) => void;
}

export default function JoinGate({ code, meetingName, onJoined }: JoinGateProps) {
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [transport, setTransport] = useState<"transit" | "car">("transit");
  const [pin, setPin] = useState("");
  const [recover, setRecover] = useState(false);
  const [dup, setDup] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // v19 §4-③: 내정보 기본값이 있으면 자동으로 채운다 (조건은 '값이 있으면' 하나뿐)
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (p?.savedPlaces?.[0]) setOrigin(String(p.savedPlaces[0]));
      if (p?.transport === "car") setTransport("car");
      if (p?.pin) setPin(String(p.pin));
    } catch {
      /* 프로필이 없거나 깨졌으면 빈 채로 둔다 */
    }
  }, []);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, ...body }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "요청 실패");
    return d;
  }

  async function go() {
    setErr(null);
    const nm = name.trim();
    if (!nm) return setErr("이름을 입력해 주세요.");
    if (!recover && !origin.trim()) return setErr("출발지를 입력해 주세요.");
    setBusy(true);
    try {
      // ── 복구: 이름 + PIN 으로 기존 자리를 되찾는다 (v15·v16) ──
      if (recover) {
        const d = await post({ action: "recover", name: nm, pin });
        const id: Identity = { id: d.participantId, name: nm, isLeader: !!d.isLeader };
        addIdentity(code, id);
        onJoined(id);
        return;
      }

      const d = await post({ action: "join", name: nm, pin: pin || null, transport });
      const id: Identity = { id: d.participantId, name: nm, isLeader: false };
      addIdentity(code, id);
      // 출발지까지 이어서 등록한다 — 원스텝(v11)
      try {
        await post({ action: "origin", participantId: d.participantId, origin: origin.trim(), transport });
      } catch {
        /* 지오코딩 실패해도 참여 자체는 끝났다 — 모임 화면에서 다시 넣을 수 있다 */
      }
      onJoined(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "요청 실패";
      setErr(msg);
      // v4: 이름이 겹치면 별칭을 붙이거나, 본인이면 PIN 으로 복구한다
      if (msg.includes("이미") && msg.includes("있어요")) setDup(true);
      setBusy(false);
    }
  }

  return (
    <main className="device" style={{ paddingBottom: 40 }}>
      <div className="pad stack" style={{ gap: 14, paddingTop: 24 }}>
        <div className="card stack" style={{ gap: 12 }}>
          <div>
            <span className="eyebrow">모임 참여</span>
            <h2 className="sec" style={{ marginTop: 4 }}>
              {recover ? "내 자리 되찾기" : meetingName || "초대받은 모임"}
            </h2>
            <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 0" }}>
              {recover
                ? "예전에 참여했다면 이름과 PIN으로 그 자리를 되찾을 수 있어요."
                : "초대 링크로 들어왔어요 · 비밀번호는 없어요."}
            </p>
          </div>

          <div>
            <label className="label">이름</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setDup(false); }}
              placeholder="예: 김철수"
              autoFocus
            />
          </div>

          {!recover && (
            <>
              <div>
                <label className="label">출발지</label>
                <input
                  className="input"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="예: 강남역"
                  onKeyDown={(e) => e.key === "Enter" && void go()}
                />
              </div>

              <div>
                <label className="label">이동수단</label>
                <div className="row" style={{ gap: 6 }}>
                  {([["transit", "🚌 대중교통"], ["car", "🚗 자차"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      className={"btn sm grow" + (transport === v ? "" : " ghost")}
                      onClick={() => setTransport(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="label">
              개인 PIN {recover ? "" : "(선택 · 나중에 자리 되찾기용)"}
            </label>
            <input
              className="input"
              value={pin}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="숫자 4자리"
            />
            {!recover && (
              <p className="faint" style={{ fontSize: 10.5, margin: "4px 0 0" }}>
                기기가 바뀌거나 브라우저 기록이 지워졌을 때 이 PIN으로 돌아올 수 있어요.
              </p>
            )}
          </div>

          {err && <div className="chip warn" style={{ alignSelf: "flex-start" }}>⚠ {err}</div>}

          {dup && !recover && (
            <div className="stack" style={{ gap: 6 }}>
              <p className="faint" style={{ fontSize: 11, margin: 0 }}>
                같은 이름이 이미 있어요. <b>다른 사람</b>이면 이름 뒤에 별칭을 붙이고,
                <b> 본인</b>이면 아래로 자리를 되찾으세요.
              </p>
              <button className="btn ghost" onClick={() => { setRecover(true); setErr(null); }}>
                내 자리 되찾기 (이름 + PIN)
              </button>
            </div>
          )}

          <button className="btn" disabled={busy || !name.trim() || (recover && !pin.trim())} onClick={() => void go()}>
            {busy ? <span className="spinner" /> : recover ? "되찾기" : "참여하기"}
          </button>

          {recover && (
            <button className="btn ghost" onClick={() => { setRecover(false); setErr(null); }}>
              ← 새로 참여하기
            </button>
          )}

          <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
            한 모임에는 8명까지 참여할 수 있어요.
          </p>
        </div>
      </div>
    </main>
  );
}
