import { NextResponse } from "next/server";
import { kakaoAuthorizeUrl } from "@/lib/kakao";
import { has } from "@/lib/env";

export const dynamic = "force-dynamic";

// GET /api/auth/kakao → 카카오 인가 페이지로 리다이렉트
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!has.kakaoLogin) {
    // 키 미설정 → 홈으로 되돌리며 안내
    return NextResponse.redirect(`${origin}/?err=nokey`);
  }
  return NextResponse.redirect(kakaoAuthorizeUrl());
}
