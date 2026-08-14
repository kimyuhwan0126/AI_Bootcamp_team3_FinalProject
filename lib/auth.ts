/* 신원 — 그릴링 결정을 그대로 옮긴 곳.
     로그인   = 카카오 계정 식별자
     비로그인 = 이름 + PIN 4자리 (참여 시 필수)
   NextAuth 는 세션(JWT)만 맡고, '이 모임에서 나는 누구인가'는 쿠키로 따로 잡는다 —
   한 사람이 여러 모임에 서로 다른 참가자로 들어갈 수 있기 때문. */
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';
import { getServerSession, type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import KakaoProvider from 'next-auth/providers/kakao';
import { upsertUser, userExists } from './db';

/* 이 서버만 아는 비밀 문자열. 두 곳에 쓰인다 — PIN 뭉개기와 참가자 쿠키 서명.
   ⚠ 이 값이 바뀌면 **이미 저장된 PIN 해시와 이미 나가 있는 쿠키가 전부 못 맞게 된다.**
   그러면 지금 모임에 들어와 있는 사람들이 다 튕긴다.

   전에는 이 자리가 `NEXTAUTH_SECRET` 이었다. 로그인을 붙이려면 그 값을 넣어야 하는데,
   넣는 순간 소금이 바뀌어 위의 사고가 난다 — 로그인 비밀값과 여기를 갈라 둔다.
   기본값은 예전 그대로여야 저장돼 있던 해시가 계속 맞는다. 함부로 바꾸지 마라.

   ⚠ **지금 `.env.local` 에 이 값이 없다 — 아래 기본값이 그대로 쓰인다.** 그 글자는 이 파일에 적혀 있으니
   소스를 본 사람은 참가자 쿠키를 스스로 만들 수 있다(=남의 자리로 들어갈 수 있다).
   논의126 이 참여자 사칭은 감수하기로 했으므로 지금은 급하지 않다 —
   사칭으로 못 하는 것(방장 권한·지우기·내보내기·확정)은 계정이 지킨다(논의124).
   다만 **밖에 내놓기 전에는 `MOIMER_SALT` 를 넣어라.** 넣는 순간 그때까지 저장된 PIN 해시와
   나가 있는 쿠키가 전부 무효가 되므로, **사람이 적은 때**(모임이 거의 없을 때) 한 번에 해야 한다. */
const SALT = process.env.MOIMER_SALT ?? 'moimer-dev-salt';
export const hashPin = (code: string, pin: string) =>
  createHash('sha256').update(`${SALT}:${code}:${pin}`).digest('hex');

export function pinMatches(code: string, pin: string, stored: string | null) {
  if (!stored) return false;
  const a = Buffer.from(hashPin(code, pin));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* 세션에 남기는 '계정 열쇠'. users 줄을 다시 찾아 잇는 데 쓴다 (논의88) —
   카카오는 카카오 식별자 그대로, 개발용 guest 는 이름 앞에 `guest:` 를 붙인다.
   카카오 식별자는 숫자뿐이라 둘이 섞일 일이 없다. */
export const 게스트열쇠 = (이름: string) => `guest:${이름}`;

/* 개발용 임시 로그인(guest)을 **다는가**. 프로덕션에서는 안 단다 (논의131) —
   아래 provider 주석에 왜인지 적어 두었다. 화면(`/me`)도 같은 잣대로 단추를 숨긴다.
   ⚠ 여기를 `true` 로 만들면 **누구나 남의 방장이 될 수 있다.** 시험 때문에라도 열지 마라 —
      시험은 개발 서버에서 돈다. */
const 개발중 = process.env.NODE_ENV !== 'production';

/* 카카오 열쇠가 서버에 있나 (논의57 · 105) — 없으면 로그인 단추를 되는 척 보여 주지 않는다.
   클라이언트 비밀은 카카오 콘솔에서 꺼 둘 수 있어 REST 키 하나만 있으면 왕복은 시작된다. */
export const 카카오준비됨 = () => !!process.env.KAKAO_REST_API_KEY;

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },          /* 세션 테이블을 두지 않는다 — users 한 장만 */
  /* 로그인 화면도 오류 화면도 우리 것을 쓴다 (/me). NextAuth 가 들고 있는 기본 화면은
     영문이고 우리 말투 규칙 밖이다 — 카카오가 죽었을 때 사람이 보는 것이 그 화면이면 안 된다(논의57). */
  pages: { signIn: '/me', error: '/me' },
  providers: [
    /* 열쇠가 없으면 아예 안 단다 (논의105) — 달아 두면 `/api/auth/providers` 가 '있다'고 말하고
       화면은 그 말을 믿고 단추를 그린다. 눌러야만 안 되는 것을 알게 되는 단추는 거짓말이다.
       화면이 무엇을 그릴지 여기 한 곳으로 정해진다. */
    ...(카카오준비됨() ? [KakaoProvider({
      clientId: process.env.KAKAO_REST_API_KEY!,
      /* 카카오 콘솔에서 '보안 > Client Secret' 을 꺼 두면 이 값이 없어도 왕복이 돈다.
         켜 두었다면 반드시 넣어야 한다 — 안 넣으면 토큰 받는 자리에서 막힌다. */
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
      /* **콘솔에 등록된 주소를 그대로 보낸다** (`.env.local` 의 KAKAO_REDIRECT_URI).
         NextAuth 는 제 규칙(`/api/auth/callback/kakao`)으로 주소를 지어 보내는데,
         이 앱의 콘솔에는 예전 서비스 때 등록한 `/api/auth/kakao/callback` 이 들어 있다.
         카카오는 이 주소를 **로그인을 마친 뒤에** 검사하므로, 어긋나 있으면 아이디·비밀번호를
         다 넣은 다음에야 KOE006 으로 튕긴다 — 원인을 짚기 가장 어려운 모양이다.

         두 곳에 다 넣어야 한다: 보낼 때(authorization)와 토큰을 바꿀 때(token).
         카카오는 토큰 교환에서도 같은 redirect_uri 를 다시 대조한다 — 한쪽만 넣으면 그 자리에서 막힌다.
         들어온 손님을 NextAuth 자리로 넘기는 일은 `next.config.mjs` 의 되돌림이 한다.

         scope 를 빈 값으로 두는 것은 **NextAuth 의 기본 그대로**다(카카오는 동의 항목을 콘솔에서 정한다).
         여기서 params 를 새로 주면 그 기본이 통째로 날아가므로 빈 scope 를 손으로 다시 적어 준다. */
      ...(process.env.KAKAO_REDIRECT_URI ? {
        authorization: {
          url: 'https://kauth.kakao.com/oauth/authorize',
          params: { scope: '', redirect_uri: process.env.KAKAO_REDIRECT_URI },
        },
        /* 토큰 교환은 **우리가 직접 한다.** NextAuth 에 맡기면 못 고치는 자리가 하나 있어서다:
           `provider.callbackUrl` 을 NextAuth 가 `${주소}/api/auth/callback/kakao` 로 **강제로 덮어쓰고**
           (`core/lib/providers.js` 의 merge), 토큰 요청에 그 값을 쓴다. 설정으로는 못 바꾼다.

           카카오는 토큰 교환에서 **보낼 때 썼던 redirect_uri 와 같은지** 다시 대조한다.
           그래서 보낼 때만 고쳐 두면 여기서 `invalid_grant (Redirect URI mismatch.)` 로 막힌다 —
           실제로 그랬다. 로그인은 다 끝난 뒤라 사람 눈에는 '로그인은 됐는데 튕겼다' 로 보인다.

           ⚠ 이 덧옷은 **콘솔에 `/api/auth/callback/kakao` 를 등록하면 통째로 지워도 된다.**
             그때는 `.env.local` 의 `KAKAO_REDIRECT_URI` 를 지우면 이 블록이 저절로 안 붙는다. */
        token: {
          url: 'https://kauth.kakao.com/oauth/token',
          async request({ provider, params }: { provider: any; params: any }) {
            const 몸 = new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: String(provider.clientId),
              redirect_uri: process.env.KAKAO_REDIRECT_URI!,
              code: String(params.code ?? ''),
            });
            /* 콘솔에서 Client Secret 을 꺼 두면 이 값이 없다. **빈 값을 보내면 안 된다** —
               카카오는 '있는데 틀렸다' 로 읽어 거절한다. 아예 안 붙이는 것과는 다르다. */
            if (provider.clientSecret) 몸.set('client_secret', String(provider.clientSecret));

            const r = await fetch('https://kauth.kakao.com/oauth/token', {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
              body: 몸,
            });
            const t = await r.json().catch(() => ({}));
            /* 카카오가 준 까닭을 그대로 올린다 — 뭉개면 다음 사람이 또 여기서 헤맨다.
               이 글은 서버 기록에만 남는다(화면에는 논의57 의 사람 말이 나간다). */
            if (!r.ok || t.error) {
              throw new Error(`카카오 토큰 교환 실패 ${r.status} — ${t.error ?? ''} ${t.error_description ?? ''}`.trim());
            }
            return { tokens: t };
          },
        },
      } : {}),
    })] : []),
    /* ⚠ 개발용 임시 로그인 — **진짜 서비스에서는 아예 안 단다** (논의131).
       시험 900여 건이 이 길로 로그인해서 모임을 만든다(카카오 왕복은 기계가 못 누른다).

       왜 닫아야 하나 — 열어 두면 **이름만 알면 남의 자리가 된다**. 체인이 실제로 이어진다:
         ① `GET /api/m/<코드>` 는 코드만 알면 참가자 **이름**을 내준다(논의95 는 id·좌표만 가린다)
         ② 방장 이름을 읽는다
         ③ 그 이름으로 여기에 로그인한다 → 열쇠가 `guest:이름` 이라 **같은 users 줄**이 된다
         ④ `방장인가`(논의124)가 계정으로 판정하므로 **그 모임의 방장이 된다** — 지우기·내보내기·확정까지
       화면에서 단추만 숨기는 것(`/me` 의 NODE_ENV 검사)으로는 못 막는다. 통로가 열려 있으면
       주소를 아는 사람은 그냥 부른다 — 배포 갈래가 프로덕션 빌드로 실제로 확인했다.

       닫으면 무엇을 잃나: 카카오가 죽어 있는 동안 아무도 모임을 못 만든다.
       그건 논의57 이 이미 "그때 멈추는 것이 맞다" 고 정한 것이다.

       시험은 그대로 돈다 — 시험은 개발 서버(`next dev`)에서 돌기 때문이다.
       ⚠ 시험을 프로덕션 빌드에 대고 돌리려면 이 통로가 없다는 것을 먼저 알아야 한다. */
    ...(개발중 ? [CredentialsProvider({
      name: 'guest',
      credentials: { nickname: { label: '이름', type: 'text' } },
      async authorize(c) {
        const nickname = (c?.nickname ?? '').trim();
        if (!nickname) return null;
        /* 같은 이름으로 다시 들어오면 같은 줄을 쓴다 — 로그인할 때마다 users 가 쌓이면
           논의88 을 고치면서 같은 구멍을 다시 내는 셈이다 */
        const id = await upsertUser({ accountKey: 게스트열쇠(nickname), nickname });
        return { id, name: nickname };
      },
    })] : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'kakao' && account.providerAccountId) {
        user.id = await upsertUser({
          accountKey: String(account.providerAccountId),
          nickname: user.name ?? '사용자',
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) token.uid = user.id;
      /* 열쇠는 처음 들어올 때만 온다(account 가 그때만 있다) — 토큰에 실어 두어야
         그 뒤 모임을 만들 때 users 줄을 다시 이을 수 있다 */
      if (account?.provider === 'kakao' && account.providerAccountId)
        token.akey = String(account.providerAccountId);
      if (account?.provider === 'credentials') token.akey = 게스트열쇠(user?.name ?? '');
      return token;
    },
    async session({ session, token }) {
      const u = session.user as { id?: string; key?: string };
      if (token.uid) u.id = String(token.uid);
      if (token.akey) u.key = String(token.akey);
      return session;
    },
  },
};

