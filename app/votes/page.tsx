"use client";

// ─────────────────────────────────────────────────────────────
// v8 투표함 — 내 모임의 실제 거점/가게 후보로 투표
//  후보는 /api/meeting 의 regions·places 를 그대로 사용한다.
//  (하드코딩 목업 제거 — 모임이 없으면 빈 상태를 보여준다)
//  투표는 서버(/api/meeting action=vote)에 집계되어 모임 상세 화면과 공유된다.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import BottomNav from "../components/v8/BottomNav";
import V8Header from "../components/v8/V8Header";
import StepIcons from "../components/v8/StepIcons";
import { getActive } from "@/lib/identity";
import type { MeetingState } from "@/lib/types";

// localStorage 에 저장된 내 모임 코드들
function myCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    const m = k.match(/^moimer:([A-Z0-9]{4,8})$/);
    if (m) codes.push(m[1]);
  }
  return codes;
}

export default function VotesPage() {
  const [meetings, setMeetings] = useState<MeetingState[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"region" | "shop">("region");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const states = await Promise.all(
      myCodes().map(async (c) => {
        try {
          const r = await fetch(`/api/meeting?code=${c}`, { cache: "no-store" });
          return r.ok ? ((await r.json()) as MeetingState) : null;
        } catch {
          return null;
        }
      })
    );
    setMeetings(states.filter((s): s is MeetingState => s !== null));
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // 다른 참여자의 투표·방장의 확정이 이 화면에 앉아 있는 동안에도 반영되도록
    // 모임 상세 화면과 같은 주기로 폴링한다.
    const t = setInterval(reload, 1800);
    return () => clearInterval(t);
  }, [reload]);

  const m = meetings[selected] || null;
  const regions = m?.regions ?? [];
  const places = m?.places ?? [];

  // 실제 진행 단계 — 이전엔 tab(로컬 UI 상태)이 항상 "지역 투표"로 시작해서,
  // 모임이 이미 확정된 뒤에도 투표함 탭엔 "거점 투표가 진행 중"인 것처럼
  // 보이고, 투표/확정 버튼이 계속 눌리는 문제가 있었다(실제로는 아무 것도
  // 확정하지 않는 죽은 버튼이었다). 이제 서버 상태를 그대로 따른다.
  const realStep: 0 | 1 | 2 = !m
    ? 0
    : m.stage === "result"
    ? 2
    : m.aiPhase === "place"
    ? 1
    : 0;
  const decided = m?.stage === "result";

  // 모임을 바꾸거나(다른 모임 선택) 실제 단계가 바뀌면 탭도 따라간다.
  // 사용자가 지역/가게 탭을 수동으로 오갈 수는 있지만, 새로 불러온 모임은
  // 항상 실제 진행 중인 탭에서 시작한다.
  useEffect(() => {
    setTab(realStep === 0 ? "region" : "shop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.code, realStep]);

  // 서버 집계 — 내 표는 이 기기의 참가자 정체성(identity)으로 판별한다
  const myId = m ? getActive(m.code)?.id ?? null : null;
  const regionVotes = m?.regionVotes ?? {};
  const placeVotes = m?.placeVotes ?? {};
  const regionVote = myId ? regionVotes[myId] ?? null : null;
  const shopVote = myId ? placeVotes[myId] ?? null : null;
  const tally = (box: Record<string, string>, id: string) =>
    Object.values(box).filter((v) => v === id).length;

  async function vote(target: "region" | "place", candidateId: string) {
    if (!m || !myId) return;
    setBusy(true);
    try {
      await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: m.code, action: "vote", participantId: myId, target, candidateId }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  // 모임이 없을 때 — 목업으로 채우지 않고 안내
  if (!loading && meetings.length === 0) {
    return (
      <main className="device v8-page">
        <V8Header />
        <div className="v8-empty" style={{ marginTop: 40 }}>
          아직 참여 중인 모임이 없어요.
          <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
            모임 탭에서 모임을 만들거나 참여하면 이곳에서 투표할 수 있어요.
          </div>
        </div>
        <BottomNav active="votes" />
      </main>
    );
  }

  return (
    <main className="device v8-page">
      <V8Header />

      {loading ? (
        <div className="v8-empty" style={{ marginTop: 40 }}>불러오는 중…</div>
      ) : (
        <>
          {/* 모임이 여러 개면 전환 */}
          {meetings.length > 1 && (
            <div className="v8-cats" style={{ paddingTop: 8 }}>
              {meetings.map((mm, i) => (
                <button
                  key={mm.code}
                  className={"v8-cat" + (i === selected ? " on" : "")}
                  onClick={() => {
                    setSelected(i);
                    setTab("region");
                  }}
                >
                  {mm.name}
                </button>
              ))}
            </div>
          )}

          <div className="v8-votetabs">
            <button className={tab === "region" ? "on" : ""} onClick={() => setTab("region")}>지역 투표</button>
            <button className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>가게 투표</button>
          </div>

          <div className="pad" style={{ paddingBottom: 4 }}>
            <StepIcons step={realStep} />
          </div>

          {decided && (
            <div className="pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
              <div
                className="row"
                style={{ gap: 8, background: "var(--ok-soft)", color: "var(--ok)", borderRadius: 12, padding: "9px 12px", fontSize: 11.5, fontWeight: 800 }}
              >
                <span className="grow">
                  ✅ 이 모임은 {m?.winnerRegion?.name} · {m?.winnerPlace?.name}(으)로 이미 확정됐어요. 투표는 마감됐어요.
                </span>
                <a className="btn sm" style={{ background: "var(--ok)", textDecoration: "none", flexShrink: 0 }} href={`/m/${m?.code}`}>
                  모임 보기
                </a>
              </div>
            </div>
          )}

          {tab === "region" ? (
            <>
              <div className="v8-list" style={{ paddingTop: 8 }}>
                {regions.length === 0 ? (
                  <div className="v8-empty">
                    아직 거점 후보가 없어요.
                    <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
                      참여자들이 출발지를 입력하면 후보가 만들어져요.
                    </div>
                  </div>
                ) : (
                  regions.map((r) => (
                    <div key={r.id} className="v8-voterow">
                      <div className="grow">
                        <div className="i-title">
                          {r.name}
                          {m?.winnerRegion?.id === r.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                        </div>
                        <div className="i-sub">
                          <b>{tally(regionVotes, r.id)}표</b>
                          {regionVote === r.id ? " (내 투표)" : ""}
                          {r.reason ? ` · ${r.reason}` : ""}
                        </div>
                      </div>
                      {!decided && (
                        <button
                          className={"v8-votepill" + (regionVote === r.id ? " voted" : "")}
                          disabled={busy || !myId}
                          onClick={() => vote("region", r.id)}
                        >
                          {regionVote === r.id ? "투표함 ✓" : "투표"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {regions.length > 0 && !decided && (
                <div className="v8-hint">
                  방장이 모임 화면에서 확정하면 다음 단계로 넘어가요.
                  {regionVote ? ` 현재 내 선택: ${regions.find((r) => r.id === regionVote)?.name}` : ""}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="v8-list" style={{ paddingTop: 8 }}>
                {places.length === 0 ? (
                  <div className="v8-empty">
                    아직 가게 후보가 없어요.
                    <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
                      거점이 확정되면 그 주변 가게가 후보로 올라와요.
                    </div>
                  </div>
                ) : (
                  places.map((s) => (
                    <div key={s.id} className="v8-voterow">
                      <div
                        className="i-thumb"
                        style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ac-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}
                      >
                        {s.emoji || "🍽️"}
                      </div>
                      <div className="grow">
                        <div className="i-title">
                          {s.name}
                          {s.category ? <span className="chip line" style={{ marginLeft: 4 }}>{s.category}</span> : null}
                          {m?.winnerPlace?.id === s.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                        </div>
                        <div className="i-sub">
                          <b>{tally(placeVotes, s.id)}표</b>
                          {shopVote === s.id ? " (내 투표)" : ""}
                          {m?.winnerRegion ? ` · 인근: ${m.winnerRegion.name}` : ""}
                        </div>
                      </div>
                      {!decided && (
                        <button
                          className={"v8-votepill" + (shopVote === s.id ? " voted" : "")}
                          disabled={busy || !myId}
                          onClick={() => vote("place", s.id)}
                        >
                          {shopVote === s.id ? "투표함 ✓" : "투표"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {places.length > 0 && !decided && (
                <div className="v8-hint">방장이 모임 화면에서 확정하면 최종 확정으로 넘어가요.</div>
              )}
            </>
          )}

          <div className="v8-hint" style={{ marginTop: "auto", paddingBottom: 10 }}>
            {myId
              ? "표는 서버에 집계돼 모임 상세 화면과 실시간으로 공유돼요. 확정은 방장이 모임 화면에서 합니다."
              : "이 기기로 참여한 모임이 아니라 투표할 수 없어요. 모임 화면에서 먼저 참가해주세요."}
          </div>
        </>
      )}

      <BottomNav active="votes" />
    </main>
  );
}
