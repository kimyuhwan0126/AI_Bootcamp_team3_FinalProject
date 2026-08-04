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
    // 안전벨트: 스킴을 뗀 나머지에 콜론이나 @ 가 있는데 마스킹 흔적(:***@)이
    // 없으면 형식을 확신할 수 없다는 뜻이다 — 원문 대신 안내문만 싣는다.
    // "@ 가 있는가"로 판정하면 @ 앞에서 잘린 값(예: 개행 때문에
    // `postgresql://user:비밀번호` 까지만 읽힌 경우)이 평문으로 새어 나간다.
    const bare = dbUrlInfo.masked.replace(/^[a-z+]+:\/\//i, "");
    const suspicious =
      (bare.includes(":") || bare.includes("@")) && !dbUrlInfo.masked.includes(":***@");
    dbStatus.url = suspicious
      ? "(형식을 알 수 없어 표시하지 않음 — 아래 힌트를 확인하세요)"
      : dbUrlInfo.masked;
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
    // ODsay 프록시 경유 설정 여부. **주소·비밀값은 싣지 않는다** — 터널 주소는
    // 반쯤 비밀이고, 공유 비밀은 완전한 비밀이다. 켜졌는지만 불리언으로 밝힌다.
    //
    // 이게 없으면 `odsay: true` 인데 실패할 때 "키 문제"인지 "프록시 미설정"인지
    // 밖에서 구분할 방법이 없다 — 2026-08-04 종단 확인에서 실제로 막혔다.
    odsayProxy: env.odsayBase !== "https://api.odsay.com",
    odsayProxyAuth: !!env.odsayProxySecret,
    tmap: has.tmap,
    db: dbStatus, // { configured, ready, error?, url?, urlHint? }
    store: db ? "neon" : "memory",
    // **지금 보고 있는 배포가 어느 것인지.** Vercel 이 심어 주는 시스템 환경변수라
    // 우리가 설정할 것은 없고, 로컬에서는 전부 없으므로 "local" 로 떨어진다.
    //
    // 없으면 Preview 와 Production 응답이 **글자 하나 다르지 않아** 어느 배포를
    // 보고 있는지 알 수가 없다(`kakaoRedirect` 는 두 스코프가 같은 값이다).
    // 2026-08-04 ODsay 종단 확인에서 이것 때문에 한 라운드를 헛돌았다.
    // 공개 저장소라 브랜치명·커밋 해시는 비밀이 아니다.
    deploy: {
      env: process.env.VERCEL_ENV || "local", // production | preview | development
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    },
    ai, // { ok, active: "primary"|"fallback"|"none", model, url }
  });
}
