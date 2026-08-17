/* 홈 탐색(`/` 의 '가운데 찾기') 회귀 시험.
   전에는 홈이 `[모임 만들기]` 와 `[코드 넣기]` 둘뿐인 갈림길이라, 처음 온 사람은
   무엇을 해 주는 곳인지 모른 채 골라야 했다. 지금은 로그인 없이 **써 보면서** 알게 한다.

   바깥 API 는 횟수 제한이 걸려 있고(논의92) 답도 날마다 달라진다 —
   **출발지 이름 찾기는 가짜로 답한다**(page.route). 그래야 여덟 곳 한도 같은 것을 재현할 수 있다.
   가운데 둘레 목록(`/api/places`)은 오늘(2026-08-14) 홈 화면에서 없앴다 — 그 라우트 자체의
   시험은 `tests/entry.mjs` 등으로 옮겨 갔다(맨 아래 [탐5] 자리의 주석 참고).

   node tests/탐색.mjs — 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
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

/* ── 가짜 이름 찾기 ────────────────────────────────────────
   찾는 말마다 다른 여섯 곳을 준다 — 여덟 곳 한도를 넘겨 보려면 말을 바꿔 가며 넣어야 한다.
   좌표는 강남 언저리다: 가운데가 실제로 가게가 있는 자리에 떨어져야 [탐5] 가 뜻을 갖는다. */
const 기준 = { lat: 37.4979, lng: 127.0276 };
const 씨 = (q) => [...q].reduce((a, c) => a + c.charCodeAt(0), 0) % 37;
async function 가짜검색(ctx) {
  await ctx.route('**/api/places/search**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    const s = 씨(q);
    const places = Array.from({ length: 6 }, (_, i) => ({
      id: `가짜:${q}:${i}`, name: `${q}${i + 1}`, address: '서울 강남구',
      lat: 기준.lat + (s * 6 + i) * 0.0012, lng: 기준.lng + (s * 6 + i) * 0.0009,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ places }) });
  });
}
/* 갈래가 정해진 가짜 둘레 — 거르개를 재려면 무엇이 몇 개인지 알아야 한다 */
const 가짜지점 = [
  { id: 'f1', name: '한밭식당', address: '서울 강남구 1', lat: 기준.lat, lng: 기준.lng, category: '음식점' },
  { id: 'f2', name: '두번째식당', address: '서울 강남구 2', lat: 기준.lat, lng: 기준.lng, category: '음식점' },
  { id: 'f3', name: '별다방', address: '서울 강남구 3', lat: 기준.lat, lng: 기준.lng, category: '카페' },
  { id: 'f4', name: '옛터미술관', address: '서울 강남구 4', lat: 기준.lat, lng: 기준.lng, category: '문화시설' },
];
async function 가짜둘레(ctx) {
  await ctx.route('**/api/places?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ places: 가짜지점, partial: false }) });
  });
}

const br = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = async (쿠키붙임 = false) => {
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  if (쿠키붙임) for (const [k, v] of jar)
    await ctx.addCookies([{ name: k, value: v, domain: '127.0.0.1', path: '/' }]);
  return ctx;
};
const 글 = (pg) => pg.evaluate(() => document.body.innerText);
const 알약수 = (pg) => pg.locator('[data-slot="탐색"] ul li button[aria-label$="빼기"]').count();
const 가운데of = (pg) => pg.locator('[data-slot="탐색"]').getAttribute('data-가운데');

/* 검색칸에 치고, 뜬 것 중 하나를 고른다 */
async function 넣기(pg, 말, 몇째 = 0) {
  await pg.locator('#og').fill(말);
  await pg.locator('[data-slot="탐색"] button.row').nth(몇째).waitFor({ timeout: 6000 });
  await pg.locator('[data-slot="탐색"] button.row').nth(몇째).click();
  /* 고르면 칸을 새로 단다 — 새 칸이 붙을 때까지 기다린다 */
  await pg.locator('#og').waitFor({ timeout: 4000 });
  await 잠깐(120);
}

