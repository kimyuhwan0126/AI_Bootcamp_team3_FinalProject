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
import { formatMinutes, formatGap } from "@/lib/format";
import ChatPanel from "./sections/ChatPanel";
import VoteList from "./sections/VoteList";
import PastStepView from "./sections/PastStepView";
import TravelTimes from "./sections/TravelTimes";
import AddParticipant from "./sections/AddParticipant";
import AddRegionModal from "./sections/AddRegionModal";
import ManualPickModal from "./sections/ManualPickModal";
import { openGoogleCalendar, downloadIcs } from "@/lib/calendar";
import { FLAGS } from "@/lib/flags";

const DEV = process.env.NODE_ENV !== "production";

// v8 결정: AI 채팅/챗봇 비활성 (코드는 보존, 진입점만 차단 — 후순위 분류).
// 이 화면은 v3에서 그대로 넘어와 채팅 UI를 갖고 있으므로 플래그로 가린다.
//
// 켜는 법: `.env.local` 에 `NEXT_PUBLIC_FF_AI_CHAT=1` 한 줄.
//   상수를 직접 고치지 않는다 — 브랜치마다 이 값이 달라지면 머지할 때마다
//   같은 줄에서 충돌나고, 개발하려고 켠 걸 실수로 커밋하면 남의 화면까지 켜진다.
const AI_CHAT_ENABLED = FLAGS.aiChat;
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
  // ＋ 다른 후보 등록 — 지도(카카오 로컬) 검색으로 원하는 지역을 후보에 올린다
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [regionQuery, setRegionQuery] = useState("");
  const [regionHits, setRegionHits] = useState<GeoSuggest[] | null>(null);
  const [regionSearching, setRegionSearching] = useState(false);
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // ── 내정보(프로필) 연결 — 애용 이동수단·저장 위치를 출발지 폼에 반영 ──
  //  내정보 탭이 "새로 만드는 모임에 기본 적용" · "모임을 만들 때 바로 불러와요"
  //  라고 약속하는데, 정작 이 폼이 프로필을 읽지 않아 반영되지 않았다 (CEO 보고).
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const profileTransportRef = useRef<"transit" | "car" | null>(null);
  useEffect(() => {
    try {
      const p: unknown = JSON.parse(localStorage.getItem("moimer:v8:profile") || "null");
      if (p && typeof p === "object") {
        const t = (p as { transport?: unknown }).transport;
        if (t === "car" || t === "transit") profileTransportRef.current = t;
        const sp = (p as { savedPlaces?: unknown }).savedPlaces;
        if (Array.isArray(sp)) setSavedPlaces(sp.filter((x): x is string => typeof x === "string"));
      }
    } catch {
      /* 프로필 없음/손상 — 기본값으로 진행 */
    }
  }, []);

  const meRow = useMemo(
    () => state?.participants.find((p) => p.id === me?.id),
    [state, me]
  );
  useEffect(() => {
    if (meRow) {
      setOrigin(meRow.origin || "");
      // 아직 출발지를 등록하기 전이면 서버 기본값(transit) 대신 내정보의
      // 애용 이동수단을 기본으로 쓴다. 이미 등록했다면 서버 값이 진실이다.
      if (!meRow.origin && profileTransportRef.current) {
        setTransport(profileTransportRef.current);
      } else {
        setTransport(meRow.transport === "car" ? "car" : "transit");
      }
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

  // 내 저장 위치 칩 — 누르면 입력칸에 채워진다 ("등록" 버튼으로 확정하는 건 동일).
  // 저장 위치는 텍스트뿐이라 좌표가 없다 → 서버가 등록 시 카카오 지오코딩으로 찾는다.
  function pickSavedPlace(name: string) {
    skipOriginSearchRef.current = true; // 채우자마자 자동완성이 다시 열리는 것 방지
    setOrigin(name);
    setOriginCoord(null);
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

  // 출발지 검색과 같은 /api/geocode (카카오 로컬) 를 쓴다 — 300ms 디바운스
  useEffect(() => {
    if (!showAddRegion) return;
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    const q = regionQuery.trim();
    if (!q) {
      setRegionHits(null);
      return;
    }
    setRegionSearching(true);
    regionDebounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setRegionHits(d.items || []);
      } catch {
        setRegionHits([]);
      } finally {
        setRegionSearching(false);
      }
    }, 300);
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    };
  }, [regionQuery, showAddRegion]);

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

  // 지금 무엇을 투표 중인가 — 후보 목록·집계·투표 액션이 모두 이 값을 따른다
  const votePhase: "region" | "place" = state.aiPhase === "region" ? "region" : "place";

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
  // ── ＋ 다른 후보 등록 (누구나) ────────────────────────────────
  const openAddRegion = () => {
    setRegionQuery("");
    setRegionHits(null);
    setShowAddRegion(true);
  };
  async function addRegionFrom(s: GeoSuggest) {
    if (!s.name) return;
    // 좌표가 없으면(직접 입력) 보내지 않는다 — 서버가 이름으로 지오코딩한다
    const hasCoord = Number.isFinite(s.lat) && Number.isFinite(s.lng);
    const d = await act(
      {
        action: "addRegion",
        participantId: me?.id,
        name: s.name,
        ...(hasCoord ? { lat: s.lat, lng: s.lng } : {}),
      },
      undefined
    ).catch(() => null);
    if (!d) return;
    setShowAddRegion(false);
    flash(d.existing ? `${s.name}은(는) 이미 후보에 있어요` : `${s.name}을(를) 후보에 추가했어요`);
  }

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
  // 투표 카드 하단 액션 두 개.
  //  · ＋ 다른 후보 등록 — 방장 포함 "누구나". 자동 추천 3곳이 마음에 안 들 때의 탈출구.
  //  · ✍ 다른 후보로 확정 — 방장 전용. 최다득표가 아닌 후보로 마감하는 예외 수단.
  //  둘은 성격이 완전히 다르다(후보를 늘리는 것 vs 마감하는 것) — 이름으로 구분한다.
  const voteCardActions = (target: "region" | "place") => (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {target === "region" && (
        <button className="btn ghost sm" disabled={busy} onClick={openAddRegion}>
          ＋ 다른 후보 등록
        </button>
      )}
      {isLeader && (
        <button className="btn ghost sm" disabled={busy} onClick={() => openManualConfirm(target)}>
          ✍ 다른 후보로 확정
        </button>
      )}
    </div>
  );

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
              {/* 내정보 탭에 저장해 둔 위치 — 누르면 입력칸에 바로 채워진다 */}
              {savedPlaces.length > 0 && (
                <div>
                  <label className="label">내 저장 위치</label>
                  <div className="v8-tags" style={{ marginBottom: 0 }}>
                    {savedPlaces.map((n) => (
                      <button key={n} type="button" className="v8-tag" onClick={() => pickSavedPlace(n)}>
                        📍 {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                              {r.proposedBy && (
                                <span className="chip line" style={{ marginLeft: 6, fontSize: 9 }}>
                                  {r.proposedBy} 제안
                                </span>
                              )}
                            </div>
                            <div className="i-sub">
                              <b>{n}표</b> · 최대 {formatMinutes(r.maxMin)} · 편차 {formatGap(r.devMin)}
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
                  {voteCardActions("region")}
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
                        <span>최대 {formatMinutes(r.maxMin)} · 편차 {formatGap(r.devMin)}</span>
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
                <VoteList
                  target={votePhase}
                  state={state}
                  tally={votePhase === "region" ? regionTally : placeTally}
                  myVote={(votePhase === "region" ? myRegionVote : myPlaceVote) ?? null}
                  topId={votePhase === "region" ? topRegionId : topPlaceId}
                  disabled={busy || !me}
                  onVote={(candidateId, candidateName, mine) =>
                    act(
                      { action: "vote", participantId: me?.id, target: votePhase, candidateId },
                      mine ? "투표를 취소했어요" : `${candidateName}에 투표했어요`
                    )
                  }
                />
              )}
              <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
                {AI_CHAT_ENABLED
                  ? "후보를 탭하거나 채팅으로 편하게 말하면 AI가 의견을 모아 확정해요. 다른 동네를 제안해도 돼요!"
                  : (state.aiPhase === "region" ? regionVoteCount : placeVoteCount) >=
                      state.totalParticipants && state.totalParticipants > 0
                  ? `참여자 ${state.totalParticipants}명이 모두 투표했어요. 방장이 마무리해주세요.`
                  : `참여자 ${state.totalParticipants}명이 모두 투표하면 방장이 확정할 수 있어요.`}
              </p>
              {!AI_CHAT_ENABLED && voteCardActions(state.aiPhase === "region" ? "region" : "place")}
            </div>

            {/* 참가자별 이동시간 + 경로 상세 (시안1·2) */}
            {destRegion && <TravelTimes state={state} dest={destRegion} onOpen={setRouteFor} />}

            {/* 채팅 패널 — 기본 비활성. 담당자 파일: sections/ChatPanel.tsx */}
            {AI_CHAT_ENABLED && (
              <ChatPanel
                state={state}
                myName={myName}
                chatEndRef={chatEndRef}
                quickChips={quickChips}
                text={chatText}
                onTextChange={setChatText}
                onSend={sendChat}
                busy={busy}
              />
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
      {/* ＋ 다른 후보 등록 · ✍ 다른 후보로 정하기 — 담당자 파일: sections/*.tsx */}
      {showAddRegion && (
        <AddRegionModal
          query={regionQuery}
          onQueryChange={setRegionQuery}
          hits={regionHits}
          searching={regionSearching}
          busy={busy}
          onPick={addRegionFrom}
          onClose={() => setShowAddRegion(false)}
        />
      )}

      {showManual && stage !== "result" && (
        <ManualPickModal
          target={showManual}
          state={state}
          picked={manualPick}
          onPick={setManualPick}
          busy={busy}
          onConfirm={async (id, name) => {
            const target = showManual;
            setShowManual(null);
            await act(
              { action: "confirmManual", participantId: me?.id, target, id },
              `${name}(으)로 확정했어요`
            );
          }}
          onClose={() => setShowManual(null)}
        />
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
