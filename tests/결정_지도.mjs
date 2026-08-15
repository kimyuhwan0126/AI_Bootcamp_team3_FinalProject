/* D. 지도·스타일 — 그릴링 결정 회귀 시험 (논의67 · 81 · 108 · 61).
   node tests/결정_지도.mjs 로 바로 돈다. 카카오는 막아서 폴백 지도(OSM)를 강제한다.
   타일은 가짜로 채운다 — 남의 서버 사정에 시험 결과가 흔들리면 안 된다.
   'localhost' 는 ::1 로 먼저 붙어 undici 가 10초를 흘려보낸다 — 주소를 못 박는다. */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 로그인 } from './세션.mjs';

const 여기 = dirname(fileURLToPath(import.meta.url));
const 앱 = join(여기, '..');
const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = process.env.MOIMER_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* 논의67 의 실측 자리 — 430×900 에서 쟀다. 여기서 벗어나면 근거도 다시 재야 한다 */
const 한도 = 18;
const 가짜타일 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const 적기 = (s) => console.log(`    · ${s}`);

/** 쿠키를 들고 다니는 사람 하나 (flowtest 와 같은 방식) */
function person() {
  const jar = new Map();
  return {
    jar,
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
      let json = null; try { json = JSON.parse(text); } catch { /* 본문이 JSON 이 아닐 수도 있다 */ }
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

/* 모임 만들기가 로그인 필수가 됐다 (논의123) — 방장에게 진짜 세션을 준다.
   방장 판정도 계정으로 바뀌었으니(논의124) 확정·지우기까지 이 쿠키가 따라가야 한다.
   `로그인` 은 call 하나만 바라므로 person() 을 그대로 넘긴다.
   참여(join)는 로그인이 필요 없다 — 손님·구경꾼은 예전 그대로다. */
const 방장로그인 = async (누가) => {
  if (!(await 로그인(누가, '시험지도'))) throw new Error('방장 로그인 실패');
};

const 만든것 = [];
const 성수 = { lat: 37.5447, lng: 127.0557 };

/** 가운데에서 km 반경으로 고르게 흩뿌린 자리 (이름 길이도 제각각 — 한글 폭은 글자 수로 못 잰다) */
const 흩기 = (n, km, 중심 = 성수) =>
  Array.from({ length: n }, (_, i) => {
    const 각 = i * 2.399963;                                  /* 황금각 — 고르게 퍼진다 */
    const 반 = km * Math.sqrt((i + 0.5) / n);
    const 글 = '가나다라마바사아자차'.slice(i % 10, (i % 10) + 1 + (i % 3));
    return {
      name: `${글}${i + 1}집`,
      lat: 중심.lat + (반 * Math.cos(각)) / 111,
      lng: 중심.lng + (반 * Math.sin(각)) / (111 * Math.cos((중심.lat * Math.PI) / 180)),
    };
  });

/** 지역을 확정해 '지점' 단계까지 밀어 둔 모임. 지점은 묶지 않으니(논의42 ①)
    이름표 한도만 홀로 재 볼 수 있다. n곳 중 표더줄곳 곳에는 표를 하나 더 준다.
    화면은 '아직 아무 데도 안 찍은 사람'의 눈으로 연다 — 내가 찍은 곳은 테두리가 3px 라
    이름표가 4px 씩 커진다. 논의67 의 실측도 그 눈으로 쟀다. */
async function 지점모임(이름, n, 표더줄곳 = 한도) {
  const 방장 = person();
  await 방장로그인(방장);
  const r = await 방장.post('/api/m', {
    name: 이름, hostName: '김방장', scope: 'place', purpose: '음식',
    origin: '성수역', lat: 성수.lat, lng: 성수.lng,
  });
  if (!r.json?.code) throw new Error('모임을 못 만들었다: ' + r.text);
  const code = r.json.code;
  만든것.push({ code, 방장 });
  await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'region', refId: '성수동', name: '성수동', ...성수 });
  const v = (await 방장.get(`/api/m/${code}`)).json;
  const 성수id = v.candidates.find((c) => c.name === '성수동').id;
  const cf = await 방장.post(`/api/m/${code}`, { action: 'confirm', candidateId: 성수id });
  if (!cf.json?.ok) throw new Error('지역을 못 확정했다: ' + cf.text);

  const 곳 = 흩기(n, 0.35);
  for (const [i, c] of 곳.entries())
    await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'place', refId: `p${i}`, name: c.name, lat: c.lat, lng: c.lng });

  /* 표를 갈라 둔다 — '선택이 많은 것이 이름표를 갖는가'를 재려면 표가 같으면 안 된다 */
  let 표많은곳 = 곳.map((c) => c.name);
  if (표더줄곳 < n) {
    const 손님 = person();
    const j = await 손님.post(`/api/m/${code}`, {
      action: 'join', name: '이손님', pin: '1234', origin: '건대입구역', lat: 37.5403, lng: 127.0695, transport: 'transit',
    });
    if (!j.json?.ok) throw new Error('참여자가 못 들어갔다: ' + j.text);
    표많은곳 = [];
    for (const [i, c] of 곳.entries()) {
      if (i % 3 === 2 && 표많은곳.length < 표더줄곳) {      /* 앞뒤로 흩어 놓아야 '차례대로'가 아님이 드러난다 */
        await 손님.post(`/api/m/${code}`, { action: 'ping', kind: 'place', refId: `p${i}`, name: c.name, lat: c.lat, lng: c.lng });
        표많은곳.push(c.name);
      }
    }
    for (const [i, c] of 곳.entries()) {
      if (표많은곳.length >= 표더줄곳) break;
      if (i % 3 !== 2) {
        await 손님.post(`/api/m/${code}`, { action: 'ping', kind: 'place', refId: `p${i}`, name: c.name, lat: c.lat, lng: c.lng });
        표많은곳.push(c.name);
      }
    }
  }
  const 구경꾼 = person();
  const g = await 구경꾼.post(`/api/m/${code}`, {
    action: 'join', name: '박구경', pin: '4321', origin: '뚝섬역', lat: 37.5471, lng: 127.0472, transport: 'transit',
  });
  if (!g.json?.ok) throw new Error('구경꾼이 못 들어갔다: ' + g.text);
  return { code, 방장, 구경꾼, 곳, 표많은곳 };
}

