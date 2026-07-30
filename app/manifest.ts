import type { MetadataRoute } from "next";

// ─────────────────────────────────────────────────────────────
// PWA 매니페스트 — 이 파일 하나로 "홈 화면에 추가"가 가능해진다.
//
// 최종 목표(플레이스토어 또는 APK 설치)까지의 경로:
//   1) 이 매니페스트 + public/sw.js  → 브라우저에서 설치 가능한 PWA
//   2) Vercel 배포로 HTTPS 확보      → TWA 요건 충족
//   3) Bubblewrap 으로 APK 생성      → 팀원 폰에 직접 설치 (스토어 불필요)
//   자세한 절차는 docs/APK.md
//
// Flutter/React Native 로 다시 만들지 않는 이유: 지금 웹앱이 그대로 앱이 된다.
// ─────────────────────────────────────────────────────────────
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모이머 Moimer — 흩어진 우리, 딱 중간에서",
    short_name: "모이머",
    description: "각자 위치에서 가장 공평한 중간 지점을 찾아주는 모임 장소 추천 서비스",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#2f6fed",
    categories: ["social", "travel", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable 은 안드로이드가 원형·둥근사각형으로 잘라내므로 여백이 더 필요하다
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
