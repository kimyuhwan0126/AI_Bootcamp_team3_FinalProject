/* I 갈래 — 신호등을 화면에 잇는다 (논의115 · 116) + '추천 치우기' 가 진짜로 치우나 (논의94).
   고치는 파일은 app/m/[code]/ui.tsx 하나뿐이다. 서버는 이미 다 되어 있다.

   node tests/신호등.mjs — 개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   지도는 카카오 SDK 를 막아 OSM 폴백으로 연다(그래야 진짜 손가락처럼 눌러 볼 수 있다).

   가장 중요한 시험은 [I4] 다 — 창 둘을 띄워 놓고 한쪽에서 누른 불이
   다른 쪽 화면에 뜨는가. 논의116 의 "모두에게 알린다" 는 그것 하나로 선다.
   localStorage 에만 남으면 이 시험이 빨개진다. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const require_ = createRequire(import.meta.url);
const 찾을곳 = [
  process.env.PLAYWRIGHT_CORE,
  'playwright-core',
  'C:/Users/USER/.claude/jobs/c332f72c/tmp/node_modules/playwright-core',
].filter(Boolean);
let chromium = null;
for (const p of 찾을곳) {
  try { ({ chromium } = require_(p)); break; } catch { /* 다음 곳 */ }
}
if (!chromium) {
  console.error('playwright-core 를 찾지 못했다. PLAYWRIGHT_CORE 에 경로를 넣어라.');
  process.exit(1);
}

let 통과 = 0, 실패 = 0;
const ok = (이름, 참, 덧말 = '') => {
  if (참) { 통과++; console.log(`  ✓ ${이름}`); }
  else { 실패++; console.log(`  ✗ ${이름}${덧말 ? ` — ${덧말}` : ''}`); }
};
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));
/* 파일을 고치면 개발 서버가 다시 굽는다 — 설 때까지 기다린다 */
async function 될때까지(fn, ms = 10000, 간격 = 200) {
  const 끝 = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch { /* 다시 */ }
    if (Date.now() > 끝) return false;
    await 잠깐(간격);
  }
}
async function 다시해도(손짓, 확인, 번 = 6) {
  for (let i = 0; i < 번; i++) {
    try { await 손짓(); } catch { /* 새로 열리는 중이면 다음 판에 */ }
    if (await 될때까지(확인, 3500, 200)) return true;
  }
  return false;
}

/* DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다.
   AI 후보는 AI 가 안 닿으면 못 만든다 — 그 두 줄만 DB 로 심는다 (넘김정리.mjs 와 같은 결) */
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql0 = neon(DSN, { fetchOptions: { cache: 'no-store' } });
/* 바깥 DB 로 가는 길이 이따금 끊긴다 — 심는 일이 그것 때문에 넘어지면 안 된다 */
const sql = async (...a) => {
  let 마지막 = null;
  for (let i = 0; i < 5; i++) {
    try { return await sql0(...a); 
} catch (e) { 마지막 = e; await 잠깐(1200); }
  }
  throw 마지막;
};

const UI = readFileSync(new URL('../app/m/[code]/ui.tsx', import.meta.url), 'utf8');

/* ── API ─────────────────────────────────────────────────
   바깥 DB 로 가는 길이 이따금 끊긴다(Neon 연결 시간초과) — 그것으로 빨간불이 켜지면
   무엇이 고장인지 못 가린다. 같은 물음을 몇 번 더 해 본다. */
