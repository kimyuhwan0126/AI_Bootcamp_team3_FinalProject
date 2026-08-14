/* 끝까지 한 번 — 그릴링 결정이 진짜 서버에서 도는지.
   사람마다 쿠키 항아리를 따로 들고 다닌다(참가자 신원이 쿠키에 있으므로). */
/* 'localhost' 는 ::1 로 먼저 붙는데 undici 가 여기서 종종 10초를 흘려보낸다
   (UND_ERR_CONNECT_TIMEOUT — 서버는 멀쩡한데 테스트만 죽었다). 주소를 못 박는다. */
/* 모임 만들기는 로그인 필수가 됐다 (논의123) — 시험은 개발용 guest 통로로 세션을 만든다.
   로그인하는 방법은 tests/세션.mjs 한 곳에만 둔다. */
import { 로그인 } from './tests/세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

/** 쿠키를 들고 다니는 사람 하나 */
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

/* 논의51 — PIN 은 틀릴수록 느려진다 (`lib/pin지연.ts`).
   세는 단위가 **(모임, 이름) 짝**이고, 늦출지 말지를 **정오답을 가리기 전에** 정한다 —
   일부러 그렇게 짰다. 정답만 골라 빨리 통과시키면 기계가 "정답만 다시 시도" 해서
   늦추는 뜻이 없어지기 때문이다. 그래서 **틀린 PIN 을 한 번 낸 직후 같은 이름으로
   맞는 PIN 을 내면 429 `pin_too_many`** 가 돌아온다 — 서비스가 제대로 도는 증거이지
   시험이 재려던 것(본인이 PIN 으로 돌아오는가)의 실패가 아니다.

   그래서 참여 요청은 이 함수로 낸다: 429 를 받으면 서버가 응답에 실어 준 만큼
   (`retryAfterMs`) 기다렸다가 **그대로 한 번 더** 낸다. 사람이 안내문("잠시 뒤에
   다시 해 주세요")을 보고 기다렸다 누르는 것과 같다 — 지연을 끄거나 건너뛰는 것이
   아니라서 재려는 뜻은 그대로 남는다. 지연에 안 걸리면 아무 일도 안 한다(느려지지 않는다). */
const 자자 = (ms) => new Promise((r) => setTimeout(r, ms));
async function 참여(사람, path, body) {
  const r = await 사람.post(path, body);
  if (r.status !== 429 || r.json?.error !== 'pin_too_many') return r;
  await 자자((r.json?.retryAfterMs ?? 1000) + 100);   /* 100ms 는 시계 어긋남 여유 */
  return 사람.post(path, body);
}

/* 참여할 때 출발지는 필수다 (그릴링 논의35 ①) — 테스트도 사람처럼 낸다 */
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

const 방장 = person('방장');
const 철수 = person('철수');
const 영희 = person('영희');
const 남 = person('링크만 받은 사람');

console.log('\n[1] 모임 만들기');
await 로그인(방장, 'F김방장');
const made = await 방장.post('/api/m', { name: '팀 회식', hostName: '김방장', scope: 'place', purpose: '음식', ...출발지() });
ok('모임이 만들어진다', made.status === 200 && made.json?.code, made.json?.code);
const CODE = made.json.code;

let v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('만든 사람이 방장이자 첫 참가자', v.me.isHost && v.participants.length === 1, v.participants[0]?.name);

console.log('\n[2] 신원 — 멤버 아님 / PIN 필수');
const 훔쳐보기 = await 남.get(`/api/m/${CODE}`);
ok('링크만 받은 사람은 방장이 아니다', 훔쳐보기.json?.me?.isHost === false && 훔쳐보기.json?.me?.participantId === null);
const 핑시도 = await 남.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', refId: 'x', name: '연남동', lat: 37.56, lng: 126.92 });
ok('멤버가 아니면 핑을 못 찍는다', 핑시도.status === 403, 핑시도.json?.error);
const 핀없이 = await 철수.post(`/api/m/${CODE}`, { action: 'join', name: '김철수' });
ok('PIN 없이 참여가 막힌다', 핀없이.status === 400 && 핀없이.json?.error === 'pin_required');

