/* 들어오는 길 — 홈·참여 화면·바깥 API·SSE 의 회귀 시험 (A49·A18·A19·A22·A45·A59·A8).
   node tests/entry.mjs 로 바로 돈다. 개발 서버가 3000 에 떠 있어야 한다.
   화면 결함은 크롬을 실제로 열어서 본다 — 문구가 화면에 뜨는지는 HTML 만 봐서는 알 수 없다. */
import { createRequire } from 'module';

import { 로그인, 브라우저로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

/* 크롬 조종기는 앱에 깔려 있지 않다 — 있는 데를 차례로 찾는다 */
const require = createRequire(import.meta.url);
function 크롬조종기() {
  const 후보 = ['playwright-core',
    'C:/Users/USER/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core',
    'C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core'];
  for (const p of 후보) { try { return require(p).chromium; } catch { /* 다음 데로 */ } }
  return null;
}

/* 쿠키를 들고 다니는 사람 하나 (flowtest 와 같은 방식) */
function person() {
  const jar = new Map();
  return {
    jar,
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const t0 = Date.now();
      const r = await fetch(BASE + path, {
        ...init,
        redirect: 'manual',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [kv] = c.split(';'); const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text, ms: Date.now() - t0, loc: r.headers.get('location') };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

const 방장 = person(), 철수 = person(), 영희 = person(), 새기기 = person();

console.log('\n[0] 준비 — 모임 하나, 강퇴된 사람 하나');
/* 모임 만들기는 로그인 필수다 (논의123) — 개발용 guest 통로로 세션을 만든다 */
await 로그인(방장, 'E입구방장');
const made = await 방장.post('/api/m', {
  name: '입구 시험', hostName: '김방장', scope: 'place',
  origin: '성수역', lat: 37.5446, lng: 127.0560,
});
if (made.status !== 200) { console.log('모임을 못 만들었다 —', made.status, made.text.slice(0, 120)); process.exit(1); }
const CODE = made.json.code;
const P = `/api/m/${CODE}`;
await 철수.post(P, { action: 'join', name: '철수', pin: '1234', origin: '왕십리역', lat: 37.5612, lng: 127.0378 });
await 영희.post(P, { action: 'join', name: '영희', pin: '5678', origin: '홍대입구역', lat: 37.5572, lng: 126.9245 });
const 철수id = (await 방장.get(P)).json.participants.find((p) => p.name === '철수').id;
await 방장.post(P, { action: 'kick', participantId: 철수id });
console.log(`  모임 ${CODE}`);

try {
  console.log('\n[A19] 강퇴된 사람의 "다시 참여 신청하기"');
  const 강퇴자 = await 철수.get(`/join/${CODE}`);
  ok('강퇴된 기기에는 참여 폼이 보인다(되돌려 보내지 않는다)',
     강퇴자.status === 200 && 강퇴자.text.includes('모임 참여'),
     `${강퇴자.status}${강퇴자.loc ? ' → ' + 강퇴자.loc : ''}`);
  const 멤버 = await 영희.get(`/join/${CODE}`);
  ok('정상 멤버는 그대로 모임으로 보낸다',
     멤버.status === 307 && (멤버.loc ?? '').endsWith(`/m/${CODE}`), String(멤버.status));
  /* 논의121 로 규칙이 바뀌었다 — 전에는 '내보내진 사람만' PIN 으로 돌아왔고,
     그래서 이 시험은 '안내가 기기이동을 약속하면 안 된다' 를 지켰다.
     이제는 **멀쩡한 참여자도 이름+PIN 이면 돌아온다.** 안내도 그렇게 말해야 맞다.
     지키는 것은 그대로다: **안내와 서버가 어긋나지 않는다.** 어느 쪽이 참인지가 뒤집혔을 뿐이다.

     논의130 이 열쇠를 셋으로 늘렸다(쿠키·계정·이름+PIN) — 로그인한 사람은 PIN 없이
     **계정**으로 돌아온다. 그래서 견줄 짝도 둘이 됐다: 로그인 안 한 사람의 PIN 안내와
     로그인한 사람의 'PIN 은 필요 없어요' 안내.

     ⚠ **안내를 견주는 자리를 아래 크롬 쪽으로 옮겼다** (논의130 뒤로 이 재기가 낡았다).
        PIN 칸도 그 안내도 이제 **로그인했나를 알고 나서야** 그려진다 —
        form.tsx 가 useEffect 에서 `/api/auth/session` 을 물어보고, 답이 오기 전에는 둘 다 안 그린다.
        그래서 서버가 처음 보내는 HTML 에는 어느 안내도 없다: 여기서 HTML 을 긁던 옛 방식은
        문구가 멀쩡히 화면에 떠 있는데도 '약속 안 함' 으로 읽었다(가짜 실패).
        이 파일 머리말이 적어 둔 그대로다 — 문구가 화면에 뜨는지는 HTML 만 봐서는 알 수 없다.
        재려던 뜻(안내와 서버가 어긋나지 않는다)은 그대로 두고, 재는 자리만 진짜 화면으로 옮긴다. */
  console.log('\n[A18] 돌아오는 길이 실제로 열려 있는가 (논의121·130)');
  const 기기이동 = await 새기기.post(P, {
    action: 'join', name: '영희', pin: '5678', origin: '성수역', lat: 37.5446, lng: 127.0560,
  });
  const 이동가능 = 기기이동.status === 200;
  ok('쿠키를 잃어도 이름+PIN 으로 돌아온다', 이동가능,
     `${기기이동.status} ${기기이동.json?.error ?? ''}`);

  /* 로그인한 사람의 기기이동 (논의130) — PIN 을 아예 안 낸다. 계정이 신원이다.
     같은 닉네임으로 로그인하면 늘 같은 계정이라(tests/세션.mjs) 새 기기를 그렇게 흉내 낸다. */
  const 민수 = person(), 민수새폰 = person();
  await 로그인(민수, 'E입구민수');
  const 민수참여 = await 민수.post(P, {
    action: 'join', name: '민수', origin: '왕십리역', lat: 37.5612, lng: 127.0378,
  });
  await 로그인(민수새폰, 'E입구민수');
  const 계정이동 = await 민수새폰.post(P, {
    action: 'join', name: '민수', origin: '성수역', lat: 37.5446, lng: 127.0560,
  });
  const 계정이동가능 = 계정이동.status === 200 && 계정이동.json?.resumed === true;
  ok('로그인한 사람은 PIN 없이도 참여한다', 민수참여.status === 200,
     `${민수참여.status} ${민수참여.json?.error ?? ''}`);
  ok('쿠키를 잃어도 계정으로 내 자리에 돌아온다', 계정이동가능,
     `${계정이동.status} ${계정이동.json?.error ?? (계정이동.json?.resumed ? 'resumed' : '새 자리가 생겼다')}`);

  console.log('\n[A22] 좌표·반경 검사 (/api/places)');
  const 좌표없음 = await 방장.get('/api/places');
  ok('파라미터가 없으면 400', 좌표없음.status === 400, String(좌표없음.status));
  const 범위밖 = await 방장.get('/api/places?lat=999&lng=999');
  ok('999,999 는 400', 범위밖.status === 400, String(범위밖.status));
  const 영영 = await 방장.get('/api/places?lat=0&lng=0');
  ok('0,0(대서양)은 400 이고 바깥을 안 부른다', 영영.status === 400 && 영영.ms < 1000, `${영영.status} ${영영.ms}ms`);
  const 음수반경 = await 방장.get('/api/places?lat=37.5446&lng=127.056&r=-1');
  ok('반경 -1 은 400 (바깥 타임아웃까지 안 간다)', 음수반경.status === 400 && 음수반경.ms < 2000, `${음수반경.status} ${음수반경.ms}ms`);
  const 큰반경 = await 방장.get('/api/places?lat=37.5446&lng=127.056&r=999999');
  ok('반경 상한을 넘으면 400', 큰반경.status === 400, String(큰반경.status));
  const 정상 = await 방장.get('/api/places?lat=37.5446&lng=127.056&r=300');
  ok('멀쩡한 좌표는 그대로 200', 정상.status === 200 || 정상.status === 429, String(정상.status));

  console.log('\n[A22] 좌표 검사 (/api/geo)');
  const g0 = await 방장.get('/api/geo?lat=0&lng=0');
  ok('0,0 은 바깥을 안 부르고 바로 접는다', g0.status === 503 && g0.ms < 400, `${g0.status} ${g0.ms}ms`);
  const g없음 = await 방장.get('/api/geo');
  ok('파라미터가 없어도 바로 접는다', g없음.status === 503 && g없음.ms < 400, `${g없음.status} ${g없음.ms}ms`);
  const g정상 = await 방장.get('/api/geo?lat=37.5446&lng=127.0560');
  ok('멀쩡한 좌표는 그대로 200', g정상.status === 200, String(g정상.status));

  console.log('\n[A59] 검색어 길이 상한');
  const 긴검색 = await 방장.get(`/api/places/search?q=${'가'.repeat(600)}`);
  ok('600자는 바깥으로 안 나간다',
     긴검색.status === 200 && (긴검색.json?.places?.length ?? -1) === 0 && 긴검색.ms < 500,
     `${긴검색.status} ${긴검색.ms}ms`);
  const 짧은검색 = await 방장.get('/api/places/search?q=성수역');
  ok('멀쩡한 검색어는 그대로 돈다', 짧은검색.status === 200, String(짧은검색.status));

  console.log('\n[A45] 없는 모임의 SSE');
  const 없는코드 = await fetch(`${BASE}/api/m/ZZZZZZ/stream`, { signal: AbortSignal.timeout(5000) });
  ok('없는 모임 코드로는 스트림이 안 열린다', 없는코드.status === 404, String(없는코드.status));
  await 없는코드.body?.cancel().catch(() => {});
  const 있는코드 = await fetch(`${BASE}${P}/stream`, { signal: AbortSignal.timeout(5000) });
  ok('있는 모임은 그대로 열린다', 있는코드.status === 200, String(있는코드.status));
  await 있는코드.body?.cancel().catch(() => {});

  /* ── 화면 ───────────────────────────────────────────────── */
  const chromium = 크롬조종기();
  if (!chromium) {
    ok('크롬 조종기(playwright-core)를 찾았다', false, '없어서 화면 시험을 못 돌렸다');
  } else {
    const b = await chromium.launch({ executablePath: CHROME, headless: true });
    const 가짜출발지 = (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ places: [{ id: 'kakao:t1', name: '성수역', address: '서울 성동구 성수동', lat: 37.5446, lng: 127.056 }] }),
    });
    const 새창 = async () => {
      const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, locale: 'ko-KR' });
      const p = await ctx.newPage();
      await p.route('**/api/places/search*', 가짜출발지);
      return { ctx, p };
    };
    const 화면문구 = async (p) => (await p.locator('.err, .warn').allTextContents()).join(' ').trim();

    /* 위 [A18] 에서 옮겨 온 재기다 — 재려던 뜻은 그대로다: **안내와 서버가 어긋나지 않는다.**
       옮긴 까닭은 위에 적어 두었다(안내가 로그인 여부를 알고 나서야 그려진다). */
    console.log('\n[A18] 참여 화면의 안내가 실제 동작과 맞는가 (논의121·130)');
    const 참여폼문구 = async (p) => (await p.locator('.sheet').innerText()).replace(/\s+/g, ' ');
    {
      /* 로그인 안 한 사람 — 신원은 이름+PIN 이다 (논의121) */
      const { ctx, p } = await 새창();
      try {
        await p.goto(`${BASE}/join/${CODE}`, { waitUntil: 'networkidle' });
        await p.waitForSelector('#pin');                       /* PIN 칸이 떠야 그 안내도 떠 있다 */
        const 약속 = /폰을 바꾸거나|기기가 바뀌|다른 브라우저/.test(await 참여폼문구(p));
        ok('PIN 안내와 서버 동작이 어긋나지 않는다', 이동가능 === 약속,
           `기기이동=${이동가능 ? '된다' : '안 된다'} · 안내=${약속 ? '된다고 함' : '약속 안 함'}`);
      } catch (e) { ok('PIN 안내와 서버 동작이 어긋나지 않는다', false, String(e).split('\n')[0]); }
      await ctx.close();
    }
    {
      /* 로그인한 사람 — 신원은 계정이다 (논의130). PIN 칸 자리에 '왜 안 묻는지'가 대신 온다 */
      const { ctx, p } = await 새창();
      try {
        await p.goto(`${BASE}/join/${CODE}`, { waitUntil: 'networkidle' });
        await 브라우저로그인(p, 'E입구구경꾼');                  /* 같은 출처에 있어야 쿠키가 붙는다 */
        await p.reload({ waitUntil: 'networkidle' });
        await p.waitForSelector('button.cta');
        const 문구 = await 참여폼문구(p);
        const 약속 = /폰을 바꿔도|폰을 바꾸거나|기기가 바뀌|다른 브라우저/.test(문구);
        ok('로그인한 사람에게는 PIN 을 묻지 않는다', !(await p.locator('#pin').count()),
           문구.slice(0, 60));
        ok('계정 안내와 서버 동작이 어긋나지 않는다', 계정이동가능 === 약속,
           `기기이동=${계정이동가능 ? '된다' : '안 된다'} · 안내=${약속 ? '된다고 함' : '약속 안 함'}`);
      } catch (e) { ok('계정 안내와 서버 동작이 어긋나지 않는다', false, String(e).split('\n')[0]); }
      await ctx.close();
    }

    console.log('\n[A49] /new 에서 모임 만들기가 실패했을 때');
    for (const [이름, 응답] of [
      ['500 빈 본문', { status: 500, body: '' }],
      ['400 origin_required', { status: 400, body: '{"error":"origin_required"}' }],
      ['모르는 코드', { status: 400, body: '{"error":"wat_is_this"}' }],
    ]) {
      const { ctx, p } = await 새창();
      try {
      await p.route('**/api/m', (r) => (r.request().method() === 'POST'
        ? r.fulfill({ contentType: 'application/json', ...응답 }) : r.continue()));
      /* networkidle 까지 기다린다 — 하이드레이션 전에 채우면 입력이 리액트에 안 닿는다.
         만들기 폼은 `/` 에서 `/new` 로 옮겨 갔다(O 갈래) — `/` 는 이제 홈이다 */
      await p.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
      await p.fill('#mn', '우리 팀 회식'); await p.fill('#hn', '김방장'); await p.fill('#og', '성수역');
      await p.waitForSelector('.rows .row'); await p.click('.rows .row');
      await p.click('button.cta:not(.sub)');
      await p.waitForTimeout(900);
      const 문구 = await 화면문구(p);
      ok(`만들기 실패(${이름})를 화면이 말한다`, 문구.length > 0, 문구 || '아무 문구도 없다');
      ok(`만들기 실패(${이름}) 문구에 영문 코드가 없다`, /[가-힣]/.test(문구) && !/[a-z]{3,}_[a-z]/.test(문구), 문구.slice(0, 40));
      ok(`만들기 실패(${이름}) 뒤에도 만들기 화면에 남는다`, new URL(p.url()).pathname === '/new', new URL(p.url()).pathname);
      const 단추 = p.locator('button.cta:not(.sub)');
      ok(`만들기 실패(${이름}) 뒤 다시 누를 수 있다`, await 단추.isEnabled());
      } catch (e) { ok(`만들기 실패(${이름}) 화면 시험`, false, String(e).split('\n')[0]); }
      await ctx.close();
    }

    console.log('\n[A8] 참여 화면의 오류 문구');
    for (const [이름, 응답, 기대] of [
      ['pin_wrong', { status: 403, body: '{"error":"pin_wrong"}' }, /PIN/],
      ['awaiting_approval', { status: 409, body: '{"error":"awaiting_approval"}' }, /승인/],
      ['모르는 코드', { status: 400, body: '{"error":"totally_unknown"}' }, /[가-힣]/],
      ['500 빈 본문', { status: 500, body: '' }, /[가-힣]/],
    ]) {
      const { ctx, p } = await 새창();
      try {
      await p.route(`**/api/m/${CODE}`, (r) => (r.request().method() === 'POST'
        ? r.fulfill({ contentType: 'application/json', ...응답 }) : r.continue()));
      await p.goto(`${BASE}/join/${CODE}`, { waitUntil: 'networkidle' });
      await p.fill('#nm', '철수'); await p.fill('#og', '성수역');
      await p.waitForSelector('.rows .row'); await p.click('.rows .row');
      await p.fill('#pin', '1234');
      await p.click('button.cta');
      await p.waitForTimeout(900);
      const 문구 = await 화면문구(p);
      ok(`참여 실패(${이름})를 사람 말로 알린다`, 기대.test(문구) && !/[a-z]{3,}_[a-z]/.test(문구), 문구 || '아무 문구도 없다');
      } catch (e) { ok(`참여 실패(${이름}) 화면 시험`, false, String(e).split('\n')[0]); }
      await ctx.close();
    }
    await b.close();
  }
} finally {
  /* 내가 만든 모임만 치운다 */
  await 방장.post(P, { action: 'remove' });
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
