"use client";

// ─────────────────────────────────────────────────────────────
// KakaoMap — 실제 카카오 지도 (JavaScript 키 사용)
//  · NEXT_PUBLIC_KAKAO_JS_KEY 로 Maps SDK를 동적 로드
//  · 로드 실패(키 없음/도메인 미등록/오프라인) 시 onFail 콜백
//    → 호출부에서 기존 스키매틱 지도로 폴백
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    kakao: any;
    __kakaoMapLoading?: Promise<boolean>;
  }
}

// ── 출발지 칩 · 지도 핀 공용 팔레트 ──────────────────────────
// 로그인 후 모임원 화면은 도착 상태를 신호등(초록/노랑/빨강)으로 표시한다.
// 출발지 구분색이 그 셋과 섞이면 "늦는 사람"으로 오독되므로,
// 여기서는 초록·노랑·빨강 계열(색상환 0~60°, 90~150°)을 의도적으로 배제하고
// 청록~파랑~보라~마젠타(170~310°)만 사용한다.
export const PIN_COLORS = [
  "#2f6fed", // 파랑
  "#0aa8a0", // 청록
  "#9b51e0", // 보라
  "#1f9bd6", // 하늘파랑
  "#c94fc9", // 마젠타
  "#5b4bc4", // 남보라
  "#157f7a", // 진청록
  "#7d6bb0", // 연보라
];
export const pinColor = (i: number) => PIN_COLORS[i % PIN_COLORS.length];

/** 중간 추천 지역 마커 색 — 참가자 색과 완전히 분리된 강조색 */
export const MIDPOINT_COLOR = "#f0324b";

/**
 * 보여줄 것이 아직 없을 때의 지도 첫 화면 — **협성대(화성시 봉담읍) 인근**.
 *
 * 예전엔 서울시청(37.5665, 126.978)이었는데, 홈에서 출발지가 하나도 없으면
 * 지도 자체를 안 그리고 회색 안내문만 띄웠기 때문에 이 값이 보일 일이 거의
 * 없었다. 이제 빈 홈에서도 지도를 그리므로 **우리 학교 근처**를 첫 화면으로
 * 둔다 — 발표에서 처음 열었을 때 낯선 서울 도심이 아니라 아는 동네가 뜬다.
 *
 * ⚠️ 핀이 하나라도 있으면 곧바로 그 핀들에 맞춰 화면이 맞춰진다(fitBounds).
 *    이 값은 **아무것도 없을 때만** 쓰인다.
 *
 * ⚠️ 좌표는 캠퍼스 근사값이다. 정확히 맞추려면 map.kakao.com 에서 협성대를
 *    찾아 우클릭 → '좌표 복사' 한 값으로 바꾸면 된다.
 */
export const DEFAULT_MAP_CENTER = { lat: 37.2076, lng: 126.9669 };
/** 카카오 지도 확대 레벨 — 숫자가 작을수록 확대. 5 ≈ 동네 몇 블록. */
export const DEFAULT_MAP_LEVEL = 5;

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  color: string;       // 출발지 칩과 동일한 색 (PIN_COLORS) — 다른 참가자와 구분용
  index: number;       // 칩에 표시되는 순번 (1부터)
  /** 도착 신호등 색(있으면 원 안쪽 채우기를 이 색으로, 테두리는 color로) */
  statusColor?: string;
  /** 출발지 칩을 눌러 이 핀의 경로만 강조하는 중이면 true — 원을 키우고 링을 굵게 */
  focused?: boolean;
}

/** 출발지 → 목적지 경로. color 는 해당 출발지 핀과 같은 색을 쓴다. */
export interface MapRoute {
  id: string;
  points: { lat: number; lng: number }[];
  color: string;
  /** 실제 도로 경로면 실선, 직선 근사면 점선으로 구분해 그린다 */
  real: boolean;
  /** 지정하면 real 여부 기반 기본 두께/불투명도 대신 이 값을 쓴다 — 특정 출발지만
   *  포커스했을 때 나머지를 옅게, "전체 위치 보기"에서 겹침을 옅게 하는 용도 */
  weight?: number;
  opacity?: number;
}
export interface MapCenterPin {
  lat: number;
  lng: number;
  label: string;       // "왕십리" | "예상 중간지점"
}

