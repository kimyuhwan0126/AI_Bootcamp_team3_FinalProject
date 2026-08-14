/* **신원의 열쇠가 셋** 인 것을 모든 경우의 수로 재는 시험 (논의130).

   쿠키 · 계정 · 이름+PIN. 셋이 서로 어떻게 만나는지가 이 앱에서 가장 헷갈리는 자리다 —
   경우가 많고, 하나만 어긋나도 '남의 자리를 차지한다' 는 최악의 결함이 된다.
   그래서 표를 만들어 하나씩 다 밟는다.

   | # | 들어오는 사람 | 그 이름의 자리 | 무엇이 맞나 |
   |---|---|---|---|
   | 1 | 로그인 X | 없음 | PIN 필수 · 새 자리 |
   | 2 | 로그인 X, PIN 없이 | 없음 | 400 pin_required |
   | 3 | 로그인 X, 쿠키 잃음 | 내 PIN 자리 | PIN 맞으면 그 자리 (resumed) |
   | 4 | 로그인 X | 남의 PIN 자리, PIN 틀림 | 403 pin_wrong |
   | 5 | **로그인 O** | 없음 | **PIN 없이** 새 자리 · 계정에 이어진다 |
   | 6 | **로그인 O, 쿠키 잃음** | 내 계정 자리 | **이름·PIN 안 보고** 그 자리 (resumed) |
   | 7 | **로그인 O, 이름을 바꿔 적음** | 내 계정 자리 | 그래도 내 자리 (계정이 곧 그 사람) |
   | 8 | **로그인 O** | 남의 **계정** 자리 | 400 name_taken — **PIN 으로도 못 뺏는다** |
   | 9 | **로그인 O, PIN 없이** | 내 옛 PIN 자리 | 400 pin_required (화면이 칸을 연다) |
   | 10 | **로그인 O, PIN 맞게** | 내 옛 PIN 자리 | 그 자리 + **계정에 흡수** (다음부턴 PIN 불필요) |
   | 11 | 로그인 O | 강퇴된 내 계정 자리 | 승인 대기 (pending) |
   | 12 | 로그인 X | 이미 들어와 있는 나(쿠키) | 409 already_joined |

   운영 DB 를 쓴다. **내가 만든 모임만** 치운다.
   node tests/신원.mjs — 개발 서버가 떠 있어야 한다 */
import { 로그인 } from './세션.mjs';
import { 카카오사람 } from './카카오세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let 통과 = 0, 실패 = 0, 건너뜀 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const 건너 = (n, 왜) => { 건너뜀++; console.log(`  – ${n} (건너뜀 — ${왜})`); };

/** 쿠키를 스스로 드는 사람 하나. `버리기()` 로 참가자 쿠키만 지운다(= 쿠키를 잃은 척). */
function person() {
  const jar = new Map();
  return {
    jar,
    버리기(code) { jar.delete(`moimer.p.${code}`); },
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, { ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const kv = c.split(';')[0]; const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* 본문이 없을 수도 */ }
      return { status: r.status, json, text };
    },
    post(p, b) { return this.call(p, { method: 'POST', body: JSON.stringify(b) }); },
    get(p) { return this.call(p); },
  };
}

const 출발지 = { origin: '왕십리역', lat: 37.5612, lng: 127.0378, transport: 'transit' };
const 참여 = (누가, code, o) => 누가.post(`/api/m/${code}`, { action: 'join', ...출발지, ...o });

const 치울것 = [];
const 방장 = person();
async function 새모임(이름) {
  const r = await 방장.post('/api/m', { name: 이름, hostName: '방장', scope: 'region',
    origin: '성수역', lat: 37.5446, lng: 127.056, transport: 'transit' });
  if (!r.json?.code) throw new Error(`모임을 못 만들었다 (${r.status}) ${r.text.slice(0, 60)}`);
  치울것.push(r.json.code);
  return r.json.code;
}
/** 그 모임에서 이 이름의 자리가 계정에 이어졌나 — 화면 응답으로는 안 보이므로 방장 눈으로 본다.
 *  (참가자 규약에 `user_id` 가 실린다 — `getView` 가 멤버에게는 그대로 준다) */
