/* 모임 목록 화면 회귀 시험 — `app/meetings/**` (논의77·78·119·73·72)

   node tests/모임목록.mjs   (MOIMER_BASE 로 주소를 바꿀 수 있다. 기본 3000)

   두 갈래로 본다.
   ① 흉내 낸 `/api/mine` — 모임 0개·1개·여럿·지난 모임 섞임·걸러서 0개·못 불러옴처럼
      **진짜 데이터로 만들기 어려운 경우의 수**를 다 훑는다(`page.route`). DB 를 안 건드린다.
   ② 진짜 서버 — 모임을 하나 만들어 쿠키를 심고, 목록에 뜨는지·눌러서 그 모임으로 가는지 본다.
      **끝에 `{action:'remove'}` 로 내가 만든 것만 치운다.**

   금지 낱말은 화면 글자를 통째로 훑어 본다 — 한 자라도 새면 빨간불이다.

   ②는 이제 로그인해야 한다 — 논의123 이 `POST /api/m` 에 세션을 걸었다(401 login_required).
   로그인하는 길은 tests/세션.mjs 한 곳뿐이다. */
import { createRequire } from 'node:module';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* 논의71~73 — 이 낱말이 화면에 보이면 안 된다. '표' 는 한 글자라 '표시·목표' 까지 함께 걸린다.
   일부러 그렇게 뒀다: 이 화면의 글은 전부 우리가 쓴 것이라 걸릴 것이 없어야 맞다. */
const 금지 = ['투표', '표', '동네', '가게', '마감', '아카이브', '종료', '호스트', '멤버'];

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

/* 다른 갈래가 같은 시각에 파일을 고치면 개발 서버가 다시 굽느라 잠깐 500 이다 — 설 때까지 기다린다 */
async function 될때까지(fn, ms = 12000, 간격 = 200) {
  const 끝 = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch { /* 다시 */ }
    if (Date.now() > 끝) return false;
    await 잠깐(간격);
  }
}

/* ── 흉내 낼 모임 한 줄 ────────────────────────────────────── */
const 이제 = Date.now();
const 뒤 = (일) => new Date(이제 + 일 * 86400_000).toISOString();
const 모임 = (o) => ({
  code: 'AAA111', name: '흉내 모임', stage: 'region', closed: false, scope: 'place',
  meetAt: null, people: 3, chosen: 1, iAmHost: false, iChose: false, winner: null,
  updatedAt: new Date().toISOString(), ...o,
});

/* 다섯 갈래를 한 통에 — 지역 / 지점 / 정해짐 / 지난 모임 / 방장 */
const 다섯 = [
  모임({ code: 'RGN001', name: '토요일 저녁', stage: 'region', people: 4, chosen: 2, iChose: false, iAmHost: true, meetAt: 뒤(3) }),
  모임({ code: 'PLC001', name: '팀 회식', stage: 'place', people: 5, chosen: 5, iChose: true, winner: '성수동', meetAt: 뒤(1) }),
  모임({ code: 'RES001', name: '동창 모임', stage: 'result', people: 6, chosen: 6, iChose: true, winner: '황소식당', meetAt: 뒤(7), iAmHost: true }),
  모임({ code: 'PST001', name: '지난 번개', stage: 'result', closed: true, people: 6, chosen: 6, iChose: true, winner: '온기족발', meetAt: 뒤(-9) }),
  모임({ code: 'RGN002', name: '독서 모임', stage: 'region', people: 2, chosen: 0, iChose: false, meetAt: null }),
];

const 몸 = (meetings) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings }) });

