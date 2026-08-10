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
import JoinGate from "./sections/JoinGate";
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
import ParticipantBar from "./sections/ParticipantBar";
import MeetingHeader from "./sections/MeetingHeader";
import { abilitiesOf, stepOf, viewerRoleOf, type Step } from "@/lib/roles";
import { MAX_CANDIDATES } from "@/lib/types";
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

// v19 §8 — AI 추천 버튼(방장 opt-in). 안 누르면 호출되지 않아 0원이다.
// ⚠️ `lib/flags.ts` 가 아직 이 플래그를 갖고 있지 않아 여기서 env 를 직접 읽는다
//    (`app/api/ai-vote/route.ts` 도 같은 방식이다). 통합 시 FLAGS 로 옮긴다.
const AI_RECOMMEND_ENABLED = process.env.NEXT_PUBLIC_FF_AI_VOTE === "1";
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
  /**
   * v19 §4-⑧ 미리보기 핀 — `PlacePicker` 가 조회한 반경 내 장소.
   * 후보가 **아니다**. 지도에 회색으로 뜨고, 탭해야 후보가 된다.
   */
  /**
   * v19 §4-⑥ 지도 핑 — **누르자마자 등록하지 않는다.**
   * 지도를 스크롤·확대하다 손가락이 닿기만 해도 후보가 생겼고, 되돌릴 방법이
   * 없었다 (2026-08-10 제보). 좌표를 잠깐 들고 있다가 사람이 [등록]을 눌러야
   * 서버로 보낸다. (핑은 1인 1개라 개수가 늘지는 않지만, **내가 안 만든 후보가
   * 생기는 것** 자체가 문제다)
   */
  const [pendingPing, setPendingPing] = useState<{ lat: number; lng: number } | null>(null);
  const [previewPois, setPreviewPois] = useState<
    { id: string; name: string; lat: number; lng: number; category: string; emoji: string; rating: number; url: string }[]
  >([]);

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

  /**
   * 서버 액션 한 방. **실패해도 throw 하지 않고 `null` 을 돌려준다.**
   *
   * ⚠️ 예전에는 실패를 다시 throw 했다. 그런데 이 함수는 대부분
   *    `void act(...)` / `onClick={() => act(...)}` 처럼 **띄워 보내는** 식으로 쓰인다 —
   *    그 자리에서 거부되면 **처리되지 않은 promise rejection** 이 돼 콘솔에 에러로 남는다.
   *    서버가 **정상적으로** 거부하는 경우(후보 상한 초과·단계 변경)에도 그렇다.
   *    후보 상한 5개를 넣자마자 `check:screens` 가 이걸 런타임 에러로 잡았다(2026-08-10).
   *    "예상된 거부"와 "진짜 버그"가 콘솔에서 구분되지 않으면 검증이 무의미해진다.
   *
   *    결과를 봐야 하는 호출부는 **반환값이 null 인지**로 판단한다(throw 를 기다리지 않는다).
   */
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
      // ⚠️ 실패의 대부분은 "단계가 바뀌었어요"다 — 내 화면이 **옛 단계를 그리고 있다**는
      //    뜻이다. 사람에게 새로고침을 시키지 말고 여기서 바로 최신 상태를 당겨온다.
      //    (안 하면 시연 내내 단계마다 새로고침하게 된다)
      await load().catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  }

  // 채팅 전송 (버튼/칩 공용) — 부담을 낮추는 핵심 입력
  async function sendChat(text: string) {
    const t = text.trim();
    if (!t || !me) return;
    setChatText("");
    // `act` 는 실패해도 throw 하지 않는다 — **반환값**으로 판단한다 (위 주석 참고)
    const sent = await act({ action: "chat", participantId: me.id, text: t });
    if (!sent) setChatText(t); // 실패 시 입력 복원
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
    // ⚠️ **방장 화면 하나만** 재계산을 요청한다.
    //    참여자 기기까지 각자 요청하면 같은 계산이 인원수만큼 겹쳐,
    //    이동시간 호출 대기열(lib/routing.ts rateGate)이 폭발한다 —
    //    4대 리허설에서 확정 시점 재계산이 그 큐에 막혀 통째로 유실됐다.
    //    결과는 폴링으로 모두에게 똑같이 전달되므로 한 대만 요청해도 된다.
    if (!meRow?.isLeader) return;
    if (!originSig || originSig === regionsReqRef.current) return;
    regionsReqRef.current = originSig;
    fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action: "regions" }),
    })
      .then(() => load())
      .catch(() => {});
    // 방장 여부는 신원 로딩이 끝나야 확정된다 — 빠뜨리면 방장 화면에서도
    // 첫 렌더(참여자로 취급)에서만 돌고 다시 안 돈다.
  }, [originSig, code, load, meRow?.isLeader]);

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

  // ── v19 §4-⑤: 초대 링크로 들어왔는데 아직 신원이 없으면 **참여 폼이 먼저다** ──
  //  이게 없으면 팀원이 카톡 링크를 눌렀을 때 모임 화면만 열리고 자기 자리가 없어
  //  뭘 해야 할지 모른다(발표 시연 3단계가 여기서 멈춘다).
  //  ⚠️ 훅보다 **아래**에 둔다 — 조건부 return 위로 올리면 화면이 통째로 안 그려진다
  //     (이 화면에서 실제로 겪은 사고, app/m/[code]/CLAUDE.md §1).
  //  지난 모임은 새로 참여할 수 없으므로(v18) 그때는 게이트를 띄우지 않는다.
  if (!me && !state.isPast) {
    return (
      <JoinGate
        code={code}
        meetingName={state.name}
        onJoined={() => {
          setIds(getIdentities(code));
          setMe(getActive(code));
          void load();
        }}
      />
    );
  }

  // ── 역할 · 권한 (멘토링 8/6 §1 — `lib/roles.ts`) ────────────
  //  `isLeader &&` 를 화면 여기저기에 흩뿌리지 않는다. "무엇을 할 수 있는가"는
  //  한 표(`abilitiesOf`)에서만 나오고, 여기서는 그 답을 읽기만 한다.
  //  ⚠️ 이건 **보이게/안 보이게** 하는 층이다. 막는 것은 서버(`lib/store.ts`)가 한다.
  const isLeader = !!meRow?.isLeader;
  const role = viewerRoleOf(meRow);
  const step: Step = stepOf(state);
  const can = abilitiesOf(role, step, state.isPast);
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

  /**
   * 1위가 **둘 이상**인가 (1차 순서도 4번의 `동점?` 분기).
   *
   * ⚠️ 표가 하나도 없으면 전부 0표라 "동점"처럼 보이지만, 그건 아직 아무도 안 찍은
   *    것이지 동점이 아니다. 그때 재투표 버튼을 내면 눌러도 지울 표가 없다.
   */
  const isTied = (target: "region" | "place") => {
    const tally = target === "region" ? regionTally : placeTally;
    const pool = target === "region" ? state.regions : state.places;
    const counts = pool.map((c) => tally[c.id] ?? 0);
    const top = Math.max(0, ...counts);
    return top > 0 && counts.filter((n) => n === top).length > 1;
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
      {can.confirm && (
        <button className="btn ghost sm" disabled={busy} onClick={() => openManualConfirm(target)}>
          ✍ 다른 후보로 확정
        </button>
      )}
      {/* ── 1차 순서도 4번: `동점? → 방장 재량 선택 **또는 재투표**` ──
             예전엔 재량 확정만 있어서, 동점이면 방장이 혼자 고르는 수밖에 없었다.
             동점일 때만 낸다 — 늘 떠 있으면 "표를 지우는 버튼"이 상시 노출돼
             실수로 누르기 쉽다. */}
      {can.revote && isTied(target) && (
        <button
          className="btn ghost sm"
          disabled={busy}
          title="후보는 그대로 두고 표만 지웁니다"
          onClick={() => {
            if (!confirm("동점이에요. 재투표를 열까요?\n\n후보는 그대로 두고 표만 초기화됩니다.")) return;
            void act({ action: "revote", participantId: me?.id }, "재투표를 열었어요 — 표가 초기화됐어요");
          }}
        >
          🗳️ 재투표 (동점)
        </button>
      )}
    </div>
  );

  // 지도 위 투표 후보 박스 — 누르면 그 후보에 투표 (피그마)
  const phaseIsRegion = state.aiPhase === "region";
  // v19 §4-⑧ — 지점 **등록** 단계에서 지도에 띄우는 회색 미리보기 핀.
  // PlacePicker 가 조회한 결과를 그대로 올려 받는다(설계는 "핀 탭 → 후보 등록"이다).
  const placeRegisterStep = state.aiPhase === "place" && !state.placeVoteOpen;
  const mapCandidates: MapCandidate[] =
    AI_CHAT_ENABLED || stage === "result"
      ? []
      : phaseIsRegion
      ? state.regions.map((r) => ({
          id: r.id, lat: r.lat, lng: r.lng, name: r.name,
          votes: regionTally[r.id] ?? 0, mine: myRegionVote === r.id,
        }))
      : [
          ...state.places
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              id: p.id, lat: p.lat as number, lng: p.lng as number, name: p.name,
              votes: placeTally[p.id] ?? 0, mine: myPlaceVote === p.id,
            })),
          // 등록 단계에서만 — 투표가 열리면 미리보기는 사라진다(후보가 잠겼으므로)
          ...(placeRegisterStep
            ? previewPois.map((p) => ({
                id: p.id, lat: p.lat, lng: p.lng, name: p.name,
                votes: 0, mine: false, preview: true,
              }))
            : []),
        ];
  /**
   * v19 §7 — 지역 후보 삭제 권한.
   * 등록 단계에서만, 방장은 임의 후보 / 참여자는 **본인이 찍은 후보**만.
   * (서버가 같은 판정을 다시 한다 — 화면 잠금은 안내일 뿐이다)
   */
  const regionRegisterStep = step === "region-register";
  const canDeleteRegion = (id: string) => {
    if (!me || !can.ping) return false; // 핑을 찍을 수 있는 칸 = 지울 수도 있는 칸
    if (can.manageMeeting) return true; // 방장은 임의 후보
    const r = state.regions.find((x) => x.id === id);
    return !!r?.contributors?.includes(me.id);
  };
  const deleteRegion = (id: string, name: string) =>
    void act({ action: "removeRegion", participantId: me?.id, regionId: id }, `‘${name}’ 후보를 지웠어요`);

  /** 확인 시트에서 [등록]을 눌렀을 때만 서버로 보낸다 (v19 §4-⑥) */
  const actPing = (lat: number, lng: number) =>
    // 이름을 안 보낸다 — 서버가 동으로 스냅한다(실패하면 좌표 이름으로 폴백).
    // 인원당 1개·같은 동 병합도 서버 규칙이라 여기서 따지지 않는다.
    act({ action: "addRegion", participantId: me?.id, lat, lng }).then((d: unknown) => {
      const r = d as { existing?: boolean; candidate?: { name?: string } };
      // 무엇이 등록됐는지 **이름으로** 알려준다 — 뭐가 생겼는지 모르면 지울 수도 없다.
      flash(
        r?.existing
          ? `‘${r.candidate?.name}’에 핑을 모았어요`
          : `‘${r?.candidate?.name ?? "후보"}’ 등록 — 아래 목록에서 지울 수 있어요`
      );
    });

  const voteFromMap = (id: string) => {
    if (!me || busy) return;
    // ⚠️ 등록 단계에서 지도 위 후보를 누르면 **투표가 아니다.** 서버가 거부해서
    //    "단계가 바뀌었어요" 400 만 났다 — 눌리는 것처럼 보이는데 절대 안 되는
    //    상태가 가장 나쁘다. 무엇을 해야 하는지 알려준다 (2026-08-10 실측).
    if (regionRegisterStep) {
      flash("아직 등록 단계예요 — 방장이 [투표 시작]을 누르면 투표할 수 있어요");
      return;
    }
    // v19 §4-⑧ — 회색 미리보기 핀을 누르면 **투표가 아니라 후보 등록**이다.
    const pv = previewPois.find((p) => p.id === id);
    if (pv) {
      void act(
        {
          action: "addPlace", participantId: me.id,
          name: pv.name, category: pv.category, emoji: pv.emoji,
          lat: pv.lat, lng: pv.lng, rating: pv.rating, url: pv.url,
        },
        `‘${pv.name}’ 후보로 등록했어요`
      );
      return;
    }
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
  //  ── 하단 바는 **역할마다 다른 물건**이다 (멘토링 8/6 §1) ──
  //   방장  → `LeaderBar`      : 단계를 움직이는 버튼들
  //   참여자 → `ParticipantBar` : 지금 무슨 칸이고 내가 뭘 해야 하는지 (버튼 없음)
  //   지난 단계를 보는 중이거나 신원이 없으면 둘 다 안 뜬다.
  //  ⚠️ 비활성 버튼으로 방장 기능을 흉내내지 않는다 — 멘토가 명시적으로 불필요하다고 했다.
  const showLeaderbar = isLeader && !viewingPast;
  const showParticipantBar = role === "participant" && !viewingPast;
  const showBottomBar = showLeaderbar || showParticipantBar;
  return (
    <main className="device" style={{ paddingBottom: (showBottomBar ? 80 : 24) + 68 }}>
      {/* ── 상단 헤더 · 스텝 — 담당자 파일: sections/MeetingHeader.tsx ── */}
      <MeetingHeader
        state={state}
        isLeader={isLeader}
        identities={ids}
        activeId={me?.id}
        showDebugTools={DEV && FLAGS.debugTools}
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
          // ── v19 §4-⑥ 지도 핑 ──
          //  지역 후보 **등록 단계**에서만 켠다. 투표가 시작되면 서버가 거부하므로
          //  화면에서도 미리 꺼서 "눌리는데 안 되는" 상태를 만들지 않는다 (v5·v12).
          pingMode={!!me && !viewingPast && !state.isPast && stage === "main" && state.aiPhase === "region"}
          onMapPing={(lat, lng) => setPendingPing({ lat, lng })}
        />

        {/* 지도 핑 확인 — 여기서 [등록]을 눌러야 후보가 생긴다 */}
        {pendingPing && (
          <div className="v8-overlay" onClick={() => setPendingPing(null)}>
            <div className="v8-modal stack" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
              <div>
                <span className="eyebrow">지역 후보 등록</span>
                <h2 className="sec" style={{ marginTop: 4 }}>여기로 등록할까요?</h2>
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                누른 자리는 <b>동 단위로 정리</b>돼요. 같은 동을 여럿이 찍으면 하나로 합쳐지고,
                <b> 내 핑은 1개</b>라 다른 곳을 찍으면 그쪽으로 옮겨가요.
              </p>
              <span className="chip line" style={{ alignSelf: "flex-start", fontFamily: "ui-monospace, monospace" }}>
                {pendingPing.lat.toFixed(4)}, {pendingPing.lng.toFixed(4)}
              </span>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  const { lat, lng } = pendingPing;
                  setPendingPing(null);
                  // 이름을 안 보낸다 — 서버가 동으로 스냅한다(실패하면 좌표 이름으로 폴백).
                  void actPing(lat, lng);
                }}
              >
                📍 여기로 등록
              </button>
              <button className="btn ghost" onClick={() => setPendingPing(null)}>취소</button>
            </div>
          </div>
        )}

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

            <ParticipantList
              state={state}
              isLeader={isLeader}
              // v10: 강퇴는 되돌릴 수 없는 축에 속하니 한 번 묻는다 (재참여는 가능)
              onKick={(targetId, name) => {
                if (!confirm(`${name} 님을 모임에서 내보낼까요?\n그 사람의 핑과 표도 함께 지워져요. (다시 참여할 수는 있어요)`)) return;
                void act({ action: "kick", participantId: me?.id, targetId }, `${name} 님을 내보냈어요`);
              }}
            />

            {/* ── 거점(지역) 투표 — 출발지가 모이면 이 화면에서 바로 투표한다 ── */}
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  {/* 등록 칸과 투표 칸은 같은 카드를 쓴다 — 제목까지 같으면
                      "왜 투표 버튼이 없지?" 가 된다 (v19 §5 는 두 칸을 나눈다) */}
                  <span className="eyebrow">2. {regionRegisterStep ? "거점 후보 등록" : "거점 투표"}</span>
                  <h2 className="sec" style={{ marginTop: 4 }}>
                    {regionRegisterStep ? "어디쯤에서 볼까요?" : "어디서 만날까요?"}
                  </h2>
                </div>
                <span className="chip line" style={{ fontSize: 10 }}>
                  {regionRegisterStep
                    // 상한을 **미리** 보여준다 — 다 차고 나서 거부당하면 늦다 (2차 그릴링)
                    ? `후보 ${state.regions.length}/${MAX_CANDIDATES}`
                    : `${regionVoteCount}/${state.totalParticipants}명 투표`}
                </span>
              </div>

              {state.regions.length === 0 ? (
                // ⚠️ 예전 문구는 "후보를 계산하고 있어요…" 였다. 서버가 후보를 자동으로
                //    깔던 시절의 문구다. 이제 후보는 **사람이 찍어야** 생기므로
                //    (멘토링 8/6 §2), 기다리라고 하면 아무 일도 일어나지 않는다.
                <div className="stack" style={{ gap: 6 }}>
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                    {state.originsSet === 0
                      ? "먼저 출발지를 등록해 주세요. 그래야 후보마다 각자 얼마나 걸리는지 보여드릴 수 있어요."
                      : "아직 후보가 없어요 — 위 지도에서 만나고 싶은 곳을 눌러 후보로 등록해 주세요."}
                  </p>
                  {state.originsSet > 0 && (
                    <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                      {isLeader
                        ? "고르기 어려우면 아래 ‘추천’ 버튼을 눌러 공평한 지역 3곳을 후보에 올릴 수 있어요."
                        : "방장이 추천 후보를 올려 줄 수도 있어요."}
                    </p>
                  )}
                </div>
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
                    // ⚠️ 등록 단계에서는 투표 버튼을 그리지 않는다 — 서버가 표를
                    //    거부하므로(v12) 누를 때마다 "단계가 바뀌었어요" 만 떴다.
                    //    투표는 방장이 [투표 시작]을 누른 뒤부터다 (v19 §5).
                    votable={!regionRegisterStep}
                    onVote={(candidateId, candidateName, mine) =>
                      act(
                        { action: "vote", participantId: me?.id, target: "region", candidateId },
                        mine ? "투표를 취소했어요" : `${candidateName}에 투표했어요`
                      )
                    }
                    canDelete={canDeleteRegion}
                    onDelete={deleteRegion}
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
                onPreview={setPreviewPois}
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
            // v10: 모임 삭제 — 되돌릴 수 없다. 모임 이름을 한 번 더 확인시킨다.
            onAction={act}
            busy={busy}
            myId={me?.id}
            // v2·v16: 모임 시간 — 생성 폼이 원칙이고 여기선 변경만. 과거는 서버가 막는다.
            onEditTime={() => {
              const cur = state.meetTime ? new Date(state.meetTime) : new Date(Date.now() + 3600_000);
              const pad = (n: number) => String(n).padStart(2, "0");
              const suggest = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())} ${pad(cur.getHours())}:${pad(cur.getMinutes())}`;
              const input = prompt("모임 시간을 입력하세요 (예: 2026-08-14 19:00)", suggest);
              if (!input) return;
              // `new Date("YYYY-MM-DD HH:mm")` 는 로컬 시각으로 해석된다 — 의도한 동작이다.
              const d = new Date(input.replace(/-/g, "/"));
              if (Number.isNaN(d.getTime())) return flash("⚠ 시간을 알아볼 수 없어요");
              void act({ action: "meetTime", participantId: me?.id, meetTime: d.toISOString() }, "모임 시간을 정했어요");
            }}
            // v18: 지난 모임 → 같은 멤버로 새 모임. 로그인 멤버만 자동 이전(v17).
            onRecreate={() => {
              if (!confirm("이 멤버로 새 모임을 만들까요?\n카카오 로그인한 멤버만 자동으로 옮겨가요.")) return;
              void act({ action: "recreate", participantId: me?.id }).then((d: any) => {
                if (d?.code) {
                  addIdentity(d.code, { id: d.participantId, name: me?.name ?? "방장", isLeader: true });
                  location.href = `/m/${d.code}`;
                }
              });
            }}
            onDeleteMeeting={() => {
              if (!confirm(`'${state.name}' 모임을 삭제할까요?\n참여자·후보·표가 전부 사라지고 되돌릴 수 없어요.`)) return;
              void act({ action: "deleteMeeting", participantId: me?.id }).then(() => {
                location.href = "/meetings";
              });
            }}
          />
        )}
      </div>

      {/* ── 참여자 하단 바 — 담당자 파일: sections/ParticipantBar.tsx ──
           방장 바의 짝이다. 예전엔 참여자 화면 하단이 **비어 있어서**
           지금 무슨 단계인지도, 뭘 해야 하는지도 알 수 없었다 (멘토링 8/6 §1). */}
      {showParticipantBar && <ParticipantBar step={step} state={state} myId={me?.id} />}

      {/* ── 방장 컨트롤 바 — 담당자 파일: sections/LeaderBar.tsx ──
           지난 단계를 보는 중엔(viewingPast) 실제 단계에 대한 조작을 의도치 않게
           누르지 않도록 아예 숨긴다(위 배너의 "현재 단계로"로 복귀). */}
      {showLeaderbar && (
        <LeaderBar
          stage={stage}
          state={state}
          busy={busy}
          aiRecommendEnabled={AI_RECOMMEND_ENABLED}
          // v19 §8 — AI 추천은 방장 opt-in. 재호출이면 교체/추가를 먼저 묻는다 (v14).
          onAiRecommend={(hasPrev) => {
            let mode: "replace" | "append" = "replace";
            if (hasPrev) {
              // 세 갈래(교체 / 추가 / 취소)를 confirm 두 번으로 낸다.
              // ⚠️ '추가'를 고르면 수동 병합 후보는 물론 이전 AI 후보도 남는다.
              const replace = confirm(
                "추천 후보가 이미 있어요.\n\n[확인] 이전 추천 후보를 교체\n[취소] 이전 것에 추가"
              );
              mode = replace ? "replace" : "append";
            }
            // LLM 이 꺼져 있으면 점수 기반 추천으로 떨어진다 (LeaderBar 주석 참고).
            // 지점 단계는 LLM 경로에만 있어 버튼 자체가 안 뜨므로 여기 오지 않는다.
            if (AI_RECOMMEND_ENABLED) {
              void act({ action: "aiRecommend", participantId: me?.id, mode }, "AI 추천을 받았어요");
            } else {
              void act(
                { action: "suggestRegions", participantId: me?.id, mode },
                "추천 지역 3곳을 후보에 올렸어요 (이동시간·편차 기준)"
              );
            }
          }}
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

      {/* ── 디버그 위젯 — 담당자 파일: sections/DebugWidget.tsx ──
             개발 빌드 **이면서** 플래그를 켠 사람에게만. 기본은 꺼져 있다.
             ⚠️ 발표는 `npm run dev:lan`(개발 모드)으로 도는데, 예전엔 `DEV` 만
                보고 떠서 **시연 화면에 🐞 버튼이 그대로 있었다.** */}
      {DEV && FLAGS.debugTools && (
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
