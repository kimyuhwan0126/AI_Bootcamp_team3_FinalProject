// GET /api/places?lat&lng&cat=all|cafe|food|pub|parking|station
// 중간지점 주변 정보 — 카카오 로컬 검색, 키 없으면 mock (generatePlaces)
//  · parking / station 은 카테고리 그룹 코드(PK6/SW8)로 검색해 정확도를 높이고
//    버스정류장은 코드가 없어 키워드로 보완한다.
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { searchPlacesKakao, searchByCategoryKakao } from "@/lib/kakao";
import { generatePlaces } from "@/lib/geo";

const CAT_KEYWORDS: Record<string, string[]> = {
  all: ["카페", "음식점"],
  cafe: ["카페"],
  food: ["음식점"],
  pub: ["술집"],
};

export interface NearbyItem {
  name: string;
  category: string;
  /** 노선/주차 유형 등 카테고리별 부가 정보 (없으면 빈 문자열) */
  detail: string;
  /** 아이콘 판정용 카카오 분류 전체 경로 */
  path: string;
  distanceM: number;
  walkMin: number;
  url: string;
}

const walkMin = (m: number) => Math.max(1, Math.round(m / 67));

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") || "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") || "");
  const cat = req.nextUrl.searchParams.get("cat") || "all";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng 필요" }, { status: 400 });
  }
  const center = { lat, lng };

  // ── 주차장 ──
  if (cat === "parking") {
    if (env.kakaoRest) {
      const r = await searchByCategoryKakao("PK6", center, 6);
      if (r && r.length > 0) {
        const items: NearbyItem[] = r.map((p) => ({
          name: p.name,
          category: "주차장",
          detail: p.category || "주차 가능",
          path: "주차장",
          distanceM: p.distanceM,
          walkMin: walkMin(p.distanceM),
          url: p.url,
        }));
        return NextResponse.json({ items, mock: false });
      }
    }
    const items: NearbyItem[] = [
      { name: "중간지점 공영주차장", category: "주차장", detail: "공영 · 10분당 500원", path: "주차장", distanceM: 240, walkMin: 4, url: "" },
      { name: "중간지점 노상 주차장", category: "주차장", detail: "노상 · 30분 1,000원", path: "주차장", distanceM: 380, walkMin: 6, url: "" },
      { name: "빌딩 부설주차장", category: "주차장", detail: "부설 · 매장 이용 시 할인", path: "주차장", distanceM: 520, walkMin: 8, url: "" },
    ];
    return NextResponse.json({ items, mock: true });
  }

  // ── 정류장 · 역 (지하철역 + 버스정류장) ──
  if (cat === "station") {
    if (env.kakaoRest) {
      const [subway, bus] = await Promise.all([
        searchByCategoryKakao("SW8", center, 4),
        searchPlacesKakao("버스정류장", center, 4),
      ]);
      const merged: NearbyItem[] = [
        ...(subway || []).map((p) => ({
          name: p.name,
          category: "지하철역",
          detail: p.category || "지하철",
          path: "지하철역",
          distanceM: p.distanceM,
          walkMin: walkMin(p.distanceM),
          url: p.url,
        })),
        ...(bus || []).map((p) => ({
          name: p.name,
          category: "버스정류장",
          detail: "버스",
          path: "버스정류장",
          distanceM: p.distanceM,
          walkMin: walkMin(p.distanceM),
          url: p.url,
        })),
      ]
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 6);
      if (merged.length > 0) return NextResponse.json({ items: merged, mock: false });
    }
    const items: NearbyItem[] = [
      { name: "중간지점 사거리 정류장", category: "버스정류장", detail: "간선 401 · 402", path: "버스정류장", distanceM: 180, walkMin: 3, url: "" },
      { name: "중간지점역 2번 출구", category: "지하철역", detail: "수도권 2호선", path: "지하철역", distanceM: 320, walkMin: 5, url: "" },
      { name: "중간지점 환승센터", category: "버스정류장", detail: "광역 M4108", path: "버스정류장", distanceM: 450, walkMin: 7, url: "" },
    ];
    return NextResponse.json({ items, mock: true });
  }

  // ── 카페 / 음식점 / 술집 / 전체 ──
  const keywords = CAT_KEYWORDS[cat] || CAT_KEYWORDS.all;
  if (env.kakaoRest) {
    const results = await Promise.all(keywords.map((kw) => searchPlacesKakao(kw, center, 4)));
    const merged = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .flat()
      // 같은 상호가 여러 키워드에 중복으로 잡히는 것 제거 (이름 기준)
      .filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 6);
    if (merged.length > 0) {
      const items: NearbyItem[] = merged.map((p) => ({
        name: p.name,
        category: p.category,
        detail: "",
        path: p.path,
        distanceM: p.distanceM,
        walkMin: walkMin(p.distanceM),
        url: p.url,
      }));
      return NextResponse.json({ items, mock: false });
    }
  }

  const items: NearbyItem[] = generatePlaces("중간지점")
    .filter((p) => {
      if (cat === "cafe") return p.category === "카페";
      if (cat === "pub") return p.category === "술집";
      if (cat === "food") return p.category !== "카페" && p.category !== "술집";
      return true;
    })
    .map((p) => ({
      name: p.name,
      category: p.category,
      detail: "",
      path: p.category,
      distanceM: p.distanceM,
      walkMin: walkMin(p.distanceM),
      url: "",
    }));
  return NextResponse.json({ items, mock: true });
}
