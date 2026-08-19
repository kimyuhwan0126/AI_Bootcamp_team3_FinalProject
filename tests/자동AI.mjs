/* 홈 화면 'AI' 기준 — 자동 갱신 회귀 시험 (2026-08-23, 사용자 요청 —
   "홈화면에서 시간 중심 삭제 또한 ai 추천 받기 버튼 삭제하고 ai 토글 켜있으면
   출발지관련 정보가 변경될때마다 중간지점이 업데이트 되는 형식으로 바꾸어줘").

   전에는 기준이 거리·시간·AI 셋이었고, AI 는 [AI 추천 받기] 를 손으로 눌러야만
   불렀다(opt-in). 이제 시간 기준은 없앴고, AI 는 거리 기준처럼 출발지가 바뀔
   때마다(350ms 손 멈추면) 자동으로 다시 묻는다 — 그래서 단추 자체가 없다.

   대부분은 /api/home-ai 를 가로채 흉내 낸 응답으로 잰다(결정론적·빠름·비용 없음).
   [진짜1] 하나만 실제 AI 를 그대로 불러 진짜로 이어지는지 확인한다.

   node tests/자동AI.mjs — 개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
import { createRequire } from 'node:module';

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
if (!chromium) { console.error('playwright-core 를 못 찾았다'); process.exit(1); }

let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? `  → ${d}` : ''}`); };
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));

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

const br = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = async () => br.newContext({ viewport: { width: 430, height: 1100 } });
const 넣기 = async (pg, 말, 몇째 = 0) => {
  await pg.fill('#og', 말);
  await pg.locator('[data-slot="탐색"] button.row').nth(몇째).waitFor({ timeout: 6000 });
  await pg.locator('[data-slot="탐색"] button.row').nth(몇째).click();
  await pg.locator('#og').waitFor({ timeout: 4000 });
  await 잠깐(120);
};

try {

/* ── [1] 기준 목록에 '시간' 이 없다 ─────────────────────── */
console.log('\n[1] 기준 목록에서 시간이 없어졌다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  const 기준들 = await pg.evaluate(() =>
    [...document.querySelectorAll('[data-slot="기준"] button.seg')].map((b) => b.textContent));
  ok('기준이 거리·AI 둘뿐이다', JSON.stringify(기준들) === JSON.stringify(['거리', 'AI']), JSON.stringify(기준들));
  await ctx.close();
}

/* ── [2] AI 기준에 [AI 추천 받기] 단추가 없다 ────────────── */
console.log('\n[2] [AI 추천 받기] 단추가 없다 — 자동으로 뜬다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  let 부른횟수 = 0;
  await ctx.route('**/api/home-ai', async (route) => {
    부른횟수++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ picks: [
        { name: '성수동', lat: 37.5447, lng: 127.0557 },
        { name: '연남동', lat: 37.5615, lng: 126.9257 },
      ] }) });
  });
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역'); await 넣기(pg, '서울역');
  await pg.getByRole('button', { name: 'AI', exact: true }).click();

  const 단추있나 = await pg.getByRole('button', { name: /AI 추천 받기|AI 추천 다시 받기|AI에게 묻는 중/ }).count();
  ok('AI 관련 단추가 하나도 없다', 단추있나 === 0, `단추 ${단추있나}개`);

  await pg.waitForFunction(() => document.querySelector('.opin[data-goal]') !== null, { timeout: 5000 });
  ok('단추 없이도 핀이 자동으로 뜬다', true);
  ok('실제로 자동 호출됐다(1번)', 부른횟수 === 1, `호출 ${부른횟수}번`);
  await ctx.close();
}

/* ── [3] 출발지를 더 넣으면 자동으로 다시 묻는다 ─────────── */
console.log('\n[3] 출발지를 더 넣으면(정보가 바뀌면) 자동으로 다시 묻는다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  let 부른횟수 = 0;
  const 응답들 = [
    [{ name: '성수동', lat: 37.5447, lng: 127.0557 }],
    [{ name: '왕십리동', lat: 37.5612, lng: 127.0378 }],
  ];
  await ctx.route('**/api/home-ai', async (route) => {
    const picks = 응답들[Math.min(부른횟수, 응답들.length - 1)];
    부른횟수++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ picks }) });
  });
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역');
  await pg.getByRole('button', { name: 'AI', exact: true }).click();
  await pg.waitForFunction(() => document.querySelector('.opin[data-goal]')?.getAttribute('data-label') === '성수동',
    { timeout: 5000 });
  ok('첫 출발지만으로 자동 호출된다', 부른횟수 === 1, `호출 ${부른횟수}번`);

  await 넣기(pg, '서울역');   // 출발지를 하나 더 넣는다 — 정보가 바뀌었다
  await pg.waitForFunction(() => document.querySelector('.opin[data-goal]')?.getAttribute('data-label') === '왕십리동',
    { timeout: 5000 });
  ok('출발지를 더 넣으면 자동으로 다시 물어 중간지점이 바뀐다', 부른횟수 === 2, `호출 ${부른횟수}번`);
  await ctx.close();
}

