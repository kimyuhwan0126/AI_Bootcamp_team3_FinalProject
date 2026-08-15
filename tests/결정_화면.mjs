/* 그릴링 결정을 화면(app/m/[code]/ui.tsx)에 넣은 것을 지키는 시험.
   논의59 68 71~74 76 81 82 94 108 111~118 120.

   node tests/결정_화면.mjs — 개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   지도는 카카오 SDK 를 막아 OSM 폴백으로 연다(그래야 진짜 손가락처럼 눌러 볼 수 있다).
   타일·주소 찾기는 흉내 낸 응답으로 바꿔 끼운다 — 바깥이 느리다고 빨간불이 켜지면 안 된다. */
import { createRequire } from 'node:module';
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
/* 다른 갈래가 route.ts·db.ts 를 고치는 중이라 잠깐 500 이 난다 — 설 때까지 기다린다 */
async function 될때까지(fn, ms = 10000, 간격 = 250) {
  const 끝 = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch { /* 다시 */ }
    if (Date.now() > 끝) return false;
    await 잠깐(간격);
  }
}

/* 다른 갈래가 파일을 고치면 개발 서버가 다시 굽고 화면이 통째로 새로 열린다 —
   화면만 아는 것(미리보기·손잡이)은 그때 사라진다. 손짓을 다시 해 본다. */
async function 다시해도(손짓, 확인, 번 = 6) {
  for (let i = 0; i < 번; i++) {
    try { await 손짓(); } catch { /* 새로 열리는 중이면 다음 판에 */ }
    if (await 될때까지(확인, 3500, 200)) return true;
  }
  return false;
}

/* ── API ─────────────────────────────────────────────────── */
async function api(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const 준쿠키 = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 있다 */ }
  return { status: r.status, json, cookie: 준쿠키 };
}

/* ── 방장 계정 ────────────────────────────────────────────
   모임 만들기가 로그인 필수가 됐다(논의123). 방장 판정도 쿠키가 아니라 계정으로 바뀌어서
   (논의124) 확정·설정·삭제까지 이 세션 쿠키가 따라다녀야 한다 — 참가자 쿠키만으로는 403 이다.
   참여(join)는 그대로 로그인이 필요 없다 — 영희·손님은 예전과 같다.
   `로그인` 이 바라는 것은 call 하나뿐이라 얇게 감싸 넘긴다. */
const 계정항아리 = new Map();
const 계정쿠키 = () => [...계정항아리].map(([k, v]) => `${k}=${v}`).join('; ');
const 계정 = {
  async call(path, init = {}) {
    const c = 계정쿠키();
    const r = await fetch(BASE + path, {
      ...init, redirect: 'manual',
      headers: { ...(c ? { cookie: c } : {}), ...(init.headers || {}) },
    });
    (r.headers.getSetCookie?.() ?? []).forEach((s) => {
      const kv = s.split(';')[0]; const i = kv.indexOf('=');
      계정항아리.set(kv.slice(0, i), kv.slice(i + 1));
    });
    return { status: r.status, text: await r.text() };
  },
};