/** 지역 단계 모임 — 지도를 눌러 후보를 만드는 길(논의81)을 재는 데 쓴다 */
async function 지역모임(이름) {
  const 방장 = person();
  await 방장로그인(방장);
  const r = await 방장.post('/api/m', {
    name: 이름, hostName: '김방장', scope: 'place', purpose: '음식',
    origin: '홍대입구역', lat: 37.5572, lng: 126.9245,
  });
  if (!r.json?.code) throw new Error('모임을 못 만들었다: ' + r.text);
  const code = r.json.code;
  만든것.push({ code, 방장 });
  for (const c of [{ name: '연남동', lat: 37.5626, lng: 126.9256 }, { name: '망원동', lat: 37.5559, lng: 126.9020 }])
    await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'region', refId: c.name, name: c.name, lat: c.lat, lng: c.lng });
  return { code, 방장 };
}

/* ── 화면에서 재는 것들 ─────────────────────────────────── */
const 재기 = () => {
  const el = document.querySelector('.osm');
  if (!el) return null;
  const m = el.getBoundingClientRect();
  const 상자 = (n) => {
    const r = n.getBoundingClientRect();
    return { l: r.left - m.left, t: r.top - m.top, r: r.right - m.left, b: r.bottom - m.top, w: r.width, h: r.height };
  };
  return {
    W: m.width, H: m.height,
    pins: [...document.querySelectorAll('.opin')].map((n) =>
      ({ ...상자(n), text: n.textContent.trim(), 읽을말: (n.getAttribute('aria-label') ?? '').trim() })),
    /* 방장 도구는 이제 스피드다이얼(.dial-item·.dial-toggle)이다 */
    fixed: [...document.querySelectorAll('.ozoom,.ocred,.acts .fab,.dial-item,.dial-toggle')].map(상자),
    묶인것: [...document.querySelectorAll('.odot[data-mute]')].map((n) => ({
      ...상자(n), text: (n.getAttribute('aria-label') ?? '').trim(),
    })),
    점: document.querySelectorAll('.odot').length,
    /* 미리보기 — 지도에 짚는 자리(.opre)와 시트에 서는 줄(.row[data-preview]) 둘로 나뉜다 (논의81) */
    미리: (() => { const p = document.querySelector('.opre'); return p ? 상자(p) : null; })(),
    미리줄: [...document.querySelectorAll('.row[data-preview]')].map((n) => n.textContent.trim()),
  };
};

