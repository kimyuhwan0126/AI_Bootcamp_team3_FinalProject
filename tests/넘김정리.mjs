/* H갈래(갈래 사이 넘김 정리) 회귀 시험
   A·B·E·F 가 "넘기는 것" 표에 남긴, 남의 파일에 필요한 변경들.

   node tests/넘김정리.mjs   ← 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   내가 만든 모임만 건드리고 끝나면 그 코드만 지운다.

   글자를 보는 시험이 섞여 있다. 겉모습을 재는 것이 아니라 '같은 규칙이 두 곳에 적히는 것'을
   막는 것이 목적이다 — 쿼리가 route 에 되돌아오거나 잣대가 다시 베껴지면 여기가 빨개진다. */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

/* DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다 */
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });

const 읽기 = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ROUTE = 읽기('app/api/m/[code]/route.ts');
const DB = 읽기('lib/db.ts');
const TYPES = 읽기('lib/types.ts');
const GEOROUTE = 읽기('app/api/geo/route.ts');
const ORIGIN = 읽기('app/originfield.tsx');
const SCHEMA = readFileSync(new URL('../schema_v2.sql', import.meta.url), 'utf8');

function person() {
  const jar = new Map();
  return {
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

let _og = 0;
const 출발지 = () => {
  const list = [
    { origin: '성수역', lat: 37.5446, lng: 127.0560 },
    { origin: '연남동 주민센터', lat: 37.5626, lng: 126.9256 },
    { origin: '홍대입구역', lat: 37.5572, lng: 126.9245 },
    { origin: '왕십리역', lat: 37.5612, lng: 127.0378 },
  ];
  return list[_og++ % list.length];
};

const 만든모임 = [];
/* 모임 만들기는 로그인 필수다 (논의123) — 개발용 guest 통로로 세션을 만든다.
   한 사람은 한 번만 들어온다 — 들어올 때마다 이름이 바뀜면 앞서 만든 모임의 방장이 아니게 된다(논의124). */
let _계정 = 0;
const 로그인해둔다 = async (p) => { if (!p.계정) { p.계정 = 'H시험' + (++_계정); await 로그인(p, p.계정); } };

const 모임만들기 = async (p, name, extra = {}) => {
  await 로그인해둔다(p);
  const r = await p.post('/api/m', { name, hostName: '방장', scope: 'place', ...출발지(), ...extra });
  if (r.json?.code) 만든모임.push(r.json.code);
  return r.json?.code;
};
const 참여 = (p, code, name, pin) => p.post(`/api/m/${code}`, { action: 'join', name, pin, ...출발지() });

/* ══ H1 — 같은 규칙이 두 곳에 적혀 있지 않다 ═══════════════════ */
console.log('\n[H1] 쿼리도 잣대도 한 곳에만 있다  (A→B · E→B · F→A)');
{
  ok('route.ts 가 약속 시간 잣대를 베끼지 않는다',
     /import\s*\{[^}]*약속시간유효[^}]*\}\s*from\s*'@\/lib\/time'/.test(ROUTE)
       && !/const\s+약속시간유효\s*=/.test(ROUTE),
     ROUTE.includes("from '@/lib/time'") ? 'lib/time 에서 가져온다' : '베낀 함수가 남아 있다');

  ok('route.ts 안에 SQL 문장이 없다',
     !/update\s+meetings\s+set/i.test(ROUTE) && !/\bsql`/.test(ROUTE),
     'closeWithoutPick 은 db.ts 것이다');
  ok('db.closeWithoutPick 을 부른다', /db\.closeWithoutPick\(/.test(ROUTE));
  ok('db.ts 에 closeWithoutPick 이 있다', /export async function closeWithoutPick/.test(DB));

  /* FK(candidates_created_by_fk, on delete set null)가 대신한다 — 코드가 또 하면 두 곳이 된다 */
  ok('db.leave 가 created_by 를 손으로 비우지 않는다',
     !/update\s+candidates\s+set\s+created_by\s*=\s*null/i.test(DB),
     'FK on delete set null 이 한다');
}

/* ══ H2 — AI 횟수가 메모리가 아니라 DB 에 있다 (논의93 · B→A) ══ */
console.log('\n[H2] AI 횟수는 DB 에 센다  (서버를 다시 구워도 0으로 안 돌아간다)');
{
  ok('route.ts 가 globalThis 에 안 센다', !/globalThis/.test(ROUTE),
     /globalThis/.test(ROUTE) ? '아직 메모리다' : '없다');
  ok('db.ts 에 세는 함수가 있다', /export async function useAi/.test(DB));
  ok('schema_v2.sql 에 칸이 적혀 있다',
     /ai_used_region/.test(SCHEMA) && /ai_used_place/.test(SCHEMA));
  ok('코드도 칸을 한 번 만든다',
     /add column if not exists\s+ai_used_region/i.test(DB)
       && /add column if not exists\s+ai_used_place/i.test(DB));

  const a = person();
  const C = await 모임만들기(a, 'H AI 횟수');
  const P = `/api/m/${C}`;
  const r1 = await a.post(P, { action: 'ai' });
  /* 못 붙으면 한 푼도 안 든 것이라 횟수를 돌려준다 (논의93) — 이 PC 에서는 AI 가 안 닿는다 */
  const 못붙음 = r1.status === 503 && r1.json?.error === 'ai_unavailable';
  ok(못붙음 ? '못 붙으면 횟수가 안 준다' : '한 번 부르면 남은 횟수가 2',
     r1.json?.aiLeft === (못붙음 ? 3 : 2), `${r1.status} 남은 ${r1.json?.aiLeft}`);

  /* 칸이 아직 없으면 여기서 통째로 넘어진다 — 빨간불로 세고 나머지를 마저 본다.
     Neon 은 잠자다 깨면 첫 연결에 7초 넘게 걸려 드라이버가 먼저 포기한다(실측).
     앱은 연결을 데워 두어 멀쩡한데 새로 뜬 시험만 넘어졌다 — 몇 번 더 두들긴다. */
  const AI칸읽기 = async () => {
    let 마지막;
    for (let i = 0; i < 4; i++) {
      try { return (await sql`select ai_used_region, ai_used_place from meetings where code = ${C}`)[0]; }
      catch (e) { 마지막 = String(e?.message ?? e); await new Promise((r) => setTimeout(r, 1500)); }
    }
    return { 없다: 마지막 };
  };
  const 칸 = await AI칸읽기();
  ok('셈이 메모리가 아니라 DB 에 있다', 칸?.ai_used_region === (못붙음 ? 0 : 1),
     칸?.없다 ?? `region ${칸?.ai_used_region}`);
  ok('지점 칸은 안 건드린다', 칸?.ai_used_place === 0, 칸?.없다 ?? `place ${칸?.ai_used_place}`);

  /* 한도 자체는 AI 와 무관하게 선다 — 이미 다 쓴 것으로 만들어 놓고 본다.
     AI 가 죽어 있으면 눌러서는 한도에 닿을 수 없다(그게 논의93 이 노린 것이다). */
  await sql`update meetings set ai_used_region = 3 where code = ${C}`;
  const 막힘 = await a.post(P, { action: 'ai' });
  ok('다 썼으면 막힌다', 막힘.status === 429 && 막힘.json?.error === 'ai_limit',
     `${막힘.status} ${막힘.json?.error}`);
  ok('막혔을 때도 남은 횟수는 0', 막힘.json?.aiLeft === 0, String(막힘.json?.aiLeft));
  const 칸2 = await AI칸읽기();
  ok('막힌 요청은 더 안 센다', 칸2?.ai_used_region === 3, 칸2?.없다 ?? `region ${칸2?.ai_used_region}`);

  /* 모임을 지우면 셈도 함께 사라진다 — 메모리 때는 지운 코드의 셈이 프로세스에 남아 있었다 */
  await a.post(P, { action: 'remove' });
  const 남았나 = await sql`select code from meetings where code = ${C}`;
  ok('모임을 지우면 셈도 같이 사라진다', 남았나.length === 0, `${남았나.length}줄`);
}

/* ══ H3 — 마지막 사람 나가기를 한 문장에서 정한다 (논의69 · B→A) ══ */
console.log('\n[H3] 나가기 판정이 조회가 아니라 한 문장이다');
{
  ok('db.ts 에 leaveOrRemove 가 있다', /export async function leaveOrRemove/.test(DB));
  ok('route.ts 가 그것을 부른다', /db\.leaveOrRemove\(/.test(ROUTE));
  /* 조회로 남은 사람을 세던 자리가 사라졌는지 — 남아 있으면 판정이 또 두 곳이 된다 */
  ok('route.ts 가 조회로 남은 사람을 세지 않는다',
     !/const\s+남은사람\s*=/.test(ROUTE),
     /남은사람/.test(ROUTE) ? '아직 센다' : '없다');

  /* 논의125 로 바뀐 자리 — 방장은 혼자여도 못 나간다. 빠지려면 모임을 지운다.
     (전에는 '혼자 있던 방장이 나가면 모임이 사라진다'를 여기서 봤다) */
  const a = person();
  const C = await 모임만들기(a, 'H 혼자 나가기');
  const 나감 = await a.post(`/api/m/${C}`, { action: 'leave' });
  ok('혼자 있어도 방장은 못 나간다',
     나감.status === 409 && 나감.json?.error === 'host_cannot_leave',
     `${나감.status} ${JSON.stringify(나감.json)}`);
  const 조회 = await a.get(`/api/m/${C}`);
  ok('그 모임은 그대로 있다', 조회.status === 200, String(조회.status));

  /* 남은 사람이 있어도 방장은 못 나간다 · 참여자는 나간다 */
  const b = person(), c = person();
  const D = await 모임만들기(b, 'H 둘 나가기');
  await 참여(c, D, '철수', '1111');
  const 방장나감 = await b.post(`/api/m/${D}`, { action: 'leave' });
  ok('남은 사람이 있으면 방장은 못 나간다',
     방장나감.status === 409 && 방장나감.json?.error === 'host_cannot_leave',
     `${방장나감.status} ${방장나감.json?.error}`);
  const 철수나감 = await c.post(`/api/m/${D}`, { action: 'leave' });
  ok('참여자는 그냥 나간다', 철수나감.status === 200 && 철수나감.json?.left === true
     && 철수나감.json?.removed !== true, JSON.stringify(철수나감.json));
  const 살아있나 = await b.get(`/api/m/${D}`);
  ok('그 모임은 살아 있다', 살아있나.status === 200, String(살아있나.status));
  const 이제혼자 = await b.post(`/api/m/${D}`, { action: 'leave' });
  ok('혼자가 되어도 방장은 못 나간다',
     이제혼자.status === 409 && 이제혼자.json?.error === 'host_cannot_leave', JSON.stringify(이제혼자.json));

  /* 경합 — 같은 나가기를 한꺼번에 눌러도 '모임이 사라졌다'는 한 번뿐이어야 한다.
     조회로 판단하면 셋이 나란히 '내가 마지막' 을 보고 셋 다 그렇게 답했다.
     논의125 뒤로 '마지막 사람'은 방장이 아닌 사람일 때만 생긴다 —
     방장이 강퇴 상태인 옛 모임(논의66)을 만들어 그 자리를 그대로 재현한다. */
  const d = person(), e = person();
  const E = await 모임만들기(d, 'H 나가기 경합');
  await 참여(e, E, '철수', '1111');
  await sql`update participants set state = 'kicked' where code = ${E} and name = '방장'`;
  const 셋 = await Promise.all([0, 1, 2].map(() => e.post(`/api/m/${E}`, { action: 'leave' })));
  const 사라졌다센수 = 셋.filter((r) => r.json?.removed === true).length;
  ok('동시에 눌러도 "모임이 사라졌어요" 는 한 번뿐', 사라졌다센수 <= 1,
     `${사라졌다센수}번 · ${셋.map((r) => r.status).join('/')}`);
  const 유령 = await sql`
    select m.code from meetings m
     where m.code = ${E}
       and not exists (select 1 from participants p where p.code = m.code and p.state = 'active')
  `;
  ok('사람이 하나도 없는 유령 모임이 안 남는다', 유령.length === 0, `${유령.length}줄`);
}

/* ══ H4 — 타입이 지금 규칙과 같다 (A→types · B→types) ═════════ */
console.log('\n[H4] lib/types.ts 가 지금 규칙과 같다');
{
  ok('Action 에 vote 갈래가 없다 (논의98)', !/action:\s*'vote'/.test(TYPES),
     /action:\s*'vote'/.test(TYPES) ? '아직 있다' : '없다');
  ok("close 에 force 가 있다 (논의106)",
     /action:\s*'close';[^}]*force\?:\s*boolean/.test(TYPES));
  ok("update 에 scope 가 실릴 수 있다고 적혀 있다 (논의79)",
     /action:\s*'update';[^}]*scope\?:/.test(TYPES));
  ok('Meeting 에 created_at 이 있다 (논의109)', /created_at:\s*string;/.test(TYPES));
  ok('Meeting 에 updated_at 도 있다', /updated_at:\s*string;/.test(TYPES));

  /* 서버가 정말 그것을 주는가 — 타입만 맞고 값이 없으면 소용없다 */
  const a = person();
  const C = await 모임만들기(a, 'H 타입');
  const v = (await a.get(`/api/m/${C}`)).json;
  ok('서버가 created_at 을 ISO 문자열로 준다',
     typeof v?.meeting?.created_at === 'string' && !Number.isNaN(Date.parse(v.meeting.created_at)),
     String(v?.meeting?.created_at));

  /* 없앤 액션은 400 unknown_action 이다 (404 아니다) */
  const 옛것 = await a.post(`/api/m/${C}`, { action: 'vote', candidateId: 'x' });
  ok('vote 는 400 unknown_action', 옛것.status === 400 && 옛것.json?.error === 'unknown_action',
     `${옛것.status} ${옛것.json?.error}`);
}

/* ══ H5 — lookupRegion 이 빈손인 까닭을 갈라 준다 (E→geo) ════ */
console.log('\n[H5] lib/geo 가 "못 고를 자리" 와 "바깥이 못 답했다" 를 가른다');
{
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜키 = process.env.KAKAO_REST_API_KEY;
  const 진짜db = process.env.DATABASE_URL;
  /* 모듈이 뜰 때 연결 문자열을 본다. 진짜로 붙지는 않는다 — 아래에서 fetch 를 대신 세운다 */
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://x:x@example.invalid/x';
  process.env.KAKAO_REST_API_KEY = 'test-only-not-a-real-key';
  console.warn = () => {};

  const 대역 = (짜기) => async (url) => {
    const u = String(url);
    if (u.includes('dapi.kakao.com')) return 짜기.kakao();
    if (u.includes('nominatim')) return 짜기.osm();
    throw new Error('캐시 못 붙음');   /* Neon 은 이 시험에서 안 붙는다 */
  };

  try {
    const { lookupRegion } = await import(new URL('../lib/geo.ts', import.meta.url).href);

    globalThis.fetch = 대역({
      kakao: () => new Response('nope', { status: 500 }),
      osm: () => new Response('down', { status: 503 }),
    });
    const 밖 = await lookupRegion(35.6812, 139.7671);
    ok('상자 밖은 outside', 밖?.hit === null && 밖?.miss === 'outside', JSON.stringify(밖));

    const 못답함 = await lookupRegion(37.5445, 127.0557);
    ok('둘 다 못 답하면 upstream (기다리면 될 수도 있다)',
       못답함?.hit === null && 못답함?.miss === 'upstream', JSON.stringify(못답함));

    /* 상자 안인데 국외다(대마도) — 답은 왔고, 기다린다고 달라지지 않는다 */
    globalThis.fetch = 대역({
      kakao: () => new Response('nope', { status: 500 }),
      osm: () => Response.json({ address: { quarter: 'Izuhara', country_code: 'jp' } }),
    });
    const 국외 = await lookupRegion(34.4021, 129.3067);
    ok('국외는 no_region (기다려도 안 된다)',
       국외?.hit === null && 국외?.miss === 'no_region', JSON.stringify(국외));

    /* 바다 — 카카오가 행정동 없는 답을 주고 OSM 도 동네 이름이 없다 */
    globalThis.fetch = 대역({
      kakao: () => Response.json({ documents: [{ code: '90009', region_type: 'H', region_1depth_name: '서해' }] }),
      osm: () => Response.json({ address: { country_code: 'kr' } }),
    });
    const 바다 = await lookupRegion(36.5, 125.5);
    ok('바다도 no_region', 바다?.hit === null && 바다?.miss === 'no_region', JSON.stringify(바다));

    /* 반대 방향 — 멀쩡히 찾으면 hit 을 준다 */
    globalThis.fetch = 대역({
      kakao: () => Response.json({ documents: [{ code: '1120058', region_type: 'H', region_3depth_name: '성수2가1동' }] }),
      osm: () => { throw new Error('여기까지 오면 안 된다'); },
    });
    const 찾음 = await lookupRegion(37.5445, 127.0557);
    ok('찾으면 hit 을 준다', 찾음?.hit?.name === '성수2가1동' && 찾음?.miss === null,
       JSON.stringify(찾음));
  } catch (e) {
    ok('lib/geo 를 부를 수 있다', false, String(e?.message ?? e));
  } finally {
    globalThis.fetch = 진짜fetch;
    console.warn = 진짜warn;
    if (진짜키 === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = 진짜키;
    if (진짜db === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = 진짜db;
  }
}

/* ══ H6 — api/geo 가 retryable 을 싣는다 (논의101) ═════════════ */
console.log('\n[H6] /api/geo 의 503 에 retryable 이 실린다');
{
  ok('까닭을 보고 싣는다', /retryable:\s*.*miss\s*===\s*'upstream'/.test(GEOROUTE),
     /retryable/.test(GEOROUTE) ? '있다' : 'retryable 이 없다');
  /* E 가 "모르는 것을 아는 척 안 한다" 며 비워 둔 자리다 — 그 뜻은 지키고 값만 채운다 */
  ok('"모른다" 는 주석이 사라졌다', !/구별할 길이 없다/.test(GEOROUTE));

  const 국외 = await (await fetch(`${BASE}/api/geo?lat=34.4021&lng=129.3067`)).json()
    .catch(() => null);
  ok('대마도는 retryable:false 로 온다', 국외?.error === 'geo_unavailable' && 국외?.retryable === false,
     JSON.stringify(국외));
  const 상자밖 = await (await fetch(`${BASE}/api/geo?lat=35.6812&lng=139.7671`)).json()
    .catch(() => null);
  ok('상자 밖도 retryable:false', 상자밖?.retryable === false, JSON.stringify(상자밖));
  const 성수 = await fetch(`${BASE}/api/geo?lat=37.5445&lng=127.0557`);
  ok('멀쩡한 자리는 그대로 200', 성수.ok, String(성수.status));
}

/* ══ H7 — 출발지 칸의 문구 (E→C·D · 논의101) ═══════════════════ */
console.log('\n[H7] app/originfield.tsx 가 429 와 503 을 갈라 말한다');
{
  ok('"잠시 뒤에 다시 해 주세요" 로 맞췄다', ORIGIN.includes('잠시 뒤에 다시 해 주세요'),
     ORIGIN.includes('잠시 후 다시 해주세요') ? '옛 문구가 남아 있다' : '');
  ok('옛 띄어쓰기가 없다', !ORIGIN.includes('잠시 후 다시 해주세요'));
  ok('too_many 를 따로 말한다', /too_many/.test(ORIGIN),
     /too_many/.test(ORIGIN) ? '' : '429 와 503 을 뭉갠다');
  ok('둘을 한 깃발로 뭉개지 않는다', !/setDown\(true\)/.test(ORIGIN));
  ok('영문 오류 코드를 그대로 안 흘린다', !/\{(문제|down|err)\s*\.\s*error\}/.test(ORIGIN));
}

/* ══ H8 — '추천 치우기' 를 서버가 받는다 (논의94 · C→B·H) ═════ */
console.log('\n[H8] AI 후보를 치울 길이 앱 안에 있다');
{
  ok('route.ts 에 clearAi 갈래가 있다', /case 'clearAi'/.test(ROUTE));
  ok('방장 도구다 (HOST_ONLY)', /'ai',\s*'clearAi'/.test(ROUTE));

  const a = person(), b = person();
  const C = await 모임만들기(a, 'H 추천 치우기');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');

  /* AI 후보는 AI 가 안 닿으면 못 만든다 — 그 한 줄만 DB 로 심는다 (결정_규칙.mjs 와 같은 결).
     하나는 아무도 안 찍은 것, 하나는 철수가 찍을 것 */
  const 심기 = async (name) => {
    const id = 'tH' + Math.random().toString(36).slice(2, 10);
    await sql`
      insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai)
      values (${id}, ${C}, 'region', ${'ai:' + name}, ${name}, 37.55, 127.02, true)
    `;
    return id;
  };
  const 버려진것 = await 심기('AI혼자');
  const 골라진것 = await 심기('AI고름');
  await sql`
    insert into votes (code, candidate_id, participant_id, kind)
    select ${C}, ${골라진것}, p.id, 'region' from participants p
     where p.code = ${C} and p.name = '철수'
  `;

  const 참여자가 = await b.post(P, { action: 'clearAi' });
  ok('참여자는 못 치운다', 참여자가.status === 403, `${참여자가.status} ${참여자가.json?.error}`);

  const 치움 = await a.post(P, { action: 'clearAi' });
  ok('방장이 누르면 200 이다 (400 unknown_action 이 아니다)',
     치움.status === 200, `${치움.status} ${치움.json?.error ?? ''}`);
  ok('몇 곳을 치웠는지 알려 준다', 치움.json?.cleared === 1, String(치움.json?.cleared));

  const 남은것 = await sql`select id, name from candidates where code = ${C} order by name`;
  const 이름들 = 남은것.map((r) => r.name);
  ok('아무도 안 찍은 AI 후보는 사라졌다', !이름들.includes('AI혼자'), 이름들.join(', ') || '(없음)');
  ok('누가 고른 AI 후보는 남는다 (진짜 후보다)', 이름들.includes('AI고름'), 이름들.join(', ') || '(없음)');

  /* 두 번째는 치울 것이 없다 — 헛 알림을 쏘지 않게 0 을 준다 */
  const 다시 = await a.post(P, { action: 'clearAi' });
  ok('치울 것이 없으면 0 을 준다', 다시.status === 200 && 다시.json?.cleared === 0,
     `${다시.status} ${다시.json?.cleared}`);
}

/* ══ H9 — 신호등이 서버에 담긴다 (논의115·116 · C→A·B·F) ═════ */
console.log('\n[H9] 신호등은 나만 보는 것이 아니다');
{
  ok('participants 에 칸이 schema_v2.sql 에 적혀 있다',
     /going\s+text/.test(SCHEMA) && /going in \('go','late','no'\)/.test(SCHEMA));
  ok('코드도 칸을 한 번 만든다',
     /add column if not exists\s+going/i.test(DB) && /participants_going_chk/.test(DB));
  ok('db.ts 에 setGoing 이 있다', /export async function setGoing/.test(DB));
  ok('route.ts 에 going 갈래가 있다', /case 'going'/.test(ROUTE));
  /* 방장 도구가 아니다 — 멤버 누구나 자기 것을 바꾼다 */
  ok('going 은 HOST_ONLY 가 아니다', !/'going'/.test(ROUTE.split('switch (body.action)')[0]));
  /* 남의 불을 끄는 길이 없어야 한다 */
  ok('남의 것을 지목할 수 없다 (participantId 를 안 본다)',
     !/case 'going'[\s\S]{0,600}?body\.participantId/.test(ROUTE));

  const a = person(), b = person();
  /* 시간이 없는 모임에서는 안 받는다 (논의116) */
  const N = await 모임만들기(a, 'H 신호등 시간없음');
  const 시간없이 = await a.post(`/api/m/${N}`, { action: 'going', status: 'go' });
  ok('시간이 없는 모임에서는 400', 시간없이.status === 400 && 시간없이.json?.error === 'no_meet_time',
     `${시간없이.status} ${시간없이.json?.error}`);

  const C = await 모임만들기(a, 'H 신호등', { meetAt: '2026-09-30T18:00' });
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');

  const 켰다 = await b.post(P, { action: 'going', status: 'late' });
  ok('멤버는 자기 불을 켤 수 있다', 켰다.status === 200 && 켰다.json?.going === 'late',
     `${켰다.status} ${JSON.stringify(켰다.json)}`);

  /* 핵심 — 남이 본다. 이것이 안 되면 논의116 이 안 지켜진 것이다 */
  const 방장이본것 = (await a.get(P)).json;
  const 철수 = 방장이본것?.participants.find((p) => p.name === '철수');
  ok('남의 화면에도 그 불이 실린다 (localStorage 가 아니다)', 철수?.going === 'late',
     String(철수?.going));

  const 껐다 = await b.post(P, { action: 'going', status: null });
  ok('다시 누르면 아직으로 돌아간다', 껐다.status === 200 && 껐다.json?.going === null,
     JSON.stringify(껐다.json));
  const 다시본것 = (await a.get(P)).json;
  ok('그것도 남의 화면에 실린다',
     다시본것?.participants.find((p) => p.name === '철수')?.going === null,
     String(다시본것?.participants.find((p) => p.name === '철수')?.going));

  const 엉터리 = await b.post(P, { action: 'going', status: '가는중' });
  ok('셋 말고는 안 받는다', 엉터리.status === 400 && 엉터리.json?.error === 'bad_going',
     `${엉터리.status} ${엉터리.json?.error}`);

  /* 표·가운데 계산은 안 건드린다 (논의116) — 불을 켜도 표가 늘지 않는다 */
  const 표수 = (await sql`select count(*)::int as n from votes where code = ${C}`)[0]?.n;
  await b.post(P, { action: 'going', status: 'no' });
  const 표수2 = (await sql`select count(*)::int as n from votes where code = ${C}`)[0]?.n;
  ok('불을 켜도 표는 그대로다', 표수 === 표수2, `${표수} → ${표수2}`);

  const 밖에서 = person();
  const 못들어온사람 = await 밖에서.post(P, { action: 'going', status: 'go' });
  ok('멤버가 아니면 못 켠다', 못들어온사람.status === 403, `${못들어온사람.status} ${못들어온사람.json?.error}`);
}

/* ══ 치우기 ══════════════════════════════════════════════════ */
for (const c of 만든모임) {
  try { await sql`delete from meetings where code = ${c}`; } catch {}
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