console.log('\n[3] 참여');
ok('철수 참여', (await 철수.post(`/api/m/${CODE}`, { action: 'join', name: '김철수', pin: '1234', ...출발지() })).status === 200);
ok('영희 참여', (await 영희.post(`/api/m/${CODE}`, { action: 'join', name: '박영희', pin: '5678', ...출발지() })).status === 200);
/* 논의121 로 답이 바뀌었다: 그 이름은 '이미 찬 자리'가 아니라 '남의 자리'다 —
   PIN 이 맞으면 그 사람이 돌아온 것이고, 틀리면 남이 이름을 훔쳐 쓰는 것이다.
   전에는 둘을 못 갈라 name_taken 하나로 막았고, 그래서 쿠키를 잃은 본인까지 막혔다. */
const dup = await 남.post(`/api/m/${CODE}`, { action: 'join', name: '김철수', pin: '9999', ...출발지() });
ok('남의 이름으로 들어오려면 PIN 이 맞아야 한다', dup.status === 403 && dup.json?.error === 'pin_wrong', dup.json?.error);

console.log('\n[4] 핑 = 투표 (지역) — 한 사람이 여러 곳, 같은 곳은 하나');
const 동 = [
  { refId: '1144055000', name: '연남동', lat: 37.5626, lng: 126.9256 },
  { refId: '1120068000', name: '성수동', lat: 37.5447, lng: 127.0557 },
  { refId: '1114055000', name: '망원동', lat: 37.5559, lng: 126.9020 },
];
await 방장.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[0] });
await 방장.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[1] });
await 철수.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[1] });
await 영희.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[1] });
await 영희.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[2] });

v = (await 방장.get(`/api/m/${CODE}`)).json;
const 성수 = v.candidates.find((c) => c.name === '성수동');
ok('한 사람이 여러 동에 찍는다', v.me.myVotes.length === 2, `방장 ${v.me.myVotes.length}곳`);
ok('가장 많이 찍힌 동이 1위', v.candidates[0].name === '성수동' && 성수.votes === 3, `성수동 ${성수.votes}표`);

await 방장.post(`/api/m/${CODE}`, { action: 'ping', kind: 'region', ...동[1] });
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('같은 동을 다시 찍어도 표가 안 는다', v.candidates.find((c) => c.name === '성수동').votes === 3);

await 방장.post(`/api/m/${CODE}`, { action: 'unping', candidateId: 성수.id });
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('다시 누르면 취소된다', v.candidates.find((c) => c.name === '성수동').votes === 2);

console.log('\n[5] 권한 — 단계를 넘기는 것은 방장만');
const 남의확정 = await 철수.post(`/api/m/${CODE}`, { action: 'confirm', candidateId: 성수.id });
ok('참여자는 확정을 못 한다', 남의확정.status === 403, 남의확정.json?.error);

console.log('\n[6] 지역 확정 → 지점 후보 (⑥⑦ 합쳐 한 화면)');
ok('방장이 확정한다', (await 방장.post(`/api/m/${CODE}`, { action: 'confirm', candidateId: 성수.id })).status === 200);
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok("'지점까지' 모임은 지점 후보 단계로", v.meeting.stage === 'place', v.meeting.stage);
ok('확정한 지역이 기록된다', v.meeting.winner_region_id === 성수.id);

console.log('\n[7] 지점 — 한 단계 (그릴링 논의34: 고르는 것이 곧 표)');
await 방장.post(`/api/m/${CODE}`, { action: 'ping', kind: 'place', refId: 'k1', name: '황소곱창', lat: 37.5447, lng: 127.0557 });
await 철수.post(`/api/m/${CODE}`, { action: 'ping', kind: 'place', refId: 'k2', name: '온기족발', lat: 37.5450, lng: 127.0560 });
/* 논의98 — 옛 vote 액션은 없앴다. 안 쓰는 길일수록 검사가 안 닿아 결함이 숨는다. */
const 없앤것 = await 철수.post(`/api/m/${CODE}`, { action: 'vote', candidateId: 'x' });
ok('없앤 액션은 거절한다', 없앤것.status === 400 && 없앤것.json?.error === 'unknown_action', 없앤것.json?.error);

