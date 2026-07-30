import { NextResponse } from "next/server";
import { has } from "@/lib/env";
import { probeAi } from "@/lib/ai";
import { hasSupabase, supabaseKeyKind, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/status → 외부 API 키 설정 여부 + DB 실접속 + AI(Ollama) 실접속 상태
export async function GET() {
  const ai = await probeAi();

  // 키가 있어도 스키마를 아직 안 만들었거나 RLS에 막히면 쓸 수 없다 —
  // "키가 설정됨"과 "실제로 동작함"은 다르므로 가벼운 조회를 한 번 해 본다.
  const db: { configured: boolean; keyKind: string; ready: boolean; error?: string } = {
    configured: hasSupabase,
    keyKind: supabaseKeyKind,
    ready: false,
  };
  if (supabase) {
    const { error } = await supabase.from("meetings").select("code").limit(1);
    if (error) db.error = error.message;
    else db.ready = true;
  }

  return NextResponse.json({
    kakao: has.kakaoGeocode, // 로그인 + 지오코딩/장소검색 (REST 키)
    kakaoJs: has.kakaoJs, // 브라우저 지도 SDK
    odsay: has.odsay,
    tmap: has.tmap,
    db, // { configured, keyKind, ready, error? }
    store: hasSupabase ? "supabase" : "memory",
    ai, // { ok, active: "primary"|"fallback"|"none", model, url }
  });
}
