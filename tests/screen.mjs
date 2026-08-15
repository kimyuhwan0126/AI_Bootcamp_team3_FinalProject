/* 모임 화면(app/m/[code]/ui.tsx) 회귀 시험.
   A10 뭉침 복구 · A16 지워진 모임 · A32 시트 겹침 · A34 못 찍는 사람의 핀 ·
   A47 빈 500 · A48 번역 안 된 코드 · A50 조사 · A51 초점 · A52 Esc ·
   A53 이름 펼치기 · A55 끝난 뒤 진행률 · A56 0표 후보 지우기 · A58 마무리 뒤 승인 줄.

   node tests/screen.mjs — 개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   카카오 SDK 는 스텁으로 바꿔 끼운다. 진짜 SDK 를 부르면 이 PC 주소가 콘솔에 없어
   지도가 죽고(OSM 으로 넘어가고) 카카오 쪽 결함을 아예 못 만난다. */
import { createRequire } from 'node:module';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FAILED = '잠시 문제가 생겼어요 — 다시 해 주세요';

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
/* 개발 서버가 다시 굽는 중이면 잠깐 500 이 난다 — 조건이 설 때까지 기다린다 */
async function 될때까지(fn, ms = 8000, 간격 = 250) {
  const 끝 = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch { /* 다시 */ }
    if (Date.now() > 끝) return false;
    await 잠깐(간격);
  }
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

/* ── 방장 세션 ────────────────────────────────────────────
   모임 만들기는 로그인 필수다 (논의123). 게다가 방장 줄에 계정이 박히면
   참가자 쿠키만으로는 방장이 아니다 (논의124) — 방장 도구를 그리는 화면에도,
   confirm·update·remove 같은 방장 전용 부름에도 세션 쿠키가 함께 가야 한다.
   참여(join)는 로그인이 필요 없어 영희 쪽은 그대로다. */
const 세션항아리 = new Map();
const 세션쿠키 = () => [...세션항아리].map(([k, v]) => `${k}=${v}`).join('; ');
async function 세션call(path, init = {}) {
  const c = 세션쿠키();
  const r = await fetch(BASE + path, { ...init, headers: { ...(c ? { cookie: c } : {}), ...(init.headers || {}) } });
  (r.headers.getSetCookie?.() ?? []).forEach((s) => {
    const [kv] = s.split(';');
    const i = kv.indexOf('=');
    세션항아리.set(kv.slice(0, i), kv.slice(i + 1));
  });
  return { status: r.status, text: await r.text() };
}
let 로그인해뒀다 = false;
async function 방장로그인() {
  if (로그인해뒀다) return;
  if (!(await 로그인({ call: 세션call }, '시험화면'))) throw new Error('시험용 로그인이 안 됐다');
  로그인해뒀다 = true;
}