const 사라진단계 = await 방장.post(`/api/m/${CODE}`, { action: 'startPlaceVote' });
ok('선정 시작 단계는 사라졌다', 사라진단계.status === 400, 사라진단계.json?.error);
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('지점 단계는 하나뿐이다', v.meeting.stage === 'place', v.meeting.stage);
const 곱창 = v.candidates.find((c) => c.name === '황소곱창');
const 족발 = v.candidates.find((c) => c.name === '온기족발');

/* 지점도 지역과 같다 — 여러 곳을 선정할 수 있고, 다시 누르면 취소된다 (그릴링 논의26 ①) */
const 다시선정 = (c) => 철수.post(`/api/m/${CODE}`, { action: 'ping', kind: 'place',
  refId: c.ref_id ?? c.id, name: c.name, lat: c.lat, lng: c.lng });
await 다시선정(곱창);
await 다시선정(족발);
v = (await 철수.get(`/api/m/${CODE}`)).json;
ok('지점도 여러 곳을 선정한다', v.me.myVotes.length === 2, `${v.me.myVotes.length}곳`);

const 곱창id = v.candidates.find((c) => c.name === '황소곱창').id;
await 철수.post(`/api/m/${CODE}`, { action: 'unping', candidateId: 곱창id });
v = (await 철수.get(`/api/m/${CODE}`)).json;
ok('다시 누르면 취소된다', v.me.myVotes.length === 1, `${v.me.myVotes.length}곳`);
await 다시선정(곱창);

console.log('\n[8] 결과 · 마무리');
/* 그릴링 논의46 — 서버가 1위만 받는다. 이 시점 표는 곱창 2 · 족발 1 이라 족발은 확정할 수 없다. */
ok('지점 확정', (await 방장.post(`/api/m/${CODE}`, { action: 'confirm', candidateId: 곱창.id })).status === 200);
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('결과 단계가 된다', v.meeting.stage === 'result', v.meeting.stage);

ok('되돌리기', (await 방장.post(`/api/m/${CODE}`, { action: 'reopen' })).status === 200);
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('한 칸 내려간다 (result → place)', v.meeting.stage === 'place', v.meeting.stage);
await 방장.post(`/api/m/${CODE}`, { action: 'confirm', candidateId: 곱창.id });

console.log('\n[9] 강퇴 → 승인제');
v = (await 방장.get(`/api/m/${CODE}`)).json;
const 철수id = v.participants.find((p) => p.name === '김철수').id;
ok('방장이 강퇴한다', (await 방장.post(`/api/m/${CODE}`, { action: 'kick', participantId: 철수id })).status === 200);
/* [3] 에서 '김철수' 이름에 틀린 PIN(9999)을 한 번 넣어 뒀다 — 그 자국이 (모임, 김철수) 짝에
   남아 있다. 여기까지 오는 데 보통 1초는 지나 지금은 안 걸리지만, 서버가 빨라지거나
   위 검사가 줄면 그날 갑자기 429 로 깨진다. 지연에 걸리면 기다렸다 다시 내도록 해 둔다. */
const 재참여 = await 참여(철수, `/api/m/${CODE}`, { action: 'join', name: '김철수', pin: '1234', ...출발지() });
ok('강퇴된 사람은 승인 대기가 된다', 재참여.json?.pending === true);
const 대기중핑 = await 철수.post(`/api/m/${CODE}`, { action: 'ping', kind: 'place', refId: 'z', name: 'x', lat: 37.5, lng: 127 });
ok('대기 중에는 아무것도 못 한다', 대기중핑.status === 403);
ok('방장이 승인한다', (await 방장.post(`/api/m/${CODE}`, { action: 'approve', participantId: 철수id, ok: true })).status === 200);
const 승인후 = await 철수.get(`/api/m/${CODE}`);
ok('승인 후 다시 멤버', 승인후.json.participants.find((p) => p.id === 철수id).state === 'active');

