/* Q. 내정보 화면과 기본값 회귀 시험 — `/me` · `lib/기본값.ts` · 자동 채움

     node tests/내정보.mjs   (MOIMER_BASE 로 주소를 바꿀 수 있다. 기본 3000)

   왜 이 시험이 있나
     예전판은 기본값을 **저장만 하고 어디서도 안 불러왔다**(예전판 기록 §6·7 —
     "정말 불러와지나 → 만들기 폼에는 안 온다"). 화면은 "모임을 만들 때 바로 불러와요" 라고
     약속해 놓고 지키지 않았다. 그 거짓말이 다시 생기면 여기서 빨간불이 켜진다.

   무엇을 못 박나
     Q1 `/me` 가 있다 · 빈 상태가 멀쩡하다 · 이 기기에만 저장된다고 밝힌다
     Q2 넣고 저장하면 **새로고침해도 남는다**
     Q3 **`/new` 만들기 폼에 출발지·이동 수단이 정말 채워진다** ← 가장 중요하다
        (보이기만 하는 게 아니라 그대로 눌러 모임이 만들어져야 한다 — 좌표까지 살아 있다는 뜻)
     Q4 `/join/<코드>` 참여 폼에 출발지·PIN 이 채워진다
     Q5 기본값이 **없을 때** 두 폼이 빈 채로 멀쩡하다 (기존 흐름이 안 깨진다)
     Q6 PIN 이 네 자리가 아니면 저장을 막는다
     Q7 지우기가 된다 — 지운 뒤에는 폼도 다시 빈다
     Q8 금지 낱말이 없다 · 430×900 에서 안 잘린다 · 탭바에 안 가린다
     Q9 버린 것이 안 돌아왔다 (스케줄 가져오기 · 앱 푸시 · 없는 로그인 약속)

   진짜 크롬으로 연다 — localStorage 와 '가려졌는지' 는 HTML 만 봐서는 알 수 없다.
   출발지 검색은 스텁으로 바꿔 끼운다(바깥 API 몫이 이 시험에 쓰이면 안 된다).
   내가 만든 모임은 {action:'remove'} 로 치운다. */
import { createRequire } from 'node:module';

import { 로그인, 브라우저로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* 논의71~73 — 이 낱말이 화면에 보이면 안 된다. '표' 는 한 글자라 '표시·목표' 까지 걸린다.
   일부러 그렇게 뒀다: 이 화면의 글은 전부 우리가 쓴 것이라 걸릴 것이 없어야 맞다. */
const 금지 = ['투표', '표', '동네', '가게', '마감', '아카이브', '종료', '호스트', '멤버', '미팅'];

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

/* ── 서버 쪽 손 (모임 하나를 만들어 참여 폼을 열어 보려고) ───── */
function person() {
  const jar = new Map();
  return {
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* 500 은 본문이 비어 온다 */ }
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
  };
}
const 만든모임 = [];
async function 모임만들기(p, name) {
  /* 모임 만들기는 로그인 필수다 (논의123) */
  await 로그인(p, 'Q기본값방장');
  /* Neon 이 잠자다 깨면 첫 물음이 7초를 넘겨 넘어진다 — 몇 번 더 해 본다 */
  for (let 판 = 0; 판 < 3; 판++) {
    const r = await p.post('/api/m', {
      name, hostName: '기본값방장', scope: 'place',
      origin: '왕십리역', lat: 37.5612, lng: 127.0378,
    });
    if (r.json?.code) { 만든모임.push({ p, code: r.json.code }); return r.json.code; }
    await 잠깐(600 * (판 + 1));
  }
  return null;
}

/* ── 브라우저 쪽 ─────────────────────────────────────────────── */
const 가짜출발지 = (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ places: [
    { id: 'kakao:o1', name: '성수역', address: '서울 성동구 성수동2가', lat: 37.5446, lng: 127.056 },
    { id: 'kakao:o2', name: '왕십리역', address: '서울 성동구 행당동', lat: 37.5612, lng: 127.0378 },
  ] }),
});

