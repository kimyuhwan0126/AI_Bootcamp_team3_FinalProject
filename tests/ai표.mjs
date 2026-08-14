/* 그릴링 논의45·46·47·50·53 회귀 시험 — AI 표시와 0표 삭제 (갈래: ai표)
   두 자리는 뒤에 뒤집혔다: 논의50 예외②(넣어 두기)는 논의87 이 없앴고,
   앞엣것 치우기는 논의90 이 '성공했을 때만'으로 옮겼다 — 그 블록들이 지금 규칙을 본다.
   node tests/ai표.mjs   ← 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).

   AI 서버에 닿을 수 없어 ai 는 늘 503 이다 — 'AI 가 올린 후보'는 SQL 로 심어 흉내 낸다
   (by_ai = true, 표 0). 심은 뒤의 규칙은 전부 진짜 라우트를 두들겨 확인한다.
   닿을 수 없어 흉내로만 되는 세 가지(insert 에 by_ai, on conflict 에서 안 덮기,
   AI 경로는 표를 안 달기)는 소스로 본다 — tests/api.mjs 의 A25 와 같은 방식.

   DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다. 내가 만든 모임만 지운다. */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });

/** 쿠키를 들고 다니는 사람 하나 (flowtest 와 같은 결) */
function person() {
  const jar = new Map();
  return {
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
/* 만드는 사람은 로그인해야 한다 (논의123) — 참여(join)는 그대로 로그인 없이 된다.
   쿠키 항아리마다 한 번만 로그인한다. 못 만들면 그 자리에서 터뜨린다 —
   code 가 undefined 로 흘러가면 그 뒤 물음이 전부 404 가 되어 진짜 까닭이 묻힌다. */
async function 모임만들기(누가, 이름, extra = {}) {
  if (!누가.로그인함) 누가.로그인함 = await 로그인(누가, '시험AI');
  const r = await 누가.post('/api/m', { name: 이름, hostName: '방장', scope: 'place', ...출발지(), ...extra });
  if (!r.json?.code) throw new Error(`모임을 못 만들었다: ${r.status} ${r.text.slice(0, 80)}`);
  치울것.push([누가, r.json.code]);
  return r.json.code;
}
const 참여 = (누가, C, 이름, pin) => 누가.post(`/api/m/${C}`, { action: 'join', name: 이름, pin, ...출발지() });

const 성수 = { kind: 'region', refId: 'ai-r-A', name: '성수동', lat: 37.5447, lng: 127.0557 };
const 연남 = { kind: 'region', refId: 'ai-r-B', name: '연남동', lat: 37.5626, lng: 126.9256 };
const 후보들 = (w, k) => w.candidates.filter((c) => c.kind === k);
const 찾기 = (w, 이름) => w.candidates.find((c) => c.name === 이름);

/** AI 가 올린 후보 흉내 — 표 없이, by_ai 로. 라우트가 만들 모양 그대로 심는다. */
let _ai = 0;
async function AI후보심기(code, kind, o, createdBy) {
  const id = 'aitest' + (_ai++) + Date.now().toString(36).slice(-4);
  await sql`
    insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai, created_by)
    values (${id}, ${code}, ${kind}, ${o.refId}, ${o.name}, ${o.lat}, ${o.lng}, true, ${createdBy})
  `;
  return id;
}

console.log('\n[논의45·50] 내보내면 표도 같이 뺀다 · 0표가 된 후보는 사라진다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 내보내기');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await a.post(P, { action: 'ping', ...성수 });
  await b.post(P, { action: 'ping', ...성수 });
  await b.post(P, { action: 'ping', ...연남 });

  let w = (await a.get(P)).json;
  ok('내보내기 전 — 성수 2표 · 연남 1표',
     찾기(w, '성수동')?.votes === 2 && 찾기(w, '연남동')?.votes === 1,
     후보들(w, 'region').map((c) => `${c.name} ${c.votes}표`).join(' · '));

  const 영희id = w.participants.find((p) => p.name === '영희').id;
  await a.post(P, { action: 'kick', participantId: 영희id });
  w = (await a.get(P)).json;
  ok('내보낸 사람의 표가 빠진다', 찾기(w, '성수동')?.votes === 1,
     `성수동 ${찾기(w, '성수동')?.votes}표`);
  ok('그 사람 표뿐이던 후보는 함께 사라진다', !찾기(w, '연남동'),
     후보들(w, 'region').map((c) => `${c.name} ${c.votes}표`).join(' · ') || '없음');
}

console.log('\n[논의50 예외①] 확정된 곳은 0표가 돼도 남는다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 확정 예외');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await b.post(P, { action: 'ping', ...성수 });        /* 영희 혼자 찍은 곳 */
  let w = (await a.get(P)).json;
  const 성수id = 찾기(w, '성수동').id;
  await a.post(P, { action: 'confirm', candidateId: 성수id });

  const 영희id = w.participants.find((p) => p.name === '영희').id;
  await a.post(P, { action: 'kick', participantId: 영희id });
  w = (await a.get(P)).json;
  ok('확정된 곳의 마지막 표도 빠진다', 찾기(w, '성수동')?.votes === 0,
     `${찾기(w, '성수동')?.votes}표`);
  ok('그래도 확정된 곳은 안 사라진다', !!찾기(w, '성수동'));
  ok('확정이 허공을 가리키지 않는다', w.meeting.winner_region_id === 성수id,
     `winner=${w.meeting.winner_region_id ?? 'null'}`);
}

