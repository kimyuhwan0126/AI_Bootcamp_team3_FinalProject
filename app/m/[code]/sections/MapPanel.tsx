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
}: MapPanelProps) {
  return (
      <div className="map">
        {/* 홈과 동일한 지도 조작 — 참가자가 2명 이상 위치를 넣었을 때만 의미가 있다 */}
        {!fallback && located.length > 0 && (
          <div className="v8-maplayer">
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
        {!fallback && state.winnerRegion && (
          <div className="v8-mapnote">
            📍 중간 추천 지역: <b>{state.winnerRegion.name}</b> · {state.winnerRegion.reason}
            {routes.length > 0 && !routes.every((r) => r.real) && (
              <span className="faint">{" · "}점선은 직선 근사(경로 API 미응답)</span>
            )}
          </div>
        )}
      </div>
  );
}