console.log('\n[10] 마무리 = 기록으로 남김 (삭제 아님)');
ok('방장이 마무리한다', (await 방장.post(`/api/m/${CODE}`, { action: 'close' })).status === 200);
v = (await 방장.get(`/api/m/${CODE}`)).json;
ok('closed_at 이 찍히고 데이터는 남는다', !!v.meeting.closed_at && v.participants.length >= 3);
ok('단계는 그대로 (자동 전환 없음)', v.meeting.stage === 'result', v.meeting.stage);
const 마감후 = await 방장.post(`/api/m/${CODE}`, { action: 'ping', kind: 'place', refId: 'q', name: 'x', lat: 37.5, lng: 127 });
ok('마무리한 모임은 읽기 전용', 마감후.status === 409, 마감후.json?.error);

console.log('');
console.log('[11] 권한 3단 · 새 동작');
{
  const a = person('a'), b = person('b');
  await 로그인(a, 'F방장a');
  const mk = await a.post('/api/m', { name: '권한 확인', hostName: '방장', ...출발지() });
  const C2 = mk.json.code;
  await b.post(`/api/m/${C2}`, { action: 'join', name: '참여자', pin: '1111', ...출발지() });

  for (const [nm, act] of [['update', { action: 'update', name: 'x' }],
                           ['remove', { action: 'remove' }],
                           ['ai', { action: 'ai' }]]) {
    const r = await b.post(`/api/m/${C2}`, act);
    ok(`참여자는 ${nm} 를 못 한다`, r.status === 403, r.json?.error);
  }

  ok('방장은 이름·시간을 고친다',
    (await a.post(`/api/m/${C2}`, { action: 'update', name: '고친 이름', meetAt: '2026-08-20T18:30' })).status === 200);
  const nv = (await a.get(`/api/m/${C2}`)).json;
  ok('고친 값이 남는다', nv.meeting.name === '고친 이름' && !!nv.meeting.meet_at, nv.meeting.name);

  const dong = { refId: 'r-own', name: '테스트동', lat: 37.5, lng: 127.0 };
  await a.post(`/api/m/${C2}`, { action: 'ping', kind: 'region', ...dong });
  await b.post(`/api/m/${C2}`, { action: 'ping', kind: 'region', ...dong });
  let w = (await a.get(`/api/m/${C2}`)).json;
  const cid = w.candidates[0].id;
  await b.post(`/api/m/${C2}`, { action: 'unping', candidateId: cid });
  w = (await a.get(`/api/m/${C2}`)).json;
  ok('남이 취소해도 후보는 남는다', w.candidates.length === 1 && w.candidates[0].votes === 1,
     `${w.candidates.length}곳 ${w.candidates[0] ? w.candidates[0].votes : '-'}표`);
  await a.post(`/api/m/${C2}`, { action: 'unping', candidateId: cid });
  w = (await a.get(`/api/m/${C2}`)).json;
  ok('올린 사람이 취소하면 후보가 사라진다', w.candidates.length === 0, `${w.candidates.length}곳`);

  const ai = await a.post(`/api/m/${C2}`, { action: 'ai' });
  ok('AI 추천 — 되거나 정직하게 실패', ai.status === 503 || ai.status === 200,
     ai.status === 200 ? `후보 ${ai.json.added}개` : ai.json?.error);

  ok('방장이 모임을 지운다', (await a.post(`/api/m/${C2}`, { action: 'remove' })).status === 200);
  ok('지운 모임은 사라진다', (await a.get(`/api/m/${C2}`)).status === 404);
}