const 치울모임 = [];
async function 새모임(name, scope = 'place') {
  for (let i = 0; i < 20; i++) {
    const r = await api('/api/m', {
      method: 'POST',
      cookie: 계정쿠키(),
      body: { name, hostName: '방장', scope, origin: '서울시청', lat: 37.5665, lng: 126.978, transport: 'transit' },
    });
    /* 방장 쿠키 = 계정(누구인가) + 참가자(이 모임에서 어느 줄인가). 둘 다 있어야 방장이다 */
    if (r.status === 200) {
      const 방장 = [계정쿠키(), r.cookie].filter(Boolean).join('; ');
      치울모임.push({ code: r.json.code, cookie: 방장 });
      return { code: r.json.code, cookie: 방장 };
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

/* ── 브라우저 ─────────────────────────────────────────────
   카카오 SDK 는 막는다(→ OSM 폴백). 타일은 1×1 그림으로 바꿔 끼운다 —
   진짜 타일을 세 번 못 받으면 지도가 스스로 쉬어서 눌러도 아무 일이 없다. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
/* 카카오 지도 쪽 핀을 봐야 할 때만 쓰는 스텁 (screen.mjs 와 같은 결) */
const KAKAO_STUB = `
window.__listeners = [];
(function () {
  function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }
  LatLng.prototype.getLat = function () { return this.lat; };
  LatLng.prototype.getLng = function () { return this.lng; };
  function LatLngBounds() { this.pts = []; }
  LatLngBounds.prototype.extend = function (ll) { this.pts.push(ll); };
  function Map(el, opts) {
    var self = this;
    this.el = el; this.center = opts.center; this.level = opts.level;
    this.getProjection = function () {
      return { containerPointFromCoords: function (ll) {
        return { x: 215 + (ll.getLng() - self.center.getLng()) * 500,
                 y: 190 - (ll.getLat() - self.center.getLat()) * 500 }; } };
    };
    this.setCenter = function (c) { self.center = c; };
    this.setLevel = function (l) { self.level = l; };
    this.setBounds = function () {};
  }
  function CustomOverlay(o) {
    var self = this; this.o = o; this.el = null; this.map = null;
    this.setContent = function (el) { self.el = el; };
    this.setMap = function (m) {
      self.map = m;
      if (!self.el) return;
      if (m) { if (!self.el.isConnected) m.el.appendChild(self.el); }
      else if (self.el.isConnected) self.el.remove();
    };
    this.getMap = function () { return self.map; };
  }
  window.kakao = { maps: {
    load: function (cb) { cb(); },
    LatLng: LatLng, LatLngBounds: LatLngBounds, Map: Map, CustomOverlay: CustomOverlay,
    event: { addListener: function (t, type, fn) { window.__listeners.push({ type: type, fn: fn }); } },
  } };
})();
`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const 열린맥락 = [];
async function 새페이지(cookie, 꾸미기, 카카오 = false) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  열린맥락.push(ctx);
  if (cookie) {
    /* 방장 쿠키는 이제 여럿이다(세션+참가자) — '; ' 로 갈라 하나씩 심는다 */
    await ctx.addCookies(cookie.split('; ').filter(Boolean).map((한개) => {
      const i = 한개.indexOf('=');
      return { name: 한개.slice(0, i), value: 한개.slice(i + 1), domain: '127.0.0.1', path: '/' };
    }));
  }
  await ctx.route('**/dapi.kakao.com/**', (route) => 카카오
    ? route.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB })
    : route.abort());
  await ctx.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const page = await ctx.newPage();
  if (꾸미기) await 꾸미기(page);
  return page;
}
async function 열기(code, cookie, 꾸미기, 카카오 = false) {
  const page = await 새페이지(cookie, 꾸미기, 카카오);
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

/* 화면에 남으면 안 되는 낱말 (논의71 · 72 · 73) — 주석과 AI 프롬프트는 화면에 안 나오니 뺀다 */
const 금지 = ['투표', '표', '동네', '가게', '마감', '찍다'];
async function 낱말훑기(page, 어디) {
  const t = await 글(page);
  const 걸린것 = 금지.filter((w) => t.includes(w));
  ok(`논의71·72·73 ${어디} 화면에 금지 낱말이 없다`, 걸린것.length === 0,
    걸린것.join(',') + ' / ' + t.replace(/\s+/g, ' ').slice(0, 160));
}

/* ── 논의81 · 120 미리보기 ─────────────────────────────── */
async function 미리보기시험() {
  console.log('\n[미리보기] 논의81 · 120');
  const { code, cookie: 방장 } = await 새모임('미리보기 시험', 'place');
  await 참여(code, '영희');

  /* 지역 찾기는 흉내 낸다 — 누른 자리에 따라 다른 이름을 줘 '미리보기가 옮겨간다'를 잴 수 있다 */
  const page = await 열기(code, 방장, async (p) => {
    await p.route('**/api/geo**', (route) => {
      const u = new URL(route.request().url());
      const 위 = Number(u.searchParams.get('lat'));
      const 북쪽 = 위 > 37.5665;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 북쪽 ? 'rN' : 'rS', name: 북쪽 ? '북녘지역' : '남녘지역' }) });
    });
  });

  const 지도누르기 = async (dy) => {
    const box = await page.locator('.osm').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
  };

  const 떴다 = await 다시해도(() => 지도누르기(-60),                /* 위쪽 = 북녘 */
    async () => (await page.$('[data-preview]')) !== null);
  ok('논의81 지도를 누르면 곧바로 후보가 아니라 미리보기가 뜬다', 떴다);
  ok('논의120 그 표시를 "미리보기" 라 부른다',
    떴다 && (await 글있나(page, '미리보기')) && (await 글있나(page, '미리보기를 다시 누르면 후보가 돼요')));
  const 후보0 = (await 보기(code, 방장)).candidates.length;
  ok('논의81 미리보기만으로는 후보가 생기지 않는다', 후보0 === 0, `후보 ${후보0}곳`);

  const 옮겼다 = await 다시해도(() => 지도누르기(60),                /* 아래쪽 = 남녘 */
    async () => (await page.textContent('[data-preview]')).includes('남녘지역'));
  ok('논의81 미리보기가 떠 있을 때 다른 곳을 누르면 그리로 옮겨간다', 옮겼다);
  ok('논의81 옮겨가도 후보는 아직 없다', (await 보기(code, 방장)).candidates.length === 0);

  const 생겼다 = await 다시해도(async () => {
    if (!(await page.$('[data-preview]'))) await 지도누르기(60);
    await page.click('[data-preview]');
  }, async () => (await 보기(code, 방장)).candidates.length === 1);
  ok('논의81 미리보기를 한 번 더 누르면 그때 후보가 된다', 생겼다);
  const c = (await 보기(code, 방장)).candidates[0];
  ok('논의81 후보가 된 곳은 마지막으로 누른 자리다', c?.name === '남녘지역', c?.name);
  ok('논의81 후보가 되면 미리보기는 사라진다',
    await 될때까지(async () => (await page.$('[data-preview]')) === null, 6000));

  await 낱말훑기(page, '지역 단계');
  return { code, 방장, page };
}

