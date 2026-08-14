/* AI 에게 **무엇을 보내는가** 회귀 시험.

   왜 있나: 프롬프트는 눈에 안 보이는 자리다. 틀려도 화면은 멀쩡하고, AI 가 엉뚱한 것을 줘도
   "AI 가 원래 그렇지" 로 넘어간다. 실제로 네 군데가 오래 틀려 있었다 —
     ① 지점을 물으면서 **어느 지역인지 안 알려 줬다** ("확정된 동네 근처에서…" 라고만)
     ② '이미 나온 곳' 에 **종류가 섞였다** (지점을 물으며 지역 이름까지 붙임)
     ③ **'서울' 이 박혀 있었다** (부산 모임에도 서울 동네를 달라고 함)
     ④ **좌표를 안 줬다** (가운데를 정확히 아는데 역 이름만 주고 짐작하게 함)

   어떻게 재나: **AI 를 진짜로 부르지 않는다.** 이 시험이 가짜 AI 서버를 띄우고
   `OLLAMA_PRIMARY_URL` 을 그리로 돌려, 우리가 보낸 글을 그대로 붙잡아 본다.
   그래서 토큰도 안 들고 바깥이 죽어 있어도 돈다.

   node tests/ai프롬프트.mjs — 개발 서버가 없어도 된다 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const 일터 = join(process.env.TEMP ?? tmpdir(), 'moimer_ai시험');

/* `lib/geo.ts` 가 불러올 때 DB 에 붙는다 — 이 시험은 DB 를 안 쓰지만 연결 문자열이 있어야 뜬다.
   ⚠ 값은 어디에도 안 찍는다 (다른 시험과 같은 규칙). */
const env = readFileSync(join(APP, '.env.local'), 'utf8');
process.env.DATABASE_URL ??=
  (env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');

/* ── 진짜 파일을 굽는다 ─────────────────────────────────────
   프롬프트 글자를 이 시험에 베껴 두면 `lib/ai.ts` 가 바뀌어도 초록불이 켜진다. */
console.log('\n[준비] lib/ai.ts 를 굽는다');
rmSync(일터, { recursive: true, force: true });
mkdirSync(일터, { recursive: true });
spawnSync(process.execPath, [
  join(APP, 'node_modules', 'typescript', 'bin', 'tsc'),
  'lib/ai.ts', 'lib/geo.ts', 'lib/단계.ts', 'lib/types.ts',
  '--outDir', 일터, '--module', 'commonjs', '--moduleResolution', 'node',
  '--target', 'es2022', '--esModuleInterop', '--skipLibCheck',
], { cwd: APP, encoding: 'utf8' });
try { symlinkSync(join(APP, 'node_modules'), join(일터, 'node_modules'), 'junction'); } catch { /* 있으면 그만 */ }
/* tsc 는 `@/` 별칭을 그대로 뱉는다 — 여기서만 편다 */
for (const f of ['ai.js', 'geo.js']) {
  const p = join(일터, f);
  if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('"@/lib/', '"./'));
}
ok('lib/ai.js 가 구워졌다', existsSync(join(일터, 'ai.js')));

/* ── 가짜 AI ────────────────────────────────────────────── */
let 받은 = null;
const srv = createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    try { 받은 = JSON.parse(b); } catch { 받은 = null; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '[]' } }] }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
process.env.OLLAMA_PRIMARY_URL = 'http://127.0.0.1:' + srv.address().port;
process.env.OLLAMA_PRIMARY_MODEL = '가짜모델';
delete process.env.OLLAMA_API_KEY;

const { suggest } = await import(pathToFileURL(join(일터, 'ai.js')).href);

