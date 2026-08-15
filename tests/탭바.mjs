/* O. 탭바와 화면 뼈대 회귀 시험.
     node tests/탭바.mjs   (MOIMER_BASE 로 주소를 바꿀 수 있다)

   무엇을 못 박나
     O1 탭바가 `/` `/meetings` `/me` 세 곳에 뜨는가 · 지금 탭이 표시되는가
     O2 `/new` `/join/*` `/m/*` 에는 안 뜨는가 (몰입해야 하는 자리)
     O3 탭을 눌러 서로 오갈 수 있는가
     O4 **만들기가 `/new` 에서 여전히 되는가** — 옮기다 흐름을 깨면 여기서 빨간불
     O5 430×900 · 390×844 에서 탭바가 안 잘리는가 · 본문이 탭바 뒤에 안 숨는가
     O6 탭바가 시트·모달(층 20~23)보다 아래인가

   진짜 크롬으로 연다 — HTML 만 봐서는 '가려졌는지'를 알 수 없다.
   출발지 검색은 스텁으로 바꿔 끼운다(바깥 API 몫이 이 시험에 쓰이면 안 된다).
   내가 만든 모임은 브라우저 쿠키로 {action:'remove'} 해서 치운다.

   O4 는 이제 로그인한 창에서 돈다 — 논의123 이 `POST /api/m` 에 세션을 걸었다(401 login_required).
   로그인하는 길은 tests/세션.mjs 한 곳뿐이다. */
import { createRequire } from 'node:module';
import { 브라우저로그인 } from './세션.mjs';

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
const 쉬기 = (ms) => new Promise((r) => setTimeout(r, ms));

/* 개발 서버가 다시 굽는 중이면 잠깐 500 이 난다 — 한 번 넘어졌다고 시험이 통째로 죽으면
   무엇이 빨간불인지 못 본다. Neon 이 잠자다 깨는 첫 물음도 여기서 받아 준다. */
async function 열기(p, 길, 크기 = 3) {
  for (let 시도 = 1; ; 시도++) {
    try { await p.goto(BASE + 길, { waitUntil: 'networkidle', timeout: 20000 }); return; }
    catch (e) { if (시도 >= 크기) throw e; await 쉬기(800); }
  }
}

const 가짜출발지 = (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ places: [{ id: 'kakao:o1', name: '성수역', address: '서울 성동구 성수동', lat: 37.5446, lng: 127.056 }] }),
});

/* 탭바를 재서 한 뭉치로 돌려준다 — 없으면 null */
const 탭바재기 = (p) => p.evaluate(() => {
  const nav = document.querySelector('nav.tabbar');
  if (!nav) return null;
  const r = nav.getBoundingClientRect();
  const cs = getComputedStyle(nav);
  const 탭 = [...nav.querySelectorAll('a')].map((a) => {
    const ar = a.getBoundingClientRect();
    return {
      글: (a.textContent || '').trim(),
      주소: new URL(a.getAttribute('href'), location.origin).pathname,
      지금: a.getAttribute('aria-current') === 'page',
      svg: !!a.querySelector('svg'),
      w: ar.width, h: ar.height, 오른끝: ar.right,
    };
  });
  const wrap = document.querySelector('.wrap');
  return {
    top: r.top, 오른끝: r.right, 왼끝: r.left, h: r.height,
    z: cs.zIndex, 넘침: nav.scrollWidth > nav.clientWidth + 1,
    탭,
    본문아래여백: wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) : -1,
    뷰폭: window.innerWidth, 뷰높이: window.innerHeight,
  };
});

const 브라우저 = await chromium.launch({ executablePath: CHROME, headless: true });
const 새창 = async (크기 = { width: 430, height: 900 }) => {
  const ctx = await 브라우저.newContext({ viewport: 크기, locale: 'ko-KR' });
  const p = await ctx.newPage();
  await p.route('**/api/places/search*', 가짜출발지);
  return { ctx, p };
};

