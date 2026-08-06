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