/* ── 지금 누가 로그인했나 ──────────────────────────────────────
   서버에서 세션을 읽는 길은 여기 하나다. 라우트마다 getServerSession 을 부르면
   '무엇이 있어야 로그인으로 치나'가 곧 라우트마다 달라진다.
   열쇠가 없는 세션은 로그인으로 안 친다 — 그 토큰으로는 users 줄을 못 잇는다
   (이 기능이 붙기 전에 발급된 옛 토큰이 그렇다. 다시 로그인하면 된다). */
export type 로그인사람 = { id: string; nickname: string; key: string };

export async function 지금로그인(): Promise<로그인사람 | null> {
  /* 못 푸는 토큰(JWEInvalid)은 NextAuth 가 **안에서 잡아** 로그만 찍고 null 을 준다 —
     비밀 문자열을 바꾼 뒤 옛 쿠키를 들고 오는 사람이 그렇다. 그건 여기까지 안 올라온다.
     그래도 감싸 두는 까닭: 그 밖의 탈(설정이 어긋남 · 열쇠가 반쯤 빠짐)은 그대로 올라오는데,
     `/api/mine` 처럼 **로그인이 필요 없는 길**도 이제 이 함수를 부른다. 여기서 안 막으면
     목록만 보러 온 사람이 500 을 맞는다. 못 읽는 세션은 '로그인 안 한 것'과 같이 친다. */
  let s;
  try { s = await getServerSession(authOptions); } catch { return null; }
  const u = s?.user as { id?: string; name?: string | null; key?: string } | undefined;
  if (!u?.id || !u.key) return null;
  /* ⚠ 서명은 멀쩡한데 가리키는 users 줄이 없는 토큰 (2026-08-14 사고 뒤처리).
     JWT 세션은 DB 를 안 보고 서명만으로 스스로를 증명한다 — DB 복구·고아 계정 정리처럼
     users 표가 세션보다 나중에 다시 만들어지는 일이 생기면, 서명은 맞는데 가리키는 줄이
     없는 토큰이 남는다. 그런 사람이 모임을 만들면 `upsertUser` 가 **새 id 로 새 줄**을 만들고,
     세션은 그 새 id 를 모른 채라 방금 만든 자기 모임의 방장으로도 안 잡혔다(실측으로 확인함).
     매 요청마다 한 번 더 묻는 값싼 조회(기본키 하나)로 미리 걸러 낸다 —
     걸러진 사람은 '로그인 안 한 것'과 같이 친다. 다시 로그인하면 새 토큰이 새 줄을 정확히 가리킨다. */
  if (!(await userExists(u.id))) return null;
  return { id: u.id, nickname: (u.name ?? '').trim() || '사용자', key: u.key };
}

