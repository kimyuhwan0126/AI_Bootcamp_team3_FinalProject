"use client";

// ─────────────────────────────────────────────────────────────
// 지점 후보 등록 (STAGE: chat · place · 투표 시작 전)
//
// 설계_v19.md §4-⑧ — 확정 동 중심 **반경 700m** 안에서 고른다.
//   · 조회는 **전원 가능** (v10) · 목적 카테고리가 기본 포커싱 (v6)
//   · **미리보기 핀 탭 → 후보 등록**, 상한 없음 (v7)
//   · 삭제는 방장(임의) · 본인(자기 것) (v7)
//   · 반경 밖은 서버가 거부 · 0개면 확장(700→1400m·1회) 또는 다른 방법 (v12·v15)
//
// ⚠️ 여기 목록은 **후보가 아니라 미리보기**다. 탭해야 후보가 된다 —
//    시스템이 후보를 미리 담아두지 않는 것이 v19 의 규칙이다.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import type { MeetingState, PurposeCategory } from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/types";

interface Poi {
  name: string; category: string; emoji: string;
  lat: number; lng: number; distanceM: number; walkMin: number;
  rating: number; url: string; address: string;
}

export interface PlacePickerProps {
  state: MeetingState;
  isLeader: boolean;
  busy: boolean;
  myId: string | undefined;
  onAction: (body: Record<string, unknown>, ok?: string) => Promise<unknown>;
  /**
   * v19 §4-⑧ — 조회한 미리보기 장소를 **지도에 회색 핀으로 띄우려고** 위로 올린다.
   * 설계는 "미리보기 핀(회색) 탭 → 후보 등록" 인데, 목록만 있으면 지도가 아니라
   * 텍스트를 읽고 고르는 화면이 된다. 아래 목록은 검색·정렬용으로 남긴다.
   */
  onPreview?: (
    items: {
      id: string; name: string; lat: number; lng: number;
      category: string; emoji: string; rating: number; url: string;
    }[]
  ) => void;
}