try {
  /* ── O1 · 탭바가 보이는 세 곳 ─────────────────────────────── */
  console.log('\n[O1] 탭바가 뜨는 곳 — / · /meetings · /me');
  for (const [길, 켜질탭] of [['/', '홈'], ['/meetings', '모임'], ['/me', '내정보']]) {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, 길);
      const t = await 탭바재기(p);
      ok(`${길} 에 탭바가 있다`, !!t);
      if (t) {
        ok(`${길} 탭바에 탭이 셋이다`, t.탭.length === 3, String(t.탭.length));
        ok(`${길} 탭 이름이 홈·모임·내정보다`,
           t.탭.map((x) => x.글).join('|') === '홈|모임|내정보', t.탭.map((x) => x.글).join('|'));
        ok(`${길} 탭이 / · /meetings · /me 로 간다`,
           t.탭.map((x) => x.주소).join('|') === '/|/meetings|/me', t.탭.map((x) => x.주소).join('|'));
        ok(`${길} 아이콘이 인라인 SVG 다`, t.탭.every((x) => x.svg));
        const 켜진 = t.탭.filter((x) => x.지금);
        ok(`${길} 에서 '${켜질탭}' 탭 하나만 aria-current="page" 다`,
           켜진.length === 1 && 켜진[0].글 === 켜질탭, 켜진.map((x) => x.글).join(',') || '없다');
      }
    } catch (e) { ok(`${길} 탭바 시험`, false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ── O2 · 탭바가 안 보이는 곳 ─────────────────────────────── */
  console.log('\n[O2] 탭바가 안 뜨는 곳 — /new · /join/* · /m/*');
  for (const 길 of ['/new', '/join/AAAAAA', '/m/AAAAAA']) {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, 길);
      ok(`${길} 에는 탭바가 없다`, (await 탭바재기(p)) === null);
    } catch (e) { ok(`${길} 탭바 없음 시험`, false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ── O3 · 탭을 눌러 오간다 ─────────────────────────────────── */
  console.log('\n[O3] 탭으로 오가기');
  {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, '/');
      for (const [글, 길] of [['모임', '/meetings'], ['내정보', '/me'], ['홈', '/']]) {
        await p.click(`nav.tabbar a:has-text("${글}")`);
        await p.waitForURL((u) => new URL(u).pathname === 길, { timeout: 8000 }).catch(() => {});
        const 지금 = new URL(p.url()).pathname;
        ok(`'${글}' 을 누르면 ${길} 로 간다`, 지금 === 길, 지금);
        const t = await 탭바재기(p);
        ok(`${길} 에서 '${글}' 이 지금 탭으로 표시된다`,
           !!t && t.탭.some((x) => x.글 === 글 && x.지금));
      }
    } catch (e) { ok('탭 오가기 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ── O4 · 만들기가 /new 에서 여전히 된다 ───────────────────── */
  console.log('\n[O4] 만들기 흐름 — 홈 → /new → /m/<코드>');
  {
    const { ctx, p } = await 새창();
    let 코드 = null;
    try {
      await 열기(p, '/');
      const 만들기단추 = p.locator('.wrap a.cta', { hasText: '모임 만들기' });
      ok('홈에 ＋ 모임 만들기 단추가 있다', await 만들기단추.count() === 1);
      /* '내 모임' 요약 칸은 없앴다 (논의129) — 아래 [모임] 탭이 같은 일을 거르개까지 달고 한다.
         홈에서 하던 모임으로 가는 길은 그 탭 하나다. */
      ok('홈에 내 모임 요약 칸이 없다', await p.locator('[data-slot="내모임"]').count() === 0);
      ok('모임 탭이 그 길을 맡는다', await p.locator('.tabbar a', { hasText: '모임' }).count() === 1);
      ok('홈에 한 줄 소개가 있다', /[가-힣]/.test((await p.locator('.wrap').innerText()).replace(/홈|모임|내정보|모이머/g, '').trim()));

      /* 여기서부터는 로그인한 사람이다 (논의123) — 카카오 왕복은 기계가 못 누르니
         개발용 임시 로그인으로 진짜 세션을 만든다. 앞의 홈 단정들은 일부러 로그인 전에 본다:
         탭바와 홈 뼈대는 로그인과 상관없이 서 있어야 한다. */
      ok('임시 로그인이 된다', (await 브라우저로그인(p, '시험탭')) === 200);

      await 만들기단추.first().click();
      await p.waitForURL((u) => new URL(u).pathname === '/new', { timeout: 8000 }).catch(() => {});
      ok('만들기 단추가 /new 로 데려간다', new URL(p.url()).pathname === '/new', new URL(p.url()).pathname);

      await p.waitForSelector('#mn', { timeout: 8000 });
      ok('/new 에 만들기 폼이 그대로 있다',
         await p.locator('#mn').count() === 1 && await p.locator('#hn').count() === 1
         && await p.locator('#og').count() === 1 && await p.locator('#mt').count() === 1);
      /* 초대 코드 칸은 /new 에서도 뺐다(오늘 결정) — 초대는 실제 링크로 바로 들어간다.
         6자리를 옮겨 적을 일 자체가 없어야 한다(홈과 같은 결정, tests/홈.mjs 참고). */
      ok('/new 에 초대 코드로 들어가는 칸이 없다',
         !/초대 코드로 들어가기/.test(await p.locator('.wrap').innerText()));

      await p.fill('#mn', 'O시험 탭바'); await p.fill('#hn', '김방장'); await p.fill('#og', '성수역');
      await p.waitForSelector('.rows .row'); await p.click('.rows .row');
      const 만들기 = p.locator('button.cta:not(.sub)');
      ok('만들기 단추가 눌린다', await 만들기.isEnabled());
      await 만들기.click();
      await p.waitForURL(/\/m\/[A-Z0-9]{6}$/, { timeout: 20000 });
      코드 = new URL(p.url()).pathname.split('/').pop();
      ok('모임이 만들어져 모임 화면으로 간다', /^[A-Z0-9]{6}$/.test(코드 || ''), 코드 || '못 갔다');
      ok('모임 화면에는 탭바가 없다', (await 탭바재기(p)) === null);
    } catch (e) { ok('만들기 흐름 시험', false, String(e).split('\n')[0]); }
    /* 내가 만든 모임만 치운다 */
    if (코드) {
      try {
        await p.evaluate((c) => fetch(`/api/m/${c}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'remove' }),
        }).then((r) => r.status), 코드);
      } catch { /* 치우기 실패는 시험 결과가 아니다 */ }
    }
    await ctx.close();
  }

  /* ── O5 · 좁은 화면에서 안 잘린다 · 본문이 안 가린다 ───────── */
  console.log('\n[O5] 430×900 · 390×844');
  for (const 크기 of [{ width: 430, height: 900 }, { width: 390, height: 844 }]) {
    const 이름 = `${크기.width}×${크기.height}`;
    const { ctx, p } = await 새창(크기);
    try {
      await 열기(p, '/');
      const t = await 탭바재기(p);
      ok(`${이름} 탭바가 있다`, !!t);
      if (t) {
        ok(`${이름} 탭바가 화면 밖으로 안 나간다`,
           t.왼끝 >= -0.5 && t.오른끝 <= t.뷰폭 + 0.5, `${t.왼끝}~${t.오른끝} / ${t.뷰폭}`);
        ok(`${이름} 탭 셋이 다 들어간다(가로로 안 넘친다)`, !t.넘침);
        ok(`${이름} 탭 셋이 다 보인다`, t.탭.every((x) => x.w > 40 && x.오른끝 <= t.뷰폭 + 0.5));
        ok(`${이름} 탭이 손가락 자리(48px) 를 넘는다`,
           t.탭.every((x) => x.h >= 48), t.탭.map((x) => Math.round(x.h)).join('/'));
        ok(`${이름} 탭바 높이만큼 본문 아래에 자리가 있다`,
           t.본문아래여백 >= t.h - 1, `여백 ${t.본문아래여백} · 탭바 ${t.h}`);
      }
      /* 맨 아래까지 내려도 마지막 글이 탭바에 안 깔린다 */
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await 쉬기(150);
      const 가림 = await p.evaluate(() => {
        const nav = document.querySelector('nav.tabbar');
        if (!nav) return '탭바 없음';
        const top = nav.getBoundingClientRect().top;
        const 것들 = [...document.querySelectorAll('.wrap .sheet > *')];
        const 겹친 = 것들.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > top + 0.5;
        });
        return 겹친.length ? 겹친.map((el) => (el.textContent || '').slice(0, 12)).join(' / ') : '';
      });
      ok(`${이름} 본문이 탭바에 안 가린다`, 가림 === '', 가림);
    } catch (e) { ok(`${이름} 시험`, false, String(e).split('\n')[0]); }
    await ctx.close();
  }

  /* ── O6 · 층 ──────────────────────────────────────────────── */
  console.log('\n[O6] 층 — 탭바는 모달(20~23)·토스트(30) 아래다');
  {
    const { ctx, p } = await 새창();
    try {
      await 열기(p, '/');
      const t = await 탭바재기(p);
      const z = t ? Number(t.z) : NaN;
      ok('탭바에 층이 정해져 있다', Number.isFinite(z), String(t?.z));
      ok('탭바 층이 모달(20)보다 낮다', Number.isFinite(z) && z < 20, String(t?.z));
    } catch (e) { ok('층 시험', false, String(e).split('\n')[0]); }
    await ctx.close();
  }
} finally {
  await 브라우저.close();
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
if (실패) process.exit(1);
