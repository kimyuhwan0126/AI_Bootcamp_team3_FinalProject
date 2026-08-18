/* 참여 폼의 'find' — 이름+PIN 으로 옛 출발지를 미리 찾아오는 길 (논의139, 실사용 신고).
   재참여자가 이름+PIN 을 맞게 적어도 출발지를 매번 새로 찾아야만 참여 단추가 열려
   "왜 막혔지"로 보였다 — 이제 이름+PIN 이 맞으면 지난 출발지를 미리 채워 준다.

   여기서 재는 것 — **find 는 아무것도 안 바꾼다(읽기 전용)** 가 핵심이다:
     · 새 이름 → found:false (오류 아님, 그냥 "새 참여자")
     · 맞는 이름+PIN → found:true + 그때 낸 출발지·이동수단
     · 틀린 PIN → 403 pin_wrong, PIN 틀릴수록 느려지는 저장소를 join 과 **공유**한다
     · 계정에 이어진 이름은 PIN 으로 안 새어나간다(found:false)
     · 강퇴·승인대기 상태도 join 과 같은 말을 한다
     · find 를 몇 번을 불러도 참가자 줄(출발지·상태)이 안 바뀌고, 쿠키도 안 생긴다

   운영 DB 를 쓴다. **내가 만든 모임만** 치운다.
   node tests/찾아보기.mjs — 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다) */
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