const 사람 = (n, o, lat, lng, state = 'active') => ({ id: 'p' + n, state, name: n, origin_name: o, lat, lng });
const 밑 = {
  meeting: {
    code: 'ABC123', name: '금요일 저녁 회식', purpose: null, scope: 'place',
    stage: 'region', meet_at: null, radius_m: 1500, host_id: 'p지훈',
    winner_region_id: null, winner_place_id: null, closed_at: null,
  },
  participants: [
    사람('지훈', '성수역', 37.5446, 127.0560),
    사람('영희', '홍대입구역', 37.5572, 126.9245),
    사람('민준', '왕십리역', 37.5612, 127.0378),
    /* 내보내진 사람 — 이 모임의 가운데에 안 들어가야 한다 */
    사람('철수', '강남역', 37.4979, 127.0276, 'kicked'),
  ],
  candidates: [
    { id: 'c1', kind: 'region', name: '성수동', lat: 37.5447, lng: 127.0557 },
    { id: 'c2', kind: 'region', name: '연남동', lat: 37.5626, lng: 126.9256 },
    { id: 'c3', kind: 'place', name: '황소곱창', lat: 37.5443, lng: 127.0561 },
  ],
  me: { participantId: 'p지훈', isHost: true, myVotes: [] },
};
const 보낸글 = async (m, v = 밑) => { 받은 = null; await suggest(m, v); return 받은?.messages?.[0]?.content ?? ''; };