console.log('\n[논의50 예외②→논의87] 넣어 두기 장치는 없어졌다');
{
  /* 여기는 전에 '넣어 둔 곳은 0표가 돼도 남는다'(논의50 예외②)를 보던 자리다.
     논의87 이 넣어 두는 장치를 통째로 없앴다 — 지역을 정하면 지점은 늘 처음부터다
     (lib/db.ts 의 "예외 '넣어 둔 곳'은 없어졌다" · tests/db.mjs A13 이 같은 규칙을 본다).
     0표를 지키는 예외는 이제 둘뿐이다: 확정된 곳(예외①)과 AI 가 올린 곳(예외③).
     블록을 지우지 않고 뒤집어 둔다 — 넣어 두기가 슬그머니 돌아오면 여기가 잡는다. */
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 넣어 둔 곳');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await a.post(P, { action: 'ping', ...성수 });
  let w = (await a.get(P)).json;
  const 성수id = 찾기(w, '성수동').id;
  await a.post(P, { action: 'confirm', candidateId: 성수id });
  await b.post(P, { action: 'ping', kind: 'place', refId: 'ai-p-1', name: '황소곱창', lat: 37.5443, lng: 127.0561 });
  await a.post(P, { action: 'reopen' });               /* 지점 후보는 여기서 버려진다 (논의87) */

  w = (await a.get(P)).json;
  ok('되돌리면 지점 후보는 그 자리에서 버려진다', !찾기(w, '황소곱창'), 후보들(w, 'place').length + '곳');

  const 영희id = w.participants.find((p) => p.name === '영희').id;
  await a.post(P, { action: 'kick', participantId: 영희id });
  await a.post(P, { action: 'confirm', candidateId: 성수id });   /* 같은 지역으로 돌아온다 */
  w = (await a.get(P)).json;
  ok('같은 지역을 다시 정해도 안 돌아온다', !찾기(w, '황소곱창'), 후보들(w, 'place').length + '곳');
}

console.log('\n[논의50] 남이 올린 곳도 마지막 표가 빠지면 사라진다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 마지막 표');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await a.post(P, { action: 'ping', ...성수 });        /* 올린 사람 = 방장 */
  await b.post(P, { action: 'ping', ...성수 });

  let w = (await a.get(P)).json;
  const 성수id = 찾기(w, '성수동').id;
  await a.post(P, { action: 'unping', candidateId: 성수id });
  w = (await a.get(P)).json;
  ok('표가 남아 있으면 후보도 남는다', 찾기(w, '성수동')?.votes === 1, `${찾기(w, '성수동')?.votes}표`);

  await b.post(P, { action: 'unping', candidateId: 성수id });
  w = (await a.get(P)).json;
  ok('올린 사람이 아니어도 마지막 표를 빼면 사라진다', !찾기(w, '성수동'),
     후보들(w, 'region').map((c) => c.name).join(',') || '없음');
}