console.log('');
console.log('[12] 되돌리기 — 모은 지점 후보를 넣어 둔다');
{
  const a = person('a');
  await 로그인(a, 'F방장1');
  const mk = await a.post('/api/m', { name: '되돌리기', hostName: '방장', scope: 'place', ...출발지() });
  const C3 = mk.json.code;
  const P = `/api/m/${C3}`;

  const 성수 = { kind: 'region', refId: 'r-A', name: '성수동', lat: 37.544, lng: 127.056 };
  const 연남 = { kind: 'region', refId: 'r-B', name: '연남동', lat: 37.562, lng: 126.925 };
  await a.post(P, { action: 'ping', ...성수 });
  await a.post(P, { action: 'ping', ...연남 });
  let w = (await a.get(P)).json;
  const 성수id = w.candidates.find(c => c.name === '성수동').id;
  const 연남id = w.candidates.find(c => c.name === '연남동').id;

  await a.post(P, { action: 'confirm', candidateId: 성수id });
  for (const g of [['p1', '가게1'], ['p2', '가게2']])
    await a.post(P, { action: 'ping', kind: 'place', refId: g[0], name: g[1], lat: 37.54, lng: 127.05 });
  w = (await a.get(P)).json;
  const 모은것 = w.candidates.filter(c => c.kind === 'place');
  ok('지점 후보 2곳을 모았다', 모은것.length === 2, `${모은것.length}곳`);
  /* 논의87 — 지역이 바뀌면 모은 지점 후보를 전부 버린다.
     되돌아오는 길을 없앤 대신 규칙이 하나로 단순해졌다(넣어 두기 장치 폐지). */

  await a.post(P, { action: 'reopen' });
  w = (await a.get(P)).json;
  ok('되돌리면 지역 단계로', w.meeting.stage === 'region', w.meeting.stage);
  ok('지점 후보는 화면에서 사라진다', !w.candidates.some(c => c.kind === 'place'),
     w.candidates.map(c => c.kind).join(','));
  ok('지역 후보는 그대로 2곳', w.candidates.filter(c => c.kind === 'region').length === 2);

  await a.post(P, { action: 'confirm', candidateId: 연남id });
  w = (await a.get(P)).json;
  ok('다른 지역을 고르면 안 돌아온다', w.candidates.filter(c => c.kind === 'place').length === 0,
     `${w.candidates.filter(c => c.kind === 'place').length}곳`);

  await a.post(P, { action: 'reopen' });
  await a.post(P, { action: 'confirm', candidateId: 성수id });
  w = (await a.get(P)).json;
  const back = w.candidates.filter(c => c.kind === 'place');
  ok('같은 지역으로 돌아와도 안 돌아온다 (논의87)', back.length === 0, `${back.length}곳`);

  await a.post(P, { action: 'remove' });
}

