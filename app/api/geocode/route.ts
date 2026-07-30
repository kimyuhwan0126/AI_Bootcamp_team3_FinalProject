// GET /api/geocode?q=강남 — 출발지 자동완성 (카카오 키워드 검색, 키 없으면 HUBS mock)
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { HUBS } from "@/lib/geo";

export interface GeoSuggest {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ items: [], mock: !env.kakaoRest });

  if (env.kakaoRest) {
    try {
      const r = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=6`,
        { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } }
      );
      if (r.ok) {
        const d = await r.json();
        const items: GeoSuggest[] = (d.documents || []).map((doc: {
          place_name: string; road_address_name?: string; address_name?: string; x: string; y: string;
        }) => ({
          name: doc.place_name,
          address: doc.road_address_name || doc.address_name || "",
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
        }));
        return NextResponse.json({ items, mock: false });
      }
    } catch {
      /* mock 폴백 */
    }
  }

  const t = q.replace(/\s/g, "");
  const items: GeoSuggest[] = Object.keys(HUBS)
    .filter((k) => k.includes(t) || t.includes(k))
    .slice(0, 6)
    .map((k) => ({ name: k, address: "서울/수도권 (mock)", lat: HUBS[k].lat, lng: HUBS[k].lng }));
  return NextResponse.json({ items, mock: true });
}
