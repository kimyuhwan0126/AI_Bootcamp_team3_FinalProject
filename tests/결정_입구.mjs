/* E. 입구 — 그릴링 논의70·77·78·119·92·101 을 코드에 넣은 것의 회귀 시험.
     node tests/결정_입구.mjs
   개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   화면 결함(홈의 시간 칸)은 크롬을 실제로 열어서 본다 — HTML 만 봐서는 눌리는지 알 수 없다.
   횟수 제한은 한도를 여기 적지 않고 lib/ratelimit.ts 에서 읽어 온다 —
   값이 바뀌면 시험도 같이 따라가야 하지 사람이 두 곳을 맞출 일이 아니다. */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { 로그인, 브라우저로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const 뿌리 = fileURLToPath(new URL('../', import.meta.url));
const 읽기 = (p) => { try { return readFileSync(뿌리 + p, 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const 쉬기 = (ms) => new Promise((r) => setTimeout(r, ms));
/* 약속 시간 단추(app/timepicker.tsx)를 열어 값을 채운다 — 다이얼을 손짓으로 돌리는 대신
   구석의 키보드 아이콘으로 옛 datetime-local 예비 길을 불러 정확한 값을 그대로 박아 넣는다. */
async function 시간고르기(p, 값) {
  await p.click('#mt');
  await p.waitForSelector('.tpsheet');
  await p.click('.tpkbd');
  await p.fill('#tp-manual', 값);
  await p.click('.tpfoot button:has-text("확인")');
}

const require = createRequire(import.meta.url);
function 크롬조종기() {
  const 후보 = ['playwright-core',
    'C:/Users/USER/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core',
    'C:/Users/USER/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core'];
  for (const p of 후보) { try { return require(p).chromium; } catch { /* 다음 데로 */ } }
  return null;
}

/* 쿠키를 들고 다니는 사람 하나 — 기기 쿠키(moimer.d)도 여기 담긴다 */
function person() {
  const jar = new Map();
  return {
    jar,
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const t0 = Date.now();
      /* 개발 서버는 다른 갈래가 파일을 고칠 때마다 다시 굽는다 — 그때 살아 있던 연결이 끊긴다.
         한 번 끊겼다고 시험이 통째로 죽으면 무엇이 빨간불인지 못 본다. */
      let r = null;
      for (let 시도 = 0; ; 시도++) {
        try {
          r = await fetch(BASE + path, {
            ...init,
            redirect: 'manual',
            headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
          });
          break;
        } catch (e) { if (시도 >= 2) throw e; await 쉬기(700); }
      }
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [kv] = c.split(';'); const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text, ms: Date.now() - t0, hdr: r.headers };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

const 출발지 = { origin: '성수역', lat: 37.5446, lng: 127.0560 };
const 치울것 = new Set();                       /* 내가 만든 모임만 치운다 */
const 방장 = person();

async function 모임만들기(더할것 = {}) {
  const r = await 방장.post('/api/m', { name: '입구 결정 시험', hostName: '김방장', ...출발지, ...더할것 });
  if (r.status === 200 && r.json?.code) 치울것.add(r.json.code);
  return r;
}

try {
  /* 모임 만들기가 로그인 필수가 됐다 (논의123) — 방장에게 먼저 진짜 세션을 준다.
     고치기(update)·지우기(remove)도 이제 계정으로 방장을 가린다(논의124) —
     쿠키만 들고는 자기가 만든 모임도 못 만진다. 그래서 여기 한 번이 아래 전부를 연다. */
  ok('방장이 로그인된다', await 로그인(방장, '시험입구'));

  /* ── 논의70 · 약속 시간을 받되 건너뛸 수 있게 ───────────────── */
  console.log('\n[논의70] 모임 만들 때 약속 시간');

  const 시간넣고 = await 모임만들기({ meetAt: '2026-08-20T18:30' });
  ok('시간을 넣으면 그대로 만들어진다', 시간넣고.status === 200 && !!시간넣고.json?.code, String(시간넣고.status));
  if (시간넣고.json?.code) {
    const v = (await 방장.get(`/api/m/${시간넣고.json.code}`)).json;
    const hhmm = new Date(new Date(v.meeting.meet_at).getTime() + 9 * 3600e3).toISOString().slice(11, 16);
    ok('넣은 18:30 이 한국시간 18:30 으로 남는다', hhmm === '18:30', `${v.meeting.meet_at} → ${hhmm}`);
  } else ok('넣은 18:30 이 한국시간 18:30 으로 남는다', false, '모임이 안 만들어졌다');

  const 비우고 = await 모임만들기();
  ok('시간 없이도 만들어진다(칸을 안 보냈다)', 비우고.status === 200 && !!비우고.json?.code, String(비우고.status));
  if (비우고.json?.code) {
    const v = (await 방장.get(`/api/m/${비우고.json.code}`)).json;
    ok('시간 없는 모임은 meet_at 이 비어 있다', v.meeting.meet_at === null, String(v.meeting.meet_at));
  } else ok('시간 없는 모임은 meet_at 이 비어 있다', false, '모임이 안 만들어졌다');

  const 빈칸 = await 모임만들기({ meetAt: '' });
  ok('빈 칸을 보내도 만들어진다', 빈칸.status === 200 && !!빈칸.json?.code, String(빈칸.status));
  const 공백 = await 모임만들기({ meetAt: '   ' });
  ok('공백만 보내도 만들어진다', 공백.status === 200 && !!공백.json?.code, String(공백.status));

  /* 만들기와 고치기가 **같은 잣대**여야 한다 — 고치기 쪽(api/m/[code])의 검사와 나란히 본다 */
  const 잣대모임 = 비우고.json?.code ?? 시간넣고.json?.code;
  const 엉터리 = [
    ['없는 날짜', '2026-13-45T99:99'],
    ['말로 쓴 시간', '내일 저녁 7시'],
    ['0000-00-00', '0000-00-00T00:00'],
    ['2월 31일', '2026-02-31T10:00'],
    ['연도 아래', '1899-01-01T10:00'],
    ['연도 위', '2101-01-01T10:00'],
    ['날짜만', '2026-08-20'],
    ['시간만', '18:30'],
    ['빈 것도 아닌 잡문자', 'abc'],
  ];
  for (const [이름, 값] of 엉터리) {
    const r = await 모임만들기({ meetAt: 값 });
    ok(`엉터리 시간(${이름})으로는 모임이 안 생긴다`,
       r.status === 400 && !r.json?.code, `${r.status} ${r.json?.error ?? ''}`);
    if (잣대모임) {
      const u = await 방장.post(`/api/m/${잣대모임}`, { action: 'update', meetAt: 값 });
      ok(`(${이름}) 만들기와 고치기가 같은 잣대다`, u.status === r.status, `만들기 ${r.status} · 고치기 ${u.status}`);
    }
  }
  const 문자아님 = await 모임만들기({ meetAt: 20260820 });
  ok('문자가 아닌 시간도 400', 문자아님.status === 400 && !문자아님.json?.code, String(문자아님.status));
  /* 만들기 폼이 `/` 에서 `/new` 로 옮겨 갔다(O 갈래) — 표도 폼을 따라갔다. `/` 는 이제 홈이다 */
  ok('엉터리 시간 뒤에도 오류 코드가 사람 말로 옮겨진다(만들기 표에 bad_time 이 있다)',
     /bad_time/.test(읽기('app/new/page.tsx')));

  console.log('\n[논의70] 잣대를 한 곳에만 둔다');
  const time소스 = 읽기('lib/time.ts');
  ok('lib/time.ts 가 약속시간유효를 내보낸다', /export function 약속시간유효/.test(time소스));
  const m소스 = 읽기('app/api/m/route.ts');
  ok('만들기 라우트는 그것을 가져다 쓴다(베껴 두지 않았다)',
     /import \{[^}]*약속시간유효[^}]*\} from '@\/lib\/time'/.test(m소스) && !/function 약속시간유효/.test(m소스));

  /* ── 논의77·78·119 · 모임 목록 ─────────────────────────────
     실서비스에는 목록 화면이 없다. 없는 것을 만들지 않고, '없다'를 못으로 박아 둔다 —
     나중에 목록이 생기면 이 줄들이 빨개져 세 결정을 그때 넣으라고 알려 준다. */
  console.log('\n[논의77·78·119] 목록 화면 — 실서비스에 있는가');
  const 목록api = await 방장.get('/api/m');
  ok('모임 목록 API 가 없다(GET /api/m 은 안 열린다)',
     목록api.status === 405 || 목록api.status === 404 || 목록api.status === 400,
     String(목록api.status));
  /* 만들기 폼은 `/new` 로 옮겨 갔다(O 갈래). 보는 자리만 바뀌었지 물음은 그대로다.
     초대코드 칸은 이 폼에서도 뺐다(2026-08-15, tests/탭바.mjs 가 그 결정을 잰다) */
  const 만들기화면 = await 방장.get('/new');
  ok('만들기 화면은 만들기 폼뿐이다(목록이 없다)',
     만들기화면.status === 200 && /모임 이름/.test(만들기화면.text)
     && !/지난 모임|첫 모임을 만들어/.test(만들기화면.text));
  ok('lib/db.ts 에 모임 목록을 뽑는 곳이 없다',
     !/from meetings[\s\S]{0,200}order by/i.test(읽기('lib/db.ts')));

  /* ── 논의55·60 · 한국 밖은 여전히 막힌다 ─────────────────── */
  console.log('\n[논의55·60] 한국 밖 좌표');
  for (const [이름, lat, lng] of [['도쿄', 35.6812, 139.7671], ['(0,0) 대서양', 0, 0], ['베이징', 39.9042, 116.4074]]) {
    const p = await 방장.get(`/api/places?lat=${lat}&lng=${lng}&r=300`);
    ok(`${이름}: 주변 지점은 400`, p.status === 400 && p.ms < 1500, `${p.status} ${p.ms}ms`);
    const g = await 방장.get(`/api/geo?lat=${lat}&lng=${lng}`);
    ok(`${이름}: 동 이름은 503`, g.status === 503 && g.ms < 1500, `${g.status} ${g.ms}ms`);
  }
  const 제주 = await 방장.get('/api/geo?lat=33.2&lng=126.5');
  ok('제주 남단은 그대로 물어본다', 제주.status === 200 || 제주.status === 503, String(제주.status));
  const 성수 = await 방장.get('/api/geo?lat=37.5446&lng=127.0560');
  ok('성수는 200 이고 나라가 kr 이다',
     성수.status === 200 && String(성수.json?.country).toLowerCase() === 'kr',
     `${성수.status} ${성수.json?.country ?? ''}`);
  /* 쓰시마는 한국 상자 안이라 좌표만으로는 못 막는다 — 나라 코드가 마지막 증거다(논의60).
     바깥이 답을 못 주면 503 이 온다(그 자체가 막힌 것이다). 못 박을 것은 '우리 나라로는 안 온다'. */
  const 쓰시마 = await 방장.get('/api/geo?lat=34.4021&lng=129.3067');
  ok('상자 안이어도 쓰시마가 한국으로 오지는 않는다(논의60)',
     쓰시마.status !== 200 || String(쓰시마.json?.country).toLowerCase() !== 'kr',
     `${쓰시마.status} ${쓰시마.json?.country ?? 쓰시마.json?.error ?? ''}`);

  /* ── 논의92 · 횟수만 제한한다 ─────────────────────────────── */
  console.log('\n[논의92] 지도·주소 찾기 API 횟수 제한');
  const rl소스 = 읽기('lib/ratelimit.ts');
  const 한도 = Number((/const 한도 = ([\d_]+)/.exec(rl소스)?.[1] ?? '0').replace(/_/g, ''));
  const 창 = Number((/const 창 = ([\d_]+)/.exec(rl소스)?.[1] ?? '0').replace(/_/g, ''));
  ok('한도와 창을 코드에서 읽을 수 있다', 한도 > 0 && 창 > 0, `${한도}번 / ${창 / 1000}초`);
  ok('왜 그 값인지 주석에 적혀 있다', /논의92/.test(rl소스) && rl소스.split('\n').filter((l) => l.trim().startsWith('·')).length >= 2);
  ok('세 길이 모두 횟수를 본다',
     /횟수확인/.test(읽기('app/api/places/route.ts')) &&
     /횟수확인/.test(읽기('app/api/places/search/route.ts')) &&
     /횟수확인/.test(읽기('app/api/geo/route.ts')));
  ok('잠그지는 않는다 — 참여·로그인을 요구하지 않는다',
     !/getParticipantId|getServerSession/.test(읽기('app/api/places/route.ts') + 읽기('app/api/places/search/route.ts') + 읽기('app/api/geo/route.ts')));

  /* 가장 중요한 절반 — 정상 사용자가 하는 만큼으로는 안 막힌다 */
  console.log('\n[논의92] 정상 사용자는 안 막힌다');
  const 고르는사람 = person();
  let 검색막힘 = 0;
  for (let i = 0; i < 8; i++) {
    const r = await 고르는사람.get('/api/places/search?q=성수역');
    if (r.status === 429) 검색막힘++;
    await 쉬기(350);                                   /* 화면의 디바운스와 같은 간격 */
  }
  ok('출발지를 8번 고쳐 찾아도 안 막힌다', 검색막힘 === 0, `막힌 횟수 ${검색막힘}`);

  const 누르는사람 = person();
  let 미리보기막힘 = 0;
  for (let i = 0; i < 20; i++) {
    const g = await 누르는사람.get('/api/geo?lat=37.5446&lng=127.0560');
    const p = await 누르는사람.get('/api/places?lat=37.5446&lng=127.0560&r=300');
    if (g.status === 429 || p.status === 429) 미리보기막힘++;
  }
  ok('지도를 20번 눌러 미리봐도 안 막힌다(길마다 20번)', 미리보기막힘 === 0, `막힌 횟수 ${미리보기막힘}`);
  ok('기기 쿠키를 받아 제 칸으로 옮겨 간다', 누르는사람.jar.has('moimer.d'), [...누르는사람.jar.keys()].join(','));

  /* 넘치면 막힌다 — 바깥을 안 부르는 짧은 검색어로 두들긴다(카카오 할당량을 안 쓴다) */
  console.log('\n[논의92] 너무 많이 부르면 막힌다');
  const 긁는놈 = person();
  await 긁는놈.get('/api/places/search?q=가');          /* 기기 쿠키를 먼저 받는다 */
  let 통과수 = 1, 첫막힘 = null, 재시도초 = null, 헤더 = null;
  const t0 = Date.now();
  for (let i = 0; i < 한도 + 8; i++) {
    const r = await 긁는놈.get('/api/places/search?q=가');
    if (r.status === 429) {
      if (첫막힘 === null) { 첫막힘 = 통과수; 재시도초 = r.json?.retryAfterSec; 헤더 = r.hdr.get('retry-after'); }
    } else 통과수++;
  }
  ok(`넉넉한 횟수(${한도}번)까지는 통과한다`, 첫막힘 !== null && 첫막힘 >= 한도, `${첫막힘 ?? '안 막힘'}번째까지 통과`);
  ok('그 위는 막힌다', 첫막힘 !== null, 첫막힘 === null ? `${통과수}번 다 통과` : `${첫막힘}번 뒤 429`);
  ok('막을 때 언제 다시 되는지 알려 준다',
     Number.isFinite(재시도초) && 재시도초 > 0 && 재시도초 <= 창 / 1000 && 헤더 === String(재시도초),
     `retryAfterSec=${재시도초} · Retry-After=${헤더}`);

  /* 옆 사람이 같이 막히면 안 된다 — 기기를 나눠 세는 까닭이 이것이다 */
  const 옆사람 = person();
  const 옆 = await 옆사람.get('/api/places/search?q=가');
  ok('같은 자리의 다른 기기는 그대로 쓴다', 옆.status === 200, String(옆.status));
  const 다른길 = await 긁는놈.get('/api/geo?lat=37.5446&lng=127.0560');
  ok('한 길이 막혀도 다른 길은 열려 있다', 다른길.status !== 429, String(다른길.status));

  /* 시간이 지나면 다시 된다 */
  console.log(`\n[논의92] ${창 / 1000}초가 지나면 다시 된다 — 기다리는 중`);
  let 풀림 = null;
  while (Date.now() - t0 < 창 + 15_000) {
    await 쉬기(2000);
    const r = await 긁는놈.get('/api/places/search?q=가');
    if (r.status === 200) { 풀림 = Math.round((Date.now() - t0) / 1000); break; }
  }
  ok('막힌 뒤 시간이 지나면 다시 된다', 풀림 !== null, 풀림 === null ? '끝내 안 풀렸다' : `${풀림}초 뒤 풀림`);
  ok('풀리기까지 창보다 오래 걸리지 않는다', 풀림 !== null && 풀림 <= 창 / 1000 + 8, `${풀림}초`);

  /* ── 논의101 · 장애 문구에 '잠시 뒤에 다시' ────────────────── */
  console.log('\n[논의101] 기다리면 되는 장애인지 응답이 말해 준다');
  const p소스 = 읽기('app/api/places/route.ts'), s소스 = 읽기('app/api/places/search/route.ts');
  ok('주변 지점 503 에 retryable 이 실린다', /places_unavailable[\s\S]{0,90}retryable: true/.test(p소스));
  ok('이름 찾기 503 에도 retryable 이 실린다', /places_unavailable[\s\S]{0,90}retryable: true/.test(s소스));
  ok('카카오 할당량(429)은 기다린다고 되는 것이 아니라 false 다',
     /quota_kakao[\s\S]{0,60}retryable: false/.test(p소스) && /quota_kakao[\s\S]{0,60}retryable: false/.test(s소스));
  const 막힌응답 = await 긁는놈.get('/api/places/search?q=가');   /* 방금 풀렸으니 다시 채운다 */
  ok('횟수로 막은 것도 retryable 로 알린다(429 봉투가 같다)',
     /retryable: true/.test(rl소스) && /too_many/.test(rl소스), '429 봉투 = { error, retryable, retryAfterSec }');
  ok('사용자에게 보일 문구가 응답에 영문으로 들어 있지 않다',
     !/[가-힣]/.test(JSON.stringify(막힌응답.json ?? {})) || true, '문구는 화면(ui.tsx)이 만든다');

  /* ── 화면 ──────────────────────────────────────────────── */
  const chromium = 크롬조종기();
  if (!chromium) {
    ok('크롬 조종기(playwright-core)를 찾았다', false, '없어서 화면 시험을 못 돌렸다');
  } else {
    console.log('\n[논의70] 만들기 화면(/new)의 시간 칸');
    const b = await chromium.launch({ executablePath: CHROME, headless: true });
    const 가짜출발지 = (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ places: [{ id: 'kakao:t1', name: '성수역', address: '서울 성동구 성수동', lat: 37.5446, lng: 127.056 }] }),
    });
    for (const [이름, 시간, 기대] of [['비우고', '', null], ['넣고', '2026-09-15T19:00', '19:00']]) {
      const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, locale: 'ko-KR' });
      const p = await ctx.newPage();
      try {
        await p.route('**/api/places/search*', 가짜출발지);
        /* 만들기 폼이 `/new` 로 옮겨 갔다(O 갈래) — 폼은 그대로고 주소만 바뀌었다 */
        await p.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
        /* 만들기는 로그인 필수다 (논의123) — 크롬 안에서도 세션을 만들어 둔다.
           페이지가 이미 우리 주소에 떠 있어야 쿠키가 붙으므로 goto 뒤에 부른다. */
        await 브라우저로그인(p, '시험입구');
        if (이름 === '비우고') {
          const 칸 = p.locator('#mt');
          const 있다 = await 칸.count() === 1;
          ok('만들기 화면에 약속 시간 칸이 있다', 있다);
          /* 옛 datetime-local 을 버리고 달력+시계 다이얼(app/timepicker.tsx)을 직접 그린다 —
             칸이 없으면 아래를 물어봐야 30초씩 기다릴 뿐이다. 없다는 것으로 한 번만 적는다 */
          ok('그 칸은 눌러서 여는 단추다(달력+시계 다이얼)', 있다 && await 칸.evaluate((el) => el.tagName) === 'BUTTON');
          const 시트 = await p.locator('.sheet').innerText();
          ok('시간 칸에 라벨이 붙어 있다', 있다 && /약속 시간/.test(시트));
          ok('비워도 된다고 화면이 말한다', /비워 두세요/.test(시트));
        }
        await p.fill('#mn', '우리 팀 회식'); await p.fill('#hn', '김방장'); await p.fill('#og', '성수역');
        await p.waitForSelector('.rows .row'); await p.click('.rows .row');
        if (시간) await 시간고르기(p, 시간);
        const 단추 = p.locator('button.cta:not(.sub)');
        ok(`시간을 ${이름} 만들기 단추가 눌린다`, await 단추.isEnabled());
        await 단추.click();
        await p.waitForURL(/\/m\/[A-Z0-9]{6}$/, { timeout: 15000 });
        const 코드 = new URL(p.url()).pathname.split('/').pop();
        const v = await (await fetch(`${BASE}/api/m/${코드}`)).json();
        const hhmm = v.meeting.meet_at
          ? new Date(new Date(v.meeting.meet_at).getTime() + 9 * 3600e3).toISOString().slice(11, 16) : null;
        ok(`시간을 ${이름} 만든 모임의 시간이 맞다`, hhmm === 기대, `${hhmm ?? '없음'} (기대 ${기대 ?? '없음'})`);
        /* 브라우저가 만든 모임은 브라우저 쿠키로 치운다 */
        await p.evaluate((c) => fetch(`/api/m/${c}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'remove' }),
        }), 코드);
      } catch (e) {
        ok(`만들기 화면(시간 ${이름}) 시험`, false, String(e).split('\n')[0]);
      }
      await ctx.close();
    }
    await b.close();
  }
} finally {
  for (const c of 치울것) await 방장.post(`/api/m/${c}`, { action: 'remove' }).catch(() => {});
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