console.log('');
console.log('[13] 시간대 · 나가기 · 방장 넘기기');
{
  const a = person('a'), b = person('b'), c = person('c');
  await 로그인(a, 'F방장2');
  const mk = await a.post('/api/m', { name: '나가기', hostName: '방장', meetAt: '2026-08-20T18:30', ...출발지() });
  const C4 = mk.json.code, P = `/api/m/${C4}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await c.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });

  let w = (await a.get(P)).json;
  const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour12: false,
    dateStyle: 'short', timeStyle: 'short' }).format(new Date(w.meeting.meet_at));
  const hhmm = new Date(new Date(w.meeting.meet_at).getTime() + 9 * 3600e3).toISOString().slice(11, 16);
  ok('18:30 은 한국시간 18:30 이다', hhmm === '18:30', `${w.meeting.meet_at} → ${kst}`);

  await b.post(P, { action: 'ping', kind: 'region', refId: 'r-b', name: '영희동', lat: 37.5, lng: 127.0 });
  w = (await a.get(P)).json;
  ok('영희가 한 곳을 선정했다', w.candidates.length === 1, `${w.candidates.length}곳`);

  ok('방장은 그냥 못 나간다', (await a.post(P, { action: 'leave' })).status === 409);
  ok('참여자는 나갈 수 있다', (await b.post(P, { action: 'leave' })).status === 200);
  w = (await a.get(P)).json;
  ok('나간 사람은 목록에서 빠진다', !w.participants.some(p => p.name === '영희'),
     w.participants.map(p => p.name).join(','));
  ok('나간 사람이 올린 후보도 함께 빠진다', w.candidates.length === 0, `${w.candidates.length}곳`);

  /* 논의125 — 방장 넘기기를 없앴다. 넘겨받는 사람이 로그인 안 했으면 그 모임이 다시
     '쿠키만 가진 방장'이 되어 벽돌 위험(논의122)이 돌아오기 때문이다.
     그래서 방장은 아예 못 나간다 — 빠지고 싶으면 모임을 지운다. */
  const 넘김 = await a.post(P, { action: 'handover', participantId:
    w.participants.find(p => p.name === '민준').id });
  ok('방장 넘기기는 사라졌다', 넘김.status === 400 && 넘김.json?.error === 'unknown_action',
     `${넘김.status} ${넘김.json?.error}`);
  ok('민준은 그냥 나갈 수 있다', (await c.post(P, { action: 'leave' })).status === 200);
  const 혼자 = await a.post(P, { action: 'leave' });
  ok('혼자 남은 방장도 못 나간다', 혼자.status === 409 && 혼자.json?.error === 'host_cannot_leave',
     `${혼자.status} ${혼자.json?.error}`);
  ok('방장은 모임을 지울 수 있다', (await a.post(P, { action: 'remove' })).status === 200);
}

console.log('');
console.log('[14] 전수 조사에서 재현된 결함 — 다시 나지 않게');
{
  const a = person('a'), b = person('b'), c = person('c'), 남 = person('남');
  await 로그인(a, 'F방장3');
  const mk = await a.post('/api/m', { name: '결함 회귀', hostName: '방장', scope: 'place', ...출발지() });
  const C5 = mk.json.code, P = `/api/m/${C5}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await c.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });

  /* B01 — 응답에 pin_hash 가 섞여 나가지 않는다 */
  const 훔쳐 = (await 남.get(P)).json;
  ok('응답에 pin_hash 가 없다', !훔쳐.participants.some(p => 'pin_hash' in p),
     Object.keys(훔쳐.participants[0]).join(','));

  /* B04 — 이미 멤버가 또 join 하지 못한다 */
  const 또 = await b.post(P, { action: 'join', name: '영희부캐', pin: '3333', ...출발지() });
  ok('이미 멤버는 다시 못 들어온다', 또.status === 409, 또.json?.error);

  /* B11 — refId 없는 ping 은 막힌다 */
  const 무명 = await c.post(P, { action: 'ping', kind: 'region', name: '무명동', lat: 37.5, lng: 127.0 });
  ok('refId 없는 선정은 막힌다', 무명.status === 400, 무명.json?.error);
  const 이상좌표 = await c.post(P, { action: 'ping', kind: 'region', refId: 'x', name: 'y', lat: 999, lng: 999 });
  ok('말도 안 되는 좌표는 막힌다', 이상좌표.status === 400, 이상좌표.json?.error);

  /* B09 — confirm 은 이 모임의 이 종류 후보만 받는다 */
  await a.post(P, { action: 'ping', kind: 'region', refId: 'r1', name: '성수동', lat: 37.5445, lng: 127.0557 });
  const 엉터리 = await a.post(P, { action: 'confirm', candidateId: '존재하지않음' });
  ok('없는 후보로는 확정 못 한다', 엉터리.status === 404, 엉터리.json?.error);

  /* B05 — 남의 모임 사람은 못 건드린다 */
  const 밖 = person('밖');
  await 로그인(밖, 'F방장4');
  const mk2 = await 밖.post('/api/m', { name: '남의 모임', hostName: '외부인', ...출발지() });
  let w = (await a.get(P)).json;
  const 영희id = w.participants.find(p => p.name === '영희').id;
  const 교차 = await 밖.post(`/api/m/${mk2.json.code}`, { action: 'kick', participantId: 영희id });
  ok('남의 모임 사람은 강퇴 못 한다', 교차.status === 404, 교차.json?.error);
  await 밖.post(`/api/m/${mk2.json.code}`, { action: 'remove' });

  /* B06 — approve 는 대기 중인 사람에게만 */
  const 뒷문 = await a.post(P, { action: 'approve', participantId: w.meeting.host_id, ok: false });
  ok('approve 로 방장을 잠글 수 없다', 뒷문.status === 409, 뒷문.json?.error);

  /* B10 — 끝난 단계의 표는 못 뺀다 */
  w = (await a.get(P)).json;
  const 성수 = w.candidates.find(x => x.name === '성수동');
  await a.post(P, { action: 'confirm', candidateId: 성수.id });
  const 늦은취소 = await a.post(P, { action: 'unping', candidateId: 성수.id });
  ok('확정된 지역 후보는 못 지운다', 늦은취소.status === 400, 늦은취소.json?.error);

  /* B08 — 남이 찍어 준 내 후보를 두고도 나갈 수 있다 */
  await b.post(P, { action: 'ping', kind: 'place', refId: 'p1', name: '영희가게', lat: 37.5443, lng: 127.0561 });
  await c.post(P, { action: 'ping', kind: 'place', refId: 'p1', name: '영희가게', lat: 37.5443, lng: 127.0561 });
  const 나가기 = await b.post(P, { action: 'leave' });
  ok('남이 찍어 준 내 후보가 있어도 나갈 수 있다', 나가기.status === 200, `${나가기.status}`);
  w = (await a.get(P)).json;
  ok('나간 뒤에도 그 후보는 남는다', w.candidates.some(x => x.name === '영희가게'),
     w.candidates.filter(x => x.kind === 'place').map(x => x.name).join(','));

  /* B02 — 강퇴자 재참여는 PIN 이 맞아야 한다 */
  const 민준id = w.participants.find(p => p.name === '민준').id;
  await a.post(P, { action: 'kick', participantId: 민준id });
  const 사칭 = person('사칭');
  const 틀린핀 = await 사칭.post(P, { action: 'join', name: '민준', pin: '9999', ...출발지() });
  ok('남의 이름으로 신원을 못 가져간다', 틀린핀.status === 403, 틀린핀.json?.error);
  /* 바로 위에서 '민준' 이름에 일부러 틀린 PIN 을 넣었다 — 그 자국 때문에 이 시도는
     맞는 PIN 이어도 한 번은 429 로 튕긴다(논의51, 위 `참여` 주석). 기다렸다 다시 낸다. */
  const 맞는핀 = await 참여(c, P, { action: 'join', name: '민준', pin: '2222', ...출발지() });
  ok('본인은 PIN 으로 돌아온다', 맞는핀.json?.pending === true, `${맞는핀.status} ${맞는핀.json?.error ?? ''}`);

  await a.post(P, { action: 'remove' });
}

