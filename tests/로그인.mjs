/* S갈래(로그인) 회귀 시험 — 논의52·121·123·124·125·126 (·51·130 이 뒤에 붙었다)

     node tests/로그인.mjs   (개발 서버가 떠 있어야 한다 · MOIMER_BASE 로 주소를 바꿀 수 있다)

   여기서 지키는 것
     S1 **소금이 안 깨졌다** ← 가장 중요하다. NEXTAUTH_SECRET 을 넣어도 옛 PIN 해시와
        옛 쿠키 서명이 그대로여야 한다. 깨지면 지금 모임에 들어와 있는 사람들이 다 튕긴다
     S2 로그인 없이는 모임을 못 만든다 (논의123) · guest 세션이면 만들어진다
     S3 users 가 모임마다 안 쌓인다 (논의88)
     S4 **옛 모임이 그대로 굴러간다** ← 이것도 중요하다. 로그인 전에 만든 모임은
        방장 줄에 열쇠 없는 users 가 붙어 있다 — 그것을 계정으로 치면 385건이 주인을 잃는다
     S5 쿠키를 잃은 방장이 다시 로그인하면 방장으로 돌아온다 (논의124 · 논의122 해소)
     S6 남의 참가자 쿠키를 주워도 방장이 못 된다 (논의124)
     S7 쿠키를 잃은 참여자가 PIN 으로 그 자리를 돌려받는다 (논의121) · 틀리면 pin_wrong
     S8 방장 넘기기가 사라졌다 · 방장은 못 나간다 (논의125)

   내가 만든 것만 건드리고 끝나면 전부 치운다. 남의 데이터는 읽지도 지우지도 않는다. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let 통과 = 0, 실패 = 0;
const ok = (n, c, d) => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

/* DATABASE_URL 은 .env.local 에서만 읽고 어디에도 찍지 않는다 */
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });

/* ⚠ 이 값은 앱의 기본 소금(lib/auth.ts)과 같아야 한다. **여기 값을 고쳐서 시험을 통과시키지 마라** —
   이 시험이 잡으려는 사고가 바로 '소금이 바뀌어 이미 저장된 해시가 안 맞게 되는 것'이다. */
const 옛소금 = 'moimer-dev-salt';
const 핀해시 = (code, pin) => createHash('sha256').update(`${옛소금}:${code}:${pin}`).digest('hex');
const 쿠키서명 = (code, id) =>
  createHash('sha256').update(`${옛소금}:cookie:${code}:${id}`).digest('hex').slice(0, 24);

function person(라벨) {
  const jar = new Map();
  return {
    라벨, jar,
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [kv] = c.split(';'); const i = kv.indexOf('=');
        jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* 500 은 본문이 비어 온다 */ }
      return { status: r.status, json, text };
    },
    post(path, body) { return this.call(path, { method: 'POST', body: JSON.stringify(body) }); },
    get(path) { return this.call(path); },
  };
}

let _og = 0;
const 출발지 = () => ([
  { origin: '성수역', lat: 37.5446, lng: 127.0560 },
  { origin: '왕십리역', lat: 37.5612, lng: 127.0378 },
  { origin: '홍대입구역', lat: 37.5572, lng: 126.9245 },
][_og++ % 3]);

const 만든모임 = [];                                  /* [사람, 코드] — 끝나고 내가 만든 것만 지운다 */
const SQL로만든것 = [];                               /* [코드, 사용자id] */
async function 모임만들기(누가, 이름) {
  const r = await 누가.post('/api/m', { name: 이름, hostName: '방장', scope: 'place', ...출발지() });
  if (r.json?.code) 만든모임.push([누가, r.json.code]);
  return r.json?.code;
}
const 참여 = (누가, code, name, pin) =>
  누가.post(`/api/m/${code}`, { action: 'join', name, pin, ...출발지() });
const 뷰 = async (누가, code) => (await 누가.get(`/api/m/${code}`)).json;