async function api(path, { method = 'GET', body, cookie } = {}) {
  let r = null, 마지막 = null;
  for (let i = 0; i < 4 && !r; i++) {
    try {
      r = await fetch(BASE + path, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { 마지막 = e; await 잠깐(800); }
  }
  if (!r) throw 마지막;
  const 준쿠키 = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 있다 */ }
  return { status: r.status, json, cookie: 준쿠키 };
}

/* ── 로그인 ───────────────────────────────────────────────
   논의123 이 `POST /api/m` 에 세션을 걸었다(401 login_required) — 이 시험은 모임을 넷 만든다.
   게다가 논의124 부터 **방장은 계정으로 가린다**: 참가자 쿠키만 든 방장은
   kick·update·clearAi·remove 가 전부 403 이다. 그래서 방장 쿠키는 `세션 + 참가자` 두 장이다.
   로그인하는 길은 tests/세션.mjs 한 곳뿐이다. */
const 세션단지 = new Map();
const 세션쿠키 = () => [...세션단지].map(([k, v]) => `${k}=${v}`).join('; ');
const 사람 = {
  async call(길, init = {}) {
    const r = await fetch(BASE + 길, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(세션단지.size ? { cookie: 세션쿠키() } : {}) },
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const kv = c.split(';')[0], i = kv.indexOf('=');
      if (i > 0) 세션단지.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return { status: r.status, text: await r.text() };
  },
};

const 치울모임 = [];
async function 새모임(name, extra = {}) {
  for (let i = 0; i < 20; i++) {
    const r = await api('/api/m', {
      method: 'POST',
      cookie: 세션쿠키(),
      body: { name, hostName: '방장', scope: 'region',
        origin: '서울시청', lat: 37.5665, lng: 126.978, transport: 'transit', ...extra },
    });
    if (r.status === 200) {
      /* 방장 노릇에는 세션도 함께 있어야 한다 — 참가자 쿠키 한 장만으로는 403 이다 (논의124) */
      const 참가자 = r.cookie.split('; ').find((c) => c.startsWith('moimer.p.')) ?? '';
      const cookie = [세션쿠키(), 참가자].filter(Boolean).join('; ');
      치울모임.push({ code: r.json.code, cookie });
      return { code: r.json.code, cookie };
    }
    await 잠깐(500);                                   /* 다시 굽는 중이면 잠깐 500 이 난다 */
  }
  throw new Error('모임 만들기 실패');
}
async function 참여(code, name, pin = '1234') {
  const r = await api(`/api/m/${code}`, {
    method: 'POST',
    body: { action: 'join', name, pin, origin: '강남역', lat: 37.4979, lng: 127.0276, transport: 'transit' },
  });
  if (r.status !== 200) throw new Error(`참여 실패 ${r.status} ${JSON.stringify(r.json)}`);
  return r.cookie;
}
const 핑 = (code, cookie, o) => api(`/api/m/${code}`, { method: 'POST', cookie, body: { action: 'ping', ...o } });
const 보기 = async (code, cookie) => (await api(`/api/m/${code}`, { cookie })).json;
const 누구 = (v, 이름) => v.participants.find((p) => p.name === 이름);

/* ── 브라우저 ─────────────────────────────────────────────
   카카오 SDK 는 막는다(→ OSM 폴백). 타일은 1×1 그림으로 바꿔 끼운다. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const 열린맥락 = [];
async function 새페이지(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  열린맥락.push(ctx);
  /* 쿠키가 여럿일 수 있다 — 방장은 세션과 참가자 두 장을 든다 (논의124) */
  if (cookie) {
    await ctx.addCookies(cookie.split('; ').filter(Boolean).map((kv) => {
      const i = kv.indexOf('=');
      return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: '127.0.0.1', path: '/' };
    }));
  }
  await ctx.route('**/dapi.kakao.com/**', (route) => route.abort());
  await ctx.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  return ctx.newPage();
}
async function 열기(code, cookie) {
  const page = await 새페이지(cookie);
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sheet', { timeout: 20000 });
  /* 손잡이가 달렸는지로 수화(hydration)를 잰다 — 서버가 그린 그림은 눌러도 아무 일이 없다 */
  await 될때까지(async () => {
    await page.click('[data-grip]');
    const 켜짐 = await page.getAttribute('[data-grip]', 'aria-expanded');
    if (켜짐 === 'true') { await page.click('[data-grip]'); return true; }
    return false;
  }, 20000, 200);
  return page;
}
const 글 = (page) => page.evaluate(() => document.body.innerText);
const 글있나 = async (page, s) => (await 글(page)).includes(s);
const 불단추 = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.seg')).map((b) => b.getAttribute('aria-pressed')));
/* 남의 불 — 사람 줄에 붙은 것만 본다. 내 단추 셋과 섞이면 안 된다. */
const 사람줄 = (page, 이름) => page.evaluate((n) => {
  const 줄 = Array.from(document.querySelectorAll('.row[data-going]'))
    .find((el) => el.innerText.includes(n));
  return 줄 ? { 불: 줄.dataset.going, 글: 줄.innerText.replace(/\s+/g, ' ') } : null;
}, 이름);