console.log('');
console.log('[15] 논의37~39 — 되돌리기·마무리·주소');
{
  const a = person('a'), b = person('b');
  await 로그인(a, 'F방장5');
  const mk = await a.post('/api/m', { name: '되돌리기 규칙', hostName: '방장', scope: 'place', ...출발지() });
  const C6 = mk.json.code, P = `/api/m/${C6}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });

  await a.post(P, { action: 'ping', kind: 'region', refId: 'r1', name: '성수동', lat: 37.5445, lng: 127.0557 });
  let w = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });

  /* 논의39 ④ — 되돌리면 확정도 함께 지워진다 */
  ok('되돌리기 한 번이면 확정도 지워진다', (await a.post(P, { action: 'reopen' })).status === 200);
  w = (await a.get(P)).json;
  ok('지역 단계로 내려오고 확정이 비었다',
     w.meeting.stage === 'region' && !w.meeting.winner_region_id,
     `${w.meeting.stage} · winner=${w.meeting.winner_region_id ?? 'null'}`);
  const 또 = await a.post(P, { action: 'reopen' });
  ok('첫 칸에서는 더 못 되돌린다', 또.status === 409, 또.json?.error);
  ok('되돌린 모임은 마무리도 못 한다', (await a.post(P, { action: 'close' })).status === 409);

  /* 논의37 ① — 주소가 그대로 실려 온다 */
  await a.post(P, { action: 'confirm', candidateId: w.candidates[0].id });
  await a.post(P, { action: 'ping', kind: 'place', refId: 'p1', name: '성수동 곱창집',
    lat: 37.5443, lng: 127.0561, address: '서울 성동구 아차산로7길 12' });
  w = (await a.get(P)).json;
  const 가게 = w.candidates.find(c => c.kind === 'place');
  ok('후보에 주소가 실린다', 가게.address === '서울 성동구 아차산로7길 12', 가게.address);

  /* 논의39 ④ — 지점에서 되돌리면 지역 확정도 비워진다 */
  ok('지점에서 되돌리기', (await a.post(P, { action: 'reopen' })).status === 200);
  w = (await a.get(P)).json;
  ok('지역 확정도 함께 비워진다',
     w.meeting.stage === 'region' && !w.meeting.winner_region_id && !w.meeting.winner_place_id,
     `${w.meeting.stage} · r=${w.meeting.winner_region_id ?? 'null'} p=${w.meeting.winner_place_id ?? 'null'}`);
  ok('넣어 둔 지점 후보는 숨는다', !w.candidates.some(c => c.kind === 'place'));

  await a.post(P, { action: 'remove' });
}

console.log('');
console.log('[16] 논의40~41 — 단계 알림 · 강퇴 즉시 차단');
{
  const a = person('a'), b = person('b'), c = person('c');
  await 로그인(a, 'F방장6');
  const mk = await a.post('/api/m', { name: '사람 다루기', hostName: '방장', scope: 'place', ...출발지() });
  const C7 = mk.json.code, P = `/api/m/${C7}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  await c.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });

  /* 논의41 — 강퇴하면 그 사람의 조회에도 kicked 가 바로 실린다 */
  let w = (await a.get(P)).json;
  const 영희id = w.participants.find(p => p.name === '영희').id;
  await a.post(P, { action: 'kick', participantId: 영희id });
  const 영희뷰 = (await b.get(P)).json;
  ok('강퇴되면 조회에도 바로 실린다',
     영희뷰.participants.find(p => p.id === 영희id).state === 'kicked');
  ok('그 사람은 아무 것도 못 한다',
     (await b.post(P, { action: 'ping', kind: 'region', refId: 'x', name: '연남동', lat: 37.56, lng: 126.92 })).status === 403);

  /* 논의40 — 방장이 단계를 넘기면 참여자 조회의 stage 가 바뀐다 */
  await a.post(P, { action: 'ping', kind: 'region', refId: 'r1', name: '성수동', lat: 37.5445, lng: 127.0557 });
  w = (await a.get(P)).json;
  const 성수 = w.candidates.find(x => x.name === '성수동');
  const 전 = (await c.get(P)).json.meeting.stage;
  await a.post(P, { action: 'confirm', candidateId: 성수.id });
  const 후 = (await c.get(P)).json.meeting.stage;
  ok('참여자도 단계가 넘어간 걸 본다', 전 === 'region' && 후 === 'place', `${전} → ${후}`);

  /* 논의40 — 방장도 아직 안 골랐으면 myVotes 가 빈다(화면이 안내를 낸다) */
  const 방장뷰 = (await a.get(P)).json;
  ok('방장의 지점 표는 아직 없다', 방장뷰.me.myVotes.length === 0, `${방장뷰.me.myVotes.length}곳`);

  await a.post(P, { action: 'remove' });
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}   (모임 ${CODE})`);
process.exit(fail ? 1 : 0);
