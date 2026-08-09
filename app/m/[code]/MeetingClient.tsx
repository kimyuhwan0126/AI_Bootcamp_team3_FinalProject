"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MeetingState, ChatMsg, RegionCandidate } from "@/lib/types";
import { getIdentities, getActive, setActive, addIdentity, type Identity } from "@/lib/identity";
import KakaoMap, { pinColor, type MapRoute, type MapCandidate } from "@/app/components/KakaoMap";
import RouteSheet from "@/app/components/RouteSheet";
import BottomNav from "@/app/components/v8/BottomNav";
import type { GeoSuggest } from "@/app/api/geocode/route";
import { arrivalStatus, ARRIVAL_COLOR, ARRIVAL_LABEL } from "@/lib/geo";
import { formatMinutes, formatGap } from "@/lib/format";
import ChatPanel from "./sections/ChatPanel";
import VoteList from "./sections/VoteList";
import PlacePicker from "./sections/PlacePicker";
import PastStepView from "./sections/PastStepView";
import TravelTimes from "./sections/TravelTimes";
import AddParticipant from "./sections/AddParticipant";
import AddRegionModal from "./sections/AddRegionModal";
import ManualPickModal from "./sections/ManualPickModal";
import OriginForm from "./sections/OriginForm";
import ParticipantList from "./sections/ParticipantList";
import ResultSection from "./sections/ResultSection";
import MapPanel from "./sections/MapPanel";
import ReserveModal from "./sections/ReserveModal";
import DebugWidget from "./sections/DebugWidget";
import LeaderBar from "./sections/LeaderBar";
import MeetingHeader from "./sections/MeetingHeader";
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
    // ⚠️ deps 에 meRow 전체를 넣지 말 것. meRow 는 1.8초 폴링마다 새 객체로 만들어져서,
    //  넣으면 이 effect 가 매 폴링마다 돌아 **사용자가 입력 중인 출발지를 덮어쓴다.**
    //  신원이 바뀔 때만 돌아야 하므로 id 만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* ── 상단 헤더 · 스텝 — 담당자 파일: sections/MeetingHeader.tsx ── */}
      <MeetingHeader
        state={state}
        isLeader={isLeader}
        identities={ids}
        activeId={me?.id}
        onSwitch={switchTo}
        onAddParticipant={() => setShowAdd(true)}
        aiChatEnabled={AI_CHAT_ENABLED}
        stepIndex={stepIndex}
        displayStep={displayStep}
        viewingPast={viewingPast}
        onStepClick={(i) => setViewStep(i === stepIndex ? null : i)}
        onBackToCurrent={() => setViewStep(null)}
      />

      <div className="pad stack" style={{ gap: 14 }}>
        {/* ── 지도 — 담당자 파일: sections/MapPanel.tsx ── */}
        <MapPanel
          state={state}
          located={located}
          centroid={centroid}
          mapCandidates={mapCandidates}
          routes={routes}
          myPinIndex={myPinIndex}
          view={mapView}
          onViewChange={setMapView}
          fallback={mapFallback}
          onFail={() => setMapFallback(true)}
          statusColorFor={statusColorFor}
          onCandidateClick={me ? voteFromMap : undefined}
        />

        {viewingPast && <PastStepView step={displayStep} state={state} />}

        {/* ══════════════ STAGE: MAIN ══════════════ */}
        {!viewingPast && stage === "main" && (
          <>
            <OriginForm
              myName={myName}
              registered={!!meRow?.origin}
              value={origin}
              onChange={(v) => {
                setOrigin(v);
                setOriginCoord(null); // 직접 타이핑하면 이전 선택 좌표는 버린다
              }}
              suggests={originSuggests}
              onPickSuggest={pickOriginSuggest}
              savedPlaces={savedPlaces}
              onPickSaved={pickSavedPlace}
              transport={transport}
              onTransportChange={setTransport}
              busy={busy}
              onSubmit={() =>
                act(
                  { action: "origin", participantId: me?.id, origin, transport, ...(originCoord ?? {}) },
                  "출발지를 등록했어요"
                )
              }
            />

            <ParticipantList state={state} />

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
                  {/* 거점 단계와 가게 단계가 같은 목록 컴포넌트를 쓴다 —
                      예전엔 여기와 STAGE:CHAT 에 같은 코드가 복제돼 있어
                      한쪽만 고치면 화면마다 다르게 보이는 사고가 날 자리였다. */}
                  <VoteList
                    target="region"
                    state={state}
                    tally={regionTally}
                    myVote={myRegionVote ?? null}
                    topId={topRegionId}
                    disabled={busy || !me}
                    onVote={(candidateId, candidateName, mine) =>
                      act(
                        { action: "vote", participantId: me?.id, target: "region", candidateId },
                        mine ? "투표를 취소했어요" : `${candidateName}에 투표했어요`
                      )
                    }
                  />
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
            {/* v19 §4-⑧: 지점 **등록** 칸에서는 투표 목록 대신 후보 등록 화면이 뜬다.
                   (등록 → 투표 시작(잠금) → 투표 순서라 두 화면이 겹치지 않는다) */}
            {!AI_CHAT_ENABLED && state.aiPhase === "place" && !state.placeVoteOpen ? (
              <PlacePicker
                state={state}
                isLeader={isLeader}
                busy={busy}
                myId={me?.id}
                onAction={act}
              />
            ) : (
            /* 후보 카드 — 현재 논의 대상 요약(탭하면 지지 의견 전송) */
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
            )}

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
          <ResultSection
            state={state}
            destRegion={destRegion}
            isLeader={isLeader}
            aiChatEnabled={AI_CHAT_ENABLED}
            onOpenRoute={setRouteFor}
            onOpenReserve={() => setShowReserve(true)}
            onToast={flash}
            // v11: '지점도 정하기' 승격 — 되돌릴 수 없으니 한 번 묻는다
            onPromoteToPlace={() => {
              if (!confirm("이 모임에서 만날 '지점'도 정하기로 할까요?\n되돌릴 수 없어요.")) return;
              void act({ action: "promoteToPlace", participantId: me?.id }, "지점 정하기를 시작했어요");
            }}
          />
        )}
      </div>

      {/* ── 방장 컨트롤 바 — 담당자 파일: sections/LeaderBar.tsx ──
           지난 단계를 보는 중엔(viewingPast) 실제 단계에 대한 조작을 의도치 않게
           누르지 않도록 아예 숨긴다(위 배너의 "현재 단계로"로 복귀). */}
      {showLeaderbar && (
        <LeaderBar
          stage={stage}
          state={state}
          busy={busy}
          aiChatEnabled={AI_CHAT_ENABLED}
          topRegionId={topRegionId}
          topPlaceId={topPlaceId}
          regionVoteCount={regionVoteCount}
          placeVoteCount={placeVoteCount}
          onAction={act}
          participantId={me?.id}
          onOpenManual={openManualConfirm}
        />
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

      {/* 가게 예약 · 선입금(모의) — 담당자 파일: sections/ReserveModal.tsx */}
      {showReserve && state.winnerPlace && (
        <ReserveModal
          state={state}
          place={state.winnerPlace}
          busy={busy}
          onConfirm={async () => {
            await act(
              { action: "reserve", participantId: me?.id, placeId: state.winnerPlace!.id },
              "예약·선입금 완료 (모의)"
            );
            setShowReserve(false);
          }}
          onClose={() => setShowReserve(false)}
        />
      )}

      {/* ── 디버그 위젯 (개발 빌드에서만) — 담당자 파일: sections/DebugWidget.tsx ── */}
      {DEV && (
        <DebugWidget
          state={state}
          isLeader={isLeader}
          busy={busy}
          onAutoOrigins={dbgAutoOrigins}
          onAutoOpinions={dbgAutoOpinions}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
      <BottomNav active="meetings" />
    </main>
  );
}

// ── 참가자별 이동시간 카드 (행 탭 → 경로 상세 시트) — 시안1·2 진입점 ──
