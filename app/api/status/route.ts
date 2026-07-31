import { NextResponse } from "next/server";
import { env, has } from "@/lib/env";
import { probeAi } from "@/lib/ai";
import { db, dbConfigured, dbUrlInfo } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/status → 외부 API 키 설정 여부 + DB 실접속 + AI(Ollama) 실접속 상태
export async function GET() {
  const ai = await probeAi();

  // URL이 있어도 스키마를 아직 안 만들었거나 프로젝트가 일시정지면 쓸 수 없다 —
  // "설정됨"과 "실제로 동작함"은 다르므로 가벼운 조회를 한 번 해 본다.
  const dbStatus: {
    configured: boolean;
    ready: boolean;
    error?: string;
    url?: string;
    urlHint?: string;
  } = {
    configured: dbConfigured,
    ready: false,
  };
  if (db) {
    try {
      await db`select code from meetings limit 1`;
      dbStatus.ready = true;
    } catch (e) {
      dbStatus.error = e instanceof Error ? e.message : String(e);
    }
  }

  // 실패했을 때만 접속 주소를 함께 보여준다 — `fetch failed` 는 원인을 말해주지
  // 않아서, 파일을 열어보지 않고는 오타인지 네트워크인지 알 수가 없다.
  // ⚠️ DATABASE_URL 에는 비밀번호가 들어 있으므로 masked(비밀번호 *** 처리)만 노출한다.
  if (dbConfigured && !dbStatus.ready) {
    dbStatus.url = dbUrlInfo.masked;
    const hints: string[] = [];
    if (!dbUrlInfo.hasScheme) hints.push("postgresql:// 로 시작하지 않습니다");
    if (!dbUrlInfo.hasCredentials) hints.push("사용자:비밀번호@ 부분이 없습니다");
    if (dbUrlInfo.endsWithSlash) hints.push("끝에 / 가 붙어 있습니다(DB 이름이 비었을 수 있음)");
    if (dbUrlInfo.len !== dbUrlInfo.trimmedLen) hints.push("값 앞뒤에 공백/개행이 있습니다");
    dbStatus.urlHint = hints.length
      ? hints.join(" · ")
      : "주소는 형식상 정상입니다 — Neon 콘솔의 Connection string 과 대조하거나, db/schema.sql 을 실행했는지·프로젝트가 일시정지(idle/paused)되지 않았는지 확인하세요";
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
    db: dbStatus, // { configured, ready, error?, url?, urlHint? }
    store: db ? "neon" : "memory",
    ai, // { ok, active: "primary"|"fallback"|"none", model, url }
  });
}
