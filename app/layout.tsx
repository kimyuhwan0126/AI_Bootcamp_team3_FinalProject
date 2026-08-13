import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "모이머 Moimer — 흩어진 우리, 딱 중간에서",
  description: "각자 위치에서 가장 공평한 중간 지점을 찾아주는 모임 장소 추천 서비스",
  // PWA — 매니페스트 본문은 app/manifest.ts 가 만든다
  manifest: "/manifest.webmanifest",
  applicationName: "모이머",
  appleWebApp: { capable: true, title: "모이머", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2f6fed",
  // 라이트 고정 (2026-08-10). CSS 의 `color-scheme: light` 와 **같은 말을**
  // `<meta name="color-scheme">` 로도 해 둔다 — CSS 가 도착하기 전 첫 페인트부터
  // 라이트로 그려지게 하고, 안드로이드 크롬의 자동 다크 덧칠도 그만큼 일찍 막는다.
  colorScheme: "light",
  // 앱으로 설치했을 때 노치·홈바 영역까지 배경이 이어지게
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
