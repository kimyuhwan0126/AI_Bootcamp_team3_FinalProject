/* 내 모임 목록 회귀 시험 — `lib/db.ts` 의 `myMeetings` · `app/api/mine/route.ts` (논의77)
   `node tests/내모임.mjs` 로 바로 돈다.

   ⚠ 이 시험만 **개발 서버 없이** 돈다. 3000 번에는 예전 판이 떠 있고 새 판을 다른 포트로
   띄우면 사람이 헷갈리므로, HTTP 로 두들기지 않고 두 층을 각각 직접 부른다:
     · DB      — `.env.local` 의 DATABASE_URL 로 붙어 `myMeetings` 를 그대로 부른다
     · 라우트  — `GET()` 을 손으로 부른다. `cookies()` 는 Next 의 요청 저장소를 읽으므로
                 그 저장소를 깔아 주고 그 안에서 부른다(아래 `요청안에서`).
   TypeScript 를 그대로 못 부르니 프로젝트의 tsc 로 `%TEMP%\moimer_N\build` 에 구워 부른다 —
   **시험이 진짜 파일을 부른다.** SQL 을 베껴 두면 db.ts 가 깨져도 초록불이 켜진다.

   내가 만든 모임(이름이 `N시험 …`)만 지운다. DATABASE_URL 은 어디에도 찍지 않는다. */
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { neon } from '@neondatabase/serverless';

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

const APP = fileURLToPath(new URL('..', import.meta.url));
const 일터 = join(process.env.TEMP ?? tmpdir(), 'moimer_N');
const BUILD = join(일터, 'build');

/* ── DB ──────────────────────────────────────────────────────
   Neon 이 잠자다 깨면 첫 물음이 넘어진다 — 몇 번 다시 해 본다. */
const env = readFileSync(join(APP, '.env.local'), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
process.env.DATABASE_URL = DSN;                     /* 구운 db.js 가 불러올 때 읽는다 */
/* 라우트가 이제 `지금로그인()` 을 부른다 — NextAuth 는 비밀 문자열이 없으면 임시로 하나 지어 쓰면서
   경고와 JWE 오류를 잔뜩 찍는다. 시험 결과가 그 소음에 묻히므로 진짜 값을 넣어 준다.
   ⚠ 값은 어디에도 찍지 않는다(DATABASE_URL 과 같은 규칙). 없으면 그냥 넘어간다 — 소음만 는다. */
process.env.NEXTAUTH_SECRET ??=
  env.match(/^\s*NEXTAUTH_SECRET\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
process.env.NEXTAUTH_URL ??= 'http://127.0.0.1:3000';
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });
const q = async (fn, 남은 = 4) => {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 남은) throw e; await new Promise((r) => setTimeout(r, 400 * i)); }
  }
};

