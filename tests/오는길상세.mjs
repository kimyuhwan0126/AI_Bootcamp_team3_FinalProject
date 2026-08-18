/* 모임 결과 화면 '오는 길' 펼치기·구간별 안내 회귀 시험 (2026-08-23, 사용자 요청 —
   "홈화면처럼 펼쳐서 자세히 보기 구간별 안내를 모임 결과에도 적용시켜줘").

   전에는 모임 결과 화면의 '오는 길' 목록이 이름+요약(거리·시간) 한 줄뿐이었다.
   홈 화면 '출발지별 상세'(app/탐색/탐색.tsx, 2026-08-17)에는 있던 펼치기+구간별
   안내(🚇🚌🚶 아이콘)가 여기는 없었다 — /api/routes 는 처음부터 steps 를 주고
   있었는데 이 화면(app/m/[code]/ui.tsx)만 그 필드를 안 읽고 버리고 있었다.
   새 API 호출 없이 필드 하나만 더 읽어 복구했다 — 그걸 재는 시험이다.

   실제 카카오 대중교통 API 를 그대로 부른다(흉내 안 냄) — 왕십리역→성수역처럼
   실존하는 두 지하철역 사이라 진짜 구간별 안내("2호선 (왕십리 > 성수)")가 온다.
   지도는 카카오 SDK 를 막아 OSM 폴백으로 연다(그래야 진짜 손가락처럼 눌러 볼 수 있다).

   node tests/오는길상세.mjs — 개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
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
const ok = (이름, 참, 덧 = '') => {
  if (참) { 통과++; console.log(`  ✓ ${이름}`); }
  else { 실패++; console.log(`  ✗ ${이름}${덧 ? ` — ${덧}` : ''}`); }
};

function person() {
  const jar = new Map();
  return {
    jar,
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, { ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const kv = c.split(';')[0]; const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    post(p, b) { return this.call(p, { method: 'POST', body: JSON.stringify(b) }); },
    get(p) { return this.call(p); },
  };
}

const 방장 = person();
const br = await chromium.launch({ executablePath: CHROME, headless: true });
let code;

try {

ok('방장 로그인', await 로그인(방장, '시험경로상세'));

const r = await 방장.post('/api/m', { name: '경로상세 시험모임', hostName: '방장', scope: 'place',
  origin: '왕십리역', lat: 37.5612, lng: 127.0378, transport: 'transit' });
code = r.json?.code;
ok('모임을 만들었다', r.status === 200 && !!code, `${r.status} ${JSON.stringify(r.json)}`);

await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'region', refId: 'g1', name: '성수지역', lat: 37.5446, lng: 127.0560 });
let v = (await 방장.get(`/api/m/${code}`)).json;
await 방장.post(`/api/m/${code}`, { action: 'confirm', candidateId: v.candidates[0].id });
await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'place', refId: 'k1', name: '성수역', lat: 37.5446, lng: 127.0560 });
v = (await 방장.get(`/api/m/${code}`)).json;
await 방장.post(`/api/m/${code}`, { action: 'confirm', candidateId: v.candidates.find((c) => c.kind === 'place').id });
v = (await 방장.get(`/api/m/${code}`)).json;
ok('결과 단계로 넘어갔다', v.meeting.stage === 'result', v.meeting.stage);

const ctx = await br.newContext({ viewport: { width: 430, height: 1400 } });
for (const [k, val] of 방장.jar) await ctx.addCookies([{ name: k, value: val, domain: '127.0.0.1', path: '/' }]);
await ctx.route('**/dapi.kakao.com/**', (route) => route.abort());
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await ctx.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
const pg = await ctx.newPage();
const 콘솔에러 = [];
pg.on('pageerror', (e) => 콘솔에러.push(e.message));
await pg.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
await pg.waitForSelector('.sheet', { timeout: 15000 });
await pg.waitForFunction(() => document.body.innerText.includes('오는 길'), { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(2500);

const 접힘 = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('button.row')].find((b) => b.getAttribute('aria-expanded') !== null
    && b.textContent.includes('방장'));
  return btn ? { 있나: true, 펼침표시: btn.querySelector('.ct')?.textContent } : { 있나: false };
});
ok('"오는 길" 에 방장 줄이 토글 단추로 뜬다', 접힘.있나, JSON.stringify(접힘));
ok('처음엔 접혀 있고 "펼치기" 라고 말한다', 접힘.펼침표시 === '펼치기', 접힘.펼침표시);

await pg.locator('button.row[aria-expanded]', { hasText: '방장' }).click();
await pg.waitForTimeout(400);
const 펼침 = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('button.row')].find((b) => b.getAttribute('aria-expanded') !== null
    && b.textContent.includes('방장'));
  const inner = btn?.nextElementSibling;
  return {
    펼침표시: btn?.querySelector('.ct')?.textContent,
    ariaExpanded: btn?.getAttribute('aria-expanded'),
    내용className: inner?.className,
    steps: inner ? [...inner.querySelectorAll('.orsteps li')].map((li) => li.textContent.trim()) : null,
  };
});
ok('누르면 "접기" 로 바뀐다', 펼침.펼침표시 === '접기', 펼침.펼침표시);
ok('aria-expanded 가 true 로 바뀐다', 펼침.ariaExpanded === 'true', 펼침.ariaExpanded);
ok('펼친 내용(.orinner)이 뜬다', 펼침.내용className === 'orinner', JSON.stringify(펼침));
ok('실제 대중교통 구간별 안내가 하나 이상 온다(왕십리역→성수역, 지하철 두 정거장)',
  Array.isArray(펼침.steps) && 펼침.steps.length > 0, JSON.stringify(펼침.steps));
if (펼침.steps?.length) {
  ok('구간 문구에 아이콘(🚇🚌🚶)이 붙어 있다', 펼침.steps.some((s) => /[🚇🚌🚶]/.test(s)), JSON.stringify(펼침.steps));
}

await pg.locator('button.row[aria-expanded]', { hasText: '방장' }).click();
await pg.waitForTimeout(300);
const 다시접힘 = await pg.evaluate(() => {
  const btn = [...document.querySelectorAll('button.row')].find((b) => b.getAttribute('aria-expanded') !== null
    && b.textContent.includes('방장'));
  return { ariaExpanded: btn?.getAttribute('aria-expanded'), 내용있나: !!btn?.nextElementSibling?.classList.contains('orinner') };
});
ok('다시 누르면 접힌다', 다시접힘.ariaExpanded === 'false' && !다시접힘.내용있나, JSON.stringify(다시접힘));
ok('페이지 에러 없음', 콘솔에러.length === 0, 콘솔에러.join(' | '));

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
} finally {
  await br.close();
}

if (code) {
  const del = await 방장.post(`/api/m/${code}`, { action: 'remove' }).catch(() => ({ status: 0 }));
  ok('시험 모임을 치웠다', del.status === 200, String(del.status));
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