async function 열기(p, 길, 크기 = 4) {
  for (let 시도 = 1; ; 시도++) {
    try { await p.goto(BASE + 길, { waitUntil: 'networkidle', timeout: 20000 }); return; }
    catch (e) { if (시도 >= 크기) throw e; await 잠깐(800); }
  }
}

/* 출발지 칸의 지금 모습 — 골랐으면 이름, 아직이면 null */
const 고른출발지 = (p) => p.evaluate(() => {
  const 칸 = document.querySelector('#og');
  if (칸) return null;                       /* 검색칸이 그대로면 아직 안 골랐다 */
  const nm = document.querySelector('.fld .row .nm');
  return nm ? (nm.childNodes[0]?.textContent || '').trim() : null;
});
const 켜진이동수단 = (p) => p.evaluate(() => {
  const b = document.querySelector('.segs .seg[aria-pressed="true"]');
  return b ? (b.textContent || '').trim() : null;
});
const 값 = (p, sel) => p.evaluate((s) => document.querySelector(s)?.value ?? null, sel);

/* /me 에 하나씩 넣고 저장한다 */
async function 기본값넣기(p, { 출발지 = '성수역', 이동수단 = '자동차', pin = '1234' } = {}) {
  await 열기(p, '/me');
  await p.waitForSelector('#og', { timeout: 10000 });
  await p.fill('#og', 출발지);
  await p.waitForSelector('.rows .row', { timeout: 10000 });
  await p.click(`.rows .row:has-text("${출발지}")`);
  await p.click(`.segs .seg:has-text("${이동수단}")`);
  await p.fill('#pin', pin);
  await p.click('button:has-text("저장")');
  await 잠깐(250);
}

const 브라우저 = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = async (크기 = { width: 430, height: 900 }) => {
  const ctx = await 브라우저.newContext({ viewport: 크기, locale: 'ko-KR' });
  const p = await ctx.newPage();
  await p.route('**/api/places/search*', 가짜출발지);
  return { ctx, p };
};

/* 참여 폼을 열어 볼 모임 하나 (없으면 Q4 는 건너뛴다 — DB 가 자는 것은 시험 결과가 아니다) */
const 방장 = person();
const 코드 = await 모임만들기(방장, 'Q 기본값 시험');