/* ── 진짜 파일을 굽는다 ───────────────────────────────────── */
console.log('\n[준비] lib/db.ts · lib/auth.ts · app/api/mine/route.ts 를 굽는다');
let db = null, route = null, auth = null, 구운탈 = '';
try {
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = join(APP, 'node_modules', 'typescript', 'bin', 'tsc');
  /* 타입 오류가 있어도 tsc 는 파일을 뱉는다(noEmitOnError 를 안 켠다) — 다른 갈래가 같은 시각에
     고치는 중이라 남의 오류로 이 시험이 멈추면 안 된다. 그래서 exit 코드는 보지 않고 결과물만 본다. */
  spawnSync(process.execPath, [
    tsc, 'lib/db.ts', 'lib/auth.ts', 'app/api/mine/route.ts',
    '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
    '--target', 'es2022', '--esModuleInterop', '--skipLibCheck',
  ], { cwd: APP, encoding: 'utf8' });

  const 라우트 = join(BUILD, 'app', 'api', 'mine', 'route.js');
  if (!existsSync(join(BUILD, 'lib', 'db.js'))) throw new Error('lib/db.js 가 안 구워졌다');
  if (!existsSync(라우트)) throw new Error('app/api/mine/route.js 가 안 구워졌다 (파일이 없나?)');
  /* tsc 는 `@/` 별칭을 그대로 뱉는다(tsconfig 의 paths 는 파일을 나열하면 안 읽힌다) — 여기서만 편다 */
  writeFileSync(라우트, readFileSync(라우트, 'utf8').replaceAll('"@/lib/', '"../../../lib/'));
  /* 구운 것이 next·@neondatabase 를 찾을 수 있게 앱의 node_modules 를 이어 둔다 */
  try { symlinkSync(join(APP, 'node_modules'), join(BUILD, 'node_modules'), 'junction'); } catch {}
  /* Next 의 저장소는 globalThis.AsyncLocalStorage 를 기대한다 — 서버 부팅이 깔아 주던 것이다 */
  globalThis.AsyncLocalStorage ??= (await import('node:async_hooks')).AsyncLocalStorage;

  db = await import(pathToFileURL(join(BUILD, 'lib', 'db.js')).href);
  auth = await import(pathToFileURL(join(BUILD, 'lib', 'auth.js')).href);
  route = await import(pathToFileURL(라우트).href);
} catch (e) {
  구운탈 = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.log(`  ✗ 굽기 실패 — ${구운탈}`);
}
ok('lib/db.ts 에 myMeetings 가 있다', typeof db?.myMeetings === 'function', 구운탈 || typeof db?.myMeetings);
ok('app/api/mine/route.ts 가 GET 을 내보낸다', typeof route?.GET === 'function', 구운탈 || typeof route?.GET);

/* ── Next 요청 저장소 흉내 ───────────────────────────────────
   `cookies()` 가 읽는 것은 저장소의 `cookies` 하나다 — get·getAll·set 만 있으면 된다. */
let requestAsyncStorage = null;
if (route) ({ requestAsyncStorage } = await import(
  pathToFileURL(join(APP, 'node_modules', 'next', 'dist', 'client', 'components',
    'request-async-storage.external.js')).href));

const 새병 = () => ({
  m: new Map(),
  get(n) { const v = this.m.get(n); return v === undefined ? undefined : { name: n, value: v }; },
  getAll() { return [...this.m].map(([name, value]) => ({ name, value })); },
  set(n, v) { this.m.set(n, v); return this; },
});
const 요청안에서 = (병, fn) => requestAsyncStorage.run(
  { cookies: 병, mutableCookies: 병, headers: new Headers(), draftMode: { isEnabled: false } }, fn);
/* 서명은 auth.ts 만 만들 수 있다 — 시험이 베끼면 소금 규칙이 바뀔 때 거짓 빨간불이 켜진다 */
const 쿠키병 = (짝) => {
  const 병 = 새병();
  요청안에서(병, () => { for (const [c, p] of 짝) auth.setParticipantCookie(c, p); });
  return 병;
};
const 목록받기 = async (병) => {
  const r = await 요청안에서(병, () => route.GET(new Request('http://127.0.0.1/api/mine')));
  return { status: r.status, json: await r.json() };
};

/* ── 시험 데이터 ─────────────────────────────────────────────
   서버가 안 떠 있어 API 로 못 만든다 — 줄을 직접 넣는다. 이름을 `N시험 …` 으로 못박아
   내가 만든 것만 지운다. host_id·winner_* 는 참가자·후보가 생긴 뒤에야 채울 수 있다
   (FK) — 그 마지막 한 번의 update 가 곧 그 모임의 `updated_at` 이다. */
