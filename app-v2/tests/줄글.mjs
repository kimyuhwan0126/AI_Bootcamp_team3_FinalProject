/* `app/meetings/줄글.ts` 회귀 시험 — 목록 카드에 적히는 말을 만드는 순수 함수들.
   서버가 필요 없다. tsc 로 구워 바로 부른다.

   재는 것 중 논의109 뒤처리가 핵심이다: **약속 시간 없이 만든 모임이 끝나면
   전에는 '언제였나' 를 말할 것이 아예 없었다** — `언제()` 가 그냥 빈 줄을 냈다.
   서버는 `created_at` 을 진작부터 주고 있었는데(논의109) 화면이 그걸 안 썼다.

   node tests/줄글.mjs */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

let 통과 = 0, 실패 = 0;
const ok = (n, c, d = '') => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const 일터 = join(process.env.TEMP ?? tmpdir(), 'moimer_줄글시험');
rmSync(일터, { recursive: true, force: true });
mkdirSync(일터, { recursive: true });
spawnSync(process.execPath, [
  join(APP, 'node_modules', 'typescript', 'bin', 'tsc'),
  'app/meetings/줄글.ts', 'lib/db.ts', 'lib/types.ts', 'lib/time.ts', 'lib/단계.ts',
  '--outDir', 일터, '--module', 'commonjs', '--moduleResolution', 'node',
  '--target', 'es2022', '--esModuleInterop', '--skipLibCheck',
], { cwd: APP, encoding: 'utf8' });
try { symlinkSync(join(APP, 'node_modules'), join(일터, 'node_modules'), 'junction'); } catch { /* 있으면 그만 */ }
/* @/ 별칭을 편다 */
for (const f of ['줄글.js']) {
  const p = join(일터, 'app', 'meetings', f);
  if (existsSync(p)) {
    const s = readFileSync(p, 'utf8').replaceAll('"@/lib/db"', '"../../lib/db"');
    writeFileSync(p, s);
  }
}
const 모듈 = existsSync(join(일터, 'app', 'meetings', '줄글.js')) ? join(일터, 'app', 'meetings', '줄글.js') : null;
ok('줄글.js 가 구워졌다', !!모듈, 모듈 ?? '없음');
if (!모듈) { console.log(`\n통과 ${통과} · 실패 ${실패}`); process.exit(1); }

const { 상태of, 진행중, 언제, 어디, 상태이름 } = await import(pathToFileURL(모듈).href);

const KST = 9 * 60 * 60_000;
const iso = (y, m, d, h = 12) => new Date(Date.UTC(y, m - 1, d, h - 9)).toISOString(); /* KST 시각을 UTC 로 */
const 지금 = new Date(iso(2026, 8, 13, 18)).getTime();

const 밑 = { code: 'A', name: '모임', stage: 'region', scope: 'place', closed: false,
  meetAt: null, createdAt: iso(2026, 8, 1), people: 1, chosen: 0, iAmHost: true, iChose: false,
  winner: null, updatedAt: iso(2026, 8, 1) };

console.log('\n[줄1] 상태');
ok('진행 중이면 stage 그대로', 상태of({ ...밑, stage: 'place' }) === 'place');
ok('끝났으면 무엇이든 past', 상태of({ ...밑, stage: 'region', closed: true }) === 'past');
ok('끝났고 result 였어도 past', 상태of({ ...밑, stage: 'result', closed: true }) === 'past');
ok('진행중() 은 region·place 만', 진행중('region') && 진행중('place') && !진행중('result') && !진행중('past'));
ok('상태이름 표에 넷 다 있다', ['region', 'place', 'result', 'past'].every((k) => typeof 상태이름[k] === 'string'));

console.log('\n[줄2] 언제 — 진행 중');
ok('오늘', 언제({ ...밑, meetAt: iso(2026, 8, 13, 20) }, 지금) === '오늘');
ok('내일', 언제({ ...밑, meetAt: iso(2026, 8, 14, 20) }, 지금) === '내일');
ok('3일 뒤', 언제({ ...밑, meetAt: iso(2026, 8, 16, 20) }, 지금) === '3일 뒤');
ok('어제', 언제({ ...밑, meetAt: iso(2026, 8, 12, 20) }, 지금) === '어제');
ok('2일 전', 언제({ ...밑, meetAt: iso(2026, 8, 11, 20) }, 지금) === '2일 전');
ok('시간 없으면 빈 줄 (진행 중)', 언제({ ...밑, meetAt: null }, 지금) === '');

console.log('\n[줄3] 언제 — 끝난 모임에 약속 시간이 있었다');
ok('그날 날짜를 적는다', 언제({ ...밑, closed: true, meetAt: iso(2026, 8, 5, 19) }, 지금) === '8월 5일');

console.log('\n[줄4] ★ 논의109 — 끝난 모임에 약속 시간이 없었다');
{
  const m = { ...밑, closed: true, meetAt: null, createdAt: iso(2026, 8, 3) };
  const 결과 = 언제(m, 지금);
  ok('빈 줄이 아니다 (전에는 여기가 비었다)', 결과 !== '', JSON.stringify(결과));
  ok('만든 날을 짚는다', 결과 === '8월 3일쯤', 결과);
  ok('약속과 헷갈리지 않게 "쯤" 을 붙인다', 결과.endsWith('쯤'), 결과);
}
ok('진행 중인데 시간도 없으면 여전히 빈 줄 (만든 날을 "언제 만나나"로 읽으면 안 된다)',
   언제({ ...밑, closed: false, meetAt: null, createdAt: iso(2026, 8, 3) }, 지금) === '');
ok('createdAt 조차 없으면 빈 줄 (터지지 않는다)',
   언제({ ...밑, closed: true, meetAt: null, createdAt: '' }, 지금) === '');

console.log('\n[줄5] 어디');
ok('안 정해졌으면 빈 줄', 어디({ ...밑, winner: null }) === '');
ok('지역만 정해졌으면 이름 그대로', 어디({ ...밑, stage: 'place', winner: '성수동' }) === '성수동에서');
ok('결과까지 났으면 조사 없이', 어디({ ...밑, stage: 'result', closed: true, winner: '황소곱창' }) === '황소곱창');

console.log('\n[줄6] 금지 낱말이 낱말표에 없다');
{
  const 전체글 = Object.values(상태이름).join(' ');
  for (const 금지 of ['투표', '표', '동네', '가게', '마감']) {
    ok(`상태이름에 '${금지}' 가 없다`, !전체글.includes(금지));
  }
}

rmSync(일터, { recursive: true, force: true });
console.log(`\n통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