const 치울모임 = [];
async function 새모임(name, scope = 'place') {
  await 방장로그인();
  const r = await api('/api/m', {
    method: 'POST',
    cookie: 세션쿠키(),
    body: { name, hostName: '방장', scope, origin: '서울시청', lat: 37.5665, lng: 126.978, transport: 'transit' },
  });
  if (r.status !== 200) throw new Error(`모임 만들기 실패 ${r.status}`);
  /* 방장 쿠키 = 참가자 쿠키 + 세션 쿠키. 둘이 함께여야 방장으로 쳐 준다 (논의124) */
  const cookie = [r.cookie, 세션쿠키()].filter(Boolean).join('; ');
  치울모임.push({ code: r.json.code, cookie });
  return { code: r.json.code, cookie };
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

/* ── 카카오 SDK 스텁 ──────────────────────────────────────
   화면 좌표는 __zoom(도 → px)으로 만든다. 테스트가 __zoom 을 키우고 idle 을 쏘면
   진짜 확대와 같은 일이 layout() 안에서 벌어진다. */
const KAKAO_STUB = `
window.__zoom = 500; window.__listeners = [];
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
        return { x: 215 + (ll.getLng() - self.center.getLng()) * window.__zoom,
                 y: 190 - (ll.getLat() - self.center.getLat()) * window.__zoom }; } };
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
  window.__fire = function (type) {
    window.__listeners.filter(function (l) { return l.type === type; })
      .forEach(function (l) { l.fn({}); });
  };
})();
`;

/* ── 브라우저 ─────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const 열린맥락 = [];
async function 새페이지(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  열린맥락.push(ctx);
  if (cookie) {
    /* '이름=값; 이름=값' 한 줄이 올 수 있다 — 방장은 참가자 쿠키와 세션 쿠키를 함께 든다 */
    await ctx.addCookies(cookie.split('; ').filter(Boolean).map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: c.slice(i + 1), domain: '127.0.0.1', path: '/' };
    }));
  }
  await ctx.route('**/dapi.kakao.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB }));
  const page = await ctx.newPage();
  return page;
}
/* 서버가 그린 그림에는 손잡이가 아직 안 달려 있다 — 눌러도 아무 일이 없는 동안
   시험이 먼저 눌러 버리면 결함이 없어도 빨간불이 켜진다.
   모임 이름 펼치기는 화면만의 상태라 이게 되면 손잡이가 다 달린 것이다. */
async function 수화대기(page) {
  await page.waitForSelector('.hd h1', { timeout: 15000 });
  const 됐다 = await 될때까지(async () => {
    await page.click('.hd h1');
    return page.evaluate(() => document.querySelector('.hd h1').classList.contains('open'));
  }, 15000, 200);
  if (됐다) await page.click('.hd h1');            /* 다시 접는다 */
  return 됐다;
}
async function 열기(code, cookie) {
  const page = await 새페이지(cookie);
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sheet', { timeout: 15000 });
  await 수화대기(page);
  return page;
}
/* 지도 위 이름표 — 인라인 border-radius:999px 로 가려낸다 */
const 이름표 = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.map div'))
    .filter((d) => d.style.borderRadius === '999px' && d.isConnected)
    .map((d) => d.textContent));
const 모달수 = (page) => page.evaluate(() => document.querySelectorAll('.modal').length);
const 글있나 = (page, s) => page.evaluate((t) => document.body.innerText.includes(t), s);