function person() {
  const jar = new Map();
  return {
    jar,
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
const 찾기 = (누가, code, o) => 누가.post(`/api/m/${code}`, { action: 'find', ...o });

const 치울것 = [];
const 방장 = person();
async function 새모임(이름) {
  const r = await 방장.post('/api/m', { name: 이름, hostName: '방장', scope: 'region',
    origin: '성수역', lat: 37.5446, lng: 127.056, transport: 'transit' });
  if (!r.json?.code) throw new Error(`모임을 못 만들었다 (${r.status}) ${r.text.slice(0, 60)}`);
  치울것.push(r.json.code);
  return r.json.code;
}
const 자리 = async (code, 이름) =>
  (await 방장.get(`/api/m/${code}`)).json?.participants?.find((p) => p.name === 이름) ?? null;

try {

ok('방장 로그인', await 로그인(방장, '시험찾아보기'));

/* ── 새 이름 — 오류가 아니라 그냥 '없다' ─────────────────── */
console.log('\n[찾1] 처음 쓰는 이름');
{
  const C = await 새모임('N 찾아보기 · 새이름');
  const 손님 = person();
  const r = await 찾기(손님, C, { name: '완전새사람', pin: '1234' });
  ok('found:false 로 조용히 답한다(오류 아님)', r.status === 200 && r.json?.found === false,
     `${r.status} ${JSON.stringify(r.json)}`);
  /* 아무것도 안 바꿨다 — 쿠키도 안 생겼고, 진짜로 참여한 것도 아니다 */
  ok('쿠키가 안 생긴다(읽기 전용)', ![...손님.jar.keys()].some((k) => k.includes('moimer.p')),
     [...손님.jar.keys()].join(','));
  ok('참가자로 안 남는다', !(await 자리(C, '완전새사람')));
}

/* ── 정상 참여자 — 맞으면 옛 출발지를 그대로 준다 ──────────── */
console.log('\n[찾2] 멀쩡한 참여자');
{
  const C = await 새모임('N 찾아보기 · 정상');
  const 주인 = person();
  await 참여(주인, C, { name: '지훈', pin: '4321', origin: '건대입구역', lat: 37.5401, lng: 127.0699, transport: 'car' });

  const 재진입 = person();                                     /* 쿠키를 잃은 척 — 새 사람 */
  let r = await 찾기(재진입, C, { name: '지훈', pin: '4321' });
  ok('맞으면 found:true', r.status === 200 && r.json?.found === true, `${r.status} ${JSON.stringify(r.json)}`);
  ok('상태도 함께 준다(active)', r.json?.state === 'active', String(r.json?.state));
  ok('낸 출발지를 그대로 돌려준다', r.json?.origin?.name === '건대입구역'
     && Math.abs(r.json.origin.lat - 37.5401) < 1e-6 && Math.abs(r.json.origin.lng - 127.0699) < 1e-6,
     JSON.stringify(r.json?.origin));
  ok('이동수단도 돌려준다', r.json?.transport === 'car', String(r.json?.transport));
  ok('find 만으로는 쿠키가 안 생긴다', ![...재진입.jar.keys()].some((k) => k.includes('moimer.p')),
     [...재진입.jar.keys()].join(','));

  /* 여러 번 불러도 읽기 전용 — 참가자 줄이 그대로다(출발지가 안 바뀐다) */
  await 찾기(재진입, C, { name: '지훈', pin: '4321' });
  await 찾기(재진입, C, { name: '지훈', pin: '4321' });
  const 자리값 = await 자리(C, '지훈');
  ok('여러 번 불러도 참가자 줄이 그대로다', 자리값?.origin_name === '건대입구역',
     JSON.stringify(자리값 && { origin_name: 자리값.origin_name }));
}

/* ── 틀린 PIN — join 과 같은 말, 같은 지연 저장소 ──────────── */
console.log('\n[찾3] 틀린 PIN — join 과 같은 저장소를 공유한다');
{
  const C = await 새모임('N 찾아보기 · 틀림');
  const 주인 = person();
  await 참여(주인, C, { name: '보람', pin: '5555' });

  const 남 = person();
  const 첫 = await 찾기(남, C, { name: '보람', pin: '0001' });
  ok('틀리면 403 pin_wrong', 첫.status === 403 && 첫.json?.error === 'pin_wrong',
     `${첫.status} ${첫.json?.error ?? ''}`);
  /* 출발지가 안 새어나간다 — 실패했을 때는 원래 자리의 어떤 정보도 안 준다 */
  ok('실패한 응답에는 출발지가 없다', 첫.json?.origin === undefined, JSON.stringify(첫.json));

  /* find 로 틀린 것도 join 의 지연 저장소를 같이 쓴다 — join 으로 다시 시도해도 막힌다 */
  const 이어서join = await 참여(person(), C, { name: '보람', pin: '0002' });
  ok('find 로 틀리면 join 도 같이 막힌다(같은 저장소)', 이어서join.status === 429 && 이어서join.json?.error === 'pin_too_many',
     `${이어서join.status} ${이어서join.json?.error ?? ''}`);

  /* 거꾸로도 같다 — join 으로 틀리면 find 도 막힌다. 다른 이름으로 새로 재는 것이 아니라
     기다렸다가 반대 방향을 확인한다(먼저 잰 이름은 이미 지연 중이라 새 이름을 쓴다) */
  const C2 = await 새모임('N 찾아보기 · 틀림역방향');
  await 참여(person(), C2, { name: '민서', pin: '7777' });
  const join틀림 = await 참여(person(), C2, { name: '민서', pin: '0001' });
  ok('join 으로 먼저 틀리면', join틀림.status === 403 && join틀림.json?.error === 'pin_wrong',
     `${join틀림.status}`);
  const find도막힘 = await 찾기(person(), C2, { name: '민서', pin: '0002' });
  ok('find 도 같이 막힌다(거꾸로도 공유)', find도막힘.status === 429 && find도막힘.json?.error === 'pin_too_many',
     `${find도막힘.status} ${find도막힘.json?.error ?? ''}`);
}

/* ── 강퇴·승인대기 — join 과 같은 상태를 말해 준다 ─────────── */
console.log('\n[찾4] 강퇴된 사람');
{
  const C = await 새모임('N 찾아보기 · 강퇴');
  const 당할사람 = person();
  await 참여(당할사람, C, { name: '유진', pin: '2468' });
  const 유진자리 = await 자리(C, '유진');
  const 강퇴결과 = await 방장.post(`/api/m/${C}`, { action: 'kick', participantId: 유진자리.id });
  ok('방장이 내보냈다', 강퇴결과.status === 200, String(강퇴결과.status));

  const r = await 찾기(person(), C, { name: '유진', pin: '2468' });
  ok('강퇴됐어도 PIN 이 맞으면 found:true', r.status === 200 && r.json?.found === true, JSON.stringify(r.json));
  ok('상태를 kicked 로 알려 준다', r.json?.state === 'kicked', String(r.json?.state));
}

console.log('\n[찾5] 승인 대기 중인 사람');
{
  const C = await 새모임('N 찾아보기 · 대기');
  const 대기자 = person();
  await 참여(대기자, C, { name: '하은', pin: '1357' });
  const 하은자리 = await 자리(C, '하은');
  await 방장.post(`/api/m/${C}`, { action: 'kick', participantId: 하은자리.id });
  await 찾기(person(), C, { name: '하은', pin: '1357' });          /* kicked 확인 겸 몸풀기 */
  await 참여(person(), C, { name: '하은', pin: '1357' });           /* 다시 신청 → pending */

  const r = await 찾기(person(), C, { name: '하은', pin: '1357' });
  ok('대기 중이면 awaiting_approval', r.status === 409 && r.json?.error === 'awaiting_approval',
     `${r.status} ${r.json?.error ?? ''}`);
}

/* ── 계정에 이어진 이름 — PIN 으로 안 새어나간다 ───────────── */
console.log('\n[찾6] 로그인 계정에 이어진 이름');
{
  const C = await 새모임('N 찾아보기 · 계정');
  const 회원 = person();
  ok('회원 로그인', await 로그인(회원, '시험찾아보기회원'));
  await 참여(회원, C, { name: '민준' });                          /* PIN 없이 — 계정이 신원 */

  /* 그 이름을 모르는 손님이 아무 PIN 이나 넣어 본다 — 계정 자리는 PIN 검사 자체를 안 한다
     (없는 것처럼 found:false) */
  const r = await 찾기(person(), C, { name: '민준', pin: '0000' });
  ok('계정 자리는 PIN 으로 안 보인다(found:false)', r.status === 200 && r.json?.found === false,
     `${r.status} ${JSON.stringify(r.json)}`);
}

/* ── 입력값이 이상하면 join 과 같은 말을 한다 ──────────────── */
console.log('\n[찾7] 잘못된 입력');
{
  const C = await 새모임('N 찾아보기 · 입력');
  let r = await 찾기(person(), C, { name: '', pin: '1234' });
  ok('이름이 없으면 name_required', r.status === 400 && r.json?.error === 'name_required', `${r.status} ${r.json?.error}`);
  r = await 찾기(person(), C, { name: '아무개', pin: '12' });
  ok('PIN 모양이 틀리면 pin_required', r.status === 400 && r.json?.error === 'pin_required', `${r.status} ${r.json?.error}`);
  r = await 찾기(person(), C, { name: '아무개' });
  ok('PIN 을 아예 안 내도 pin_required', r.status === 400 && r.json?.error === 'pin_required', `${r.status} ${r.json?.error}`);
}

/* ── 아직 멤버가 아니어도 부를 수 있다 (참여 폼 자체가 부르는 자리다) ── */
console.log('\n[찾8] 멤버 아니어도 막히지 않는다');
{
  const C = await 새모임('N 찾아보기 · 비멤버');
  const 손님 = person();                                        /* 이 모임에 한 번도 안 들어와 봤다 */
  const r = await 찾기(손님, C, { name: '누구든', pin: '9999' });
  ok('not_member 로 안 막힌다', r.status !== 403 || r.json?.error !== 'not_member',
     `${r.status} ${r.json?.error ?? ''}`);
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
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
