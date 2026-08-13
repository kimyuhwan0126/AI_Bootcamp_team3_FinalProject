/** @type {import('next').NextConfig} */

// ─────────────────────────────────────────────────────────────
// SELF_HOST_URL — 백엔드를 자체 서버로 넘길 때만 채운다.
//
//  비어 있으면 rewrites 가 빈 배열이라 **지금과 100% 동일하게** 동작한다.
//  즉 자체 서버 본체도, 키를 안 넣은 팀원 로컬도 이 파일 때문에 달라지는 게 없다.
//  값이 있으면 /api/* 요청을 그 주소로 그대로 넘긴다 — 이 앱은 화면만 그린다.
//
//  ⚠️ beforeFiles 를 써야 한다. afterFiles(기본값)는 파일시스템 라우트를 먼저 보므로
//     app/api/* 가 그대로 남아 있는 한 rewrite 가 영영 안 걸린다.
//  ⚠️ 자체 서버에는 이 변수를 넣지 않는다. 넣으면 자기 자신에게 무한 전달된다.
// ─────────────────────────────────────────────────────────────
const SELF_HOST_URL = (process.env.SELF_HOST_URL || "").trim().replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,

  // ─────────────────────────────────────────────────────────────
  // playwright 를 **번들하지 않는다** — 런타임에 있으면 쓰고 없으면 만다.
  //
  //  `lib/place-rating.ts` 가 별점 조회에 playwright 를 동적 import 하는데,
  //  웹팩은 동적 import 도 추적해서 통째로 번들하려 든다. 그러면
  //  `chromium-bidi` · `kerberos` 같은 **선택적 하위 의존성이 없다고 빌드가 깨진다**
  //  (2026-08-09 실측 — PR #54 가 스크래핑을 걷어낸 이유가 정확히 이것이었다).
  //
  //  external 로 빼면 `require` 가 런타임에 남아, 크롬·playwright 가 없는 환경에서는
  //  `place-rating.ts` 의 try/catch 가 받아 **"별점 정보 없음"으로 조용히 떨어진다.**
  //  → 팀원 로컬·CI·Vercel 어디서도 빌드가 깨지지 않는다.
  // ─────────────────────────────────────────────────────────────
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@playwright/test"],
  },

  async rewrites() {
    if (!SELF_HOST_URL) return [];
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${SELF_HOST_URL}/api/:path*` },
      ],
    };
  },
};

export default nextConfig;
