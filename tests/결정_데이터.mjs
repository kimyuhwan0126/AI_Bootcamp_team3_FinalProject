/* 그릴링 결정 회귀 시험 — A. 데이터 (lib/db.ts)
   논의87 · 45 · 50 · 65 · 96 · 102 · 104 · 88 · 109

   node tests/결정_데이터.mjs 로 바로 돈다. 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   대부분은 HTTP 로 두들긴다. DB 를 직접 쓰는 자리는 셋뿐이고 전부 '내가 만든 것'이다:
     · AI 가 올린 후보 — 지금 AI 서버가 안 닿아 action:'ai' 로는 못 만든다
     · 90일 묵은 모임  — meetings_touch 트리거가 update 로는 updated_at 을 못 되돌리게 막는다
                          (트리거는 before update 라 insert 로는 원하는 시각을 넣을 수 있다)
     · 유효기간 지난 캐시 줄 — 한국 밖 좌표 칸(gx·gy 음수)이라 실제 값과 안 겹친다
   끝나면 전부 도로 치운다. 남의 데이터는 읽지도 지우지도 않는다. */
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

const 아이디 = () => 'Atest' + Math.random().toString(36).slice(2, 10);

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
const SQL치울것 = [];                               /* SQL 로 넣은 모임 코드 */
/* 모임 만들기는 로그인 필수다 (논의123) — 개발용 guest 통로로 세션을 만든다.
   한 사람은 한 번만 들어온다 — 들어올 때마다 이름이 바뀌면 앞서 만든 모임의 방장이 아니게 된다(논의124). */
let _계정 = 0;
const 로그인해둔다 = async (p) => { if (!p.계정) { p.계정 = 'A시험' + (++_계정); await 로그인(p, p.계정); } };

async function 모임만들기(누가, 이름, scope = 'place') {
  await 로그인해둔다(누가);
  const r = await 누가.post('/api/m', { name: 이름, hostName: '방장', scope, ...출발지() });
  치울것.push([누가, r.json.code]);
  return r.json.code;
}

const 성수 = { kind: 'region', refId: 'A-r-성수', name: '성수동', lat: 37.5447, lng: 127.0557 };
const 연남 = { kind: 'region', refId: 'A-r-연남', name: '연남동', lat: 37.5626, lng: 126.9256 };
const 가게 = (n, refId) => ({ kind: 'place', refId, name: n, lat: 37.5443, lng: 127.0561 });
const 지점들 = (w) => w.candidates.filter((c) => c.kind === 'place');

/* ══ 논의87 — 지역이 바뀌면 지점 후보를 모두 버린다 ══════════════════ */
console.log('\n[논의87] 지역이 바뀌면 지점 후보를 모두 버린다');
{
  const a = person('a');
  const C = await 모임만들기(a, '지역 바뀌면 지점 버림');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...연남 });
  let w = (await a.get(P)).json;
  const 성수id = w.candidates.find((c) => c.ref_id === 성수.refId).id;
  const 연남id = w.candidates.find((c) => c.ref_id === 연남.refId).id;

  await a.post(P, { action: 'confirm', candidateId: 성수id });
  for (const g of [['가게1', 'A-p1'], ['가게2', 'A-p2'], ['가게3', 'A-p3']])
    await a.post(P, { action: 'ping', ...가게(g[0], g[1]) });
  w = (await a.get(P)).json;
  ok('지점 후보 3곳을 모았다', 지점들(w).length === 3, `${지점들(w).length}곳`);

  await a.post(P, { action: 'reopen' });
  w = (await a.get(P)).json;
  ok('되돌리면 지역 단계로', w.meeting.stage === 'region', w.meeting.stage);
  ok('되돌린 그 자리에서 지점 후보가 사라진다', 지점들(w).length === 0, `${지점들(w).length}곳`);
  ok('지역 후보는 그대로 2곳', w.candidates.filter((c) => c.kind === 'region').length === 2);
  const 남은지점 = (await sql`
    select count(*)::int n from candidates where code = ${C} and kind = 'place'`)[0].n;
  ok('DB 에도 숨어 있지 않다 (넣어 두기가 없어졌다)', 남은지점 === 0, `${남은지점}줄`);

  /* 같은 지역으로 다시 확정해도 지점은 안 돌아온다 — 규칙이 한 줄이어야 한다 */
  await a.post(P, { action: 'confirm', candidateId: 성수id });
  w = (await a.get(P)).json;
  ok('같은 지역으로 다시 확정해도 지점은 0곳', 지점들(w).length === 0, `${지점들(w).length}곳`);

  /* 다른 지역으로 확정할 때도 같다 */
  await a.post(P, { action: 'ping', ...가게('가게4', 'A-p4') });
  await a.post(P, { action: 'reopen' });
  await a.post(P, { action: 'confirm', candidateId: 연남id });
  w = (await a.get(P)).json;
  ok('다른 지역으로 확정해도 지점은 0곳', 지점들(w).length === 0, `${지점들(w).length}곳`);
  ok('지역 확정은 그대로 먹었다', w.meeting.stage === 'place' && w.meeting.winner_region_id === 연남id,
     `${w.meeting.stage} · winner=${w.meeting.winner_region_id === 연남id}`);
}

