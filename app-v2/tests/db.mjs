/* 데이터 무결성 회귀 시험 — lib/db.ts (A13 · A14 · A15 · A20 · A35 · A57 · A60)
   node tests/db.mjs 로 바로 돈다. 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   유령 모임(host_id 없는 모임)만 DB 를 직접 읽는다 — API 로는 보이지 않기 때문이다.
   내가 만든 모임만 지운다. */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

/* DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다 */
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });
/* 남이 만든 유령까지 세면 다른 갈래의 시험에 끌려간다 — '내가 도는 동안 늘었는가'만 본다 */
const 유령들 = async () =>
  new Set(((await sql`select code from meetings where host_id is null`)).map((r) => r.code));

/** 쿠키를 들고 다니는 사람 하나 (flowtest 와 같은 결) */
function person(label) {
  const jar = new Map();
  return {
    label,
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
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

let _og = 0;
const 출발지 = () => {
  const list = [
    { origin: '성수역', lat: 37.5446, lng: 127.0560 },
    { origin: '연남동 주민센터', lat: 37.5626, lng: 126.9256 },
    { origin: '홍대입구역', lat: 37.5572, lng: 126.9245 },
    { origin: '왕십리역', lat: 37.5612, lng: 127.0378 },
  ];
  return list[_og++ % list.length];
};

const 치울것 = [];                                  /* [사람, 코드] — 끝나고 내가 만든 것만 지운다 */
/* 모임을 만들려면 로그인해야 한다 (논의123). 방장 쪽만 하면 된다 — 참여는 로그인이 필요 없다.
   ⚠ 논의124 로 방장 판정이 계정 기준이라, 만든 뒤의 `remove`·`kick` 도 같은 항아리(=같은 세션)로
   불러야 듣는다. `person()` 이 쿠키를 스스로 드니 한 번 로그인해 두면 그 사람 내내 유효하다.
   이 항아리는 이미 로그인했는지 기억해 둔다 — 라운드마다 다시 부르면 헛왕복이 는다. */
const 로그인한사람 = new WeakSet();
async function 모임만들기(누가, 이름) {
  if (!로그인한사람.has(누가)) {
    if (!(await 로그인(누가, '시험DB'))) throw new Error('시험용 로그인이 안 됐다');
    로그인한사람.add(누가);
  }
  const r = await 누가.post('/api/m', { name: 이름, hostName: '방장', scope: 'place', ...출발지() });
  /* 여기서 안 걸러 두면 아래가 undefined 를 붙들고 엉뚱한 자리에서 넘어진다 — 실제로 그랬다 */
  if (!r.json?.code) throw new Error(`모임을 못 만들었다 (${r.status}) ${r.text?.slice(0, 80) ?? ''}`);
  치울것.push([누가, r.json.code]);
  return r.json.code;
}

const 성수 = { kind: 'region', refId: 'db-r-A', name: '성수동', lat: 37.5447, lng: 127.0557 };
const 연남 = { kind: 'region', refId: 'db-r-B', name: '연남동', lat: 37.5626, lng: 126.9256 };

console.log('\n[A20] 같은 이름으로 동시에 참여');
{
  /* 재는 것은 **DB 가 깨지지 않는가** 다 — 다섯이 같은 순간에 같은 이름으로 들어와도
     participants 에 그 이름이 두 줄이 되면 안 되고, 유니크 위반이 빈 500 으로 새면 안 된다.

     ⚠ '몇 명이 200 을 받는가' 는 이제 재지 않는다. 논의121 이 규칙을 바꿨다 —
     이름이 같고 **PIN 까지 맞으면** 그 자리를 그대로 돌려준다(`resumed:true`).
     여기 다섯은 이름도 PIN 도 같으니, 하나가 자리를 만들고 나머지는 그 자리를 되받는 것이 **맞는 모습**이다.
     (다섯 다 같은 사람으로 취급되는 것은 논의126 이 감수하기로 한 자리다.)
     그러니 200 이 몇이든 상관없고, 첫 자리를 만든 것이 **한 줄뿐인지**만 보면 된다. */
  const 라운드 = 4;
  let 오백 = 0, 겹친행 = 0, 새자리 = 0, 되받음 = 0, 자리들 = new Set();
  for (let i = 0; i < 라운드; i++) {
    const 방장 = person('방장');
    const C = await 모임만들기(방장, '동시 참여');
    const 다섯 = [1, 2, 3, 4, 5].map((n) => person('p' + n));
    const rs = await Promise.all(다섯.map((p) =>
      p.post(`/api/m/${C}`, { action: 'join', name: '같은이름', pin: '1234', ...출발지() })));
    오백 += rs.filter((r) => r.status >= 500).length;
    const 됨 = rs.filter((r) => r.status === 200);
    새자리 += 됨.filter((r) => !r.json?.resumed).length;
    되받음 += 됨.filter((r) => r.json?.resumed).length;
    /* 200 을 받은 사람들이 **전부 같은 자리**를 가리켜야 한다 — 자리가 둘로 갈리면
       한 사람이 두 표를 쥐게 된다(줄은 하나인데 id 가 둘일 수는 없으니 이건 겹침의 다른 얼굴이다) */
    자리들 = new Set(됨.map((r) => r.json?.participantId));
    const w = (await 방장.get(`/api/m/${C}`)).json;
    if (w.participants.filter((p) => p.name === '같은이름').length !== 1) 겹친행++;
    if (자리들.size > 1) 겹친행++;
  }
  ok('같은 이름 동시 참여에 500 이 없다', 오백 === 0, `4라운드 × 5명 중 500 이 ${오백}회`);
  ok('한 라운드에 그 이름의 줄은 하나뿐이다', 겹친행 === 0, `어긋난 라운드 ${겹친행}회`);
  /* 라운드마다 자리를 만드는 것은 딱 하나여야 한다 — 둘이면 유니크 검사를 나란히 지나친 것이다 */
  ok('자리를 새로 만드는 것은 라운드마다 하나뿐이다', 새자리 === 라운드, `새 자리 ${새자리}/${라운드}`);
  /* 나머지는 '되받은 것' 으로 답해야 한다 (논의121). 그 표시가 없으면 화면이
     '새로 들어왔다' 와 '돌아왔다' 를 못 가른다 */
  ok('나머지는 그 자리를 되받는다', 되받음 > 0, `되받음 ${되받음}회`);
}

console.log('\n[A35] 모임 만들기가 깨져도 유령 모임이 안 남는다');
{
  const 전 = await 유령들();
  const 상태 = [];
  for (let i = 0; i < 4; i++) {
    const r = await person('x').post('/api/m', {
      name: '유령 만들기', hostName: '방장', origin: '성수역', lat: 37.5446, lng: 127.0560, transport: 'plane',
    });
    상태.push(r.status);
  }
  const 후 = await 유령들();
  const 새것 = [...후].filter((c) => !전.has(c));
  ok('만들기가 깨지면 아무것도 안 만들어진다', 상태.every((s) => s !== 200), `상태 ${[...new Set(상태)].join(',')}`);
  ok('host_id 없는 모임이 새로 안 생긴다', 새것.length === 0, `새 유령 ${새것.length}건`);
  /* 빨간불이면 내가 만든 유령이 남는데 API 로는 못 지운다(방장이 없어 403) —
     내 이름표가 붙은 것만 SQL 로 치운다. 남의 유령은 건드리지 않는다. */
  await sql`delete from meetings where host_id is null and name = '유령 만들기'`;
}

console.log('\n[A13] 앵커가 지워져도 넣어 둔 지점 후보가 돌아온다');
{
  const a = person('a');
  const C = await 모임만들기(a, '앵커 재발급');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...연남 });
  let w = (await a.get(P)).json;
  const 성수1 = w.candidates.find((c) => c.ref_id === 성수.refId);
  await a.post(P, { action: 'confirm', candidateId: 성수1.id });
  for (const g of [['db-p1', '가게1'], ['db-p2', '가게2']])
    await a.post(P, { action: 'ping', kind: 'place', refId: g[0], name: g[1], lat: 37.5443, lng: 127.0561 });
  await a.post(P, { action: 'reopen' });

  /* 앵커였던 지역 후보를 지운다 — 올린 사람이 표를 빼면 0표라 후보째 사라진다 */
  await a.post(P, { action: 'unping', candidateId: 성수1.id });
  w = (await a.get(P)).json;
  ok('앵커 지역 후보가 사라졌다', !w.candidates.some((c) => c.id === 성수1.id));

  await a.post(P, { action: 'ping', ...성수 });          /* 손으로 같은 동을 다시 찍는다 */
  w = (await a.get(P)).json;
  const 성수2 = w.candidates.find((c) => c.ref_id === 성수.refId);
  ok('다시 찍으면 id 가 새로 발급된다', 성수2 && 성수2.id !== 성수1.id, `${성수1.id} → ${성수2?.id}`);
  await a.post(P, { action: 'confirm', candidateId: 성수2.id });
  w = (await a.get(P)).json;
  const 돌아온것 = w.candidates.filter((c) => c.kind === 'place');
  /* 논의87 — 넣어 두기 장치를 없앴다. 지역을 다시 확정하면 지점 후보는 남지 않는다. */
  ok('지역을 다시 확정하면 지점 후보는 사라진다', 돌아온것.length === 0, `${돌아온것.length}곳`);
}

