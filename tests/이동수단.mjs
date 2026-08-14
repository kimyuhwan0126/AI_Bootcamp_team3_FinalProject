/* 이동 수단 회귀 시험 — **걷기를 대중교통에 합쳤다**(lib/types.ts).

   재는 것 셋:
     ① 화면에 단추가 둘뿐인가 (대중교통 / 자동차) — '걸어서' 글자는 어디에도 없어야 한다
     ② 서버가 옛 값 'walk' 를 **거절하지 않고 'transit' 으로 옮겨 받는가**
        — 먼저 열어 둔 화면이 아직 그 값을 들고 있을 수 있다. 400 을 주면 새로고침해야만 쓸 수 있다
     ③ 잣대가 **한 곳**인가 — 만들 때와 참여할 때가 같은 답을 주는가
        (전에는 두 라우트가 각자 목록을 적어 두어, 한쪽만 고치면 갈렸다)

   운영 DB 를 쓴다. 내가 만든 모임만 치운다.
   node tests/이동수단.mjs — 개발 서버가 떠 있어야 한다 */
import { createRequire } from 'node:module';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const require_ = createRequire(import.meta.url);
let chromium = null;
for (const p of [process.env.PLAYWRIGHT_CORE, 'playwright-core',
  'C:/Users/USER/.claude/jobs/c332f72c/tmp/node_modules/playwright-core'].filter(Boolean)) {
  try { ({ chromium } = require_(p)); break; } catch { /* 다음 곳 */ }
}

let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const 잠깐 = (ms) => new Promise((r) => setTimeout(r, ms));

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
      let json = null; try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 */ }
      return { status: r.status, json, text };
    },
    post(p, b) { return this.call(p, { method: 'POST', body: JSON.stringify(b) }); },
    get(p) { return this.call(p); },
  };
}

const 치울것 = [];
const 방장 = person();
const 새모임 = async (transport) => {
  const r = await 방장.post('/api/m', { name: 'T 이동수단 시험', hostName: '방장', scope: 'region',
    origin: '성수역', lat: 37.5446, lng: 127.056, ...(transport === undefined ? {} : { transport }) });
  if (r.json?.code) 치울것.push(r.json.code);
  return r;
};

try {

/* ── 서버 ─────────────────────────────────────────────── */
console.log('\n[이1] 서버가 무엇을 받아 주는가');
ok('시험용 로그인이 된다', await 로그인(방장, '시험이동'));

{
  const 좋음 = await 새모임('transit');
  ok("'transit' 은 그대로 받는다", 좋음.status === 200, `${좋음.status}`);

  const 차 = await 새모임('car');
  ok("'car' 도 그대로 받는다", 차.status === 200, `${차.status}`);

  /* 핵심 — 옛 값은 막지 않고 옮겨 받는다 */
  const 걷기 = await 새모임('walk');
  ok("옛 값 'walk' 를 400 으로 막지 않는다", 걷기.status === 200, `${걷기.status} ${걷기.json?.error ?? ''}`);
  if (걷기.json?.code) {
    const w = (await 방장.get(`/api/m/${걷기.json.code}`)).json;
    const 나 = w?.participants?.find((p) => p.id === w?.me?.participantId);
    ok("'walk' 로 만들면 'transit' 으로 저장된다", 나?.transport === 'transit', String(나?.transport));
  }

  const 헛것 = await 새모임('비행기');
  ok('모르는 값은 400 으로 막는다', 헛것.status === 400 && 헛것.json?.error === 'bad_transport',
     `${헛것.status} ${헛것.json?.error ?? ''}`);

  const 없음 = await 새모임(undefined);
  ok('안 보내도 만들어진다', 없음.status === 200, `${없음.status}`);
}

/* ── 만들 때와 참여할 때가 같은 잣대인가 ───────────────── */
console.log('\n[이2] 만들기와 참여가 같은 잣대를 쓴다');
{
  const r = await 새모임('transit');
  const C = r.json?.code;
  if (!C) throw new Error('모임을 못 만들어 더 못 간다');

  const 손님 = person();
  const 들어옴 = await 손님.post(`/api/m/${C}`, { action: 'join', name: '영희', pin: '1111',
    origin: '왕십리역', lat: 37.5612, lng: 127.0378, transport: 'walk' });
  ok("참여도 'walk' 를 막지 않는다", 들어옴.status === 200, `${들어옴.status} ${들어옴.json?.error ?? ''}`);

  const w = (await 방장.get(`/api/m/${C}`)).json;
  const 영희 = w?.participants?.find((p) => p.name === '영희');
  ok("참여로 들어온 'walk' 도 'transit' 이 된다", 영희?.transport === 'transit', String(영희?.transport));

  const 헛것 = await person().post(`/api/m/${C}`, { action: 'join', name: '민준', pin: '2222',
    origin: '홍대입구역', lat: 37.5572, lng: 126.9245, transport: '비행기' });
  ok('참여도 모르는 값은 400 으로 막는다', 헛것.status === 400 && 헛것.json?.error === 'bad_transport',
     `${헛것.status} ${헛것.json?.error ?? ''}`);
}

/* ── 화면 ─────────────────────────────────────────────── */
console.log('\n[이3] 화면에 단추가 둘뿐이다');
if (!chromium) {
  ok('화면 시험을 돌렸다', false, 'playwright-core 를 못 찾았다');
} else {
  const br = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    /* 이동 수단 칸이 있는 화면 셋을 다 본다 — 한 군데만 고치고 지나가기 쉬운 자리다 */
    for (const [주소, 이름] of [['/new', '만들기'], ['/me', '내정보'], ['/', '홈 탐색']]) {
      const ctx = await br.newContext({ viewport: { width: 430, height: 900 } });
      const pg = await ctx.newPage();
      await pg.goto(BASE + 주소, { waitUntil: 'load' });
      await 잠깐(2500);
      const 단추 = await pg.locator('.segs button').allInnerTexts();
      ok(`${이름}: 단추가 둘이다`, 단추.length === 2, 단추.join(' · ') || '없음');
      /* 값은 'transit' 으로 합쳤지만 글자에는 '걸어서' 를 남기지 않는다 — 단추 이름은 '대중교통' 뿐이다 */
      ok(`${이름}: '걸어서' 글자가 어디에도 없다`, !단추.some((t) => t.includes('걸어서')), 단추.join(' · '));
      ok(`${이름}: 대중교통 단추가 있다`, 단추.includes('대중교통'), 단추.join(' · '));
      await ctx.close();
    }
  } finally { await br.close(); }
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울것) {
    const r = await 방장.post(`/api/m/${c}`, { action: 'remove' }).catch(() => ({ status: 0 }));
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.length, `${지움}/${치울것.length}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