/* ── A10 · A32 · A34 · A52 · A53 : 지역 후보 3곳짜리 모임 ── */
async function 지도시험() {
  console.log('\n[지도·시트] A10 · A32 · A34 · A52 · A53');
  const { code, cookie: 방장 } = await 새모임('지도 시험', 'place');
  await 참여(code, '영희');
  for (let i = 0; i < 3; i++)
    await 핑(code, 방장, { kind: 'region', refId: `r${i}`, name: ['가동', '나동', '다동'][i],
      lat: 37.5665, lng: 126.978 + i * 0.01 });

  const page = await 열기(code, 방장);
  await 될때까지(async () => (await 이름표(page)).length > 0);

  /* A10 — 뭉쳤다가 확대하면 풀려야 한다 */
  let 표 = await 이름표(page);
  ok('A10 준비: 가까운 지역 셋이 하나로 뭉친다',
    표.length === 1 && 표[0].startsWith('이 근처 3곳'), JSON.stringify(표));
  await page.evaluate(() => { window.__zoom = 20000; window.__fire('idle'); });
  await 잠깐(300);
  표 = await 이름표(page);
  ok('A10 확대하면 뭉침이 풀리고 원래 이름표가 돌아온다',
    표.length === 3 && !표.some((t) => t.includes('이 근처'))
      && ['가동', '나동', '다동'].every((n) => 표.some((t) => t.startsWith(n))),
    JSON.stringify(표));

  /* A32 ① — 새 시트를 열면 앞 시트가 닫힌다 */
  await page.evaluate(() => { window.__zoom = 500; window.__fire('idle'); });
  await 잠깐(200);
  await page.click('.dial-toggle');                          /* ⋯ 더보기 — 스피드다이얼 */
  await page.click('text=모임 설정');
  await page.waitForSelector('.modal');
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.map div'))
      .find((d) => (d.textContent || '').startsWith('이 근처'));
    el.click();
  });
  await 잠깐(300);
  ok('A32 ① 뭉침 시트를 열면 모임 설정 시트가 닫힌다', (await 모달수(page)) === 1,
    `열린 시트 ${await 모달수(page)}개`);

  /* A52 — Esc 로 닫힌다 (뭉침 시트 · 모임 설정 두 종) */
  await page.keyboard.press('Escape');
  await 잠깐(200);
  ok('A52 Esc 로 뭉침 시트가 닫힌다', (await 모달수(page)) === 0);
  await page.click('text=모임 설정');
  await page.waitForSelector('.modal');
  await page.keyboard.press('Escape');
  await 잠깐(200);
  ok('A52 Esc 로 모임 설정 시트가 닫힌다', (await 모달수(page)) === 0);

  /* A53 — 모임 이름 펼치기가 키보드로 닿는다 */
  const h1 = await page.evaluate(() => {
    const e = document.querySelector('.hd h1');
    return { tab: e.tabIndex, role: e.getAttribute('role') };
  });
  ok('A53 모임 이름이 Tab 순회에 잡힌다', h1.tab >= 0 && h1.role === 'button', JSON.stringify(h1));
  await page.focus('.hd h1');
  await page.keyboard.press('Enter');
  await 잠깐(150);
  ok('A53 Enter 로 이름이 펼쳐진다',
    await page.evaluate(() => document.querySelector('.hd h1').classList.contains('open')));

  /* A32 ② — 단계가 바뀌면 열려 있던 시트가 닫힌다 */
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.map div'))
      .find((d) => (d.textContent || '').startsWith('이 근처'));
    el.click();
  });
  await 잠깐(300);
  const 열렸나 = (await 모달수(page)) === 1;
  const 후보 = (await api(`/api/m/${code}`, { cookie: 방장 })).json.candidates;
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장,
    body: { action: 'confirm', candidateId: 후보[0].id } });
  const 닫혔다 = await 될때까지(async () => (await 모달수(page)) === 0, 12000);
  ok('A32 ② 단계가 바뀌면 낡은 시트가 닫힌다', 열렸나 && 닫혔다,
    열렸나 ? '단계가 바뀌어도 시트가 남았다' : '시트를 못 열었다');

  /* A34 — 못 찍는 사람(참여 안 한 사람)에게는 핀이 안 눌린다 */
  const 손님 = await 열기(code, null);
  await 될때까지(async () => (await 이름표(손님)).length > 0);
  const 붙었나 = await 손님.evaluate(() => Array.from(document.querySelectorAll('.map div'))
    .filter((d) => d.style.borderRadius === '999px')
    .some((d) => typeof d.onclick === 'function'));
  await 손님.evaluate(() => {
    const 핀들 = Array.from(document.querySelectorAll('.map div'))
      .filter((d) => d.style.borderRadius === '999px');
    핀들.forEach((d) => d.click());
  });
  await 잠깐(1200);
  const 토스트 = await 손님.evaluate(() => document.querySelectorAll('.toast').length);
  ok('A34 참여 안 한 사람의 지도 핀은 눌려도 아무 일이 없다',
    !붙었나 && 토스트 === 0 && (await 모달수(손님)) === 0,
    `클릭 붙음=${붙었나} 토스트=${토스트}`);
}