const 자리 = async (code, 이름) =>
  (await 방장.get(`/api/m/${code}`)).json?.participants?.find((p) => p.name === 이름) ?? null;

try {

ok('방장 로그인', await 로그인(방장, '시험신원'));

/* ── 로그인 안 한 사람 ─────────────────────────────────── */
console.log('\n[신1] 로그인 안 한 사람 — 이름+PIN 이 신원이다');
{
  const C = await 새모임('N 신원 · 비회원');

  const 손님 = person();
  let r = await 참여(손님, C, { name: '영희' });
  ok('② PIN 없이 오면 막는다', r.status === 400 && r.json?.error === 'pin_required',
     `${r.status} ${r.json?.error ?? ''}`);

  r = await 참여(손님, C, { name: '영희', pin: '1111' });
  ok('① PIN 을 내면 들어온다', r.status === 200 && !r.json?.resumed, `${r.status}`);
  ok('그 자리는 계정에 안 이어진다', (await 자리(C, '영희'))?.user_id == null,
     String((await 자리(C, '영희'))?.user_id));

  r = await 참여(손님, C, { name: '영희', pin: '1111' });
  ok('⑫ 이미 들어와 있으면 막는다', r.status === 409 && r.json?.error === 'already_joined',
     `${r.status} ${r.json?.error ?? ''}`);

  손님.버리기(C);
  r = await 참여(손님, C, { name: '영희', pin: '1111' });
  ok('③ 쿠키를 잃어도 이름+PIN 이면 그 자리로 돌아온다', r.status === 200 && r.json?.resumed === true,
     `${r.status} resumed=${r.json?.resumed}`);

  const 남 = person();
  r = await 참여(남, C, { name: '영희', pin: '9999' });
  ok('④ PIN 이 틀리면 남의 자리를 못 가져간다', r.status === 403 && r.json?.error === 'pin_wrong',
     `${r.status} ${r.json?.error ?? ''}`);
}

/* ── 로그인한 사람 ─────────────────────────────────────── */
console.log('\n[신2] 로그인한 사람 — 계정이 신원이다');
{
  const C = await 새모임('N 신원 · 회원');

  const 회원 = person();
  ok('참여자도 로그인할 수 있다', await 로그인(회원, '시험참여자'));

  let r = await 참여(회원, C, { name: '민준' });
  ok('⑤ PIN 없이 들어온다', r.status === 200, `${r.status} ${r.json?.error ?? ''}`);
  const 민준 = await 자리(C, '민준');
  ok('⑤ 그 자리가 계정에 이어진다', !!민준?.user_id, String(민준?.user_id));

  회원.버리기(C);
  r = await 참여(회원, C, { name: '민준' });
  ok('⑥ 쿠키를 잃어도 계정으로 그 자리로 돌아온다', r.status === 200 && r.json?.resumed === true,
     `${r.status} resumed=${r.json?.resumed}`);
  ok('⑥ 같은 자리다 (새 줄이 안 생긴다)', r.json?.participantId === 민준?.id);

  회원.버리기(C);
  r = await 참여(회원, C, { name: '전혀다른이름' });
  ok('⑦ 이름을 바꿔 적어도 계정이 그 사람을 안다', r.status === 200 && r.json?.participantId === 민준?.id,
     `${r.status} ${r.json?.participantId} vs ${민준?.id}`);
  const 사람수 = (await 방장.get(`/api/m/${C}`)).json?.participants?.length;
  ok('⑦ 사람이 안 늘어난다', 사람수 === 2, `${사람수}명`);
}

/* ── 계정 자리는 PIN 으로도 못 뺏는다 ──────────────────── */
console.log('\n[신3] 계정 자리 > PIN');
{
  const C = await 새모임('N 신원 · 뺏기');
  const 회원 = person();
  await 로그인(회원, '시험참여자');
  await 참여(회원, C, { name: '민준' });

  const 남 = person();
  ok('남도 로그인한다', await 로그인(남, '시험남남'));
  const r = await 참여(남, C, { name: '민준', pin: '1234' });
  ok('⑧ 남의 계정 자리는 PIN 으로도 못 가져간다',
     r.status === 400 && r.json?.error === 'name_taken', `${r.status} ${r.json?.error ?? ''}`);

  const 비회원 = person();
  const r2 = await 참여(비회원, C, { name: '민준', pin: '1234' });
  ok('⑧ 로그인 안 한 사람도 못 가져간다',
     r2.status === 400 && r2.json?.error === 'name_taken', `${r2.status} ${r2.json?.error ?? ''}`);
}

/* ── 옛 PIN 자리를 계정이 흡수한다 ─────────────────────── */
console.log('\n[신4] 로그인하기 전에 만든 자리를 되찾는다');
{
  const C = await 새모임('N 신원 · 흡수');

  /* 먼저 로그인 없이 이름+PIN 으로 들어간다 */
  const 옛사람 = person();
  let r = await 참여(옛사람, C, { name: '지연', pin: '4321' });
  ok('로그인 전에 PIN 으로 들어갔다', r.status === 200);
  const 옛자리 = await 자리(C, '지연');
  ok('그 자리는 아직 계정이 없다', 옛자리?.user_id == null);

  /* 이제 다른 기기에서 로그인만 하고 들어온다 */
  const 새기기 = person();
  await 로그인(새기기, '시험지연');
  r = await 참여(새기기, C, { name: '지연' });
  ok('⑨ PIN 을 안 내면 "PIN 을 달라" 고 한다', r.status === 400 && r.json?.error === 'pin_required',
     `${r.status} ${r.json?.error ?? ''}`);

  r = await 참여(새기기, C, { name: '지연', pin: '0000' });
  ok('PIN 이 틀리면 못 가져간다', r.status === 403 && r.json?.error === 'pin_wrong',
     `${r.status} ${r.json?.error ?? ''}`);

  /* 틀린 뒤 바로 다시 하면 **맞는 PIN 이어도** 지연에 걸린다(논의51 — 진짜 주인도 기다린다).
     그것이 이 설계의 뜻이다: 정오답을 가려서 늦추면 기계가 정답만 골라 빨리 시도할 수 있다. */
  const 막힘 = await 참여(person(), C, { name: '지연', pin: '4321' });
  ok('맞는 PIN 이어도 틀린 뒤 바로면 지연에 걸린다', 막힘.status === 429, `${막힘.status}`);
  await new Promise((r2) => setTimeout(r2, (막힘.json?.retryAfterMs ?? 1000) + 250));

  r = await 참여(새기기, C, { name: '지연', pin: '4321' });
  ok('⑩ PIN 이 맞으면 그 자리를 돌려준다', r.status === 200 && r.json?.participantId === 옛자리?.id,
     `${r.status} ${r.json?.participantId}`);
  const 흡수 = await 자리(C, '지연');
  ok('⑩ 그러면서 계정에 흡수된다', !!흡수?.user_id, String(흡수?.user_id));

  /* 그다음부터는 PIN 이 필요 없다 — 이것이 흡수의 뜻이다 */
  새기기.버리기(C);
  r = await 참여(새기기, C, { name: '아무이름' });
  ok('⑩ 그다음부터는 PIN 없이 돌아온다', r.status === 200 && r.json?.participantId === 옛자리?.id,
     `${r.status} ${r.json?.participantId}`);
}

/* ── 강퇴 ──────────────────────────────────────────────── */
console.log('\n[신5] 강퇴된 계정');
{
  const C = await 새모임('N 신원 · 강퇴');
  const 회원 = person();
  await 로그인(회원, '시험강퇴자');
  await 참여(회원, C, { name: '철수' });
  const 철수 = await 자리(C, '철수');
  const k = await 방장.post(`/api/m/${C}`, { action: 'kick', participantId: 철수.id });
  ok('방장이 내보냈다', k.status === 200, `${k.status} ${k.json?.error ?? ''}`);

  회원.버리기(C);
  const r = await 참여(회원, C, { name: '아주다른이름' });
  ok('⑪ 이름을 바꿔 와도 계정이 알아본다 — 승인 대기가 된다',
     r.status === 200 && r.json?.pending === true, `${r.status} pending=${r.json?.pending}`);
  const 다시 = await 참여(회원, C, { name: '철수' });
  ok('⑪ 대기 중에 또 신청하면 막는다', 다시.status === 409 && 다시.json?.error === 'awaiting_approval',
     `${다시.status} ${다시.json?.error ?? ''}`);
}

console.log('\n[신5-1] 강퇴된 계정 — 쿠키가 남아 있어도 같은가');
{
  /* 쿠키를 안 버리고 이름만 바꿔 와도 계정이 같으면 승인 대기여야 한다 —
     쿠키가 남아 있나 없나로 결과가 갈리면 같은 사람이 어떻게 왔는지에 따라
     서버가 다른 답을 주는 셈이다. 별도 모임에서 확인한다(앞 시험의 pending 상태와 안 겹치게). */
  const C = await 새모임('N 신원 · 강퇴2');
  const 회원 = person();
  await 로그인(회원, '시험강퇴자2');
  await 참여(회원, C, { name: '민지' });
  const 민지 = await 자리(C, '민지');
  await 방장.post(`/api/m/${C}`, { action: 'kick', participantId: 민지.id });

  const r = await 참여(회원, C, { name: '쿠키남긴채이름바꿈' });      /* 버리기() 를 안 부른다 */
  ok('쿠키가 남아 있어도 계정이 같으면 튕기지 않는다', r.status !== 403,
     `${r.status} ${r.json?.error ?? ''}`);
  ok('그 경우도 승인 대기가 된다', r.status === 200 && r.json?.pending === true,
     `${r.status} pending=${r.json?.pending}`);
}

/* ── PIN 은 틀릴수록 느려진다 (논의51) ────────────────── */
console.log('\n[신5-2] PIN 을 틀릴수록 느려진다');
{
  const C = await 새모임('N 신원 · 지연');
  const 주인 = person();
  await 참여(주인, C, { name: '보람', pin: '5555' });

  /* 남이 1만 조합을 쓸어보려 한다 — 두 번째부터는 429 로 막히고 기다리라고 한다 */
  const 남 = person();
  const 첫 = await 참여(남, C, { name: '보람', pin: '0001' });
  ok('첫 번째 틀림은 그냥 403', 첫.status === 403 && 첫.json?.error === 'pin_wrong',
     `${첫.status} ${첫.json?.error ?? ''}`);

  const 둘째 = await 참여(person(), C, { name: '보람', pin: '0002' });
  ok('바로 다시 하면 429 로 막는다', 둘째.status === 429 && 둘째.json?.error === 'pin_too_many',
     `${둘째.status} ${둘째.json?.error ?? ''}`);
  ok('얼마나 기다려야 하는지 말해 준다', typeof 둘째.json?.retryAfterMs === 'number' && 둘째.json.retryAfterMs > 0,
     String(둘째.json?.retryAfterMs));

  /* 기기를 바꿔도 안 통한다 — (모임, 이름) 짝으로 세기 때문이다 */
  const 딴기기 = person();
  const 셋째 = await 참여(딴기기, C, { name: '보람', pin: '0003' });
  ok('쿠키를 새로 받아도 안 통한다', 셋째.status === 429, `${셋째.status}`);

  /* 다른 이름은 안 막힌다 — 남까지 함께 느려지면 안 된다 */
  const 다른이름 = await 참여(person(), C, { name: '전혀다른사람', pin: '7777' });
  ok('다른 이름은 안 막힌다', 다른이름.status === 200, `${다른이름.status} ${다른이름.json?.error ?? ''}`);

  /* 기다린 뒤에는 다시 해 볼 수 있고, **맞히면 뒤끝이 없다** */
  await new Promise((r) => setTimeout(r, (둘째.json?.retryAfterMs ?? 400) + 250));
  const 주인다시 = person();
  const 맞힘 = await 참여(주인다시, C, { name: '보람', pin: '5555' });
  ok('기다린 뒤 주인이 맞히면 들어온다', 맞힘.status === 200 && 맞힘.json?.resumed === true,
     `${맞힘.status} resumed=${맞힘.json?.resumed}`);
  /* 맞힌 뒤에는 자국이 지워진다 — 주인이 세 번 틀리고 네 번째에 맞혀도 다음에 안 느려진다.
     (이미 들어와 있으니 409 여야 한다 — 429 가 아니라는 것이 뜻이다) */
  const 뒤끝 = await 참여(주인다시, C, { name: '보람', pin: '5555' });
  ok('맞힌 뒤에는 자국이 없다 (429 가 아니다)', 뒤끝.status !== 429, `${뒤끝.status} ${뒤끝.json?.error ?? ''}`);
}

/* ── 한국 밖은 모임도 못 만든다 (논의55) ──────────────── */
console.log('\n[신5-3] 한국 밖 좌표는 만들기에서도 막는다');
{
  /* 참여·핑·AI 는 다 막는데 **만들기 문 하나만** 열려 있었다 — 도쿄 좌표로 모임이 만들어졌다 */
  const r = await 방장.post('/api/m', { name: 'N 신원 · 도쿄', hostName: '방장', scope: 'region',
    origin: '도쿄역', lat: 35.6812, lng: 139.7671, transport: 'transit' });
  if (r.json?.code) 치울것.push(r.json.code);      /* 혹시 만들어졌으면 치워야 한다 */
  ok('도쿄 좌표로는 모임을 못 만든다', r.status === 400 && r.json?.error === 'bad_coords',
     `${r.status} ${r.json?.error ?? ''}`);
  const 제주 = await 방장.post('/api/m', { name: 'N 신원 · 제주', hostName: '방장', scope: 'region',
    origin: '제주공항', lat: 33.5104, lng: 126.4914, transport: 'transit' });
  if (제주.json?.code) 치울것.push(제주.json.code);
  ok('제주는 된다 (한국 안이다)', 제주.status === 200, `${제주.status} ${제주.json?.error ?? ''}`);
}

/* ── 진짜 카카오 계정 ──────────────────────────────────── */
console.log('\n[신6] 진짜 카카오 계정으로도 같은가');
{
  const 카 = await 카카오사람();
  if (!카) 건너('카카오 계정으로 참여', '카카오로 들어온 계정이 아직 없다');
  else {
    const C = await 새모임('N 신원 · 카카오');
    let r = await 카.post(`/api/m/${C}`, { action: 'join', name: '카카오참여', ...출발지 });
    ok('카카오 계정도 PIN 없이 들어온다', r.status === 200, `${r.status} ${r.json?.error ?? ''}`);
    const 자 = await 자리(C, '카카오참여');
    ok('그 자리가 계정에 이어진다', !!자?.user_id);
    /* 쿠키 없는 새 기기 — `카카오사람()` 을 새로 부르면 세션만 있고 참가자 쿠키는 없다 */
    const 새기기 = await 카카오사람();
    r = await 새기기.post(`/api/m/${C}`, { action: 'join', name: '아무거나', ...출발지 });
    ok('새 기기에서 로그인만 해도 그 자리로 돌아온다',
       r.status === 200 && r.json?.participantId === 자?.id, `${r.status} ${r.json?.participantId}`);
  }
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울것) {
    const r = await 방장.post(`/api/m/${c}`, { action: 'remove' }).catch(() => ({ status: 0 }));
    if (r.status === 200) 지움++;
  }
  ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.length, `${지움}/${치울것.length}건`);
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}${건너뜀 ? ` · 건너뜀 ${건너뜀}` : ''}`);
process.exit(실패 ? 1 : 0);