console.log('\n[A13·A14] 지역이 바뀌면 옛 표가 안 되살아나고 좌표가 갱신된다');
{
  const a = person('a'), b = person('b');
  const C = await 모임만들기(a, '지역 넘나들기');
  const P = `/api/m/${C}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await a.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...연남 });
  let w = (await a.get(P)).json;
  const 성수id = w.candidates.find((c) => c.ref_id === 성수.refId).id;
  const 연남id = w.candidates.find((c) => c.ref_id === 연남.refId).id;

  await a.post(P, { action: 'confirm', candidateId: 성수id });
  const 가게 = { kind: 'place', refId: 'db-k1', name: '황소곱창', lat: 37.5443, lng: 127.0561 };
  await a.post(P, { action: 'ping', ...가게 });
  await b.post(P, { action: 'ping', ...가게 });
  w = (await a.get(P)).json;
  ok('성수에서 두 사람이 찍었다', w.candidates.find((c) => c.ref_id === 'db-k1')?.votes === 2);

  await a.post(P, { action: 'reopen' });
  await a.post(P, { action: 'confirm', candidateId: 연남id });
  await a.post(P, { action: 'ping', ...가게, lat: 37.5620, lng: 126.9250 });   /* 연남에서 혼자 찍는다 */
  w = (await a.get(P)).json;
  const k1 = w.candidates.find((c) => c.ref_id === 'db-k1');
  ok('지역이 바뀌면 옛 표가 안 따라온다', k1?.votes === 1, `${k1?.votes}표`);
  ok('좌표가 지금 지역으로 갱신된다', k1 && Math.abs(k1.lat - 37.5620) < 1e-6 && Math.abs(k1.lng - 126.9250) < 1e-6,
     `${k1?.lat},${k1?.lng}`);
}

console.log('\n[A15] 늦게 온 주소는 붙고, 남이 내 후보 이름을 못 덮는다');
{
  const a = person('a'), b = person('b');
  const C = await 모임만들기(a, '주소와 이름');
  const P = `/api/m/${C}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });

  await b.post(P, { action: 'ping', kind: 'place', refId: 'db-k2', name: '곱창집', lat: 37.5443, lng: 127.0561 });
  await a.post(P, { action: 'ping', kind: 'place', refId: 'db-k2', name: '곱창집 2호점',
    lat: 37.5443, lng: 127.0561, address: '서울 성동구 아차산로7길 12' });
  w = (await a.get(P)).json;
  let k2 = w.candidates.find((c) => c.ref_id === 'db-k2');
  ok('뒤늦게 온 주소가 붙는다', k2?.address === '서울 성동구 아차산로7길 12', String(k2?.address));
  ok('남은 내 후보 이름을 못 덮는다', k2?.name === '곱창집', k2?.name);

  await b.post(P, { action: 'ping', kind: 'place', refId: 'db-k2', name: '곱창집 본점',
    lat: 37.5443, lng: 127.0561, address: '엉뚱한 주소' });
  w = (await a.get(P)).json;
  k2 = w.candidates.find((c) => c.ref_id === 'db-k2');
  ok('올린 사람은 이름을 고칠 수 있다', k2?.name === '곱창집 본점', k2?.name);
  ok('이미 붙은 주소는 안 갈아치운다', k2?.address === '서울 성동구 아차산로7길 12', String(k2?.address));
}