try {

/* ── 출발지가 없을 때 ─────────────────────────────────── */
console.log('\n[탐1] 출발지가 없을 때');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1800);
  const t = await 글(pg);

  ok('탐색 칸이 홈에 있다', await pg.locator('[data-slot="탐색"]').count() > 0);
  ok('출발지가 없으면 안내 문구가 뜬다', /아직 출발지가 없어요/.test(t), t.slice(0, 120));
  ok('가운데가 아직 없다', (await 가운데of(pg)) === '');
  ok('출발지 검색칸이 있다', await pg.locator('#og').count() > 0);
  ok('둘레 목록은 없다(오늘 없앴다)', await pg.locator('[data-slot="탐색"] .rows .row[data-static]').count() === 0);
  /* 홈에서 만들기로 가는 길은 그대로 있어야 한다 */
  ok('모임 만들기 단추가 있다', await pg.locator('.wrap a.cta', { hasText: '모임 만들기' }).count() === 1);
  /* '초대 코드로 들어가기' 칸은 홈에서 뺐다(오늘 결정) — 초대는 실제 링크로 바로
     `/join/<코드>` 에 들어오는 길이 전부라, 손으로 코드를 치는 화면을 홈에 둘 까닭이 없다 */
  ok('초대 코드 칸은 홈에 없다', await pg.locator('input[placeholder="6자리 코드"]').count() === 0);
  ok('탭바가 보인다', await pg.locator('.tabbar').count() > 0);
  /* 430 폭에서 가로로 넘치면 안 된다 */
  const 넘침 = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('430 폭에서 가로로 안 잘린다', 넘침 <= 0, `${넘침}px 넘침`);
  await ctx.close();
}

/* ── 처음 여는 지도가 지금 있는 자리를 짚는가 ─────────── */
console.log('\n[탐1-2] 처음 여는 지도는 내가 있는 자리를 짚는다');
{
  /* 아직 위치를 허락도 거절도 안 한 사람 — 오늘부터(2026-08-14) 단추를 기다리지 않고
     화면을 열자마자 스스로 물어본다(지도.tsx). 헤드리스 크롬은 답이 없는 prompt 를
     스스로 거절한 것처럼 처리하므로, 이 시험에서는 '아무 권한도 안 준' 경우와 같은
     결과가 나온다 — 그래서 아래 '막아 둔 사람' 블록과 기대값이 같다: 단추는 **어디에도**
     없고, 못 받으면 조용히 안내 문구만 남는다. */
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(2000);
  ok('[내 위치] 단추는 이제 없다', await pg.locator('[data-slot="내위치단추"]').count() === 0);
  ok('못 받으면 안내 문구만 남는다', /아직 출발지가 없어요/.test(await 글(pg)));
  /* 그릴 것이 없으면 남의 타일 서버를 안 두들긴다 — 홈은 자주 들르는 자리다 */
  ok('그릴 것이 없으면 타일을 안 받는다', await pg.locator('[data-slot="탐색"] .osm img').count() === 0);
  await ctx.close();
}
{
  /* 이미 허락해 둔 사람 — 묻지 않고 조용히 가져와 그 자리를 짚는다 */
  /* 내 자리를 **가짜 검색이 쓰는 기준점**에 둔다. 멀리 두면 출발지를 넣는 순간 지도가 그쪽으로
     바짝 당겨져 내 자리가 진짜로 화면 밖이 되고(화면 밖 핀은 일부러 안 그린다),
     그건 결함이 아니라 옳은 동작이라 그 자리에서는 잴 것이 없다. */
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 },
    permissions: ['geolocation'], geolocation: { latitude: 기준.lat, longitude: 기준.lng } });
  await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await pg.locator('[data-slot="내자리"]').waitFor({ timeout: 9000 }).catch(() => {});
  ok('허락해 둔 사람에게는 내 자리 점이 뜬다', await pg.locator('[data-slot="내자리"]').count() === 1);
  ok('그때는 지도 타일도 받는다', await pg.locator('[data-slot="탐색"] .osm img').count() > 0);
  ok('안내 문구는 물러난다', !/아직 출발지가 없어요/.test(await 글(pg)));
  /* 점이 지도 한가운데 있어야 '내가 여기' 로 읽힌다 — 구석에 붙으면 눈이 안 간다 */
  const 가운데쯤 = await pg.evaluate(() => {
    const d = document.querySelector('[data-slot="내자리"]');
    const m = document.querySelector('[data-slot="탐색"] .osm');
    if (!d || !m) return null;
    const a = d.getBoundingClientRect(), b = m.getBoundingClientRect();
    return { dx: Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)),
             dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) };
  });
  ok('내 자리가 지도 한가운데 온다', !!가운데쯤 && 가운데쯤.dx < 12 && 가운데쯤.dy < 12, JSON.stringify(가운데쯤));

  /* 출발지를 넣으면 지도는 출발지에 맞춘다 — 내 자리 점은 남되 지도를 붙들지 않는다 */
  await 넣기(pg, '성수');
  await 잠깐(900);
  /* 출발지를 넣으면 지도가 그쪽으로 바짝 당겨진다. 그때 내 자리가 화면 밖이면 **안 그리는 것이 맞다** —
     안으로 밀어 넣으면 없는 곳을 가리키게 된다(`자리()`). 그러니 '점이 사라졌나' 로 재면 안 되고,
     **축소하면 돌아오는가** 로 재야 한다. 그것이 '지워진 것이 아니라 화면 밖일 뿐' 이라는 뜻이다. */
  for (let i = 0; i < 6; i++) {
    await pg.locator('[data-slot="탐색"] .ozoom button[aria-label="축소"]').click();
    await 잠깐(120);
  }
  await pg.locator('[data-slot="내자리"]').waitFor({ timeout: 5000 }).catch(() => {});
  ok('출발지를 넣은 뒤에도 축소하면 내 자리 점이 돌아온다',
     await pg.locator('[data-slot="내자리"]').count() === 1);
  ok('출발지를 넣으면 알약이 하나 생긴다', (await 알약수(pg)) === 1);
  await ctx.close();
}
{
  /* 막아 둔 사람 — 단추 자체가 이제 없다(논의105). 자동으로 물어보다 거절당해도
     조용히 안내 문구만 남아야 한다 */
  const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.grantPermissions([]);          /* 아무 권한도 안 준다 = 거절해 둔 상태 */
  await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(2200);
  ok('막아 둔 사람에게는 단추를 안 그린다', await pg.locator('[data-slot="내위치단추"]').count() === 0);
  ok('그래도 무엇을 하면 되는지는 말한다', /위 검색칸에서 출발지를 넣어 보세요/.test(await 글(pg)));
  await ctx.close();
}

