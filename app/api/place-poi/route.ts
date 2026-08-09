// ─────────────────────────────────────────────────────────────
// GET /api/place-poi?code=ABC123&cat=food&q=검색어&sort=near|rating
//
// 지점 단계(⑧)의 **미리보기 핀** 목록 — 확정 동 중심 반경 안의 POI.
// 설계_v19.md §4-⑧ · 전원이 조회할 수 있다 (v10).
//
// ⚠️ 여기서 돌려주는 건 **후보가 아니다.** 화면에 회색 핀으로 뿌려두고,
//    사람이 탭하면 그때 `POST /api/meeting {action:"addPlace"}` 로 후보가 된다.
//    (v19 는 "미리보기 핀 탭 → 후보 등록"이다 — 시스템이 후보를 미리 담지 않는다)
//
// ⚠️ 반경 판정은 **서버가 다시 한다.** 이 목록이 반경 안이어도 등록 시점에
//    단계가 바뀌었을 수 있어, `addPlaceCandidate` 가 최종 관문이다.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { searchPlacesKakao } from "@/lib/kakao";
import { getState, distanceM } from "@/lib/store";
import { PURPOSE_LABELS } from "@/lib/types";
import type { PurposeCategory } from "@/lib/types";
import { ratingsFor } from "@/lib/place-rating";

/** 목적 카테고리 → 카카오 검색 키워드 (v13 — 5종 매핑) */
const CAT_KEYWORDS: Record<PurposeCategory, string[]> = {
  food: ["음식점", "맛집"],
  cafe: ["카페"],
  bar: ["술집", "호프"],
  culture: ["문화시설", "놀거리"],
  outdoor: ["공원", "산책로"],
};

/** 카테고리별 표시 이모지 — 후보 카드·지도 핀에 함께 쓴다 */
const CAT_EMOJI: Record<PurposeCategory, string> = {
  food: "🍽", cafe: "☕", bar: "🍺", culture: "🎬", outdoor: "🌳",
};

export interface PoiItem {
  name: string;
  category: string;
  emoji: string;
  lat: number;
  lng: number;
  distanceM: number;
  walkMin: number;
  /** 0 = 정보 없음. 없는 별점을 지어내지 않는다 (CLAUDE.md §3-6) */
  rating: number;
  url: string;
}

const walkMin = (m: number) => Math.max(1, Math.round(m / 67));

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = (sp.get("code") || "").toUpperCase();
  const q = (sp.get("q") || "").trim();
  const sort = sp.get("sort") === "rating" ? "rating" : "near";

  const state = await getState(code);
  if (!state) return NextResponse.json({ error: "모임을 찾을 수 없어요." }, { status: 404 });
  const center = state.winnerRegion;
  if (!center) return NextResponse.json({ error: "확정된 지역이 없어요." }, { status: 400 });

  // 목적 카테고리가 기본 포커싱이다 (v6). 쿼리로 덮어쓸 수 있다.
  const catParam = sp.get("cat");
  const cat: PurposeCategory =
    catParam && catParam in PURPOSE_LABELS
      ? (catParam as PurposeCategory)
      : (state.purposeCategory ?? "food");

  const radius = state.radiusM;
  const keywords = q ? [q] : CAT_KEYWORDS[cat];

  // ── 조회 ── 키가 없으면 mock 으로 떨어진다(팀원이 키 없이 시연할 수 있어야 한다)
  const found: PoiItem[] = [];
  const seen = new Set<string>();

  if (env.kakaoRest) {
    for (const kw of keywords) {
      const r = await searchPlacesKakao(kw, center, 15);
      for (const p of r ?? []) {
        const d = distanceM(center, p);
        if (d > radius) continue;              // 반경 밖은 애초에 안 보여준다
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        found.push({
          name: p.name,
          category: p.category || PURPOSE_LABELS[cat],
          emoji: CAT_EMOJI[cat],
          lat: p.lat,
          lng: p.lng,
          distanceM: d,
          walkMin: walkMin(d),
          rating: 0,                            // 아래에서 채운다(실패하면 0 유지)
          url: p.url,
        });
      }
    }
  }

  // 키가 없거나 결과가 비었으면 mock — 반경 안에 흩뿌린다.
  const isMock = found.length === 0;
  if (isMock) {
    const names = MOCK_NAMES[cat];
    for (let i = 0; i < names.length; i++) {
      // 반경의 30~90% 지점에 고르게 배치 (결정적 — 새로고침해도 안 움직인다)
      const ang = (i / names.length) * Math.PI * 2;
      const dist = radius * (0.3 + 0.6 * ((i % 3) / 2));
      const dLat = (dist * Math.cos(ang)) / 111_320;
      const dLng = (dist * Math.sin(ang)) / (111_320 * Math.cos((center.lat * Math.PI) / 180));
      const lat = center.lat + dLat;
      const lng = center.lng + dLng;
      const d = distanceM(center, { lat, lng });
      found.push({
        name: `${center.name} ${names[i]}`,
        category: PURPOSE_LABELS[cat],
        emoji: CAT_EMOJI[cat],
        lat, lng,
        distanceM: d,
        walkMin: walkMin(d),
        rating: 0,
        url: "",
      });
    }
  }

  // ── 별점 (팀 결정: 스크래핑 복원 — 설계_v19.md §13-A) ──
  //  실패하면 rating 0(= 정보 없음)이 그대로 남는다. 시연이 멈추지 않는다.
  let ratingSource: "web" | "none" = "none";
  if (!isMock && found.length > 0) {
    const map = await ratingsFor(found.map((f) => ({ name: f.name, url: f.url })));
    if (map) {
      ratingSource = "web";
      for (const f of found) f.rating = map.get(f.name) ?? 0;
    }
  }

  // ── 정렬 ──
  //  별점순은 **별점이 있는 것만** 위로 올린다. 0(정보 없음)을 최하로 두지 않으면
  //  "정보 없음"이 별점 0점처럼 읽힌다.
  found.sort((a, b) =>
    sort === "rating"
      ? b.rating - a.rating || a.distanceM - b.distanceM
      : a.distanceM - b.distanceM
  );

  return NextResponse.json({
    items: found.slice(0, 30),
    center: { name: center.name, lat: center.lat, lng: center.lng },
    radiusM: radius,
    cat,
    sort,
    mock: isMock,
    ratingSource,
    /** 0개면 화면이 확장/다른 방법 팝업을 띄운다 (v12·v15) */
    canExpand: radius < 1400,
  });
}

const MOCK_NAMES: Record<PurposeCategory, string[]> = {
  food: ["곱창집", "국밥집", "파스타", "초밥집", "분식", "고깃집"],
  cafe: ["로스터리", "베이커리", "북카페", "디저트", "테라스", "핸드드립"],
  bar: ["포차", "맥주집", "와인바", "이자카야", "칵테일바", "호프"],
  culture: ["영화관", "전시관", "보드게임", "방탈출", "공연장", "볼링장"],
  outdoor: ["근린공원", "산책로", "하천변", "광장", "체육공원", "전망대"],
};
