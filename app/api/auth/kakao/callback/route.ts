import { NextResponse } from "next/server";
import { kakaoExchange, originOfRequest } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// GET /api/auth/kakao/callback?code=... → 토큰 교환 → 닉네임 들고 홈으로
// 실패하면 사유(step/detail)를 쿼리로 넘겨 홈에서 그대로 보여준다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originOfRequest(req);

  // 카카오가 인가 단계에서 거부한 경우 (redirect_uri 불일치, 동의 취소 등)
  const kakaoErr = url.searchParams.get("error");
  if (kakaoErr) {
    const desc = url.searchParams.get("error_description") || "";
    return NextResponse.redirect(
      `${origin}/?err=login&step=authorize&detail=${encodeURIComponent(`${kakaoErr}: ${desc}`)}`
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/?err=login&step=authorize&detail=${encodeURIComponent("code 없음")}`);
  }

  // 인가 때 보낸 redirect_uri 와 같은 값을 써야 한다 — 둘 다 "지금 들어온 주소" 기준
  const r = await kakaoExchange(code, origin);
  if (!r.ok) {
    return NextResponse.redirect(
      `${origin}/?err=login&step=${r.step}&detail=${encodeURIComponent(r.detail)}`
    );
  }

  return NextResponse.redirect(`${origin}/?name=${encodeURIComponent(r.nickname)}&kakao=1`);
}
