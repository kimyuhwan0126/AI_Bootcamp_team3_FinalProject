"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MeetingState, ChatMsg } from "@/lib/types";
import { getIdentities, getActive, setActive, addIdentity, type Identity } from "@/lib/identity";
import KakaoMap from "@/app/components/KakaoMap";

const DEV = process.env.NODE_ENV !== "production";
const DBG_STATIONS = ["강남역", "홍대입구", "잠실", "사당", "건대입구", "수원역", "노원", "부천"];

// 지도 좌표 → 박스 내 위치(%)
const B = { latMin: 37.2, latMax: 37.7, lngMin: 126.7, lngMax: 127.2 };
function pos(lat: number, lng: number) {
  const x = Math.min(94, Math.max(6, ((lng - B.lngMin) / (B.lngMax - B.lngMin)) * 100));
  const y = Math.min(90, Math.max(10, (1 - (lat - B.latMin) / (B.latMax - B.latMin)) * 100));
  return { left: `${x}%`, top: `${y}%` };
}

export default function MeetingClient({ code }: { code: string }) {
  const [state, setState] = useState<MeetingState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [me, setMe] = useState<Identity | null>(null);
  const [ids, setIds] = useState<Identity[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [dbg, setDbg] = useState(false);
  const [mapFallback, setMapFallback] = useState(false); // 카카오맵 로드 실패 시 스키매틱으로

  // origin form
  const [origin, setOrigin] = useState("");
  const [transport, setTransport] = useState<"transit" | "car">("transit");

  // chat form
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);

  const toastRef = useRef<any>(null);
  const flash = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // load identities
  useEffect(() => {
    setIds(getIdentities(code));
    setMe(getActive(code));
  }, [code]);

  // poll state (채팅도 같은 폴링으로 실시간 반영)
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/meeting?code=${code}`, { cache: "no-store" });
      if (r.status === 404) {
        setNotFound(true);
        return;
      }
      const d = await r.json();
      setState(d);
    } catch {
      /* transient */
    }
  }, [code]);

  useEffect(() => {
    load();
    const t = setInterval(load, 1800);
    return () => clearInterval(t);
  }, [load]);

  // 새 채팅 메시지 오면 스크롤 하단 고정
  useEffect(() => {
    const last = state?.chat?.[state.chat.length - 1]?.id ?? null;
    if (last && last !== lastMsgIdRef.current) {
      lastMsgIdRef.current = last;
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [state?.chat]);

  async function act(body: any, ok?: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "실패");
      if (ok) flash(ok);
      await load();
      return d;
    } catch (e: any) {
      flash("⚠ " + e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // 채팅 전송 (버튼/칩 공용) — 부담을 낮추는 핵심 입력
  async function sendChat(text: string) {
    const t = text.trim();
    if (!t || !me) return;
    setChatText("");
    try {
      await act({ action: "chat", participantId: me.id, text: t });
    } catch {
      setChatText(t); // 실패 시 입력 복원
    }
  }

  // ── 디버그: 일괄 처리 ──
  async function bulk(bodies: any[]) {
    for (const b of bodies) {
      await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...b }),
      });
    }
    await load();
  }
  async function dbgAutoOrigins() {
    if (!state) return;
    const bodies = state.participants
      .map((p, i) =>
        p.lat == null
          ? { action: "origin", participantId: p.id, origin: DBG_STATIONS[i % DBG_STATIONS.length], transport: i % 3 === 0 ? "car" : "transit" }
          : null
      )
      .filter(Boolean);
    if (bodies.length === 0) return flash("이미 전원 등록됨");
    await bulk(bodies as any[]);
    flash(`출발지 ${bodies.length}명 자동 등록`);
  }
  // 의견 자동 발화 — 합의(전원 1순위 지지) / 갈림(후보 분산 지지)
  async function dbgAutoOpinions(mode: "consensus" | "split") {
    if (!state || state.stage !== "chat") return flash("대화 단계에서 사용 가능");
    const names =
      state.aiPhase === "region" ? state.regions.map((r) => r.name) : state.places.map((p) => p.name);
    if (names.length === 0) return flash("후보가 없어요");
    const bodies = state.participants.map((p, i) => ({
      action: "chat",
      participantId: p.id,
      text:
        mode === "consensus"
          ? `${names[0]} 좋아요!`
          : `저는 ${names[i % names.length]}가 좋아요`,
    }));
    await bulk(bodies);
    flash(`전원 의견 발화 · ${mode === "consensus" ? "합의" : "갈림"}`);
  }

  const meRow = useMemo(
    () => state?.participants.find((p) => p.id === me?.id),
    [state, me]
  );
  useEffect(() => {
    if (meRow) {
      setOrigin(meRow.origin || "");
      setTransport((meRow.transport as any) || "transit");
    }
  }, [meRow?.id]);

  if (notFound) {
    return (
      <main className="device pad" style={{ paddingTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🔍</div>
        <h2 className="sec" style={{ marginTop: 10 }}>모임을 찾을 수 없어요</h2>
        <p className="muted" style={{ fontSize: 14 }}>코드 <b>{code}</b> 의 모임이 없어요.</p>
        <Link href="/" className="btn" style={{ marginTop: 20, textDecoration: "none" }}>홈으로</Link>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="device pad" style={{ paddingTop: 80, textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto", borderColor: "rgba(47,111,237,.3)", borderTopColor: "#2f6fed" }} />
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>모임 불러오는 중…</p>
      </main>
    );
  }

  const isLeader = !!meRow?.isLeader;
  const stage = state.stage;
  const located = state.participants.filter((p) => p.lat != null);
  const centroid =
    located.length > 0
      ? {
          lat: located.reduce((s, p) => s + (p.lat as number), 0) / located.length,
          lng: located.reduce((s, p) => s + (p.lng as number), 0) / located.length,
        }
      : null;
  const myName = meRow?.name;

  function switchTo(id: string) {
    setActive(code, id);
    setMe(getActive(code));
    load();
  }

  const stepIndex = stage === "main" ? 0 : stage === "result" ? 2 : 1;

  // 빠른답변 칩 (탭 1번 = 의견 전달, 타이핑 부담 제거)
  const quickChips: string[] =
    stage === "chat"
      ? state.aiPhase === "region"
        ? [...state.regions.slice(0, 3).map((r) => `${r.name} 좋아요!`), "아무데나 좋아요 👍", "더 가까운 곳 없어요? 🥲"]
        : [...state.places.slice(0, 3).map((p) => `${p.name} 좋아요!`), "아무데나 좋아요 👍", "다른 종류는 없어요?"]
      : [];

  return (
    <main className="device" style={{ paddingBottom: isLeader ? 72 : 24 }}>
      {/* App bar */}
      <div className="appbar">
        <div className="between">
          <div className="row" style={{ gap: 9 }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--ink-faint)", fontSize: 20 }}>←</Link>
            <div>
              <h1>{state.name}</h1>
              <div className="faint" style={{ fontSize: 11 }}>
                코드 <b className="tnum">{state.code}</b> · 정원 {state.headcount}명 · {state.totalParticipants}명 참여
              </div>
            </div>
          </div>
          {isLeader ? <span className="chip leader">👑 방장</span> : <span className="chip line">🙋 참가자</span>}
        </div>

        {/* participant switcher (테스트용 다중 참가자) */}
        <div className="switcher" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800 }} className="faint">현재</span>
          <select value={me?.id || ""} onChange={(e) => switchTo(e.target.value)}>
            {ids.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} {i.isLeader ? "(방장)" : ""}
              </option>
            ))}
          </select>
          <button className="btn ghost sm" onClick={() => setShowAdd(true)}>+ 참가자</button>
        </div>
      </div>

      {/* 정원 초과 경고 배너 */}
      {state.overCapacity && (
        <div style={{ margin: "10px 16px 0", padding: "10px 13px", borderRadius: 12, background: "var(--warn-soft)", border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)", display: "flex", gap: 9, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div className="grow">
            <b style={{ fontSize: 12.5, color: "var(--warn)" }}>정원 초과 · {state.totalParticipants}/{state.headcount}명</b>
            <div className="faint" style={{ fontSize: 11 }}>정원({state.headcount}명)을 넘겼어요. 신규 참여는 자동으로 차단됩니다.</div>
          </div>
        </div>
      )}

      {/* stepper */}
      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="stepper">
          {["① 메인 · 출발지", "② AI 대화", "③ 결과"].map((s, i) => (
            <div key={i} className={"s " + (i === stepIndex ? "on" : i < stepIndex ? "done" : "")}>
              {s}
              <div className="bar" />
            </div>
          ))}
        </div>
      </div>

      <div className="pad stack" style={{ gap: 14 }}>
        {/* ── MAP (always) — 카카오맵, 로드 실패 시 스키매틱 폴백 ── */}
        <div className="map">
          {!mapFallback ? (
            <KakaoMap
              pins={located.map((p) => ({
                lat: p.lat as number,
                lng: p.lng as number,
                label: p.name,
                emoji: p.transport === "car" ? "🚗" : "🧑",
              }))}
              center={
                state.winnerRegion
                  ? { lat: state.winnerRegion.lat, lng: state.winnerRegion.lng, label: state.winnerRegion.name }
                  : centroid
                  ? { lat: centroid.lat, lng: centroid.lng, label: "예상 중간지점" }
                  : null
              }
              onFail={() => setMapFallback(true)}
            />
          ) : (
            <>
              <div className="blob" style={{ left: -14, top: 30, width: 110, height: 66, background: "var(--park)" }} />
              <div className="blob" style={{ right: -18, bottom: 20, width: 130, height: 80, background: "var(--water)" }} />
              {located.map((p) => {
                const pp = pos(p.lat as number, p.lng as number);
                return (
                  <div key={p.id} className="pin" style={{ left: pp.left, top: pp.top }}>
                    {p.transport === "car" ? "🚗" : "🧑"}
                    <span className="tip">{p.name}</span>
                  </div>
                );
              })}
              {(state.winnerRegion || centroid) && (
                <div
                  className="cpin"
                  style={{
                    left: pos(state.winnerRegion?.lat ?? centroid!.lat, state.winnerRegion?.lng ?? centroid!.lng).left,
                    top: pos(state.winnerRegion?.lat ?? centroid!.lat, state.winnerRegion?.lng ?? centroid!.lng).top,
                  }}
                >
                  <span className="lab">{state.winnerRegion ? state.winnerRegion.name : "예상 중간지점"}</span>
                  <div className="pulse" />
                  <div className="body"><b>중간</b></div>
                </div>
              )}
            </>
          )}
          {located.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <span className="chip line">출발지를 등록하면 지도에 표시돼요</span>
            </div>
          )}
        </div>

        {/* ══════════════ STAGE: MAIN ══════════════ */}
        {stage === "main" && (
          <>
            <div className="card stack" style={{ gap: 12 }}>
              <div>
                <span className="eyebrow">1. 메인 · 내 출발지</span>
                <h2 className="sec" style={{ marginTop: 4 }}>어디서 출발하세요?</h2>
                <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
                  <b>{myName}</b> 님의 출발지를 등록하면 AI가 공평한 중간지역을 찾아요.
                </p>
              </div>
              <input
                className="input"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="예: 강남역, 사당, 홍대입구…"
              />
              <div>
                <label className="label">이동 수단</label>
                <div className="seg">
                  <button className={transport === "transit" ? "on" : ""} onClick={() => setTransport("transit")}>🚌 대중교통</button>
                  <button className={transport === "car" ? "on" : ""} onClick={() => setTransport("car")}>🚗 자차</button>
                </div>
              </div>
              <button
                className="btn"
                disabled={busy || !origin.trim()}
                onClick={() => act({ action: "origin", participantId: me?.id, origin, transport }, "출발지를 등록했어요")}
              >
                {meRow?.origin ? "출발지 수정" : "출발지 등록"}
              </button>
            </div>

            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <span className="eyebrow">참여자 현황</span>
                <span className="faint" style={{ fontSize: 11 }}>{state.originsSet}/{state.totalParticipants} 출발지 등록</span>
              </div>
              {state.participants.map((p) => (
                <div className="row" key={p.id} style={{ gap: 10 }}>
                  <div className={"av" + (p.transport === "car" ? " car" : "")}>{p.name.slice(0, 1)}</div>
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <b style={{ fontSize: 13 }}>{p.name}</b>
                      {p.isLeader && <span className="chip leader" style={{ fontSize: 9 }}>방장</span>}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {p.origin ? `${p.transport === "car" ? "🚗" : "🚌"} ${p.origin}` : "출발지 미등록"}
                    </div>
                  </div>
                  {p.lat != null ? <span className="chip ok">등록</span> : <span className="chip line">대기</span>}
                </div>
              ))}
            </div>

            {isLeader ? (
              <div className="card center stack" style={{ gap: 8 }}>
                <span style={{ fontSize: 26 }}>💬</span>
                <b style={{ fontSize: 14 }}>AI와 수다 떨듯 정해요</b>
                <p className="muted" style={{ fontSize: 12 }}>
                  투표 대신 AI 도우미가 대화를 이끌어요. 편하게 의견만 말하면 AI가 알아서 모아 확정해요.
                </p>
              </div>
            ) : (
              <p className="hint">방장이 대화를 시작하면 AI 도우미와 함께 장소를 정할 수 있어요.</p>
            )}
          </>
        )}

        {/* ══════════════ STAGE: CHAT (투표 대체 · AI 파실리테이터) ══════════════ */}
        {stage === "chat" && (
          <>
            {/* 후보 카드 — 현재 논의 대상 요약(탭하면 지지 의견 전송) */}
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  <span className="eyebrow">
                    2. AI 대화 · {state.aiPhase === "region" ? "1차 중간지역" : "2차 장소"}
                  </span>
                  <h2 className="sec" style={{ marginTop: 4 }}>
                    {state.aiPhase === "region" ? "어디서 만날까요?" : `${state.winnerRegion?.name}에서 어디로?`}
                  </h2>
                </div>
                <span className="chip ac">🤖 AI 진행</span>
              </div>

              {state.aiPhase === "region" ? (
                <div className="candmini">
                  {state.regions.map((r) => (
                    <button
                      key={r.id}
                      className={"cc" + (state.winnerRegion?.id === r.id ? " win" : "")}
                      onClick={() => sendChat(`${r.name} 좋아요!`)}
                      title="탭하면 지지 의견을 보내요"
                    >
                      <b>{r.name}</b>
                      <span>최대 {r.maxMin}분 · 편차 {r.devMin}분</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="candmini">
                  {state.places.map((p) => (
                    <button
                      key={p.id}
                      className={"cc" + (state.winnerPlace?.id === p.id ? " win" : "")}
                      onClick={() => sendChat(`${p.name} 좋아요!`)}
                      title="탭하면 지지 의견을 보내요"
                    >
                      <b>{p.emoji} {p.name}</b>
                      <span>{p.category} · {p.distanceM}m{p.rating > 0 ? ` · ⭐${p.rating}` : ""}{p.reservable ? " · 예약가능" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
                후보를 탭하거나 채팅으로 편하게 말하면 AI가 의견을 모아 확정해요. 다른 동네를 제안해도 돼요!
              </p>
            </div>

            {/* 채팅 패널 */}
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <span className="eyebrow">모임 채팅</span>
                {state.aiBusy && (
                  <span className="aithink">
                    🤖 AI 생각 중 <span className="dots"><i /><i /><i /></span>
                  </span>
                )}
              </div>

              {/* AI가 대화에서 수집한 모임 정보 (폼 없이 채워짐) */}
              <PrefChips prefs={state.prefs} />


              <div className="chatlog">
                {state.chat.map((c: ChatMsg) => {
                  const cls =
                    c.role === "system" ? "sys" : c.role === "ai" ? "ai" : c.name === myName ? "me" : "other";
                  return (
                    <div key={c.id} className={"cmsg " + cls}>
                      {(cls === "other" || cls === "ai") && (
                        <span className="who">{cls === "ai" ? "🤖 AI 도우미" : c.name}</span>
                      )}
                      <div className="bub">{c.text}</div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* 빠른답변 칩 — 타이핑 없이 탭 1번으로 의견 전달 */}
              <div className="chips">
                {quickChips.map((q) => (
                  <button key={q} disabled={busy} onClick={() => sendChat(q)}>{q}</button>
                ))}
              </div>

              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input grow"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendChat(chatText); }}
                  placeholder="편하게 의견을 말해보세요…"
                />
                <button className="btn sm" disabled={busy || !chatText.trim()} onClick={() => sendChat(chatText)}>
                  전송
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══════════════ STAGE: RESULT ══════════════ */}
        {stage === "result" && (
          <>
            <div className="card center stack" style={{ gap: 6 }}>
              <span style={{ fontSize: 34 }}>🎉</span>
              <span className="eyebrow">3. 결과 · 추천장소 확정</span>
              {state.winnerPlace ? (
                <>
                  <h2 className="sec" style={{ fontSize: 20 }}>{state.winnerPlace.emoji} {state.winnerPlace.name}</h2>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {state.winnerRegion?.name} · {state.winnerPlace.category}
                    {state.winnerPlace.rating > 0 ? ` · ⭐ ${state.winnerPlace.rating}` : ""} · {state.winnerPlace.distanceM}m
                  </p>
                  {(state.prefs.dateText || state.prefs.timeText) && (
                    <span className="chip ok" style={{ fontSize: 11 }}>
                      📅 {[state.prefs.dateText, state.prefs.timeText].filter(Boolean).join(" ")}
                    </span>
                  )}
                  <div className="row" style={{ gap: 6, justifyContent: "center" }}>
                    <span className="chip ac" style={{ fontSize: 10.5 }}>💬 AI 대화로 함께 정했어요</span>
                    {state.winnerPlace.url && (
                      <a
                        className="chip line"
                        style={{ fontSize: 10.5, textDecoration: "none" }}
                        href={state.winnerPlace.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        🗺️ 카카오맵에서 보기
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">확정된 장소가 없어요.</p>
              )}
            </div>

            <div className="card stack" style={{ gap: 8 }}>
              <span className="eyebrow">참여자 {state.totalParticipants}명</span>
              {state.participants.map((p) => (
                <div className="row" key={p.id} style={{ gap: 10 }}>
                  <div className={"av" + (p.transport === "car" ? " car" : "")}>{p.name.slice(0, 1)}</div>
                  <div className="grow"><b style={{ fontSize: 13 }}>{p.name}</b>{p.isLeader && <span className="chip leader" style={{ fontSize: 9, marginLeft: 6 }}>방장</span>}</div>
                  <span className="faint" style={{ fontSize: 11 }}>{p.origin || "-"}</span>
                </div>
              ))}
            </div>

            {/* 유료서비스: 가게 예약 > 결제(선입금) */}
            {state.winnerPlace && (
              <div className="card stack" style={{ gap: 10 }}>
                <div className="between">
                  <span className="eyebrow">유료서비스 · 가게 예약</span>
                  <span className="badge-pay">💳 선입금</span>
                </div>
                {state.reservation ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="chip ok" style={{ alignSelf: "flex-start" }}>✓ 예약 완료 (모의결제)</div>
                    <div className="kv"><span className="k">가게</span><span className="v">{state.winnerPlace.name}</span></div>
                    <div className="kv"><span className="k">인원</span><span className="v tnum">{state.reservation.headcount}명</span></div>
                    <div className="kv"><span className="k">선입금</span><span className="v tnum">{state.reservation.depositPerHead.toLocaleString()}원 × {state.reservation.headcount} = {state.reservation.total.toLocaleString()}원</span></div>
                  </div>
                ) : state.winnerPlace.reservable ? (
                  <>
                    <div className="kv"><span className="k">선입금</span><span className="v tnum">1인 {state.winnerPlace.depositPerHead.toLocaleString()}원 × {state.headcount}명</span></div>
                    <div className="between">
                      <b className="tnum" style={{ fontSize: 15 }}>합계 {(state.winnerPlace.depositPerHead * state.headcount).toLocaleString()}원</b>
                    </div>
                    <button className="btn ok" disabled={!isLeader} onClick={() => setShowReserve(true)}>
                      {isLeader ? "예약 · 선입금 결제 (모의)" : "방장만 결제할 수 있어요"}
                    </button>
                  </>
                ) : (
                  <p className="muted" style={{ fontSize: 12.5 }}>이 가게는 예약 대상이 아니에요.</p>
                )}
              </div>
            )}

            {/* 부가기능 */}
            <div className="card stack" style={{ gap: 8 }}>
              <span className="eyebrow">부가기능</span>
              <button className="btn ghost" onClick={() => downloadIcs(state)}>📅 캘린더에 추가 (.ics)</button>
              <button
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/m/${state.code}`);
                  flash("모임 링크를 복사했어요");
                }}
              >
                🔗 모임 링크 공유
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Leader control bar ── */}
      {isLeader && (
        <div className="leaderbar">
          {stage === "main" && (
            <button
              className="btn"
              disabled={busy || state.originsSet < 1}
              onClick={() => act({ action: "openChat", participantId: me?.id }, "AI 대화를 시작했어요")}
            >
              💬 AI와 함께 정하기 · 대화 시작
            </button>
          )}
          {stage === "chat" && (
            <>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => setShowManual(true)}
                title="AI 없이 방장이 직접 확정 (안전망)"
              >
                ✍ 직접 확정
              </button>
              <button
                className="btn"
                disabled={busy || state.aiBusy}
                onClick={() => act({ action: "aiDecide", participantId: me?.id }, "AI에게 결정을 요청했어요")}
              >
                🤖 AI에게 결정 요청
              </button>
            </>
          )}
          {stage === "result" && (
            <>
              <button className="btn ghost" disabled={busy} onClick={() => act({ action: "reopen", participantId: me?.id, target: "place" }, "장소 논의를 다시 열었어요")}>
                🔄 장소 다시 논의
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => act({ action: "backToMain", participantId: me?.id }, "메인으로 돌아갔어요")}>
                처음부터
              </button>
            </>
          )}
        </div>
      )}

      {/* 직접 확정 모달 (방장 수동 오버라이드 — AI 장애 시 안전망) */}
      {showManual && stage === "chat" && (
        <div className="backdrop" onClick={() => setShowManual(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 16 }}>✍ 방장 직접 확정</b>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 12px" }}>
              AI 진행이 어렵거나 논의가 길어질 때, 방장이 직접 {state.aiPhase === "region" ? "중간지역" : "장소"}을(를) 확정할 수 있어요.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {(state.aiPhase === "region" ? state.regions : state.places).map((c: any) => (
                <button
                  key={c.id}
                  className="btn ghost"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  disabled={busy}
                  onClick={async () => {
                    await act(
                      { action: "confirmManual", participantId: me?.id, target: state.aiPhase, id: c.id },
                      `${c.name} 확정!`
                    );
                    setShowManual(false);
                  }}
                >
                  {state.aiPhase === "region"
                    ? `${c.name} — 최대 ${c.maxMin}분 · 편차 ${c.devMin}분`
                    : `${c.emoji} ${c.name} (${c.category}${c.rating > 0 ? ` · ⭐${c.rating}` : ""})`}
                </button>
              ))}
              <button className="btn ghost" onClick={() => setShowManual(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* Add-participant modal (테스트용) */}
      {showAdd && <AddParticipant code={code} onClose={() => setShowAdd(false)} onAdded={(id) => { setIds(getIdentities(code)); setMe(getActive(code)); setShowAdd(false); load(); flash(`${id.name} 님으로 참여했어요`); }} />}

      {/* Reserve modal */}
      {showReserve && state.winnerPlace && (
        <div className="backdrop" onClick={() => setShowReserve(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ marginBottom: 6 }}>
              <b style={{ fontSize: 16 }}>가게 예약 · 선입금</b>
              <span className="badge-pay">모의결제</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
              실제 결제가 아닌 <b>프로토타입 모의 결제</b>예요. 카드 정보는 요구하지 않습니다.
            </p>
            <div className="card tight stack" style={{ gap: 4, marginBottom: 12 }}>
              <div className="kv"><span className="k">가게</span><span className="v">{state.winnerPlace.emoji} {state.winnerPlace.name}</span></div>
              <div className="kv"><span className="k">인원</span><span className="v tnum">{state.headcount}명</span></div>
              <div className="kv"><span className="k">1인 선입금</span><span className="v tnum">{state.winnerPlace.depositPerHead.toLocaleString()}원</span></div>
              <div className="divider" />
              <div className="kv"><span className="k">합계</span><span className="v tnum" style={{ color: "var(--ac)", fontSize: 15 }}>{(state.winnerPlace.depositPerHead * state.headcount).toLocaleString()}원</span></div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setShowReserve(false)}>취소</button>
              <button
                className="btn ok"
                disabled={busy}
                onClick={async () => {
                  await act({ action: "reserve", participantId: me?.id, placeId: state.winnerPlace!.id }, "예약·선입금 완료 (모의)");
                  setShowReserve(false);
                }}
              >
                {(state.winnerPlace.depositPerHead * state.headcount).toLocaleString()}원 결제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 디버그 위젯 (현재 모임 빠른 채우기) ── */}
      {DEV && (
        <div style={{ position: "fixed", right: 16, bottom: isLeader ? 78 : 20, zIndex: 55, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {dbg && (
            <div className="card tight" style={{ width: 210, boxShadow: "var(--shadow)" }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>🐞 빠른 채우기 · {state.stage}</div>
              <div className="stack" style={{ gap: 6 }}>
                <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={dbgAutoOrigins}>📍 출발지 전원 자동</button>
                {state.stage === "chat" ? (
                  <>
                    <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={() => dbgAutoOpinions("consensus")}>🗣️ 전원 합의 발화</button>
                    <button className="btn ghost sm" style={{ width: "100%" }} disabled={busy} onClick={() => dbgAutoOpinions("split")}>🎭 전원 의견 갈림</button>
                  </>
                ) : (
                  <div className="faint" style={{ fontSize: 10.5 }}>대화 단계에서 자동 발화 사용 가능</div>
                )}
                {isLeader && <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>단계 이동은 하단 방장 바에서</div>}
              </div>
            </div>
          )}
          <button
            onClick={() => setDbg((v) => !v)}
            title="디버그"
            style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid var(--hair2)", background: "var(--panel)", boxShadow: "var(--shadow)", fontSize: 20 }}
          >
            🐞
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

// ── AI가 수집한 모임 정보 칩 ──
function PrefChips({ prefs }: { prefs: MeetingState["prefs"] }) {
  const items: [string, string | undefined][] = [
    ["🎯", prefs.purpose],
    ["✨", prefs.mood],
    ["📅", [prefs.dateText, prefs.timeText].filter(Boolean).join(" ") || undefined],
    ["💰", prefs.budget],
    ["🍺", prefs.alcohol],
    ["🥗", prefs.dietary],
  ];
  const filled = items.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {filled.map(([icon, v]) => (
        <span key={icon} className="chip line" style={{ fontSize: 10.5 }}>
          {icon} {v}
        </span>
      ))}
    </div>
  );
}

// ── .ics 캘린더 파일 생성 (AI가 대화에서 수집한 날짜·시간 사용) ──
function downloadIcs(state: MeetingState) {
  // AI 수집 일정 → DTSTART. 없으면 다음 주 토요일 19시 기본값.
  let start: Date;
  if (state.prefs.dateIso) {
    const [h, m] = (state.prefs.timeHhmm || "19:00").split(":").map(Number);
    start = new Date(`${state.prefs.dateIso}T00:00:00`);
    start.setHours(h || 19, m || 0, 0, 0);
  } else {
    start = new Date();
    start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7)); // 다음 토요일
    start.setHours(19, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` +
    `T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const place = state.winnerPlace ? `${state.winnerPlace.name} (${state.winnerRegion?.name})` : state.name;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moimer//KO",
    "BEGIN:VEVENT",
    `UID:${state.code}@moimer`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${state.name}`,
    `LOCATION:${place}`,
    `DESCRIPTION:모이머 AI 대화로 정한 모임 · 참여자 ${state.totalParticipants}명`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moimer-${state.code}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 테스트용 참가자 추가 모달 ──
function AddParticipant({ code, onClose, onAdded }: { code: string; onClose: () => void; onAdded: (id: Identity) => void }) {
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