/* ── 한 곳 · 두 곳 ────────────────────────────────────── */
console.log('\n[탐2] 출발지 한 곳 → 두 곳');
{
  const ctx = await 새창(); await 가짜검색(ctx); await 가짜둘레(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1500);

  await 넣기(pg, '가가', 0);
  ok('한 곳 넣으면 알약이 하나', await 알약수(pg) === 1);
  const 한곳 = (await 가운데of(pg)).split(',').map(Number);
  const 기대 = [기준.lat + 씨('가가') * 6 * 0.0012, 기준.lng + 씨('가가') * 6 * 0.0009];
  ok('한 곳이면 가운데가 곧 그곳이다',
    Math.abs(한곳[0] - 기대[0]) < 1e-9 && Math.abs(한곳[1] - 기대[1]) < 1e-9,
    `${한곳} ≠ ${기대}`);
  ok('한 곳일 때 안내가 하나 더 넣으라고 말한다', /하나 더 넣으면/.test(await 글(pg)));
  ok('안내 문구가 사라졌다', !/아직 출발지가 없어요/.test(await 글(pg)));

  await 넣기(pg, '나나', 1);
  ok('두 곳이 됐다', await 알약수(pg) === 2);
  const 두곳 = (await 가운데of(pg)).split(',').map(Number);
  const 둘째 = [기준.lat + (씨('나나') * 6 + 1) * 0.0012, 기준.lng + (씨('나나') * 6 + 1) * 0.0009];
  ok('두 곳이면 가운데가 둘의 한가운데다',
    Math.abs(두곳[0] - (기대[0] + 둘째[0]) / 2) < 1e-9 && Math.abs(두곳[1] - (기대[1] + 둘째[1]) / 2) < 1e-9,
    `${두곳}`);

  await 잠깐(1200);

  /* 빼면 가운데가 다시 잡힌다 */
  await pg.locator('[data-slot="탐색"] button[aria-label$="빼기"]').nth(1).click();
  await 잠깐(300);
  ok('빼면 알약이 하나 준다', await 알약수(pg) === 1);
  const 다시 = (await 가운데of(pg)).split(',').map(Number);
  ok('빼면 가운데가 다시 잡힌다',
    Math.abs(다시[0] - 기대[0]) < 1e-9 && Math.abs(다시[1] - 기대[1]) < 1e-9, `${다시}`);
  await ctx.close();
}

