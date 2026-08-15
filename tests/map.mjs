/* OSM 폴백 지도 회귀 시험 — A11·A12·A27·A28·A29·A30·A34.
   node tests/map.mjs 로 바로 돈다. 카카오는 막아서 폴백 지도를 강제한다.
   타일은 가짜로 채운다 — 남의 서버 사정에 시험 결과가 흔들리면 안 된다.
   'localhost' 는 ::1 로 먼저 붙어 undici 가 10초를 흘려보낸다 — 주소를 못 박는다. */
import { chromium } from 'playwright-core';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const CHROME = process.env.MOIMER_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const 가짜타일 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

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

const 만든것 = [];
async function 모임(이름, 후보, 방장출발지 = { origin: '홍대입구역', lat: 37.5572, lng: 126.9245 }) {
  const 방장 = person();
  /* 모임 만들기는 로그인 필수다 (논의123). 방장만 세션을 만든다 — 참여·찍기는 그대로다.
     항아리가 세션 쿠키까지 들고 다니므로 아래 열기() 가 크롬에도 같이 심어 준다:
     그래야 방장 줄에 계정이 박힌 모임에서 화면이 방장 도구를 그린다 (논의124). */
  /* 이름이 곧 계정이다 — `결정_지도.mjs` 가 '시험지도' 를 쓰므로 여기는 갈라 둔다.
     같은 이름을 쓰면 두 시험이 남긴 모임이 한 목록에 섞여, 치울 것을 가릴 수 없다. */
  if (!(await 로그인(방장, '시험맵'))) throw new Error('시험용 로그인이 안 됐다');
  const r = await 방장.post('/api/m', { name: 이름, hostName: '김방장', scope: 'place', purpose: '음식', ...방장출발지 });
  if (!r.json?.code) throw new Error('모임을 만들지 못했다: ' + r.text);
  const code = r.json.code;
  만든것.push({ code, 방장 });
  for (const c of 후보)
    await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'region', refId: c.name, name: c.name, lat: c.lat, lng: c.lng });
  return { code, 방장 };
}

/** 가운데에서 km 반경으로 흩뿌린 후보 (이름 길이도 제각각 — 한글 폭은 글자 수로 못 잰다) */
const 흩기 = (n, km, 앞 = '가나다라마바사아자차카타파하거너더러', 중심 = { lat: 37.5572, lng: 126.9245 }) =>
  Array.from({ length: n }, (_, i) => {
    const 각 = i * 2.399963;                                  /* 황금각 — 고르게 퍼진다 */
    const 반 = km * Math.sqrt((i + 0.5) / n);
    const 글 = 앞.slice(i % 10, (i % 10) + 1 + (i % 4));
    return {
      name: `${글}${i + 1}동`,
      lat: 중심.lat + (반 * Math.cos(각)) / 111,
      lng: 중심.lng + (반 * Math.sin(각)) / (111 * Math.cos((중심.lat * Math.PI) / 180)),
    };
  });

/* ── 화면에서 재는 것들 ─────────────────────────────────── */
const 재기 = () => {
  const el = document.querySelector('.osm');
  if (!el) return null;
  const m = el.getBoundingClientRect();
  const 상자 = (n) => {
    const r = n.getBoundingClientRect();
    return { l: r.left - m.left, t: r.top - m.top, r: r.right - m.left, b: r.bottom - m.top, w: r.width, h: r.height };
  };
  const pins = [...document.querySelectorAll('.opin')].map((n) =>
    ({ ...상자(n), text: n.textContent.trim(), tag: n.tagName }));
  /* 방장 도구는 이제 스피드다이얼(.dial-item·.dial-toggle)이다 — 알약(.acts .fab)과
     따로 뜬다. 둘 다 지도 위에 얹히는 '고정 자리'라 이름표와의 겹침 검사에 함께 넣는다. */
  const fixed = [...document.querySelectorAll('.ozoom,.ocred,.acts .fab,.dial-item,.dial-toggle')].map(상자);
  return {
    W: m.width, H: m.height, pins, fixed,
    /* 점은 두 가지다 — 옮긴 이름표가 가리키는 원래 자리, 그리고 이름표 한도(논의67)를 넘어 묶인 곳.
       한 숫자로 세면 묶인 곳이 늘 때마다 '점=선' 시험이 엉뚱하게 깨진다. */
    dots: document.querySelectorAll('.odot:not([data-mute])').length,
    묶인점: document.querySelectorAll('.odot[data-mute]').length,
    lines: document.querySelectorAll('.osm line').length,
    dead: !!document.querySelector('.tiledead'),
  };
};