/* ── 이 모임에서 나는 누구인가 ─────────────────────────────
   모임마다 참가자 id 가 다르므로 모임 코드별 쿠키로 잡는다.
   예전 목업이 members[0] 로 떨어져 '링크만 받은 사람이 방장'이 되던 것을 여기서 끊는다. */
const key = (code: string) => `moimer.p.${code}`;

/* 쿠키에 서명을 붙인다.
   전에는 참가자 id 를 평문으로 담았는데, 그 id 는 조회 응답에 그대로 실려 나갔다 —
   모임 코드만 알면 남의(방장의) id 를 주워 쿠키에 넣고 그 사람으로 행세할 수 있었다.
   서명은 서버만 만들 수 있으니 주워도 쓸 수 없다. */
const sign = (code: string, id: string) =>
  createHash('sha256').update(`${SALT}:cookie:${code}:${id}`).digest('hex').slice(0, 24);

export function getParticipantId(code: string): string | null {
  const raw = cookies().get(key(code))?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i < 0) return null;                       /* 서명 없는 옛 쿠키는 안 받는다 */
  const id = raw.slice(0, i), sig = raw.slice(i + 1);
  const want = Buffer.from(sign(code, id)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return id;
}

export function setParticipantCookie(code: string, participantId: string) {
  cookies().set(key(code), `${participantId}.${sign(code, participantId)}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180,
    secure: process.env.NODE_ENV === 'production',
  });
}
