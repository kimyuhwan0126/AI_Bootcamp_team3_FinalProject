/* 조회·SSE 에도 횟수 한도가 도는가 (배포 점검 §3⑦).
   GET /api/m/[code] 와 GET /api/m/[code]/stream 은 전에 아무 한도가 없었다 —
   geo·places 처럼 lib/ratelimit.ts 의 횟수확인() 을 이제 이 둘의 GET 맨 앞에서도 본다.
   POST(모임 조작 전체)는 건드리지 않았다 — 그것도 여기서 함께 확인한다.

   node tests/보기제한.mjs   ← 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   운영 DB 를 쓴다. 내가 만든 모임만 action:remove 로 치운다. */
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 쿠키를 들고 다니는 사람 하나 (tests/api.mjs 와 같은 방식) */
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
      let json = null; try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 있다 */ }
      return { status: r.status, json, text, headers: r.headers };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

/** 같은 길을 최대 `최대` 번까지, `배치` 개씩 묶어 몰아친다. 429 를 보면 멈춘다.
    한 뭉치 안 요청은 이미 심어진 쿠키를 함께 쓰므로 같은 기기 칸으로 잡힌다 — 앞서 한 번
    부르고 쿠키가 자리 잡은 뒤에 몰아쳐야 'ip:unknown' 칸과 안 갈린다(호출부에서 예열한다). */
async function 몰아치기(fn, 최대, 배치 = 25) {
  let 마지막 = null, 몇번째 = 0, 걸림 = false;
  for (let i = 0; i < 최대 && !걸림; i += 배치) {
    const 이번배치 = Math.min(배치, 최대 - i);
    const 결과들 = await Promise.all(Array.from({ length: 이번배치 }, () => fn()));
    for (const r of 결과들) {
      몇번째++;
      마지막 = r;
      if (r.status === 429) { 걸림 = true; break; }
    }
  }
  return { 걸림, 몇번째, 마지막 };
}

const 치울것 = [];
const 정리 = async () => {
  for (const { p, code } of 치울것) {
    await p.post(`/api/m/${code}`, { action: 'remove' }).catch(() => {});
  }
};

try {

console.log('\n[준비] 모임 하나 만든다');
const 방장 = person();
ok('로그인된다', await 로그인(방장, '시험보기제한'));
const 만들기 = await 방장.post('/api/m', {
  name: '보기제한 시험', hostName: '방장', scope: 'place',
  origin: '성수역', lat: 37.5446, lng: 127.0560,
});
const code = 만들기.json?.code;
ok('모임을 만든다', 만들기.status === 200 && !!code, `${만들기.status} ${만들기.text.slice(0, 80)}`);
if (code) 치울것.push({ p: 방장, code });
const P = `/api/m/${code}`;

if (code) {

console.log('\n[보기1] 정상적인 새로고침 빈도로는 안 걸린다');
{
  /* SSE 'changed' 한 번마다 화면이 다시 읽는다(ui.tsx reload) — 짧은 순간에 여럿이 함께
     찍어도 눌리지 않게 view 한도를 넉넉히 잡았다(lib/ratelimit.ts 길별한도.view). 그 아래
     '평범하게 활발한' 빈도로는 절대 안 걸려야 한다. */
  let 막힘 = false;
  for (let i = 0; i < 25; i++) {
    const r = await 방장.get(P);
    if (r.status === 429) { 막힘 = true; break; }
    await sleep(40);
  }
  ok('정상적인 새로고침 25번은 안 걸린다', !막힘);
}

console.log('\n[보기2] 짧게 몰아쳐 조회하면 결국 429 가 걸린다');
{
  /* view 한도(창 30초·300번)까지 밀어붙인다 — 실제로 걸리는지, 봉투 모양이 다른 길과
     같은지(너무잦음()) 를 함께 본다. */
  const { 걸림, 몇번째, 마지막 } = await 몰아치기(() => 방장.get(P), 340);
  ok('짧게 몰아치면 결국 429 가 걸린다', 걸림, `${몇번째}번째에 걸림`);
  ok('429 봉투가 다른 길과 같은 모양이다 (too_many · retryable · retryAfterSec)',
    마지막?.status === 429 && 마지막.json?.error === 'too_many' && 마지막.json?.retryable === true
      && typeof 마지막.json?.retryAfterSec === 'number' && 마지막.json.retryAfterSec > 0,
    JSON.stringify(마지막?.json));
  ok('retry-after 헤더도 함께 온다',
    !!마지막?.headers?.get?.('retry-after'), 마지막?.headers?.get?.('retry-after'));
}

console.log('\n[보기3] 조회가 막혀도 모임 조작(POST)은 안 막힌다');
{
  /* 배포 점검이 짚은 구멍은 조회 두 곳뿐이다 — POST(참여·핑·방장 도구)는 건드리지 않았다.
     바로 앞에서 view 를 막아 둔 같은 기기로 확인한다. */
  const r = await 방장.post(P, {
    action: 'ping', kind: 'region', refId: 'rate1', name: '보기제한동',
    lat: 37.5445, lng: 127.0557,
  });
  ok('view 가 막힌 뒤에도 POST(ping)는 그대로 된다', r.status === 200, `${r.status} ${r.json?.error ?? ''}`);
}

console.log('\n[보기4] stream 도 새 연결에 한도가 돈다');
{
  /* 있지도 않은 코드를 쓴다 — 존재 확인보다 한도 확인이 먼저라(app/api/m/[code]/stream/route.ts)
     같은 결과가 나온다. 없는 모임이라 즉시 404 로 끝나서 연결을 오래 물고 있지 않는다 —
     여러 개를 열어 둔 채로 시험이 끝나는 일이 없다. */
  const 없는코드 = 'ZZ9990';
  /* 예열 — 첫 요청으로 이 기기의 쿠키를 심어 둔다(그래야 몰아칠 때 전부 같은 칸으로 잡힌다) */
  await 방장.get(`/api/m/${없는코드}/stream`);
  const { 걸림, 몇번째, 마지막 } = await 몰아치기(() => 방장.get(`/api/m/${없는코드}/stream`), 150);
  ok('stream 새 연결도 몰아치면 결국 429 가 걸린다', 걸림, `${몇번째}번째에 걸림`);
  ok('stream 의 429 봉투도 같은 모양이다',
    마지막?.status === 429 && 마지막.json?.error === 'too_many' && typeof 마지막.json?.retryAfterSec === 'number',
    JSON.stringify(마지막?.json));
}

console.log('\n[보기5] view 와 stream 은 서로 다른 칸이다');
{
  /* 위 [보기2] 에서 이미 이 기기의 view 칸을 막아 뒀다. 그런데도 [보기4] 의 stream 몰아치기가
     됐다 — 길이 다르면 칸도 다르다는 뜻이다. 새 기기로 한 번 더, 이번엔 반대 순서로 확인한다. */
  const 새사람 = person();
  await 로그인(새사람, '시험보기제한2');
  const 없는코드 = 'ZZ9991';
  await 새사람.get(`/api/m/${없는코드}/stream`);
  const 스트림결과 = await 몰아치기(() => 새사람.get(`/api/m/${없는코드}/stream`), 150);
  ok('새 기기에서 stream 을 먼저 막아 둔다', 스트림결과.걸림, `${스트림결과.몇번째}번째에 걸림`);
  const 뷰응답 = await 새사람.get(P);
  ok('stream 이 막혀 있어도 view 는 그대로 된다', 뷰응답.status === 200,
    `${뷰응답.status} ${뷰응답.json?.error ?? ''}`);
}

}

} catch (e) {
  fail++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

await 정리();

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