console.log('\n[논의46] 1위만 확정할 수 있다');
{
  const a = person(), b = person(), c = person();
  const C = await 모임만들기(a, 'AI표 · 1위 확정');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await 참여(c, C, '민준', '2222');
  await a.post(P, { action: 'ping', ...성수 });
  await b.post(P, { action: 'ping', ...성수 });
  await c.post(P, { action: 'ping', ...연남 });

  const w = (await a.get(P)).json;
  const 꼴찌 = 찾기(w, '연남동'), 일등 = 찾기(w, '성수동');
  const 진곳 = await a.post(P, { action: 'confirm', candidateId: 꼴찌.id });
  ok('표가 적은 곳은 확정 못 한다', 진곳.status === 400 && 진곳.json?.error === 'not_top',
     `${진곳.status} ${진곳.json?.error ?? ''}`);
  const 후 = (await a.get(P)).json;
  ok('막힌 확정은 단계도 안 넘긴다', 후.meeting.stage === 'region' && !후.meeting.winner_region_id,
     `${후.meeting.stage} · winner=${후.meeting.winner_region_id ?? 'null'}`);
  ok('1위는 그대로 확정된다',
     (await a.post(P, { action: 'confirm', candidateId: 일등.id })).status === 200);
}

console.log('\n[논의46] 동점이면 동점인 곳 전부가 1위다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 동점');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  await a.post(P, { action: 'ping', ...성수 });
  await b.post(P, { action: 'ping', ...연남 });
  const w = (await a.get(P)).json;
  const r = await a.post(P, { action: 'confirm', candidateId: 찾기(w, '연남동').id });
  ok('동점인 곳은 어느 쪽이든 확정된다', r.status === 200, `${r.status} ${r.json?.error ?? ''}`);
}

console.log('\n[논의46] 전부 0표면 확정할 수 없다');
{
  const a = person();
  const C = await 모임만들기(a, 'AI표 · 0표뿐');
  const P = `/api/m/${C}`;
  const w0 = (await a.get(P)).json;
  const 심은id = await AI후보심기(C, 'region', { refId: 'ai-r-Z', name: '망원동', lat: 37.5559, lng: 126.9020 },
                                  w0.meeting.host_id);
  let w = (await a.get(P)).json;
  ok('AI 가 올린 곳은 표 없이 목록에 보인다',
     찾기(w, '망원동')?.votes === 0 && 찾기(w, '망원동')?.by_ai === true,
     `${찾기(w, '망원동')?.votes}표 · by_ai=${찾기(w, '망원동')?.by_ai}`);

  const r = await a.post(P, { action: 'confirm', candidateId: 심은id });
  ok('아무도 안 찍었으면 확정 못 한다', r.status === 400 && r.json?.error === 'no_votes',
     `${r.status} ${r.json?.error ?? ''}`);
  w = (await a.get(P)).json;
  ok('0표 확정은 단계도 안 넘긴다', w.meeting.stage === 'region' && !w.meeting.winner_region_id,
     `${w.meeting.stage} · winner=${w.meeting.winner_region_id ?? 'null'}`);
}

console.log('\n[논의47 예외③] AI 가 올린 곳은 0표가 돼도 안 사라진다');
{
  const a = person();
  const C = await 모임만들기(a, 'AI표 · AI 후보 지키기');
  const P = `/api/m/${C}`;
  const w0 = (await a.get(P)).json;
  const 심은id = await AI후보심기(C, 'region', { refId: 'ai-r-C', name: '망원동', lat: 37.5559, lng: 126.9020 },
                                  w0.meeting.host_id);
  await a.post(P, { action: 'ping', kind: 'region', refId: 'ai-r-C', name: '망원동', lat: 37.5559, lng: 126.9020 });
  let w = (await a.get(P)).json;
  ok('사람이 찍으면 표가 붙는다', 찾기(w, '망원동')?.votes === 1, `${찾기(w, '망원동')?.votes}표`);
  ok('사람이 찍어도 AI 표시는 그대로다', 찾기(w, '망원동')?.by_ai === true, `by_ai=${찾기(w, '망원동')?.by_ai}`);

  await a.post(P, { action: 'unping', candidateId: 심은id });
  w = (await a.get(P)).json;
  ok('표를 도로 빼도 AI 후보는 남는다', !!찾기(w, '망원동'),
     후보들(w, 'region').map((c) => c.name).join(',') || '없음');
}

