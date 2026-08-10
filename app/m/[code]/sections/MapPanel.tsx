"use client";

// ─────────────────────────────────────────────────────────────
// 지도 패널 — 카카오맵, 로드 실패 시 스키매틱 폴백
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// 카카오맵 JS 키가 없거나 도메인 등록이 안 돼 있으면 SDK 로드가 실패한다.
// 그때 화면이 빈 회색 상자가 되지 않도록 좌표를 박스 안 %로 환산해 그리는
// 폴백이 있다 — 키 없이도 전체 플로우가 돌아야 한다는 규칙(CLAUDE.md §4)의 지도 버전.
//
// ⚠️ 경로 폴리라인이 직선 근사일 때는 `real: false` 로 내려오고, 아래 안내에
//    "점선은 직선 근사"라고 밝힌다. 가짜를 실제처럼 그리지 않는다 (CLAUDE.md §6).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import type { MeetingState, Participant } from "@/lib/types";
import KakaoMap, { pinColor, type MapRoute, type MapCandidate } from "@/app/components/KakaoMap";

// 지도 좌표 → 박스 내 위치(%) — SDK 폴백에서만 쓴다
const B = { latMin: 37.2, latMax: 37.7, lngMin: 126.7, lngMax: 127.2 };
function pos(lat: number, lng: number) {
  const x = Math.min(94, Math.max(6, ((lng - B.lngMin) / (B.lngMax - B.lngMin)) * 100));
  const y = Math.min(90, Math.max(10, (1 - (lat - B.latMin) / (B.latMax - B.latMin)) * 100));
  return { left: `${x}%`, top: `${y}%` };
}

export interface MapPanelProps {
  state: MeetingState;
  /** 출발지를 등록한 참가자만 (핀 순서 = PIN_COLORS 인덱스) */
  located: Participant[];
  centroid: { lat: number; lng: number } | null;
  mapCandidates: MapCandidate[];
  routes: MapRoute[];
  /** 내 핀 번호 (없으면 undefined) */
  myPinIndex?: number;
  view: "me" | "all";
  onViewChange: (v: "me" | "all") => void;
  /** SDK 로드 실패 여부 — 부모가 들고 있어야 재렌더에도 유지된다 */
  fallback: boolean;
  onFail: () => void;
  statusColorFor: (participantId: string) => string | undefined;
  onCandidateClick?: (candidateId: string) => void;
  /**
   * v19 §4-⑥ **핑 모드** — 켜면 지도를 탭해 지역 후보를 등록한다.
   * 부모가 "지금이 지역 후보 등록 단계인가"를 판단해 넘긴다.
   */
  pingMode?: boolean;
  onMapPing?: (lat: number, lng: number) => void;
}

export default function MapPanel({
  state,
  located,
  centroid,
  mapCandidates,
  routes,
  myPinIndex,
  view,
  onViewChange,
  fallback,
  onFail,
  statusColorFor,
  onCandidateClick,
  pingMode,
  onMapPing,
}: MapPanelProps) {
  /** 전체화면 — 카드(340px) 안에서는 후보 핀이 겹쳐 못 누른다(특히 폰) */
  const [full, setFull] = useState(false);
  // Esc 로 닫는다 — 폰에서 뒤로가기 대신 쓸 수 있는 탈출구
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
      <div
        className={"map" + (full ? " map-fs" : "")}
        style={pingMode ? { cursor: "crosshair" } : undefined}
      >
        {/* 지도 전체화면 토글 — 오른쪽 위 (v19 §4-⑥⑧ 이 지도 위 탭 조작이라
            좁은 카드에서는 핀이 서로 겹쳐 누르기 어렵다) */}
        <button
          type="button"
          className="map-fsbtn"
          style={{ position: "absolute", top: 9, right: 9, zIndex: 11, margin: 0 }}
          aria-label={full ? "지도 전체화면 끄기" : "지도 전체화면으로 보기"}
          title={full ? "전체화면 끄기 (Esc)" : "전체화면으로 보기"}
          onClick={() => setFull((v) => !v)}
        >
          {full ? "✕" : "⛶"}
        </button>
        {/* v19 §4-⑥: 핑 모드일 때만 안내를 띄운다 — 지도가 갑자기 눌리는 화면이
            되므로 무엇이 일어나는지 먼저 말해준다. */}
        {pingMode && !fallback && (
          <div
            className="chip ok"
            style={{ position: "absolute", top: 8, left: 8, zIndex: 5, fontSize: 11 }}
          >
            📍 지도를 눌러 후보 등록 (동 단위 · 1인 1개)
          </div>
        )}
        {/* 홈과 동일한 지도 조작 — 참가자가 2명 이상 위치를 넣었을 때만 의미가 있다 */}
        {!fallback && located.length > 0 && (
          <div className="v8-maplayer" style={{ right: 52 }}>
            <div className="seg2">
              <button className={view === "me" ? "on" : ""} onClick={() => onViewChange("me")}>내 위치 보기</button>
              <button className={view === "all" ? "on" : ""} onClick={() => onViewChange("all")}>전체 위치 보기</button>
            </div>
          </div>
        )}
        {!fallback ? (
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
            onFail={onFail}
            view={view}
            focusIndex={myPinIndex}
            routes={routes}
            candidates={mapCandidates}
            onCandidateClick={onCandidateClick}
            onMapClick={pingMode ? onMapPing : undefined}
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
            {/* ⚠️ 지도 SDK 가 못 뜬 상태에서도 **후보 등록·투표가 되어야 한다.**
                   v19 §4-⑥⑧ 의 동작이 '지도 위 핀 탭' 이라, 폴백에서 후보를 안 그리면
                   키 없는 기기에서는 그 단계가 통째로 막힌다 (CLAUDE.md §3-4). */}
            {mapCandidates.length > 0 && onCandidateClick && (
              <div
                style={{
                  position: "absolute", left: 8, right: 8, bottom: 8, zIndex: 6,
                  display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center",
                }}
              >
                {mapCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onCandidateClick(c.id)}
                    className="chip"
                    style={{
                      cursor: "pointer", fontSize: 11, padding: "5px 10px",
                      background: "var(--panel)",
                      border: `1.5px solid ${c.preview ? "var(--hair2)" : "var(--ac)"}`,
                      color: c.preview ? "var(--ink-soft)" : "var(--ink)",
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    {c.name}
                    <span style={{ marginLeft: 5, fontWeight: 900, color: c.preview ? "var(--ink-faint)" : "var(--ac-deep)" }}>
                      {c.preview ? "+ 후보 등록" : `${c.votes}표`}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
        {!fallback && state.winnerRegion && (
          <div className="v8-mapnote">
            📍 중간 추천 지역: <b>{state.winnerRegion.name}</b> · {state.winnerRegion.reason}
            {routes.length > 0 && !routes.every((r) => r.real) && (
              // 같은 화면의 이동시간 칩과 **같은 단어**를 쓴다 — 예전엔 여기만 `직선 근사` 라는
              // 세 번째 표현이라 사용자가 다른 개념으로 읽었다. 원인도 단정하지 않는다
              // (키 없음·API 실패·못 푸는 구간 전부 같은 폴백이다).
              <span className="faint">{" · "}점선은 거리 추정(실제 경로를 가져오지 못한 구간)</span>
            )}
          </div>
        )}
      </div>
  );
}