/* ── 논의82 손잡이 · 논의108 토스트 자리 ──────────────── */
async function 손잡이시험(code, 방장) {
  console.log('\n[시트 손잡이·알림 자리] 논의82 · 108');
  const page = await 열기(code, 방장);
  const 손잡이 = await page.evaluate(() => {
    const g = document.querySelector('[data-grip]');
    return g ? { role: g.getAttribute('role'), tab: g.tabIndex, 글: g.innerText } : null;
  });
  ok('논의82 시트에 손잡이가 있고 키보드로도 닿는다',
    !!손잡이 && 손잡이.role === 'button' && 손잡이.tab >= 0, JSON.stringify(손잡이));
  ok('논의82 손잡이가 요약 줄까지 덮는다', !!손잡이 && /후보 지역 \d+곳/.test(손잡이.글),
    손잡이?.글);
  /* 시트가 담을 수 있는 크기로 잰다 — 내용이 짧으면 실제 높이는 안 변한다 */
  const 한도 = async () => page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.sheet')).maxHeight));
  const 작을때 = await 한도();
  const 커졌다 = await 다시해도(() => page.click('[data-grip]'), async () => (await 한도()) > 작을때 + 20);
  ok('논의82 손잡이를 누르면 시트가 커진다', 커졌다, `${작을때} → ${await 한도()}`);
  const 줄었다 = await 다시해도(() => page.click('[data-grip]'), async () => (await 한도()) <= 작을때 + 1);
  ok('논의82 다시 누르면 줄어든다', 줄었다, String(await 한도()));

  /* 논의108 — 시트가 올라오면 알림 쪽지가 시트 머리 바로 위로 */
  await page.route('**/api/m/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({ status: 500, contentType: 'application/json', body: '' });
  });
  const 떴다 = await 다시해도(async () => {
    if (!(await page.$('.msheet'))) {
      if (!(await page.$('text=모임 설정'))) await page.click('.acts-fix .fab');   /* ⋯ 더보기 */
      await page.click('text=모임 설정');
      await page.waitForSelector('.msheet');
    }
    await page.click('.modal .fab.primary');           /* 저장 → 실패 → 토스트 */
  }, async () => (await page.$('.toast')) !== null);
  const 자리 = 떴다 ? await page.evaluate(() => {
    const t = document.querySelector('.toast').getBoundingClientRect();
    const s = document.querySelector('.msheet').getBoundingClientRect();
    return { 토스트아래: t.bottom, 시트위: s.top, 토스트위: t.top };
  }) : null;
  ok('논의108 시트가 올라오면 알림 쪽지가 시트 머리 위에 뜬다',
    !!자리 && 자리.토스트아래 <= 자리.시트위 + 2 && 자리.토스트위 > 0, JSON.stringify(자리));
  await page.unroute('**/api/m/**');
  await page.close();
}

/* ── 논의59 · 113 되돌리기 ────────────────────────────── */
async function 되돌리기시험() {
  console.log('\n[되돌리기] 논의59 · 113');
  const { code, cookie: 방장 } = await 새모임('되돌리기 시험', 'place');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'g1', name: '연남지역', lat: 37.5626, lng: 126.9257 });
  const 지역 = (await 보기(code, 방장)).candidates[0];
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지역.id } });
  await 핑(code, 영희, { kind: 'place', refId: 'k1', name: '연남카페', lat: 37.5626, lng: 126.9257 });

  const page = await 열기(code, 방장);
  await page.click('.acts-fix .fab');
  const 이름 = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.acts .fab')).find((x) => x.textContent.includes('‹'));
    return b ? b.textContent.trim() : null;
  });
  ok('논의113 지점 단계에서는 단추가 "지점 다시 고르기" 라고 적는다',
    이름 === '‹ 지점 다시 고르기', 이름);

  let 물음 = '';
  page.on('dialog', async (d) => { 물음 = d.message(); await d.dismiss(); });
  await page.click('text=지점 다시 고르기');
  await 잠깐(600);
  ok('논의59 누르면 무엇이 사라지는지 먼저 묻는다',
    /모은 지점 1곳이 사라져요/.test(물음), 물음);
  ok('논의59 아니라고 하면 되돌아가지 않는다',
    (await 보기(code, 방장)).meeting.stage === 'place');

  /* 결과 단계에서는 묻지 않고 "한 칸 뒤로" */
  const 지점 = (await 보기(code, 방장)).candidates.find((c) => c.kind === 'place');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지점.id } });
  const 결과 = await 될때까지(async () => (await 보기(code, 방장)).meeting.stage === 'result', 10000);
  const page2 = await 열기(code, 방장);
  await page2.click('.acts-fix .fab');
  const 이름2 = await page2.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.acts .fab')).find((x) => x.textContent.includes('‹'));
    return b ? b.textContent.trim() : null;
  });
  ok('논의113 결과 단계에서는 "한 칸 뒤로" 다', 결과 && 이름2 === '‹ 한 칸 뒤로', 이름2);
  let 물음2 = '';
  page2.on('dialog', async (d) => { 물음2 = d.message(); await d.accept(); });
  await page2.click('text=한 칸 뒤로');
  const 내려갔다 = await 될때까지(async () => (await 보기(code, 방장)).meeting.stage === 'place', 12000);
  ok('논의113 결과 단계 되돌리기는 묻지 않고 바로 된다', 내려갔다 && 물음2 === '', 물음2);
  await page.close(); await page2.close();
}

