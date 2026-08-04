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

  // ── ODsay 호출 주소 ─────────────────────────────────────────
  //  ODsay 서버 키는 "호출하는 서버의 공인 IP"를 화이트리스트에 등록해야 통한다.
  //  그런데 Vercel 서버리스는 나가는 IP 가 유동이라 등록이 불가능하다.
  //  그래서 고정 IP 를 가진 프록시를 거칠 수 있게 주소를 환경변수로 뺀다.
  //
  //  ⚠️ 비어 있으면 기본값이 api.odsay.com 이라 **기존과 100% 같은 동작**이다.
  //     팀원 로컬은 이 값을 넣지 않으면 지금까지처럼 직접 호출한다.
  //  ⚠️ 끝 슬래시·앞뒤 공백을 떼어낸다 — 터널 주소를 복사하면 흔히 딸려온다.
  odsayBase: (process.env.ODSAY_BASE_URL || "https://api.odsay.com").trim().replace(/\/+$/, ""),
  //  프록시가 요구하는 공유 비밀. 비어 있으면 헤더를 아예 붙이지 않는다.
  odsayProxySecret: (process.env.ODSAY_PROXY_SECRET || "").trim(),
};

export const has = {
  kakaoLogin: !!env.kakaoRest,
  kakaoGeocode: !!env.kakaoRest,
  kakaoJs: !!env.kakaoJs, // 브라우저 지도 SDK — 없으면 스키매틱 지도로 폴백
  odsay: !!env.odsay,
  tmap: !!env.tmap,
};
