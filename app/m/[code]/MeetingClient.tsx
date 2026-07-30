"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MeetingState, ChatMsg, RegionCandidate } from "@/lib/types";
import { getIdentities, getActive, setActive, addIdentity, type Identity } from "@/lib/identity";
import KakaoMap, { pinColor, type MapRoute, type MapCandidate } from "@/app/components/KakaoMap";
import RouteSheet from "@/app/components/RouteSheet";
import StepIcons from "@/app/components/v8/StepIcons";
import BottomNav from "@/app/components/v8/BottomNav";
import type { GeoSuggest } from "@/app/api/geocode/route";
import { arrivalStatus, ARRIVAL_COLOR, ARRIVAL_LABEL } from "@/lib/geo";

const DEV = process.env.NODE_ENV !== "production";

// v8 결정: AI 채팅/챗봇 비활성 (코드는 보존, 진입점만 차단 — 후순위 분류).
// 이 화면은 v3에서 그대로 넘어와 채팅 UI를 갖고 있으므로 플래그로 가린다.
// 다시 켜려면 true 로만 바꾸면 된다 — 코드는 지우지 않았다.
const AI_CHAT_ENABLED = false;
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
  // ✍ 다른 후보로 정하기 — 어느 단계를 대상으로 열렸는지 담는다(null이면 닫힘).
  // 거점 단계(stage=main)와 가게 단계(stage=chat) 양쪽에서 열 수 있어야 하므로
  // 단순 boolean이 아니라 대상 단계를 기억한다.
  const [showManual, setShowManual] = useState<"region" | "place" | null>(null);
  const [manualPick, setManualPick] = useState<string | null>(null);
  const [dbg, setDbg] = useState(false);
  const [mapFallback, setMapFallback] = useState(false); // 카카오맵 로드 실패 시 스키매틱으로
  const [routeFor, setRouteFor] = useState<string | null>(null); // 경로 상세 시트 대상 참가자
  // 홈 화면과 동일한 지도 조작 — 내 위치 보기 / 전체 위치 보기
  const [mapView, setMapView] = useState<"me" | "all">("all");
  // 스텝 탭 클릭으로 지난 단계 조회(읽기전용) — null이면 실제 진행 중인 단계를 따른다.
  const [viewStep, setViewStep] = useState<0 | 1 | 2 | null>(null);
  // 각 참가자 출발지 → 거점까지의 실제 경로 폴리라인
  const [routes, setRoutes] = useState<MapRoute[]>([]);

  // origin form — 홈 화면과 동일한 검색 자동완성(/api/geocode)
  const [origin, setOrigin] = useState("");
  const [transport, setTransport] = useState<"transit" | "car">("transit");
  const [originSuggests, setOriginSuggests] = useState<GeoSuggest[] | null>(null);
  const [originCoord, setOriginCoord] = useState<{ lat: number; lng: number } | null>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 방금 자동완성 목록에서 골랐다는 표시 — 다음 검색 이펙트 1회를 건너뛴다.
  // 없으면 pickOriginSuggest 직후 300ms 뒤 같은 값으로 재검색이 붙어 드롭다운이
  // 다시 열리면서(아직 서버에 등록 전이라 meRow?.origin 과 비교하는 가드를 못 씀)
  // "출발지 등록" 버튼 위치가 흔들리는 것처럼 보였다.
  const skipOriginSearchRef = useRef(false);

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

  // 출발지 자동완성 — 홈 화면(app/page.tsx)과 동일한 /api/geocode, 300ms 디바운스.
  // 직접 입력(resolveGeocode 의 첫 검색결과 추측)보다, 후보를 보고 정확히 고른
  // 결과를 그대로 등록하는 편이 훨씬 정확하다.
  useEffect(() => {
    if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
    const q = origin.trim();
    if (skipOriginSearchRef.current) {
      skipOriginSearchRef.current = false;
      setOriginSuggests(null);
      return;
    }
    // 이미 목록에서 고른 값과 같으면(방금 선택 직후) 다시 검색하지 않는다
    if (!q || q === meRow?.origin) {
      setOriginSuggests(null);
      return;
    }
    originDebounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setOriginSuggests(d.items || []);
      } catch {
        setOriginSuggests([]);
      }
    }, 300);
    return () => {
      if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
    };
  }, [origin, meRow?.origin]);

  function pickOriginSuggest(s: GeoSuggest) {
    skipOriginSearchRef.current = true;
    setOrigin(s.name);
    setOriginCoord({ lat: s.lat, lng: s.lng });
    setOriginSuggests(null);
  }

  // ── 경로 폴리라인 ────────────────────────────────────────────
  // state 는 1.8초마다 폴링돼 매번 새 객체가 된다. 배열/객체를 그대로 의존성에
  // 넣으면 매 폴링마다 route-path 를 다시 호출해 ODsay 무료 한도를 태운다.
  // 좌표만 뽑아 문자열로 고정한 키를 의존성으로 쓴다.
  const routeKey = useMemo(() => {
    // 경로는 거점이 확정된 뒤에만 — 투표 중에는 후보 박스가 지도의 주인공
    const dest = state?.winnerRegion ?? null;
    const loc = (state?.participants ?? []).filter((p) => p.lat != null);
    if (!dest || loc.length === 0) return "";
    return JSON.stringify({
      d: [dest.lat, dest.lng],
      o: loc.map((p) => [p.id, p.lat as number, p.lng as number, p.transport || "transit"]),
    });
  }, [state]);

  // ── 거점 후보 자동 계산 ──────────────────────────────────────
  // 메인 화면에서 바로 투표할 수 있어야 하므로, 출발지 구성이 바뀔 때마다
  // 서버에 후보 재계산을 요청한다(같은 구성이면 다시 부르지 않는다).
  const originSig = useMemo(
    () =>
      (state?.participants ?? [])
        .filter((p) => p.lat != null)
        .map((p) => `${p.id}:${p.lat},${p.lng},${p.transport}`)
        .join("|"),
    [state]
  );
  const regionsReqRef = useRef("");
  useEffect(() => {
    if (!originSig || originSig === regionsReqRef.current) return;
    regionsReqRef.current = originSig;
    fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action: "regions" }),
    })
      .then(() => load())
      .catch(() => {});
  }, [originSig, code, load]);

  useEffect(() => {
    if (!routeKey) {
      setRoutes([]);
      return;
    }
    const { d, o } = JSON.parse(routeKey) as { d: [number, number]; o: [string, number, number, string][] };
    let alive = true;
    fetch("/api/route-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dest: { lat: d[0], lng: d[1] },
        origins: o.map(([id, lat, lng, transport]) => ({ id, lat, lng, transport })),
      }),
    })
      .then((r) => r.json())
      .then((res: { paths?: { id: string; points: { lat: number; lng: number }[]; real: boolean }[] }) => {
        if (!alive) return;
        const idx = new Map(o.map((x, i) => [x[0], i]));
        setRoutes(
          (res.paths ?? []).map((p) => ({
            id: p.id,
            points: p.points,
            real: p.real,
            color: pinColor(idx.get(p.id) ?? 0),
          }))
        );
      })
      .catch(() => {
        if (alive) setRoutes([]);
      });
    return () => {
      alive = false;
    };
  }, [routeKey]);

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
  // 경로 상세의 목적지: 확정 지역 우선, 없으면 1순위 후보
  const destRegion: RegionCandidate | null = state.winnerRegion ?? state.regions[0] ?? null;
  const centroid =
    located.length > 0
      ? {
          lat: located.reduce((s, p) => s + (p.lat as number), 0) / located.length,
          lng: located.reduce((s, p) => s + (p.lng as number), 0) / located.length,
        }
      : null;
  const myName = meRow?.name;
  // "내 위치 보기" 가 확대할 핀 — 내 출발지가 없으면 첫 번째 참가자
  const myPinIndex = Math.max(0, located.findIndex((p) => p.id === me?.id));

  // 도착 신호등 — 참가자가 직접 남긴 상태(모임원 탭)가 있으면 그걸 우선한다.
  // 없으면 거점이 확정된 뒤 이동시간 기반 공평성 추정으로 대신 보여준다
  // (투표 중인 후보는 아직 확정이 아니라서 "늦음"으로 낙인찍으면 오해를 준다).
  const winPer = state.winnerRegion?.perParticipant;
  const winMins = winPer?.map((x) => x.min);
  const statusColorFor = (pid: string): string | undefined => {
    const self = state.participants.find((x) => x.id === pid)?.status;
    if (self) return ARRIVAL_COLOR[self];
    if (!winPer || !winMins || winMins.length === 0) return undefined;
    const m = winPer.find((x) => x.pid === pid)?.min;
    return m == null ? undefined : ARRIVAL_COLOR[arrivalStatus(m, winMins)];
  };

  // ── 거점 투표 집계 ──
  const regionVotesMap = state.regionVotes ?? {};
  const regionTally: Record<string, number> = {};
  for (const rid of Object.values(regionVotesMap)) regionTally[rid] = (regionTally[rid] ?? 0) + 1;
  const regionVoteCount = Object.keys(regionVotesMap).length;
  const myRegionVote = me ? regionVotesMap[me.id] : undefined;
  // 동점이면 후보 목록 순서(균형 좋은 순)를 따른다
  const topRegionId =
    state.regions.length === 0
      ? null
      : state.regions.reduce((best, r) =>
          (regionTally[r.id] ?? 0) > (regionTally[best.id] ?? 0) ? r : best
        ).id;

  // ── 가게 투표 집계 (2차) ──
  const placeVotesMap = state.placeVotes ?? {};
  const placeTally: Record<string, number> = {};
  for (const pid of Object.values(placeVotesMap)) placeTally[pid] = (placeTally[pid] ?? 0) + 1;
  const placeVoteCount = Object.keys(placeVotesMap).length;
  const myPlaceVote = me ? placeVotesMap[me.id] : undefined;
  const topPlaceId =
    state.places.length === 0
      ? null
      : state.places.reduce((best, p) =>
          (placeTally[p.id] ?? 0) > (placeTally[best.id] ?? 0) ? p : best
        ).id;

  // ── 방장 확정 UI 조각 ─────────────────────────────────────
  // 방장 바 버튼은 둘이 나란히 놓여 폭이 좁다 — 후보 이름이 길면 바가 뚱뚱해지므로
  // 줄여 보여주고, 전체 이름은 title 로 남긴다.
  const shortName = (name: string | undefined) => {
    const n = String(name ?? "");
    return n.length > 9 ? n.slice(0, 8) + "…" : n;
  };
  const openManualConfirm = (target: "region" | "place") => {
    const pool: { id: string }[] = target === "region" ? state.regions : state.places;
    setManualPick(pool[0]?.id ?? null);
    setShowManual(target);
  };
  // 전원이 투표를 마쳤으면 그건 "강제"가 아니라 정상적인 마무리다 —
  // 진행률과 문구를 상태에 따라 바꿔, 다 모였을 때만 기본 액션처럼 강조한다.
  // (예전 문구 "강제 확정(방장 권한)"은 정상 마감도 월권처럼 읽혔다)
  const leaderConfirmBtn = (target: "region" | "place") => {
    const pool: { id: string; name: string }[] =
      target === "region" ? state.regions : state.places;
    const topId = target === "region" ? topRegionId : topPlaceId;
    const voteCount = target === "region" ? regionVoteCount : placeVoteCount;
    const total = state.totalParticipants;
    const name = pool.find((c) => c.id === topId)?.name;
    const allVoted = total > 0 && voteCount >= total;
    const noOrigins = target === "region" && state.originsSet === 0;
    return (
      <button
        className={"btn" + (allVoted && topId ? "" : " ghost")}
        disabled={busy || !topId}
        title={name}
        onClick={() =>
          act(
            { action: "confirmManual", participantId: me?.id, target, id: topId },
            `${name}(으)로 확정했어요`
          )
        }
      >
        <span className="lb-sub">
          {!topId
            ? "후보 준비 중"
            : allVoted
            ? `${voteCount}/${total}명 투표 완료`
            : `${voteCount}/${total}명 투표 중`}
        </span>
        <b>
          {noOrigins
            ? "출발지를 등록하면 확정할 수 있어요"
            : !topId
            ? "후보를 계산하는 중…"
            : `${allVoted ? "투표 종료 및 확정" : "지금 확정"} · ‘${shortName(name)}’`}
        </b>
      </button>
    );
  };
  // 최다득표가 아닌 후보로도 정할 수 있는 예외 수단 — 투표 카드 안에 둔다.
  const manualConfirmLink = (target: "region" | "place") =>
    isLeader ? (
      <button
        className="btn ghost sm"
        style={{ alignSelf: "flex-start" }}
        disabled={busy}
        onClick={() => openManualConfirm(target)}
      >
        ✍ 다른 후보로 정하기
      </button>
    ) : null;

  // 지도 위 투표 후보 박스 — 누르면 그 후보에 투표 (피그마)
  const phaseIsRegion = state.aiPhase === "region";
  const mapCandidates: MapCandidate[] =
    AI_CHAT_ENABLED || stage === "result"
      ? []
      : phaseIsRegion
      ? state.regions.map((r) => ({
          id: r.id, lat: r.lat, lng: r.lng, name: r.name,
          votes: regionTally[r.id] ?? 0, mine: myRegionVote === r.id,
        }))
      : state.places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({
            id: p.id, lat: p.lat as number, lng: p.lng as number, name: p.name,
            votes: placeTally[p.id] ?? 0, mine: myPlaceVote === p.id,
          }));
  const voteFromMap = (id: string) => {
    if (!me || busy) return;
    void act(
      { action: "vote", participantId: me.id, target: phaseIsRegion ? "region" : "place", candidateId: id },
      undefined
    );
  };

  function switchTo(id: string) {
    setActive(code, id);
    setMe(getActive(code));
    load();
  }

  // 탭(거점 투표 / 가게 투표 / 최종 확정) 위치.
  // chat 단계를 무조건 1(가게)로 두면, 1차 거점을 정하는 중인데 "가게 투표"에
  // 불이 들어온다. aiPhase 로 거점/가게를 구분해야 한다.
  const stepIndex =
    stage === "result" ? 2 : stage === "chat" && state.aiPhase === "place" ? 1 : 0;
  // 탭을 눌러 이미 지난 단계를 보고 있으면 그 단계의 요약을 보여준다(실제 진행
  // 단계는 바뀌지 않는다 — 순수 조회). viewStep이 방장의 되돌리기 등으로
  // 더 이상 유효하지 않게(현재 단계보다 앞서게) 되면 조용히 실제 단계로 복귀한다.
  const displayStep = viewStep !== null && viewStep <= stepIndex ? viewStep : stepIndex;
  const viewingPast = displayStep !== stepIndex;

  // 빠른답변 칩 (탭 1번 = 의견 전달, 타이핑 부담 제거)
  const quickChips: string[] =
    stage === "chat"
      ? state.aiPhase === "region"
        ? [...state.regions.slice(0, 3).map((r) => `${r.name} 좋아요!`), "아무데나 좋아요 👍", "더 가까운 곳 없어요? 🥲"]
        : [...state.places.slice(0, 3).map((p) => `${p.name} 좋아요!`), "아무데나 좋아요 👍", "다른 종류는 없어요?"]
      : [];

  // 하단 5탭 내비게이션(.v8-bottomnav)이 이 화면에도 항상 떠 있어야 확정 후
  // 홈으로 곧장 돌아갈 수 있다. 방장 컨트롤 바(.leaderbar)는 그 위에 쌓인다.
  // 둘 다 position:fixed 라 흐름에서 빠져 있으므로, 가려지는 콘텐츠가 없도록
  // 그 높이(방장 바 72 + 탭바 65)만큼 여백을 여기서 확보한다.
  const showLeaderbar = isLeader && !viewingPast;
  return (
    <main className="device" style={{ paddingBottom: (showLeaderbar ? 80 : 24) + 68 }}>
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

      {/* stepper — 피그마: 원형 아이콘 + 연결선 */}
      <div className="pad" style={{ paddingBottom: 0 }}>
        {AI_CHAT_ENABLED ? (
          <div className="stepper">
            {["① 메인 · 출발지", "② AI 대화", "③ 결과"].map((s, i) => (
              <div key={i} className={"s " + (i === stepIndex ? "on" : i < stepIndex ? "done" : "")}>
                {s}
                <div className="bar" />
              </div>
            ))}
          </div>
        ) : (
          <StepIcons
            step={displayStep as 0 | 1 | 2}
            onStepClick={(i) => setViewStep(i === stepIndex ? null : i)}
            maxClickable={stepIndex as 0 | 1 | 2}
          />
        )}
      </div>

      {viewingPast && (
        <div className="pad" style={{ paddingBottom: 0 }}>
          <div
            className="row"
            style={{
              gap: 8, background: "var(--ac-soft)", color: "var(--ac-deep)", borderRadius: 12,
              padding: "9px 12px", fontSize: 11.5, fontWeight: 800,
            }}
          >
            <span className="grow">🕐 지난 단계를 보고 있어요 — 실제로 진행 중인 단계는 아니에요</span>
            <button
              className="btn sm"
              style={{ background: "var(--ac)", flexShrink: 0 }}
              onClick={() => setViewStep(null)}
            >
              현재 단계로
            </button>
          </div>
        </div>
      )}

      <div className="pad stack" style={{ gap: 14 }}>
        {/* ── MAP (always) — 카카오맵, 로드 실패 시 스키매틱 폴백 ── */}
        <div className="map">
          {/* 홈과 동일한 지도 조작 — 참가자가 2명 이상 위치를 넣었을 때만 의미가 있다 */}
          {!mapFallback && located.length > 0 && (
            <div className="v8-maplayer">
              <div className="seg2">
                <button className={mapView === "me" ? "on" : ""} onClick={() => setMapView("me")}>내 위치 보기</button>
                <button className={mapView === "all" ? "on" : ""} onClick={() => setMapView("all")}>전체 위치 보기</button>
              </div>
            </div>
          )}
          {!mapFallback ? (
            <KakaoMap
              pins={located.map((p, i) => ({
                lat: p.lat as number,
                lng: p.lng as number,
                label: p.name,
                color: pinColor(i),
                index: i + 1,
                statusColor: statusColorFor(p.id),
              }))}
              center={
                state.winnerRegion
                  ? {
                      lat: state.winnerRegion.lat,
                      lng: state.winnerRegion.lng,
                      label: `중간 추천 지역 · ${state.winnerRegion.name}`,
                    }
                  : mapCandidates.length > 0
                  ? null // 거점 투표 중 — 후보 박스가 지도의 주인공 (피그마)
                  : centroid
                  ? { lat: centroid.lat, lng: centroid.lng, label: "예상 중간지점" }
                  : null
              }
              onFail={() => setMapFallback(true)}
              view={mapView}
              focusIndex={myPinIndex}
              routes={routes}
              candidates={mapCandidates}
              onCandidateClick={me ? voteFromMap : undefined}
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
          {!mapFallback && state.winnerRegion && (
            <div className="v8-mapnote">
              📍 중간 추천 지역: <b>{state.winnerRegion.name}</b> · {state.winnerRegion.reason}
              {routes.length > 0 && !routes.every((r) => r.real) && (
                <span className="faint">{" · "}점선은 직선 근사(경로 API 미응답)</span>
              )}
            </div>
          )}
        </div>

        {viewingPast && <PastStepView step={displayStep} state={state} />}

        {/* ══════════════ STAGE: MAIN ══════════════ */}
        {!viewingPast && stage === "main" && (
          <>
            <div className="card stack" style={{ gap: 12 }}>
              <div>
                <span className="eyebrow">1. 메인 · 내 출발지</span>
                <h2 className="sec" style={{ marginTop: 4 }}>어디서 출발하세요?</h2>
                <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
                  <b>{myName}</b> 님의 출발지를 등록하면 모두에게 공평한 거점 후보를 찾아드려요.
                </p>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    setOriginCoord(null); // 직접 타이핑하면 이전 선택 좌표는 버린다
                  }}
                  placeholder="예: 강남역, 사당, 홍대입구…"
                  autoComplete="off"
                />
                {originSuggests !== null && (
                  <div className="v8-ac">
                    {originSuggests.length === 0 ? (
                      <div className="empty">검색 결과가 없어요.</div>
                    ) : (
                      originSuggests.map((s) => (
                        <button key={`${s.name}${s.lat}`} type="button" onClick={() => pickOriginSuggest(s)}>
                          <b>{s.name}</b>
                          <span className="addr">{s.address}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                onClick={() =>
                  act(
                    { action: "origin", participantId: me?.id, origin, transport, ...(originCoord ?? {}) },
                    "출발지를 등록했어요"
                  )
                }
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

            {/* ── 거점(지역) 투표 — 출발지가 모이면 이 화면에서 바로 투표한다 ── */}
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  <span className="eyebrow">2. 거점 투표</span>
                  <h2 className="sec" style={{ marginTop: 4 }}>어디서 만날까요?</h2>
                </div>
                <span className="chip line" style={{ fontSize: 10 }}>
                  {regionVoteCount}/{state.totalParticipants}명 투표
                </span>
              </div>

              {state.regions.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                  {state.originsSet === 0
                    ? "참여자들이 출발지를 등록하면 모두에게 공평한 거점 후보가 만들어져요."
                    : "거점 후보를 계산하고 있어요…"}
                </p>
              ) : (
                <>
                  <div className="stack" style={{ gap: 8 }}>
                    {state.regions.map((r) => {
                      const n = regionTally[r.id] ?? 0;
                      const mine = myRegionVote === r.id;
                      return (
                        <div key={r.id} className="v8-voterow">
                          <div className="grow">
                            <div className="i-title">
                              {r.name}
                              {topRegionId === r.id && n > 0 && (
                                <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>최다</span>
                              )}
                            </div>
                            <div className="i-sub">
                              <b>{n}표</b> · 최대 {r.maxMin}분 · 편차 {r.devMin}분
                            </div>
                          </div>
                          <button
                            className={"v8-votepill" + (mine ? " voted" : "")}
                            disabled={busy || !me}
                            onClick={() =>
                              act(
                                { action: "vote", participantId: me?.id, target: "region", candidateId: r.id },
                                mine ? "투표를 취소했어요" : `${r.name}에 투표했어요`
                              )
                            }
                          >
                            {mine ? "투표함 ✓" : "투표"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                    {regionVoteCount >= state.totalParticipants && state.totalParticipants > 0
                      ? `참여자 ${state.totalParticipants}명이 모두 투표했어요. 방장이 마무리해주세요.`
                      : `참여자 ${state.totalParticipants}명이 모두 투표하면 방장이 확정할 수 있어요.`}
                    {topRegionId && regionVoteCount > 0
                      ? ` 현재 최다득표: ${state.regions.find((r) => r.id === topRegionId)?.name}`
                      : ""}
                  </p>
                  {manualConfirmLink("region")}
                </>
              )}
            </div>
          </>
        )}

        {/* ══════════════ STAGE: CHAT (투표 대체 · AI 파실리테이터) ══════════════ */}
        {!viewingPast && stage === "chat" && (
          <>
            {/* 후보 카드 — 현재 논의 대상 요약(탭하면 지지 의견 전송) */}
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  <span className="eyebrow">
                    {AI_CHAT_ENABLED ? "2. AI 대화 · " : "2. 투표 · "}
                    {state.aiPhase === "region" ? "1차 거점" : "2차 가게"}
                  </span>
                  <h2 className="sec" style={{ marginTop: 4 }}>
                    {state.aiPhase === "region" ? "어디서 만날까요?" : `${state.winnerRegion?.name}에서 어디로?`}
                  </h2>
                </div>
                {AI_CHAT_ENABLED ? (
                  <span className="chip ac">🤖 AI 진행</span>
                ) : (
                  <span className="chip line" style={{ fontSize: 10 }}>
                    {(state.aiPhase === "region" ? regionVoteCount : placeVoteCount)}/{state.totalParticipants}명 투표
                  </span>
                )}
              </div>

              {AI_CHAT_ENABLED ? (
                state.aiPhase === "region" ? (
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
                )
              ) : (
                // v8: 채팅 대신 실제 투표 — 서버에 집계되고 전원에게 실시간 반영된다
                <div className="stack" style={{ gap: 8 }}>
                  {(state.aiPhase === "region" ? state.regions : state.places).length === 0 && (
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>아직 후보가 없어요.</p>
                  )}
                  {state.aiPhase === "region"
                    ? state.regions.map((r) => {
                        const n = regionTally[r.id] ?? 0;
                        const mine = myRegionVote === r.id;
                        return (
                          <div key={r.id} className="v8-voterow">
                            <div className="grow">
                              <div className="i-title">
                                {r.name}
                                {topRegionId === r.id && n > 0 && (
                                  <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>최다</span>
                                )}
                              </div>
                              <div className="i-sub"><b>{n}표</b> · 최대 {r.maxMin}분 · 편차 {r.devMin}분</div>
                            </div>
                            <button
                              className={"v8-votepill" + (mine ? " voted" : "")}
                              disabled={busy || !me}
                              onClick={() =>
                                act(
                                  { action: "vote", participantId: me?.id, target: "region", candidateId: r.id },
                                  mine ? "투표를 취소했어요" : `${r.name}에 투표했어요`
                                )
                              }
                            >
                              {mine ? "투표함 ✓" : "투표"}
                            </button>
                          </div>
                        );
                      })
                    : state.places.map((p) => {
                        const n = placeTally[p.id] ?? 0;
                        const mine = myPlaceVote === p.id;
                        return (
                          <div key={p.id} className="v8-voterow">
                            <div className="grow">
                              <div className="i-title">
                                {p.emoji} {p.name}
                                {topPlaceId === p.id && n > 0 && (
                                  <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>최다</span>
                                )}
                              </div>
                              <div className="i-sub">
                                <b>{n}표</b> · {p.category} · {p.distanceM}m
                                {p.reservable ? " · 예약가능" : ""}
                              </div>
                            </div>
                            <button
                              className={"v8-votepill" + (mine ? " voted" : "")}
                              disabled={busy || !me}
                              onClick={() =>
                                act(
                                  { action: "vote", participantId: me?.id, target: "place", candidateId: p.id },
                                  mine ? "투표를 취소했어요" : `${p.name}에 투표했어요`
                                )
                              }
                            >
                              {mine ? "투표함 ✓" : "투표"}
                            </button>
                          </div>
                        );
                      })}
                </div>
              )}
              <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
                {AI_CHAT_ENABLED
                  ? "후보를 탭하거나 채팅으로 편하게 말하면 AI가 의견을 모아 확정해요. 다른 동네를 제안해도 돼요!"
                  : (state.aiPhase === "region" ? regionVoteCount : placeVoteCount) >=
                      state.totalParticipants && state.totalParticipants > 0
                  ? `참여자 ${state.totalParticipants}명이 모두 투표했어요. 방장이 마무리해주세요.`
                  : `참여자 ${state.totalParticipants}명이 모두 투표하면 방장이 확정할 수 있어요.`}
              </p>
              {!AI_CHAT_ENABLED && manualConfirmLink(state.aiPhase === "region" ? "region" : "place")}
            </div>

            {/* 참가자별 이동시간 + 경로 상세 (시안1·2) */}
            {destRegion && <TravelTimes state={state} dest={destRegion} onOpen={setRouteFor} />}

            {/* 채팅 패널 — v8에서는 비활성 */}
            {AI_CHAT_ENABLED && (
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
            )}
          </>
        )}

        {/* ══════════════ STAGE: RESULT ══════════════ */}
        {!viewingPast && stage === "result" && (
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
                    <span className="chip ac" style={{ fontSize: 10.5 }}>{AI_CHAT_ENABLED ? "💬 AI 대화로 함께 정했어요" : "🗳️ 투표로 함께 정했어요"}</span>
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

            {destRegion ? (
              <TravelTimes
                state={state}
                dest={destRegion}
                title={`참여자 ${state.totalParticipants}명 · 이동시간`}
                onOpen={setRouteFor}
              />
            ) : (
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
            )}

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
              <button className="btn" onClick={() => openGoogleCalendar(state)}>📅 Google 캘린더에 추가</button>
              <button className="btn ghost" onClick={() => downloadIcs(state)}>📄 .ics 다운로드 (Apple·Outlook용)</button>
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

      {/* ── Leader control bar — 지난 단계를 보는 중엔 실제 단계에 대한 조작을
           의도치 않게 누르지 않도록 숨긴다(위 배너의 "현재 단계로"로 복귀) ── */}
      {showLeaderbar && (
        <div className="leaderbar">
          {stage === "main" &&
            (AI_CHAT_ENABLED ? (
              <button
                className="btn"
                disabled={busy || state.originsSet < 1}
                onClick={() => act({ action: "openChat", participantId: me?.id }, "AI 대화를 시작했어요")}
              >
                💬 AI와 함께 정하기 · 대화 시작
              </button>
            ) : (
              // 마감은 방장 확정 — 투표 진행률을 함께 보여준다(전원 투표 시 강조)
              leaderConfirmBtn("region")
            ))}
          {stage === "chat" && (
            <>
              {/* 이전 단계로 — 가게 단계면 거점으로, 거점 단계면 출발지 입력으로 */}
              <button
                className="btn ghost"
                disabled={busy}
                title="출발지·거점 투표 화면으로 돌아갑니다"
                onClick={() =>
                  // v8은 거점 투표가 메인 화면에 있으므로 뒤로가기는 항상 메인이다.
                  // (AI 모드에서는 기존대로 거점 논의만 다시 연다)
                  AI_CHAT_ENABLED && state.aiPhase === "place"
                    ? act({ action: "reopen", participantId: me?.id, target: "region" }, "거점부터 다시 정해요")
                    : act({ action: "backToMain", participantId: me?.id }, "거점 투표로 돌아갔어요")
                }
              >
                ← 거점 다시
              </button>
              {!AI_CHAT_ENABLED ? (
                leaderConfirmBtn(state.aiPhase === "region" ? "region" : "place")
              ) : (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => openManualConfirm(state.aiPhase === "region" ? "region" : "place")}
                  title="방장이 장소를 확정합니다"
                >
                  ✍ 직접 확정
                </button>
              )}
              {AI_CHAT_ENABLED && (
                <button
                  className="btn"
                  disabled={busy || state.aiBusy}
                  onClick={() => act({ action: "aiDecide", participantId: me?.id }, "AI에게 결정을 요청했어요")}
                >
                  🤖 AI에게 결정 요청
                </button>
              )}
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

      {/* ✍ 다른 후보로 정하기 — 최다득표가 아닌 후보로도 정할 수 있는 예외 수단.
          거점 단계는 stage="main", 가게 단계는 stage="chat" 이므로 끝난 모임만 제외한다.
          (예전에는 stage==="chat" 으로 잠겨 있어 거점 단계에서 아예 열리지 않았다) */}
      {showManual && stage !== "result" && (
        <div className="backdrop" onClick={() => setShowManual(null)}>
          <div className="modal stack" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div>
              <b style={{ fontSize: 16 }}>✍ 다른 후보로 정하기</b>
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.55 }}>
                최다득표가 아닌 곳으로도 정할 수 있어요. 예약이 안 되거나 사정이 있을 때 쓰세요.
              </p>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {(showManual === "region" ? state.regions : state.places).length === 0 && (
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>아직 후보가 없어요.</p>
              )}
              {showManual === "region"
                ? state.regions.map((r) => (
                    <label
                      key={r.id}
                      className={"opt" + (manualPick === r.id ? " sel" : "")}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <input
                        type="radio"
                        name="manualPick"
                        checked={manualPick === r.id}
                        onChange={() => setManualPick(r.id)}
                      />
                      <div className="grow">
                        <b style={{ fontSize: 13 }}>{r.name}</b>
                        <div className="faint" style={{ fontSize: 11 }}>
                          최대 {r.maxMin}분 · 편차 {r.devMin}분
                        </div>
                      </div>
                    </label>
                  ))
                : state.places.map((p) => (
                    <label
                      key={p.id}
                      className={"opt" + (manualPick === p.id ? " sel" : "")}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <input
                        type="radio"
                        name="manualPick"
                        checked={manualPick === p.id}
                        onChange={() => setManualPick(p.id)}
                      />
                      <div className="grow">
                        <b style={{ fontSize: 13 }}>
                          {p.emoji} {p.name}
                        </b>
                        <div className="faint" style={{ fontSize: 11 }}>
                          {p.category} · {p.distanceM}m
                          {p.rating > 0 ? ` · ⭐${p.rating}` : ""}
                        </div>
                      </div>
                    </label>
                  ))}
            </div>
            <button
              className="btn"
              disabled={busy || !manualPick}
              onClick={async () => {
                const target = showManual;
                const pool: { id: string; name: string }[] =
                  target === "region" ? state.regions : state.places;
                const picked = pool.find((c) => c.id === manualPick);
                if (!picked) return;
                setShowManual(null);
                await act(
                  { action: "confirmManual", participantId: me?.id, target, id: picked.id },
                  `${picked.name}(으)로 확정했어요`
                );
              }}
            >
              이 후보로 확정
            </button>
            <button className="btn ghost" onClick={() => setShowManual(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 경로 상세 바텀시트 (시안1·2) */}
      {routeFor && destRegion && (
        <RouteSheet
          code={code}
          participantId={routeFor}
          dest={{ name: destRegion.name, lat: destRegion.lat, lng: destRegion.lng }}
          onClose={() => setRouteFor(null)}
        />
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
      <BottomNav active="meetings" />
    </main>
  );
}

// ── 참가자별 이동시간 카드 (행 탭 → 경로 상세 시트) — 시안1·2 진입점 ──
// ── 지난 단계 조회(읽기전용) — 스텝 탭을 눌러서 들어온다 ──
//  실제 진행 단계를 건드리지 않고 그 시점의 후보·득표·확정 결과만 보여준다.
//  다시 편집하려면(투표/확정) 배너의 "현재 단계로"로 나가서 방장 되돌리기를 써야 한다.
function PastStepView({ step, state }: { step: 0 | 1 | 2; state: MeetingState }) {
  if (step === 0) {
    const votes = state.regionVotes ?? {};
    const tally = (id: string) => Object.values(votes).filter((v) => v === id).length;
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <span className="eyebrow">① 거점 투표 · 지난 기록</span>
        {state.regions.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>당시 거점 후보가 없었어요.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {state.regions.map((r) => (
              <div key={r.id} className="v8-voterow">
                <div className="grow">
                  <div className="i-title">
                    {r.name}
                    {state.winnerRegion?.id === r.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                  </div>
                  <div className="i-sub">
                    <b>{tally(r.id)}표</b> · 최대 {r.maxMin}분 · 편차 {r.devMin}분
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (step === 1) {
    const votes = state.placeVotes ?? {};
    const tally = (id: string) => Object.values(votes).filter((v) => v === id).length;
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <span className="eyebrow">② 가게 투표 · 지난 기록</span>
        {state.places.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>당시 가게 후보가 없었어요.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {state.places.map((p) => (
              <div key={p.id} className="v8-voterow">
                <div className="grow">
                  <div className="i-title">
                    {p.emoji} {p.name}
                    {state.winnerPlace?.id === p.id && <span className="chip ok" style={{ marginLeft: 6, fontSize: 9 }}>확정됨</span>}
                  </div>
                  <div className="i-sub">
                    <b>{tally(p.id)}표</b> · {p.category} · {p.distanceM}m
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function TravelTimes({
  state,
  dest,
  title,
  onOpen,
}: {
  state: MeetingState;
  dest: RegionCandidate;
  title?: string;
  onOpen: (pid: string) => void;
}) {
  const rows = state.participants.filter((p) => p.lat != null);
  if (rows.length === 0) return null;
  const mins = new Map(dest.perParticipant.map((x) => [x.pid, x.min]));
  const max = Math.max(1, ...dest.perParticipant.map((x) => x.min));
  // 도착 신호등 — 회의록: 정시권(초록)/지체(노랑)/많이 늦음(빨강).
  // 다들 같은 순간 출발한다고 볼 때 제일 빠른 사람 대비 얼마나 더 걸리는지로 매긴다.
  const groupMins = dest.perParticipant.map((x) => x.min);
  return (
    <div className="card stack" style={{ gap: 2 }}>
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="eyebrow">{title ?? "참가자별 이동시간"}</span>
        <span className="faint" style={{ fontSize: 11 }}>→ {dest.name} 기준</span>
      </div>
      {rows.map((p) => {
        const m = mins.get(p.id);
        // 본인이 남긴 상태가 있으면 그걸 우선 — 없으면 이동시간 기반 추정
        const status = p.status ?? (m != null && groupMins.length > 0 ? arrivalStatus(m, groupMins) : null);
        const statusColor = status ? ARRIVAL_COLOR[status] : "var(--ac)";
        return (
          <button key={p.id} className="travelrow" onClick={() => onOpen(p.id)} title="탭하면 경로 상세를 볼 수 있어요">
            <div className={"av" + (p.transport === "car" ? " car" : "")} style={status ? { boxShadow: `0 0 0 2px ${statusColor}` } : undefined}>
              {p.name.slice(0, 1)}
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="between" style={{ marginBottom: 3 }}>
                <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{p.name}</span>
                <span className="row" style={{ gap: 5 }}>
                  {status && (
                    <span className="chip" style={{ fontSize: 8.5, padding: "2px 7px", background: `${statusColor}22`, color: statusColor }}>
                      ● {ARRIVAL_LABEL[status]}
                    </span>
                  )}
                  <span className="chip ok" style={{ fontSize: 8.5, padding: "2px 7px" }}>실시간</span>
                  <b className="tnum" style={{ fontSize: 11.5, color: statusColor }}>{m != null ? `${m}분` : "—"}</b>
                </span>
              </div>
              <div className="bar sm">
                <i style={{ width: `${m != null ? Math.round((m / max) * 100) : 0}%`, background: statusColor }} />
              </div>
              <div className="faint" style={{ fontSize: 10, marginTop: 3 }}>
                {p.transport === "car" ? "🚗 자차" : "🚇 대중교통"} · <b style={{ color: "var(--ac)" }}>경로 상세 ›</b>
              </div>
            </div>
          </button>
        );
      })}
    </div>
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

// ── 모임 일정 계산 (AI가 대화에서 수집한 날짜·시간 사용, 없으면 다음 토요일 19시) ──
function meetingSchedule(state: MeetingState): { start: Date; end: Date; fmt: (d: Date) => string } {
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
  return { start, end, fmt };
}

// ── Google 캘린더에 추가 (원클릭, 파일 다운로드 없음) ──
function openGoogleCalendar(state: MeetingState) {
  const { start, end, fmt } = meetingSchedule(state);
  const place = state.winnerPlace ? `${state.winnerPlace.name} (${state.winnerRegion?.name})` : state.name;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: state.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: place,
    details:
      `모이머로 정한 모임 · 참여자 ${state.totalParticipants}명` +
      (state.winnerPlace?.url ? `\n카카오맵: ${state.winnerPlace.url}` : "") +
      `\n모임 페이지: ${location.origin}/m/${state.code}`,
  });
  window.open(`https://calendar.google.com/calendar/render?${p.toString()}`, "_blank", "noopener");
}

// ── .ics 캘린더 파일 생성 (Apple/Outlook용 보조) ──
function downloadIcs(state: MeetingState) {
  const { start, end, fmt } = meetingSchedule(state);
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
    `DESCRIPTION:모이머로 정한 모임 · 참여자 ${state.totalParticipants}명`,
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