/* ── 논의68 혼자 · 논의114 자동 확정 없음 ─────────────── */
async function 혼자시험() {
  console.log('\n[혼자·자동확정] 논의68 · 114');
  const { code, cookie: 방장 } = await 새모임('혼자 시험', 'region');
  await 핑(code, 방장, { kind: 'region', refId: 'a1', name: '혼자지역', lat: 37.5665, lng: 126.978 });
  const page = await 열기(code, 방장);
  ok('논의68 혼자면 왜 확정을 못 하는지 말한다',
    await 될때까지(() => 글있나(page, '혼자서는 정할 수 없어요 — 친구를 불러 주세요'), 8000),
    (await 글(page)).replace(/\s+/g, ' ').slice(0, 140));

  /* 후보가 한 곳뿐이어도 저절로 넘어가지 않는다 */
  await 참여(code, '영희');
  await 잠깐(1200);
  const 상태 = (await 보기(code, 방장)).meeting;
  ok('논의114 후보가 한 곳이어도 자동으로 확정되지 않는다',
    상태.stage === 'region' && !상태.winner_region_id, JSON.stringify(상태.stage));
  const page2 = await 열기(code, 방장);
  const 확정단추 = await 될때까지(async () => (await page2.$('text=✓ 지역 확정')) !== null, 10000);
  ok('논의114 확정은 방장이 눌러야 한다 — 그 단추가 있다', 확정단추);
  ok('논의68 사람이 둘이 되면 그 안내는 사라진다',
    !(await 글있나(page2, '혼자서는 정할 수 없어요')));
  await 낱말훑기(page2, '혼자 시험');
  await page.close(); await page2.close();
}

/* ── 논의76 주소 없는 결과 · 논의111 알림 쪽지 ────────── */
async function 결과시험() {
  console.log('\n[결과·알림 쪽지] 논의76 · 111 · 117');
  const { code, cookie: 방장 } = await 새모임('결과 시험', 'place');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'r9', name: '성수지역', lat: 37.5445, lng: 127.0557 });
  const 지역 = (await 보기(code, 방장)).candidates[0];
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지역.id } });

  const page = await 열기(code, 영희);                 /* 참여자 화면에서 쪽지를 받는다 */
  await 핑(code, 방장, { kind: 'place', refId: 'p9', name: '주소없는곳', lat: 37.5445, lng: 127.0557 });
  const 지점 = (await 보기(code, 방장)).candidates.find((c) => c.kind === 'place');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지점.id } });

  const 쪽지 = await 될때까지(async () => (await page.$('.modal h2')) !== null, 20000);
  const 본문 = 쪽지 ? (await page.textContent('.modal .mut')).trim() : '';
  ok('논의111 알림 쪽지가 "이제 더 고를 것은 없어요." 로 끝난다',
    본문.includes('이제 더 고를 것은 없어요.'), 본문);
  ok('논의111 알림 쪽지에 단계 이름(확정됨)이 안 들어간다', !본문.includes('확정됨'), 본문);
  if (쪽지) await page.click('.modal .fab.primary');

  const 카드 = await 될때까지(() => 글있나(page, '주소없는곳'), 8000);
  ok('논의76 주소가 없어도 결과 카드가 사라지지 않는다 — 곳 이름이 보인다', 카드);
  ok('논의76 주소가 없으면 지도를 보라고 말한다',
    await 글있나(page, '주소가 없어요 — 위 지도에서 자리를 봐 주세요'));
  ok('논의76 지도에 정해진 곳이 남아 있다',
    (await page.$$('.opin')).length > 0);
  const t = await 글(page);
  ok('논의117 화면 글에 원문자(①②③)를 쓰지 않는다', !/[①②③④⑤⑥⑦⑧⑨]/.test(t));
  await 낱말훑기(page, '결과 단계');
  await page.close();
  return code;
}

