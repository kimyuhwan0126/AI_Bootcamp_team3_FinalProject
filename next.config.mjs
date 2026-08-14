/* 카카오 콘솔에 등록된 리다이렉트 주소와 NextAuth 가 쓰는 주소가 **모양이 다르다.**

     콘솔(.env.local 의 KAKAO_REDIRECT_URI) : /api/auth/kakao/callback
     NextAuth 의 기본 규칙                  : /api/auth/callback/kakao   ← 차례가 반대

   카카오는 이 주소를 **로그인을 마친 뒤에** 검사한다. 그래서 로그인 화면까지는 멀쩡히 뜨고,
   아이디·비밀번호를 다 넣은 다음에야 KOE006 으로 튕긴다 — 어디가 잘못됐는지 알기 가장 어려운 모양이다.

   고치는 길이 둘이었다.
     ① 콘솔에 NextAuth 주소를 더 등록한다 — 사람이 콘솔에 들어가야 한다
     ② **코드가 콘솔에 맞춘다** — 이미 `.env.local` 에 등록 주소가 적혀 있으니 그것을 따른다

   ②를 골랐다. 등록 주소는 이미 env 에 있는데 코드가 그걸 무시하고 제 규칙대로 만들고 있었던 것이
   애초의 잘못이다. 아래 되돌림(rewrite)이 **콘솔 주소로 들어온 것을 NextAuth 의 자리로 넘겨준다.**
   보내는 주소를 바꾸는 쪽은 `lib/auth.ts` 가 한다 — 둘이 같은 env 값 하나를 본다.

   ⚠ `KAKAO_REDIRECT_URI` 를 바꾸면 **콘솔도 같이 바꿔야 한다.** 한쪽만 바꾸면 다시 KOE006 이다. */

/* NextAuth 가 실제로 손님을 받는 자리. 이 값은 NextAuth 의 규칙이라 우리가 못 고친다. */
const 정식자리 = '/api/auth/callback/kakao';

/** env 의 등록 주소에서 **길(path)만** 뽑는다. 주소가 없거나 이상하면 null 이다.
 *  길이 정식자리와 같으면 되돌릴 것이 없다 — 굳이 규칙을 하나 더 두지 않는다. */
function 콘솔길() {
  const v = process.env.KAKAO_REDIRECT_URI;
  if (!v) return null;
  try {
    const p = new URL(v).pathname;
    return p && p !== 정식자리 ? p : null;
  } catch {
    /* `http://` 없이 길만 적어 둔 사람도 있다 */
    return v.startsWith('/') && v !== 정식자리 ? v : null;
  }
}

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const 길 = 콘솔길();
    return 길 ? [{ source: 길, destination: 정식자리 }] : [];
  },
  /* 보안 헤더 — CSP 는 넣지 않는다. 카카오 지도 SDK(dapi.kakao.com)와 OSM 타일을
     스크립트·이미지로 부르고 next dev 는 인라인 스크립트를 쓴다 — 급히 CSP 를 넣으면
     지도가 죽는다. CSP 는 이 일감의 범위 밖이다. */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
        ],
      },
    ];
  },
};