try {
  /* ══ S2 · 로그인이 있어야 모임을 만든다 (논의123) ═════════════ */
  console.log('\n[S2] 로그인 없이는 모임을 못 만든다');
  {
    const 손님 = person('로그인 안 함');
    const r = await 손님.post('/api/m', { name: 'S 로그인 없이', hostName: '방장', scope: 'place', ...출발지() });
    ok('로그인 없이 만들면 401 login_required',
       r.status === 401 && r.json?.error === 'login_required', `${r.status} ${r.json?.error}`);

    ok('guest 통로로 로그인된다', await 로그인(손님, 'S시험방장'));
    const 세션 = await 손님.get('/api/auth/session');
    ok('세션에 사용자 id 와 계정 열쇠가 실린다',
       !!세션.json?.user?.id && String(세션.json?.user?.key).startsWith('guest:'),
       JSON.stringify(세션.json?.user ?? null));
    const 만듦 = await 손님.post('/api/m', { name: 'S 로그인 뒤', hostName: '방장', scope: 'place', ...출발지() });
    ok('로그인하면 만들어진다', 만듦.status === 200 && !!만듦.json?.code, `${만듦.status} ${만듦.json?.error ?? ''}`);
    if (만듦.json?.code) 만든모임.push([손님, 만듦.json.code]);
  }

  /* ══ S3 · users 가 모임마다 안 쌓인다 (논의88) ════════════════ */
  console.log('\n[S3] users 는 모임마다 늘지 않는다 (논의88)');
  {
    const a = person('a');
    await 로그인(a, 'S쌓임시험');
    const 전 = (await sql`select count(*)::int as n from users`)[0].n;
    await 모임만들기(a, 'S 쌓임 1');
    await 모임만들기(a, 'S 쌓임 2');
    await 모임만들기(a, 'S 쌓임 3');
    const 후 = (await sql`select count(*)::int as n from users`)[0].n;
    ok('모임을 셋 만들어도 users 는 안 는다', 후 === 전, `${전} → ${후}`);

    /* 같은 이름으로 다시 로그인해도 줄이 안 는다 — 로그인마다 쌓이면 같은 구멍을 다시 내는 것이다 */
    const b = person('b');
    await 로그인(b, 'S쌓임시험');
    const 다시 = (await sql`select count(*)::int as n from users`)[0].n;
    ok('같은 이름으로 다시 로그인해도 안 는다', 다시 === 후, `${후} → ${다시}`);
    const 줄 = await sql`select count(*)::int as n from users where kakao_id = 'guest:S쌓임시험'`;
    ok('그 계정의 users 줄은 하나뿐이다', 줄[0].n === 1, String(줄[0].n));
  }

  /* ══ S1 · 소금이 안 깨졌다 (가장 중요) ═══════════════════════ */
  console.log('\n[S1] 소금 — 옛 PIN 해시와 옛 쿠키 서명이 그대로다 ★');
  {
    const a = person('a'), c = person('철수');
    await 로그인(a, 'S소금방장');
    const C = await 모임만들기(a, 'S 소금');
    ok('모임을 만들었다', !!C, String(C));
    await 참여(c, C, '철수', '1234');
    const 저장된 = await sql`
      select pin_hash from participants where code = ${C} and name = '철수'`;
    ok('서버가 넣는 PIN 해시가 옛 소금 그대로다',
       저장된[0]?.pin_hash === 핀해시(C, '1234'),
       저장된[0]?.pin_hash ? '해시가 다르다면 이미 저장된 PIN 이 전부 안 맞는다' : '줄이 없다');

    /* 쿠키 서명도 같은 소금이다 — 손으로 서명한 쿠키가 서버에 먹혀야 옛 쿠키도 그대로 먹힌다 */
    const pid = (await sql`select id from participants where code = ${C} and name = '철수'`)[0].id;
    const 손쿠키 = person('손으로 서명한 쿠키');
    손쿠키.jar.set(`moimer.p.${C}`, `${pid}.${쿠키서명(C, pid)}`);
    const v = await 뷰(손쿠키, C);
    ok('옛 소금으로 서명한 쿠키가 그대로 먹힌다', v?.me?.participantId === pid,
       `${v?.me?.participantId ?? '못 알아본다'}`);
  }

  /* ══ S7 · 쿠키를 잃은 참여자 (논의121) ═══════════════════════ */
  console.log('\n[S7] 쿠키를 잃은 참여자는 PIN 으로 그 자리를 돌려받는다 (논의121)');
  {
    const a = person('a'), c = person('철수'), 새기기 = person('철수 새 기기');
    await 로그인(a, 'S복귀방장');
    const C = await 모임만들기(a, 'S 복귀');
    await 참여(c, C, '철수', '1234');
    const 철수id = (await 뷰(a, C)).participants.find((p) => p.name === '철수').id;

    const 틀린 = await 참여(person('남'), C, '철수', '9999');
    ok('PIN 이 틀리면 pin_wrong 403 (name_taken 이 아니다)',
       틀린.status === 403 && 틀린.json?.error === 'pin_wrong', `${틀린.status} ${틀린.json?.error}`);

    /* 논의51 이 들어오면서 **틀린 바로 다음 시도는 맞는 PIN 이어도 429 pin_too_many** 다
       (정오답을 가려 늦추면 기계가 정답만 골라 빨리 시도할 수 있어서 일부러 그렇게 짰다).
       바로 위에서 일부러 틀렸으니 (이 모임, '철수') 짝에 1초가 걸려 있다 — 그것이 지나가길 기다린다.
       여기서 재려는 것은 지연이 아니라 '맞는 PIN 이면 그 자리를 돌려주는가' 이므로,
       지연 자체는 tests/신원.mjs 의 [신5-2] 가 따로 잰다. 세는 단위가 (모임, 이름) 짝이라
       이름을 달리하거나 모임을 나눠도 되지만, 이 갈래는 '한 모임의 철수 한 사람' 이야기라
       사람을 늘리지 않고 기다리는 쪽을 골랐다(뒤의 '사람이 늘지 않는다' 가 그 수를 센다). */
    await new Promise((r) => setTimeout(r, 1250));

    const 복귀 = await 새기기.post(`/api/m/${C}`,
      { action: 'join', name: '철수', pin: '1234', origin: '홍대입구역', lat: 37.5572, lng: 126.9245 });
    ok('PIN 이 맞으면 그 자리를 그대로 돌려준다 (승인 없이)',
       복귀.status === 200 && 복귀.json?.resumed === true && 복귀.json?.participantId === 철수id,
       `${복귀.status} ${JSON.stringify(복귀.json)}`);
    const v = await 뷰(새기기, C);
    ok('사람이 늘지 않는다', v.participants.length === 2, `${v.participants.length}명`);
    ok('돌아온 사람은 활동 중이다', v.participants.find((p) => p.id === 철수id)?.state === 'active');
    const 새출발지 = await sql`select origin_name from participants where id = ${철수id}`;
    ok('새로 낸 출발지로 갱신된다', 새출발지[0].origin_name === '홍대입구역', 새출발지[0].origin_name);
    /* 논의130 은 **로그인한** 사람이 자기 계정 자리에 또 들어오는 것을 409 대신 resumed 로 바꿨다.
       여기 '새기기' 는 로그인하지 않은 사람이라 그 예외에 안 든다 — 쿠키만 있는 사람에게는
       그대로 409 already_joined 다. (이 단정이 아까 깨진 것은 규칙이 바뀌어서가 아니라,
       앞의 복귀가 429 로 막혀 쿠키를 못 받은 채 여기 와서 그냥 새 복귀로 200 이 났기 때문이다.) */
    const 또 = await 새기기.post(`/api/m/${C}`, { action: 'join', name: '철수', pin: '1234', ...출발지() });
    ok('쿠키가 이미 있으면 already_joined 그대로 (로그인 안 한 사람)',
       또.status === 409 && 또.json?.error === 'already_joined', `${또.status} ${또.json?.error}`);
    /* 방장 줄은 PIN 이 없다 — 빈 PIN 끼리 맞아 방장 자리를 차지하는 길이 없어야 한다.
       재려는 것은 그때나 지금이나 '남이 방장 자리를 못 가져간다' 하나다. 막는 **이유**만 바뀌었다:
       논의130 으로 계정 판정이 PIN 검사보다 앞서 돌아, 계정에 이어진 줄(방장은 늘 그렇다)은
       PIN 을 아예 안 본다 → pin_wrong 403 이 아니라 name_taken 400 이다.
       PIN 을 안 보므로 지연도 안 걸린다(위 '철수' 의 자국과도 이름이 달라 무관하다). */
    const 방장가로채기 = await 참여(person('사칭'), C, '방장', '0000');
    ok('계정에 이어진 방장 자리는 어떤 PIN 으로도 못 가져간다 (논의130 · name_taken)',
       방장가로채기.status === 400 && 방장가로채기.json?.error === 'name_taken',
       `${방장가로채기.status} ${방장가로채기.json?.error}`);
  }

  /* ══ S5·S6 · 방장은 계정으로 판정한다 (논의124) ═══════════════ */
  console.log('\n[S5·S6] 방장은 계정으로 — 쿠키를 잃어도 돌아오고, 쿠키를 주워도 못 된다 (논의124)');
  {
    const a = person('방장'), 새폰 = person('방장 새 폰'), 도둑 = person('쿠키 주운 사람');
    await 로그인(a, 'S계정방장');
    const C = await 모임만들기(a, 'S 계정 방장');
    ok('만든 사람이 방장이다', (await 뷰(a, C)).me.isHost === true);

    /* 쿠키를 통째로 잃은 새 폰 — 로그인만 다시 한다 */
    await 로그인(새폰, 'S계정방장');
    const v = await 뷰(새폰, C);
    ok('쿠키가 없어도 계정이 같으면 방장이다 (논의122 벽돌 해소)', v.me.isHost === true);
    ok('참가자 신원도 되돌려 준다', !!v.me.participantId, String(v.me.participantId));
    const 고침 = await 새폰.post(`/api/m/${C}`, { action: 'update', name: 'S 계정 방장 2' });
    ok('새 폰에서 방장 일을 할 수 있다', 고침.status === 200, `${고침.status} ${고침.json?.error ?? ''}`);

    /* 쿠키를 주워 온 사람 — 계정이 없다 */
    도둑.jar.set(`moimer.p.${C}`, a.jar.get(`moimer.p.${C}`));
    const 훔친뷰 = await 뷰(도둑, C);
    ok('남의 방장 쿠키를 주워도 방장이 아니다', 훔친뷰.me.isHost === false, String(훔친뷰.me.isHost));
    const 훔친짓 = await 도둑.post(`/api/m/${C}`, { action: 'update', name: '가로챈 이름' });
    ok('주운 쿠키로는 방장 일을 못 한다', 훔친짓.status === 403, `${훔친짓.status} ${훔친짓.json?.error}`);
    const 남계정 = person('딴 계정');
    남계정.jar.set(`moimer.p.${C}`, a.jar.get(`moimer.p.${C}`));
    await 로그인(남계정, 'S딴사람');
    ok('딴 계정으로 로그인해도 방장이 아니다', (await 뷰(남계정, C)).me.isHost === false);
  }

  /* ══ S4 · 옛 모임이 그대로 굴러간다 (논의124 딸린 문제) ═══════ */
  console.log('\n[S4] 옛 모임 — 방장 줄에 계정이 없다. 쿠키로 굴러가야 한다 ★');
  {
    /* 로그인 붙기 전 모양을 그대로 만든다: 열쇠(kakao_id) 없는 users 줄 + 그 줄을 문 방장.
       운영 DB 의 옛 모임 385건이 전부 이 모양이다. */
    const uid = 'Stest' + Math.random().toString(36).slice(2, 8);
    const code = 'S' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const pid = 'Sp' + Math.random().toString(36).slice(2, 10);
    await sql`insert into users (id, nickname) values (${uid}, '옛방장')`;
    await sql`insert into meetings (code, name, scope) values (${code}, 'S 옛 모임', 'place')`;
    await sql`
      insert into participants (id, code, user_id, name, origin_name, lat, lng)
      values (${pid}, ${code}, ${uid}, '옛방장', '성수역', 37.5446, 127.0560)`;
    await sql`update meetings set host_id = ${pid} where code = ${code}`;
    SQL로만든것.push([code, uid]);

    const 옛방장 = person('옛 방장');
    옛방장.jar.set(`moimer.p.${code}`, `${pid}.${쿠키서명(code, pid)}`);
    const v = await 뷰(옛방장, code);
    ok('옛 모임의 방장은 쿠키로 그대로 방장이다', v?.me?.isHost === true, String(v?.me?.isHost));
    const 고침 = await 옛방장.post(`/api/m/${code}`, { action: 'update', name: 'S 옛 모임 2' });
    ok('옛 방장이 모임을 고칠 수 있다', 고침.status === 200, `${고침.status} ${고침.json?.error ?? ''}`);

    /* 로그인한 남이 옛 모임을 가로채면 안 된다 */
    const 남 = person('남');
    await 로그인(남, 'S옛모임남');
    ok('로그인만 했다고 남의 옛 모임 방장이 되지 않는다', (await 뷰(남, code))?.me?.isHost === false);

    /* 참여도 그대로 된다 */
    const 참여자 = person('옛 모임 참여자');
    const j = await 참여(참여자, code, '늦은사람', '4321');
    ok('옛 모임에 그대로 참여할 수 있다', j.status === 200, `${j.status} ${j.json?.error ?? ''}`);
  }

  /* ══ S8 · 방장 넘기기는 없다 · 방장은 못 나간다 (논의125) ═════ */
  console.log('\n[S8] 방장 넘기기가 사라졌다 · 방장은 못 나간다 (논의125)');
  {
    const a = person('방장'), b = person('철수');
    await 로그인(a, 'S넘기기방장');
    const C = await 모임만들기(a, 'S 넘기기');
    const P = `/api/m/${C}`;
    await 참여(b, C, '철수', '1111');
    const 철수id = (await 뷰(a, C)).participants.find((p) => p.name === '철수').id;

    const 넘김 = await a.post(P, { action: 'handover', participantId: 철수id });
    ok('handover 는 400 unknown_action',
       넘김.status === 400 && 넘김.json?.error === 'unknown_action', `${넘김.status} ${넘김.json?.error}`);

    const 방장나감 = await a.post(P, { action: 'leave' });
    ok('방장은 못 나간다 (409 host_cannot_leave)',
       방장나감.status === 409 && 방장나감.json?.error === 'host_cannot_leave',
       `${방장나감.status} ${방장나감.json?.error}`);
    ok('참여자는 그대로 나간다', (await b.post(P, { action: 'leave' })).status === 200);
    const 혼자 = await a.post(P, { action: 'leave' });
    ok('혼자 남은 방장도 못 나간다 — 지우는 것으로 갈음한다',
       혼자.status === 409 && 혼자.json?.error === 'host_cannot_leave', `${혼자.status} ${혼자.json?.error}`);
    ok('그 모임은 그대로 살아 있다', (await a.get(P)).status === 200);
    ok('방장은 지울 수 있다', (await a.post(P, { action: 'remove' })).status === 200);
  }
} finally {
  /* 내가 만든 것만 치운다 */
  for (const [누가, code] of 만든모임) {
    try { await 누가.post(`/api/m/${code}`, { action: 'remove' }); } catch { /* 치우기 실패는 시험 결과가 아니다 */ }
  }
  for (const [code, uid] of SQL로만든것) {
    try {
      await sql`delete from meetings where code = ${code}`;
      await sql`delete from users where id = ${uid}`;
    } catch { /* 같음 */ }
  }
  /* 시험이 만든 guest 계정도 치운다 — 모임이 사라진 뒤라 아무도 안 문다 */
  try {
    await sql`delete from users where kakao_id like 'guest:S%' and not exists (
      select 1 from participants p where p.user_id = users.id)`;
  } catch { /* 같음 */ }
}

console.log(`\n통과 ${통과} · 실패 ${실패}`);
if (실패) process.exit(1);