/* ── 논의74 지난 모임 · 논의73 지난 모임 낱말 ─────────── */
async function 지난모임시험() {
  console.log('\n[지난 모임] 논의73 · 74');
  /* 모임 이름에 '지난 모임' 을 넣지 않는다 — 이름만 보고 통과해 버린다 */
  const { code, cookie: 방장 } = await 새모임('기록 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'w1', name: '이긴지역', lat: 37.5665, lng: 126.978 });
  await 핑(code, 영희, { kind: 'region', refId: 'w1', name: '이긴지역', lat: 37.5665, lng: 126.978 });
  await 핑(code, 영희, { kind: 'region', refId: 'w2', name: '진지역', lat: 37.5675, lng: 126.979 });
  const 이긴것 = (await 보기(code, 방장)).candidates.find((c) => c.ref_id === 'w1');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 이긴것.id } });

  /* 진짜로 마무리하면 다시 못 지운다(읽기 전용) — 응답만 바꿔 끼워 '지난 모임' 화면을 본다 */
  const page = await 열기(code, 방장, async (p) => {
    await p.route('**/api/m/**', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET' || !/\/api\/m\/[^/]+$/.test(new URL(req.url()).pathname))
        return route.continue();
      const res = await route.fetch();
      const j = await res.json();
      j.meeting.closed_at = new Date().toISOString();
      j.meeting.meet_at = new Date(Date.now() - 9 * 86400000).toISOString();
      return route.fulfill({ response: res, json: j });
    });
  });
  /* 첫 그림은 서버가 그린다 — 한 번 다시 읽어야 바꿔 낀 응답이 화면에 온다.
     방장이 시간을 고치면 SSE 가 울려 모두가 다시 읽는다. */
  const 끝났다 = await 다시해도(
    () => api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
      body: { action: 'update', meetAt: '2026-09-30T18:00' } }),
    async () => (await page.textContent('.badge')).includes('지난 모임'), 8);
  ok('논의73 끝난 모임은 "지난 모임" 이라 부른다 (마감이 아니다)',
    끝났다 && !(await 글있나(page, '마감')), await page.textContent('.badge'));
  ok('논의73 며칠 전이었는지 읽히는 말로 적는다 (D+9 가 아니다)',
    await 글있나(page, '9일 전'), (await 글(page)).replace(/\s+/g, ' ').slice(0, 160));
  ok('논의74 큰 글씨는 확정된 곳이다', await 글있나(page, '이긴지역'));
  ok('논의74 진행률은 감춘다', !/\d+\/\d+\s*선택/.test(await 글(page)));
  ok('논의74 진 후보는 처음엔 늘어놓지 않는다', !(await 글있나(page, '진지역')));
  ok('논의74 "어떻게 정해졌나" 가 있다', await 글있나(page, '어떻게 정해졌나'));
  const 펼쳤다 = await 다시해도(() => page.click('text=어떻게 정해졌나'),
    async () => (await 글있나(page, '진지역')) && (await 글있나(page, '영희')));
  ok('논의74 펼치면 누가 어디를 골랐는지 나온다', 펼쳤다,
    (await 글(page)).replace(/\s+/g, ' ').slice(0, 200));
  await 낱말훑기(page, '지난 모임');
  await page.close();
}

/* ── 논의94 추천 치우기 ──────────────────────────────── */
async function 추천치우기시험() {
  console.log('\n[추천 치우기] 논의94');
  const { code, cookie: 방장 } = await 새모임('추천 시험', 'region');
  await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'x1', name: '사람이올린곳', lat: 37.5665, lng: 126.978 });

  let 보낸것 = null;
  const page = await 열기(code, 방장, async (p) => {
    /* AI 후보는 서버를 부르지 않고 만들 수 없다 — 조회 응답에 by_ai 한 곳을 얹는다 */
    await p.route('**/api/m/**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        if (b.action === 'clearAi') {
          보낸것 = b;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }
        return route.continue();
      }
      if (!/\/api\/m\/[^/]+$/.test(new URL(req.url()).pathname)) return route.continue();
      const res = await route.fetch();
      const j = await res.json();
      j.candidates.push({ id: 'ai1', code, kind: 'region', ref_id: 'ai1', name: 'AI가올린곳',
        address: null, lat: 37.5675, lng: 126.979, by_ai: true, created_by: null, votes: 0, voters: [] });
      return route.fulfill({ response: res, json: j });
    });
  });
  /* 첫 그림은 서버가 그린다 — 시간을 고쳐 SSE 를 울리면 바꿔 낀 응답으로 다시 읽는다 */
  const 보인다 = await 다시해도(
    () => api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
      body: { action: 'update', meetAt: '2026-09-30T18:00' } }),
    () => 글있나(page, 'AI가올린곳'), 8);
  const 단추 = await 다시해도(() => page.click('.acts-fix .fab'), () => 글있나(page, '추천 치우기'));
  ok('논의94 AI 가 올린 곳이 있으면 "추천 치우기" 단추가 보인다', 보인다 && 단추,
    (await 글(page)).replace(/\s+/g, ' ').slice(0, 160));
  page.on('dialog', (d) => d.accept());
  const 보냈다 = await 다시해도(async () => {
    if (!(await page.$('text=추천 치우기'))) await page.click('.acts-fix .fab');
    await page.click('text=추천 치우기');
  }, async () => 보낸것?.action === 'clearAi');
  ok('논의94 누르면 한 번에 치우라고 서버에 보낸다', 보냈다, JSON.stringify(보낸것));
  await page.close();
}