/* ── A47 · A48 · A51 : 오류 문구와 초점 ── */
async function 오류시험() {
  console.log('\n[오류 문구·초점] A47 · A48 · A51');
  const { code, cookie: 방장 } = await 새모임('오류 시험', 'place');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'q1', name: '성수동', lat: 37.5445, lng: 127.0557 });

  const page = await 열기(code, 영희);
  await page.waitForSelector('ul.rows button.row');
  let 답 = { status: 500, body: '' };
  await page.route('**/api/m/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({ status: 답.status, contentType: 'application/json', body: 답.body });
  });

  const 토스트글 = async () => {
    await page.click('ul.rows button.row');
    const 보임 = await 될때까지(async () => (await page.$('.toast')) !== null, 6000);
    return 보임 ? (await page.textContent('.toast')).trim() : '';
  };
  const 토스트꺼짐 = () => 될때까지(async () => (await page.$('.toast')) === null, 6000);

  답 = { status: 500, body: '' };
  let t = await 토스트글();
  ok('A47 500(빈 본문)에도 화면에 문구가 뜬다', t === FAILED, `토스트="${t}"`);
  await 토스트꺼짐();

  답 = { status: 500, body: '<html>서버 오류</html>' };
  t = await 토스트글();
  ok('A47 JSON 이 아닌 본문에도 문구가 뜬다', t === FAILED, `토스트="${t}"`);
  await 토스트꺼짐();

  답 = { status: 400, body: JSON.stringify({ error: 'zzz_no_such_code' }) };
  t = await 토스트글();
  ok('A48 번역표에 없는 코드는 영문 그대로 안 나간다',
    t === FAILED && !t.includes('zzz'), `토스트="${t}"`);
  await 토스트꺼짐();

  /* 논의125 로 '방장 넘기기'가 통째로 없어졌다 — 서버는 host_must_handover 를 이제 안 낸다
     (route.ts 가 '함께 사라진 오류 코드'로 적어 두었고, 번역표에서도 빠졌다).
     그 자리를 대신하는 409 는 방장이 나가려 할 때의 host_cannot_leave 다.
     보는 뜻은 그대로다 — 서버가 정말 내는 409 코드가 한국어로 나오는가. */
  답 = { status: 409, body: JSON.stringify({ error: 'host_cannot_leave' }) };
  t = await 토스트글();
  ok('A48 서버가 내는 host_cannot_leave 가 한국어로 나온다',
    t === '방장은 모임에서 나갈 수 없어요 — 모임을 지워 주세요', `토스트="${t}"`);
  await 토스트꺼짐();

  답 = { status: 400, body: JSON.stringify({ error: 'pin_required' }) };
  t = await 토스트글();
  ok('A48 서버가 내는 pin_required 가 한국어로 나온다',
    t === 'PIN 네 자리를 적어주세요', `토스트="${t}"`);
  await page.unroute('**/api/m/**');

  /* A51 — Enter 로 선정해도 초점이 그 줄에 남는다 */
  const page2 = await 열기(code, 영희);
  await page2.waitForSelector('ul.rows button.row');
  await page2.focus('ul.rows button.row');
  await page2.keyboard.press('Enter');
  const 반영 = await 될때까지(async () =>
    (await page2.$('ul.rows button.row[aria-pressed="true"]')) !== null, 10000);
  await 잠깐(300);
  const 초점 = await page2.evaluate(() => {
    const a = document.activeElement;
    return { tag: a.tagName, cls: a.className, pressed: a.getAttribute('aria-pressed') };
  });
  ok('A51 Enter 로 선정해도 초점이 그 줄에 남는다',
    반영 && 초점.tag === 'BUTTON' && 초점.cls.includes('row'), JSON.stringify(초점));
}