export default function PlacePicker({ state, isLeader, busy, myId, onAction, onPreview }: PlacePickerProps) {
  const [cat, setCat] = useState<PurposeCategory>(state.purposeCategory ?? "food");
  const [sort, setSort] = useState<"near" | "rating">("near");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Poi[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** 지금 목록이 카카오 실데이터인지, 키 없음/무결과로 인한 샘플인지 */
  const [isMock, setIsMock] = useState(false);
  /** 검색어로 찾았는데 반경 안에 하나도 없었던 경우 (샘플로 덮지 않는다) */
  const [searchedEmpty, setSearchedEmpty] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ code: state.code, cat, sort });
      if (q.trim()) sp.set("q", q.trim());
      const r = await fetch(`/api/place-poi?${sp}`);
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
      setIsMock(!!d.mock);
      setSearchedEmpty(d.searchedEmpty ? String(d.query ?? "") : null);
    } catch {
      setItems([]);       // 조회 실패도 "0개"로 다룬다 — 아래 안내가 대안을 준다
      setIsMock(false);
      setSearchedEmpty(null);
    } finally {
      setLoading(false);
    }
  }, [state.code, cat, sort, q]);

  // 카테고리·정렬·반경이 바뀌면 다시 부른다. (검색어는 버튼으로 — 타이핑마다 부르지 않는다)
  useEffect(() => { void load(); }, [cat, sort, state.radiusM]); // eslint-disable-line react-hooks/exhaustive-deps

  const registered = new Set(state.places.map((p) => p.name.replace(/\s/g, "")));
  const empty = items != null && items.length === 0;

  // 조회 결과를 지도로 올린다 — **이미 후보인 곳은 빼고** (지도에 같은 자리가 두 번 그려진다)
  useEffect(() => {
    if (!onPreview) return;
    onPreview(
      (items ?? [])
        .filter((p) => !registered.has(p.name.replace(/\s/g, "")))
        .map((p) => ({
          id: `pv_${p.name}`, name: p.name, lat: p.lat, lng: p.lng,
          category: p.category, emoji: p.emoji, rating: p.rating, url: p.url,
        }))
    );
  }, [items, state.places.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <div>
          <span className="eyebrow">2. 지점 후보 등록</span>
          <h2 className="sec" style={{ marginTop: 4 }}>
            {state.winnerRegion?.name}에서 어디로?
          </h2>
        </div>
        <span className="chip line" style={{ fontSize: 10 }}>
          반경 {state.radiusM}m · 후보 {state.places.length}개
        </span>
      </div>

      {/* 목적 카테고리 — 생성 시 고른 것이 기본 포커싱 (v6) */}
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {(Object.keys(PURPOSE_LABELS) as PurposeCategory[]).map((k) => (
          <button
            key={k}
            className={"chip" + (cat === k ? " ok" : " line")}
            style={{ cursor: "pointer", fontSize: 11.5 }}
            onClick={() => setCat(k)}
          >
            {PURPOSE_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 6 }}>
        <input
          className="input grow"
          value={q}
          placeholder="가게 이름으로 찾기 (선택)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <button className="btn sm" style={{ flexShrink: 0 }} disabled={loading} onClick={() => void load()}>
          찾기
        </button>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className={"chip" + (sort === "near" ? " ok" : " line")} style={{ cursor: "pointer", fontSize: 11 }} onClick={() => setSort("near")}>
          가까운순
        </button>
        <button className={"chip" + (sort === "rating" ? " ok" : " line")} style={{ cursor: "pointer", fontSize: 11 }} onClick={() => setSort("rating")}>
          별점순
        </button>
      </div>

      {/* ── 이미 등록된 후보 ── */}
      {state.places.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">등록된 후보</span>
          {state.places.map((p) => {
            const canDelete = isLeader || p.proposedById === myId;
            return (
              <div className="row" key={p.id} style={{ gap: 8 }}>
                <div className="grow">
                  <b style={{ fontSize: 13 }}>{p.emoji} {p.name}</b>
                  <div className="faint" style={{ fontSize: 10.5 }}>
                    {p.category} · {p.distanceM}m
                    {p.rating > 0 ? ` · ⭐ ${p.rating}` : ""}
                    {p.proposedBy ? ` · ${p.proposedBy}` : ""}{p.aiSuggested ? " · AI 추천" : ""}
                  </div>
                </div>
                {canDelete && (
                  <button
                    className="btn sm ghost"
                    style={{ flexShrink: 0 }}
                    disabled={busy}
                    onClick={() => void onAction({ action: "removePlace", participantId: myId, placeId: p.id }, "후보를 지웠어요")}
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 미리보기 목록 — 지도의 회색 핀과 **같은 것**이다 (v19 §4-⑧) ──
             설계의 기본 동작은 "지도의 회색 핀 탭 → 후보 등록" 이고,
             이 목록은 검색·정렬로 찾아 들어가는 보조 경로다. */}
      <div className="between">
        <span className="eyebrow">주변 장소 {loading ? "· 찾는 중…" : ""}</span>
        <span className="faint" style={{ fontSize: 10.5 }}>지도의 회색 핀을 눌러도 돼요</span>
      </div>

      {/* ⚠️ 샘플을 실제인 것처럼 그리지 않는다 (CLAUDE.md §3-6).
             '○○ 곱창집' 같은 이름이 진짜 가게처럼 보이면, 방장이 없는 가게를
             후보로 올리고 그걸로 확정까지 간다. */}
      {isMock && (
        <div className="chip warn" style={{ alignSelf: "flex-start", fontSize: 10.5 }}>
          ⚠ 샘플 목록 — 카카오에서 실제 장소를 못 받았어요 (키 미설정 또는 반경 내 없음)
        </div>
      )}

      {searchedEmpty !== null && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            ‘<b>{searchedEmpty}</b>’ 을(를) 반경 {state.radiusM}m 안에서 찾지 못했어요.
          </p>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => { setQ(""); void load(); }}>검색어 지우기</button>
            {state.radiusM < 1400 && (
              <button
                className="btn sm"
                disabled={busy}
                onClick={() => void onAction({ action: "expandRadius", participantId: myId }, "반경을 1400m로 넓혔어요")}
              >
                반경 넓히기 (1.4km)
              </button>
            )}
          </div>
        </div>
      )}

      {empty ? (
        // v12·v15: 0개면 확장(1회) 또는 다른 방법
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            반경 {state.radiusM}m 안에 {PURPOSE_LABELS[cat]}이(가) 없어요.
          </p>
          {state.radiusM < 1400 ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void onAction({ action: "expandRadius", participantId: myId }, "반경을 1400m로 넓혔어요")}
            >
              🔍 반경 넓히기 (700m → 1400m · 1회)
            </button>
          ) : (
            <p className="faint" style={{ fontSize: 11, margin: 0 }}>
              이미 최대까지 넓혔어요. 다른 카테고리를 고르거나 이름으로 검색해 보세요.
            </p>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {(items ?? []).map((it) => {
            const already = registered.has(it.name.replace(/\s/g, ""));
            return (
              // ⚠️ 행 전체를 등록 버튼으로 두지 않는다 — 주소를 읽으려고 눌렀다가
              //    후보가 등록된다. **보기(카카오맵)** 와 **등록**을 갈라 놓는다.
              <div
                key={it.name}
                className="row"
                style={{
                  gap: 8, alignItems: "flex-start", padding: "9px 11px",
                  border: "1px solid var(--hair)", borderRadius: 12,
                  background: already ? "var(--panel2)" : "var(--panel)",
                  opacity: already ? 0.62 : 1,
                }}
              >
                <div className="grow">
                  <b style={{ fontSize: 13 }}>{it.emoji} {it.name}</b>
                  <div className="faint" style={{ fontSize: 11, marginTop: 1 }}>
                    {it.category} · 도보 {it.walkMin}분 ({it.distanceM}m)
                    {/* ⚠️ 0 은 "정보 없음"이다 — 별을 그리지 않는다 (CLAUDE.md §3-6) */}
                    {it.rating > 0 ? ` · ⭐ ${it.rating}` : ""}
                  </div>
                  {/* 주소가 없으면 "이게 어디인지" 알 방법이 없다 — 고르는 유일한 단서 */}
                  {it.address && (
                    <div className="faint" style={{ fontSize: 10.5, marginTop: 1 }}>{it.address}</div>
                  )}
                </div>
                <div className="stack" style={{ gap: 4, flexShrink: 0 }}>
                  {it.url && (
                    <a
                      className="btn sm ghost"
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                      title="카카오맵에서 사진·메뉴·리뷰를 보고 결정하세요"
                    >
                      보기
                    </a>
                  )}
                  <button
                    className="btn sm"
                    disabled={busy || already}
                    onClick={() =>
                      void onAction(
                        {
                          action: "addPlace",
                          participantId: myId,
                          name: it.name, category: it.category, emoji: it.emoji,
                          lat: it.lat, lng: it.lng, rating: it.rating, url: it.url,
                        },
                        `${it.name}을(를) 후보로 등록했어요`
                      )
                    }
                  >
                    {already ? "등록됨" : "+ 등록"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="faint" style={{ fontSize: 10.5, margin: 0 }}>
        누구나 후보를 등록할 수 있어요 (개수 제한 없음). 방장이 <b>투표 시작</b>을 누르면 후보가 잠겨요.
      </p>
    </div>
  );
}