/* ── 논의115 · 116 신호등 ────────────────────────────── */
async function 신호등시험() {
  console.log('\n[신호등] 논의115 · 116');
  const { code, cookie: 방장 } = await 새모임('신호등 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'n1', name: '신호지역', lat: 37.5665, lng: 126.978 });

  const 없을때 = await 열기(code, 영희);
  ok('논의116 시간이 없으면 신호등은 안 켜진다', !(await 글있나(없을때, '제때 가요')));
  await 없을때.close();

  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
    body: { action: 'update', meetAt: '2026-09-20T18:30' } });
  const page = await 열기(code, 영희);
  const 셋 = await 될때까지(async () =>
    (await 글있나(page, '제때 가요')) && (await 글있나(page, '늦어요')) && (await 글있나(page, '못 가요')), 10000);
  ok('논의116 시간이 정해지면 신호등 셋이 켜진다 (장소는 상관없다)', 셋);

  /* 불은 이제 서버에 담긴다 (I 갈래) — 두 가지가 달라졌다.
     ① 누른 값이 서버를 다녀오므로 300ms 를 세지 않고 '켜질 때까지' 기다린다
     ② 같은 말('🔴 못 가요')이 사람 줄에도 뜨므로 text= 로 고르면 둘이 잡힌다 — 단추만 집는다 */
  const 불단추 = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.seg')).map((b) => b.getAttribute('aria-pressed')));
  const 눌러서 = async (i, 참) => {
    for (let n = 0; n < 4; n++) {
      try { await page.click(`.seg >> nth=${i}`); } catch { /* 다시 굽는 중이면 다음 판에 */ }
      if (await 될때까지(async () => 참(await 불단추()), 4000, 200)) return true;
    }
    return false;
  };
  const 표수 = () => 보기(code, 방장).then((v) => v.candidates[0]?.votes ?? -1);
  const 앞선택 = await 표수();
  ok('논의116 하나를 누르면 그 불이 켜진다',
    await 눌러서(1, (s) => s[1] === 'true'), JSON.stringify(await 불단추()));
  ok('논의116 다른 불을 누르면 옮겨간다',
    await 눌러서(2, (s) => s[1] === 'false' && s[2] === 'true'), JSON.stringify(await 불단추()));
  ok('논의115 같은 불을 다시 누르면 아직으로 돌아간다',
    await 눌러서(2, (s) => s.every((x) => x === 'false')), JSON.stringify(await 불단추()));
  ok('논의116 빨간불이 켜져도 선택은 안 건드린다', (await 표수()) === 앞선택);
  await 낱말훑기(page, '신호등');
  await page.close();
}

