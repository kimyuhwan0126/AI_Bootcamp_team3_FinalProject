/* B갈래(규칙) 회귀 시험 — app/api/m/[code]/route.ts
   그릴링 논의 46 · 79 · 98 · 106 · 107 · 90 · 93 · 125 · 69 · 123

   node tests/결정_규칙.mjs   ← 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   내가 만든 모임만 건드리고, 끝나면 그 코드만 지운다(마무리된 모임은 API 로 못 지우는 회차가
   있어 마지막 청소는 DB 로 한다).

   'localhost' 는 ::1 로 먼저 붙는데 undici 가 여기서 종종 10초를 흘려보낸다 — 주소를 못 박는다.
   AI 는 지금 안 닿는다(503). 그래서 AI 항목은 '실패했을 때 무엇이 남는가'로 검사한다. */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0, hold = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
/* 다른 파일이 고쳐져야 초록이 되는 항목 — 실패로 세지 않고 눈에 띄게만 둔다 */
const 보류 = (n, d) => { hold++; console.log(`  ⏸ ${n}  → ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다 */
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

const 만든모임 = [];
/* 모임 만들기는 로그인 필수다 (논의123) — 개발용 guest 통로로 세션을 만든다.
   한 사람은 한 번만 들어온다 — 들어올 때마다 이름이 바뀌면 앞서 만든 모임의 방장이 아니게 된다(논의124). */
let _계정 = 0;
const 로그인해둔다 = async (p) => { if (!p.계정) { p.계정 = 'R시험' + (++_계정); await 로그인(p, p.계정); } };

const 모임만들기 = async (p, name, extra = {}) => {
  await 로그인해둔다(p);
  const r = await p.post('/api/m', { name, hostName: '방장', scope: 'place', ...출발지(), ...extra });
  if (r.json?.code) 만든모임.push(r.json.code);
  return r.json?.code;
};
const 참여 = (p, code, name, pin) => p.post(`/api/m/${code}`, { action: 'join', name, pin, ...출발지() });
const 뷰 = async (p, code) => (await p.get(`/api/m/${code}`)).json;

/* 표 0인 후보는 사람 손으로는 만들 수 없다(0표가 되면 사라진다 — 논의50).
   AI 가 올린 곳만 0표로 남는데 AI 가 안 닿으므로, 그 한 줄만 DB 로 심는다. */
const AI후보심기 = async (code, kind, name, lat, lng) => {
  const id = 'tB' + Math.random().toString(36).slice(2, 10);
  await sql`
    insert into candidates (id, code, kind, ref_id, name, lat, lng, by_ai)
    values (${id}, ${code}, ${kind}, ${'ai:' + name}, ${name}, ${lat}, ${lng}, true)
  `;
  return id;
};

/** SSE 로 몇 번 알렸는지 — 모임이 사라졌을 때 남들 화면이 닫히는지 본다 (논의69) */
async function 귀(code) {
  const ctrl = new AbortController();
  const r = await fetch(`${BASE}/api/m/${code}/stream`, { signal: ctrl.signal, headers: { accept: 'text/event-stream' } });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  const 온것 = [];
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n'))
          if (line.startsWith('data: ')) 온것.push(line.slice(6).trim());
      }
    } catch { /* 끊기면 그만 */ }
  })();
  await sleep(300);
  return {
    async 센다() { await sleep(400); return 온것.filter((e) => e === 'changed').length; },
    끊는다() { ctrl.abort(); },
  };
}

const 동 = [
  { refId: 'B-r1', name: '성수동', lat: 37.5447, lng: 127.0557 },
  { refId: 'B-r2', name: '연남동', lat: 37.5626, lng: 126.9256 },
];

/* ══ 논의46 — 서버가 1위만 받는다 ══════════════════════════════ */
console.log('\n[논의46] 1위만 확정된다');
{
  const a = person(), b = person(), c = person();
  const C = await 모임만들기(a, '1위만 확정');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');
  await 참여(c, C, '영희', '2222');

  await a.post(P, { action: 'ping', kind: 'region', ...동[0] });
  await b.post(P, { action: 'ping', kind: 'region', ...동[0] });
  await c.post(P, { action: 'ping', kind: 'region', ...동[1] });

  let w = await 뷰(a, C);
  const 성수 = w.candidates.find((x) => x.name === '성수동');
  const 연남 = w.candidates.find((x) => x.name === '연남동');
  ok('표가 2 대 1 이다', 성수.votes === 2 && 연남.votes === 1, `${성수.votes} : ${연남.votes}`);

  const 꼴찌 = await a.post(P, { action: 'confirm', candidateId: 연남.id });
  ok('1위가 아닌 곳은 확정할 수 없다', 꼴찌.status === 400 && 꼴찌.json?.error === 'not_top',
     `${꼴찌.status} ${꼴찌.json?.error}`);
  ok('1위는 확정된다', (await a.post(P, { action: 'confirm', candidateId: 성수.id })).status === 200);

  /* 동점이면 동점인 곳 전부가 1위다 */
  await a.post(P, { action: 'reopen' });
  await a.post(P, { action: 'ping', kind: 'region', ...동[1] });
  w = await 뷰(a, C);
  ok('동점을 만들었다', w.candidates.every((x) => x.votes === 2), w.candidates.map((x) => `${x.name} ${x.votes}`).join(' · '));
  ok('동점이면 한쪽을 확정할 수 있다', (await a.post(P, { action: 'confirm', candidateId: 연남.id })).status === 200);
  await a.post(P, { action: 'reopen' });
  ok('동점이면 다른 쪽도 확정할 수 있다', (await a.post(P, { action: 'confirm', candidateId: 성수.id })).status === 200);

  /* 전부 0표 — 사람이 찍은 곳은 0표가 되면 사라지므로 AI 후보로만 생긴다 */
  const z = person();
  const Z = await 모임만들기(z, '전부 0표 확정');
  const 심은것 = await AI후보심기(Z, 'region', 'AI동', 37.55, 127.02);
  const w2 = await 뷰(z, Z);
  ok('0표 후보가 목록에 있다', w2.candidates.length === 1 && w2.candidates[0].votes === 0,
     `${w2.candidates.length}곳 ${w2.candidates[0]?.votes}표`);
  const 표없음 = await z.post(`/api/m/${Z}`, { action: 'confirm', candidateId: 심은것 });
  ok('전부 0표면 확정할 수 없다', 표없음.status === 400 && 표없음.json?.error === 'no_votes',
     `${표없음.status} ${표없음.json?.error}`);
}

/* ══ 논의79 — 모임 범위는 못 바꾼다 ═══════════════════════════ */
console.log('\n[논의79] 모임 범위(scope)는 만들 때 정하고 끝이다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, '범위 잠금', { scope: 'place' });
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');

  const r1 = await a.post(P, { action: 'update', scope: 'region' });
  ok('scope 만 보내면 400 scope_locked', r1.status === 400 && r1.json?.error === 'scope_locked',
     `${r1.status} ${r1.json?.error}`);

  const r2 = await a.post(P, { action: 'update', name: '몰래 바꾼 이름', scope: 'region' });
  ok('이름에 얹어 보내도 400', r2.status === 400 && r2.json?.error === 'scope_locked',
     `${r2.status} ${r2.json?.error}`);
  let w = await 뷰(a, C);
  ok('막혔으면 이름도 안 바뀐다', w.meeting.name === '범위 잠금' && w.meeting.scope === 'place',
     `${w.meeting.name} · ${w.meeting.scope}`);

  const r3 = await a.post(P, { action: 'update', scope: 'place' });
  ok('지금과 같은 값이어도 400', r3.status === 400 && r3.json?.error === 'scope_locked',
     `${r3.status} ${r3.json?.error}`);

  ok('이름 고치기는 그대로 된다',
     (await a.post(P, { action: 'update', name: '고친 이름' })).status === 200);
  w = await 뷰(a, C);
  ok('고친 이름이 남는다', w.meeting.name === '고친 이름', w.meeting.name);

  const r4 = await b.post(P, { action: 'update', scope: 'region' });
  ok('참여자는 방장 검사에 먼저 걸린다', r4.status === 403, `${r4.status} ${r4.json?.error}`);
}

/* ══ 논의98 — 레거시 vote 액션은 없다 ════════════════════════ */
console.log('\n[논의98] 예전 vote 액션은 사라졌다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, 'vote 없앰');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');
  await a.post(P, { action: 'ping', kind: 'region', ...동[0] });
  let w = await 뷰(a, C);
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  await a.post(P, { action: 'ping', kind: 'place', refId: 'B-p1', name: '황소곱창', lat: 37.5447, lng: 127.0557 });
  w = await 뷰(a, C);
  const 곱창 = w.candidates.find((x) => x.kind === 'place');

  const r1 = await b.post(P, { action: 'vote', candidateId: 곱창.id });
  ok('있는 후보에도 vote 는 안 먹는다', r1.status === 400 && r1.json?.error === 'unknown_action',
     `${r1.status} ${r1.json?.error}`);
  const r2 = await b.post(P, { action: 'vote', candidateId: 'x' });
  ok('없는 후보에 vote 도 400 unknown_action', r2.status === 400 && r2.json?.error === 'unknown_action',
     `${r2.status} ${r2.json?.error}`);
  w = await 뷰(a, C);
  ok('vote 로는 표가 안 는다', w.candidates.find((x) => x.kind === 'place').votes === 1,
     `${w.candidates.find((x) => x.kind === 'place').votes}표`);
}

/* ══ 논의106 — 정하지 않고 끝내기 ════════════════════════════ */
console.log('\n[논의106] 확정이 없어도 마무리할 수 있다');
{
  /* ① 후보가 한 곳도 없는 모임 */
  const a = person();
  const C = await 모임만들기(a, '빈 채로 끝내기');
  const P = `/api/m/${C}`;
  const 그냥 = await a.post(P, { action: 'close' });
  ok('보통 마무리는 여전히 막힌다', 그냥.status === 409 && 그냥.json?.error === 'nothing_decided',
     `${그냥.status} ${그냥.json?.error}`);
  const 힘 = await a.post(P, { action: 'close', force: true });
  ok('후보 0곳에서도 정하지 않고 끝낼 수 있다', 힘.status === 200, `${힘.status} ${힘.json?.error ?? ''}`);
  const w = await 뷰(a, C);
  ok('마무리 표시가 찍힌다', !!w.meeting.closed_at, String(w.meeting.closed_at).slice(0, 19));
  ok('정한 곳은 여전히 없다', !w.meeting.winner_region_id && !w.meeting.winner_place_id);
  const 또 = await a.post(P, { action: 'close', force: true });
  ok('끝난 모임은 또 끝낼 수 없다', 또.status === 409 && 또.json?.error === 'closed',
     `${또.status} ${또.json?.error}`);

  /* ② 후보는 있는데 확정만 안 한 모임 */
  const b = person(), c = person();
  const C2 = await 모임만들기(b, '고르다 말고 끝내기');
  const P2 = `/api/m/${C2}`;
  await 참여(c, C2, '철수', '1111');
  await b.post(P2, { action: 'ping', kind: 'region', ...동[0] });
  await c.post(P2, { action: 'ping', kind: 'region', ...동[1] });
  const 참여자가 = await c.post(P2, { action: 'close', force: true });
  ok('참여자는 정하지 않고 끝낼 수 없다', 참여자가.status === 403, `${참여자가.status} ${참여자가.json?.error}`);
  ok('확정 없이 보통 마무리는 막힌다', (await b.post(P2, { action: 'close' })).status === 409);
  const 힘2 = await b.post(P2, { action: 'close', force: true });
  ok('후보가 있어도 확정 없이 끝낼 수 있다', 힘2.status === 200, `${힘2.status} ${힘2.json?.error ?? ''}`);
  const w2 = await 뷰(b, C2);
  ok('후보는 기록으로 남는다', w2.candidates.length === 2 && !w2.meeting.winner_region_id,
     `${w2.candidates.length}곳`);

  /* ③ 제대로 정한 모임은 예전 길 그대로 */
  const d = person();
  const C3 = await 모임만들기(d, '정하고 끝내기', { scope: 'region' });
  const P3 = `/api/m/${C3}`;
  await d.post(P3, { action: 'ping', kind: 'region', ...동[0] });
  const w3 = await 뷰(d, C3);
  await d.post(P3, { action: 'confirm', candidateId: w3.candidates[0].id });
  ok('정한 모임은 force 없이 마무리된다', (await d.post(P3, { action: 'close' })).status === 200);
}

/* ══ 논의107 — 마무리 가드는 remove 만 예외 ═══════════════════ */
console.log('\n[논의107] 마무리한 모임 — 지우기만 열린다');
{
  const a = person(), b = person(), 남 = person();
  const C = await 모임만들기(a, '마무리 뒤 가드');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');
  await a.post(P, { action: 'ping', kind: 'region', ...동[0] });
  const w = await 뷰(a, C);
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  ok('마무리한다', (await a.post(P, { action: 'close' })).status === 200);

  const 방장이막히는것 = [
    ['update', { action: 'update', name: '새 이름' }],
    ['reopen', { action: 'reopen' }],
    ['ping', { action: 'ping', kind: 'place', refId: 'zz', name: 'x', lat: 37.5, lng: 127.0 }],
    ['approve', { action: 'approve', participantId: 'x', ok: true }],
    ['kick', { action: 'kick', participantId: 'x' }],
    ['unping', { action: 'unping', candidateId: 'x' }],
    ['ai', { action: 'ai' }],
  ];
  for (const [이름, 몸] of 방장이막히는것) {
    const r = await a.post(P, 몸);
    ok(`${이름} 은 409 closed`, r.status === 409 && r.json?.error === 'closed', `${r.status} ${r.json?.error}`);
  }
  const 나가기 = await b.post(P, { action: 'leave' });
  ok('leave 도 409 closed', 나가기.status === 409 && 나가기.json?.error === 'closed',
     `${나가기.status} ${나가기.json?.error}`);
  const 새참여 = await 남.post(P, { action: 'join', name: '늦은사람', pin: '3333', ...출발지() });
  ok('join 도 409 closed', 새참여.status === 409 && 새참여.json?.error === 'closed',
     `${새참여.status} ${새참여.json?.error}`);

  const 참여자삭제 = await b.post(P, { action: 'remove' });
  ok('참여자의 지우기는 방장 검사에 걸린다(409 아님)', 참여자삭제.status === 403,
     `${참여자삭제.status} ${참여자삭제.json?.error}`);
  const 삭제 = await a.post(P, { action: 'remove' });
  ok('방장은 마무리한 모임을 지울 수 있다', 삭제.status === 200, `${삭제.status} ${삭제.json?.error}`);
  ok('지운 모임은 사라진다', (await a.get(P)).status === 404);
}

/* ══ 논의90 — AI 는 성공했을 때만 앞엣것을 치운다 ══════════════ */
console.log('\n[논의90] AI 가 실패하면 앞 추천이 그대로 남는다  (호출마다 10초쯤 걸린다)');
{
  const a = person();
  const C = await 모임만들기(a, 'AI 실패');
  await AI후보심기(C, 'region', '앞선추천', 37.56, 127.01);
  let w = await 뷰(a, C);
  ok('앞선 AI 추천이 한 곳 있다', w.candidates.length === 1, `${w.candidates.length}곳`);

  const r = await a.post(`/api/m/${C}`, { action: 'ai' });
  ok('AI 는 정직하게 실패한다', r.status === 503 || r.status === 200, `${r.status} ${r.json?.error ?? ''}`);
  w = await 뷰(a, C);
  if (r.status === 503)
    ok('실패했으면 앞 추천이 그대로 남는다', w.candidates.some((x) => x.name === '앞선추천'),
       `${w.candidates.length}곳`);
  else
    보류('AI 가 살아났다 — 성공 때 앞엣것이 치워지는지는 따로 본다', `added ${r.json?.added}`);
}

/* ══ 논의93 — AI 는 단계마다 3번, 다만 못 붙으면 안 태운다 ═══════ */
console.log(String.fromCharCode(10) + '[논의93] AI 는 지역 3번 · 지점 3번 (못 붙으면 안 센다)');
{
  const a = person();
  const C = await 모임만들기(a, 'AI 횟수');
  const P = `/api/m/${C}`;

  /* 이 PC 에서는 AI 서버에 못 닿는다. 그것이 바로 봐야 할 자리다 —
     못 붙은 것은 한 푼도 안 든 것이라 횟수를 돌려준다(논의93).
     가르기 전에는 AI 가 죽어 있는 동안 세 번 눌러 아무것도 못 받고 막혔다. */
  const 남은 = [];
  for (let i = 0; i < 4; i++) {
    const r = await a.post(P, { action: 'ai' });
    남은.push({ s: r.status, n: r.json?.aiLeft, e: r.json?.error });
  }
  const 못붙음 = 남은.every((x) => x.s === 503 && x.e === 'ai_unavailable');
  if (못붙음) {
    ok('못 붙으면 몇 번을 눌러도 횟수가 안 준다',
       남은.every((x) => x.n === 3), JSON.stringify(남은.map((x) => x.n)));
  } else {
    ok('닿으면 부를 때마다 남은 횟수가 준다',
       JSON.stringify(남은.slice(0, 3).map((x) => x.n)) === JSON.stringify([2, 1, 0]),
       JSON.stringify(남은.map((x) => x.n)));
  }

  /* 한도 자체는 AI 와 무관하게 선다 — 이미 다 쓴 것으로 만들어 놓고 본다 */
  await sql`update meetings set ai_used_region = 3 where code = ${C}`;
  const 막힘 = await a.post(P, { action: 'ai' });
  ok('다 썼으면 막힌다', 막힘.status === 429 && 막힘.json?.error === 'ai_limit',
     `${막힘.status} ${막힘.json?.error}`);
  ok('막혔을 때도 남은 횟수는 0 으로 실린다', 막힘.json?.aiLeft === 0, String(막힘.json?.aiLeft));

  /* 지역을 다 써도 지점 셈은 따로다 */
  await a.post(P, { action: 'ping', kind: 'region', ...동[0] });
  const w = await 뷰(a, C);
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  const 지점에서 = await a.post(P, { action: 'ai' });
  ok('지점 단계는 지역과 따로 센다', 지점에서.status !== 429,
     `${지점에서.status} 남은 ${지점에서.json?.aiLeft}`);
}

/* ══ 논의125 — 방장 넘기기를 없앴다. 방장은 못 나간다 ═══════════
   논의97('방장은 넘기고 나간다')을 대체한다. 넘겨받는 사람이 로그인 안 했으면
   그 모임이 다시 '쿠키만 가진 방장'이 되어 벽돌 위험(논의122)이 돌아오기 때문이다.
   그래서 옛 시험(넘기기 성공·already_host·넘긴 뒤 나가기)은 규칙이 바뀌어 없어졌다. */
console.log('\n[논의125] 방장 넘기기가 없다 · 방장은 못 나간다');
{
  const a = person(), b = person(), c = person();
  const C = await 모임만들기(a, '방장 나가기');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');
  await 참여(c, C, '영희', '2222');

  const 그냥나가기 = await a.post(P, { action: 'leave' });
  ok('사람이 둘 이상이면 방장은 못 나간다',
     그냥나가기.status === 409 && 그냥나가기.json?.error === 'host_cannot_leave',
     `${그냥나가기.status} ${그냥나가기.json?.error}`);

  let w = await 뷰(a, C);
  const 방장id = w.meeting.host_id;
  const 영희id = w.participants.find((p) => p.name === '영희').id;

  const 자기강퇴 = await a.post(P, { action: 'kick', participantId: 방장id });
  ok('방장은 자기를 강퇴해서 빠져나갈 수 없다',
     자기강퇴.status === 400 && 자기강퇴.json?.error === 'cannot_kick_host',
     `${자기강퇴.status} ${자기강퇴.json?.error}`);
  const 자기거절 = await a.post(P, { action: 'approve', participantId: 방장id, ok: false });
  ok('approve 로도 빠져나갈 수 없다', 자기거절.status === 409, `${자기거절.status} ${자기거절.json?.error}`);

  const 넘김 = await a.post(P, { action: 'handover', participantId: 영희id });
  ok('방장이 불러도 넘기기는 없는 동작이다',
     넘김.status === 400 && 넘김.json?.error === 'unknown_action', `${넘김.status} ${넘김.json?.error}`);
  const 참여자넘김 = await c.post(P, { action: 'handover', participantId: 영희id });
  ok('참여자가 불러도 없는 동작이다 (권한이 아니라 아예 없다)',
     참여자넘김.status === 400 && 참여자넘김.json?.error === 'unknown_action',
     `${참여자넘김.status} ${참여자넘김.json?.error}`);

  w = await 뷰(a, C);
  ok('못 나간 방장은 목록에 그대로 있다', w.participants.some((p) => p.id === 방장id && p.방장인가));
  ok('사람 수도 그대로다', w.participants.length === 3, `${w.participants.length}명`);

  /* 남들이 다 나가도 마찬가지다 — 넘길 곳이 없으니 나가는 길도 없다 */
  await b.post(P, { action: 'leave' });
  await c.post(P, { action: 'leave' });
  const 혼자 = await a.post(P, { action: 'leave' });
  ok('혼자 남아도 방장은 못 나간다',
     혼자.status === 409 && 혼자.json?.error === 'host_cannot_leave', `${혼자.status} ${혼자.json?.error}`);
  ok('그 모임은 그대로 살아 있다', (await a.get(P)).status === 200);
  ok('빠지고 싶으면 지운다', (await a.post(P, { action: 'remove' })).status === 200);
}

/* ══ 논의69 — 마지막 한 명이 나가면 모임도 사라진다 ═══════════ */
console.log('\n[논의69] 마지막 한 명이 나가면 모임이 사라진다');
{
  const a = person(), b = person();
  const C = await 모임만들기(a, '마지막 사람');
  const P = `/api/m/${C}`;
  await 참여(b, C, '철수', '1111');
  await b.post(P, { action: 'ping', kind: 'region', ...동[0] });

  ok('참여자가 먼저 나간다', (await b.post(P, { action: 'leave' })).status === 200);
  ok('아직 모임은 있다', (await a.get(P)).status === 200);

  /* 논의125 로 바뀐 자리 — 혼자 남은 방장도 '나가기'로는 못 없앤다. 지우는 것으로 갈음한다.
     그래서 논의69(마지막이 나가면 모임이 사라진다)는 **방장이 아닌 사람에게만** 도는 규칙이 됐다:
     방장이 늘 남아 있어 활동 중인 사람이 0이 될 수 없다. 버려진 모임은 논의104 가 맡는다. */
  const ear = await 귀(C);
  const 마지막 = await a.post(P, { action: 'leave' });
  ok('혼자 남은 방장도 못 나간다',
     마지막.status === 409 && 마지막.json?.error === 'host_cannot_leave',
     `${마지막.status} ${마지막.json?.error ?? ''}`);
  ok('그 모임은 아직 있다', (await a.get(P)).status === 200);
  const 지움 = await a.post(P, { action: 'remove' });
  const 알림 = await ear.센다();
  ear.끊는다();
  ok('방장이 지우면 사라진다', 지움.status === 200 && 지움.json?.removed === true, JSON.stringify(지움.json));
  ok('남들 화면이 닫히게 알림이 간다', 알림 >= 1, `${알림}번`);

  /* 방장이 아닌 마지막 사람 — 운영에 있던 '방장이 강퇴 상태인 모임'(논의66) 을 만들어 본다 */
  const c = person(), d = person();
  const C2 = await 모임만들기(c, '방장 없는 마지막 사람');
  const P2 = `/api/m/${C2}`;
  await 참여(d, C2, '철수', '1111');
  await sql`update participants set state = 'kicked' where code = ${C2} and name = '방장'`;
  const 마지막2 = await d.post(P2, { action: 'leave' });
  ok('방장이 아니어도 마지막이면 모임이 사라진다',
     마지막2.status === 200 && 마지막2.json?.removed === true,
     `${마지막2.status} ${JSON.stringify(마지막2.json)}`);
  ok('그 모임도 실제로 사라진다', (await d.get(P2)).status === 404);

  /* 사람이 남아 있으면 그냥 나가기다 — 모임을 지우면 안 된다 */
  const e = person(), f = person(), g = person();
  const C3 = await 모임만들기(e, '남는 사람이 있다');
  const P3 = `/api/m/${C3}`;
  await 참여(f, C3, '철수', '1111');
  await 참여(g, C3, '영희', '2222');
  await f.post(P3, { action: 'leave' });
  const 남은뷰 = await e.get(P3);
  ok('한 명이 나가도 모임은 남는다', 남은뷰.status === 200 && 남은뷰.json.participants.length === 2,
     `${남은뷰.json?.participants?.length}명`);
}

/* ── 뒷정리 — 내가 만든 모임만 ─────────────────────────────── */
let 치움 = 0;
for (const code of 만든모임) {
  const r = await sql`delete from meetings where code = ${code} returning code`;
  치움 += r.length;
}

console.log('\n──────────────────────────────');
console.log(`치운 모임 ${치움}건 (내가 만든 것만)`);
console.log(`통과 ${pass} · 실패 ${fail}${hold ? ` · 보류 ${hold}` : ''}`);
process.exit(fail ? 1 : 0);