const 끝내기 = async () => {
  for (const ctx of 열린맥락) await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  for (const m of 치울모임)
    await api(`/api/m/${m.code}`, { method: 'POST', cookie: m.cookie, body: { action: 'remove' } }).catch(() => {});
  console.log(`\n통과 ${통과} · 실패 ${실패}`);
  process.exit(실패 ? 1 : 0);
};

try {

/* ── I0 · 시험이 로그인한다 ──────────────────────────────── */
console.log('\n[I0] 로그인 — 모임 만들기에 세션이 필요하다 (논의123)');
ok('임시 로그인이 된다', await 로그인(사람, '시험신호'));

/* ── I1 · 화면이 서버 값을 쓴다 (코드) ───────────────────── */
console.log('\n[I1] 신호등은 이 기기 것이 아니다 (ui.tsx)');
{
  ok('localStorage 에 신호등을 남기지 않는다', !/localStorage/.test(UI),
    UI.includes('moimer.going') ? 'moimer.going 열쇠가 남아 있다' : 'localStorage 가 남아 있다');
  ok("서버로 보낸다 (action: 'going')", /action:\s*'going'/.test(UI));
  ok('남의 불은 참가자 줄에서 읽는다', /\bp\.going\b/.test(UI));
  ok('no_meet_time 을 사람 말로 옮긴다', /no_meet_time:\s*'[^']+'/.test(UI));
  ok('bad_going 도 표에 있다', /bad_going:\s*'[^']+'/.test(UI));
  ok('영문 코드가 문구에 그대로 새지 않는다',
    !/'no_meet_time'\s*\+|\{say\?\.no_meet_time\}/.test(UI));
  ok('as unknown as Action 우회가 없다', !/as unknown as Action/.test(UI),
    '이제 lib/types.ts 에 타입이 있다');
}

/* ── I2 · 시간이 없으면 아예 안 보인다 (논의116) ─────────── */
console.log('\n[I2] 시간이 없는 모임에는 신호등이 없다');
{
  const { code, cookie: 방장 } = await 새모임('I 시간없음');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'i2', name: '어느지역', lat: 37.5665, lng: 126.978 });

  const page = await 열기(code, 영희);
  ok('논의116 시간이 없으면 신호등 단추가 아예 없다', (await 불단추(page)).length === 0);
  ok('논의116 시간이 없으면 신호등 말도 없다', !(await 글있나(page, '제때 가요')));
  ok('시간이 없으면 사람 줄에도 불이 없다', (await 사람줄(page, '영희')) === null);

  /* 화면이 먼저 감춘다 — 그래도 서버가 마지막 문을 지킨다 */
  const 서버 = await api(`/api/m/${code}`, { method: 'POST', cookie: 영희, body: { action: 'going', status: 'go' } });
  ok('서버도 시간 없는 모임은 막는다 (400 no_meet_time)',
    서버.status === 400 && 서버.json?.error === 'no_meet_time', `${서버.status} ${서버.json?.error}`);
  await page.close();
}

