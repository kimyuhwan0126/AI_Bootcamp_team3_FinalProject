/* **진짜 카카오 계정으로** 시험하는 길 — guest 우회를 안 쓴다.

   왜 있나: 시험은 지금까지 개발용 guest 통로(`tests/세션.mjs`)로 로그인해 왔다. 그것으로도
   '로그인한 사람' 은 흉내 낼 수 있지만, **방장은 계정으로 가린다**(논의124). 그래서
   "진짜 카카오 계정으로 방장 노릇이 제대로 도는가" 는 guest 로는 영영 못 재는 물음이 된다.
   카카오 왕복은 사람만 누를 수 있어(기계가 못 넘는다) 여기서 그 한 걸음만 건너뛴다.

   무엇을 건너뛰고 무엇을 안 건너뛰나 —
     · 건너뛰는 것 : 카카오 화면에서 아이디·비밀번호를 넣는 그 순간 하나뿐이다
     · 그대로인 것 : users 줄 · 계정 열쇠(kakao_id) · 세션 토큰의 모양과 서명 · 서버가 그것을 읽는 길
       전부 진짜다. 서버는 이 토큰과 사람이 로그인해 받은 토큰을 **구별하지 못한다** — 같은 것이라서다.

   ⚠ 이것은 **시험용이다.** 서버의 비밀 문자열(NEXTAUTH_SECRET)을 읽을 수 있는 자리에서만 돈다 —
     곧 서버를 돌리는 사람만 쓸 수 있다는 뜻이다. 앱 코드에는 이 길이 없다.
   ⚠ 비밀값도 카카오 식별자도 **어디에도 찍지 마라.** 아래 함수들은 이름과 id 만 돌려준다.

   쓰는 법:
     import { 카카오사람, 카카오계정있나 } from './카카오세션.mjs';
     const 방장 = await 카카오사람();          // call(path, init) 을 가진 사람 하나
     if (!방장) …                              // 카카오로 한 번도 안 들어왔으면 null 이다 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { encode } from 'next-auth/jwt';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';

/* `.env.local` 에서만 읽고 어디에도 찍지 않는다 (tests/db.mjs 와 같은 규칙) */
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const 값 = (이름) => env.match(new RegExp(`^\\s*${이름}\\s*=\\s*(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '');

/** 카카오로 들어온 계정이 DB 에 있나. 없으면 사람이 아직 한 번도 안 눌러 본 것이다. */
export async function 카카오계정있나() {
  const dsn = 값('DATABASE_URL');
  if (!dsn) return false;
  const sql = neon(dsn, { fetchOptions: { cache: 'no-store' } });
  const r = await sql`select 1 from users
    where kakao_id is not null and kakao_id not like 'guest:%' limit 1`;
  return r.length > 0;
}

/** 가장 최근에 들어온 카카오 계정으로 사람 하나를 만든다. 없으면 null.
 *  돌려주는 것은 `tests/db.mjs` 의 `person()` 과 같은 모양이다 — `call`·`post`·`get` 과 쿠키 항아리. */
export async function 카카오사람() {
  const dsn = 값('DATABASE_URL');
  const 비밀 = 값('NEXTAUTH_SECRET');
  /* 비밀이 없으면 서버가 임시로 지어 쓴다 — 그 값은 우리가 알 수 없으니 여기서 멈춘다.
     '되는 척' 하고 401 을 뿌리는 것보다 왜 안 되는지 말하는 편이 낫다. */
  if (!dsn || !비밀) return null;

  const sql = neon(dsn, { fetchOptions: { cache: 'no-store' } });
  const [u] = await sql`select id, kakao_id, nickname from users
    where kakao_id is not null and kakao_id not like 'guest:%'
    order by created_at desc limit 1`;
  if (!u) return null;

  /* 토큰 속은 `lib/auth.ts` 의 jwt 콜백이 담는 것과 **같아야** 한다 —
     `uid`(users 줄) 와 `akey`(계정 열쇠) 둘 다 없으면 `지금로그인()` 이 로그인으로 안 친다. */
  const 토큰 = await encode({ token: { uid: u.id, akey: u.kakao_id, name: u.nickname }, secret: 비밀 });

  const 병 = new Map([['next-auth.session-token', 토큰]]);
  return {
    /** 이 사람이 누구인지 — 이름과 우리 id 만. 카카오 식별자는 안 내보낸다. */
    누구: { id: u.id, nickname: u.nickname },
    병,
    async call(path, init = {}) {
      const cookie = [...병].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, {
        ...init,
        headers: { 'content-type': 'application/json', cookie, ...(init.headers || {}) },
      });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const kv = c.split(';')[0];
        const i = kv.indexOf('=');
        병.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 */ }
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}
