// ─────────────────────────────────────────────────────────────
// env.ts — 외부 API 키 로딩 + 활성화 여부 플래그
// 키가 없으면 has.* = false → routing 계층이 mock으로 폴백.
// ─────────────────────────────────────────────────────────────
export const env = {
  kakaoRest: process.env.KAKAO_REST_API_KEY || "",
  kakaoJs: process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "",
  kakaoRedirect: process.env.KAKAO_REDIRECT_URI || "http://localhost:3000/api/auth/kakao/callback",
  odsay: process.env.ODSAY_API_KEY || "",
  tmap: process.env.TMAP_APP_KEY || "",
};

export const has = {
  kakaoLogin: !!env.kakaoRest,
  kakaoGeocode: !!env.kakaoRest,
  kakaoJs: !!env.kakaoJs, // 브라우저 지도 SDK — 없으면 스키매틱 지도로 폴백
  odsay: !!env.odsay,
  tmap: !!env.tmap,
};