/* ── I3~I7 · 켜고 · 남에게 보이고 · 남는다 ───────────────── */
console.log('\n[I3~I7] 켠 불이 남에게 보이고, 새로고침해도 남는다');
{
  const { code, cookie: 방장 } = await 새모임('I 신호등', { meetAt: '2026-09-30T18:00' });
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'i3', name: '한지역', lat: 37.5665, lng: 126.978 });
  await 핑(code, 영희, { kind: 'region', refId: 'i3', name: '한지역', lat: 37.5665, lng: 126.978 });

  const 앞 = await 보기(code, 방장);
  const 앞표 = 앞.candidates.map((c) => `${c.name}:${c.votes}`).join(',');

  const 방장창 = await 열기(code, 방장);
  const 영희창 = await 열기(code, 영희);

  const 셋 = await 될때까지(async () => (await 불단추(영희창)).length === 3, 10000);
  ok('논의116 시간이 정해지면 신호등 셋이 켜진다', 셋, JSON.stringify(await 불단추(영희창)));

  /* [I3] 눌렀더니 서버에 남는가 */
  const 눌렀다 = await 다시해도(() => 영희창.click('.seg >> nth=1'),
    async () => 누구(await 보기(code, 방장), '영희')?.going === 'late');
  ok('논의115 하나를 누르면 서버에 남는다 (이 기기가 아니다)', 눌렀다,
    String(누구(await 보기(code, 방장), '영희')?.going));
  ok('논의116 누른 불이 화면에도 켜진다',
    (await 될때까지(async () => (await 불단추(영희창))[1] === 'true', 4000)),
    JSON.stringify(await 불단추(영희창)));

  /* [I4] ★ 남의 화면에 실시간으로 뜨는가 — 이 시험이 논의116 의 전부다 */
  const 남에게 = await 될때까지(async () => (await 사람줄(방장창, '영희'))?.불 === 'late', 8000);
  ok('논의116 ★ 내가 켠 불이 남의 화면에 실시간으로 뜬다', 남에게,
    JSON.stringify(await 사람줄(방장창, '영희')));
  ok('논의116 남의 줄에 무슨 불인지 말로도 적힌다',
    ((await 사람줄(방장창, '영희'))?.글 ?? '').includes('늦어요'),
    JSON.stringify(await 사람줄(방장창, '영희')));
  ok('아직 안 누른 사람과 구별된다',
    ((await 사람줄(방장창, '방장'))?.불) === 'none'
      && ((await 사람줄(방장창, '방장'))?.글 ?? '').includes('아직 안 알렸어요'),
    JSON.stringify(await 사람줄(방장창, '방장')));

  /* [I5] 새로고침해도 남는가 (= 서버에 담겼다는 뜻) */
  await 영희창.reload({ waitUntil: 'domcontentloaded' });
  await 영희창.waitForSelector('.sheet', { timeout: 20000 });
  ok('새로고침해도 내 불이 그대로다',
    await 될때까지(async () => (await 불단추(영희창))[1] === 'true', 10000),
    JSON.stringify(await 불단추(영희창)));

  /* [I6] 다른 불로 옮기고, 같은 불을 다시 눌러 되돌린다 (논의115) */
  const 옮겼다 = await 다시해도(() => 영희창.click('.seg >> nth=2'),
    async () => 누구(await 보기(code, 방장), '영희')?.going === 'no');
  ok('논의116 다른 불을 누르면 옮겨간다', 옮겼다,
    String(누구(await 보기(code, 방장), '영희')?.going));
  ok('논의116 빨간불도 남에게 그대로 보인다',
    await 될때까지(async () => (await 사람줄(방장창, '영희'))?.불 === 'no', 8000),
    JSON.stringify(await 사람줄(방장창, '영희')));

  const 껐다 = await 다시해도(() => 영희창.click('.seg >> nth=2'),
    async () => 누구(await 보기(code, 방장), '영희')?.going === null);
  ok('논의115 같은 불을 다시 누르면 아직으로 돌아간다', 껐다,
    String(누구(await 보기(code, 방장), '영희')?.going));
  ok('논의115 되돌린 것도 남의 화면에 그대로 간다',
    await 될때까지(async () => (await 사람줄(방장창, '영희'))?.불 === 'none', 8000),
    JSON.stringify(await 사람줄(방장창, '영희')));
  ok('되돌리면 내 단추도 다 꺼진다', (await 불단추(영희창)).every((x) => x === 'false'),
    JSON.stringify(await 불단추(영희창)));

  /* [I7] 알리기만 한다 — 표도 진행률도 안 건드린다 (논의116) */
  await 영희창.click('.seg >> nth=2');
  await 될때까지(async () => 누구(await 보기(code, 방장), '영희')?.going === 'no', 6000);
  const 뒤 = await 보기(code, 방장);
  ok('논의116 빨간불이 켜져도 선택 수는 그대로다',
    뒤.candidates.map((c) => `${c.name}:${c.votes}`).join(',') === 앞표,
    `${앞표} → ${뒤.candidates.map((c) => `${c.name}:${c.votes}`).join(',')}`);
  ok('논의116 빨간불이 켜져도 진행률은 그대로다',
    /2\/2 선택/.test(await 방장창.textContent('.badge')), await 방장창.textContent('.badge'));
  ok('논의116 못 간다고 해도 사람 수는 그대로다',
    뒤.participants.filter((p) => p.state === 'active').length === 2
      && (await 글있나(방장창, '함께하는 사람 2명')));

  /* [I9] 코드만 아는 사람 — 내 불은 못 켜고, 남의 불은 본다 (논의95) */
  const 손님 = await 열기(code, null);
  ok('참여하지 않은 사람에게는 신호등 단추가 없다', (await 불단추(손님)).length === 0);
  ok('참여하지 않은 사람도 누가 못 오는지는 본다',
    await 될때까지(async () => (await 사람줄(손님, '영희'))?.불 === 'no', 8000),
    JSON.stringify(await 사람줄(손님, '영희')));
  await 손님.close();

  /* [I8] 내보내진 사람 */
  const 영희id = 누구(뒤, '영희').id;
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
    body: { action: 'kick', participantId: 영희id } });
  ok('내보내진 사람 화면에는 신호등이 없다',
    await 될때까지(async () => (await 글있나(영희창, '내보냈어요')) && (await 불단추(영희창)).length === 0, 10000),
    (await 글(영희창)).replace(/\s+/g, ' ').slice(0, 120));
  ok('내보내진 사람의 불은 남의 화면에서도 사라진다',
    await 될때까지(async () => (await 사람줄(방장창, '영희')) === null, 8000),
    JSON.stringify(await 사람줄(방장창, '영희')));

  await 방장창.close(); await 영희창.close();
}