/** 투표 후보 — 지도 위 라벨 박스(이름+N표)로 표시되고, 누르면 투표된다 */
export interface MapCandidate {
  id: string;
  lat: number;
  lng: number;
  name: string;
  votes: number;
  /** 내가 투표한 후보 — 주황 테두리로 강조 (피그마) */
  mine: boolean;
  /**
   * v19 §4-⑧ **미리보기 핀**. 아직 후보가 아니라 "탭하면 후보가 되는" 자리다.
   * 회색으로 흐리게 그리고 표 뱃지 대신 `+ 후보 등록` 을 보여준다 —
   * 등록된 후보와 눈으로 구분되지 않으면 "이미 후보인 줄 알고" 아무도 안 누른다.
   */
  preview?: boolean;
}
/** 내가 투표한 후보 강조색 (피그마의 주황 테두리) */
const CAND_MINE = "#f2803d";

const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";

/**
 * 키가 **빌드에 박혔는지**. 지도 실패 안내가 원인을 구분하는 데 쓴다.
 *
 * `loadSdk()` 는 두 경우 모두 `false` 를 돌려준다:
 *   ① 키가 없다            → 즉시 false
 *   ② 키는 있는데 SDK 로드 실패 → `s.onerror` (도메인 미등록 · 차단 · 오프라인)
 * 화면이 둘을 같은 문구로 말하면, 키를 넣고 재배포한 뒤에도 똑같은 안내가 떠서
 * "키가 안 들어갔나?" 하고 엉뚱한 데를 보게 된다(2026-08-06 Preview 에서 실제로 겪음).
 *
 * ⚠️ `NEXT_PUBLIC_*` 는 **빌드 시점에 문자열로 치환**된다. 그래서 이 값은
 *    "지금 환경변수가 있나"가 아니라 **"이 번들을 만들 때 있었나"** 다 —
 *    Vercel 에서 키를 추가만 하고 재배포를 안 하면 여전히 false 다.
 */
export const KAKAO_JS_KEY_SET = !!JS_KEY;

// SDK 스크립트를 1회만 로드 (autoload=false → kakao.maps.load로 초기화)
function loadSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.kakao?.maps?.LatLng) return Promise.resolve(true);
  if (!JS_KEY) return Promise.resolve(false);
  if (window.__kakaoMapLoading) return window.__kakaoMapLoading;

  window.__kakaoMapLoading = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
    s.async = true;
    s.onload = () => {
      try {
        window.kakao.maps.load(() => resolve(true));
      } catch {
        resolve(false);
      }
    };
    s.onerror = () => resolve(false); // 도메인 미등록/차단 등
    document.head.appendChild(s);
  });
  return window.__kakaoMapLoading;
}