const 겹친넓이 = (a, b) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const 겹친쌍 = (pins) => {
  const out = [];
  for (let i = 0; i < pins.length; i++)
    for (let j = i + 1; j < pins.length; j++)
      if (겹친넓이(pins[i], pins[j]) > 4) out.push(`${pins[i].text}×${pins[j].text}`);
  return out;
};
const 이름표수 = (pins) => pins.filter((p) => !p.text.startsWith('이 근처')).length;
const 잘린것 = (r) => r.pins.filter((p) => p.l < -0.6 || p.r > r.W + 0.6 || p.t < -0.6 || p.b > r.H + 0.6);
const 붙박이침범 = (r) => r.pins.filter((p) => r.fixed.some((q) => 겹친넓이(p, q) > 4));
/** 이름표가 지도에서 차지한 넓이 (논의67 의 '지도의 50%' 를 그대로 잰다) */
const 덮은비 = (r) => r.pins.reduce((a, p) => a + p.w * p.h, 0) / (r.W * r.H);

async function 열기(browser, code, jar, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: opt.높이 ?? 900 } });
  if (jar) await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, domain: '127.0.0.1', path: '/' })));
  const page = await ctx.newPage();
  await page.route('**dapi.kakao.com**', (r) => r.abort());          /* 폴백 지도를 강제한다 */
  /* 시험은 가짜 타일로 — 남의 서버 사정에 결과가 흔들리면 안 된다.
     사람이 볼 사진(진짜타일)만 진짜를 받아 오되, 못 받으면 가짜로 메운다:
     세 번 실패하면 '지도를 불러오지 못했어요'가 떠서 정작 봐야 할 이름표가 사라진다. */
  await page.route('**tile.openstreetmap.org/**', async (r) => {
    if (opt.타일없이) return r.abort();
    if (!opt.진짜타일) return r.fulfill({ status: 200, contentType: 'image/png', body: 가짜타일 });
    try { await r.fulfill({ response: await r.fetch({ timeout: 8000 }) }); }
    catch { await r.fulfill({ status: 200, contentType: 'image/png', body: 가짜타일 }); }
  });
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.osm', { timeout: 20000 });
  await page.waitForTimeout(1600);
  return { ctx, page };
}