/* ── I10 · '추천 치우기' 가 진짜로 치우나 (논의94) ───────── */
console.log('\n[I10] 추천 치우기 — 누르면 AI 것만 사라진다');
{
  /* 모임 이름에 단추 글자를 넣지 않는다 — 머릿줄의 모임 이름이 단추보다 먼저 잡혀
     엉뚱한 곳을 눌러 놓고 '단추가 고장 났다'고 읽는다 (실제로 한 번 속았다) */
  const { code, cookie: 방장 } = await 새모임('I 심어둔 곳');
  await 참여(code, '철수');
  await 핑(code, 방장, { kind: 'region', refId: 'p1', name: '사람이올린곳', lat: 37.5665, lng: 126.978 });

  /* AI 후보는 AI 가 안 닿으면 못 만든다 — 그 두 줄만 DB 로 심는다 */
  const 심기 = async (name) => {
    const id = 'tI' + Math.random().toString(36).slice(2, 10);
    await sql`
      insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai)
      values (${id}, ${code}, 'region', ${'ai:' + name}, ${name}, 37.5675, 126.979, true)
    `;
    return id;
  };
  await 심기('AI혼자');
  const 골라진것 = await 심기('AI고름');
  await sql`
    insert into votes (code, candidate_id, participant_id, kind)
    select ${code}, ${골라진것}, p.id, 'region' from participants p
     where p.code = ${code} and p.name = '철수'
  `;

  const page = await 열기(code, 방장);
  /* 앞선 절에서 창을 여럿 띄웠다 — 확인 창(window.confirm)을 쓰는 손짓은 앞에 놓고 한다 */
  await page.bringToFront();
  const 보인다 = await 될때까지(() => 글있나(page, 'AI혼자'), 10000);
  ok('AI 가 올린 곳이 화면에 보인다', 보인다, (await 글(page)).replace(/\s+/g, ' ').slice(0, 160));
  const 단추 = await 다시해도(() => page.click('.acts-fix .fab'), () => 글있나(page, '추천 치우기'));
  ok('논의94 AI 가 올린 0표 후보가 있으면 "추천 치우기" 가 보인다', 단추);

  page.on('dialog', (d) => d.accept());
  /* 방장 도구 안의 단추만 집는다 — 화면 어딘가에 같은 글자가 또 있으면 그쪽이 먼저 잡힌다 */
  const 치우기단추 = page.locator('.acts button', { hasText: '추천 치우기' });
  const 사라졌나 = async () => !(await 보기(code, 방장)).candidates.some((c) => c.name === 'AI혼자');
  let 클릭오류 = '';
  let 치웠다 = false;
  for (let i = 0; i < 4 && !치웠다; i++) {
    try {
      if (!(await 치우기단추.count())) await page.click('.acts-fix .fab');
      await 치우기단추.click({ timeout: 8000 });
    } catch (e) { 클릭오류 = String(e?.message ?? e).split('\n')[0]; }
    치웠다 = await 될때까지(사라졌나, 5000);
  }
  const 남은것 = (await 보기(code, 방장)).candidates.map((c) => c.name);
  ok('논의94 누르면 아무도 안 고른 AI 후보가 진짜로 사라진다', 치웠다,
    `${남은것.join(', ')}${클릭오류 ? ` / 클릭: ${클릭오류}` : ''}`);
  ok('논의94 누군가 고른 AI 후보는 남는다', 남은것.includes('AI고름'), 남은것.join(', '));
  ok('논의94 사람이 올린 곳은 그대로다', 남은것.includes('사람이올린곳'), 남은것.join(', '));
  ok('논의94 치운 뒤에는 화면에서도 사라진다',
    await 될때까지(async () => !(await 글있나(page, 'AI혼자')), 8000),
    (await 글(page)).replace(/\s+/g, ' ').slice(0, 160));
  ok('논의94 치우고 나면 단추도 사라진다',
    await 될때까지(async () => !(await 글있나(page, '추천 치우기')), 8000));
  await page.close();
}

