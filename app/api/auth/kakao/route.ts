import { NextResponse } from "next/server";
import { kakaoAuthorizeUrl } from "@/lib/kakao";
import { env, has } from "@/lib/env";

export const dynamic = "force-dynamic";

// 키 값을 통째로 노출하지 않기 위한 마스킹 — 콘솔의 앱 키와 "눈으로 대조"할 수 있을
// 만큼만 보여준다 (앞 4자 + 뒤 4자). REST 키는 인가 URL에 실려 주소창에 노출되는
// 값이긴 하지만, 진단 결과를 채팅 등에 붙여넣어도 안전하도록 가린다.
function mask(v: string): string {
  if (!v) return "(없음)";
  if (v.length <= 8) return `${v[0]}…${v[v.length - 1]}`;
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

// GET /api/auth/kakao          → 카카오 인가 페이지로 리다이렉트
// GET /api/auth/kakao?debug=1  → (개발 전용) 리다이렉트 대신, 카카오에 실제로
//                                보낼 값들을 JSON으로 보여준다.
//   KOE006(등록되지 않은 Redirect URI)은 카카오 페이지에서 막혀 우리 콜백까지
//   오지 않으므로 앱이 사유를 표시할 수 없다 — 대신 "무엇을 보내는지"를 보여주면
//   콘솔에 등록된 값과 대조해 어디가 다른지 찾을 수 있다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (url.searchParams.get("debug")) {
    // ⚠️ `!process.env.ENABLE_DEBUG` 는 값이 아니라 "존재"만 본다 —
    //    `ENABLE_DEBUG=0` 도 truthy 문자열이라 잠금이 풀린다. 정확히 "1" 일 때만 연다.
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG !== "1") {
      return NextResponse.json({ error: "disabled" }, { status: 403 });
    }
    const raw = kakaoAuthorizeUrl();
    return NextResponse.json({
      note: "카카오 로그인 진단 — 아래 값을 developers.kakao.com 설정과 대조하세요",
      restKey: {
        masked: mask(env.kakaoRest),
        length: env.kakaoRest.length, // 정상 REST 키는 32자. 다르면 오타/누락
        hasWhitespace: /\s/.test(env.kakaoRest), // 복사할 때 공백·개행이 섞인 경우
      },
      redirectUri: env.kakaoRedirect,
      authorizeUrl: raw.replace(env.kakaoRest, mask(env.kakaoRest)),
      checks: [
        "1) restKey.masked 가 [편집 중인 앱] > 앱 키 > REST API 키의 앞4·뒤4자와 같은가?",
        "   → 다르면 지금 키는 '다른 앱'의 키다. 그 다른 앱에 URI를 등록하거나 키를 바꿔야 한다.",
        "   (JS 키와 REST 키는 서로 다른 앱의 것일 수 있다 — 지도가 떠도 로그인은 다른 앱일 수 있음)",
        "2) redirectUri 가 카카오 로그인 메인 화면의 'Redirect URI' 목록에 글자 그대로 있는가?",
        "   (고급 탭의 '로그아웃 리다이렉트 URI'는 무관)",
        "3) 같은 화면의 활성화 설정이 ON 인가?",
        "4) restKey.length 가 32가 아니거나 hasWhitespace 가 true 면 .env.local 의 키를 다시 복사",
      ],
    });
  }

  if (!has.kakaoLogin) {
    // 키 미설정 → 홈으로 되돌리며 안내
    return NextResponse.redirect(`${origin}/?err=nokey`);
  }
  return NextResponse.redirect(kakaoAuthorizeUrl());
}
