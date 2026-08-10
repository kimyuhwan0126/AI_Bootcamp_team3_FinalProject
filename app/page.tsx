"use client";

// ─────────────────────────────────────────────────────────────
// v8 홈 (비회원 메인) — v8 클릭 프로토타입 기준
//  검색(자동완성) → 출발지 칩(최대 8) → 중간지점 추천(공평 스코어)
//  → 카카오맵 표시 → 주변 카페/음식점/술집/교통 리스트
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import KakaoMap, { MapPin, MapRoute, MapCandidate, pinColor, KAKAO_JS_KEY_SET } from "./components/KakaoMap";
import BottomNav from "./components/v8/BottomNav";
import V8Header from "./components/v8/V8Header";
import Splash from "./components/v8/Splash";
import StepIcons from "./components/v8/StepIcons";
import { IcSearch, IcPlus } from "./components/v8/Icons";
import { recommendRegions, arrivalStatus, ARRIVAL_COLOR, ARRIVAL_LABEL } from "@/lib/geo";
import { formatMinutes, formatGap } from "@/lib/format";
import type { Participant, RegionCandidate } from "@/lib/types";
import type { GeoSuggest } from "./api/geocode/route";
import type { NearbyItem } from "./api/places/route";
import type { MeetingState } from "@/lib/types";
import { loginAsKakao } from "@/lib/session";
import { useSession } from "./components/v8/useSession";
import { getIdentities, setActive, type Identity } from "@/lib/identity";

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

type Transport = "transit" | "car";

interface Origin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 이 출발지의 이동수단 — 칩을 눌러 언제든 바꿀 수 있다 */
  transport: Transport;
}

const TRANSPORTS: { key: Transport; label: string }[] = [
  { key: "transit", label: "대중교통" },
  { key: "car", label: "자차" },
];
// 칩 위에 얹는 작은 이동수단 표식
const TRANSPORT_ICON: Record<Transport, string> = { transit: "🚇", car: "🚗" };

// 주변 리스트 썸네일 — 카카오 분류 전체 경로로 판단
// (마지막 칸은 브랜드명이라 "파스쿠찌" 같은 값이 들어와 매칭되지 않는다)
function thumbFor(path: string): string {
  if (path.includes("주차")) return "🅿️";
  if (path.includes("버스")) return "🚌";
  if (path.includes("지하철") || path.includes("전철")) return "🚇";
  if (path.includes("카페") || path.includes("커피")) return "☕";
  if (path.includes("술") || path.includes("주점") || path.includes("호프") || path.includes("바(BAR)")) return "🍶";
  return "🍽️";
}

const ORIGINS_KEY = "moimer:v8:origins";
const CATS: { key: string; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "cafe", label: "카페" },
  { key: "food", label: "음식점" },
  { key: "pub", label: "술집" },
  { key: "parking", label: "주차장" },
  { key: "station", label: "정류장·역" },
];

