/* 홈(`/`) 회귀 시험.
   전에는 여기가 다짜고짜 만들기 폼이었다 — `/` 로 그냥 온 사람이 갈 곳이 없었다.
   지금은 **가운데 찾기 → 소개** 차례다. '초대 코드로 들어가기' 칸은 홈에서 뺐다 —
   초대는 실제 링크(`/join/<코드>`)로 바로 들어오는 길이 전부라, 손으로 코드를 치는
   화면을 홈에 둘 까닭이 없어졌다(`app/page.tsx` 주석 참고).

   node tests/홈.mjs — 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
import { createRequire } from 'node:module';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const require_ = createRequire(import.meta.url);
let chromium = null;
for (const p of [process.env.PLAYWRIGHT_CORE, 'playwright-core',
  'C:/Users/USER/.claude/jobs/c332f72c/tmp/node_modules/playwright-core'].filter(Boolean)) {
  try { ({ chromium } = require_(p)); break; } catch { /* 다음 곳 */ }
}
if (!chromium) { console.error('playwright-core 를 못 찾았다'); process.exit(1); }

let 통과 = 0, 실패 = 0;
const ok = (이름, 참, 덧 = '') => {
  if (참) { 통과++; console.log(`  ✓ ${이름}`); }
  else { 실패++; console.log(`  ✗ ${이름}${덧 ? ` — ${덧}` : ''}`); }
};
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));

/* 바깥 DB 가 잠자다 깨면 첫 물음이 늦다 — 몇 번 더 해 본다 */
async function 두들겨(path, init = {}, 번 = 4) {
  let 마지막;
  for (let i = 0; i < 번; i++) {
    try {
      const r = await fetch(BASE + path, init);
      const 쿠키 = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { /* 본문이 없을 수도 */ }
      return { status: r.status, json: j, 쿠키 };
    } catch (e) { 마지막 = e; await 잠깐(900); }
  }
  throw 마지막;
}

const jar = new Map();
const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const 먹기 = (s) => s.split('; ').filter(Boolean).forEach((kv) => {
  const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1));
});
const post = async (p, b) => {
  const r = await 두들겨(p, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(jar.size ? { cookie: ck() } : {}) },
    body: JSON.stringify(b) });
  if (r.쿠키) 먹기(r.쿠키);
  return r;
};

const 치울것 = [];

/* 모임을 만들려면 로그인해야 한다 — 논의52 갈래가 `POST /api/m` 에 세션을 걸었다(401 login_required).
   카카오 왕복은 기계가 못 누르니 개발용 임시 로그인(guest)으로 진짜 세션을 만든다.
   세션 쿠키도 `jar` 에 담기므로 `새창(true)` 로 연 브라우저에도 그대로 따라간다. */
async function 로그인(이름 = '지훈') {
  const c = await 두들겨('/api/auth/csrf');
  if (c.쿠키) 먹기(c.쿠키);
  const r = await 두들겨('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: ck() },
    body: new URLSearchParams({ csrfToken: c.json?.csrfToken ?? '', nickname: 이름, json: 'true' }).toString(),
  });
  if (r.쿠키) 먹기(r.쿠키);
  return !!jar.get('next-auth.session-token');
}
const 새모임 = async (name) => {
  const r = await post('/api/m', { name, hostName: '지훈', scope: 'region',
    meetAt: '2026-08-21T19:00', origin: '성수역', lat: 37.5446, lng: 127.056, transport: 'transit' });
  if (r.status === 200) 치울것.push(r.json.code);
  return r.json?.code;
};

const br = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = async (쿠키붙임 = false) => {
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  if (쿠키붙임) for (const [k, v] of jar)
    await ctx.addCookies([{ name: k, value: v, domain: '127.0.0.1', path: '/' }]);
  return ctx;
};
const 글 = (pg) => pg.evaluate(() => document.body.innerText);