const 중심찍기 = async (page, dx = 0, dy = 0) => {
  const m = await page.evaluate(() => {
    const r = document.querySelector('.osm').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(m.x + dx, m.y + dy);
  await page.waitForTimeout(600);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const 사진감 = {}, 사진 = {};

try {
  /* ── 논의67 : 이름표는 18곳까지 ─────────────────────── */
  console.log('\n[논의67] 이름표는 18곳까지만 펼친다');
  for (const n of [3, 9, 17, 18, 19, 20, 25]) {
    const M = await 지점모임(`지도결정 ${n}곳`, n, Math.min(n, 한도));
    const { ctx, page } = await 열기(browser, M.code, M.구경꾼.jar);
    const r = await page.evaluate(재기);
    const 보인이름 = 이름표수(r.pins);
    const 바람 = Math.min(n, 한도);
    적기(`${n}곳 → 이름표 ${보인이름}개 · 묶인 점 ${r.묶인것.length}개 · 덮은 넓이 ${(덮은비(r) * 100).toFixed(0)}%`);
    ok(`${n}곳 — 이름표가 ${바람}개다`, 보인이름 === 바람, `${보인이름}개`);
    ok(`${n}곳 — 이름표를 못 받은 ${n - 바람}곳은 점으로 묶인다`,
      r.묶인것.length === n - 바람, `${r.묶인것.length}개`);
    ok(`${n}곳 — 이름표가 하나도 안 겹친다`, 겹친쌍(r.pins).length === 0, `${겹친쌍(r.pins).length}쌍`);
    ok(`${n}곳 — 화면 밖으로 잘린 이름표가 없다`, 잘린것(r).length === 0, `${잘린것(r).length}개`);
    ok(`${n}곳 — 단추 위에 얹힌 이름표가 없다`, 붙박이침범(r).length === 0, `${붙박이침범(r).length}개`);
    /* 논의72 — 핀은 숫자만 보이지만 읽어 주는 말은 문장이어야 한다 (카카오 쪽과 같은 글자) */
    ok(`${n}곳 — 이름표마다 읽어 주는 말이 붙는다`,
      r.pins.every((p) => /^.+ · \d+명이 골랐어요$/.test(p.읽을말)),
      r.pins.find((p) => !/^.+ · \d+명이 골랐어요$/.test(p.읽을말))?.읽을말 ?? r.pins[0]?.읽을말 ?? '없음');
    if (n > 한도) {
      const 이름 = r.pins.map((p) => p.text.replace(/\s+\d+$/, ''));
      const 남 = 이름.filter((x) => !M.표많은곳.includes(x));
      ok(`${n}곳 — 이름표는 선택이 많은 곳이 갖는다`, 남.length === 0, 남.join(',') || '전부 표 많은 곳');
      const 묶인이름 = r.묶인것.map((p) => p.text.split(' · ')[0]);
      ok(`${n}곳 — 묶인 것은 선택이 적은 곳이다`,
        묶인이름.length > 0 && 묶인이름.every((x) => !M.표많은곳.includes(x)), 묶인이름.join(','));
      /* 이름이 안 보이는 점이라 읽어 주는 말이 유일한 이름이다 (논의72) */
      ok(`${n}곳 — 묶인 곳도 이름과 표를 읽어 준다`,
        r.묶인것.every((p) => /^.+ · \d+명이 골랐어요$/.test(p.text)), r.묶인것[0]?.text ?? '없음');
      ok(`${n}곳 — 이름표가 지도의 40% 를 안 넘는다`, 덮은비(r) < 0.4, `${(덮은비(r) * 100).toFixed(0)}%`);
    }
    if (n === 9 || n === 18 || n === 25) 사진감[n] = { code: M.code, jar: M.구경꾼.jar };
    if (n === 25) {
      /* 확대해도 곳수로 끊는 규칙이 그대로인가 — 거리로 끊으면 여기서 숫자가 튄다 */
      for (const 번 of [1, 2]) {
        await page.click('.ozoom button[aria-label="확대"]');
        await page.waitForTimeout(700);
        const z = await page.evaluate(재기);
        적기(`확대 ${번}번 → 이름표 ${이름표수(z.pins)}개 · 묶인 점 ${z.묶인것.length}개`);
        ok(`25곳 — 확대 ${번}번 뒤에도 이름표가 ${한도}개를 안 넘는다`, 이름표수(z.pins) <= 한도, `${이름표수(z.pins)}개`);
        ok(`25곳 — 확대 ${번}번 뒤에도 겹치지 않는다`, 겹친쌍(z.pins).length === 0, `${겹친쌍(z.pins).length}쌍`);
        ok(`25곳 — 확대 ${번}번 뒤에도 이름표+점이 후보 수를 안 넘는다`,
          이름표수(z.pins) + z.묶인것.length <= 25, `${이름표수(z.pins)}+${z.묶인것.length}`);
      }
    }
    await ctx.close();
  }

  /* ── 논의81 : 지도를 누르면 미리보기가 먼저 ─────────────
     자리를 갈랐다: 지도는 누른 자리를 위로 알리고(onPick) 회색으로 짚어 준다(.opre),
     '여기로 할까요?' 를 세우고 굳히는 일은 화면(ui.tsx)이 한다. 여기서는 지도 몫만 못 박는다. */
  console.log('\n[논의81] 지도를 누르면 미리보기가 먼저 뜬다');
  {
    const M = await 지역모임('지도결정 미리보기');
    const { ctx, page } = await 열기(browser, M.code, M.방장.jar);
    const 셈 = async () => (await M.방장.get(`/api/m/${M.code}`)).json.candidates.length;
    const 표합 = async () => (await M.방장.get(`/api/m/${M.code}`)).json.candidates.reduce((a, c) => a + c.votes, 0);
    const 전 = await 셈(), 표전 = await 표합();

    await 중심찍기(page, 40, -50);
    await page.waitForTimeout(1600);
    const r1 = await page.evaluate(재기);
    ok('지도를 한 번 눌러서는 후보가 안 생긴다', (await 셈()) === 전 && (await 표합()) === 표전,
      `후보 ${전}→${await 셈()} · 표 ${표전}→${await 표합()}`);
    ok('누른 자리가 미리보기로 선다', r1.미리줄.length === 1, r1.미리줄.join(' / ') || '없음');
    ok('미리보기 줄에 굳히는 말이 있다', (r1.미리줄[0] ?? '').includes('여기로 할까요'), r1.미리줄[0] ?? '없음');

    await 중심찍기(page, -70, 70);
    await page.waitForTimeout(1600);
    const r2 = await page.evaluate(재기);
    ok('다른 곳을 눌러도 미리보기는 늘 하나뿐이다', r2.미리줄.length === 1, r2.미리줄.join(' / ') || '없음');
    ok('옮겨도 후보는 아직 안 생긴다', (await 셈()) === 전 && (await 표합()) === 표전,
      `후보 ${전}→${await 셈()} · 표 ${표전}→${await 표합()}`);

    await page.click('.row[data-preview]');
    let 후 = 전, 표후 = 표전;
    for (let i = 0; i < 20 && 후 === 전 && 표후 === 표전; i++) {
      await page.waitForTimeout(400); 후 = await 셈(); 표후 = await 표합();
    }
    const 쪽지 = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
    /* 누른 자리가 이미 후보인 동이면 후보가 아니라 표가 는다 — 둘 중 하나면 굳은 것이다 */
    ok('한 번 더 눌러야 그제서야 표가 된다', 후 === 전 + 1 || 표후 === 표전 + 1,
      `후보 ${전}→${후} · 표 ${표전}→${표후}${쪽지 ? ` · 쪽지 "${쪽지}"` : ''}`);
    /* 서버가 먼저 바뀌고 화면이 뒤따른다 — 사라질 때까지 잠깐 기다려 준다 */
    let 남은줄 = 1;
    for (let i = 0; i < 10 && 남은줄; i++) {
      await page.waitForTimeout(400);
      남은줄 = await page.evaluate(() => document.querySelectorAll('.row[data-preview]').length);
    }
    ok('굳히고 나면 미리보기 줄이 사라진다', 남은줄 === 0, `${남은줄}줄`);
    await ctx.close();
  }
  {
    /* 못 찍는 사람은 누를 수 없다 — 눌러 봐야 403 이다 (논의34) */
    const M = await 지역모임('지도결정 미리보기 구경꾼');
    const { ctx, page } = await 열기(browser, M.code, null);
    await 중심찍기(page);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(재기);
    ok('못 찍는 사람에게는 미리보기가 안 선다', r.미리줄.length === 0 && !r.미리, r.미리줄.join(' / ') || '없음');
    await ctx.close();
  }
  {
    /* 타일이 죽으면 어디를 누른 것인지 아무도 모른다 (논의43 ①) */
    const M = await 지역모임('지도결정 미리보기 타일죽음');
    const { ctx, page } = await 열기(browser, M.code, M.방장.jar, { 타일없이: true });
    await 중심찍기(page);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(재기);
    ok('타일이 죽으면 누른 자리를 알리지도 않는다', r.미리줄.length === 0 && !r.미리);
    await ctx.close();
  }
  {
    /* 지도가 그릴 자리 표시의 모양 — 아직 아무것도 아니라는 것이 색만 봐도 보여야 한다.
       ui.tsx 가 OsmMap 에 preview 를 넘기면 이 모양이 그대로 뜬다 (넘기는 것에 적어 두었다). */
    const M = await 지역모임('지도결정 미리보기 모양');
    const { ctx, page } = await 열기(browser, M.code, M.방장.jar);
    const s = await page.evaluate(() => {
      const osm = document.querySelector('.osm');
      const r = osm.getBoundingClientRect();
      const d = document.createElement('span');
      d.className = 'opre';
      d.style.left = '120px'; d.style.top = '90px';
      d.style.animation = 'none';        /* 뜨는 시늉이 첫 프레임을 0.7배로 줄인다 — 재는 동안은 끈다 */
      osm.appendChild(d);
      const g = getComputedStyle(d);
      const b = d.getBoundingClientRect();
      const 맞은것 = document.elementFromPoint(r.left + 120, r.top + 90);
      const 값 = { 테두리: g.borderTopStyle, 색: g.borderTopColor, 손: g.pointerEvents, 층: Number(g.zIndex),
        w: b.width, h: b.height, 가운데: Math.round(b.left - r.left + b.width / 2),
        맞은것: 맞은것 ? `${맞은것.tagName}.${맞은것.className}` : 'none' };
      d.remove();
      /* 시트의 미리보기 줄도 후보 줄과 달라 보여야 한다 */
      const 줄 = document.createElement('button');
      줄.className = 'row'; 줄.setAttribute('data-preview', '');
      document.querySelector('.sheet').appendChild(줄);
      const g2 = getComputedStyle(줄);
      const 보통 = document.createElement('button'); 보통.className = 'row';
      document.querySelector('.sheet').appendChild(보통);
      const g3 = getComputedStyle(보통);
      값.줄테두리 = g2.borderTopStyle; 값.줄바탕 = g2.backgroundColor; 값.보통바탕 = g3.backgroundColor;
      값.줄높이 = 줄.getBoundingClientRect().height;
      줄.remove(); 보통.remove();
      return 값;
    });
    적기(`.opre ${s.w}×${s.h} ${s.테두리} ${s.색} · z${s.층} · 줄 ${s.줄테두리} ${s.줄바탕}`);
    ok('미리보기 표시는 점선이다', s.테두리 === 'dashed', s.테두리);
    ok('미리보기 표시는 핀만 하다', s.w >= 20 && s.w <= 40 && Math.abs(s.w - s.h) < 1, `${s.w}×${s.h}`);
    ok('미리보기 표시는 회색이다', s.색 === 'rgb(91, 100, 114)', s.색);
    ok('미리보기 표시는 찍은 자리 한가운데에 온다', Math.abs(s.가운데 - 120) < 1, `${s.가운데}px`);
    ok('미리보기 표시가 지도 누르기를 막지 않는다', s.손 === 'none' && !s.맞은것.includes('opre'),
      `${s.손} · ${s.맞은것}`);
    ok('미리보기 표시는 핀보다 아래에 안 깔린다', s.층 >= 5, `z${s.층}`);
    ok('미리보기 줄은 후보 줄과 달라 보인다', s.줄테두리 === 'dashed' && s.줄바탕 !== s.보통바탕,
      `${s.줄테두리} · ${s.줄바탕} vs ${s.보통바탕}`);
    ok('미리보기 줄도 손가락 자리 48px 을 지킨다', s.줄높이 >= 48, `${s.줄높이}px`);
    await ctx.close();
  }

  /* ── 논의108 : 토스트가 시트 위로 ───────────────────── */
  console.log('\n[논의108] 알림 쪽지는 시트가 올라오면 그 위로');
  {
    const M = await 지역모임('지도결정 토스트');
    const { ctx, page } = await 열기(browser, M.code, M.방장.jar);
    const t = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap');
      const 재기 = (attr, 변수) => {
        const d = document.createElement('div');
        d.className = 'toast';
        d.textContent = '여긴 고를 수 없어요 — 지역 안을 눌러 주세요';
        if (attr) d.setAttribute('data-sheet', '');
        if (변수) d.style.setProperty('--sheet-h', 변수);
        /* 뜨는 시늉(animation)이 첫 프레임에 6px 을 옮긴다 — 자리를 재는 동안은 끈다 */
        d.style.animation = 'none';
        wrap.appendChild(d);
        const r = d.getBoundingClientRect();
        const z = getComputedStyle(d).zIndex;
        d.remove();
        return { t: r.top, b: r.bottom, z: Number(z) };
      };
      const s = document.querySelector('.sheet').getBoundingClientRect();
      return { 위: 재기(false), 시트위: 재기(true), 시트위높이줌: 재기(true, '300px'), 시트: { t: s.top, h: s.height } };
    });
    적기(`토스트 기본 top ${Math.round(t.위.t)} · data-sheet bottom ${Math.round(t.시트위.b)} · 시트 top ${Math.round(t.시트.t)}`);
    ok('평소엔 화면 위쪽에 뜬다', Math.abs(t.위.t - 64) < 2, `top ${Math.round(t.위.t)}px`);
    ok('시트가 올라오면 시트 머리 위로 간다', t.시트위.b <= t.시트.t + 1,
      `쪽지 밑 ${Math.round(t.시트위.b)} ≤ 시트 위 ${Math.round(t.시트.t)}`);
    ok('시트 위 자리가 화면 밖으로 안 나간다', t.시트위.t > 0, `top ${Math.round(t.시트위.t)}px`);
    ok('시트 높이를 알려 주면 그만큼만 올라간다', Math.abs(t.시트위높이줌.b - (900 - 312)) < 2,
      `bottom ${Math.round(t.시트위높이줌.b)}`);
    ok('두 자리 모두 층은 30 그대로다', t.위.z === 30 && t.시트위.z === 30, `${t.위.z}·${t.시트위.z}`);
    await ctx.close();
  }

  /* ── 논의61 : 핀은 32/46px 예외 ─────────────────────── */
  console.log('\n[논의61] 지도 핀은 32/46px — 48px 의 예외로 적는다');
  {
    const M = await 지점모임('지도결정 핀크기', 4, 4);
    const { ctx, page } = await 열기(browser, M.code, M.방장.jar);
    const v = await page.evaluate(() => {
      /* 1위 핀은 크기가 다르다 — 보통 핀을 따로 집어야 32px 을 잰다 */
      const p = [...document.querySelectorAll('.opin')].find((x) => !x.hasAttribute('data-first'));
      const f = document.querySelector('.opin[data-first]') ?? p;
      const 값 = (e) => getComputedStyle(e).getPropertyValue('--pintap').trim();
      const 닿는높이 = (e) => {
        const r = e.getBoundingClientRect();
        const 몫 = getComputedStyle(e, '::before').height;
        return { 보이는: r.height, 닿는: parseFloat(몫) };
      };
      return { pin: 값(p), first: 값(f), 재봄: 닿는높이(p), gap: null };
    });
    적기(`--pintap ${v.pin} · 1위 ${v.first} · 보이는 ${v.재봄.보이는.toFixed(1)}px → 닿는 ${v.재봄.닿는}px`);
    ok('보통 핀의 손가락 자리는 32px 이다', v.pin === '32px', v.pin);
    ok('1위 핀의 손가락 자리는 46px 이다', v.first === '46px', v.first);
    /* 넓힌 자리는 getBoundingClientRect 에 안 잡힌다 — 보이는 것과 ::before 중 큰 쪽이 실제로 닿는 자리다 */
    ok('실제로 닿는 자리가 32px 아래로는 안 내려간다', Math.max(v.재봄.닿는, v.재봄.보이는) >= 32,
      `보이는 ${v.재봄.보이는.toFixed(1)} · 넓힌 ${v.재봄.닿는}`);
    await ctx.close();
  }
  {
    const css = readFileSync(join(앱, 'app/globals.css'), 'utf8');
    const 자리 = css.slice(Math.max(0, css.indexOf('--pintap') - 900), css.indexOf('--pintap'));
    ok('css 에 논의61 이 예외로 적혀 있다', /논의61/.test(자리), 자리.match(/논의\d+/g)?.join(',') ?? '없음');
    ok('왜 못 넓히는지(GAP) 근거가 적혀 있다', /GAP/.test(자리) && /48/.test(자리));
    ok('목록이 정식 길이라는 것도 적혀 있다', /목록/.test(자리));
    const 크레딧 = css.slice(Math.max(0, css.indexOf('.ocred{') - 700), css.indexOf('.ocred{'));
    ok('.ocred 도 같은 예외로 적혀 있다', /48px/.test(크레딧) && /논의61/.test(크레딧));
  }

  /* ── 눈으로 볼 사진 ─────────────────────────────────── */
  console.log('\n[사진] 후보 9곳·18곳·25곳을 나란히');
  for (const n of [9, 18, 25]) {
    const g = 사진감[n];
    if (!g) continue;
    const { ctx, page } = await 열기(browser, g.code, g.jar, { 진짜타일: true });
    await page.waitForTimeout(2500);                              /* 진짜 타일이 다 붙을 때까지 */
    사진[n] = await page.locator('.map').screenshot();
    적기(`${n}곳 찍음`);
    await ctx.close();
  }
  if (사진[9] && 사진[18] && 사진[25]) {
    const 판 = await browser.newPage({ viewport: { width: 1420, height: 410 } });
    const 칸 = [9, 18, 25].map((n) =>
      `<figure><figcaption>후보 ${n}곳 — 이름표 ${Math.min(n, 한도)}개${n > 한도 ? ` · 나머지 ${n - 한도}곳은 점` : ''}</figcaption>
       <img src="data:image/png;base64,${사진[n].toString('base64')}"></figure>`).join('');
    await 판.setContent(`<style>
      body{margin:0;background:#f5f7fb;font:14px/1.5 "Malgun Gothic",system-ui,sans-serif;display:flex;gap:16px;padding:16px}
      figure{margin:0;width:430px;flex:0 0 auto} figcaption{font-weight:800;margin-bottom:8px;color:#171a21}
      img{display:block;width:430px;border:1px solid #e2e6ee;border-radius:10px}
    </style>${칸}`);
    const 밖 = join(앱, '..', '..', '실질 위치');
    mkdirSync(밖, { recursive: true });
    const 파일 = join(밖, '결정_지도.png');
    writeFileSync(파일, await 판.screenshot({ fullPage: true }));
    await 판.close();
    적기(`사진: ${파일}`);
  }
} finally {
  await browser.close();
  /* 내가 만든 모임만 치운다 */
  for (const { code, 방장 } of 만든것) await 방장.post(`/api/m/${code}`, { action: 'remove' });
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