/* ── A50 : 조사·띄어쓰기 ── */
async function 조사시험() {
  console.log('\n[말투] A50');
  const { code, cookie: 방장 } = await 새모임('조사 시험', 'place');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'g1', name: '연남동', lat: 37.5626, lng: 126.9257 });
  const c1 = (await api(`/api/m/${code}`, { cookie: 방장 })).json.candidates[0];
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: c1.id } });

  const page = await 열기(code, 영희);           /* 지점 단계에서 연다 */
  await page.waitForSelector('.sheet');
  await 핑(code, 방장, { kind: 'place', refId: 'k1', name: '메가커피', lat: 37.5626, lng: 126.9257 });
  const 지점 = (await api(`/api/m/${code}`, { cookie: 방장 })).json.candidates.find((c) => c.kind === 'place');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'confirm', candidateId: 지점.id } });

  const 떴다 = await 될때까지(async () => (await page.$('.modal h2')) !== null, 15000);
  const h2 = 떴다 ? (await page.textContent('.modal h2')).trim() : '';
  const 본문 = 떴다 ? (await page.textContent('.modal .mut')).trim() : '';
  ok('A50 받침 없는 이름에는 "로" 가 붙는다', h2 === '방장이 메가커피로 정했어요', `h2="${h2}"`);
  /* 논의111 로 문구가 바뀌었다 — 알림 쪽지에서 단계 이름('확정됨')을 뺀다.
     'X이에요/예요' 를 붙여 쓰는지 보던 시험은 그 문장이 사라져 여기서 볼 수 없다
     (조사 붙이기는 위 h2 의 '메가커피로' 가 계속 지킨다). */
  ok('A50/논의111 알림 쪽지에 단계 이름이 안 들어간다',
    !본문.includes('확정됨'), `본문="${본문}"`);
  ok('논의111 대신 무엇을 하면 되는지 말한다',
    본문.includes('이제 더 고를 것은 없어요.'), `본문="${본문}"`);
  ok('A50 결과 단계 모달에 "지점을 골라 주세요" 가 안 남는다',
    !본문.includes('지점을 골라 주세요'), `본문="${본문}"`);
}

/* ── A55 · A58 : 끝난 모임 화면 ──
   진짜로 마무리하면 그 모임은 다시 못 지운다(마무리는 읽기 전용, B1) —
   시험이 지울 수 없는 모임을 쌓지 않게 응답만 바꿔 끼운다. */
async function 끝난모임시험() {
  console.log('\n[끝난 모임] A55 · A58');
  const { code, cookie: 방장 } = await 새모임('끝난 모임 시험', 'region');
  await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 's1', name: '성수동', lat: 37.5445, lng: 127.0557 });

  let 마무리 = false;
  const page = await 새페이지(방장);
  await page.route('**/api/m/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || !/\/api\/m\/[^/]+$/.test(new URL(req.url()).pathname))
      return route.continue();
    const res = await route.fetch();
    const j = await res.json();
    j.participants.push({ id: 'pnd1', code, user_id: null, name: '민준', origin_name: '서울역',
      lat: null, lng: null, transport: 'transit', state: 'pending',
      requested_at: new Date().toISOString() });
    if (마무리) j.meeting.closed_at = new Date().toISOString();
    return route.fulfill({ response: res, json: j });
  });
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('ul.rows button.row');
  await 수화대기(page);

  /* 첫 그림은 서버가 그린다 — 한 번 다시 읽어야 바꿔 낀 응답이 화면에 온다.
     후보 줄을 누르면 표가 빠지면서 후보까지 사라진다 — 설정 저장으로 다시 읽힌다. */
  const 다시읽기 = async () => {
    if (!(await page.$('text=모임 설정'))) await page.click('.dial-toggle');
    await page.click('text=모임 설정');
    await page.waitForSelector('.modal');
    await page.click('.modal .fab.primary');
    await 될때까지(async () => (await 모달수(page)) === 0, 10000);
  };
  await 다시읽기();
  const 대기줄 = await 될때까지(() => 글있나(page, '다시 들어오려 해요'), 10000);
  ok('A58 준비: 진행 중인 모임에는 승인 대기 줄이 보인다', 대기줄);

  마무리 = true;
  await 다시읽기();
  const 끝났다 = await 될때까지(() => 글있나(page, '지난 모임'), 10000);
  ok('A55/A58 준비: 마무리된 화면으로 바뀐다', 끝났다);
  ok('A58 마무리한 모임에는 승인 대기 줄이 안 뜬다', !(await 글있나(page, '다시 들어오려 해요')));
  const 시트 = await page.textContent('.sheet');
  /* 진행률 낱말이 '선정' → '선택' 으로 바뀌었다 (논의72) */
  ok('A55 마무리 뒤에는 시트에 진행률이 안 남는다', !/\d+\/\d+\s*(선택|선정)/.test(시트),
    시트.replace(/\s+/g, ' ').slice(0, 120));
}