try {
  /* ══ Q1 · /me 가 있다 · 빈 상태 ════════════════════════════ */
  console.log('\n[Q1] /me 내정보 화면 — 빈 상태');
  {
    const { ctx, p } = await 새창();
    try {
      const res = await p.goto(BASE + '/me', { waitUntil: 'networkidle', timeout: 20000 });
      ok('/me 가 200 이다', res?.status() === 200, String(res?.status()));
      const 글 = await p.locator('.wrap').innerText();
      ok('제목이 내정보다', /내정보/.test(글));
      ok('탭바가 뜬다', await p.locator('nav.tabbar').count() === 1);
      ok("'내정보' 탭이 지금 탭이다",
         await p.locator('nav.tabbar a[aria-current="page"]').innerText().catch(() => '') === '내정보');

      ok('기본 출발지 칸이 있다', await p.locator('#og').count() === 1);
      /* 논의127 로 걷기가 대중교통에 합쳐져 **둘**이 됐다 (전에는 셋) */
      ok('기본 이동 수단 칸이 있다 (단추 둘)', await p.locator('.segs .seg').count() === 2,
         (await p.locator('.segs .seg').allInnerTexts()).join(' · '));
      ok('기본 PIN 칸이 있다', await p.locator('#pin').count() === 1);

      ok('빈 상태에서는 출발지가 안 골라져 있다', await 고른출발지(p) === null);
      /* 이름이 '대중교통' 으로 바뀌었다 — 재는 것은 **어느 쪽이 켜져 있나** 이지 글자가 아니다 */
      ok('빈 상태의 이동 수단은 대중교통 쪽이다', /대중교통/.test(String(await 켜진이동수단(p))),
         String(await 켜진이동수단(p)));
      ok('빈 상태의 PIN 은 비어 있다', await 값(p, '#pin') === '', String(await 값(p, '#pin')));

      ok('이 기기에만 저장된다고 밝힌다',
         /이 기기에만/.test(글) && /(폰을|기기를) 바꾸/.test(글), 글.slice(0, 160));
    } catch (e) { ok('Q1 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q2 · 저장하면 새로고침해도 남는다 ═════════════════════ */
  console.log('\n[Q2] 저장 → 새로고침');
  {
    const { ctx, p } = await 새창();
    try {
      await 기본값넣기(p);
      ok('저장했다고 말해 준다', /저장했어요|저장됐어요/.test(await p.locator('.wrap').innerText()));

      await 열기(p, '/me');
      ok('새로고침해도 출발지가 남는다', await 고른출발지(p) === '성수역', String(await 고른출발지(p)));
      ok('새로고침해도 이동 수단이 남는다', await 켜진이동수단(p) === '자동차', String(await 켜진이동수단(p)));
      ok('새로고침해도 PIN 이 남는다', await 값(p, '#pin') === '1234', String(await 값(p, '#pin')));

      /* 화면이 localStorage 를 직접 만지지 않아도, 남는 자리는 이 기기 안이어야 한다 */
      const 자리 = await p.evaluate(() => Object.keys(localStorage).filter((k) => /moimer/i.test(k)));
      ok('이 기기(localStorage) 에 남는다', 자리.length >= 1, JSON.stringify(자리));
      const 쿠키 = await ctx.cookies();
      ok('서버로 보내는 쿠키를 만들지 않는다',
         !쿠키.some((c) => /기본값|default|profile/i.test(c.name)), 쿠키.map((c) => c.name).join(','));
    } catch (e) { ok('Q2 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q3 · /new 만들기 폼에 정말 온다 (가장 중요) ═══════════ */
  console.log('\n[Q3] /new 만들기 폼에 기본값이 채워진다 ★');
  {
    const { ctx, p } = await 새창();
    let 만든코드 = null;
    try {
      await 기본값넣기(p);
      /* 모임 만들기는 로그인 필수가 됐다 (논의123) — 크롬 안에서도 세션을 만들어 둔다.
         기본값넣기 가 이미 /me 를 열어 두어 같은 출처다(그래야 쿠키가 붙는다). */
      await 브라우저로그인(p, 'Q기본값방장');
      await 열기(p, '/new');
      await p.waitForSelector('#mn', { timeout: 10000 });
      await 잠깐(300);
      ok('만들기 폼에 기본 출발지가 채워져 있다', await 고른출발지(p) === '성수역', String(await 고른출발지(p)));
      ok('만들기 폼에 기본 이동 수단이 채워져 있다', await 켜진이동수단(p) === '자동차', String(await 켜진이동수단(p)));

      /* 보이기만 하면 안 된다 — 좌표까지 살아 있어야 그대로 모임이 만들어진다 */
      await p.fill('#mn', 'Q 기본값 만들기'); await p.fill('#hn', '김방장');
      const 만들기 = p.locator('button.cta:not(.sub)');
      ok('출발지를 다시 안 골라도 만들기 단추가 눌린다', await 만들기.isEnabled());
      await 만들기.click();
      await p.waitForURL(/\/m\/[A-Z0-9]{6}$/, { timeout: 25000 });
      만든코드 = new URL(p.url()).pathname.split('/').pop();
      ok('불러온 출발지로 모임이 실제로 만들어진다', /^[A-Z0-9]{6}$/.test(만든코드 || ''), 만든코드 || '못 갔다');
    } catch (e) { ok('Q3 시험', false, String(e).split('\n')[0]); }
    if (만든코드) {
      try {
        await p.evaluate((c) => fetch(`/api/m/${c}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'remove' }),
        }).then((r) => r.status), 만든코드);
      } catch { /* 치우기 실패는 시험 결과가 아니다 */ }
    }
    await ctx.close();
  }

  /* ══ Q4 · /join/<코드> 참여 폼 ════════════════════════════ */
  console.log('\n[Q4] /join/<코드> 참여 폼에 출발지·PIN 이 채워진다');
  if (!코드) {
    ok('참여 폼 시험에 쓸 모임을 만들었다', false, '모임을 못 만들어 건너뛴다 (DB 가 자는 중일 수 있다)');
  } else {
    const { ctx, p } = await 새창();
    try {
      await 기본값넣기(p);
      await 열기(p, `/join/${코드}`);
      await p.waitForSelector('#nm', { timeout: 10000 });
      await 잠깐(300);
      ok('참여 폼에 기본 출발지가 채워져 있다', await 고른출발지(p) === '성수역', String(await 고른출발지(p)));
      ok('참여 폼에 기본 이동 수단이 채워져 있다', await 켜진이동수단(p) === '자동차', String(await 켜진이동수단(p)));
      ok('참여 폼에 기본 PIN 이 채워져 있다', await 값(p, '#pin') === '1234', String(await 값(p, '#pin')));
      await p.fill('#nm', '기본값참여자');
      ok('이름만 적으면 참여 단추가 눌린다', await p.locator('button.cta').isEnabled());
    } catch (e) { ok('Q4 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q5 · 기본값이 없을 때 (기존 흐름이 안 깨진다) ═════════ */
  console.log('\n[Q5] 기본값이 없을 때 — 폼이 빈 채로 멀쩡하다');
  {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, '/new');
      await p.waitForSelector('#mn', { timeout: 10000 });
      await 잠깐(300);
      ok('만들기 폼의 출발지가 비어 있다', await 고른출발지(p) === null);
      ok('만들기 폼의 이동 수단이 대중교통 쪽이다', /대중교통/.test(String(await 켜진이동수단(p))),
         String(await 켜진이동수단(p)));
      await p.fill('#mn', 'Q 빈 기본값'); await p.fill('#hn', '김방장');
      ok('출발지가 없으면 만들기 단추가 안 눌린다', !(await p.locator('button.cta:not(.sub)').isEnabled()));
      /* 검색해서 고르는 길은 그대로다 */
      await p.fill('#og', '성수역');
      await p.waitForSelector('.rows .row', { timeout: 10000 });
      await p.click('.rows .row:has-text("성수역")');
      ok('직접 고르면 만들기 단추가 눌린다', await p.locator('button.cta:not(.sub)').isEnabled());

      if (코드) {
        await 열기(p, `/join/${코드}`);
        await p.waitForSelector('#nm', { timeout: 10000 });
        await 잠깐(300);
        ok('참여 폼의 출발지가 비어 있다', await 고른출발지(p) === null);
        ok('참여 폼의 PIN 이 비어 있다', await 값(p, '#pin') === '', String(await 값(p, '#pin')));
        ok('빈 채로는 참여 단추가 안 눌린다', !(await p.locator('button.cta').isEnabled()));
      }
    } catch (e) { ok('Q5 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q6 · PIN 네 자리 ═════════════════════════════════════ */
  console.log('\n[Q6] PIN 이 네 자리가 아니면 저장을 막는다');
  {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, '/me');
      await p.waitForSelector('#pin', { timeout: 10000 });
      await p.fill('#pin', '12');
      await 잠깐(150);
      ok('세 자리 미만이면 저장 단추가 안 눌린다', !(await p.locator('button:has-text("저장")').isEnabled()));
      ok('왜 못 저장하는지 말해 준다', /네 자리|4자리/.test(await p.locator('.wrap').innerText()));

      await p.fill('#pin', 'abcd');
      ok('숫자가 아니면 들어가지 않는다', await 값(p, '#pin') === '', String(await 값(p, '#pin')));
      await p.fill('#pin', '123456');
      ok('네 자리를 넘겨 넣을 수 없다', (await 값(p, '#pin'))?.length === 4, String(await 값(p, '#pin')));
      ok('네 자리면 저장 단추가 눌린다', await p.locator('button:has-text("저장")').isEnabled());
    } catch (e) { ok('Q6 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q7 · 지우기 ══════════════════════════════════════════ */
  console.log('\n[Q7] 지우기');
  {
    const { ctx, p } = await 새창();
    try {
      await 기본값넣기(p);
      await 열기(p, '/me');
      ok('지우기 단추가 있다', await p.locator('button:has-text("지우기")').count() >= 1);
      await p.click('button:has-text("지우기")');
      await 잠깐(250);
      ok('지운 뒤 출발지가 비었다', await 고른출발지(p) === null);
      ok('지운 뒤 PIN 이 비었다', await 값(p, '#pin') === '', String(await 값(p, '#pin')));

      await 열기(p, '/me');
      ok('새로고침해도 지워진 채다', await 고른출발지(p) === null && await 값(p, '#pin') === '');
      await 열기(p, '/new');
      await p.waitForSelector('#mn', { timeout: 10000 });
      await 잠깐(300);
      ok('만들기 폼에도 다시 안 채워진다', await 고른출발지(p) === null);
    } catch (e) { ok('Q7 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q8 · 말투 · 430×900 ══════════════════════════════════ */
  console.log('\n[Q8] 낱말 · 430×900 · 탭바');
  for (const 크기 of [{ width: 430, height: 900 }, { width: 390, height: 844 }]) {
    const 이름 = `${크기.width}×${크기.height}`;
    const { ctx, p } = await 새창(크기);
    try {
      /* 채운 상태가 글이 가장 많다 — 잘리는지는 거기서 봐야 한다 */
      await 기본값넣기(p);
      await 열기(p, '/me');
      const 글 = await p.locator('.wrap').innerText();
      for (const 말 of 금지) ok(`${이름} '${말}' 이 화면에 없다`, !글.includes(말));

      const 잼 = await p.evaluate(() => ({
        가로넘침: document.documentElement.scrollWidth > window.innerWidth + 1,
        뷰폭: window.innerWidth,
        밖: [...document.querySelectorAll('.wrap *')]
          .filter((el) => { const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5); })
          .map((el) => (el.textContent || '').slice(0, 14)).slice(0, 3),
      }));
      ok(`${이름} 가로로 안 넘친다`, !잼.가로넘침);
      ok(`${이름} 화면 밖으로 나간 것이 없다`, 잼.밖.length === 0, 잼.밖.join(' / '));

      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await 잠깐(150);
      const 가림 = await p.evaluate(() => {
        const nav = document.querySelector('nav.tabbar');
        if (!nav) return '탭바 없음';
        const top = nav.getBoundingClientRect().top;
        const 것들 = [...document.querySelectorAll('.wrap > * > *')];
        return 것들.filter((el) => { const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > top + 0.5; })
          .map((el) => (el.textContent || '').slice(0, 12)).join(' / ');
      });
      ok(`${이름} 본문이 탭바에 안 가린다`, 가림 === '', 가림);
    } catch (e) { ok(`${이름} 시험`, false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ══ Q9 · 버린 것이 안 돌아왔다 ═══════════════════════════ */
  console.log('\n[Q9] 예전판에서 버리기로 한 것 (기록 §11)');
  {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, '/me');
      const 글 = await p.locator('.wrap').innerText();
      ok('스케줄 가져오기가 없다', !/스케줄 가져오기|캘린더에서 가져오기/.test(글));
      ok('꺼진 단추(준비 중)가 없다', !/준비 중|준비중/.test(글));
      ok('앱 푸시 알림이 없다', !/푸시/.test(글));
      /* 논의105 — 없는 기능을 있는 것처럼 적지 마라. 카카오 로그인은 아직 안 붙었다 */
      ok('없는 로그인을 약속하지 않는다', !/곧 |준비하고 있|생길 예정|카카오로 전환/.test(글), 글.slice(0, 200));
      ok('눌러도 아무 일 없는 단추가 없다', await p.evaluate(() =>
        [...document.querySelectorAll('.wrap button')].every((b) => !b.disabled || b.closest('form') !== null
          || /저장|지우기/.test(b.textContent || ''))));
    } catch (e) { ok('Q9 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }
} finally {
  await 브라우저.close();
  /* 내가 만든 모임만 치운다 */
  for (const { p, code } of 만든모임) {
    try { await p.post(`/api/m/${code}`, { action: 'remove' }); } catch { /* 치우기 실패는 시험 결과가 아니다 */ }
  }
  /* 치우기 물음의 연결이 다 닫히기 전에 process.exit 을 부르면 노드가 libuv 어서션으로 죽는다 —
     끝줄이 안 보이면 무엇이 빨간불인지 못 읽는다 */
  await 잠깐(300);
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
if (실패) process.exit(1);