export default function Home() {
  const { session } = useSession();
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [query, setQuery] = useState("");
  const [suggests, setSuggests] = useState<GeoSuggest[] | null>(null);
  const [midpoint, setMidpoint] = useState<RegionCandidate | null>(null);
  const [criteria, setCriteria] = useState<"dist" | "time">("dist");
  const [cat, setCat] = useState("all");
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [mapFail, setMapFail] = useState(false);
  /** 칩을 눌러 편집 중인 출발지 id */
  const [editing, setEditing] = useState<string | null>(null);
  const [defaultTransport, setDefaultTransport] = useState<Transport>("transit");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [midLoading, setMidLoading] = useState(false);
  /** 주변 리스트가 실제 카카오 응답인지, 키 실패로 인한 샘플인지 */
  const [nearbyMock, setNearbyMock] = useState(false);
  /** 지도 보기 범위 — me: 내 출발지 중심 / all: 전체가 보이게 */
  const [mapView, setMapView] = useState<"me" | "all">("all");
  // 출발지가 여러 개면 경로선이 다 겹쳐 스파게티처럼 보인다 — 칩을 눌러 특정
  // 출발지 하나만 진하게 보고, 나머지는 옅게 뺀다. null이면 아무도 포커스 안 한 상태.
  const [focusOriginId, setFocusOriginId] = useState<string | null>(null);
  /** 시간순 결과가 실 API로 계산됐는지 (null = 거리순) */
  const [midLive, setMidLive] = useState<boolean | null>(null);
  /** 내가 속한 모임들 (로그인 시) */
  const [myMeetings, setMyMeetings] = useState<MeetingState[]>([]);
  /** 선택된 모임 코드 — null 이면 "직접 입력"(비회원 탐색) 모드 */
  const [meetCode, setMeetCode] = useState<string | null>(null);
  const [meetOpen, setMeetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // + 칩이 검색창으로 데려다줄 때 쓰는 ref
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 저장된 출발지 복원 + 카카오 로그인 콜백(?name=) → 정식회원 세션 승격
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORIGINS_KEY) || "[]") as Origin[];
      // 이동수단 도입 이전에 저장된 출발지 보정
      setOrigins(saved.map((o) => ({ ...o, transport: o.transport ?? "transit" })));
    } catch {
      /* 무시 */
    }
    try {
      const p = JSON.parse(localStorage.getItem("moimer:v8:profile") || "null");
      if (p?.transport) setDefaultTransport(p.transport as Transport);
    } catch {
      /* 무시 */
    }
    const q = new URLSearchParams(window.location.search);
    const name = q.get("name");
    if (name) {
      loginAsKakao(name);
      window.history.replaceState({}, "", "/");
      return;
    }
    // 카카오 로그인 실패 사유를 화면에 그대로 노출 (원인 파악용)
    const err = q.get("err");
    if (err) {
      const step = q.get("step") || "";
      const detail = q.get("detail") || "";
      setLoginErr(
        err === "nokey"
          ? "KAKAO_REST_API_KEY가 설정되지 않았어요. .env.local에 넣고 서버를 재시작해주세요."
          : `카카오 로그인 실패 (${step || err})${detail ? ` — ${detail}` : ""}`
      );
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // 로그인 상태면 내 모임을 불러온다 (모임 선택 → 그 모임 참여자를 지도에 표시)
  useEffect(() => {
    if (!session) {
      setMyMeetings([]);
      setMeetCode(null);
      return;
    }
    let alive = true;
    (async () => {
      const states = await Promise.all(
        myCodes().map(async (c) => {
          try {
            const r = await fetch(`/api/meeting?code=${c}`);
            return r.ok ? ((await r.json()) as MeetingState) : null;
          } catch {
            return null;
          }
        })
      );
      if (!alive) return;
      const list = states.filter((s): s is MeetingState => s !== null);
      setMyMeetings(list);
      // 모임이 있으면 첫 모임을 기본 선택 (개인 출발지가 그대로 남지 않도록)
      setMeetCode((cur) => cur ?? (list[0]?.code ?? null));
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  const selectedMeeting = meetCode ? myMeetings.find((m) => m.code === meetCode) ?? null : null;

  // ── 모임 투표 (피그마: 투표는 홈 셸 안에서 진행) ──────────────
  // 선택된 모임은 폴링으로 최신화 — 다른 참여자의 표가 실시간 반영된다
  const refreshMeeting = useCallback(async (code: string) => {
    try {
      const r = await fetch(`/api/meeting?code=${code}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as MeetingState;
      setMyMeetings((ms) => ms.map((m) => (m.code === d.code ? d : m)));
    } catch {
      /* transient */
    }
  }, []);
  useEffect(() => {
    if (!meetCode) return;
    const t = setInterval(() => refreshMeeting(meetCode), 2500);
    return () => clearInterval(t);
  }, [meetCode, refreshMeeting]);

  // 이 기기의 참가자 신원 — "누구로 투표할까요?" 드롭다운
  const [voterId, setVoterId] = useState<string | null>(null);
  const [voterIds, setVoterIds] = useState<Identity[]>([]);
  useEffect(() => {
    if (!meetCode) {
      setVoterId(null);
      setVoterIds([]);
      return;
    }
    const list = getIdentities(meetCode);
    setVoterIds(list);
    setVoterId((cur) => (cur && list.some((i) => i.id === cur) ? cur : list[0]?.id ?? null));
  }, [meetCode]);

  // 출발지 구성이 바뀌면 거점 후보 재계산 (단계 전환 없음 — 홈에서 바로 투표)
  const meetingOriginSig = selectedMeeting
    ? selectedMeeting.code +
      "|" +
      selectedMeeting.participants
        .filter((p) => p.lat != null)
        .map((p) => `${p.id}:${p.lat},${p.lng},${p.transport}`)
        .join("|")
    : "";
  const regionsReqRef = useRef("");
  useEffect(() => {
    if (!selectedMeeting || selectedMeeting.participants.every((p) => p.lat == null)) return;
    if (regionsReqRef.current === meetingOriginSig) return;
    regionsReqRef.current = meetingOriginSig;
    fetch("/api/meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: selectedMeeting.code, action: "regions" }),
    })
      .then(() => refreshMeeting(selectedMeeting.code))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingOriginSig]);

  const [voteBusy, setVoteBusy] = useState(false);
  const meetAct = useCallback(
    async (body: Record<string, unknown>) => {
      if (!selectedMeeting) return;
      setVoteBusy(true);
      try {
        await fetch("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: selectedMeeting.code, ...body }),
        });
        await refreshMeeting(selectedMeeting.code);
      } finally {
        setVoteBusy(false);
      }
    },
    [selectedMeeting, refreshMeeting]
  );

  // 진행 단계: 0 거점 투표 / 1 가게 투표 / 2 최종 확정
  const votePhase: 0 | 1 | 2 = !selectedMeeting
    ? 0
    : selectedMeeting.stage === "result"
    ? 2
    : selectedMeeting.aiPhase === "place"
    ? 1
    : 0;
  const regionVotes = selectedMeeting?.regionVotes ?? {};
  const placeVotes = selectedMeeting?.placeVotes ?? {};
  const voteBox = votePhase === 0 ? regionVotes : placeVotes;
  const votePool: { id: string; name: string }[] =
    votePhase === 0 ? selectedMeeting?.regions ?? [] : selectedMeeting?.places ?? [];
  const tallyOf = useCallback(
    (id: string) => Object.values(voteBox).filter((v) => v === id).length,
    [voteBox]
  );
  const myVote = voterId ? voteBox[voterId] : undefined;
  const topCandidate =
    votePool.length === 0
      ? null
      : votePool.reduce((best, c) => (tallyOf(c.id) > tallyOf(best.id) ? c : best));
  const voterIsLeader = !!selectedMeeting?.participants.find((p) => p.id === voterId)?.isLeader;

  // 모임 시간(확정용) — 피그마: 최종 확정 전에 방장이 입력
  const [meetTime, setMeetTime] = useState("");
  useEffect(() => {
    setMeetTime(selectedMeeting?.prefs?.timeText ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetCode]);
  const saveMeetTime = useCallback(() => {
    if (!selectedMeeting || !voterIsLeader) return;
    const t = meetTime.trim();
    if (t === (selectedMeeting.prefs?.timeText ?? "")) return;
    void meetAct({ action: "meetTime", participantId: voterId, time: t });
  }, [selectedMeeting, voterIsLeader, meetTime, voterId, meetAct]);

  // 화면/계산에 쓸 출발지 — 모임 선택 시 그 모임 참여자, 아니면 내가 직접 넣은 것
  // useMemo 필수: 매 렌더마다 새 배열이면 아래 useEffect 들이 무한 재실행된다.
  const activeOrigins: Origin[] = useMemo(
    () =>
      selectedMeeting
        ? selectedMeeting.participants
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              id: p.id,
              name: p.origin || p.name,
              lat: p.lat as number,
              lng: p.lng as number,
              transport: (p.transport as Transport) ?? "transit",
            }))
        : origins,
    [selectedMeeting, origins]
  );

  function saveOrigins(next: Origin[]) {
    setOrigins(next);
    localStorage.setItem(ORIGINS_KEY, JSON.stringify(next));
  }

  // 검색 자동완성 (300ms 디바운스)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setSuggests(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setSuggests(d.items || []);
      } catch {
        setSuggests([]);
      }
    }, 300);
  }, [query]);

  // 검색 결과를 누르면 곧바로 출발지로 추가하고, 이동수단 선택 시트를 이어서 연다.
  function addOrigin(s: GeoSuggest) {
    if (origins.length >= 8) return;
    // 새 출발지는 내정보의 기본 이동수단을 따라가고, 칩을 눌러 개별 변경 가능
    const next = [...origins, { id: `o${Date.now()}`, name: s.name, lat: s.lat, lng: s.lng, transport: defaultTransport }];
    saveOrigins(next);
    setQuery("");
    setSuggests(null);
    setEditing(next[next.length - 1].id); // 추가 직후 이동수단을 고르도록 시트를 연다
  }

  function removeOrigin(id: string) {
    saveOrigins(origins.filter((o) => o.id !== id));
    setEditing(null);
  }

  function updateOrigin(id: string, patch: Partial<Origin>) {
    saveOrigins(origins.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  // 중간지점 재계산 — 거리순은 즉시(로컬), 시간순은 ODsay/TMAP 실 이동시간(API)
  useEffect(() => {
    if (activeOrigins.length < 2) {
      setMidpoint(null);
      setNearby([]);
      setMidLive(null);
      return;
    }
    const pseudo: Participant[] = activeOrigins.map((o, i) => ({
      id: o.id,
      name: o.name || `출발지 ${i + 1}`,
      isLeader: i === 0,
      headcount: 1,
      origin: o.name,
      lat: o.lat,
      lng: o.lng,
      transport: o.transport,
      status: null,
      etaText: null,
      // 홈의 가짜 참가자 — 아직 모임이 아니라 PIN·카카오·지각 개념이 없다.
      // (확정하면 '미배정 핑'으로 모임에 이관되고, 그때 참여자가 자기 것을 고른다 — v5)
      pin: null,
      pinFails: 0,
      kakaoId: null,
      lateMin: null,
    }));

    // 🔴 **거리순도 서버를 거친다.** 예전엔 여기서 `recommendRegions(pseudo)` 를
    //    브라우저가 직접 불렀는데, 그러면 후보가 **하드코딩 28곳**으로만 나온다 —
    //    실제 역을 찾는 카카오 REST 키는 **서버에만** 있기 때문이다.
    //
    //    2026-08-06 실측: 노원+의정부에서 **시간순은 `장암역`(실제 역), 거리순은
    //    `종로3가`(하드코딩)** 가 떴다. 같은 화면의 두 버튼이 서로 다른 세계를 보고 있었다.
    //    `/api/midpoint` 안에서 두 모드가 후보를 공유하도록 고쳤는데(#52),
    //    **거리순이 그 API 를 타지 않아 절반만 고쳐진 상태**였다.
    //
    //    ⚠️ 거리순은 여전히 **이동시간 API(ODsay/TMAP)를 안 부른다** — 서버가
    //       `mode:"dist"` 로 직선거리 계산만 한다. 늘어나는 건 후보를 찾는 카카오 1콜뿐이고,
    //       같은 중심이면 서버 캐시(10분)가 받아낸다.
    const mode = criteria === "dist" ? "dist" : "time";

    // 응답이 늦게 와도 마지막 요청만 반영
    let alive = true;
    setMidLoading(true);
    fetch("/api/midpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: pseudo, mode }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMidpoint(d.items?.[0] || null);
        // 거리순은 정의상 전부 추정이라 `live` 를 쓰지 않는다 — 화면 문구도
        // `criteria !== "time"` 이면 무조건 `거리 추정` 이다(아래 v8-mapnote).
        setMidLive(mode === "time" ? !!d.live : null);
      })
      .catch(() => {
        if (!alive) return;
        // 서버가 죽어도 화면이 비지 않게 — 브라우저에서 하드코딩 후보로라도 계산한다.
        setMidpoint(recommendRegions(pseudo)[0] || null);
        setMidLive(false);
      })
      .finally(() => {
        if (alive) setMidLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeOrigins, criteria]);

  // 주변 정보 로드 — 응답의 mock 플래그를 그대로 보관해 화면에 표시
  const loadNearby = useCallback(async () => {
    if (!midpoint) return;
    try {
      const r = await fetch(`/api/places?lat=${midpoint.lat}&lng=${midpoint.lng}&cat=${cat}`);
      const d = await r.json();
      setNearby(d.items || []);
      setNearbyMock(!!d.mock);
    } catch {
      setNearby([]);
      setNearbyMock(false);
    }
  }, [midpoint, cat]);
  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  // 도착 신호등 — 참가자가 모임원 탭에서 직접 남긴 상태를 우선한다.
  // 없으면(그리고 거점이 확정된 뒤라면) 이동시간 기반 공평성 추정으로 대신한다.
  // 확정 전(투표 중)에는 아직 "늦음"을 매길 destination이 없으므로 표시하지 않는다.
  const winPer = selectedMeeting?.winnerRegion?.perParticipant;
  const winMins = winPer?.map((x) => x.min);
  const statusColorFor = (pid: string): string | undefined => {
    const self = selectedMeeting?.participants.find((x) => x.id === pid)?.status;
    if (self) return ARRIVAL_COLOR[self];
    if (!winPer || !winMins || winMins.length === 0) return undefined;
    const m = winPer.find((x) => x.pid === pid)?.min;
    return m == null ? undefined : ARRIVAL_COLOR[arrivalStatus(m, winMins)];
  };

  // 지도 핀 = 출발지 칩과 동일한 색/번호로 통일
  const pins: MapPin[] = activeOrigins.map((o, i) => ({
    lat: o.lat,
    lng: o.lng,
    label: o.name,
    color: pinColor(i),
    index: i + 1,
    statusColor: statusColorFor(o.id),
    focused: focusOriginId === o.id,
  }));
  const focusIndex = Math.max(0, activeOrigins.findIndex((o) => o.id === focusOriginId));

  // 칩(지도 핀)을 눌러 그 출발지의 경로만 강조 — 다시 누르면 전체 보기로 복귀
  function toggleFocus(id: string) {
    if (focusOriginId === id) {
      setFocusOriginId(null);
      setMapView("all");
    } else {
      setFocusOriginId(id);
      setMapView("me");
    }
  }
  // 중간지점 핀 — 모임 모드에선 확정된 거점만 표시(거점 투표 중에는 후보 박스가 그 자리를 대신한다)
  //
  // ⚠️ `name` 을 따로 들고 다니는 이유: 지도 SDK 가 실패했을 때의 폴백 문구도
  //    **이 값**을 써야 한다. 예전엔 거기서 `midpoint.name`(홈이 자체 계산한 값)을
  //    직접 읽어서, 모임을 고른 상태에선 확정 거점과 달랐다 —
  //    **같은 화면이 중간지점을 두 개로 말했다**(2026-08-06 실측: 지도 자리
  //    "중간 추천: 왕십리" · 바로 아래 카드 "중간 추천 지역: 교대").
  //    지도가 정상이면 그 자리가 안 보여서 지금까지 안 잡혔다.
  const center = selectedMeeting
    ? selectedMeeting.winnerRegion
      ? {
          lat: selectedMeeting.winnerRegion.lat,
          lng: selectedMeeting.winnerRegion.lng,
          name: selectedMeeting.winnerRegion.name,
          label: `중간 추천 지역 · ${selectedMeeting.winnerRegion.name}`,
        }
      : null
    : midpoint
    ? { lat: midpoint.lat, lng: midpoint.lng, name: midpoint.name, label: `중간 추천 지역 · ${midpoint.name}` }
    : null;

  // 지도 위 투표 후보 박스 — 피그마: "지도에서 후보를 눌러 투표하세요"
  const mapCandidates: MapCandidate[] = useMemo(() => {
    if (!selectedMeeting || votePhase === 2) return [];
    if (votePhase === 0)
      return selectedMeeting.regions.map((r) => ({
        id: r.id, lat: r.lat, lng: r.lng, name: r.name,
        votes: Object.values(regionVotes).filter((v) => v === r.id).length,
        mine: myVote === r.id,
      }));
    return selectedMeeting.places
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        id: p.id, lat: p.lat as number, lng: p.lng as number, name: p.name,
        votes: Object.values(placeVotes).filter((v) => v === p.id).length,
        mine: myVote === p.id,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeeting, votePhase, myVote, JSON.stringify(regionVotes), JSON.stringify(placeVotes)]);

  // 각 출발지 → 중간지점 경로 (자차는 TMAP 실 도로, 그 외는 직선 근사)
  // 모임 모드에선 확정된 거점이 목적지 — 거점 투표 중에는 경로를 그리지 않는다.
  const routeDest = selectedMeeting
    ? selectedMeeting.winnerRegion
      ? { lat: selectedMeeting.winnerRegion.lat, lng: selectedMeeting.winnerRegion.lng }
      : null
    : midpoint
    ? { lat: midpoint.lat, lng: midpoint.lng }
    : null;
  const routeDestKey = routeDest ? `${routeDest.lat},${routeDest.lng}` : "";
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  useEffect(() => {
    if (!routeDest || activeOrigins.length === 0) {
      setRoutes([]);
      return;
    }
    let alive = true;
    fetch("/api/route-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dest: routeDest,
        origins: activeOrigins.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, transport: o.transport })),
      }),
    })
      .then((r) => r.json())
      .then((d: { paths?: { id: string; points: { lat: number; lng: number }[]; real: boolean }[] }) => {
        if (!alive) return;
        const idx = new Map(activeOrigins.map((o, i) => [o.id, i]));
        setRoutes(
          (d.paths ?? []).map((p) => ({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDestKey, activeOrigins]);

  // 경로 강조 — 출발지가 여러 개일 때 전부 진하게 그리면 스파게티처럼 겹쳐 보인다.
  //  · 특정 출발지를 포커스했으면: 그 경로만 진하게, 나머지는 아주 옅게.
  //  · "전체 위치 보기"(포커스 없음): 다 보이되 겹쳐도 구분되도록 옅고 살짝 얇게.
  const displayRoutes: MapRoute[] = useMemo(() => {
    if (focusOriginId) {
      return routes.map((r) => {
        if (r.id === focusOriginId) return r; // 기본(real 기반) 두께·불투명도 그대로
        return { ...r, opacity: 0.1, weight: 2 };
      });
    }
    return routes.map((r) => ({ ...r, opacity: r.real ? 0.6 : 0.35, weight: r.real ? 4 : 2.5 }));
  }, [routes, focusOriginId]);

  const editingOrigin = editing ? origins.find((o) => o.id === editing) ?? null : null;

  return (
    <main className="device v8-page">
      <Splash />
      <V8Header />

      {loginErr && (
        <div
          style={{
            margin: "0 16px 8px", padding: "10px 12px", borderRadius: 12,
            background: "var(--warn-soft)", color: "var(--warn)",
            fontSize: 11.5, fontWeight: 700, lineHeight: 1.5,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}
        >
          <span style={{ flex: 1, wordBreak: "break-all" }}>{loginErr}</span>
          <button
            onClick={() => setLoginErr(null)}
            style={{ border: 0, background: "none", color: "inherit", cursor: "pointer", fontWeight: 900, font: "inherit" }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 모임 선택 — 목업의 "협성대 브레인스파크 모임 ▾" 바 */}
      {myMeetings.length > 0 && (
        <div className="v8-searchwrap" style={{ marginBottom: 6, position: "relative" }}>
          <button className="v8-meetbar" onClick={() => setMeetOpen((v) => !v)} aria-expanded={meetOpen}>
            {selectedMeeting ? (
              <>
                <b>{selectedMeeting.name.replace(/\s*모임$/, "")}</b>
                <span className="suffix">모임</span>
              </>
            ) : (
              <b>직접 출발지 넣어보기</b>
            )}
            <span className="caret" aria-hidden>▾</span>
          </button>

          {meetOpen && (
            <div className="v8-meetmenu">
              {myMeetings.map((m) => (
                <button
                  key={m.code}
                  className={m.code === meetCode ? "on" : ""}
                  onClick={() => { setMeetCode(m.code); setMeetOpen(false); }}
                >
                  <b>{m.name}</b>
                  <span>참여자 {m.participants.length}명 · 코드 {m.code}</span>
                </button>
              ))}
              <button
                className={meetCode === null ? "on" : ""}
                onClick={() => { setMeetCode(null); setMeetOpen(false); }}
              >
                <b>직접 출발지 넣어보기</b>
                <span>모임과 무관하게 중간지점만 찾아볼 때</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 검색 + 자동완성 — 모임 모드에서는 참여자 출발지를 쓰므로 숨긴다.
          검색 결과를 누르면 곧바로 출발지로 추가되고(+선택→확인 이중 클릭 없이),
          이어서 이동수단 선택 시트가 열린다. */}
      {!selectedMeeting && (
      <div className="v8-searchwrap">
        <div className="v8-search">
          <IcSearch />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어디에서 출발하시나요?"
            disabled={origins.length >= 8}
          />
        </div>
        {suggests !== null && (
          <div className="v8-ac">
            {suggests.length === 0 ? (
              <div className="empty">검색 결과가 없어요.</div>
            ) : (
              // (+)는 "이 줄을 누르면 출발지로 추가된다"는 표시 — 줄 전체가 버튼이다
              suggests.map((s) => (
                <button key={`${s.name}${s.lat}`} className="ac-row" onClick={() => addOrigin(s)}>
                  <span className="ac-txt">
                    <b>{s.name}</b>
                    <span className="addr">{s.address}</span>
                  </span>
                  <span className="ac-add" aria-hidden="true">
                    <IcPlus />
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      )}

      {/* 출발지 칩 — 모임 모드면 참여자(읽기 전용), 아니면 내가 넣은 출발지(편집 가능) */}
      <div className="v8-chips">
        {selectedMeeting
          ? activeOrigins.map((o, i) => {
              const p = selectedMeeting.participants.find((x) => x.id === o.id);
              const sc = statusColorFor(o.id);
              const focused = focusOriginId === o.id;
              // 목업과 동일: 원 안에는 출발지, 아래에는 참여자 이름.
              // 도착 신호등이 있으면 원 채우기를 그 색으로 하고, 참가자 구분색은
              // 테두리로 돌린다(지도 경로선과 매칭을 잃지 않도록).
              // 누르면 이 출발지의 경로만 지도에서 진하게 강조된다(다시 누르면 해제).
              return (
                <button key={o.id} className="v8-chip" onClick={() => toggleFocus(o.id)} aria-pressed={focused} title="눌러서 이 경로만 강조해서 보기">
                  <div
                    className="c-dot"
                    style={{
                      background: sc ?? pinColor(i),
                      boxShadow: sc ? `0 0 0 2px ${pinColor(i)}, var(--shadow)` : undefined,
                      outline: focused ? `3px solid color-mix(in srgb, ${pinColor(i)} 55%, transparent)` : undefined,
                      outlineOffset: focused ? 2 : undefined,
                    }}
                  >
                    {o.name.replace(/역$/, "").slice(0, 3)}
                    <span className="c-mode">{TRANSPORT_ICON[o.transport]}</span>
                  </div>
                  <div className="c-name">{p?.name || o.name}</div>
                </button>
              );
            })
          : origins.map((o, i) => {
              const focused = focusOriginId === o.id;
              return (
                <div key={o.id} className="v8-chip">
                  <button
                    className="c-dot"
                    style={{
                      background: pinColor(i),
                      outline: focused ? `3px solid color-mix(in srgb, ${pinColor(i)} 55%, transparent)` : undefined,
                      outlineOffset: focused ? 2 : undefined,
                    }}
                    aria-label={`${o.name} 경로 강조`}
                    aria-pressed={focused}
                    title="눌러서 이 경로만 강조해서 보기 (이동수단은 오른쪽 아래 아이콘)"
                    onClick={() => toggleFocus(o.id)}
                  >
                    {i + 1}
                    <span
                      className="c-mode"
                      role="button"
                      tabIndex={0}
                      aria-label={`${o.name} 이동수단 변경`}
                      title="눌러서 이동수단 변경"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(o.id);
                      }}
                    >
                      {TRANSPORT_ICON[o.transport]}
                    </span>
                  </button>
                  <span className="c-x" role="button" aria-label={`${o.name} 삭제`} onClick={() => removeOrigin(o.id)}>✕</span>
                  <div className="c-name">{o.name}</div>
                </div>
              );
            })}
        {!selectedMeeting && origins.length < 8 && (
          <button
            className="v8-chip-add"
            title="검색해서 출발지를 추가하세요"
            onClick={() => {
              // 출발지 입력은 검색으로만 한다 — 이 칩은 검색창으로 데려다주는 버튼.
              // 포커스만 주면 "아무 일도 안 일어난 것"처럼 보였어서, 검색창이 화면에
              // 들어오게 스크롤하고 잠깐 강조해 어디를 봐야 하는지 알려준다.
              const el = searchInputRef.current;
              if (!el) return;
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.focus({ preventScroll: true });
              const box = el.closest(".v8-search") as HTMLElement | null;
              if (box) {
                box.style.outline = "2px solid var(--ac)";
                box.style.outlineOffset = "1px";
                setTimeout(() => {
                  box.style.outline = "";
                  box.style.outlineOffset = "";
                }, 1200);
              }
            }}
          >
            <IcPlus />
          </button>
        )}
      </div>
      <div className="v8-maxhint">
        {selectedMeeting
          ? `${selectedMeeting.name} · 참여자 ${activeOrigins.length}명의 출발지예요.`
          : origins.length >= 8
          ? "출발지는 최대 8개까지예요."
          : "최대 8개까지 추가할 수 있어요."}
      </div>

      {/* 지도 */}
      <div className="v8-mapwrap">
        <div className="v8-maplayer">
          {/* 기준 선택은 비회원 탐색 전용 — 모임 후보는 서버가 계산한다 */}
          {!selectedMeeting && (
            <div className="seg2">
              <button className={criteria === "dist" ? "on" : ""} onClick={() => setCriteria("dist")}>기준: 거리순</button>
              <button className={criteria === "time" ? "on" : ""} onClick={() => setCriteria("time")}>시간순</button>
            </div>
          )}
          {activeOrigins.length > 0 && (
            <div className="seg2">
              <button
                className={mapView === "me" ? "on" : ""}
                onClick={() => {
                  // 포커스해둔 출발지가 있으면 그대로 유지, 없으면 내 자리(모임 모드) 또는
                  // 첫 출발지를 기본으로 확대한다.
                  if (!focusOriginId) {
                    const mine = selectedMeeting ? activeOrigins.find((o) => o.id === voterId)?.id : activeOrigins[0]?.id;
                    setFocusOriginId(mine ?? activeOrigins[0]?.id ?? null);
                  }
                  setMapView("me");
                }}
              >
                내 위치 보기
              </button>
              <button
                className={mapView === "all" ? "on" : ""}
                onClick={() => {
                  setFocusOriginId(null);
                  setMapView("all");
                }}
              >
                전체 위치 보기
              </button>
            </div>
          )}
        </div>
        {activeOrigins.length === 0 ? (
          <div className="v8-mapempty">
            {selectedMeeting ? "아직 출발지를 입력한 참여자가 없어요" : "아직 출발지가 없어요"}
            <small>
              {selectedMeeting
                ? `참여자 ${selectedMeeting.participants.length}명이 각자 출발지를 넣으면 여기에 표시돼요`
                : "위 검색창에서 출발지를 추가해보세요"}
            </small>
          </div>
        ) : mapFail ? (
          <div className="v8-mapempty">
            지도를 불러오지 못했어요
            <small>
              {/* ⚠️ **원인을 구분해 말한다.** 예전엔 두 경우 모두 "키 설정 후 표시됩니다"
                  였는데, 키를 넣고 재배포한 뒤에도 같은 문구가 떠서 원인을 좁힐 수 없었다
                  (2026-08-06 Preview 실측). `loadSdk()` 는 ①키 없음 ②키는 있는데 SDK 로드
                  실패(도메인 미등록·차단) 를 똑같이 `false` 로 돌려준다.
                  ⚠️ `KAKAO_JS_KEY_SET` 은 **빌드 시점** 값이다 — Vercel 에서 키를 추가만
                     하고 재배포를 안 하면 여전히 false 다. 그것도 안내에 넣는다. */}
              {KAKAO_JS_KEY_SET
                ? "키는 있는데 지도 SDK 를 못 불러왔어요 — 이 주소가 카카오 개발자 콘솔의 사이트 도메인에 등록됐는지 확인해주세요"
                : "카카오 JS 키(NEXT_PUBLIC_KAKAO_JS_KEY)가 이 빌드에 없어요 — 환경변수를 넣고 다시 배포하면 표시됩니다"}
              {/* ⚠️ `midpoint.name` 이 아니라 `center.name` 이다 — 위 `center` 주석 참고.
                  모임을 고른 상태에서 확정 거점과 다른 이름을 말하면 안 된다. */}
              {center ? ` · 중간 추천: ${center.name}` : ""}
            </small>
          </div>
        ) : (
          <KakaoMap
            pins={pins}
            center={center}
            onFail={() => setMapFail(true)}
            view={mapView}
            focusIndex={focusIndex}
            routes={displayRoutes}
            candidates={mapCandidates}
            onCandidateClick={
              voterId && !voteBusy
                ? (id) => meetAct({ action: "vote", participantId: voterId, target: votePhase === 0 ? "region" : "place", candidateId: id })
                : undefined
            }
          />
        )}
        {selectedMeeting ? (
          selectedMeeting.winnerRegion ? (
            <div className="v8-mapnote">
              📍 중간 추천 지역: <b>{selectedMeeting.winnerRegion.name}</b> · {selectedMeeting.winnerRegion.reason}
              {/* ⚠️ 이 줄도 `reason` 안에 "최대 52분 · 편차 3분"처럼 **분 단위를 그대로**
                  보여준다. 그런데 출처를 한 글자도 말하지 않았다 — 바로 아래 `midpoint`
                  분기(모임 미선택)에는 붙어 있는데 **모임을 고른 이 분기에만 빠져 있었다**
                  (2026-08-06 실측: 홈 지도 아래는 출처 없음 · 바로 밑 확정 장소 카드는
                  `거리 추정 52분`). 아래 주석이 세운 원칙이 여기 적용이 안 된 것이다.

                  ⚠️ 접는 규칙은 `lib/types.ts` 가 정한 그대로다 —
                     `perParticipant.every(x => x.real === true)`.
                     `undefined`(이 필드가 생기기 전에 저장된 모임)는 **참으로 치지 않는다.**
                     모르면 실값이라고 주장하지 않는다(CLAUDE.md §6). 옛 모임이 `거리 추정`
                     으로 뜨는 건 그래서이고, 과소평가 방향이라 안전하다.
                  ⚠️ 후보가 비어 있으면 `every` 가 참이라 빈 목록에 `전원 경로 기준` 이
                     붙는다 — 길이를 함께 본다. */}
              <span className="faint">
                {" · "}
                {selectedMeeting.winnerRegion.perParticipant.length > 0 &&
                selectedMeeting.winnerRegion.perParticipant.every((x) => x.real === true)
                  ? "전원 경로 기준"
                  : "일부 거리 추정"}
              </span>
            </div>
          ) : null
        ) : midLoading ? (
          // 결과를 예단하지 않는다 — 이 계산은 실패하면 그대로 거리 추정으로 떨어져서
          // 바로 다음 프레임에 `거리 추정` 이 뜬다. 앞 문장이 뒤 결과를 부정하면 안 된다.
          // (경로 상세 시트의 로딩 문구와도 같은 원칙)
          //
          // ⚠️ 거리순도 이제 서버를 거치므로 이 자리를 지나간다(#52 후속). 그런데
          //    거리순은 **경로를 계산하지 않는다** — 후보를 찾고 직선거리로 잴 뿐이다.
          //    두 모드에 같은 문구를 쓰면 안 하는 일을 한다고 말하는 셈이다(CLAUDE.md §6).
          <div className="v8-mapnote">{criteria === "time" ? "경로 계산 중…" : "중간지점 찾는 중…"}</div>
        ) : midpoint ? (
          <div className="v8-mapnote">
            📍 중간 추천 지역: <b>{midpoint.name}</b> · {midpoint.reason}
            {/* ⚠️ 예전엔 이 표기가 `criteria === "time"` 안에만 있었다. 그래서 **거리순으로
                보면 `reason` 이 "최대 42분 · 편차 12분"처럼 분 단위를 그대로 보여주면서
                출처를 한 글자도 말하지 않았다.** 거리순은 정의상 외부 API를 안 부르는
                100% 직선거리 추정이라(`recommendRegions`), 오히려 반드시 밝혀야 하는 쪽이다.
                "키 없음"은 원인 중 하나일 뿐이라(프록시·터널·못 푸는 구간) 원인은 단정하지 않고
                "무엇을 보고 있는지"만 밝힌다.

                ⚠️ 문구에 **범위**를 붙인다 — 여기 `midLive` 는 목록 전체 판정("한 명이라도
                폴백이면 false")인데 모임 상세 목록의 칩은 **사람 단위**다. 같은 두 단어가
                층이 다른 것을 가리키면, 4명 중 1명만 실패했을 때 홈은 `거리 추정` 인데
                상세는 3명이 `경로 기준` 이라 서로 반대 사실처럼 읽힌다. */}
            <span className="faint">
              {" · "}
              {criteria !== "time" ? "거리 추정" : midLive ? "전원 경로 기준" : "일부 거리 추정"}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── 모임 모드: 투표 섹션 (피그마 — 홈 셸 안에서 투표 진행) ── */}
      {selectedMeeting && (
        <div className="pad stack" style={{ gap: 12, paddingTop: 12 }}>
          <StepIcons step={votePhase} />

          {votePhase < 2 && (
            <>
              {/* 누구로 투표할까요? — 이 기기의 참가자 신원 (옵션에 현재 선택 표기) */}
              <div>
                <label className="label">누구로 투표할까요?</label>
                <select
                  className="input"
                  value={voterId ?? ""}
                  onChange={(e) => {
                    setVoterId(e.target.value);
                    if (selectedMeeting) setActive(selectedMeeting.code, e.target.value);
                  }}
                >
                  {voterIds.length === 0 && <option value="">이 기기로 참여한 신원이 없어요</option>}
                  {voterIds.map((i) => {
                    const picked = votePool.find((c) => c.id === voteBox[i.id])?.name;
                    return (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {i.isLeader ? " (방장)" : ""}
                        {picked ? ` (${picked})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 후보 리스트 */}
              <div className="stack" style={{ gap: 8 }}>
                {votePool.length === 0 ? (
                  <div className="v8-empty">
                    {votePhase === 0
                      ? selectedMeeting.participants.every((p) => p.lat == null)
                        ? "참여자들이 출발지를 등록하면 거점 후보가 만들어져요."
                        : "거점 후보를 계산하고 있어요…"
                      : "거점이 확정되면 주변 가게 후보가 올라와요."}
                  </div>
                ) : votePhase === 0 ? (
                  selectedMeeting.regions.map((r) => {
                    const n = tallyOf(r.id);
                    const mine = myVote === r.id;
                    return (
                      <div key={r.id} className="v8-voterow">
                        <div className="i-thumb" style={{ width: 38, height: 38, borderRadius: 999, background: "var(--ac-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>🚉</div>
                        <div className="grow">
                          <div className="i-title">{r.name}</div>
                          <div className="i-sub">
                            <span className="chip ac tnum">{n}표</span>
                            <span className="faint"> 최대 {formatMinutes(r.maxMin)} · 편차 {formatGap(r.devMin)}</span>
                          </div>
                        </div>
                        <button
                          className={"v8-votepill" + (mine ? " voted" : "")}
                          disabled={voteBusy || !voterId}
                          onClick={() => meetAct({ action: "vote", participantId: voterId, target: "region", candidateId: r.id })}
                        >
                          {mine ? "투표함 ✓" : "투표"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  selectedMeeting.places.map((p) => {
                    const n = tallyOf(p.id);
                    const mine = myVote === p.id;
                    return (
                      <div key={p.id} className="v8-voterow">
                        <div className="i-thumb" style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ac-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{p.emoji || "🍽️"}</div>
                        <div className="grow">
                          <div className="i-title">
                            {p.name}
                            {p.category ? <span className="chip line" style={{ marginLeft: 4 }}>{p.category}</span> : null}
                          </div>
                          <div className="i-sub">
                            <span className="chip ac tnum">{n}표</span>
                            <span className="faint"> 인근: {selectedMeeting.winnerRegion?.name}</span>
                          </div>
                        </div>
                        <button
                          className={"v8-votepill" + (mine ? " voted" : "")}
                          disabled={voteBusy || !voterId}
                          onClick={() => meetAct({ action: "vote", participantId: voterId, target: "place", candidateId: p.id })}
                        >
                          {mine ? "투표함 ✓" : "투표"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {votePool.length > 0 && (
                <p className="v8-hint" style={{ padding: "0 4px", textAlign: "left" }}>
                  방장은 투표가 다 안 끝나도 확정할 수 있어요.
                  {topCandidate && Object.keys(voteBox).length > 0 ? ` 현재 최다득표: ${topCandidate.name}` : ""}
                </p>
              )}

              {/* 모임 시간(확정용) — 가게 확정 전에 방장이 입력 (피그마) */}
              {voterIsLeader && votePhase === 1 && (
                <div>
                  <label className="label">모임 시간(확정용)</label>
                  <input
                    className="input"
                    value={meetTime}
                    onChange={(e) => setMeetTime(e.target.value)}
                    onBlur={saveMeetTime}
                    placeholder="예: 오후 7시"
                  />
                </div>
              )}

              {/* 강제 확정(방장 권한) — 피그마: 회색 라벨 + 파란 확정 버튼 */}
              {voterIsLeader && votePool.length > 0 && (
                <div className="stack" style={{ gap: 5 }}>
                  <span className="faint center" style={{ fontSize: 10.5, fontWeight: 800 }}>강제 확정(방장 권한)</span>
                  <button
                    className="btn"
                    // 주의: voteBusy 로 막으면 시간 입력의 onBlur 저장이 클릭 직전에
                    // 버튼을 disabled 로 만들어 확정 클릭이 씹힌다.
                    disabled={!topCandidate}
                    onClick={() => {
                      if (!topCandidate) return;
                      void meetAct({
                        action: "confirmManual",
                        participantId: voterId,
                        target: votePhase === 0 ? "region" : "place",
                        id: topCandidate.id,
                      });
                    }}
                  >
                    ‘{topCandidate?.name}’으로 확정
                  </button>
                </div>
              )}
            </>
          )}

          {/* 투표 완료 — 위 스텝 탭이 이미 3단계 전부 체크로 보여주므로 "확정됐어요"를
              다시 크게 말하지 않는다. 대신 지금 여기서 더 궁금할 정보 — 참여자별
              도착 예정 시간·상태 — 를 보여준다. */}
          {votePhase === 2 && (
            <div className="card stack" style={{ gap: 10 }}>
              <div className="between">
                <div>
                  <span className="eyebrow">확정 장소</span>
                  <div style={{ fontSize: 14, fontWeight: 850, marginTop: 2 }}>
                    {selectedMeeting.winnerRegion?.name} · {selectedMeeting.winnerPlace?.emoji}{" "}
                    {selectedMeeting.winnerPlace?.name}
                  </div>
                  {selectedMeeting.prefs?.timeText && (
                    <span className="faint" style={{ fontSize: 11 }}>🕖 {selectedMeeting.prefs.timeText}</span>
                  )}
                </div>
                <a className="btn sm" style={{ textDecoration: "none", flexShrink: 0 }} href={`/m/${selectedMeeting.code}`}>
                  상세 보기
                </a>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {selectedMeeting.participants.map((p, i) => {
                  const sc = statusColorFor(p.id);
                  const per = selectedMeeting.winnerRegion?.perParticipant.find((x) => x.pid === p.id);
                  return (
                    <div key={p.id} className="row" style={{ gap: 8 }}>
                      <div
                        style={{
                          width: 26, height: 26, borderRadius: "50%", background: pinColor(i), color: "#fff",
                          fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, boxShadow: sc ? `0 0 0 2px ${sc}` : undefined,
                        }}
                      >
                        {p.name.slice(0, 1)}
                      </div>
                      <span className="grow" style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                      {p.status ? (
                        <span className="chip" style={{ background: `${ARRIVAL_COLOR[p.status]}22`, color: ARRIVAL_COLOR[p.status], fontSize: 10 }}>
                          ● {ARRIVAL_LABEL[p.status]}{p.etaText ? ` · ${p.etaText}` : ""}
                        </span>
                      ) : per ? (
                        // 여기도 출처를 밝힌다 — `per.real` 이 이미 이 스코프에 있는데
                        // 예전엔 그냥 "예상 N분"이라 어디서 온 숫자인지 말하지 않았다.
                        <span className="chip line" style={{ fontSize: 10 }}>
                          {per.real === true ? "경로 기준" : "거리 추정"} {formatMinutes(per.min)}
                        </span>
                      ) : (
                        // 🔴 예전엔 `상태 미입력` 이었는데 **뜻이 다른 말**이다 — 그건
                        //    "본인이 도착 상태를 안 남겼다"(`p.status`)는 뜻이고, 여기 오는
                        //    경우는 **이동시간 자체가 없는** 것이다(2026-08-06 실측).
                        //    거점 후보를 계산한 뒤에 출발지를 등록하면 `perParticipant` 에
                        //    안 들어가고, 확정 후에는 다시 계산하지 않아 영영 빈다.
                        //    모임 상세의 `TravelTimes` 도 같은 문구를 쓴다 — 두 화면이
                        //    같은 상태를 다르게 부르면 안 된다.
                        <span
                          className="chip line"
                          style={{ fontSize: 10 }}
                          title="이 거점 후보를 계산한 뒤에 출발지가 등록돼서 이동시간이 빠져 있어요"
                        >
                          이동시간 없음
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 카테고리 탭 + 주변 리스트 — 비회원(직접 입력) 탐색 모드 전용 */}
      {!selectedMeeting && (
      <>
      <div className="v8-cats">
        {CATS.map((c) => (
          <button key={c.key} className={"v8-cat" + (cat === c.key ? " on" : "")} onClick={() => setCat(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="v8-list">
        {activeOrigins.length < 2 ? (
          <div className="v8-empty">출발지를 2개 이상 추가하면 중간지점 주변 정보를 보여드려요.</div>
        ) : nearby.length === 0 ? (
          <div className="v8-empty">주변에서 결과를 찾지 못했어요.</div>
        ) : (
          nearby.map((p) => {
            const inner = (
              <>
                <div className="i-thumb">{thumbFor(p.path || p.category)}</div>
                <div className="grow">
                  <div className="i-title">{p.name}</div>
                  <div className="i-sub">
                    {p.detail ? `${p.detail} · ` : `${p.category} · `}도보 {p.walkMin}분
                    <span className="faint"> · {p.distanceM}m</span>
                  </div>
                </div>
              </>
            );
            const key = `${p.name}${p.distanceM}`;
            return p.url ? (
              <a key={key} className="v8-item" href={p.url} target="_blank" rel="noreferrer">{inner}</a>
            ) : (
              <div key={key} className="v8-item">{inner}</div>
            );
          })
        )}
      </div>
      </>
      )}

      {/* 출발지 편집 시트 — 칩 아이콘 클릭 시 */}
      {editingOrigin && (
        <div className="v8-overlay" onClick={() => setEditing(null)}>
          <div className="v8-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2>{editingOrigin.name}</h2>
            <p className="m-sub">이 출발지의 이동수단을 골라주세요. 중간지점 계산에 반영돼요.</p>
            <div className="v8-trans">
              {TRANSPORTS.map((t) => (
                <button
                  key={t.key}
                  className={editingOrigin.transport === t.key ? "on" : ""}
                  onClick={() => updateOrigin(editingOrigin.id, { transport: t.key })}
                >
                  <span style={{ fontSize: 16 }}>{TRANSPORT_ICON[t.key]}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setEditing(null)}>
              완료
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 8, color: "var(--danger)" }}
              onClick={() => removeOrigin(editingOrigin.id)}
            >
              이 출발지 삭제
            </button>
          </div>
        </div>
      )}

      {/* ── v19 §4-① 전환 고리: '이 출발지들로 모임 만들기' ──
             홈은 "맛보기"다. 여기서 모임 생성으로 넘어가는 길이 없으면
             홈과 모임이 따로 노는 앱이 된다(v19 가 이 버튼을 핵심으로 둔 이유).

             ⚠️ 출발지 2곳 이상일 때만 뜬다 — 중간지점이 계산돼야 넘어갈 의미가 있다.
             ⚠️ v5 의 '미배정 핑' 이관(홈 출발지를 모임에 넘겨 참여자가 자기 것을 고르는 것)은
                아직 없다. 지금은 생성 폼으로 이동만 하고, 각자 참여할 때 출발지를 넣는다. */}
      {activeOrigins.length >= 2 && (
        // ⚠️ 래퍼로 감싸고 pointer-events 를 껐다 켜지 말 것 — 클릭이 씹힌다(실측).
        //    앵커 하나를 직접 fixed 로 둔다.
        <a
          href="/meetings?open=create"
          className="btn primary"
          style={{
            position: "fixed", left: 16, right: 16, bottom: 78, zIndex: 60,
            textDecoration: "none", textAlign: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,.18)",
          }}
        >
          이 출발지들로 모임 만들기
        </a>
      )}

      <BottomNav active="home" />
    </main>
  );
}