console.log('\n[논의53·90] 새것을 받아 왔을 때만 앞엣것이 사라진다 (찍힌 것은 남는다)');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'AI표 · 다시 부르기');
  const P = `/api/m/${C}`;
  await 참여(b, C, '영희', '1111');
  const w0 = (await a.get(P)).json;
  const 방장id = w0.meeting.host_id;
  await AI후보심기(C, 'region', { refId: 'ai-r-D', name: '아무도안찍은동', lat: 37.5559, lng: 126.9020 }, 방장id);
  await AI후보심기(C, 'region', { refId: 'ai-r-E', name: '영희가찍은동', lat: 37.5626, lng: 126.9256 }, 방장id);
  await b.post(P, { action: 'ping', kind: 'region', refId: 'ai-r-E', name: '영희가찍은동', lat: 37.5626, lng: 126.9256 });
  await a.post(P, { action: 'ping', ...성수 });        /* 사람이 손으로 올린 곳 */

  /* 앞엣것을 치우는 것은 **새것을 받아 온 뒤**다 (논의53 → 논의90).
     부르기 전에 치웠더니 AI 가 안 닿는 동안 이 단추가 '앞 추천 지우기'로만 동작했다 —
     실패했으면 아무것도 안 건드린다. 이 PC 는 AI 서버에 못 닿아 늘 503 쪽으로 간다
     (tests/결정_규칙.mjs 논의90 이 같은 자리를 본다). */
  const ai = await a.post(P, { action: 'ai' });
  const w = (await a.get(P)).json;
  ok('AI 는 되거나 정직하게 실패한다', ai.status === 200 || ai.status === 503,
     `${ai.status} ${ai.json?.error ?? ''}`);
  if (ai.status === 200)
    ok('새것을 받아 왔으면 아무도 안 찍은 앞엣것은 사라진다', !찾기(w, '아무도안찍은동'),
       후보들(w, 'region').map((c) => c.name).join(',') || '없음');
  else
    ok('못 닿았으면 앞엣것도 안 건드린다 (논의90)', !!찾기(w, '아무도안찍은동'),
       후보들(w, 'region').map((c) => c.name).join(',') || '없음');
  ok('누가 찍은 AI 후보는 남는다', !!찾기(w, '영희가찍은동'));
  ok('사람이 올린 후보는 그대로다', !!찾기(w, '성수동'));
}

console.log('\n[논의47] AI 경로가 표 없이 by_ai 로 올린다 (소스)');
{
  const 라우트 = readFileSync(new URL('../app/api/m/[code]/route.ts', import.meta.url), 'utf8');
  const 디비 = readFileSync(new URL('../lib/db.ts', import.meta.url), 'utf8');
  const ai블록 = 라우트.slice(라우트.indexOf("case 'ai'"), 라우트.indexOf('default:'));
  ok('AI 갈래가 byAi 로 db.ping 을 부른다', /byAi:\s*true/.test(ai블록),
     ai블록.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' / '));

  const ping블록 = 디비.slice(디비.indexOf('export async function ping'), 디비.indexOf('export async function unping'));
  const 넣기 = ping블록.slice(0, ping블록.indexOf('on conflict'));
  const 덮기 = ping블록.slice(ping블록.indexOf('on conflict'), ping블록.indexOf('returning id'));
  ok('insert 가 by_ai 를 채운다', /by_ai/.test(넣기));
  ok('on conflict 는 by_ai 를 안 덮는다', !/by_ai/.test(덮기), 덮기.match(/by_ai.*/)?.[0] ?? '');
  ok('AI 로 올린 곳에는 표를 안 단다', /if\s*\(!o\.byAi\)/.test(ping블록),
     ping블록.slice(ping블록.indexOf('insert into votes') - 80, ping블록.indexOf('insert into votes')).trim().slice(-60));
}

console.log('\n[치우기]');
{
  let 지움 = 0, 셀것 = 0;
  for (const [누가, 코드] of 치울것) {
    if (!코드) continue;
    셀것++;
    if ((await 누가.post(`/api/m/${코드}`, { action: 'remove' })).status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 셀것, `${지움}/${셀것}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
