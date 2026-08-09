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
  rating: number; url: string;
}

export interface PlacePickerProps {
  state: MeetingState;
  isLeader: boolean;
  busy: boolean;
  myId: string | undefined;
  onAction: (body: Record<string, unknown>, ok?: string) => Promise<unknown>;
}

export default function PlacePicker({ state, isLeader, busy, myId, onAction }: PlacePickerProps) {
  const [cat, setCat] = useState<PurposeCategory>(state.purposeCategory ?? "food");
  const [sort, setSort] = useState<"near" | "rating">("near");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Poi[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ code: state.code, cat, sort });
      if (q.trim()) sp.set("q", q.trim());
      const r = await fetch(`/api/place-poi?${sp}`);
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      setItems([]);       // 조회 실패도 "0개"로 다룬다 — 아래 안내가 대안을 준다
    } finally {
      setLoading(false);
    }
  }, [state.code, cat, sort, q]);

  // 카테고리·정렬·반경이 바뀌면 다시 부른다. (검색어는 버튼으로 — 타이핑마다 부르지 않는다)
  useEffect(() => { void load(); }, [cat, sort, state.radiusM]); // eslint-disable-line react-hooks/exhaustive-deps

  const registered = new Set(state.places.map((p) => p.name.replace(/\s/g, "")));
  const empty = items != null && items.length === 0;

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
                    {p.source === "ai" ? " · AI 추천" : p.proposedBy ? ` · ${p.proposedBy}` : ""}
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

      {/* ── 미리보기 핀 목록 — 탭하면 후보가 된다 ── */}
      <span className="eyebrow">주변 장소 {loading ? "· 찾는 중…" : ""}</span>

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
              <button
                key={it.name}
                className="cc"
                style={{ textAlign: "left", opacity: already ? 0.5 : 1 }}
                disabled={busy || already}
                title={already ? "이미 후보로 등록됐어요" : "탭하면 후보로 등록돼요"}
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
                <b>{it.emoji} {it.name}</b>
                <span>
                  {it.category} · 도보 {it.walkMin}분 ({it.distanceM}m)
                  {/* ⚠️ 0 은 "정보 없음"이다 — 별을 그리지 않는다 (CLAUDE.md §3-6) */}
                  {it.rating > 0 ? ` · ⭐ ${it.rating}` : ""}
                  {already ? " · 등록됨" : ""}
                </span>
              </button>
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