/* ── 여덟 곳 한도 ─────────────────────────────────────── */
console.log('\n[탐3] 여덟 곳까지만');
{
  const ctx = await 새창(); await 가짜검색(ctx); await 가짜둘레(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1500);

  for (let i = 0; i < 6; i++) await 넣기(pg, '가가', i);
  ok('여섯 곳까지 들어갔다', await 알약수(pg) === 6, `${await 알약수(pg)}곳`);
  /* 같은 곳을 또 넣으면 안 는다 */
  await 넣기(pg, '가가', 0);
  ok('같은 곳은 두 번 안 들어간다', await 알약수(pg) === 6, `${await 알약수(pg)}곳`);
  ok('이미 넣었다고 말해 준다', /이미 넣은 출발지예요/.test(await 글(pg)));

  for (let i = 0; i < 3; i++) await 넣기(pg, '나나', i);
  const 끝 = await 알약수(pg);
  ok('여덟 곳에서 멈춘다', 끝 === 8, `${끝}곳`);
  ok('여덟 곳이 한도라고 말해 준다', /출발지는 8곳까지 넣을 수 있어요/.test(await 글(pg)));
  await ctx.close();
}

/* [탐4] "갈래 거르개는 없앴다" 는 오늘(2026-08-14) 통째로 없앴다 — 재던 것(갈래 거르개·갈래 표)이
   전부 그 둘레 목록 안에 있었는데, 목록 자체를 없앴다(탐색.tsx 참고). 갈래를 다시 보여 주는 날이
   오면 이 자리에 새로 짜야 한다. */

/* ── 옛 판 모양인가 ───────────────────────────────────── */
console.log('\n[탐4-2] 홈이 옛 판 모양이다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(2000);

  ok('머리말에 MOIMER 워드마크가 있다',
     await pg.locator('[data-slot="홈머리말"]', { hasText: 'MOIMER' }).count() === 1);
  /* 옛 판은 셋(＋·→·🔔)이었지만 알림은 없는 기능이라 안 그리고(논의105), → 도 없앴다 —
     초대는 실제 링크로 바로 들어오는 길이 전부라 홈에서 누를 '참가' 단추 자체가 갈 곳이 없다.
     ＋(모임 만들기)도 오늘 없앴다 — 바로 아래 탐색 칸에 이미 같은 곳으로 가는 꽉 찬
     [모임 만들기] 단추가 있어서 둘째 단추일 뿐이었다. 이제 로고 하나뿐이다 */
  const 링크수 = await pg.locator('[data-slot="홈머리말"] a').count();
  ok('머리말이 로고 하나뿐이다', 링크수 === 1, `${링크수}개`);
  ok('알림 단추는 없다', !/알림/.test(await 글(pg)));

  const 칸 = pg.locator('#og');
  ok('큰 검색칸이 스스로 묻는다',
     (await 칸.getAttribute('placeholder')) === '어디에서 출발하시나요?', await 칸.getAttribute('placeholder'));
  const 둥글기 = await pg.evaluate(() => {
    const el = document.querySelector('#og')?.parentElement;
    return el ? getComputedStyle(el).borderRadius : '';
  });
  ok('검색칸이 알약 모양이다', parseFloat(둥글기) >= 100, 둥글기);

  /* 점선 원 ＋(출발지 더 넣기)는 오늘 없앴다 — 검색칸이 늘 열려 있어 둘째 단추였다 */
  ok('점선 원 ＋ 는 이제 없다',
     await pg.locator('[data-slot="탐색"] button[aria-label="출발지 더 넣기"]').count() === 0);
  ok('제목 "가운데 찾기" 는 없앴다', !/가운데 찾기/.test(await 글(pg)));
  await ctx.close();
}