async function 열기(ctx, 응답, { 기다릴 = '[data-list],[data-empty],[data-error]' } = {}) {
  const page = await ctx.newPage();
  if (응답) await page.route('**/api/mine*', (r) => r.fulfill(typeof 응답 === 'function' ? 응답() : 응답));
  await page.goto(`${BASE}/meetings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(기다릴, { timeout: 15000 }).catch(() => {});
  return page;
}

const 카드들 = (page) => page.$$eval('[data-card]', (n) => n.map((e) => ({
  code: e.getAttribute('data-code'), state: e.getAttribute('data-state'),
  host: e.getAttribute('data-host') === '1', todo: e.getAttribute('data-todo') === '1',
  text: e.innerText.replace(/\s+/g, ' ').trim(),
})));
const 글자 = (page) => page.evaluate(() => document.body.innerText);
/* 없는 것을 물어도 시험이 넘어지지 않게 — 빨간불 한 줄로 끝나야 나머지도 마저 돈다 */
const 글자of = async (page, sel) => { const e = await page.$(sel); return e ? await e.innerText() : ''; };
const 속성of = async (page, sel, fn) => { const e = await page.$(sel); return e ? await e.evaluate(fn) : null; };
const 금지훑기 = async (page, 자리) => {
  const t = await 글자(page);
  const 걸린 = 금지.filter((w) => t.includes(w));
  ok(`금지 낱말이 없다 — ${자리}`, 걸린.length === 0, 걸린.join(','));
};
/* 430 폭에서 가로로 안 잘리는가 */
const 안잘림 = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/* ── 진짜 서버에 모임 하나 ───────────────────────────────────
   `나` 는 쿠키 항아리를 스스로 드는 사람이다 — 세션.mjs 의 `로그인()` 이 요구하는 모양(call)이다.
   세션 쿠키가 있어야 모임을 만들 수 있고(논의123), 만든 모임을 치울 수도 있다:
   논의124 부터 방장은 **계정**으로 가린다 — 참가자 쿠키만으로는 remove 가 403 이다. */
const 항아리 = new Map();
const 항아리쿠키 = () => [...항아리].map(([k, v]) => `${k}=${v}`).join('; ');
const 나 = {
  async call(길, init = {}) {
    const r = await fetch(BASE + 길, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(항아리.size ? { cookie: 항아리쿠키() } : {}) },
    });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const kv = c.split(';')[0], i = kv.indexOf('=');
      if (i > 0) 항아리.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return { status: r.status, text: await r.text() };
  },
};

async function 진짜모임() {
  const r = await 나.call('/api/m', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'P시험 목록화면', hostName: '점검', scope: 'place',
      origin: '성수역', lat: 37.5446, lng: 127.0560, transport: 'transit',
    }),
  });
  let j = {};
  try { j = JSON.parse(r.text); } catch { /* 본문이 없을 수도 */ }
  if (!j.code) throw new Error(`모임을 못 만들었다 (${r.status})`);
  const 이름 = `moimer.p.${j.code}`;
  const 값 = 항아리.get(이름);
  if (!값) throw new Error('참가자 쿠키가 안 왔다');
  return { code: j.code, 쿠키: { name: 이름, value: 값 } };
}

/* ── 시작 ──────────────────────────────────────────────────── */
console.log(`\n모임 목록 화면 — ${BASE}/meetings`);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
let 치울코드 = null, 치울쿠키 = null;

try {
  /* [P0] 주소가 살아 있나 */
  console.log('\n[P0] /meetings 가 열린다');
  {
    const 살았나 = await 될때까지(async () => {
      const r = await fetch(`${BASE}/meetings`, { redirect: 'manual' });
      return r.status === 200;
    }, 20000, 500);
    ok('GET /meetings → 200', 살았나);
  }

  /* [P1] 모임이 정말 0개 — 만들기로 이끈다 (논의78) */
  console.log('\n[P1] 모임 0개');
  {
    const page = await 열기(ctx, 몸([]));
    const 빈 = await page.$('[data-empty="none"]');
    ok('“정말 0개” 빈 화면이 뜬다', !!빈);
    const t = 빈 ? await 빈.innerText() : '';
    ok('“아직 모임이 없어요” 라고 말한다', t.includes('아직 모임이 없어요'), t);
    const 단추 = await page.$('[data-empty="none"] a[href="/new"]');
    ok('[모임 만들기] 큰 단추가 있다 → /new', !!단추);
    ok('걸러낸 결과용 문구는 안 나온다', !(await page.$('[data-empty="filtered"]')));
    ok('거르개를 안 그린다 (고를 것이 없다)', (await page.$$('[data-state-filter]')).length === 0);
    await 금지훑기(page, '0개 화면');
    ok('430 폭에서 안 잘린다 — 0개 화면', await 안잘림(page));
    await page.close();
  }

  /* [P2] 모임 1개 */
  console.log('\n[P2] 모임 1개');
  {
    const page = await 열기(ctx, 몸([다섯[0]]));
    const c = await 카드들(page);
    ok('카드가 한 장', c.length === 1, String(c.length));
    ok('모임 이름이 보인다', c[0]?.text.includes('토요일 저녁'), c[0]?.text);
    ok('“지역 정하는 중” 이라 적는다', c[0]?.text.includes('지역 정하는 중'), c[0]?.text);
    ok('“3일 뒤” 처럼 읽히는 말로 적는다 (D-3 금지)',
      c[0]?.text.includes('3일 뒤') && !c[0]?.text.includes('D-'), c[0]?.text);
    ok('몇 명인지 적는다', c[0]?.text.includes('4명'), c[0]?.text);
    ok('빈 화면 문구는 안 나온다', !(await page.$('[data-empty]')));
    await 금지훑기(page, '1개 화면');
    await page.close();
  }

  /* [P3] 여럿 + 지난 모임 섞임 */
  console.log('\n[P3] 여럿 · 지난 모임 섞임');
  {
    const page = await 열기(ctx, 몸(다섯));
    const c = await 카드들(page);
    ok('다섯 장이 다 뜬다', c.length === 5, String(c.length));
    ok('서버가 준 차례를 안 바꾼다 (논의77)',
      c.map((x) => x.code).join(',') === 'RGN001,PLC001,RES001,PST001,RGN002',
      c.map((x) => x.code).join(','));
    const 지난 = c.find((x) => x.code === 'PST001');
    ok('끝난 모임은 “지난 모임” 이라 적는다 (논의73)', 지난?.text.includes('지난 모임'), 지난?.text);
    ok('지난 모임에도 언제 만났는지가 있다 (논의109)', /\d+월 \d+일/.test(지난?.text ?? ''), 지난?.text);
    ok('지난 모임은 흐리게 (진행 중과 갈라 보인다)',
      await 속성of(page, '[data-code="PST001"]', (e) => parseFloat(getComputedStyle(e).opacity) < 0.9) === true);
    const 정해짐 = c.find((x) => x.code === 'RES001');
    ok('정해진 모임은 “정해짐” · 정해진 곳을 적는다',
      정해짐?.text.includes('정해짐') && 정해짐?.text.includes('황소식당'), 정해짐?.text);
    ok('지점 고르는 중이면 정해진 지역을 적는다',
      c.find((x) => x.code === 'PLC001')?.text.includes('성수동'), c.find((x) => x.code === 'PLC001')?.text);
    await 금지훑기(page, '여럿 화면');
    ok('430 폭에서 안 잘린다 — 여럿 화면', await 안잘림(page));
    await page.close();
  }

  /* [P4] 내가 할 일 · 방장 표시 */
  console.log('\n[P4] 내 할 일 · 방장');
  {
    const page = await 열기(ctx, 몸(다섯));
    const c = await 카드들(page);
    ok('안 고른 모임에 할 일 자국이 붙는다',
      c.filter((x) => x.todo).map((x) => x.code).join(',') === 'RGN001,RGN002',
      c.filter((x) => x.todo).map((x) => x.code).join(','));
    ok('안 고른 모임에 “아직 안 골랐어요” 라고 적는다',
      (await 글자of(page, '[data-code="RGN001"]')).includes('아직 안 골랐어요'));
    ok('이미 고른 모임에는 안 붙는다',
      (await 카드들(page)).some((x) => x.code === 'PLC001')
        && !(await 글자of(page, '[data-code="PLC001"]')).includes('아직 안 골랐어요'));
    ok('끝난 모임에는 할 일이 없다', !c.find((x) => x.code === 'PST001')?.todo);
    ok('정해진 모임에는 할 일이 없다', !c.find((x) => x.code === 'RES001')?.todo);
    ok('“N명이 골랐어요” 로 적는다 (lib/말.ts 의 고른수)',
      (await 글자of(page, '[data-code="PLC001"]')).includes('5명이 골랐어요'));
    ok('방장 표시가 맞다',
      c.filter((x) => x.host).map((x) => x.code).join(',') === 'RGN001,RES001',
      c.filter((x) => x.host).map((x) => x.code).join(','));
    ok('방장 표시에 “방장” 이라 적는다',
      (await 글자of(page, '[data-code="RGN001"]')).includes('방장'));
    await page.close();
  }

  /* [P5] 거르개 — 상태 */
  console.log('\n[P5] 거르개 · 상태');
  {
    const page = await 열기(ctx, 몸(다섯));
    ok('거르개가 두 줄이다 (상태 / 역할)',
      (await page.$$('[data-filter-row]')).length === 2);
    const 줄이름 = await page.$$eval('[data-filter-row]', (n) => n.map((e) => e.getAttribute('data-filter-row')));
    ok('줄 이름이 상태·역할이다', 줄이름.join(',') === '상태,역할', 줄이름.join(','));
    const 칩글 = await page.$$eval('[data-state-filter]', (n) => n.map((e) => e.innerText.trim()));
    ok('상태 칩 이름이 지금 규칙이다',
      칩글.join('·') === '전체·지역 정하는 중·지점 정하는 중·정해짐·지난 모임', 칩글.join('·'));

    const 눌러서 = async (sel) => {
      await page.click(sel, { timeout: 4000 }).catch(() => {});
      await 잠깐(60);
      return (await 카드들(page)).map((x) => x.code).join(',');
    };
    ok('지역 정하는 중', await 눌러서('[data-state-filter="region"]') === 'RGN001,RGN002');
    ok('지점 정하는 중', await 눌러서('[data-state-filter="place"]') === 'PLC001');
    ok('정해짐', await 눌러서('[data-state-filter="result"]') === 'RES001');
    ok('지난 모임', await 눌러서('[data-state-filter="past"]') === 'PST001');
    ok('전체는 지난 모임까지 다 보인다', await 눌러서('[data-state-filter="all"]') === 'RGN001,PLC001,RES001,PST001,RGN002');
    ok('켜진 칩이 눌린 것으로 표시된다',
      await 속성of(page, '[data-state-filter="all"]', (e) => e.getAttribute('aria-pressed')) === 'true');
    await 금지훑기(page, '거르개 화면');
    await page.close();
  }

  /* [P6] 거르개 — 역할 · 두 축이 겹쳐 걸린다 */
  console.log('\n[P6] 거르개 · 역할');
  {
    const page = await 열기(ctx, 몸(다섯));
    const 눌러서 = async (...sel) => {
      for (const s of sel) { await page.click(s, { timeout: 4000 }).catch(() => {}); await 잠깐(60); }
      return (await 카드들(page)).map((x) => x.code).join(',');
    };
    ok('방장', await 눌러서('[data-role-filter="host"]') === 'RGN001,RES001');
    ok('참여자', await 눌러서('[data-role-filter="member"]') === 'PLC001,PST001,RGN002');
    ok('상태와 역할이 겹쳐 걸린다 (예전판은 못 했다)',
      await 눌러서('[data-role-filter="host"]', '[data-state-filter="region"]') === 'RGN001');
    ok('역할 전체로 되돌린다',
      await 눌러서('[data-role-filter="all"]', '[data-state-filter="all"]') === 'RGN001,PLC001,RES001,PST001,RGN002');
    await page.close();
  }

  /* [P7] 걸러서 0개 — 다른 말을 한다 (논의119) */
  console.log('\n[P7] 걸러서 0개');
  {
    /* 지난 모임이 하나도 없는 통 */
    const page = await 열기(ctx, 몸(다섯.filter((m) => !m.closed)));
    await page.click('[data-state-filter="past"]', { timeout: 4000 }).catch(() => {});
    await 잠깐(80);
    ok('카드가 0장', (await 카드들(page)).length === 0);
    const 빈 = await page.$('[data-empty="filtered"]');
    ok('“걸러서 0개” 문구가 뜬다', !!빈);
    const t = 빈 ? await 빈.innerText() : '';
    ok('“이 조건에 맞는 모임이 없어요” 라고 말한다', t.includes('이 조건에 맞는 모임이 없어요'), t);
    ok('“아직 모임이 없어요” 라고 말하지 않는다', !(await 글자(page)).includes('아직 모임이 없어요'));
    ok('만들기로 이끌지 않는다 (말만 한다 — 논의119)',
      !(await page.$('[data-empty="filtered"] a[href="/new"]')));
    ok('거르개는 그대로 보인다 (되돌릴 길)', (await page.$$('[data-state-filter]')).length === 5);
    await 금지훑기(page, '걸러서 0개 화면');
    await page.close();
  }

  /* [P8] 못 불러왔을 때 · 불러오는 중 */
  console.log('\n[P8] 불러오는 중 · 못 불러옴');
  {
    const page = await ctx.newPage();
    let 늦게풀기;
    const 문 = new Promise((r) => { 늦게풀기 = r; });
    await page.route('**/api/mine*', async (r) => { await 문; await r.fulfill(몸([])); });
    await page.goto(`${BASE}/meetings`, { waitUntil: 'domcontentloaded' });
    const 로딩 = await page.waitForSelector('[data-loading]', { timeout: 8000 }).catch(() => null);
    ok('불러오는 중이라고 말한다', !!로딩);
    const lt = 로딩 ? await 로딩.innerText() : '';
    ok('불러오는 중 문구가 사람 말이다', lt.includes('불러오는 중'), lt);
    늦게풀기();
    await page.close();
  }
  {
    const page = await 열기(ctx, { status: 500, contentType: 'application/json', body: '{"error":"db_down"}' },
      { 기다릴: '[data-error]' });
    const 잘못 = await page.$('[data-error]');
    ok('못 불러왔다고 말한다', !!잘못);
    const t = 잘못 ? await 잘못.innerText() : '';
    ok('“불러오지 못했어요” 라고 말한다', t.includes('불러오지 못했어요'), t);
    ok('다시 해 보는 길을 준다', !!(await page.$('[data-error] button')));
    const 전부 = await 글자(page);
    ok('영문 오류가 화면에 안 샌다', !/db_down|500|Error|error|failed|Failed/.test(전부), 전부.slice(0, 120));
    ok('“아직 모임이 없어요” 로 뭉개지 않는다', !전부.includes('아직 모임이 없어요'));
    await 금지훑기(page, '못 불러온 화면');
    await page.close();
  }

  /* [P9] 진짜 서버 — 만들고, 목록에 뜨고, 눌러서 그 모임으로 */
  console.log('\n[P9] 진짜 서버');
  {
    let 만듦 = null;
    ok('임시 로그인이 된다', await 로그인(나, '시험목록'));
    try { 만듦 = await 진짜모임(); } catch (e) { ok('진짜 모임 만들기', false, String(e.message)); }
    if (만듦) {
      치울코드 = 만듦.code; 치울쿠키 = 만듦.쿠키;
      ok('진짜 모임 만들기', true);
      await ctx.addCookies([{ ...만듦.쿠키, domain: '127.0.0.1', path: '/' }]);
      const page = await 열기(ctx, null);
      const c = await 카드들(page);
      const 내것 = c.find((x) => x.code === 만듦.code);
      ok('진짜 모임이 목록에 뜬다', !!내것, c.map((x) => x.code).join(','));
      ok('방장으로 뜬다', !!내것?.host);
      ok('아직 안 골랐다고 뜬다', !!내것?.todo);
      ok('이름이 보인다', !!내것?.text.includes('P시험 목록화면'), 내것?.text);
      await 금지훑기(page, '진짜 목록');
      await page.click(`[data-code="${만듦.code}"]`, { timeout: 6000 }).catch(() => {});
      await page.waitForURL(`**/m/${만듦.code}`, { timeout: 12000 }).catch(() => {});
      ok('카드를 누르면 그 모임으로 간다', page.url().includes(`/m/${만듦.code}`), page.url());
      await page.close();
    }
  }

  /* [P10] 사진 — 세 상태를 가로로 */
  if (process.env.P_SHOT) {
    console.log('\n[P10] 사진');
    const 찍기 = async (응답, 뒤처리, 파일) => {
      const page = await 열기(ctx, 응답);
      if (뒤처리) await 뒤처리(page).catch(() => {});
      await page.screenshot({ path: 파일 });
      await page.close();
    };
    const 곳 = process.env.P_SHOT;
    await 찍기(몸(다섯), null, `${곳}/a.png`);
    await 찍기(몸([]), null, `${곳}/b.png`);
    await 찍기(몸(다섯.filter((m) => !m.closed)),
      async (p) => { await p.click('[data-state-filter="past"]', { timeout: 4000 }); await 잠깐(120); }, `${곳}/c.png`);
    ok('사진 세 장', true);
  }
} finally {
  /* 내가 만든 모임만 치운다 */
  if (치울코드 && 치울쿠키) {
    /* 세션까지 실어야 치워진다 — 방장은 계정으로 가린다(논의124). `나` 가 두 쿠키를 다 들고 있다. */
    const r = await 나.call(`/api/m/${치울코드}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'remove' }),
    }).catch(() => null);
    ok('내가 만든 모임을 치웠다', !!r && r.status === 200, r ? String(r.status) : '못 불렀다');
  }
  await browser.close();
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
if (실패) process.exit(1);