const 자모 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const 새코드 = () => 'N' + Array.from({ length: 5 }, () => 자모[Math.floor(Math.random() * 32)]).join('');
let _n = 0;
const 새id = () => `n${(_n++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const 치울코드 = [];
async function 모임(이름, o = {}) {
  const code = 새코드();
  치울코드.push(code);
  await q(() => sql`
    insert into meetings (code, name, scope, stage, meet_at)
    values (${code}, ${'N시험 ' + 이름}, ${o.scope ?? 'place'}, 'region', ${o.meetAt ?? null})
  `);
  return code;
}
async function 사람(code, 이름, o = {}) {
  const id = 새id();
  await q(() => sql`
    insert into participants (id, code, name, pin_hash, state, joined_at)
    values (${id}, ${code}, ${이름}, 'n-시험-pin', ${o.state ?? 'active'},
            now() - (${o.전 ?? 0}::int * interval '1 day'))
  `);
  return id;
}
async function 후보(code, kind, 이름, 올린이, o = {}) {
  const id = 새id();
  await q(() => sql`
    insert into candidates (id, code, kind, ref_id, name, lat, lng, created_by, created_at)
    values (${id}, ${code}, ${kind}, ${'n-' + id}, ${이름}, 37.5446, 127.0560, ${올린이},
            now() - (${o.전 ?? 0}::int * interval '1 day'))
  `);
  return id;
}
const 고름 = (code, cid, pid, kind, o = {}) => q(() => sql`
  insert into votes (code, candidate_id, participant_id, kind, voted_at)
  values (${code}, ${cid}, ${pid}, ${kind}, now() - (${o.전 ?? 0}::int * interval '1 day'))
`);
/* 모임 줄을 마지막에 한 번만 고친다 — meetings_touch 트리거가 그때 updated_at 을 지금으로 찍는다.
   그래서 '어느 모임을 나중에 마무리했는가' 가 곧 updated_at 의 앞뒤가 된다. */
const 모임마감 = (code, o) => q(() => sql`
  update meetings set host_id = ${o.host}, stage = ${o.stage},
    winner_region_id = ${o.지역 ?? null}, winner_place_id = ${o.지점 ?? null},
    closed_at = ${o.닫음 ? new Date().toISOString() : null}
   where code = ${code}
