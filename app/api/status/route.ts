import { NextResponse } from "next/server";
import { has } from "@/lib/env";

export const dynamic = "force-dynamic";

// GET /api/status → 각 외부 API 키 설정 여부 (mock vs 연결됨)
export async function GET() {
  return NextResponse.json({
    kakao: has.kakaoGeocode, // 로그인 + 지오코딩 (REST 키)
    odsay: has.odsay,
    tmap: has.tmap,
  });
}
