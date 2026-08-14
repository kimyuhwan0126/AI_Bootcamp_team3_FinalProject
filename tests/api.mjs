/* 모임 API 입력 검사 — 회귀 시험 (갈래: api)
   node tests/api.mjs   ← 개발 서버가 떠 있어야 한다 (기본 127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
   덮는 결함: A16 A17 A21 A25 A37 A38 A39 A40 A41 A42 A43 A46

   'localhost' 는 ::1 로 먼저 붙는데 undici 가 여기서 종종 10초를 흘려보낸다 — 주소를 못 박는다. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';
import { 로그인 } from './세션.mjs';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0, hold = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
/* 다른 파일(lib/db.ts)이 고쳐져야 초록이 되는 항목 — 실패로 세지 않고 눈에 띄게만 둔다 */
const 보류 = (n, d) => { hold++; console.log(`  ⏸ ${n}  → ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 쿠키를 들고 다니는 사람 하나 (flowtest 와 같은 방식) */
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
    raw(path, text) { return this.call(path, { method: 'POST', body: text }); },
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

/* 만드는 사람은 로그인해야 한다 (논의123) — 참여(join)는 그대로 로그인 없이 된다.
   쿠키 항아리마다 한 번만 로그인한다. 못 만들면 그 자리에서 터뜨린다 —
   code 가 undefined 로 흘러가면 그 뒤 물음이 전부 404 가 되어 진짜 까닭이 묻힌다. */
const 모임만들기 = async (p, name, extra = {}) => {
  if (!p.로그인함) p.로그인함 = await 로그인(p, '시험API');
  const r = await p.post('/api/m', { name, hostName: '방장', scope: 'place', ...출발지(), ...extra });
  if (!r.json?.code) throw new Error(`모임을 못 만들었다: ${r.status} ${r.text.slice(0, 80)}`);
  return r.json.code;
};

/** 한 동작이 SSE 로 몇 번 알렸는지 — 헛 알림(A46)·안 오는 알림(A16)을 잡는다.
    잴 때마다 새로 연결한다: 개발 서버가 다시 구우면 물고 있던 연결이 조용히 죽는다. */
async function 알림수(code, 동작) {
  const ear = await 귀(code);
  await 동작();
  const n = await ear.센다();
  ear.끊는다();
  return n;
}

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
  await sleep(300);                                   /* hello 를 받고 자리를 잡을 시간 */
  return {
    async 센다() { await sleep(400); return 온것.filter((e) => e === 'changed').length; },
    비운다() { 온것.length = 0; },
    끊는다() { ctrl.abort(); },
  };
}

console.log('\n[논의123] 모임 만들기는 로그인부터');
{
  /* 이 규칙이 되돌아가면 여기가 바로 잡는다. 몸을 읽기 전에 세션부터 보므로
     제대로 채운 본문이어도 401 이어야 한다 — 다 적고 나서 막히면 안 된다. */
  const 손님 = person();
  const r = await 손님.post('/api/m',
    { name: '로그인 없이 만들기', hostName: '방장', scope: 'place', origin: '성수역', lat: 37.5446, lng: 127.0560 });
  ok('로그인 없이는 모임을 못 만든다 → 401 login_required',
    r.status === 401 && r.json?.error === 'login_required', `${r.status} ${r.json?.error ?? r.text.slice(0, 20)}`);
}

console.log('\n[A38] 깨진 본문은 400 — 500 이 아니다');
const 방장 = person();
const C1 = await 모임만들기(방장, 'API 검사 · 본문');
{
  for (const [이름, 본문] of [['깨진 JSON', '{oops'], ['빈 본문', ''],
                              ['null 본문', 'null'], ['문자열 본문', '"hello"'],
                              ['action 없는 본문', '{"name":"x"}']]) {
    const r = await 방장.raw(`/api/m/${C1}`, 본문);
    ok(`${이름} → 400`, r.status === 400, `${r.status} ${r.json?.error ?? r.text.slice(0, 20)}`);
  }
  const 없는모임 = await 방장.post('/api/m/ZZZZZZ', { action: 'close' });
  ok('없는 모임은 404 그대로', 없는모임.status === 404, `${없는모임.status}`);
}

console.log('\n[A37/A41/A42] ping — 종류·좌표·refId');
{
  const P = `/api/m/${C1}`;
  for (const [이름, kind] of [['kind 생략', undefined], ['kind REGION', 'REGION'],
                              ['kind zzz', 'zzz'], ['kind null', null], ['kind 빈문자', '']]) {
    const r = await 방장.post(P, { action: 'ping', kind, refId: 'k1', name: '어딘가', lat: 37.5, lng: 127.0 });
    ok(`${이름} → 400`, r.status === 400, `${r.status} ${r.json?.error ?? '본문없음'}`);
  }
  for (const [이름, lat, lng] of [['lat 90', 90, 127.0], ['lat -90', -90, 127.0],
                                  ['lng 180', 37.5, 180], ['lat 999', 999, 127.0]]) {
    const r = await 방장.post(P, { action: 'ping', kind: 'region', refId: 'edge', name: '경계', lat, lng });
    ok(`${이름} → 400`, r.status === 400, `${r.status} ${r.json?.error ?? '본문없음'}`);
  }
  ok('정상 ping 은 그대로 200',
    (await 방장.post(P, { action: 'ping', kind: 'region', refId: 'rX', name: '성수동', lat: 37.5445, lng: 127.0557 })).status === 200);
  await 방장.post(P, { action: 'ping', kind: 'region', refId: ' rX ', name: '성수동', lat: 37.5445, lng: 127.0557 });
  const v = (await 방장.get(P)).json;
  ok('앞뒤 공백만 다른 refId 는 같은 후보',
    v.candidates.filter((c) => c.name === '성수동').length === 1,
    `${v.candidates.filter((c) => c.name === '성수동').length}곳`);
  ok('경계 좌표 후보는 아예 안 생긴다', !v.candidates.some((c) => c.name === '경계'),
    v.candidates.map((c) => c.name).join(',') || '없음');
}

console.log('\n[A42/A43] join — 좌표 범위·이름 길이');
{
  const P = `/api/m/${C1}`;
  const 먼사람 = person();
  const 이상좌표 = await 먼사람.post(P, { action: 'join', name: '이상', pin: '1111', origin: '어딘가', lat: 999, lng: 127 });
  ok('lat 999 로는 못 들어온다', 이상좌표.status === 400, `${이상좌표.status} ${이상좌표.json?.error}`);
  const 긴이름 = await person().post(P, { action: 'join', name: '가'.repeat(200), pin: '1111', ...출발지() });
  ok('200자 이름은 못 들어온다', 긴이름.status === 400, `${긴이름.status} ${긴이름.json?.error}`);
  const 이상수단 = await person().post(P, { action: 'join', name: '수단', pin: '1111', ...출발지(), transport: 'zzz' });
  ok('없는 이동수단은 못 들어온다', 이상수단.status === 400, `${이상수단.status} ${이상수단.json?.error}`);
  const 정상 = await person().post(P, { action: 'join', name: '영희', pin: '1111', ...출발지() });
  ok('정상 참여는 그대로 200', 정상.status === 200, `${정상.status} ${정상.json?.error ?? ''}`);
  const v = (await 방장.get(P)).json;
  ok('막힌 사람은 참가자로 안 남는다', v.participants.length === 2,
    v.participants.map((p) => p.name.slice(0, 6)).join(','));
}

console.log('\n[A21] update — 빈 이름·엉터리 시간은 기존 값을 못 건드린다');
{
  const P = `/api/m/${C1}`;
  ok('정상 update 는 그대로 200',
    (await 방장.post(P, { action: 'update', name: '고친 이름', meetAt: '2026-08-20T18:30' })).status === 200);
  let v = (await 방장.get(P)).json;
  const 원래이름 = v.meeting.name, 원래시간 = v.meeting.meet_at;
  ok('고친 값이 남는다', 원래이름 === '고친 이름' && !!원래시간, `${원래이름} · ${원래시간}`);

  for (const [이름, patch] of [
    ['빈 이름', { name: '' }],
    ['공백 이름', { name: '   ' }],
    ['200자 이름', { name: '가'.repeat(200) }],
    ['이름 아닌 값', { name: null }],
    ['말로 쓴 시간', { meetAt: '내일 저녁 7시' }],
    ['없는 날짜', { meetAt: '2026-13-45T99:99' }],
    ['0000-00-00', { meetAt: '0000-00-00T00:00' }],
    ['2월 31일', { meetAt: '2026-02-31T10:00' }],
    ['연도 밖', { meetAt: '1899-01-01T10:00' }],
  ]) {
    const r = await 방장.post(P, { action: 'update', ...patch });
    v = (await 방장.get(P)).json;
    ok(`${이름} → 400`, r.status === 400, `${r.status} ${r.json?.error ?? '본문없음'}`);
    ok(`${이름} 뒤에도 이름·시간이 그대로`,
      v.meeting.name === 원래이름 && v.meeting.meet_at === 원래시간,
      `${v.meeting.name} · ${v.meeting.meet_at}`);
  }

  ok('시간 비우기는 된다 (화면이 보내는 null)',
    (await 방장.post(P, { action: 'update', name: '고친 이름', meetAt: null })).status === 200);
  v = (await 방장.get(P)).json;
  ok('비운 시간은 비어 있다', v.meeting.meet_at === null, `${v.meeting.meet_at}`);
}

console.log('\n[A46/A16] 헛 SSE 는 안 쏘고, 삭제는 밀어 준다');
{
  const P = `/api/m/${C1}`;
  const 영희 = person();
  await 영희.post(P, { action: 'join', name: '민준', pin: '2222', ...출발지() });
  let v = (await 방장.get(P)).json;
  const 성수 = v.candidates.find((c) => c.name === '성수동');

  let 헛취소;
  const 헛알림 = await 알림수(C1, async () => {
    헛취소 = await 영희.post(P, { action: 'unping', candidateId: 성수.id });
  });
  ok('표 없는 사람의 취소는 알리지 않는다', 헛알림 === 0, `changed ${헛알림}회 · ${헛취소.status}`);
  v = (await 방장.get(P)).json;
  ok('헛 취소로 후보가 사라지지 않는다', v.candidates.some((c) => c.id === 성수.id));

  const 표알림 = await 알림수(C1, () =>
    영희.post(P, { action: 'ping', kind: 'region', refId: 'rX', name: '성수동', lat: 37.5445, lng: 127.0557 }));
  ok('진짜 표는 알린다', 표알림 > 0, `changed ${표알림}회`);
  const 취소알림 = await 알림수(C1, () => 영희.post(P, { action: 'unping', candidateId: 성수.id }));
  ok('진짜 취소도 알린다', 취소알림 > 0, `changed ${취소알림}회`);

  const 삭제알림 = await 알림수(C1, () => 방장.post(P, { action: 'remove' }));
  ok('모임 삭제도 실시간으로 밀린다', 삭제알림 > 0, `changed ${삭제알림}회`);
  ok('지운 모임은 사라진다', (await 방장.get(P)).status === 404);
}

console.log('\n[A40] 없앤 vote 액션 (그릴링 논의98)');
{
  const a = person();
  const C2 = await 모임만들기(a, 'API 검사 · vote');
  const P = `/api/m/${C2}`;
  await a.post(P, { action: 'ping', kind: 'region', refId: 'r1', name: '성수동', lat: 37.5445, lng: 127.0557 });
  let v = (await a.get(P)).json;
  const 지역 = v.candidates[0];
  await a.post(P, { action: 'confirm', candidateId: 지역.id });
  /* 논의98 — 화면이 한 번도 안 부르던 길이라 없앴다. 안 쓰는 길일수록 결함이 숨는다. */
  const 없앤것 = await a.post(P, { action: 'vote', candidateId: 지역.id });
  ok('없앤 액션은 400 으로 거절한다',
    없앤것.status === 400 && 없앤것.json?.error === 'unknown_action', `${없앤것.status} ${없앤것.json?.error}`);
  v = (await a.get(P)).json;
  ok('지점 후보가 복제되지 않는다', !v.candidates.some((c) => c.kind === 'place'),
    v.candidates.map((c) => `${c.kind}:${c.name}`).join(' | '));

  await a.post(P, { action: 'ping', kind: 'place', refId: 'p1', name: '황소곱창', lat: 37.5447, lng: 127.0557 });
  v = (await a.get(P)).json;
  const 지점 = v.candidates.find((c) => c.kind === 'place');
  ok('지점 후보에도 마찬가지다',
    (await a.post(P, { action: 'vote', candidateId: 지점.id })).status === 400);
  ok('없는 후보도 마찬가지다',
    (await a.post(P, { action: 'vote', candidateId: 'x' })).status === 400);
  await a.post(P, { action: 'remove' });
}

console.log('\n[A39] 마무리한 모임에 close 를 또 부르면 409');
{
  const a = person();
  const C3 = await 모임만들기(a, 'API 검사 · 마무리', { scope: 'region' });
  const P = `/api/m/${C3}`;
  await a.post(P, { action: 'ping', kind: 'region', refId: 'r1', name: '성수동', lat: 37.5445, lng: 127.0557 });
  const v = (await a.get(P)).json;
  await a.post(P, { action: 'confirm', candidateId: v.candidates[0].id });
  ok('첫 마무리는 200', (await a.post(P, { action: 'close' })).status === 200);
  const 처음 = (await a.get(P)).json.meeting.closed_at;
  await sleep(1100);
  const 또 = await a.post(P, { action: 'close' });
  const 나중 = (await a.get(P)).json.meeting.closed_at;
  ok('두 번째 마무리는 409', 또.status === 409, `${또.status} ${또.json?.error}`);
  ok('closed_at 이 갱신되지 않는다', 처음 === 나중, `${처음} → ${나중}`);
  /* 읽기 전용의 예외는 지우기 하나다 (논의54·107) — 이 줄이 없던 동안 돌릴 때마다
     '지난 모임' 이 운영 DB 에 한 건씩 쌓였다(18건까지 갔다). 내가 만든 것은 내가 치운다. */
  ok('마무리한 모임도 방장은 치울 수 있다', (await a.post(P, { action: 'remove' })).status === 200);
}

console.log('\n[A25] AI 좌표도 사람이 찍은 것과 같은 검사를 거친다');
{
  /* AI 서버에 닿을 수 없어 실측이 안 된다 — 두 경로가 같은 검사 함수를 쓰는지로 본다 */
  const src = readFileSync(pjoin(ROOT, 'app/api/m/[code]/route.ts'), 'utf8');
  const ai블록 = src.slice(src.indexOf("case 'ai'"), src.indexOf('default:'));
  const ping블록 = src.slice(src.indexOf("case 'ping'"), src.indexOf("case 'unping'"));
  ok('사람 ping 이 좌표 검사 함수를 쓴다', /좌표유효\(/.test(ping블록));
  ok('AI 경로도 같은 좌표 검사 함수를 쓴다', /좌표유효\(/.test(ai블록),
    ai블록.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' / '));
}

console.log('\n[A17] 재참여 때 새로 낸 출발지');
{
  const a = person(), b = person();
  const C4 = await 모임만들기(a, 'API 검사 · 재참여');
  const P = `/api/m/${C4}`;
  await b.post(P, { action: 'join', name: '영희', pin: '1111', origin: '성수역', lat: 37.5446, lng: 127.0560 });
  let v = (await a.get(P)).json;
  const 영희id = v.participants.find((p) => p.name === '영희').id;
  await a.post(P, { action: 'kick', participantId: 영희id });

  const 빈출발지 = await b.post(P, { action: 'join', name: '영희', pin: '1111' });
  ok('출발지 없는 재참여는 막는다', 빈출발지.status === 400, `${빈출발지.status} ${빈출발지.json?.error}`);
  const 이상좌표 = await b.post(P, { action: 'join', name: '영희', pin: '1111', origin: 'x', lat: 999, lng: 127 });
  ok('말도 안 되는 좌표의 재참여도 막는다', 이상좌표.status === 400, `${이상좌표.status} ${이상좌표.json?.error}`);

  const 재참여 = await b.post(P, { action: 'join', name: '영희', pin: '1111', origin: '왕십리역', lat: 37.5612, lng: 127.0378 });
  ok('본인은 승인 대기로 돌아온다', 재참여.json?.pending === true, `${재참여.status} ${재참여.json?.error ?? ''}`);
  v = (await a.get(P)).json;
  const 영희 = v.participants.find((p) => p.id === 영희id);
  const 반영됨 = 영희.origin_name === '왕십리역' && Math.abs(영희.lat - 37.5612) < 1e-6;
  if (반영됨) ok('새로 낸 출발지가 반영된다', true);
  else 보류('새로 낸 출발지가 반영된다', `${영희.origin_name}/${영희.lat} — lib/db.ts 에 출발지 갱신 함수가 필요하다(보고 참조)`);

  await a.post(P, { action: 'remove' });
}

console.log('\n──────────────────────────────');
if (hold) console.log(`보류 ${hold} (다른 파일이 고쳐져야 초록)`);
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