console.log('\n[논의87] 옛 표가 다른 지역으로 따라오지 않는다');
{
  const a = person('a'), b = person('b');
  const C = await 모임만들기(a, '옛 표 안 따라옴');
  const P = `/api/m/${C}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await a.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...연남 });
  let w = (await a.get(P)).json;
  const 성수id = w.candidates.find((c) => c.ref_id === 성수.refId).id;
  const 연남id = w.candidates.find((c) => c.ref_id === 연남.refId).id;

  await a.post(P, { action: 'confirm', candidateId: 성수id });
  await a.post(P, { action: 'ping', ...가게('황소곱창', 'A-k1') });
  await b.post(P, { action: 'ping', ...가게('황소곱창', 'A-k1') });
  w = (await a.get(P)).json;
  ok('성수에서 두 사람이 골랐다', w.candidates.find((c) => c.ref_id === 'A-k1')?.votes === 2);

  await a.post(P, { action: 'reopen' });
  await a.post(P, { action: 'confirm', candidateId: 연남id });
  await a.post(P, { action: 'ping', ...가게('황소곱창', 'A-k1'), lat: 37.5620, lng: 126.9250 });
  w = (await a.get(P)).json;
  const k1 = w.candidates.find((c) => c.ref_id === 'A-k1');
  ok('연남에서 다시 찍으면 1명이다', k1?.votes === 1, `${k1?.votes}명`);
  ok('좌표도 지금 지역 것이다', k1 && Math.abs(k1.lat - 37.5620) < 1e-6, `${k1?.lat}`);
}

console.log('\n[논의87] 결과에서 한 칸 뒤로는 지점을 안 버린다');
{
  /* 지역이 안 바뀌는 되돌리기다 — 여기서까지 버리면 '확정 취소' 가 곧 '처음부터' 가 된다 */
  const a = person('a');
  const C = await 모임만들기(a, '결과에서 한 칸 뒤로');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  await a.post(P, { action: 'ping', ...가게('가게1', 'A-q1') });
  await a.post(P, { action: 'ping', ...가게('가게2', 'A-q2') });
  w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: 지점들(w)[0].id });
  w = (await a.get(P)).json;
  ok('지점까지 정해졌다', w.meeting.stage === 'result', w.meeting.stage);

  await a.post(P, { action: 'reopen' });
  w = (await a.get(P)).json;
  ok('지점 단계로 돌아온다', w.meeting.stage === 'place', w.meeting.stage);
  ok('모은 지점 후보는 그대로 2곳', 지점들(w).length === 2, `${지점들(w).length}곳`);
}

/* ══ 논의45 · 50 · 65 — 내보내면 표도 빠지고, 0이 되면 후보도 사라진다 ══ */
console.log('\n[논의45·50·65] 내보내면 표도 빠진다 · 0이 되면 후보도 사라진다 (예외는 둘)');
{
  const h = person('h'), a = person('a'), b = person('b');
  const C = await 모임만들기(h, '표 빼기와 0표 삭제');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await b.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });

  for (const 누가 of [a, b]) {
    await 누가.post(P, { action: 'ping', ...성수 });
    await 누가.post(P, { action: 'ping', ...연남 });
  }
  let w = (await h.get(P)).json;
  const 성수id = w.candidates.find((c) => c.ref_id === 성수.refId).id;
  const 연남id = w.candidates.find((c) => c.ref_id === 연남.refId).id;
  const 영희id = w.participants.find((p) => p.name === '영희').id;
  const 민준id = w.participants.find((p) => p.name === '민준').id;
  await h.post(P, { action: 'confirm', candidateId: 성수id });

  /* AI 가 올린 지점 — 표가 0인 채로 태어난다 (논의47). action:'ai' 는 AI 서버가 있어야 돌아
     여기서는 같은 모양의 줄을 직접 넣는다. 내가 방금 만든 모임이다. */
  const ai후보 = 아이디();
  await sql`
    insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai)
    values (${ai후보}, ${C}, 'place', 'A-ai-1', 'AI 가 올린 집', 37.5443, 127.0561, true)`;

  await a.post(P, { action: 'ping', ...가게('영희만 고른 집', 'A-x1') });
  w = (await h.get(P)).json;
  ok('AI 후보가 0명인 채로 올라와 있다',
     w.candidates.find((c) => c.ref_id === 'A-ai-1')?.votes === 0);

  await h.post(P, { action: 'kick', participantId: 영희id });
  w = (await h.get(P)).json;
  ok('내보내면 그 사람 표가 빠진다 (논의45)',
     w.candidates.find((c) => c.ref_id === 연남.refId)?.votes === 1,
     `연남 ${w.candidates.find((c) => c.ref_id === 연남.refId)?.votes}명`);
  ok('그 사람만 고른 곳은 사라진다 (논의50)', !w.candidates.some((c) => c.ref_id === 'A-x1'));

  await h.post(P, { action: 'kick', participantId: 민준id });
  w = (await h.get(P)).json;
  const 성수c = w.candidates.find((c) => c.ref_id === 성수.refId);
  ok('예외① 확정된 곳은 0명이어도 남는다', !!성수c && 성수c.votes === 0, `${성수c?.votes}명`);
  ok('예외② AI 가 올린 곳은 0명이어도 남는다', w.candidates.some((c) => c.ref_id === 'A-ai-1'));
  ok('그 밖의 0명 후보는 사라진다 (연남)', !w.candidates.some((c) => c.ref_id === 연남.refId));
  ok('예외는 둘뿐이다', w.candidates.length === 2,
     w.candidates.map((c) => c.name).join(','));
}

console.log('\n[논의65] AI 후보는 사람이 골랐다 취소해도 안 사라진다');
{
  const a = person('a');
  const C = await 모임만들기(a, 'AI 후보 지키기');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });

  const ai후보 = 아이디();
  await sql`
    insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai)
    values (${ai후보}, ${C}, 'place', 'A-ai-2', 'AI 가 올린 집', 37.5443, 127.0561, true)`;

  await a.post(P, { action: 'ping', ...가게('AI 가 올린 집', 'A-ai-2') });   /* 사람이 고른다 */
  w = (await a.get(P)).json;
  let ai = w.candidates.find((c) => c.ref_id === 'A-ai-2');
  ok('사람이 고르면 표가 붙는다', ai?.votes === 1, `${ai?.votes}명`);
  ok('사람이 골라도 AI 것이라는 표시는 그대로다', ai?.by_ai === true, String(ai?.by_ai));

  await a.post(P, { action: 'unping', candidateId: ai.id });                /* 다시 취소 */
  w = (await a.get(P)).json;
  ai = w.candidates.find((c) => c.ref_id === 'A-ai-2');
  ok('취소해서 0명이 돼도 AI 후보는 남는다', !!ai && ai.votes === 0, `${ai?.votes}명`);

  await a.post(P, { action: 'ping', ...가게('사람이 올린 집', 'A-y1') });
  w = (await a.get(P)).json;
  const 사람것 = w.candidates.find((c) => c.ref_id === 'A-y1');
  await a.post(P, { action: 'unping', candidateId: 사람것.id });
  w = (await a.get(P)).json;
  ok('사람이 올린 곳은 0명이 되면 사라진다', !w.candidates.some((c) => c.ref_id === 'A-y1'));
}

/* ══ 논의96 — 내보내진 사람에게는 후보·결과를 안 준다 ═══════════════ */
console.log('\n[논의96] 내보내진 사람에게는 후보·결과를 안 준다');
{
  const h = person('h'), a = person('a');
  const C = await 모임만들기(h, '내보내진 사람의 조회');
  const P = `/api/m/${C}`;
  await a.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await h.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await h.get(P)).json;
  await h.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  await h.post(P, { action: 'ping', ...가게('황소곱창', 'A-z1') });

  const 쫓기전 = (await a.get(P)).json;
  ok('내보내지기 전에는 후보가 보인다', 쫓기전.candidates.length >= 2, `${쫓기전.candidates.length}곳`);

  const 영희id = 쫓기전.participants.find((p) => p.name === '영희').id;
  await h.post(P, { action: 'kick', participantId: 영희id });
  const 쫓긴뒤 = (await a.get(P)).json;
  ok('후보를 하나도 안 준다', 쫓긴뒤.candidates.length === 0, `${쫓긴뒤.candidates.length}곳`);
  ok('정해진 지역도 안 준다', 쫓긴뒤.meeting.winner_region_id === null,
     String(쫓긴뒤.meeting.winner_region_id));
  ok('정해진 지점도 안 준다', 쫓긴뒤.meeting.winner_place_id === null,
     String(쫓긴뒤.meeting.winner_place_id));
  ok('내가 고른 것도 비어 있다', 쫓긴뒤.me.myVotes.length === 0);
  /* 여기까지 비우고 나면 화면이 '내보내졌어요' 를 그릴 수 있어야 한다 */
  const 나 = 쫓긴뒤.participants.find((p) => p.id === 쫓긴뒤.me.participantId);
  ok('내 상태(kicked)는 그대로 준다', 나?.state === 'kicked', String(나?.state));
  ok('내가 누구인지도 그대로 준다', 쫓긴뒤.me.participantId === 영희id);

  /* 방장 화면은 그대로여야 한다 — 비우는 것은 내보내진 사람 쪽뿐이다 */
  const 방장이본것 = (await h.get(P)).json;
  ok('방장에게는 그대로 다 보인다',
     방장이본것.candidates.length >= 2 && !!방장이본것.meeting.winner_region_id,
     `${방장이본것.candidates.length}곳`);
}

/* ══ 논의109 — 지난 모임에 모임 만든 날 ═════════════════════════════ */
console.log('\n[논의109] 모임 만든 날을 화면에 준다');
{
  const a = person('a');
  const C = await 모임만들기(a, '만든 날');
  const w = (await a.get(`/api/m/${C}`)).json;
  const t = w.meeting.created_at;
  ok('created_at 을 준다', typeof t === 'string' && !Number.isNaN(Date.parse(t)), String(t));
  ok('문자열로 준다 (화면이 .slice 로 읽는다)', typeof t === 'string');
  ok('방금 만든 시각이다', Math.abs(Date.now() - Date.parse(t)) < 10 * 60_000);
}

/* ══ 논의102 · 104 — 저장해 둔 답과 오래 조용한 모임을 치운다 ═══════ */
console.log('\n[논의102·104] 밤에 치우기 — 캐시와 오래 조용한 모임');
{
  /* 한국 밖 좌표 칸이라 진짜 값과 안 겹친다 (경도가 음수면 lookupRegion 이 아예 안 받는다) */
  const CX = -1, CY = -1;
  await sql`delete from geo_cache where gx = ${CX} and gy = ${CY}`;
  await sql`delete from places_cache where gx = ${CX} and gy = ${CY}`;
  await sql`
    insert into geo_cache (gx, gy, region_code, name, source, country, hit_at)
    values (${CX}, ${CY}, 'A-old', '묵은동', 'kakao', 'kr', now() - interval '2 years')`;
  await sql`
    insert into geo_cache (gx, gy, region_code, name, source, country, hit_at)
    values (${CX}, ${CY - 1}, 'A-new', '새동', 'kakao', 'kr', now())`;
  await sql`
    insert into places_cache (gx, gy, radius, places, made_at)
    values (${CX}, ${CY}, 1, ${JSON.stringify([{ id: 'x', name: 'ㄱ' }])}::json, now() - interval '9 hours')`;
  await sql`
    insert into places_cache (gx, gy, radius, places, made_at)
    values (${CX}, ${CY}, 2, ${JSON.stringify([{ id: 'x', name: 'ㄱ' }])}::json, now() - interval '1 hour')`;
  await sql`
    insert into places_cache (gx, gy, radius, places, made_at)
    values (${CX}, ${CY}, 3, '[]'::json, now() - interval '2 hours')`;

  /* 90일 묵은 모임 둘 — 하나는 정하다 말았고 하나는 마무리했다.
     host_id 를 채우는 update 가 meetings_touch 트리거를 깨워 updated_at 을 지금으로 밀어 버린다.
     그래서 트리거를 잠깐 끄고 넣는다 — 한 트랜잭션이라 중간에 끊겨도 꺼진 채로 남지 않는다.
     코드는 6자리 규칙을 안 따르는 긴 이름을 쓴다: 진짜 모임 코드와 부딪힐 일이 없다. */
  const 묵은 = [];
  const 심을것 = [['정하다 만 모임', null], ['마무리한 모임', new Date(Date.now() - 190 * 864e5).toISOString()]];
  const 문장 = [sql`alter table meetings disable trigger meetings_touch`];
  for (const [라벨, 마무리] of 심을것) {
    const 코드 = 'A시험-' + Math.random().toString(36).slice(2, 10);
    const pid = 아이디();
    문장.push(
      sql`insert into meetings (code, name, scope, stage, closed_at, created_at, updated_at)
          values (${코드}, ${'[A시험] ' + 라벨}, 'place', 'region', ${마무리},
                  now() - interval '200 days', now() - interval '200 days')`,
      sql`insert into participants (id, code, name, pin_hash, joined_at)
          values (${pid}, ${코드}, '방장', 'A-시험', now() - interval '200 days')`,
      sql`update meetings set host_id = ${pid} where code = ${코드}`,
    );
    묵은.push([코드, !!마무리]);
    SQL치울것.push(코드);
  }
  문장.push(sql`alter table meetings enable trigger meetings_touch`);
  await sql.transaction(문장);

  const 살아있나 = async (코드) =>
    (await sql`select count(*)::int n from meetings where code = ${코드}`)[0].n > 0;
  ok('시험용 묵은 모임 둘을 심었다', (await 살아있나(묵은[0][0])) && (await 살아있나(묵은[1][0])));

  /* 치우기는 조회 100번에 한 번 돈다 — 110번 두들겨 반드시 한 번은 돌게 한다 */
  const h = person('h');
  const C = await 모임만들기(h, '치우기 방아쇠');
  const P = `/api/m/${C}`;
  for (let i = 0; i < 11; i++) await Promise.all(Array.from({ length: 10 }, () => h.get(P)));

  const 남은geo = (await sql`
    select gy from geo_cache where gx = ${CX} order by gy desc`).map((r) => r.gy);
  ok('유효기간 지난 동 이름이 사라졌다 (논의102)', !남은geo.includes(CY), `남은 ${남은geo.join(',')}`);
  ok('멀쩡한 동 이름은 남는다', 남은geo.includes(CY - 1), `남은 ${남은geo.join(',')}`);

  const 남은places = (await sql`
    select radius from places_cache where gx = ${CX} order by radius`).map((r) => r.radius);
  ok('6시간 지난 가게 목록이 사라졌다 (논의102)', !남은places.includes(1), `남은 ${남은places.join(',')}`);
  ok('아직 쓸 만한 가게 목록은 남는다', 남은places.includes(2), `남은 ${남은places.join(',')}`);
  ok('빈손 목록은 30분이면 사라진다', !남은places.includes(3), `남은 ${남은places.join(',')}`);

  ok('90일 조용한 모임이 사라졌다 (논의104)', !(await 살아있나(묵은[0][0])), 묵은[0][0]);
  ok('마무리한 모임은 90일이 지나도 남는다 (기록이다)', await 살아있나(묵은[1][0]), 묵은[1][0]);
  ok('한창인 모임은 안 건드린다', await 살아있나(C), C);

  await sql`delete from geo_cache where gx = ${CX}`;
  await sql`delete from places_cache where gx = ${CX}`;
}

/* ══ 논의88 — 사용자 기록은 로그인한 사람만 (논의123 으로 풀렸다) ════ */
console.log('\n[논의88] 이제 넣었다 — 벽은 그대로 두고 위를 고쳤다');
{
  /* 전에는 이랬다: 방장도 비로그인이라 users 줄을 안 만들면 participants 가 안 받았고
     (user_id·pin_hash 가 둘 다 비므로), 그래서 모임마다 users 한 줄이 쌓였다.
     논의123(방장 로그인 필수)이 서면서 방장은 늘 계정을 가진다 — 열쇠로 잇는 한 줄이다.
     **벽(pin_required_for_guest)은 그대로 둔다**: 신원 없는 참가자를 막는 규칙 자체는 옳다.
     '모임마다 늘지 않는가'는 tests/로그인.mjs S3 이 실제로 세어 본다. */
  const 제약 = await sql`
    select conname from pg_constraint
     where conrelid = 'participants'::regclass and conname = 'pin_required_for_guest'`;
  ok('신원(계정이든 PIN 이든) 없이는 참가자가 될 수 없다', 제약.length === 1,
     제약.length ? '벽이 그대로다' : '벽이 사라졌다 — 신원 없는 줄이 들어올 수 있다');
  const meetings칸 = await sql`
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'meetings' and column_name = 'host_user_id'`;
  ok('meetings 에는 host_user_id 칸이 없다 (방장은 participants.user_id 로 잡는다)',
     meetings칸.length === 0);
}

/* ══ 넣어 두기 장치가 코드에서 사라졌는지 ══════════════════════════ */
console.log('\n[논의87] 넣어 두기 장치가 코드에서 사라졌다');
{
  const src = readFileSync(new URL('../lib/db.ts', import.meta.url), 'utf8');
  const 쓰는줄 = src.split('\n')
    .filter((l) => /parked_under/.test(l) && !/^\s*(\/\*|\*|--)/.test(l));
  ok('lib/db.ts 가 parked_under 를 더 쓰지 않는다', 쓰는줄.length === 0, 쓰는줄.join(' / '));
  ok('0표 삭제 예외에서 parked 조건이 빠졌다', !/parked_under is null/.test(src));
}

/* ══ 논의95 — 코드만 아는 사람에게도 화면이 거짓말하면 안 된다 ══════ */
console.log('\n[논의95] id 를 가려도 방장·고른 사람 셈은 맞아야 한다');
{
  const a = person('n1'), b = person('n2'), 손님 = person('n3');
  const C = await 모임만들기(a, '열람 범위', 'region');
  const P = `/api/m/${C}`;
  await b.post(P, { action: 'join', name: '박영희', pin: '1111', ...출발지() });
  await a.post(P, { action: 'ping', ...성수 });

  const 멤 = (await a.get(P)).json;
  const 손 = (await 손님.get(P)).json;

  ok('멤버에게는 id 가 보인다', 멤.participants.every((p) => p.id), '');
  ok('코드만 아는 사람에게는 id 가 안 보인다',
     손.participants.every((p) => !p.id), `${손.participants.filter((p) => p.id).length}명`);
  ok('코드만 아는 사람에게는 누가 골랐는지 안 보인다',
     (손.candidates[0]?.voters ?? []).length === 0, `${(손.candidates[0]?.voters ?? []).length}`);

  /* id 를 비운 탓에 화면이 p.id === host_id 로 견주면 전원이 방장이 됐다 */
  ok('그래도 방장은 딱 한 명이다',
     손.participants.filter((p) => p.방장인가).length === 1,
     `${손.participants.filter((p) => p.방장인가).length}명`);
  ok('그래도 고른 사람 수는 맞다',
     손.participants.filter((p) => p.골랐나).length === 1,
     `${손.participants.filter((p) => p.골랐나).length}명`);
  ok('멤버가 보는 셈과 같다',
     손.participants.filter((p) => p.방장인가).length === 멤.participants.filter((p) => p.방장인가).length
     && 손.participants.filter((p) => p.골랐나).length === 멤.participants.filter((p) => p.골랐나).length);
}

/* ══ 치우기 ═══════════════════════════════════════════════════════ */
console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const [누가, 코드] of 치울것) {
    if (!코드) continue;
    const r = await 누가.post(`/api/m/${코드}`, { action: 'remove' });
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.filter(([, c]) => c).length,
     `${지움}/${치울것.length}건`);
  for (const 코드 of SQL치울것) await sql`delete from meetings where code = ${코드}`;
  const 남은 = (await sql`
    select count(*)::int n from meetings where name like '[A시험]%'`)[0].n;
  ok('SQL 로 심은 시험용 모임도 치웠다', 남은 === 0, `${남은}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