console.log('\n[A57] 주인이 나간 0표 후보를 치울 수 있다');
{
  const a = person('a'), b = person('b'), c = person('c');
  const C = await 모임만들기(a, '주인 없는 후보');
  const P = `/api/m/${C}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await c.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });

  const 가게 = { kind: 'place', refId: 'db-k3', name: '온기족발', lat: 37.5450, lng: 127.0560 };
  await b.post(P, { action: 'ping', ...가게 });          /* 올린 사람 = 영희 */
  await a.post(P, { action: 'ping', ...가게 });
  await b.post(P, { action: 'leave' });
  w = (await a.get(P)).json;
  let k3 = w.candidates.find((x) => x.ref_id === 'db-k3');
  ok('올린 사람이 나가면 주인이 빈다', k3 && k3.created_by === null, String(k3?.created_by));

  const 민준id = w.participants.find((p) => p.name === '민준').id;
  await c.post(P, { action: 'ping', ...가게 });
  w = (await c.get(P)).json;
  k3 = w.candidates.find((x) => x.ref_id === 'db-k3');
  ok('다시 찍은 사람이 주인이 된다', k3?.created_by === 민준id, String(k3?.created_by));

  await a.post(P, { action: 'unping', candidateId: k3.id });
  await c.post(P, { action: 'unping', candidateId: k3.id });
  w = (await a.get(P)).json;
  ok('0표가 되면 후보도 사라진다', !w.candidates.some((x) => x.ref_id === 'db-k3'),
     `${w.candidates.filter((x) => x.kind === 'place').length}곳 남음`);
}

console.log('\n[A60] timestamptz 를 한 곳에서 문자열로 맞춰 내보낸다');
{
  /* 화면·라우트가 .slice() 로 읽는 값이라 Date 가 섞이면 그 자리에서 터진다.
     HTTP 로는 JSON 이 Date 도 같은 글자로 만들어 버려 구별이 안 된다 — 경계가 한 곳인지를 본다. */
  const src = readFileSync(new URL('../lib/db.ts', import.meta.url), 'utf8');
  const 변환 = (src.match(/isoRow</g) ?? []).length;
  ok('모임·참가자·후보 세 읽기가 모두 같은 변환을 거친다', 변환 >= 3, `isoRow 사용 ${변환}곳`);
  ok('칸 이름을 하나씩 적어 두지 않는다', !/meet_at:\s*iso\(/.test(src));
}

console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const [누가, 코드] of 치울것) {
    if (!코드) continue;
    const r = await 누가.post(`/api/m/${코드}`, { action: 'remove' });
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.filter(([, c]) => c).length, `${지움}/${치울것.length}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