/* [탐5] "진짜 /api/places 로도 도나" 도 오늘 없앴다 — 홈 화면이 더는 `/api/places` 를
   부르지 않는다(탐색.tsx 참고). `/api/places` 라우트 자체의 시험(입구 가드·바깥 API 연동)은
   `tests/entry.mjs`·`tests/external.mjs`·`tests/결정_입구.mjs`·`tests/가게캐시.mjs` 가
   여전히 맡는다 — 그 라우트는 모임 화면(`/m/[code]`)의 지점 고르기가 그대로 쓴다. */

/* ── 새로고침 ─────────────────────────────────────────── */
console.log('\n[탐6] 새로고침하면 출발지가 남는다');
{
  const ctx = await 새창(); await 가짜검색(ctx); await 가짜둘레(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1500);
  await 넣기(pg, '가가', 0);
  await 넣기(pg, '나나', 0);
  ok('두 곳 넣었다', await 알약수(pg) === 2);

  await pg.reload({ waitUntil: 'load' });
  await 잠깐(1800);
  ok('새로고침해도 두 곳이 그대로다', await 알약수(pg) === 2, `${await 알약수(pg)}곳`);

  /* 뺀 것은 되살아나면 안 된다 */
  await pg.locator('[data-slot="탐색"] button[aria-label$="빼기"]').first().click();
  await 잠깐(250);
  await pg.reload({ waitUntil: 'load' });
  await 잠깐(1800);
  ok('뺀 출발지는 새로고침해도 안 돌아온다', await 알약수(pg) === 1, `${await 알약수(pg)}곳`);

  /* 창을 새로 열면(다른 세션) 비어 있어야 한다 */
  const ctx2 = await 새창(); await 가짜검색(ctx2);
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1800);
  ok('새 창에서는 비어 있다', await 알약수(pg2) === 0);
  await ctx2.close();
  await ctx.close();
}

