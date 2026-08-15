/* 모임 만들기 ↔ 로그인 왕복 회귀 시험 (논의123).

   왜 있나: 모임 만들기가 로그인 필수가 되면서 **긴 폼 한가운데에 문이 하나 생겼다.**
   그 문을 잘못 달면 두 가지가 조용히 망가진다 —
     ① 다 채우고 [만들기] 를 눌러야 막힌 것을 안다 (헛수고)
     ② 로그인하러 다녀오면 적어 둔 것이 다 날아간다 (화면은 "그대로 있어요" 라고 적어 두고 어긴다)
   둘 다 시험이 없으면 아무도 모른 채로 굴러간다. 사람이 겪어야만 드러나는 종류다.

   열린 리다이렉트도 여기서 잰다 — `/me?next=…` 는 로그인 뒤에 사람을 옮기는 자리라,
   바깥 주소를 받으면 로그인 발판이 된다.

   node tests/로그인왕복.mjs — 개발 서버가 떠 있어야 한다
   (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
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
const 한줄 = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 90);
/* 약속 시간 단추(app/timepicker.tsx) — 구석의 키보드 아이콘으로 옛 datetime-local
   예비 길을 불러 값을 그대로 채운다. 지금 정해진 값은 data-value 에서 읽는다. */
async function 시간고르기(p, 값) {
  await p.click('#mt');
  await p.waitForSelector('.tpsheet');
  await p.click('.tpkbd');
  await p.fill('#tp-manual', 값);
  await p.click('.tpfoot button:has-text("확인")');
}
const 시간값 = (p) => p.getAttribute('#mt', 'data-value');

const br = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = () => br.newContext({ viewport: { width: 430, height: 900 } });

try {

/* ── 로그인 전에 미리 말하는가 ───────────────────────────────── */
console.log('\n[왕1] 폼을 채우기 전에 알려 준다');
const ctx = await 새창();
const pg = await ctx.newPage();
{
  await pg.goto(BASE + '/new', { waitUntil: 'load' });
  await 잠깐(2500);
  const t = await pg.evaluate(() => document.body.innerText);
  /* 이 한 줄이 없으면 사람은 폼을 다 채운 뒤에야 막힌다 */
  ok('로그인이 필요하다고 폼 위에서 먼저 말한다', /모임을 만들려면 로그인이 필요해요/.test(t), 한줄(t));
  ok('그 자리에서 바로 갈 수 있다', await pg.getByRole('link', { name: /지금 로그인하기/ }).count() > 0);
  /* 막지는 않는다 — 적어 두고 나중에 로그인해도 된다 */
  ok('폼 자체는 막히지 않는다', await pg.locator('#mn').isEditable());
}

/* ── 적어 둔 것을 지키는가 ───────────────────────────────────── */
console.log('\n[왕2] 로그인하러 다녀와도 적어 둔 것이 그대로다');
let 출발값 = '';
{
  await pg.fill('#mn', '금요일 저녁');
  await pg.fill('#hn', '지훈');
  await 시간고르기(pg, '2026-08-21T19:00');
  await pg.selectOption('#sc', 'region');

  /* 출발지는 고르면 검색 칸이 사라지고 '고른 곳' 단추가 그 자리에 온다 —
     값은 input 이 아니라 그 칸 전체의 글자에서 읽는다 */
  const 출발칸 = () => pg.locator('.fld', { has: pg.locator('label[for="og"]') }).innerText();
  await pg.fill('#og', '성수역');
  await 잠깐(2500);
  const 첫줄 = pg.locator('.fld button.row').first();
  if (await 첫줄.count()) { await 첫줄.click(); await 잠깐(900); }
  출발값 = await 출발칸();
  ok('출발지를 골랐다', (await pg.locator('#og').count()) === 0 && /성수/.test(출발값), 한줄(출발값));

  await pg.getByRole('link', { name: /지금 로그인하기/ }).click();
  await pg.waitForURL(/\/me/, { timeout: 9000 }).catch(() => {});
  ok('내정보로 가면서 돌아갈 곳을 들고 간다',
     new URL(pg.url()).searchParams.get('next') === '/new', pg.url());

  /* 개발용 임시 로그인으로 왕복한다 — 카카오는 기계가 못 누른다 */
  await pg.fill('input[placeholder="이름"]', '지훈');
  await pg.getByRole('button', { name: '이름으로' }).click();
  /* ⚠ `/me?next=/new` 도 '/new' 라는 글자를 품는다 — 주소 전체를 보면 안 옮겨 갔는데도 통과한다 */
  await pg.waitForFunction(() => location.pathname === '/new', null, { timeout: 15000 }).catch(() => {});
  ok('로그인하면 만들던 자리로 돌아온다', new URL(pg.url()).pathname === '/new', pg.url());
  await 잠깐(2500);

  ok('모임 이름이 그대로', (await pg.inputValue('#mn')) === '금요일 저녁', await pg.inputValue('#mn'));
  ok('내 이름이 그대로', (await pg.inputValue('#hn')) === '지훈', await pg.inputValue('#hn'));
  ok('약속 시간이 그대로', (await 시간값(pg)) === '2026-08-21T19:00', await 시간값(pg));
  ok('정할 범위가 그대로', (await pg.inputValue('#sc')) === 'region', await pg.inputValue('#sc'));
  ok('출발지가 그대로', (await 출발칸()) === 출발값, 한줄(await 출발칸()));

  const t = await pg.evaluate(() => document.body.innerText);
  ok('로그인했으니 안내는 사라진다', !/로그인이 필요해요/.test(t), 한줄(t));

  /* 한 번만 돌려준다 — 남겨 두면 나중에 그냥 만들러 온 사람에게 지난 폼이 말없이 얹힌다 */
  await pg.reload({ waitUntil: 'load' });
  await 잠깐(2000);
  ok('새로고침하면 담아 둔 것은 사라진다', (await pg.inputValue('#mn')) === '', await pg.inputValue('#mn'));
}
await ctx.close();

/* ── 열린 리다이렉트 ─────────────────────────────────────────── */
console.log('\n[왕3] 로그인 뒤에 바깥으로 못 보낸다');
{
  /* `next` 는 로그인이 끝난 사람을 옮기는 값이다. 바깥 주소를 받으면
     "우리 주소로 시작하는 로그인 링크" 하나로 남의 사이트에 내려놓을 수 있다. */
  for (const [나쁜것, 이름] of [
    ['https://example.com', '다른 사이트 주소'],
    ['//example.com', '빗금 둘로 시작하는 주소'],
    ['http://127.0.0.1:3000/new', '우리 주소라도 전체 주소'],
  ]) {
    const c = await 새창();
    const p = await c.newPage();
    await p.goto(BASE + '/me?next=' + encodeURIComponent(나쁜것), { waitUntil: 'load' });
    await 잠깐(1800);
    await p.fill('input[placeholder="이름"]', '지훈');
    await p.getByRole('button', { name: '이름으로' }).click();
    await 잠깐(3000);
    ok(`${이름}로는 안 보낸다`, new URL(p.url()).host === new URL(BASE).host, p.url());
    await c.close();
  }
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

/* 치울 것이 없다 — 이 시험은 모임을 하나도 안 만든다(만들기 직전까지만 간다).
   users 에는 '지훈' 게스트 줄이 하나 생기지만 같은 이름이면 늘 같은 줄이라 안 쌓인다. */

await br.close();
console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