/* 시간을 비우면 켜 둔 불도 비운다 (논의116) — 안 그러면 시간을 다시 넣는 순간
   아무도 다시 안 눌렀는데 옛 대답이 되살아난다. */
{
  console.log('\n[I7] 시간을 비우면 불도 비운다');
  const m = await 새모임('신호 초기화', { meetAt: '2026-08-20T18:30' });
  const 영희 = await 참여(m.code, '영희');
  await api(`/api/m/${m.code}`, { method: 'POST', cookie: 영희, body: { action: 'going', status: 'no' } });
  let v = await 보기(m.code, m.cookie);
  ok('불이 켜졌다', 누구(v, '영희')?.going === 'no', `${누구(v, '영희')?.going}`);

  await api(`/api/m/${m.code}`, { method: 'POST', cookie: m.cookie, body: { action: 'update', meetAt: null } });
  v = await 보기(m.code, m.cookie);
  ok('시간을 비우니 불도 꺼졌다', !누구(v, '영희')?.going, `${누구(v, '영희')?.going}`);

  await api(`/api/m/${m.code}`, { method: 'POST', cookie: m.cookie, body: { action: 'update', meetAt: '2026-08-21T19:00' } });
  v = await 보기(m.code, m.cookie);
  ok('시간을 다시 넣어도 옛 불이 안 되살아난다', !누구(v, '영희')?.going, `${누구(v, '영희')?.going}`);
}

} catch (e) {
  실패++;

console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

await 끝내기();