try {

/* ── 처음 온 사람 ─────────────────────────────────────── */
console.log('\n[홈1] 모임이 없을 때');
{
  const ctx = await 새창(); const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(2500);
  const t = await 글(pg);

  ok('만들기 단추가 있다', /모임 만들기/.test(t));
  /* '초대 코드로 들어가기' 칸은 홈에서 뺐다 — 있으면 오히려 실패다 */
  ok('초대 코드 칸이 홈에 없다', await pg.locator('input[placeholder="6자리 코드"]').count() === 0);
  ok('참가(→) 단추도 없다 — 갈 곳이 없어졌다', await pg.locator('a[aria-label="초대 코드로 들어가기"]').count() === 0);
  ok('무엇을 하는 곳인지 한 줄이 있다', /가장 많이 고른 곳/.test(t));
  /* 모임이 없으면 '내 모임' 이라는 말 자체가 안 나와야 한다 — 빈 제목만 남으면 없는 줄 안다 */
  ok('내 모임 목록은 홈에 없다 (논의129 — 모임 탭이 맡는다)', !/내 모임/.test(t), t.slice(0, 60));
  ok('탭바가 보인다', await pg.locator('.tabbar').count() > 0);
  await ctx.close();
}

/* ── 코드로 들어가기 ──────────────────────────────────── */
/* [홈2] 는 없앴다 — 그 폼(`코드로들어가기.tsx`)을 홈이 더는 안 부른다(오늘 결정).
   같은 모양(placeholder="6자리 코드")의 폼이 `/new` 에도 인라인으로 있었는데 그것도
   뺐다(2026-08-15) — 이 파일이 재는 범위 밖이라 그쪽 시험은 tests/탭바.mjs 에 있다. */

/* ── 모임이 있어도 홈은 안 변한다 ─────────────────────── */
console.log('\n[홈3] 모임이 있어도 홈에는 목록이 안 뜬다');
{
  /* '내 모임' 요약 칸은 **없앴다** (논의129). 탭바가 생기기 전에 만든 것이라,
     아래 [모임] 탭이 같은 일을 거르개까지 달고 하는 지금은 같은 것을 두 군데서 보게 됐다.
     대신 [모임] 탭에 **점**이 붙는다 — 안 눌러도 '기다리는 게 있다' 를 안다. */
  ok('임시 로그인이 된다', await 로그인('지훈'));
  const 코드들 = [];
  for (const n of ['홈시험 하나', '홈시험 둘']) { 코드들.push(await 새모임(n)); await 잠깐(700); }

  const ctx = await 새창(true); const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(3500);
  const t = await 글(pg);

  ok('홈에 내 모임 목록이 안 뜬다', !/내 모임/.test(t), t.slice(0, 80));
  ok('내 모임 칸 자체가 없다', await pg.locator('[data-slot="내모임"]').count() === 0);
  ok('만들기 단추는 그대로 있다', /모임 만들기/.test(t));
  /* 안 고른 모임이 둘 있으니 점이 붙어야 한다 */
  ok('모임 탭에 점이 붙는다', await pg.locator('.tabdot').count() === 1);
  ok('점에는 수를 안 적는다', !/2\s*개|\(2\)/.test(await pg.locator('.tabbar').innerText()),
     await pg.locator('.tabbar').innerText());

  /* 낱말 규칙 (논의71~73) */
  for (const 금지 of ['투표', '동네', '마감', '아카이브']) {
    ok(`금지 낱말 '${금지}' 가 없다`, !t.includes(금지), t.slice(0, 80));
  }
  await ctx.close();
}

/* ── 하던 모임으로 가는 길 ────────────────────────────── */
console.log('\n[홈4] 하던 모임으로는 [모임] 탭으로 간다');
{
  const ctx = await 새창(true); const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(2500);
  await pg.locator('.tabbar a', { hasText: '모임' }).click();
  await pg.waitForURL(/\/meetings/, { timeout: 8000 }).catch(() => {});
  ok('모임 탭으로 간다', /\/meetings/.test(pg.url()), pg.url());
  /* 홈에서 없앤 목록이 여기에는 있어야 한다 — 없으면 갈 곳을 통째로 잃은 셈이다 */
  await 잠깐(2500);
  ok('거기에 내 모임이 있다', /홈시험/.test(await 글(pg)), (await 글(pg)).slice(0, 100));
  ok('그 탭에서는 점이 사라지지 않는다 (아직 안 골랐다)', await pg.locator('.tabdot').count() === 1);
  await ctx.close();
}
} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

/* ── 치우기 ───────────────────────────────────────────── */
console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울것) {
    const r = await post(`/api/m/${c}`, { action: 'remove' }).catch(() => ({ status: 0 }));
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.length, `${지움}/${치울것.length}건`);
}

await br.close();
console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
