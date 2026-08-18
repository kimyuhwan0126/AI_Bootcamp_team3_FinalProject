/* 모임 목적(purpose) 복구 회귀 시험 (2026-08-23, 사용자 요청 — "예전에는 모임 목적에
   관한 태그가 있었고 이를 기반으로 AI 추천에 영향이 갔다, 복구해봐").

   조사해 보니 DB 칸(meetings.purpose)·API(app/api/m/route.ts)·AI 프롬프트(lib/ai.ts)는
   app-v2 로 새로 지을 때부터 이미 이 값을 받게 돼 있었다 — 정작 만드는 폼(app/new/page.tsx)
   에 고를 곳이 없어서 한 번도 값이 안 들어갔을 뿐이다(점검/11_예전판_기록.md §3 에
   예전판의 다섯 알약(음식점·카페·술집·문화/놀이·야외) 기록이 남아 있다). 그래서 여기서는
   **폼 → API → DB** 로 실제로 값이 흘러가는지를 잰다. AI 프롬프트가 m.purpose 를 어떻게
   쓰는지는 tests/ai프롬프트.mjs 의 "무엇 하러 모이는지 반영한다" 가 이미 재고 있다 —
   여기서 또 재지 않는다(두 시험이 같은 것을 다르게 재면 한쪽만 고치고 잊는다).

   node tests/모임목적.mjs — 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? `  → ${d}` : ''}`); };

function person() {
  const jar = new Map();
  return {
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

const 출발지 = { origin: '성수역', lat: 37.5446, lng: 127.0560, transport: 'transit' };
const 치울것 = [];
const 방장 = person();

try {

ok('방장 로그인', await 로그인(방장, '시험모임목적'));

console.log('\n[목적1] 만들 때 목적을 실으면 DB 에 그대로 남는다');
{
  const r = await 방장.post('/api/m', { name: '목적 시험 · 술집', hostName: '방장', scope: 'place',
    purpose: '술집', ...출발지 });
  ok('모임이 만들어진다', r.status === 200 && !!r.json?.code, `${r.status} ${JSON.stringify(r.json)}`);
  치울것.push(r.json?.code);
  const v = (await 방장.get(`/api/m/${r.json.code}`)).json;
  ok('목적이 그대로 저장·조회된다', v?.meeting?.purpose === '술집', String(v?.meeting?.purpose));
}

console.log('\n[목적2] 목적을 안 실으면 null 이다(강제 아님)');
{
  const r = await 방장.post('/api/m', { name: '목적 시험 · 없음', hostName: '방장', scope: 'place', ...출발지 });
  ok('목적 없이도 모임이 만들어진다', r.status === 200 && !!r.json?.code, `${r.status}`);
  치울것.push(r.json?.code);
  const v = (await 방장.get(`/api/m/${r.json.code}`)).json;
  ok('목적은 null 이다', v?.meeting?.purpose === null, String(v?.meeting?.purpose));
}

console.log('\n[목적3] 다섯 알약 전부 저장된다(예전판과 같은 낱말인지)');
{
  for (const p of ['음식점', '카페', '술집', '문화/놀이', '야외']) {
    const r = await 방장.post('/api/m', { name: `목적 시험 · ${p}`, hostName: '방장', scope: 'place',
      purpose: p, ...출발지 });
    치울것.push(r.json?.code);
    const v = (await 방장.get(`/api/m/${r.json.code}`)).json;
    ok(`"${p}" 그대로 저장된다`, v?.meeting?.purpose === p, String(v?.meeting?.purpose));
  }
}

console.log('\n[목적4] 지역까지만 정하는 모임도 값을 실으면 서버는 그대로 받는다');
{
  /* 폼(화면)은 scope=region 이면 알약 줄 자체를 숨기지만, 그건 화면의 안내일 뿐이지
     서버가 강제로 막는 규칙은 아니다 — 값을 실어 보내면 그대로 저장된다.
     (지역만 정하는 모임도 AI 에게 "무엇 하러" 정도는 참고가 될 수 있어 굳이 막지 않는다.) */
  const r = await 방장.post('/api/m', { name: '목적 시험 · 지역만', hostName: '방장', scope: 'region',
    purpose: '카페', ...출발지 });
  ok('지역까지 모임도 만들어진다', r.status === 200 && !!r.json?.code, `${r.status}`);
  치울것.push(r.json?.code);
  const v = (await 방장.get(`/api/m/${r.json.code}`)).json;
  ok('서버는 값을 그대로 받는다(화면 숨김과는 별개)', v?.meeting?.purpose === '카페', String(v?.meeting?.purpose));
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울것.filter(Boolean)) {
    const r = await 방장.post(`/api/m/${c}`, { action: 'remove' }).catch(() => ({ status: 0 }));
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.filter(Boolean).length,
    `${지움}/${치울것.filter(Boolean).length}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