/* ── [4] 출발지를 빼도 자동으로 다시 묻는다 ──────────────── */
console.log('\n[4] 출발지를 빼도 자동으로 다시 묻는다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  let 부른횟수 = 0;
  const 응답들 = [
    [{ name: '왕십리동', lat: 37.5612, lng: 127.0378 }],
    [{ name: '수원역근처', lat: 37.2660, lng: 127.0000 }],
  ];
  await ctx.route('**/api/home-ai', async (route) => {
    const picks = 응답들[Math.min(부른횟수, 응답들.length - 1)];
    부른횟수++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ picks }) });
  });
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역'); await 넣기(pg, '서울역');
  await pg.getByRole('button', { name: 'AI', exact: true }).click();
  await pg.waitForFunction(() => document.querySelector('.opin[data-goal]')?.getAttribute('data-label') === '왕십리동',
    { timeout: 5000 });
  ok('두 출발지로 자동 호출된다', 부른횟수 === 1, `호출 ${부른횟수}번`);

  await pg.getByRole('button', { name: /서울역.*빼기/ }).click();   // 출발지를 뺀다
  await pg.waitForFunction(() => document.querySelector('.opin[data-goal]')?.getAttribute('data-label') === '수원역근처',
    { timeout: 5000 });
  ok('출발지를 빼도 자동으로 다시 물어 중간지점이 바뀐다', 부른횟수 === 2, `호출 ${부른횟수}번`);
  await ctx.close();
}

/* ── [5] 429(한도끝)도 단추 없이 문구로만 알린다 ─────────── */
console.log('\n[5] 한도에 걸려도(429) 문구로 알린다');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  await ctx.route('**/api/home-ai', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'too_many' }) }));
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역'); await 넣기(pg, '서울역');
  await pg.getByRole('button', { name: 'AI', exact: true }).click();
  await pg.waitForFunction(() => /다시 시도할게요/.test(document.querySelector('[data-slot="지도밑"]')?.textContent ?? ''),
    { timeout: 5000 });
  ok('한도끝 문구가 뜬다', true);
  const 핀있나 = await pg.evaluate(() => !!document.querySelector('.opin[data-goal]'));
  ok('핀은 없다(추천을 못 받았으니)', !핀있나);
  await ctx.close();
}

/* ── [6] 거리 기준은 그대로 잘 동작한다(회귀) ────────────── */
console.log('\n[6] 거리 기준은 그대로 잘 된다(회귀)');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역'); await 넣기(pg, '서울역');
  const 핀 = await pg.evaluate(() => !!document.querySelector('.opin[data-goal]'));
  ok('거리 기준(기본값)은 여전히 핀이 뜬다', 핀);
  await ctx.close();
}

/* ── [진짜1] 실제 AI 를 그대로 불러 자동 갱신이 진짜로 이어지는지 ── */
console.log('\n[진짜1] 실제 AI 호출 — 최대 90초까지 기다려 본다(느릴 수 있음)');
{
  const ctx = await 새창(); await 가짜검색(ctx);
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' });
  await 넣기(pg, '수원역'); await 넣기(pg, '서울역');
  await pg.getByRole('button', { name: 'AI', exact: true }).click();
  const 됐다 = await pg.waitForFunction(
    () => document.querySelector('.opin[data-goal]') !== null
      || /AI 추천을 받을 수 없어요|다시 시도할게요/.test(document.querySelector('[data-slot="지도밑"]')?.textContent ?? ''),
    { timeout: 90000 },
  ).then(() => true).catch(() => false);
  const 상태 = await pg.evaluate(() => ({
    핀있나: !!document.querySelector('.opin[data-goal]'),
    안내: document.querySelector('[data-slot="지도밑"]')?.textContent,
  }));
  ok('실제 호출이 성공이든 정직한 실패든 결론이 난다(무한 로딩 아님)', 됐다, JSON.stringify(상태));
  console.log(`     → ${JSON.stringify(상태)}`);
  await ctx.close();
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
} finally {
  await br.close();
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
