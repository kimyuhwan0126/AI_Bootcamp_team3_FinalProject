import { NextResponse } from "next/server";
import { env, has } from "@/lib/env";
import { probeAi } from "@/lib/ai";
import { hasSupabase, supabaseKeyKind, supabase, supabaseUrlInfo } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/status → 외부 API 키 설정 여부 + DB 실접속 + AI(Ollama) 실접속 상태
export async function GET() {
  const ai = await probeAi();

  // 키가 있어도 스키마를 아직 안 만들었거나 RLS에 막히면 쓸 수 없다 —
  // "키가 설정됨"과 "실제로 동작함"은 다르므로 가벼운 조회를 한 번 해 본다.
  const db: {
    configured: boolean;
    keyKind: string;
    ready: boolean;
    error?: string;
    url?: string;
    urlHint?: string;
  } = {
    configured: hasSupabase,
    keyKind: supabaseKeyKind,
    ready: false,
  };
  if (supabase) {
    const { error } = await supabase.from("meetings").select("code").limit(1);
    if (error) db.error = error.message;
    else db.ready = true;

    // 실패했을 때만 접속 주소를 함께 보여준다 — `fetch failed` 는 원인을 말해주지
    // 않아서, 파일을 열어보지 않고는 오타인지 네트워크인지 알 수가 없다.
    if (!db.ready) {
      db.url = supabaseUrlInfo.url;
      const hints: string[] = [];
      if (!supabaseUrlInfo.hasScheme) hints.push("https:// 로 시작하지 않습니다");
      if (supabaseUrlInfo.endsWithSlash) hints.push("끝에 / 가 붙어 있습니다");
      if (supabaseUrlInfo.len !== supabaseUrlInfo.trimmedLen)
        hints.push("값 앞뒤에 공백/개행이 있습니다");
      db.urlHint = hints.length
        ? hints.join(" · ")
        : "주소는 형식상 정상입니다 — 대시보드의 Project URL 과 대조하거나, 프로젝트가 일시정지(paused)되지 않았는지 확인하세요";
    }
  }

  return NextResponse.json({
    kakao: has.kakaoGeocode, // 로그인 + 지오코딩/장소검색 (REST 키)
    kakaoJs: has.kakaoJs, // 브라우저 지도 SDK
    // 카카오 로그인이 실제로 보내는 Redirect URI — KOE006(등록되지 않은 URI)이
    // 뜨면 이 값을 developers.kakao.com 의 Redirect URI 목록과 글자 단위로
    // 대조하면 된다. URL이라 비밀이 아니며, 키 값은 여기 노출되지 않는다.
    kakaoRedirect: env.kakaoRedirect,
    odsay: has.odsay,
    tmap: has.tmap,
    db, // { configured, keyKind, ready, error? }
    store: hasSupabase ? "supabase" : "memory",
    ai, // { ok, active: "primary"|"fallback"|"none", model, url }
  });
}
