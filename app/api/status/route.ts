import { NextResponse } from "next/server";
import { has } from "@/lib/env";
import { probeAi } from "@/lib/ai";

export const dynamic = "force-dynamic";

// GET /api/status → 외부 API 키 설정 여부 + AI(Ollama) 실접속 상태
export async function GET() {
  const ai = await probeAi();
  return NextResponse.json({
    kakao: has.kakaoGeocode, // 로그인 + 지오코딩 (REST 키)
    odsay: has.odsay,
    tmap: has.tmap,
    ai, // { ok, active: "primary"|"fallback"|"none", model, url }
  });
}