/** 타일 그림에서 지금 지도가 어디를 보고 있는지 되짚는다 (배율이 소수여도 통한다) */
const 지금중심 = () => {
  const el = document.querySelector('.osm');
  const m = el.getBoundingClientRect();
  const t = [...el.querySelectorAll('img')].map((im) => {
    const g = im.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    const r = im.getBoundingClientRect();
    return { z: +g[1], x: +g[2], y: +g[3], l: r.left - m.left, t: r.top - m.top };
  });
  const a = t[0];
  const 가로 = t.find((q) => q.x !== a.x), 세로 = t.find((q) => q.y !== a.y);
  if (!가로 || !세로) return null;
  const TS = (가로.l - a.l) / (가로.x - a.x);
  const 세상 = TS * 2 ** a.z;
  const ox = a.x * TS - a.l, oy = a.y * TS - a.t;
  const cx = ox + m.width / 2, cy = oy + m.height / 2;
  const k = Math.PI - (2 * Math.PI * cy) / 세상;
  return {
    lng: (cx / 세상) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))),
    z: a.z + Math.log2(TS / 256),
  };
};

const 거리 = (a, b, c, d) => {
  const R = 6371000, r = Math.PI / 180;
  const dp = (c - a) * r, dl = (d - b) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
/** 가장 크게 가린 정도 — 작은 쪽 이름표 넓이에 견준다 */
const 가린정도 = (pins) => {
  let m = 0;
  for (let i = 0; i < pins.length; i++)
    for (let j = i + 1; j < pins.length; j++) {
      const 작은 = Math.min(pins[i].w * pins[i].h, pins[j].w * pins[j].h);
      m = Math.max(m, 겹친넓이(pins[i], pins[j]) / 작은);
    }
  return m;
};
const 이름표수 = (pins) => pins.filter((p) => !p.text.startsWith('이 근처')).length;
const 잘린것 = (r) => r.pins.filter((p) => p.l < -0.6 || p.r > r.W + 0.6 || p.t < -0.6 || p.b > r.H + 0.6);
const 붙박이침범 = (r) => r.pins.filter((p) => r.fixed.some((q) => 겹친넓이(p, q) > 4));

async function 열기(browser, code, jar, opt = {}) {
  /* 높이를 바꿀 수 있어야 한다 — 지도 높이가 줄면 이름표가 갈 곳이 줄어 붙박이 위로 밀린다.
     430×932 에서만 재던 때는 430×900 에서 이름표가 '친구 초대' 위에 얹히는 것을 놓쳤다. */
  const ctx = await browser.newContext({ viewport: { width: 430, height: opt.높이 ?? 932 } });
  if (jar) await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, domain: '127.0.0.1', path: '/' })));
  const page = await ctx.newPage();
  await page.route('**dapi.kakao.com**', (r) => r.abort());          /* 폴백 지도를 강제한다 */
  await page.route('**tile.openstreetmap.org/**', (r) =>
    opt.타일없이 ? r.abort() : r.fulfill({ status: 200, contentType: 'image/png', body: 가짜타일 }));
  await page.goto(`${BASE}/m/${code}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.osm', { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

try {
  /* ── A11 : 처음 배율 ─────────────────────────────────── */
  console.log('\n[A11] 처음 배율이 후보를 화면에 채운다');
  const 넓 = await 모임('지도시험 넓게', 흩기(9, 2.4));
  {
    const { ctx, page } = await 열기(browser, 넓.code, 넓.방장.jar);
    const r = await page.evaluate(재기);
    const 채움 = Math.max(
      (Math.max(...r.pins.map((p) => p.r)) - Math.min(...r.pins.map((p) => p.l))) / r.W,
      (Math.max(...r.pins.map((p) => p.b)) - Math.min(...r.pins.map((p) => p.t))) / r.H);
    ok('첫 화면에 이름표가 여러 개 보인다', 이름표수(r.pins) >= 4,
      `이름표 ${이름표수(r.pins)}개 / 핀 ${r.pins.length}개 · 지도 ${Math.round(r.W)}×${Math.round(r.H)}`);
    ok('후보가 지도의 절반 넘게 찬다', 채움 >= 0.55 && 채움 <= 1.02, `${(채움 * 100).toFixed(0)}%`);
    ok('아홉 곳이면 이름표가 하나도 안 겹친다', 겹친쌍(r.pins).length === 0, `${겹친쌍(r.pins).length}쌍`);
    ok('아홉 곳이면 잘리지도 덮지도 않는다', 잘린것(r).length === 0 && 붙박이침범(r).length === 0);
    const z = (await page.evaluate(지금중심)).z;
    ok('배율 상한을 지킨다', z <= 18 && z >= 6, `z=${z.toFixed(2)}`);
    await ctx.close();
  }

  /* ── A12 · A28 · A29 : 이름표 자리잡기 ───────────────── */
  console.log('\n[A12·A28·A29] 실측한 크기로 자리를 잡는다');
  const 빽 = await 모임('지도시험 빽빽', 흩기(20, 1.6));
  {
    const { ctx, page } = await 열기(browser, 빽.code, 빽.방장.jar);
    const r0 = await page.evaluate(재기);
    /* 스무 곳이면 이름표만으로 지도의 40% 가 차서 겹침 0 을 자리잡기로는 못 낸다 —
       그래서 '몇 곳까지 펼치나'를 사람이 정했다: 18곳 (논의67). 나머지는 점으로 묶인다.
       자세한 것은 tests/결정_지도.mjs 가 맡고, 여기서는 그 규칙이 살아 있는지만 본다. */
    ok('스무 곳이면 이름표는 열여덟 개까지만 (논의67)', 이름표수(r0.pins) === 18,
      `이름표 ${이름표수(r0.pins)}개 · 묶인 점 ${r0.묶인점}개 · 지도 ${Math.round(r0.W)}×${Math.round(r0.H)}`);
    ok('이름표를 못 받은 두 곳은 점으로 남는다 (논의67)', r0.묶인점 === 2, `${r0.묶인점}개`);
    ok('첫 화면 — 겹치더라도 이름은 읽을 수 있다', 가린정도(r0.pins) < 0.5,
      `${겹친쌍(r0.pins).length}쌍 · 최대 ${(가린정도(r0.pins) * 100).toFixed(0)}%`);
    ok('첫 화면 — 화면 밖으로 안 잘린다', 잘린것(r0).length === 0, `${잘린것(r0).length}개`);
    ok('첫 화면 — 붙박이 단추를 안 덮는다', 붙박이침범(r0).length === 0, `${붙박이침범(r0).length}개`);
    ok('옮긴 이름표는 원래 자리를 점·선으로 가리킨다',
      r0.dots > 0 && r0.dots === r0.lines, `점 ${r0.dots} · 선 ${r0.lines}`);

    /* 확대하면 가장자리 후보가 화면 밖으로 밀린다 — 여기서도 잘리거나 단추를 덮으면 안 된다 */
    await page.click('.ozoom button[aria-label="확대"]');
    await page.waitForTimeout(600);
    const r2 = await page.evaluate(재기);
    ok('확대해도 이름표가 남아 있다', 이름표수(r2.pins) >= 5, `이름표 ${이름표수(r2.pins)}개`);
    ok('확대 — 화면 밖으로 안 잘린다', 잘린것(r2).length === 0, `${잘린것(r2).length}개`);
    ok('확대 — 붙박이 단추를 안 덮는다', 붙박이침범(r2).length === 0, `${붙박이침범(r2).length}개`);
    /* 확대하면 화면 밖 후보가 빠져 밀도가 내려간다 — 여기서는 겹침 0 이 나와야 한다 */
    ok('확대 — 이름표가 하나도 안 겹친다', 겹친쌍(r2.pins).length === 0,
      `${겹친쌍(r2.pins).length}쌍 · 최대 ${(가린정도(r2.pins) * 100).toFixed(0)}%`);
    await ctx.close();
  }

  /* 지도가 낮으면 이름표가 갈 곳이 줄어 '친구 초대' 위로 밀린다.
     430×900 에서 실제로 그랬다 — 붙박이를 덮는 값을 이름표끼리 겹치는 값보다 무겁게 매겨 고쳤다. */
  console.log('\n[A28] 지도가 낮아도 붙박이 단추를 안 덮는다');
  for (const 높이 of [900, 800, 740]) {
    const { ctx, page } = await 열기(browser, 빽.code, 빽.방장.jar, { 높이 });
    const r = await page.evaluate(재기);
    ok(`430×${높이} — 붙박이 단추를 안 덮는다`, 붙박이침범(r).length === 0,
      `지도 ${Math.round(r.W)}×${Math.round(r.H)} · 이름표 ${이름표수(r.pins)}개 · 침범 ${붙박이침범(r).length}개`);
    ok(`430×${높이} — 화면 밖으로 안 잘린다`, 잘린것(r).length === 0, `${잘린것(r).length}개`);
    await ctx.close();
  }

  /* 겹침 0 이 어디까지 되는지 못 박아 둔다 — 열여덟 곳까지는 자리잡기로 낸다.
     스무 곳부터 겹치기 시작하고 스물둘부터는 무너진다(안건 G17 의 근거 숫자다). */
  console.log('\n[A12] 열여덟 곳까지는 이름표가 하나도 안 겹친다');
  {
    const 촘 = await 모임('지도시험 열여덟', 흩기(18, 1.6));
    const { ctx, page } = await 열기(browser, 촘.code, 촘.방장.jar);
    const r = await page.evaluate(재기);
    ok('열여덟 곳 — 이름이 다 보인다', 이름표수(r.pins) >= 17, `이름표 ${이름표수(r.pins)}개`);
    ok('열여덟 곳 — 하나도 안 겹친다', 겹친쌍(r.pins).length === 0,
      `${겹친쌍(r.pins).length}쌍 · 최대 ${(가린정도(r.pins) * 100).toFixed(0)}%`);
    ok('열여덟 곳 — 잘리지도 덮지도 않는다', 잘린것(r).length === 0 && 붙박이침범(r).length === 0);
    await ctx.close();
  }

  /* ── A27 : 확정된 지역으로 지도를 당긴다 ─────────────── */
  console.log('\n[A27] 지점 단계에서 확정된 지역으로 당긴다');
  {
    const 성수 = { lat: 37.5447, lng: 127.0557 };
    const 후보 = [
      { name: '성수동', ...성수 },
      { name: '연남동', lat: 37.5626, lng: 126.9256 },
      { name: '망원동', lat: 37.5559, lng: 126.9020 },
    ];
    const { code, 방장 } = await 모임('지도시험 재중심', 후보);
    const { ctx, page } = await 열기(browser, code, 방장.jar);
    const 전 = await page.evaluate(지금중심);
    const v = (await 방장.get(`/api/m/${code}`)).json;
    const 성수id = v.candidates.find((c) => c.name === '성수동').id;
    await 방장.post(`/api/m/${code}`, { action: 'confirm', candidateId: 성수id });
    await page.waitForTimeout(2500);
    const 후 = await page.evaluate(지금중심);
    ok('확정 전에는 성수동에서 멀다', 거리(전.lat, 전.lng, 성수.lat, 성수.lng) > 400,
      `${Math.round(거리(전.lat, 전.lng, 성수.lat, 성수.lng))}m`);
    ok('확정 뒤 지도가 성수동으로 온다', 거리(후.lat, 후.lng, 성수.lat, 성수.lng) < 250,
      `${Math.round(거리(후.lat, 후.lng, 성수.lat, 성수.lng))}m`);

    /* 손으로 옮긴 뒤에는 되돌리지 않는다 */
    const 자리 = await page.evaluate(() => {
      const r = document.querySelector('.osm').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(자리.x, 자리.y);
    await page.mouse.down();
    await page.mouse.move(자리.x - 130, 자리.y - 90, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const 옮긴뒤 = await page.evaluate(지금중심);
    await 방장.post(`/api/m/${code}`, { action: 'ping', kind: 'place', refId: 'p-1', name: '성수족발', lat: 성수.lat + 0.0004, lng: 성수.lng });
    await page.waitForTimeout(2000);
    const 갱신뒤 = await page.evaluate(지금중심);
    ok('손으로 옮긴 지도를 멋대로 되돌리지 않는다',
      거리(옮긴뒤.lat, 옮긴뒤.lng, 갱신뒤.lat, 갱신뒤.lng) < 120,
      `${Math.round(거리(옮긴뒤.lat, 옮긴뒤.lng, 갱신뒤.lat, 갱신뒤.lng))}m`);
    await ctx.close();
  }

  /* ── A30 : 타일이 죽었을 때 ──────────────────────────── */
  console.log('\n[A30] 타일이 죽으면 안내가 가려지지 않는다');
  {
    const { ctx, page } = await 열기(browser, 넓.code, 넓.방장.jar, { 타일없이: true });
    const r = await page.evaluate(() => {
      const t = document.querySelector('.tiledead');
      if (!t) return { dead: false };
      const b = t.querySelector('b').getBoundingClientRect();
      const 찍기 = [0.2, 0.4, 0.5, 0.6, 0.8].map((f) => {
        const el = document.elementFromPoint(b.left + b.width * f, b.top + b.height / 2);
        return el ? `${el.tagName}.${el.className}` : 'none';
      });
      return { dead: true, 찍기, pins: document.querySelectorAll('.opin').length };
    });
    ok('타일이 죽으면 안내가 뜬다', r.dead === true);
    ok('안내 위에 핀이 얹히지 않는다', r.dead && !r.찍기.some((s) => s.includes('opin')), (r.찍기 ?? []).join(' '));
    ok('안 보이는 지도에 핀을 안 그린다', r.pins === 0, `핀 ${r.pins}개`);
    const 전 = (await 넓.방장.get(`/api/m/${넓.code}`)).json.candidates.length;
    const m = await page.evaluate(() => {
      const r = document.querySelector('.osm').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(m.x, m.y);
    await page.waitForTimeout(1200);
    const 후 = (await 넓.방장.get(`/api/m/${넓.code}`)).json.candidates.length;
    ok('회색 화면을 눌러도 후보가 안 생긴다', 전 === 후, `${전} → ${후}`);
    await ctx.close();
  }

  /* ── A34 : 못 찍는 사람 ──────────────────────────────── */
  console.log('\n[A34] 참여자가 아니면 핀이 눌리지 않는다');
  {
    const { ctx, page } = await 열기(browser, 넓.code, null);      /* 쿠키 없이 */
    const 전 = (await 넓.방장.get(`/api/m/${넓.code}`)).json;
    const r = await page.evaluate(재기);
    ok('핀이 눌리는 단추가 아니다', r.pins.length > 0 && r.pins.every((p) => p.tag !== 'BUTTON'),
      r.pins.map((p) => p.tag).join(',').slice(0, 40));
    await page.click('.opin', { force: true });
    await page.waitForTimeout(900);
    const 토스트 = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
    const 후 = (await 넓.방장.get(`/api/m/${넓.code}`)).json;
    ok('핀을 눌러도 아무 일이 없다', !토스트, 토스트);
    ok('핀을 눌러도 표가 안 바뀐다',
      전.candidates.length === 후.candidates.length
      && 전.candidates.reduce((a, c) => a + c.votes, 0) === 후.candidates.reduce((a, c) => a + c.votes, 0));
    const z0 = (await page.evaluate(지금중심)).z;
    await page.click('.ozoom button[aria-label="확대"]');
    await page.waitForTimeout(500);
    const z1 = (await page.evaluate(지금중심)).z;
    ok('보는 것은 자유 — 확대는 된다', z1 > z0, `z ${z0.toFixed(1)} → ${z1.toFixed(1)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  /* 내가 만든 모임만 치운다 */
  for (const { code, 방장 } of 만든것) await 방장.post(`/api/m/${code}`, { action: 'remove' });
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
