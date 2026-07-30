"use client";

// ─────────────────────────────────────────────────────────────
// ＋ 다른 후보 등록 — 지도(카카오 로컬) 검색으로 원하는 지역을 후보에 올린다.
//
// 👤 담당: 투표·추천 화면 (`.github/CODEOWNERS`)
//
// 방장 전용이 아니다: 자동 추천이 엉뚱할 때 누구든 "여기로 하자"를 낼 수 있어야
// 투표가 의미를 갖는다(특히 수도권 밖에서 기하 중간점이 시골로 잡히는 경우).
// ─────────────────────────────────────────────────────────────
import type { GeoSuggest } from "@/app/api/geocode/route";

export interface AddRegionModalProps {
  query: string;
  onQueryChange: (v: string) => void;
  /** null = 아직 검색 전 · [] = 검색했는데 결과 없음 */
  hits: GeoSuggest[] | null;
  searching: boolean;
  busy: boolean;
  onPick: (s: GeoSuggest) => void;
  onClose: () => void;
}

export default function AddRegionModal({
  query,
  onQueryChange,
  hits,
  searching,
  busy,
  onPick,
  onClose,
}: AddRegionModalProps) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal stack" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <b style={{ fontSize: 16 }}>＋ 다른 후보 등록</b>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.55 }}>
            만나고 싶은 지역을 검색해 후보에 추가해요. 추가하면 모두의 이동시간이 계산되고,
            다른 후보들과 함께 투표 대상이 됩니다.
          </p>
        </div>
        <input
          className="input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="예: 대전역, 동대구역, 천안아산역…"
          autoComplete="off"
          autoFocus
        />
        <div className="stack" style={{ gap: 8, minHeight: 44 }}>
          {searching && (
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>
              검색 중…
            </p>
          )}
          {/* 검색이 못 찾아도 막다른 길이 되지 않게 — 입력한 이름 그대로 등록할 수
              있게 한다(좌표는 서버가 지오코딩으로 찾는다). 프로토타입의 안전망과 같다. */}
          {!searching && hits?.length === 0 && (
            <>
              <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                검색 결과가 없어요. 이름 그대로 등록할 수도 있어요.
              </p>
              <button
                className="v8-voterow"
                style={{ margin: 0, textAlign: "left", cursor: "pointer" }}
                disabled={busy}
                onClick={() => onPick({ name: query.trim(), address: "직접 입력", lat: NaN, lng: NaN })}
              >
                <div className="grow">
                  <div className="i-title">‘{query.trim()}’(으)로 등록</div>
                  <div className="i-sub">위치는 서버가 찾아요</div>
                </div>
                <span className="v8-votepill">추가</span>
              </button>
            </>
          )}
          {(hits ?? []).map((s) => (
            <button
              key={`${s.name}${s.lat}`}
              className="v8-voterow"
              style={{ margin: 0, textAlign: "left", cursor: "pointer" }}
              disabled={busy}
              onClick={() => onPick(s)}
            >
              <div className="grow">
                <div className="i-title">{s.name}</div>
                <div className="i-sub">{s.address}</div>
              </div>
              <span className="v8-votepill">추가</span>
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