/* ── A56 : 마지막 선택이 빠지면 후보도 사라진다 (논의50) ──
   전에는 0표 후보가 목록에 남아 '올린 사람이 지우는 ✕' 가 필요했다.
   논의50 으로 후보가 서버에서 함께 사라지므로 그 단추도 화면에서 없앴다 —
   시험도 새 규칙을 지킨다: 마지막 선택을 빼면 줄이 통째로 사라져야 한다. */
async function 빈후보시험() {
  console.log('\n[0표 후보] A56 → 논의50');
  const { code, cookie: 방장 } = await 새모임('0표 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 영희, { kind: 'region', refId: 'z1', name: '망원지역', lat: 37.5561, lng: 126.9026 });
  const c = (await api(`/api/m/${code}`, { cookie: 방장 })).json.candidates[0];

  const page = await 열기(code, 영희);
  await page.waitForSelector('ul.rows button.row');
  ok('논의50 준비: 내가 고른 후보가 화면에 있다', await 글있나(page, '망원지역'));

  /* 화면에서 다시 눌러 내 선택을 뺀다 — 마지막 선택이라 후보째 사라진다 */
  await page.click('ul.rows button.row');
  const 사라졌다 = await 될때까지(async () => !(await 글있나(page, '망원지역')), 12000);
  ok('논의50 마지막 선택을 빼면 화면에서도 후보가 사라진다', 사라졌다);
  const 끝 = (await api(`/api/m/${code}`, { cookie: 방장 })).json.candidates;
  ok('논의50 서버에서도 후보가 지워졌다', 끝.length === 0, JSON.stringify(끝.map((x) => x.name)));
  ok('논의50 0표 후보를 지우는 ✕ 단추는 이제 없다',
    !(await page.$('button[aria-label*="지우기"]')), String(c?.id));
}

/* ── A16 : 모임이 지워지면 화면이 닫힌다 ── */
async function 삭제시험() {
  console.log('\n[지워진 모임] A16');
  const { code, cookie: 방장 } = await 새모임('삭제 시험', 'region');
  const 영희 = await 참여(code, '영희');
  await 핑(code, 방장, { kind: 'region', refId: 'd1', name: '합정동', lat: 37.5495, lng: 126.9137 });

  const page = await 열기(code, 영희);
  await page.waitForSelector('ul.rows button.row');
  await api(`/api/m/${code}`, { method: 'POST', cookie: 방장, body: { action: 'remove' } });
  치울모임.splice(치울모임.findIndex((m) => m.code === code), 1);

  /* 실시간으로 밀려 오면 그대로, 아니면 아무 손짓 한 번에 드러나야 한다 */
  let 닫혔다 = await 될때까지(() => 글있나(page, '이 모임은 없어졌어요'), 4000);
  if (!닫혔다) {
    const 줄 = await page.$('ul.rows button.row');
    if (줄) await 줄.click();
    닫혔다 = await 될때까지(() => 글있나(page, '이 모임은 없어졌어요'), 10000);
  }
  ok('A16 모임이 지워지면 화면이 사라졌다고 말한다', 닫혔다);
  ok('A16 홈으로 갈 길이 있다',
    닫혔다 && (await page.evaluate(() => !!document.querySelector('a.cta[href="/"]'))));
}

/* ── 돌리기 ─────────────────────────────────────────────── */
try {
  await 지도시험();
  await 오류시험();
  await 조사시험();
  await 끝난모임시험();
  await 빈후보시험();
  await 삭제시험();
} catch (e) {
  실패++;
  console.log(`\n  ✗ 시험이 도중에 터졌다 — ${e.message}`);
} finally {
  for (const ctx of 열린맥락) await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  /* 내가 만든 모임만 치운다 */
  for (const m of 치울모임) await api(`/api/m/${m.code}`, { method: 'POST', cookie: m.cookie, body: { action: 'remove' } }).catch(() => {});
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