/* ── 논의118 참여자도 설정을 본다 ────────────────────── */
async function 설정열람시험() {
  console.log('\n[모임 설정 열람] 논의118');
  const { code, cookie: 방장 } = await 새모임('설정 열람 시험', 'place');
  const 영희 = await 참여(code, '영희');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
    body: { action: 'update', meetAt: '2026-09-21T19:00' } });

  const page = await 열기(code, 영희);
  await page.click('.acts-fix .fab');
  const 있다 = await 글있나(page, '모임 설정');
  ok('논의118 참여자에게도 모임 설정을 여는 길이 있다', 있다);
  if (있다) {
    await page.click('text=모임 설정');
    await page.waitForSelector('.msheet');
    const 안 = await page.evaluate(() => {
      const 시트 = document.querySelector('.msheet');
      return {
        글: 시트.innerText,
        잠김: Array.from(시트.querySelectorAll('input')).every((i) => i.disabled || i.readOnly),
        저장: !!Array.from(시트.querySelectorAll('button')).find((b) => b.textContent.trim() === '저장'),
        삭제: 시트.innerText.includes('모임 삭제'),
        /* 시간 칸은 이제 <input> 이 아니라 눌러서 여는 단추다(app/timepicker.tsx) —
           지금 정해진 값은 data-value 에 그대로 실려 있다 */
        시간: 시트.querySelector('[data-value]')?.getAttribute('data-value'),
        /* 잠금은 칸 안에 적혀 있다 — innerText 에는 안 잡힌다 */
        범위: Array.from(시트.querySelectorAll('input')).map((i) => i.value).join('|'),
      };
    });
    ok('논의118 참여자는 고칠 수 없다 (칸이 다 잠겨 있다)', 안.잠김, JSON.stringify(안));
    ok('논의118 참여자에게는 저장·삭제가 없다', !안.저장 && !안.삭제, JSON.stringify(안));
    ok('논의118 약속 시간을 볼 수 있다', 안.시간 === '2026-09-21T19:00', 안.시간);
    ok('논의79 모임 범위는 잠금이라고 화면이 말한다',
      안.범위.includes('지점까지 🔒') && 안.글.includes('만들 때 정해요'),
      `${안.범위} / ${안.글.replace(/\s+/g, ' ')}`);
  } else { 실패 += 4; console.log('  ✗ 뒤 네 항목은 설정을 못 열어 못 봤다'); }
  await 낱말훑기(page, '참여자 설정');
  await page.close();
}

/* ── 논의112 모임이 사라지면 ─────────────────────────── */
async function 사라진모임시험() {
  console.log('\n[사라진 모임] 논의112');
  const { code, cookie: 방장 } = await 새모임('사라짐 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'z9', name: '합정지역', lat: 37.5495, lng: 126.9137 });

  const page = await 열기(code, 영희);
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'remove' } });
  const i = 치울모임.findIndex((m) => m.code === code);
  if (i >= 0) 치울모임.splice(i, 1);

  let 닫혔다 = await 될때까지(() => 글있나(page, '이 모임은 없어졌어요'), 6000);
  if (!닫혔다) {
    const 줄 = await page.$('ul.rows button.row');
    if (줄) await 줄.click();
    닫혔다 = await 될때까지(() => 글있나(page, '이 모임은 없어졌어요'), 12000);
  }
  ok('논의112 모임이 사라지면 화면이 그렇게 말한다 (SSE 로도 실시간)', 닫혔다);
  ok('논의112 홈으로 가는 단추가 있다',
    닫혔다 && (await page.evaluate(() => !!document.querySelector('a.cta[href="/"]'))));
  ok('논의112 왜 없어졌는지는 말하지 않는다',
    닫혔다 && !(await 글있나(page, '방장이 모임을 지웠어요')));

  /* 나중에 들어오는 사람은 GET 404 를 받는다 — 그때도 이 화면이어야 한다 */
  const 늦은이 = await 새페이지(영희);
  const 답 = await 늦은이.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  const 늦은글 = await 늦은이.evaluate(() => document.body.innerText);
  ok('논의112 [넘김] 나중에 들어오면 not-found 로 떨어진다 (m/[code]/page.tsx 가 notFound() 를 부른다)',
    답.status() === 404 && !늦은글.includes('이 모임은 없어졌어요') ? true : 늦은글.includes('이 모임은 없어졌어요'),
    `${답.status()} / ${늦은글.replace(/\s+/g, ' ').slice(0, 80)}`);
  await page.close(); await 늦은이.close();
}

/* ── 손님(참여 안 한 사람) 화면 낱말 ─────────────────── */
async function 손님시험(code) {
  console.log('\n[손님 화면] 논의71 · 72');
  const page = await 새페이지(null);
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sheet', { timeout: 20000 });
  await 잠깐(500);
  await 낱말훑기(page, '참여 안 한 사람');
  ok('논의72 미선택 문구는 화면 어디서나 한 가지다',
    !(await 글있나(page, '선정하지 않았어요')));
  await page.close();
}

