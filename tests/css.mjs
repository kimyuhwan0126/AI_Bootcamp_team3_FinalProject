/* 겹침·손가락(스타일) 회귀 시험 — app/globals.css 가 되돌아가면 여기서 빨간불이 켜진다.
   A9  지도 위 투명 띠(.acts)가 지도 탭을 삼키는가
   A33 잘린 방장 도구에 '더 있다'는 신호가 있는가
   A30 타일이 죽었을 때 안내가 핀 위에 오는가
   A32 겹친 모달의 층이 갈리는가
   A54 손가락 닿는 자리가 48px 인가

   실제 화면을 열어 elementFromPoint 로 재는 이유 — ::before 로 넓힌 자리는
   getBoundingClientRect 에 안 잡힌다. '가장자리를 눌렀을 때 그 단추가 잡히는가'만이 진짜다.

   돌리는 법: node tests/css.mjs   (개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다)) */
import { chromium } from 'playwright-core';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* 지도 핀은 서로 밀어내며 자리를 잡는다 — osmmap.tsx 가 벌려 주는 최소 틈이 GAP=4px 이라
   위아래 2px 씩이 한도다(보이는 28.4 → 32, 1위 42 → 46).
   48px 로 올리려면 osmmap.tsx 의 GAP 이 먼저 넓어져야 한다. */
const PIN_TAP = 32, PIN_TAP_FIRST = 46;

/* 고치기 전 화면을 그대로 되살리는 덮개 — `CSS_BEFORE=1 node tests/css.mjs` 로 빨간불을 확인한다.
   globals.css 를 되돌렸다 되살리면 같은 시각에 그 파일을 읽는 다른 갈래가 헛것을 본다.
   나중에 붙는 style 태그라 같은 무게(specificity)면 이쪽이 이긴다. */
const 고치기전 = `
.acts{pointer-events:auto;z-index:5;-webkit-mask-image:none;mask-image:none}
.acts-fix{pointer-events:auto}
.modal,.modal~.modal,.modal~.modal~.modal,.modal~.modal~.modal~.modal{z-index:20}
.modal:has(~.modal),.wrap:has(>.modal) .sheet .modal{background:rgba(16,20,30,.42)}
.tiledead{z-index:auto}
.mini::before,.zone button::before,.ozoom button::before,.opin::before{content:none}
`;
const 전 = process.env.CSS_BEFORE === '1';