/* ── ★ 만들기 폼으로 넘기기 ───────────────────────────── */
console.log('\n[탐7] ★ [이 출발지들로 모임 만들기] → /new 에 출발지가 들어가 있다');
{
  /* 만들기는 이제 로그인이 필요하다 — 폼까지 진짜로 눌러 보려면 세션을 들고 가야 한다 */
  ok('임시 로그인이 된다', await 로그인('지훈'));
  const ctx = await 새창(true); await 가짜검색(ctx); await 가짜둘레(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(1500);
  await 넣기(pg, '가가', 0);
  await 넣기(pg, '나나', 0);
  const 첫이름 = '가가1';
  const 첫좌표 = [기준.lat + 씨('가가') * 6 * 0.0012, 기준.lng + 씨('가가') * 6 * 0.0009];

  /* 이동 수단도 함께 넘어가야 한다 — 홈에서 정한 것을 폼이 또 물으면 두 번 정하는 꼴이다 */
  await pg.getByRole('button', { name: '자동차' }).click();

  await pg.getByRole('link', { name: '이 출발지들로 모임 만들기' }).click();
  await pg.waitForURL(/\/new/, { timeout: 9000 }).catch(() => {});
  ok('만들기 폼으로 간다', /\/new/.test(pg.url()), pg.url());
  await 잠깐(1200);
  const t = await 글(pg);

  ok('★ 폼에 첫 출발지가 들어가 있다', t.includes(첫이름), t.slice(0, 200));
  ok('어디서 온 값인지 밝힌다', /홈에서 잡은 출발지를 가져왔어요/.test(t));
  /* 2026-08-17 — 예전엔 "나머지 N곳은 친구들이 넣어요" 라고만 했다. 첫 곳이 늘 방장 것은
     아니라서(실사용 신고) 이제는 출발지 칸의 '바꾸기'로 그 목록 중 고를 수 있다고 안내한다
     (app/originfield.tsx 의 quickPicks). 안내문도 그 뜻으로 바뀌었다. */
  ok('두고 온 나머지를 고를 수 있다고 말해 준다',
    /아래에서 그중 내 출발지를 고를 수 있어요/.test(t), t.slice(0, 200));
  ok('이동 수단도 따라왔다',
    (await pg.getByRole('button', { name: '자동차' }).getAttribute('aria-pressed')) === 'true');

  /* 보이기만 하는 게 아니라 **좌표까지 살아 있어야** 한다 — 예전판이 무너진 자리다 */
  await pg.locator('#mn').fill('탐색시험 모임');
  await pg.locator('#hn').fill('지훈');
  await pg.getByRole('button', { name: '만들기' }).click();
  await pg.waitForURL(/\/m\/[A-Z0-9]{6}/, { timeout: 15000 }).catch(() => {});
  const 코드 = (pg.url().match(/\/m\/([A-Z0-9]{6})/) ?? [])[1];
  ok('그대로 눌러 모임이 만들어진다', !!코드, pg.url());
  if (코드) {
    치울것.push(코드);
    /* 이 모임의 쿠키는 브라우저에 있다 — 치우려면 여기(node)도 그 쿠키를 들고 있어야 한다 */
    for (const c of await ctx.cookies()) if (c.name.startsWith('moimer.')) jar.set(c.name, c.value);
    const v = (await 두들겨(`/api/m/${코드}`, { headers: { cookie: ck() } })).json;
    const 방장 = v?.participants?.[0];
    ok('★ 좌표까지 살아서 서버에 남았다',
      !!방장 && Math.abs(방장.lat - 첫좌표[0]) < 1e-6 && Math.abs(방장.lng - 첫좌표[1]) < 1e-6,
      JSON.stringify(방장 ?? null).slice(0, 140));
    ok('출발지 이름도 그대로다', 방장?.origin_name === 첫이름, String(방장?.origin_name));
    ok('이동 수단도 그대로다', 방장?.transport === 'car', String(방장?.transport));
  }

  /* 넘긴 것은 한 번만 쓴다 — 폼을 새로고침하면 내정보 기본값으로 돌아간다 */
  const ctx3 = await 새창(); await 가짜검색(ctx3);
  const pg3 = await ctx3.newPage();
  await pg3.goto(BASE + '/new', { waitUntil: 'load' });
  await 잠깐(1200);
  ok('폼에 그냥 오면 넘어온 출발지 안내가 없다',
    !/홈에서 잡은 출발지를 가져왔어요/.test(await 글(pg3)));
  await ctx3.close();
  await ctx.close();
}

/* ── 차례 ─────────────────────────────────────────────── */
console.log('\n[탐8] 탐색이 홈의 맨 위다');
{
  const r = await post('/api/m', { name: '탐색차례 모임', hostName: '지훈', scope: 'region',
    origin: '성수역', lat: 37.5446, lng: 127.056, transport: 'transit' });
  if (r.status === 200) 치울것.push(r.json.code);
  ok('시험용 모임을 만들었다', r.status === 200, String(r.status));

  const ctx = await 새창(true); await 가짜검색(ctx); await 가짜둘레(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 잠깐(3000);
  /* 옛 판 홈은 검색칸과 지도가 맨 위였다 — 그것이 이 화면의 첫인상이고 뜻이다.
     '내 모임' 요약 칸은 없앴다(논의129): 아래 [모임] 탭이 같은 일을 한다. */
  const 위치 = await pg.evaluate(() => {
    const 머리 = document.querySelector('[data-slot="홈머리말"]');
    const 탐 = document.querySelector('[data-slot="탐색"]');
    return 탐 ? {
      머리: 머리 ? 머리.getBoundingClientRect().bottom : null,
      탐: 탐.getBoundingClientRect().top,
    } : null;
  });
  ok('머리말 바로 밑이 탐색이다', !!위치 && 위치.머리 !== null && 위치.탐 - 위치.머리 < 40,
     JSON.stringify(위치));
  /* '초대 코드로 들어가기' 칸은 홈에서 뺐다 — 자리 순서를 잴 대상 자체가 없다 */
  ok('초대 코드 칸은 홈에 없다', await pg.locator('#코드로들어가기').count() === 0);
  ok('내 모임 요약 칸은 홈에 없다', await pg.locator('[data-slot="내모임"]').count() === 0);

  /* 탭바가 맨 아래 단추를 덮으면 안 된다 */
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await 잠깐(400);
  const 덮임 = await pg.evaluate(() => {
    const b = [...document.querySelectorAll('a.cta')].find((x) => /모임 만들기/.test(x.textContent ?? ''));
    if (!b) return '단추를 못 찾았다';
    const r = b.getBoundingClientRect();
    const 위 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return 위 && (위 === b || b.contains(위)) ? '' : `덮은 것: ${위?.className ?? '없음'}`;
  });
  ok('탭바가 만들기 단추를 안 가린다', 덮임 === '', String(덮임));
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