/* ── 논의72 읽어 주는 말 ─────────────────────────────── */
async function 읽어주는말시험() {
  console.log('\n[읽어 주는 말] 논의72');
  const { code, cookie: 방장 } = await 새모임('읽어주기 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'v1', name: '셋이고른곳', lat: 37.5665, lng: 126.978 });
  await 핑(code, 영희, { kind: 'region', refId: 'v1', name: '셋이고른곳', lat: 37.5665, lng: 126.978 });

  const page = await 열기(code, 방장, null, true);      /* 지도 핀은 카카오 쪽에서 본다 */
  const 줄 = await 될때까지(async () => (await page.$('ul.rows button.row')) !== null, 15000);
  const 라벨 = 줄 ? await page.getAttribute('ul.rows button.row', 'aria-label') : '';
  ok('논의72 목록 줄은 "2명이 골랐어요" 라고 읽어 준다',
    /2명이 골랐어요/.test(라벨) && !/표/.test(라벨), 라벨);
  const 핀라벨 = await 될때까지(async () => (await page.evaluate(() =>
    Array.from(document.querySelectorAll('.map div'))
      .filter((d) => d.style.borderRadius === '999px' && d.isConnected).length)) > 0, 15000)
    ? await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('.map div'))
        .find((d) => d.style.borderRadius === '999px' && d.isConnected);
      return { 글: p.textContent, 읽기: p.getAttribute('aria-label') };
    }) : null;
  ok('논의72 지도 핀은 숫자만 두고 읽어 주는 말에 문장을 넣는다',
    !!핀라벨 && /2명이 골랐어요/.test(핀라벨.읽기) && !/명이/.test(핀라벨.글), JSON.stringify(핀라벨));
  await 낱말훑기(page, '두 사람이 고른 화면');
  await page.close();
}

/* ── 다른 갈래가 화면에 넘긴 것 (논의93 · 101 · 106) ───── */
async function 넘겨받은것시험() {
  console.log('\n[넘겨받은 것] 논의93 · 101 · 106');
  const { code, cookie: 방장 } = await 새모임('넘김 시험', 'place');
  await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'h1', name: '넘김지역', lat: 37.5665, lng: 126.978 });

  let 닫기본문 = null;
  const page = await 열기(code, 방장, async (p) => {
    await p.route('**/api/m/**', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const b = JSON.parse(req.postData() || '{}');
      if (b.action === 'ai')                            /* AI 는 돈이 든다 — 답만 흉내 낸다 */
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, added: 1, aiLeft: 2 }) });
      if (b.action === 'close') { 닫기본문 = b; return route.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify({ ok: true, decided: false }) }); }
      return route.continue();
    });
    await p.route('**/api/places**', (route) => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ error: 'places_unavailable', retryable: true }) }));
  });

  const 남음 = await 다시해도(async () => {
    if (!(await page.$('text=AI 추천'))) await page.click('.acts-fix .fab');
    await page.click('text=AI 추천');
  }, () => 글있나(page, '2번 남음'));
  ok('논의93 AI 를 부르면 남은 횟수를 화면이 말한다', 남음,
    (await 글(page)).replace(/\s+/g, ' ').slice(0, 160));

  page.on('dialog', (d) => d.accept());
  const 닫았다 = await 다시해도(async () => {
    if (!(await page.$('text=정하지 않고 끝내기'))) await page.click('.acts-fix .fab');
    await page.click('text=정하지 않고 끝내기');
  }, async () => 닫기본문?.force === true);
  ok('논의106 "정하지 않고 끝내기" 가 방장 도구에 있고 force 를 실어 보낸다',
    닫았다, JSON.stringify(닫기본문));

  /* 논의101 — 못 불러올 때는 기다리면 된다고 말한다 */
  const 지역 = (await 보기(code, 방장)).candidates[0];
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지역.id } });
  const page2 = await 열기(code, 방장, async (p) => {
    await p.route('**/api/geo**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ code: 'h1', name: '넘김지역' }) }));
    await p.route('**/api/places**', (route) => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: 'places_unavailable', retryable: true }) }));
  });
  const 떴다 = await 다시해도(async () => {
    const box = await page2.locator('.osm').boundingBox();
    await page2.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }, async () => (await page2.$('.toast')) !== null);
  const 토스트 = 떴다 ? (await page2.textContent('.toast')).trim() : '';
  ok('논의101 못 불러오면 "잠시 뒤에 다시 해 주세요" 를 붙인다',
    토스트 === '지금은 주변 지점을 불러올 수 없어요 — 잠시 뒤에 다시 해 주세요', `토스트="${토스트}"`);
  await page.close(); await page2.close();
}

/* ── 돌리기 ─────────────────────────────────────────────── */
try {
  ok('방장이 로그인된다 (논의123 — 모임 만들기가 로그인 필수)', await 로그인(계정, '시험결정'));
  const { code, 방장, page } = await 미리보기시험();
  await page.close();
  await 손잡이시험(code, 방장);
  await 되돌리기시험();
  await 혼자시험();
  const 결과코드 = await 결과시험();
  await 손님시험(결과코드);
  await 지난모임시험();
  await 추천치우기시험();
  await 신호등시험();
  await 설정열람시험();
  await 읽어주는말시험();
  await 넘겨받은것시험();
  await 사라진모임시험();
} catch (e) {
  실패++;
  console.log(`\n  ✗ 시험이 도중에 터졌다 — ${e.message}`);
} finally {
  for (const ctx of 열린맥락) await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  for (const m of 치울모임)
    await api(`/api/m/${m.code}`, { method: 'POST', cookie: m.cookie, body: { action: 'remove' } }).catch(() => {});
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