`);

console.log('\n[준비] 지난 판이 남긴 것을 먼저 치운다');
{
  const r = await q(() => sql`delete from meetings where name like 'N시험 %' returning code`);
  console.log(`  · 남아 있던 시험 모임 ${r.length}건을 치웠다`);
}

/* 세 모임을 C → B → A 차례로 마감한다. 그러면 meetings.updated_at 은 C < B < A 다.
   마지막에 C 에만 방금 고른 표를 하나 넣는다 — '최근 것이 위로'가 모임 줄의 updated_at 만
   보는 것이라면 C 는 맨 아래여야 하고, 실제 움직임을 보는 것이라면 C 가 맨 위여야 한다. */
console.log('\n[준비] 시험 모임을 심는다');
const T = {};
{
  /* E — 갓 만든 모임. 후보도 표도 하나 없다. 여기서 목록이 비면 처음 온 사람은
     자기가 만든 모임을 못 본다 — `greatest(…)` 가 NULL 을 만나는 자리이기도 하다 */
  T.E = await 모임('갓만듦');
  T.E나 = await 사람(T.E, '나');
  await 모임마감(T.E, { host: T.E나, stage: 'region' });

  /* C — 마무리한 모임. 나는 방장이고 지점까지 정해졌다 */
  T.C = await 모임('마무리', { meetAt: '2026-08-21T10:00:00.000Z' });
  T.C나 = await 사람(T.C, '나', { 전: 5 });
  const c2 = await 사람(T.C, '영희', { 전: 5 });
  const cr = await 후보(T.C, 'region', '연남동', T.C나, { 전: 5 });
  const cp = await 후보(T.C, 'place', '연남 파스타', T.C나, { 전: 5 });
  await 고름(T.C, cr, T.C나, 'region', { 전: 5 });
  await 모임마감(T.C, { host: T.C나, stage: 'result', 지역: cr, 지점: cp, 닫음: true });
  T.C지점 = cp; T.C둘째 = c2;

  /* B — 지점 고르는 중. 나는 방장이 아니고, 지역만 골랐다(지점은 아직) */
  T.B = await 모임('지점중');
  const b1 = await 사람(T.B, '방장', { 전: 3 });
  T.B나 = await 사람(T.B, '나', { 전: 3 });
  await 사람(T.B, '내보낸사람', { state: 'kicked', 전: 3 });
  const br = await 후보(T.B, 'region', '성수동', b1, { 전: 3 });
  const bp = await 후보(T.B, 'place', '황소곱창', b1, { 전: 3 });
  await 고름(T.B, br, T.B나, 'region', { 전: 3 });      /* 지난 단계에서 내가 고른 것 */
  await 고름(T.B, bp, b1, 'place', { 전: 3 });          /* 지금 단계에서 남이 고른 것 */
  await 모임마감(T.B, { host: b1, stage: 'place', 지역: br });

  /* A — 지역 고르는 중. 나는 방장이고 골랐다 */
  T.A = await 모임('지역중');
  T.A나 = await 사람(T.A, '나', { 전: 2 });
  const a2 = await 사람(T.A, '영희', { 전: 2 });
  await 사람(T.A, '민준', { 전: 2 });
  const ar1 = await 후보(T.A, 'region', '성수동', T.A나, { 전: 2 });
  await 후보(T.A, 'region', '연남동', a2, { 전: 2 });
  await 고름(T.A, ar1, T.A나, 'region', { 전: 2 });
  await 고름(T.A, ar1, a2, 'region', { 전: 2 });
  await 모임마감(T.A, { host: T.A나, stage: 'region' });

  /* D — 내보내진 나 · H — 승인 대기인 나 · G — 지워진 참가자 · F — 서명이 틀릴 쿠키 */
  T.D = await 모임('내보내짐');
  const d1 = await 사람(T.D, '방장');
  T.D나 = await 사람(T.D, '나', { state: 'kicked' });
  await 모임마감(T.D, { host: d1, stage: 'region' });

  T.H = await 모임('승인대기');
  const h1 = await 사람(T.H, '방장');
  T.H나 = await 사람(T.H, '나', { state: 'pending' });
  await 모임마감(T.H, { host: h1, stage: 'region' });

  T.G = await 모임('지워진나');
  const g1 = await 사람(T.G, '방장');
  await 모임마감(T.G, { host: g1, stage: 'region' });
  T.G나 = 새id();                                      /* 그런 참가자는 없다 */

  T.F = await 모임('서명틀림');
  T.F나 = await 사람(T.F, '나');
  await 모임마감(T.F, { host: T.F나, stage: 'region' });

  T.없는코드 = 새코드();                                /* 그런 모임은 없다 */

  /* 맨 마지막 움직임 — C 에서 영희가 지금 골랐다 */
  await 고름(T.C, T.C지점, T.C둘째, 'place');
  console.log(`  · 모임 ${치울코드.length}건`);
}

/* ── DB 층 ─────────────────────────────────────────────────── */
console.log('\n[DB] myMeetings 가 무엇을 주는가');
if (typeof db?.myMeetings === 'function') {
  const 전부 = [
    { code: T.A, participantId: T.A나 }, { code: T.B, participantId: T.B나 },
    { code: T.C, participantId: T.C나 }, { code: T.D, participantId: T.D나 },
    { code: T.E, participantId: T.E나 },
    { code: T.G, participantId: T.G나 }, { code: T.H, participantId: T.H나 },
    { code: T.없는코드, participantId: 새id() },
  ];
  const 목록 = await q(() => db.myMeetings(전부));
  const 코드들 = 목록.map((m) => m.code);
  const A = 목록.find((m) => m.code === T.A), B = 목록.find((m) => m.code === T.B),
        C = 목록.find((m) => m.code === T.C), E = 목록.find((m) => m.code === T.E);

  ok('들어간 모임 넷이 다 나온다', [T.A, T.B, T.C, T.E].every((c) => 코드들.includes(c)), 코드들.join(','));
  ok('최근 것이 맨 위다 (C→A→B→E)', 코드들.join(',') === [T.C, T.A, T.B, T.E].join(','), 코드들.join(','));
  ok('없는 모임 코드는 조용히 빠진다', !코드들.includes(T.없는코드) && 목록.length === 4);
  ok('후보도 표도 없는 갓 만든 모임이 그대로 나온다',
     E?.people === 1 && E?.chosen === 0 && E?.iChose === false && E?.winner === null
     && E?.iAmHost === true && typeof E?.updatedAt === 'string',
     `${E?.people}명 · ${E?.chosen}명 · ${E?.updatedAt}`);
  ok('지워진 참가자를 가리키는 쿠키는 조용히 빠진다', !코드들.includes(T.G));
  ok('내보내진 모임은 안 나온다', !코드들.includes(T.D));
  ok('승인 대기인 모임은 안 나온다', !코드들.includes(T.H));

  ok('이름·범위·단계가 맞다', A?.name === 'N시험 지역중' && A?.scope === 'place' && A?.stage === 'region',
     `${A?.name} · ${A?.scope} · ${A?.stage}`);
  ok('활동 중인 사람만 센다 (B 는 내보낸 사람 빼고 둘)', B?.people === 2, `${B?.people}명`);
  ok('사람 수를 맞게 센다 (A 는 셋)', A?.people === 3, `${A?.people}명`);
  ok('지금 단계에서 고른 사람만 센다 (A 는 둘)', A?.chosen === 2, `${A?.chosen}명`);
  ok('지난 단계의 선택은 안 센다 (B 는 지점을 고른 하나)', B?.chosen === 1, `${B?.chosen}명`);
  ok('iAmHost 가 맞다', A?.iAmHost === true && B?.iAmHost === false && C?.iAmHost === true,
     `${A?.iAmHost} · ${B?.iAmHost} · ${C?.iAmHost}`);
  ok('iChose 는 지금 단계 기준이다 (B 는 지역만 골라 false)', A?.iChose === true && B?.iChose === false,
     `A ${A?.iChose} · B ${B?.iChose}`);
  ok('마무리한 모임은 closed:true', C?.closed === true && A?.closed === false && B?.closed === false);
  ok('정해진 곳 이름을 준다', C?.winner === '연남 파스타' && B?.winner === '성수동' && A?.winner === null,
     `${C?.winner} · ${B?.winner} · ${A?.winner}`);
  ok('meetAt 은 ISO 문자열이거나 null', typeof C?.meetAt === 'string' && A?.meetAt === null, String(C?.meetAt));
  ok('updatedAt 은 ISO 문자열', typeof A?.updatedAt === 'string' && !Number.isNaN(Date.parse(A?.updatedAt ?? '')),
     String(A?.updatedAt));
  /* createdAt 이 더해졌다 (논의109 뒤처리) — 약속 시간 없이 끝난 모임이
     "언제쯤 일이었나" 를 말할 수 있게 줄글.ts 의 언제() 가 이 칸을 쓴다 */
  ok('규약에 없는 칸을 흘리지 않는다',
     목록.every((m) => Object.keys(m).sort().join(',') ===
       'chosen,closed,code,createdAt,iAmHost,iChose,meetAt,name,people,scope,stage,updatedAt,winner'),
     Object.keys(목록[0] ?? {}).join(','));

  const 남의짝 = await q(() => db.myMeetings([{ code: T.A, participantId: T.B나 }]));
  ok('남의 모임 참가자 id 를 붙여도 안 나온다', 남의짝.length === 0, `${남의짝.length}건`);
  const 빈것 = await db.myMeetings([]);
  ok('쿠키가 없으면 빈 목록', Array.isArray(빈것) && 빈것.length === 0);
}

/* ── 계정으로도 찾는다 (논의124) ───────────────────────────────
   왜 있어야 하나: 방장은 로그인해야 모임을 만들 수 있는데(논의123), 목록을 쿠키로만 찾으면
   **폰을 바꾼 방장은 자기 모임을 하나도 못 본다** — 새 폰에는 `moimer.p.*` 쿠키가 없다.
   '로그인해 두면 어디서든 내 모임' 이라는 약속이 여기서 지켜지거나 깨진다. */
console.log('\n[DB] 계정으로 찾는 길');
if (typeof db?.myMeetings === 'function') {
  const 계정 = { id: 새id(), 열쇠: 'guest:N시험계정' };
  const 남계정 = { id: 새id(), 열쇠: 'guest:N시험남' };
  let 심음 = false;
  try {
    for (const u of [계정, 남계정]) await q(() => sql`
      insert into users (id, kakao_id, nickname) values (${u.id}, ${u.열쇠}, 'N시험')`);
    /* 계정이 앉은 자리 셋 — 활동 중 하나(A), 내보내진 하나, 승인 대기 하나.
       뒤의 둘은 계정으로도 안 나와야 한다: 쿠키 갈래가 이미 막고 있는 것을 계정 갈래가 뚫으면
       내보내진 사람에게 진행 상황이 새어 나간다(논의96).

       ⚠ 뒤의 둘은 **새 모임**에 심는다. A~E 에 참가자를 더하면 그 모임의 `max(joined_at)` 이 올라가
          `updatedAt` 이 바뀌고, 차례를 보는 뒤 시험이 애먼 이유로 빨개진다. A 는 `update` 라 안전하다
          (user_id 만 바꾸고 joined_at 은 그대로). */
    await q(() => sql`update participants set user_id = ${계정.id} where id = ${T.A나}`);
    const 강퇴방 = await 모임('계정강퇴');
    const 대기방 = await 모임('계정대기');
    const 강퇴나 = await 사람(강퇴방, 'N계정강퇴', { state: 'kicked' });
    const 대기나 = await 사람(대기방, 'N계정대기', { state: 'pending' });
    await q(() => sql`update participants set user_id = ${계정.id}
                       where id in (${강퇴나}, ${대기나})`);
    T.강퇴방 = 강퇴방; T.대기방 = 대기방;
    심음 = true;
  } catch (e) { ok('계정 시험 자리를 심었다', false, e?.message ?? String(e)); }

  if (심음) {
    const 계정만 = await q(() => db.myMeetings([], 계정.id));
    ok('쿠키가 하나도 없어도 계정으로 내 모임이 보인다',
       계정만.length === 1 && 계정만[0].code === T.A, 계정만.map((m) => m.code).join(',') || '0건');
    ok('계정으로 찾아도 내가 방장인 것을 안다', 계정만[0]?.iAmHost === true, String(계정만[0]?.iAmHost));
    ok('계정으로 찾아도 내가 골랐는지 안다', 계정만[0]?.iChose === true, String(계정만[0]?.iChose));
    ok('내보내진 자리는 계정으로도 안 나온다', !계정만.some((m) => m.code === T.강퇴방));
    ok('승인 대기 자리는 계정으로도 안 나온다', !계정만.some((m) => m.code === T.대기방));

    const 남의계정 = await q(() => db.myMeetings([], 남계정.id));
    ok('남의 계정으로는 내 모임이 안 나온다', 남의계정.length === 0, `${남의계정.length}건`);

    /* 쿠키와 계정이 **같은 모임**을 가리키는 흔한 경우 — 로그인한 채로 그 모임에 들어와 있는 사람이다.
       두 갈래를 그냥 이어 붙이면 같은 모임이 목록에 두 번 뜬다. */
    const 겹침 = await q(() => db.myMeetings([{ code: T.A, participantId: T.A나 }], 계정.id));
    ok('쿠키와 계정이 같은 모임을 가리켜도 한 번만 나온다',
       겹침.filter((m) => m.code === T.A).length === 1, `${겹침.length}건`);

    /* 두 갈래가 다른 모임을 가리키면 둘 다 나와야 한다 — 로그인하기 전에 참여한 모임(B)과
       로그인해서 만든 모임(A)을 한 사람이 함께 갖고 있는 자리다. */
    const 둘다 = await q(() => db.myMeetings([{ code: T.B, participantId: T.B나 }], 계정.id));
    ok('쿠키 쪽 모임과 계정 쪽 모임이 함께 나온다',
       둘다.length === 2 && 둘다.some((m) => m.code === T.A) && 둘다.some((m) => m.code === T.B),
       둘다.map((m) => m.code).join(','));

    const 아무것도 = await q(() => db.myMeetings([], null));
    ok('쿠키도 계정도 없으면 빈 목록', Array.isArray(아무것도) && 아무것도.length === 0,
       `${아무것도.length}건`);
  }

  /* users 는 모임을 지워도 안 지워진다(FK 가 반대 방향) — 내가 심은 두 줄은 내가 치운다.
     ⚠ 이 줄들만 지운다. `kakao_id` 를 못박아 남의 계정에는 손이 닿지 않게 한다. */
  try {
    await q(() => sql`update participants set user_id = null
                       where user_id in (${계정.id}, ${남계정.id})`);
    const r = await q(() => sql`delete from users where kakao_id in (${계정.열쇠}, ${남계정.열쇠})
                                returning id`);
    ok('내가 심은 계정 줄을 치웠다', r.length === 2, `${r.length}/2줄`);
  } catch (e) { ok('내가 심은 계정 줄을 치웠다', false, e?.message ?? String(e)); }
} else {
  ok('DB 층 시험을 돌렸다', false, 'myMeetings 가 없어 건너뛰었다');
}

/* ── 라우트 층 ─────────────────────────────────────────────── */
console.log('\n[라우트] GET /api/mine 이 쿠키를 어떻게 훑는가');
if (typeof route?.GET === 'function') {
  const 병 = 쿠키병([[T.A, T.A나], [T.B, T.B나], [T.C, T.C나], [T.D, T.D나], [T.E, T.E나],
                     [T.G, T.G나], [T.H, T.H나], [T.없는코드, 새id()]]);
  /* 서명을 한 글자 망가뜨린다 — 조용히 빠져야 한다 */
  const F열쇠 = `moimer.p.${T.F}`;
  const 참값 = 쿠키병([[T.F, T.F나]]).m.get(F열쇠);
  병.m.set(F열쇠, 참값.slice(0, -1) + (참값.endsWith('a') ? 'b' : 'a'));
  /* 모이머 쿠키가 아닌 것도 섞는다 */
  병.m.set('next-auth.session-token', '아무거나');
  병.m.set('moimer.p.', '빈코드');

  const { status, json } = await q(() => 목록받기(병));
  const 코드들 = (json.meetings ?? []).map((m) => m.code);
  ok('200 으로 준다', status === 200, String(status));
  ok('{meetings:[…]} 모양이다', Array.isArray(json.meetings), Object.keys(json).join(','));
  ok('넷만 나온다 (서명 틀림·없는 모임·강퇴·대기·지워진 참가자는 빠진다)',
     코드들.join(',') === [T.C, T.A, T.B, T.E].join(','), 코드들.join(','));
  ok('서명이 틀린 쿠키는 오류가 아니라 조용히 빠진다', status === 200 && !코드들.includes(T.F));

  const { status: s2, json: j2 } = await q(() => 목록받기(새병()));
  ok('쿠키가 하나도 없으면 401 이 아니라 200 · 빈 목록', s2 === 200 && Array.isArray(j2.meetings)
     && j2.meetings.length === 0, `${s2} · ${JSON.stringify(j2)}`);

  const 망친병 = 쿠키병([[T.A, T.A나]]);
  const 열쇠 = `moimer.p.${T.A}`;
  망친병.m.set(열쇠, 망친병.m.get(열쇠).split('.')[0]);      /* 서명 없는 옛 쿠키 */
  const { status: s3, json: j3 } = await q(() => 목록받기(망친병));
  ok('서명 없는 옛 쿠키도 조용히 빠진다', s3 === 200 && j3.meetings.length === 0,
     `${s3} · ${j3.meetings?.length}건`);

  /* 서명 확인을 라우트가 베껴 두면 소금이 바뀔 때 두 곳이 갈라진다 */
  const 라우트글 = readFileSync(join(APP, 'app', 'api', 'mine', 'route.ts'), 'utf8');
  ok('라우트가 서명 확인을 베끼지 않았다 (auth 의 것을 쓴다)',
     /getParticipantId/.test(라우트글) && !/createHash|SALT/.test(라우트글));
} else {
  ok('라우트 층 시험을 돌렸다', false, 'GET 이 없어 건너뛰었다');
}

/* ── 치우기 ────────────────────────────────────────────────── */
console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울코드) {
    try { await q(() => sql`delete from meetings where code = ${c}`); 지움++; } catch {}
  }
  const 남은 = await q(() => sql`select code from meetings where name like 'N시험 %'`);
  ok('내가 심은 모임을 전부 치웠다', 지움 === 치울코드.length && 남은.length === 0,
     `${지움}/${치울코드.length}건 · 남은 ${남은.length}건`);
  rmSync(BUILD, { recursive: true, force: true });
}

console.log('\n──────────────────────────────');
console.log(`통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