try {

/* ── 지역 단계 ─────────────────────────────────────────── */
console.log('\n[AI1] 지역을 물을 때');
{
  const g = await 보낸글(밑.meeting);
  ok('④ 출발지를 좌표까지 준다', /성수역\(37\.5446\d?,127\.056\d*\)/.test(g), g.split('\n')[1]);
  ok('④ 모두의 가운데를 준다', /모두의 가운데: 37\.55\d+,127\.00\d+/.test(g),
     g.split('\n').find((l) => l.startsWith('모두의 가운데')) ?? '없음');
  /* 내보내진 사람이 가운데를 끌어당기면 안 된다 — 강남(37.49)이 섞이면 가운데가 남쪽으로 내려간다 */
  ok('내보내진 사람은 안 센다', !/강남역/.test(g), g.split('\n')[1]);
  ok('③ 우리가 도시를 박지 않는다', !/서울|부산|경기/.test(g), (g.match(/서울|부산|경기/) ?? [''])[0]);
  ok('② 이미 나온 것은 **지역만** 붙인다',
     /이미 나온 지역: 성수동, 연남동/.test(g) && !/황소곱창/.test(g),
     g.split('\n').find((l) => l.startsWith('이미 나온')) ?? '없음');
  ok('JSON 만 달라고 못 박는다', /JSON 배열만/.test(g));
  ok('좌표를 지어내지 말라고 말한다', /지어내지 마라/.test(g));
}

/* ── 지점 단계 ─────────────────────────────────────────── */
console.log('\n[AI2] 지점을 물을 때');
{
  const m = { ...밑.meeting, stage: 'place', winner_region_id: 'c1', purpose: '저녁 회식' };
  const g = await 보낸글(m);
  /* ① 이것이 없으면 물음 자체가 성립하지 않는다 */
  ok('① 정해진 지역을 이름과 좌표로 알려 준다',
     /정해진 지역: 성수동\(37\.5447\d?,127\.0557\d?\)/.test(g),
     g.split('\n').find((l) => l.startsWith('정해진 지역')) ?? '없음');
  ok('② 이미 나온 것은 **지점만** 붙인다',
     /이미 나온 곳: 황소곱창/.test(g) && !/이미 나온 곳:.*성수동/.test(g),
     g.split('\n').find((l) => l.startsWith('이미 나온')) ?? '없음');
  ok('무엇 하러 모이는지 반영한다', /저녁 회식에 어울리는/.test(g));
  ok('③ 우리가 도시를 박지 않는다', !/서울|부산|경기/.test(g));
}

/* ── 지역이 아직 없는데 지점을 물을 때 ─────────────────── */
console.log('\n[AI3] 지역이 없는 채로 지점을 물으면');
{
  const m = { ...밑.meeting, stage: 'place', winner_region_id: null };
  const g = await 보낸글(m);
  /* 얼버무리면 아무 데나 찍는다 — 무엇을 기준으로 삼을지 말해 줘야 한다 */
  ok('무엇을 기준으로 삼을지 밝힌다', /정해진 지역: 아직 없음/.test(g) && /가운데.*기준/.test(g),
     g.split('\n').find((l) => l.startsWith('정해진 지역')) ?? '없음');
}

/* ── 끝난 모임 ─────────────────────────────────────────── */
console.log('\n[AI4] 끝난 모임은 실제로 정해진 것이 종류를 말한다');
{
  /* `lib/단계.ts` 하나가 잣대다 — 여기가 갈라지면 화면은 지점을 묻는데 AI 는 지역을 준다 */
  const 지점끝 = { ...밑.meeting, stage: 'region', closed_at: '2026-08-13T00:00:00Z', winner_place_id: 'c3' };
  ok('지점까지 정하고 끝났으면 지점을 묻는다', /장소를 3곳/.test(await 보낸글(지점끝)));
  const 지역끝 = { ...밑.meeting, stage: 'result', winner_region_id: 'c1', winner_place_id: null };
  ok('지역만 정하고 끝났으면 지역을 묻는다', /지역\(행정동\)/.test(await 보낸글(지역끝)));
}

/* ── 돌아온 것을 어떻게 거르나 ─────────────────────────── */
console.log('\n[AI5] 돌아온 것을 거른다');
{
  const 답 = (글) => { srv.removeAllListeners('request');
    srv.on('request', (req, res) => { req.resume(); req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 글 } }] })); }); }); };

  답('[{"name":"도쿄역","lat":35.681,"lng":139.767},{"name":"성수동","lat":37.5447,"lng":127.0557}]');
  let r = await suggest(밑.meeting, 밑);
  ok('한국 밖 좌표는 버린다', r.닿음 && r.picks.length === 1 && r.picks[0].name === '성수동',
     JSON.stringify(r.picks?.map((p) => p.name)));

  답('[{"name":"성수동","lat":37.5447,"lng":127.0557},{"name":"성수동","lat":37.5448,"lng":127.0558}]');
  r = await suggest(밑.meeting, 밑);
  ok('같은 이름이 두 번 오면 하나만 쓴다', r.닿음 && r.picks.length === 1, `${r.picks?.length}곳`);

  답('여기 추천드립니다!\n```json\n[{"name":"성수동","lat":37.5447,"lng":127.0557}]\n```\n도움이 되셨길!');
  r = await suggest(밑.meeting, 밑);
  ok('앞뒤에 말을 붙여 와도 목록만 집어낸다', r.닿음 && r.picks.length === 1, `${r.picks?.length}곳`);

  답('죄송해요, 잘 모르겠어요.');
  r = await suggest(밑.meeting, 밑);
  /* **답은 받았다** — 토큰은 나갔으므로 횟수를 태워야 한다(논의93). 못 붙은 것과 다르다 */
  ok('목록이 없어도 "닿음" 이다 (토큰은 나갔다)', r.닿음 === true && r.picks.length === 0);

  답('[{"name":"성수동","lat":"삼칠점오"}]');
  r = await suggest(밑.meeting, 밑);
  ok('좌표가 숫자가 아니면 버린다', r.닿음 && r.picks.length === 0, `${r.picks?.length}곳`);

  답('[이건 JSON 이 아니다]');
  r = await suggest(밑.meeting, 밑);
  ok('못 읽을 목록이 와도 안 터진다', r.닿음 === true && r.picks.length === 0);
}

/* ── 못 붙었을 때 ──────────────────────────────────────── */
console.log('\n[AI6] 못 붙으면 "못붙음" 이다 (횟수를 안 태운다)');
{
  const 옛주소 = process.env.OLLAMA_PRIMARY_URL;
  process.env.OLLAMA_PRIMARY_URL = 'http://127.0.0.1:1';   /* 아무도 안 듣는 자리 */
  const r = await suggest(밑.meeting, 밑);
  ok('닿지 못하면 닿음:false', r.닿음 === false, JSON.stringify(r).slice(0, 60));
  process.env.OLLAMA_PRIMARY_URL = 옛주소;

  const 옛모델 = process.env.OLLAMA_PRIMARY_MODEL;
  delete process.env.OLLAMA_PRIMARY_MODEL;
  const r2 = await suggest(밑.meeting, 밑);
  ok('설정이 없어도 닿음:false (터지지 않는다)', r2.닿음 === false, r2.까닭);
  process.env.OLLAMA_PRIMARY_MODEL = 옛모델;
}

} catch (e) {
  실패++;
  console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
}

srv.close();
rmSync(일터, { recursive: true, force: true });
console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