let pass = 0, fail = 0;
const 결과 = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; 결과.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; 결과.push(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const 잰값 = [];
const 적기 = (s) => 잰값.push('  · ' + s);

/* ── 시험용 모임 하나 만들기 ────────────────────────────── */
const 쿠키 = (res, code) => {
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  for (const c of raw) {
    const m = c.match(new RegExp(`moimer\\.p\\.${code}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
};

async function post(path, body, cookie) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/* 방장 쿠키 항아리 — 로그인 세션 쿠키와 참가자 쿠키를 함께 든다 (논의123).
   방장 줄에 계정이 박히면 참가자 쿠키만으로는 방장이 아니다(논의124) —
   그래서 크롬 화면에도 세션 쿠키까지 같이 심어야 방장 도구(.acts)가 그려진다. */
const 방장항아리 = new Map();
const 방장쿠키 = () => [...방장항아리].map(([k, v]) => `${k}=${v}`).join('; ');
async function 방장call(path, init = {}) {
  const c = 방장쿠키();
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}), ...(init.headers || {}) },
  });
  (r.headers.getSetCookie?.() ?? []).forEach((s) => {
    const [kv] = s.split(';');
    const i = kv.indexOf('=');
    방장항아리.set(kv.slice(0, i), kv.slice(i + 1));
  });
  return { status: r.status, text: await r.text() };
}

/* 지도 한가운데(C·D·E)를 일부러 붙여 둔다 — 뭉친 핀이 타일 죽음 안내 위에 얹히고(A30),
   이름표끼리 서로 밀어내는 '가장 빡빡한 자리'가 손가락 넓히기의 시험대가 된다(A54). */
const 후보들 = [
  { refId: 'csstest-a', name: '가동',   lat: 37.5450, lng: 126.9500 },
  { refId: 'csstest-b', name: '나동',   lat: 37.5750, lng: 126.9900 },
  { refId: 'csstest-c', name: '한가운데동', lat: 37.5600, lng: 126.9700 },
  { refId: 'csstest-d', name: '바로옆동', lat: 37.5604, lng: 126.9700 },
  { refId: 'csstest-e', name: '마동',   lat: 37.5560, lng: 126.9800 },
];

async function 모임만들기() {
  /* 모임 만들기는 로그인 필수다 (논의123) — 방장만 로그인한다. 참여(join)는 그대로다. */
  if (!(await 로그인({ call: 방장call }, '시험모양'))) throw new Error('시험용 로그인이 안 됐다');
  const r = await 방장call('/api/m', {
    method: 'POST',
    body: JSON.stringify({
      name: 'CSS 시험 모임', hostName: '방장', scope: 'region',
      origin: '서울시청', lat: 37.5665, lng: 126.978, transport: 'transit',
    }),
  });
  if (r.status !== 200) throw new Error('모임 만들기 실패 ' + r.status + ' ' + r.text);
  const { code } = JSON.parse(r.text);
  const host = 방장쿠키();                     /* 세션 + moimer.p.<코드> 를 통째로 */

  /* 방장은 한 곳도 안 고른다 — 그래야 '지역 고르기' 단추까지 떠서 도구가 넘친다(A33 조건) */
  const 참여 = async (name, pin, lat, lng) => {
    const j = await post(`/api/m/${code}`, {
      action: 'join', name, pin, origin: name + ' 출발', lat, lng,
    });
    if (!j.ok) throw new Error(`참여 실패 ${name} ${j.status}`);
    return `moimer.p.${code}=${쿠키(j, code)}`;
  };
  const p2 = await 참여('참여자둘', '1234', 37.5563, 126.9236);
  const p3 = await 참여('참여자셋', '5678', 37.5100, 127.0600);

  for (const c of 후보들) {
    const r2 = await post(`/api/m/${code}`, { action: 'ping', kind: 'region', ...c }, p2);
    if (!r2.ok) throw new Error('ping 실패 ' + (await r2.text()));
  }
  /* 멀찍이 떨어진 '가동'에 표를 하나 더 — 1위 핀(.opin[data-first])이 뭉침에 안 먹히게 */
  await post(`/api/m/${code}`, { action: 'ping', kind: 'region', ...후보들[0] }, p3);

  return { code, host };
}

/* ── 화면 안에서 도는 재는 도구 ─────────────────────────── */
const 재는도구 = () => {
  window.__hit = (el) => {
    const r = el.getBoundingClientRect();
    const cx = Math.floor(r.left + r.width / 2) + 0.5, cy = Math.floor(r.top + r.height / 2) + 0.5;
    const 잡힘 = (x, y) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const e = document.elementFromPoint(x, y);
      return !!e && (e === el || el.contains(e));
    };
    if (!잡힘(cx, cy)) return null;
    /* 화소의 '가운데'를 찍어 센다 — 경계(정수 좌표)를 찍으면 반올림 탓에 1px 이 깎여 보인다.
       세는 것은 '이 단추가 실제로 잡히는 화소가 몇 줄인가' 다. */
    const 늘리기 = (dx, dy) => { let n = 0; while (n < 60 && 잡힘(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    const 반올림 = (n) => Math.round(n * 10) / 10;
    return {
      w: 늘리기(-1, 0) + 늘리기(1, 0) + 1, h: 늘리기(0, -1) + 늘리기(0, 1) + 1,
      보이는w: 반올림(r.width), 보이는h: 반올림(r.height),
    };
  };
  /* 지도 넓이 중 무엇이 몇 %를 먹는가 — 격자를 훑는다 */
  window.__sweep = (step = 4) => {
    const map = document.querySelector('.map');
    const r = map.getBoundingClientRect();
    const 셈 = { map: 0, 띠: 0, 단추: 0, 핀: 0, 확대: 0, 저작권: 0, 그밖: 0 };
    let 전체 = 0;
    for (let y = r.top + 1; y < r.bottom - 1; y += step) {
      for (let x = r.left + 1; x < r.right - 1; x += step) {
        전체++;
        const e = document.elementFromPoint(Math.round(x), Math.round(y));
        if (!e) { 셈.그밖++; continue; }
        if (e.closest('.fab')) 셈.단추++;
        else if (e.closest('.acts,.acts-fix')) 셈.띠++;
        else if (e.closest('.opin')) 셈.핀++;
        else if (e.closest('.ozoom')) 셈.확대++;
        else if (e.closest('.ocred')) 셈.저작권++;
        else if (e.closest('.map')) 셈.map++;
        else 셈.그밖++;
      }
    }
    const pct = (n) => Math.round((n / 전체) * 1000) / 10;
    return { 전체, 지도: pct(셈.map), 띠: pct(셈.띠), 단추: pct(셈.단추), 핀: pct(셈.핀),
      확대: pct(셈.확대), 저작권: pct(셈.저작권), 그밖: pct(셈.그밖) };
  };
};

async function 화면열기(browser, code, host, w, h, { 타일막기 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  /* host 는 '이름=값; 이름=값' 한 줄이다 — 참가자 쿠키만 심으면 방장 도구가 안 그려진다 */
  await ctx.addCookies(host.split('; ').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return { name: c.slice(0, i), value: c.slice(i + 1), domain: '127.0.0.1', path: '/', sameSite: 'Lax' };
  }));
  const page = await ctx.newPage();
  /* 카카오를 막아 OSM 폴백을 띄운다 — 핀(.opin)·확대(.ozoom)가 실제 DOM 으로 나온다 */
  await page.route(/dapi\.kakao\.com|daumcdn\.net/, (r) => r.abort());
  if (타일막기) await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await page.addInitScript(재는도구);
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.osm', { timeout: 15000 });
  await page.waitForTimeout(타일막기 ? 1800 : 1400);
  if (전) await page.addStyleTag({ content: 고치기전 });
  return { ctx, page };
}

/* ── 본 시험 ────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let 지울코드 = null;
try {
  const { code, host } = await 모임만들기();
  지울코드 = { code, host };

  for (const [w, h] of [[375, 667], [430, 900]]) {
    const 크기 = `${w}×${h}`;
    const { ctx, page } = await 화면열기(browser, code, host, w, h);

    /* ── A9 ── 도구를 접은 평소 화면. 띠는 단추 두 개뿐인데도 지도 오른쪽을 세로로 다 덮는다 */
    const s0 = await page.evaluate(() => window.__sweep(4));
    적기(`${크기} [도구 접음] 지도 ${s0.지도}% / 띠 ${s0.띠}% / 단추 ${s0.단추}% / 핀 ${s0.핀}% / 확대 ${s0.확대}% / 저작권 ${s0.저작권}%`);
    ok(`A9 ${크기} 접힌 화면에서 빈 띠가 지도 탭을 안 삼킨다`, s0.띠 <= 0.5, `띠 ${s0.띠}%`);

    /* 방장 도구를 편다 — '⋯ 더보기' */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.acts-fix .fab')].find((x) => x.textContent.includes('더보기'));
      b?.click();
    });
    await page.waitForTimeout(300);

    const 단추수 = await page.evaluate(() => document.querySelectorAll('.acts .fab').length);
    const 핀글 = await page.evaluate(() => [...document.querySelectorAll('.opin')].map((e) => e.textContent.trim()));
    적기(`${크기} 도구 단추 ${단추수}개 · 핀 [${핀글.join(' | ')}]`);
    ok(`${크기} 이름표가 뭉치지 않고 하나씩 그려졌다(시험 전제)`, 핀글.length >= 4, `핀 ${핀글.length}개`);

    const s = await page.evaluate(() => window.__sweep(4));
    적기(`${크기} [도구 폄] 지도 ${s.지도}% / 띠 ${s.띠}% / 단추 ${s.단추}% / 핀 ${s.핀}% / 확대 ${s.확대}% / 저작권 ${s.저작권}%`);
    ok(`A9 ${크기} 편 화면에서 빈 띠가 지도 탭을 안 삼킨다`, s.띠 <= 0.5, `띠 ${s.띠}%`);

    const pe = await page.evaluate(() => {
      const a = document.querySelector('.acts'), f = document.querySelector('.acts .fab');
      return { 띠: getComputedStyle(a).pointerEvents, 단추: f ? getComputedStyle(f).pointerEvents : null };
    });
    ok(`A9 ${크기} .acts=none · 단추=auto`, pe.띠 === 'none' && pe.단추 === 'auto',
      `.acts:${pe.띠} .fab:${pe.단추}`);

    /* ── A33 ── 넘치면 '더 있다'는 신호 */
    const sc = await page.evaluate(() => {
      const a = document.querySelector('.acts'), st = getComputedStyle(a);
      a.scrollTop = -9999;                       /* column-reverse 라 위로 넘친다 */
      const 위로스크롤됨 = a.scrollTop;
      a.scrollTop = 0;
      return { ch: a.clientHeight, sh: a.scrollHeight, 위로스크롤됨,
        mask: st.maskImage === 'none' ? st.webkitMaskImage : st.maskImage };
    });
    적기(`${크기} .acts 보이는 높이 ${sc.ch} / 실제 높이 ${sc.sh} (mask: ${String(sc.mask).slice(0, 46)})`);
    if (sc.sh > sc.ch + 1) {
      ok(`A33 ${크기} 잘린 도구에 더 있다는 신호가 있다`, !!sc.mask && sc.mask !== 'none', `mask-image:${sc.mask}`);
      ok(`A33 ${크기} 넘쳐도 스크롤은 살아 있다`, sc.위로스크롤됨 < 0, `scrollTop ${sc.위로스크롤됨}`);

      /* .acts 를 pointer-events:none 으로 만들었으니(A9) 띠의 빈 곳을 잡고는 못 넘긴다.
         단추를 잡고는 넘어가야 한다 — 안 되면 잘린 단추에 영영 못 닿는다. */
      const 단추자리 = await page.evaluate(() => {
        const a = document.querySelector('.acts');
        a.scrollTop = 0;
        const r = a.querySelector('.fab').getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await page.mouse.move(단추자리.x, 단추자리.y);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(200);
      const 굴린뒤 = await page.evaluate(() => document.querySelector('.acts').scrollTop);
      적기(`${크기} 단추 위에서 굴린 뒤 .acts scrollTop ${굴린뒤}`);
      ok(`A33 ${크기} 단추를 잡으면 잘린 도구까지 넘어간다`, 굴린뒤 < 0, `scrollTop ${굴린뒤}`);
      await page.evaluate(() => { document.querySelector('.acts').scrollTop = 0; });
    } else {
      적기(`${크기} 도구가 안 넘쳐 A33 판정 건너뜀`);
    }

    /* ── A54 ── 손가락 닿는 자리 */
    /* 지도 것(확대·핀·저작권)과 시트 것(.mini)은 따로 잰다.
       375×667 에서는 머리말+지도+시트가 화면보다 커서 쪽 자체가 세로로 밀린다 —
       .mini 를 보이게 끌어올리면 지도가 위로 밀려 확대 단추의 넓힌 자리 윗동이
       화면 밖으로 나간다(48→46). 화면 밖은 애초에 손가락이 못 닿는 자리다.
       재는 것은 '지도를 보고 있을 때 그 단추가 잡히는가' 이므로 지도 것은 맨 위에서 잰다. */
    const 쪽밀림 = await page.evaluate(() => {
      const d = document.documentElement;
      return { 쪽높이: d.scrollHeight, 화면높이: innerHeight, 밀린만큼: Math.round(scrollY) };
    });
    적기(`${크기} 쪽 높이 ${쪽밀림.쪽높이} / 화면 ${쪽밀림.화면높이} — 쪽이 세로로 ${Math.max(0, 쪽밀림.쪽높이 - 쪽밀림.화면높이)}px 넘친다`);

    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(120);
    const tap = await page.evaluate(() => {
      const 하나 = (sel) => { const e = document.querySelector(sel); return e ? window.__hit(e) : null; };
      return {
        ozoom: 하나('.ozoom button'),
        opin: (() => { const e = [...document.querySelectorAll('.opin')].find((x) => !x.hasAttribute('data-first')); return e ? window.__hit(e) : null; })(),
        opinFirst: 하나('.opin[data-first]'),
        ocred: 하나('.ocred'),
      };
    });
    /* 사람 줄은 시트 아래쪽이라 화면 밖이다 — 재려면 먼저 끌어올린다 */
    await page.evaluate(() => document.querySelector('.mini')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    tap.mini = await page.evaluate(() => {
      const e = document.querySelector('.mini');
      return e ? window.__hit(e) : null;
    });
    for (const [k, v] of Object.entries(tap))
      적기(`${크기} ${k} 닿는 자리 ${v ? `${v.w}×${v.h}` : '없음'} (보이는 ${v ? `${v.보이는w}×${v.보이는h}` : '-'})`);

    ok(`A54 ${크기} .mini 48px`, !!tap.mini && tap.mini.h >= 48 && tap.mini.w >= 48,
      tap.mini ? `${tap.mini.w}×${tap.mini.h}` : '못 찾음');
    ok(`A54 ${크기} .ozoom 48px`, !!tap.ozoom && tap.ozoom.h >= 48 && tap.ozoom.w >= 48,
      tap.ozoom ? `${tap.ozoom.w}×${tap.ozoom.h}` : '못 찾음');
    ok(`A54 ${크기} .opin ${PIN_TAP}px 이상`, !!tap.opin && tap.opin.h >= PIN_TAP,
      tap.opin ? `${tap.opin.w}×${tap.opin.h}` : '못 찾음');
    ok(`A54 ${크기} .opin[data-first] ${PIN_TAP_FIRST}px 이상`, !!tap.opinFirst && tap.opinFirst.h >= PIN_TAP_FIRST,
      tap.opinFirst ? `${tap.opinFirst.w}×${tap.opinFirst.h}` : '못 찾음');

    /* 지도 출처만은 48px 을 안 준다(보이는 17px 그대로).
       48px 로 넓히면 지도 왼쪽 아래 143×48 이 다시 탭을 삼켜 A9 를 작게 되풀이한다.
       근거를 숫자로 묶어 둔다 — 넓히면 저작권이 먹는 지도 넓이가 이 선을 넘는다. */
    ok(`A54 ${크기} .ocred 는 48px 예외 — 대신 지도를 3.5% 넘게 안 먹는다`,
      s.저작권 <= 3.5, `저작권 ${s.저작권}%`);
    ok(`A54 ${크기} .ocred 는 그래도 눌린다`, !!tap.ocred && tap.ocred.h >= 16,
      tap.ocred ? `${tap.ocred.w}×${tap.ocred.h}` : '못 찾음');

    /* 넓힌 핀끼리 겹치면 옆 것이 대신 눌린다 — 겹침 0 이어야 넓힌 뜻이 산다 */
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(120);
    const 겹침 = await page.evaluate((want) => {
      const pins = [...document.querySelectorAll('.opin')];
      const 못미친것 = [];
      let 최소세로틈 = Infinity;
      for (const p of pins) {
        const r = window.__hit(p);
        if (!r) { 못미친것.push('가려짐'); continue; }
        if (r.h < Math.min(want, 60)) 못미친것.push(`${p.textContent.trim()}:${r.h}`);
      }
      for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i].getBoundingClientRect(), b = pins[j].getBoundingClientRect();
        if (a.right < b.left || b.right < a.left) continue;          /* 가로로 안 겹치면 무관 */
        최소세로틈 = Math.min(최소세로틈, Math.max(b.top - a.bottom, a.top - b.bottom));
      }
      return { 수: pins.length, 못미친것, 최소세로틈: Number.isFinite(최소세로틈) ? Math.round(최소세로틈 * 10) / 10 : null };
    }, PIN_TAP);
    적기(`${크기} 핀 ${겹침.수}개 · 세로로 이웃한 이름표 사이 최소 틈 ${겹침.최소세로틈 ?? '없음(안 겹침)'}px`);
    ok(`A54 ${크기} 넓힌 핀이 서로를 안 가린다`, 겹침.못미친것.length === 0, 겹침.못미친것.join(', '));

    /* ── A32 ── 모달 층 */
    const z = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap');
      const made = [0, 1, 2].map(() => { const d = document.createElement('div'); d.className = 'modal'; wrap.appendChild(d); return d; });
      const zs = made.map((d) => getComputedStyle(d).zIndex);
      const toast = document.createElement('div'); toast.className = 'toast'; wrap.appendChild(toast);
      const tz = getComputedStyle(toast).zIndex;
      made.forEach((d) => d.remove()); toast.remove();
      return { zs: zs.map(Number), toast: Number(tz) };
    });
    적기(`${크기} 겹친 모달 z-index ${z.zs.join(' → ')} · 토스트 ${z.toast}`);
    ok(`A32 ${크기} 겹친 모달의 층이 갈린다`, z.zs[0] < z.zs[1] && z.zs[1] < z.zs[2], z.zs.join(','));
    ok(`A32 ${크기} 토스트가 모달보다 위다`, z.toast > Math.max(...z.zs), `${z.toast} > ${Math.max(...z.zs)}`);

    /* 뒷막은 한 겹만 — 형제 다섯끼리도, .sheet 안에 홀로 있는 '모임 설정' 과도 */
    const 뒷막 = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap'), sheet = document.querySelector('.sheet');
      const 만들기 = (부모) => { const d = document.createElement('div'); d.className = 'modal'; 부모.appendChild(d); return d; };
      const 설정 = 만들기(sheet), 아래 = 만들기(wrap), 위 = 만들기(wrap);
      const 읽기 = (d) => getComputedStyle(d).backgroundColor;
      const r = { 형제아래: 읽기(아래), 형제위: 읽기(위), 시트안: 읽기(설정) };
      [설정, 아래, 위].forEach((d) => d.remove());
      return r;
    });
    const 투명 = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    적기(`${크기} 뒷막 — .sheet 안:${뒷막.시트안} / 아래 형제:${뒷막.형제아래} / 맨 위:${뒷막.형제위}`);
    ok(`A32 ${크기} 뒷막은 맨 위 모달 하나만 깐다`,
      투명(뒷막.형제아래) && 투명(뒷막.시트안) && !투명(뒷막.형제위),
      `시트안 ${뒷막.시트안} · 아래 ${뒷막.형제아래} · 위 ${뒷막.형제위}`);

    /* 모임 설정 시트 안의 삭제 단추 */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.acts .fab')].find((x) => x.textContent.includes('모임 설정'));
      b?.click();
    });
    await page.waitForTimeout(250);
    const zone = await page.evaluate(() => {
      const e = document.querySelector('.zone button');
      return e ? window.__hit(e) : null;
    });
    /* 홀로 열린 '모임 설정' 은 .sheet 안에 있어도 뒷막이 있어야 한다 —
       뒷막 겹침을 걷는 규칙이 여기까지 먹으면 시트가 시트 위에 떠 있는 꼴이 된다 */
    const 혼자뒷막 = await page.evaluate(() => {
      const m = document.querySelector('.sheet .modal');
      return m ? getComputedStyle(m).backgroundColor : null;
    });
    적기(`${크기} '모임 설정' 만 열렸을 때 뒷막 ${혼자뒷막}`);
    ok(`A32 ${크기} 홀로 열린 '모임 설정' 은 뒷막이 있다`,
      !!혼자뒷막 && 혼자뒷막 !== 'rgba(0, 0, 0, 0)' && 혼자뒷막 !== 'transparent', String(혼자뒷막));
    적기(`${크기} .zone button 닿는 자리 ${zone ? `${zone.w}×${zone.h}` : '없음'} (보이는 ${zone ? `${zone.보이는w}×${zone.보이는h}` : '-'})`);
    ok(`A54 ${크기} .zone button 48px`, !!zone && zone.h >= 48, zone ? `${zone.w}×${zone.h}` : '못 찾음');

    await ctx.close();
  }

  /* ── A30 ── 타일이 죽었을 때 안내가 핀 위로 */
  {
    const { ctx, page } = await 화면열기(browser, code, host, 375, 667, { 타일막기: true });
    const r = await page.evaluate(() => {
      const t = document.querySelector('.tiledead');
      if (!t) return null;
      /* 진짜 핀이 안 남더라도 층 규칙 자체는 재야 한다 — 핀을 둘 심어 견준다.
         (osmmap.tsx 가 죽은 지도에서 핀을 안 그리게 바뀌었어도 CSS 는 제 몫을 해야 한다) */
      const osm = document.querySelector('.osm');
      const 심기 = (first) => { const e = document.createElement('button'); e.className = 'opin';
        if (first) e.setAttribute('data-first', 'true'); e.textContent = '견줌'; osm.appendChild(e); return e; };
      const p = 심기(false), f = 심기(true);
      const z = { tiledead: getComputedStyle(t).zIndex, opin: getComputedStyle(p).zIndex, first: getComputedStyle(f).zIndex };
      p.remove(); f.remove();

      const b = t.querySelector('b').getBoundingClientRect();
      const 가린것 = [];
      for (let n = 0.1; n <= 0.95; n += 0.05) {
        const e = document.elementFromPoint(Math.round(b.left + b.width * n), Math.round(b.top + b.height / 2));
        if (e && e.closest('.opin')) 가린것.push(Math.round(n * 100) + '%');
      }
      return { ...z, 가린것, 남은핀: document.querySelectorAll('.opin').length };
    });
    if (!r) {
      ok('A30 타일 죽음 화면을 만들었다(시험 전제)', false, '.tiledead 가 안 떴다');
    } else {
      적기(`A30 z-index — .tiledead:${r.tiledead} .opin:${r.opin} .opin[data-first]:${r.first} (죽은 지도에 남은 핀 ${r.남은핀}개)`);
      ok('A30 .tiledead 가 핀보다 위 층이다',
        Number(r.tiledead) > Number(r.opin) && Number(r.tiledead) > Number(r.first),
        `${r.tiledead} vs ${r.opin}/${r.first}`);
      ok('A30 안내 문구를 가리는 핀이 없다', r.가린것.length === 0, `가린 지점: ${r.가린것.join(',') || '없음'}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  /* 내가 만든 모임만 치운다 */
  if (지울코드) await post(`/api/m/${지울코드.code}`, { action: 'remove' }, 지울코드.host).catch(() => {});
}

console.log(`\n[${전 ? '고치기 전 (CSS_BEFORE=1 — 옛 css 를 덮어씌운 화면)' : '지금'}]`);
console.log('\n[잰 값]');
console.log(잰값.join('\n'));
console.log('\n[판정]');
console.log(결과.join('\n'));
console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
