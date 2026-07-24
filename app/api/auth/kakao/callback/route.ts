import { NextResponse } from "next/server";
import { kakaoExchange } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// GET /api/auth/kakao/callback?code=... → 토큰 교환 → 닉네임 들고 홈으로
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?err=nocode`);

  const user = await kakaoExchange(code);
  if (!user) return NextResponse.redirect(`${origin}/?err=login`);

  return NextResponse.redirect(`${origin}/?name=${encodeURIComponent(user.nickname)}&kakao=1`);
}