export default function KakaoMap({
  pins,
  center,
  onFail,
  view = "all",
  focusIndex = 0,
  routes = [],
  candidates = [],
  onCandidateClick,
  onMapClick,
  radiusCircle = null,
}: {
  pins: MapPin[];
  center: MapCenterPin | null;
  onFail: () => void;
  /** all: 모든 핀이 보이게 / me: 특정 출발지 중심으로 확대 */
  view?: "all" | "me";
  /** view="me" 일 때 중심이 될 핀 인덱스 */
  focusIndex?: number;
  /** 출발지별 경로 (없으면 그리지 않음) */
  routes?: MapRoute[];
  /** 투표 후보 라벨 박스 — 누르면 onCandidateClick(id) */
  candidates?: MapCandidate[];
  onCandidateClick?: (id: string) => void;
  /**
   * v19 §4-⑥ **지도 핑** — 빈 지도를 탭하면 그 좌표를 준다.
   * 넘기지 않으면 지도 클릭은 아무 일도 하지 않는다(기존 화면 동작 그대로).
   * ⚠️ 후보 라벨 박스를 누른 경우는 `onCandidateClick` 이 먼저 받는다 —
   *    카카오는 커스텀 오버레이 클릭을 지도 클릭으로 전파하지 않는다.
   */
  onMapClick?: (lat: number, lng: number) => void;
  /**
   * 지점 후보를 받는 **반경 원** (2차 그릴링 · 1차 순서도 4번 `반경 700m 표시`).
   *
   * 숫자·문구로만 "700m 안에서 고르세요"라고 하면 지도에서 어디까지가 안인지
   * 알 수 없다 — 반경 밖을 눌러 서버에 거부당하고 나서야 알게 된다.
   * 중심은 확정된 지역, 반지름은 `radiusM`(700 → 확장 시 1400).
   */
  radiusCircle?: { lat: number; lng: number; radiusM: number } | null;
}) {
  // 호출부는 pins/routes 를 렌더마다 새 배열로 만든다. 모임 상세는 1.8초마다
  // 폴링하므로 배열 참조를 그대로 의존성에 쓰면 오버레이가 계속 지워졌다 다시
  // 그려져 깜빡인다. 내용이 같으면 다시 그리지 않도록 서명으로 비교한다.
  const sig = JSON.stringify([
    pins.map((p) => [p.lat, p.lng, p.label, p.color, p.index, p.statusColor, p.focused]),
    center && [center.lat, center.lng, center.label],
    routes.map((r) => [r.id, r.color, r.real, r.points.length, r.points[0], r.points[r.points.length - 1], r.weight, r.opacity]),
    candidates.map((c) => [c.id, c.lat, c.lng, c.name, c.votes, c.mine, !!c.preview]),
  ]);

  // 클릭 콜백은 렌더마다 새 함수여도 오버레이를 다시 그릴 필요가 없다 → ref로 보관
  const clickRef = useRef(onCandidateClick);
  clickRef.current = onCandidateClick;
  // 지도 클릭도 같은 이유로 ref — 리스너를 한 번만 붙이고 최신 콜백을 본다
  const mapClickRef = useRef(onMapClick);
  mapClickRef.current = onMapClick;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // SDK 로드 + 지도 생성
  useEffect(() => {
    let alive = true;
    loadSdk().then((ok) => {
      if (!alive) return;
      if (!ok) {
        onFail();
        return;
      }
      const { kakao } = window;
      if (!mapRef.current && boxRef.current) {
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
          level: DEFAULT_MAP_LEVEL,
        });
        // v19 §4-⑥: 지도 탭 → 좌표. 리스너는 **지도 생성 시 한 번만** 붙이고
        // 최신 콜백은 ref 로 본다 — 폴링(1.8초)마다 붙였다 떼면 클릭이 씹힌다.
        kakao.maps.event.addListener(mapRef.current, "click", (e: any) => {
          const ll = e?.latLng;
          if (!ll || !mapClickRef.current) return;
          mapClickRef.current(ll.getLat(), ll.getLng());
        });
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀/중심 갱신
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { kakao } = window;
    const map = mapRef.current;

    // 기존 오버레이/경로 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];

    // ── 반경 원 — **가장 아래**에 깐다 (핀·경로가 위에 와야 한다) ──
    //  `Circle` 도 오버레이라 `linesRef` 로 같이 치운다(따로 두면 지울 때 빠뜨린다).
    if (radiusCircle) {
      const circle = new kakao.maps.Circle({
        center: new kakao.maps.LatLng(radiusCircle.lat, radiusCircle.lng),
        radius: radiusCircle.radiusM,
        strokeWeight: 2,
        strokeColor: "#2F6FED",
        strokeOpacity: 0.7,
        strokeStyle: "dashed", // 점선 — "정확한 경계선"이 아니라 안내라는 뜻
        fillColor: "#2F6FED",
        fillOpacity: 0.06,
      });
      circle.setMap(map);
      linesRef.current.push(circle);
    }

    // 경로선 — 핀보다 먼저 그려 핀이 위에 오도록
    for (const rt of routes) {
      if (!rt.points || rt.points.length < 2) continue;
      const line = new kakao.maps.Polyline({
        path: rt.points.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: rt.weight ?? (rt.real ? 5 : 3),
        strokeColor: rt.color,
        strokeOpacity: rt.opacity ?? (rt.real ? 0.85 : 0.55),
        strokeStyle: rt.real ? "solid" : "shortdash",
      });
      line.setMap(map);
      linesRef.current.push(line);
    }

    const bounds = new kakao.maps.LatLngBounds();
    let hasAny = false;

    // 참가자 핀 — 출발지 칩과 동일한 "색상 원 + 번호" (이모지는 작아서 식별이 어려움)
    for (const p of pins) {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      bounds.extend(pos);
      hasAny = true;
      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;pointer-events:none;";
      // 도착 신호등 색이 있으면 원 채우기를 그걸로 쓰고, 테두리를 참가자 구분색으로
      // 돌려 route 선과 여전히 매칭되게 한다(둘 다 identity색이면 신호등 신호를 잃는다).
      const fill = p.statusColor ?? p.color;
      const ring = p.statusColor ? p.color : "#fff";
      // 포커스된 핀은 살짝 키우고 강조 테두리를 둘러 "지금 이 경로를 보고 있다"를 알려준다
      const size = p.focused ? 32 : 26;
      const ringWidth = p.focused ? 3.5 : 2.5;
      const focusHalo = p.focused
        ? `outline:3px solid color-mix(in srgb, ${p.color} 55%, transparent);outline-offset:2px;`
        : "";
      el.innerHTML =
        `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};color:#fff;` +
        `font-size:${p.focused ? 13 : 12}px;font-weight:900;display:flex;align-items:center;justify-content:center;` +
        `border:${ringWidth}px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.3);${focusHalo}">${p.index}</div>` +
        `<div style="font-size:10px;font-weight:800;background:#fff;border:1px solid #d8dee9;border-radius:999px;padding:1px 7px;margin-top:2px;color:#1c2433;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.12)">${p.label}</div>`;
      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1 });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    // 투표 후보 라벨 박스 — 피그마: 흰 박스에 이름 + 파란 "N표" 뱃지, 클릭=투표
    for (const cd of candidates) {
      const pos = new kakao.maps.LatLng(cd.lat, cd.lng);
      bounds.extend(pos);
      hasAny = true;
      const el = document.createElement("div");
      el.style.cssText = "display:flex;flex-direction:column;align-items:center;";
      // 미리보기(회색·흐림)와 등록된 후보(흰 박스·표 뱃지)를 눈으로 갈라 놓는다
      const line = cd.preview ? "#b6c0d0" : cd.mine ? CAND_MINE : "#d8dee9";
      const badge = cd.preview
        ? `<span style="font-size:10px;font-weight:900;color:#54617a;background:#eef1f7;border-radius:999px;padding:1px 8px">+ 후보 등록</span>`
        : `<span style="font-size:10px;font-weight:900;color:#1f5ae0;background:#e8f0ff;border-radius:999px;padding:1px 8px">${cd.votes}표</span>`;
      el.innerHTML =
        `<button type="button" style="pointer-events:auto;cursor:pointer;font:inherit;` +
        `display:flex;flex-direction:column;align-items:center;gap:2px;background:#fff;` +
        `border:2.5px solid ${line};border-radius:12px;padding:5px 10px;` +
        `opacity:${cd.preview ? ".85" : "1"};` +
        `box-shadow:0 3px 10px rgba(0,0,0,${cd.preview ? ".10" : ".18"})">` +
        `<span style="font-size:12px;font-weight:${cd.preview ? "800" : "900"};color:${cd.preview ? "#54617a" : "#1c2433"};white-space:nowrap">${cd.name}</span>` +
        badge +
        `</button>` +
        // 박스 아래 작은 꼬리
        `<div style="width:8px;height:8px;background:#fff;border-right:2.5px solid ${line};border-bottom:2.5px solid ${line};transform:rotate(45deg);margin-top:-6px"></div>`;
      el.querySelector("button")!.addEventListener("click", () => clickRef.current?.(cd.id));
      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1, clickable: true });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    // 중간지점 핀 (강조)
    if (center) {
      const pos = new kakao.maps.LatLng(center.lat, center.lng);
      bounds.extend(pos);
      hasAny = true;
      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;pointer-events:none;";
      // 물방울(teardrop) 지도핀 — 참가자의 원형 핀과 모양으로도 구분된다
      el.innerHTML =
        `<div style="font-size:11px;font-weight:900;background:${MIDPOINT_COLOR};color:#fff;border-radius:999px;` +
        `padding:3px 10px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 8px rgba(240,50,75,.4)">${center.label}</div>` +
        `<svg width="30" height="38" viewBox="0 0 30 38" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))">` +
        `<path d="M15 37C15 37 28 22.5 28 14A13 13 0 1 0 2 14c0 8.5 13 23 13 23z" fill="${MIDPOINT_COLOR}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<circle cx="15" cy="14" r="5" fill="#fff"/></svg>`;
      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1 });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    if (!hasAny) return;

    const focus = pins[focusIndex] ?? pins[0];
    if (view === "me" && focus) {
      // 내 위치 보기 — 내 출발지와 목적지(중간지점)가 "함께" 보여야 한다.
      // 내 핀만 확대하면 목적지가 화면 밖으로 나가 경로를 읽을 수 없다.
      const dest = center ?? null;
      if (dest) {
        const b = new kakao.maps.LatLngBounds();
        b.extend(new kakao.maps.LatLng(focus.lat, focus.lng));
        b.extend(new kakao.maps.LatLng(dest.lat, dest.lng));
        map.setBounds(b, 70, 70, 70, 70);
      } else {
        // 목적지가 아직 없으면 기존처럼 내 위치만 확대
        map.setCenter(new kakao.maps.LatLng(focus.lat, focus.lng));
        map.setLevel(5);
      }
    } else {
      map.setBounds(bounds, 40, 40, 40, 40); // 모든 핀·후보가 보이도록
      // 점이 딱 하나뿐일 때만 과확대를 막는다. 투표 후보 박스(candidates)를 빼먹으면
      // "참가자 1명 + 후보 3곳"인데도 1개로 세어 setBounds 결과를 setLevel(5)가
      // 덮어써버려, 방금 fit된 넓은 화면이 후보 박스가 안 보이는 좁은 확대로 되돌아간다.
      const totalPoints = pins.length + candidates.length + (center ? 1 : 0);
      if (totalPoints === 1) map.setLevel(5);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // ⚠️ `radiusCircle` 을 의존성에 넣지 않으면 **반경 확장(700→1400)이 지도에 안 보인다**
    //    — 상태는 바뀌었는데 원은 그대로라 "확장이 안 됐나?" 로 읽힌다.
  }, [ready, sig, view, focusIndex, radiusCircle?.lat, radiusCircle?.lng, radiusCircle?.radiusM]);

  // ⚠️ 카카오 지도는 **컨테이너 크기가 바뀌어도 스스로 다시 그리지 않는다.**
  //    전체화면 토글처럼 박스가 커지면 지도가 옛 크기로 잘린 채 남는다.
  //    크기 변화를 감지해 relayout + 다시 맞춤. (전체화면 버튼의 전제 조건)
  useEffect(() => {
    const box = boxRef.current;
    if (!ready || !box || typeof ResizeObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t);
      // 연속 리사이즈(애니메이션)마다 부르지 않도록 살짝 모아서 한 번
      t = setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        const c = map.getCenter();
        map.relayout();
        map.setCenter(c);
      }, 60);
    });
    ro.observe(box);
    return () => {
      if (t) clearTimeout(t);
      ro.disconnect();
    };
  }, [ready]);

  return (
    <>
      <div ref={boxRef} style={{ position: "absolute", inset: 0 }} />

      {/* ── 지도가 못 뜬 경우의 폴백 (CLAUDE.md §3-4) ──
             카카오 JS 키가 없거나 SDK 로드가 막히면 지도가 빈 카드가 된다.
             그런데 v19 §4-⑥⑧ 의 **후보 등록·투표가 지도 위 핀 탭**이라,
             지도가 없으면 그 동작이 통째로 사라진다 — "키가 없어도 전체 플로우가
             돌아야 한다"는 규칙에 어긋난다. 같은 핀을 목록 버튼으로 그린다. */}
      {!ready && candidates.length > 0 && onCandidateClick && (
        <div
          style={{
            position: "absolute", inset: "auto 10px 10px", zIndex: 12,
            display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center",
          }}
        >
          {candidates.map((cd) => (
            <button
              key={cd.id}
              type="button"
              onClick={() => clickRef.current?.(cd.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--panel)", cursor: "pointer",
                border: `2px solid ${cd.preview ? "var(--hair2)" : cd.mine ? CAND_MINE : "var(--hair)"}`,
                borderRadius: 12, padding: "5px 10px",
                font: "inherit", fontSize: 12, fontWeight: 800,
                color: cd.preview ? "var(--ink-soft)" : "var(--ink)",
                boxShadow: "var(--shadow)",
              }}
            >
              {cd.name}
              <span
                style={{
                  fontSize: 10, fontWeight: 900, borderRadius: 999, padding: "1px 7px",
                  background: cd.preview ? "var(--panel2)" : "var(--ac-soft)",
                  color: cd.preview ? "var(--ink-soft)" : "var(--ac-deep)",
                }}
              >
                {cd.preview ? "+ 후보 등록" : `${cd.votes}표`}
              </span>
            </button>
          ))}
        </div>
      )}

      {ready && candidates.length > 0 && onCandidateClick && (
        // 피그마: 지도 상단 중앙 안내 툴팁 (상단 컨트롤과 겹치지 않게 한 줄 아래)
        <div
          style={{
            position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)",
            zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap",
            background: "var(--panel)", color: "var(--ink-soft)", borderRadius: 999,
            padding: "5px 12px", fontSize: 11, fontWeight: 800, boxShadow: "var(--shadow)",
          }}
        >
          지도에서 후보를 눌러 투표하세요
        </div>
      )}
    </>
  );
}
