/* 가게 목록 캐시 갈래 회귀 시험 — 그릴링 논의63.
   개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
     node tests/가게캐시.mjs

   차례가 중요하다. ①(캐시)은 카카오가 빈손이라 OSM 으로 내려가는 자리에서만 잴 수 있는데,
   ③ 이 먼저 실패를 만들면 서버의 거울이 쉬는 중이라 그 자리가 늘 503 이 돼 ① 을 못 잰다.
   ① 을 맨 앞에 둔다. 실패를 만든 뒤 3분 안에 다시 돌리면 ① 이 건너뛸 수 있다 — 그때는 3분 뒤에 돌려라.
   ④ 는 모듈을 직접 부르는 시험이라 바깥도 서버도 건드리지 않는다(맨 끝). */

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';

let pass = 0, fail = 0, skip = 0;
const ok = (name, good, note = '') => {
  if (good) { pass++; console.log(`  통과  ${name}${note ? ' — ' + note : ''}`); }
  else { fail++; console.log(`  실패  ${name}${note ? ' — ' + note : ''}`); }
};
const 건너뜀 = (name, why) => { skip++; console.log(`  건너뜀 ${name} — ${why}`); };

/* 걸린 시간까지 재야 캐시가 사는지 보인다 */
async function 두들기기(path) {
  const t0 = Date.now();
  const res = await fetch(BASE + path);
  let body = null;
  try { body = await res.json(); } catch { /* HTML 오류 쪽지 */ }
  return { res, body, ms: Date.now() - t0, 곳수: Array.isArray(body?.places) ? body.places.length : -1 };
}

/* '캐시에서 나왔다'를 밀리초로 가르려면 이 회선의 DB 왕복이 얼마인지부터 알아야 한다.
   Overpass 가 컨디션 좋은 날 600ms 에 답하는 것을 봤다 — 고정된 숫자로 그으면 그날 초록불이 거짓말을 한다.
   /api/geo 는 같은 좌표를 두 번 부르면 geo_cache 에서 바로 꺼낸다 — 그것이 자[尺]다. */
let 자 = 0;
async function 자재기() {
  const q = 'lat=37.5445&lng=127.0557';
  await 두들기기(`/api/geo?${q}`);
  const 잰것 = [await 두들기기(`/api/geo?${q}`), await 두들기기(`/api/geo?${q}`)].map((r) => r.ms);
  자 = Math.min(...잰것);
  console.log(`  (이 회선의 DB 왕복 한 번 = ${자}ms · 캐시 히트는 이 언저리여야 한다)`);
}
/* 라우트 품이 조금 더 드는 것까지 봐준다 */
const 캐시속도인가 = (ms) => ms <= 자 * 1.6 + 50;

/* 캐시 칸은 소수 4자리(약 11m)다 — 돌릴 때마다 새 칸을 써야 '첫 번째'가 진짜 첫 번째다 */
const 흔들기 = (v, 폭) => (v + (Math.random() - 0.5) * 폭).toFixed(4);
/* 강원 산간 — 카카오가 반경 300m 에서 빈손이라 OSM 으로 내려간다 */
const 산간 = () => `lat=${흔들기(37.7412, 0.04)}&lng=${흔들기(128.4531, 0.04)}&r=300`;
/* 성수 — 카카오가 답하는 자리 */
const 도심 = () => `lat=${흔들기(37.5445, 0.006)}&lng=${흔들기(127.0557, 0.006)}&r=300`;

/* ── ① 같은 자리를 두 번 누르면 두 번째는 바깥에 안 나간다 ────── */
async function 캐시() {
  console.log('① 캐시 — OSM 으로 내려가는 자리');
  /* 거울이 통째로 죽어 있으면 200 이 안 나온다. 두 자리만 두들겨 본다 —
     잇달아 두들기면 mail.ru 가 막아 세워 오히려 잴 수 없게 된다. */
  /* 흔든 좌표가 하필 카카오가 답하는 자리에 떨어질 수 있다 — 그러면 OSM 을 잰 것이 아니다.
     빈 목록이거나 id 가 전부 osm: 이어야 OSM 으로 내려간 자리다. */
  const osm길인가 = (r) => r.res.ok && (r.곳수 === 0 || r.body.places.every((p) => p.id.startsWith('osm:')));
  let 첫 = null, 자리 = null;
  for (let i = 0; i < 2 && !자리; i++) {
    const q = 산간();
    const r = await 두들기기(`/api/places?${q}`);
    if (osm길인가(r)) { 첫 = r; 자리 = q; }
    else if (i === 0) await new Promise((f) => setTimeout(f, 1500));
  }
  if (!자리) {
    건너뜀('OSM 자리: 두 번째부터는 캐시에서 나온다', 'Overpass 가 한 자리도 안 답해 잴 수 없다');
    건너뜀('OSM 자리: 두 번째 목록이 첫 번째와 같다', '위와 같은 까닭');
    return;
  }
  /* 한 번은 운으로 빠를 수 있다 — 두 번 다 캐시 속도여야 한다 */
  const 둘 = await 두들기기(`/api/places?${자리}`);
  const 셋 = await 두들기기(`/api/places?${자리}`);
  const 빠른쪽 = Math.max(둘.ms, 셋.ms);
  ok('OSM 자리: 두 번째부터는 캐시에서 나온다', 캐시속도인가(빠른쪽),
     `첫 ${첫.ms}ms → ${둘.ms}/${셋.ms}ms (자 ${자}ms)`);
  ok('OSM 자리: 두 번째 목록이 첫 번째와 같다',
     둘.res.ok && JSON.stringify(둘.body?.places) === JSON.stringify(첫.body?.places),
     `${첫.곳수}곳 → ${둘.곳수}곳`);
}

/* ── ② 반경이 열쇠에 들어간다 ──────────────────────────────
   반경을 빼고 좌표만으로 저장하면 300m 로 뜬 목록이 1km 요청에 그대로 나온다. */
async function 반경열쇠() {
  console.log('② 열쇠 — 좌표 칸 + 반경');
  const 자리 = 'lat=37.5445&lng=127.0557';
  await 두들기기(`/api/places?${자리}&r=300`);          /* 300m 를 먼저 저장시킨다 */
  const 좁게 = await 두들기기(`/api/places?${자리}&r=300`);
  const 넓게 = await 두들기기(`/api/places?${자리}&r=1000`);
  if (!좁게.res.ok || !넓게.res.ok) {
    건너뜀('반경이 다르면 다른 목록이다', `상태 ${좁게.res.status}/${넓게.res.status}`);
    return;
  }
  const 좁은이름 = new Set((좁게.body.places ?? []).map((p) => p.name));
  const 넓은쪽에만 = (넓게.body.places ?? []).filter((p) => !좁은이름.has(p.name));
  ok('반경이 다르면 다른 목록이다', 넓은쪽에만.length > 0,
     `300m ${좁게.곳수}곳 · 1km ${넓게.곳수}곳 (1km 에만 ${넓은쪽에만.length}곳)`);
}

/* ── ③ 못 불러온 것은 저장하지 않는다 ────────────────────────
   실패를 빈 목록으로 저장하면 바깥의 장애가 "여기엔 등록된 지점이 없어요"로 몇 시간 굳는다.
   Overpass 가 멀쩡한 날에는 실패를 만들 수 없어 건너뛴다. */
async function 실패는안굳는다() {
  console.log('③ 못 불러온 것은 저장하지 않는다');
  let 막힌 = null;
  for (let i = 0; i < 3 && !막힌; i++) {
    const q = 산간();
    const r = await 두들기기(`/api/places?${q}`);
    if (r.res.status === 503) 막힌 = { q, ms: r.ms };
  }
  if (!막힌) { 건너뜀('못 불러온 자리는 저장하지 않는다', 'Overpass 가 살아 있어 실패를 못 만들었다'); return; }
  /* 실패를 저장했다면 다시 부를 때 '캐시 속도'로 200 + 0곳 이 돌아온다.
     바깥이 그 사이 되살아나 진짜로 물어본 것과는 걸린 시간으로 갈린다. */
  const 다시 = await 두들기기(`/api/places?${막힌.q}`);
  const 굳었나 = 다시.res.ok && 다시.곳수 === 0 && 캐시속도인가(다시.ms);
  ok('못 불러온 자리는 저장하지 않는다', !굳었나,
     굳었나 ? `${다시.ms}ms 만에 200 + 0곳 ("등록된 지점이 없어요"로 굳었다)`
            : `첫 ${막힌.ms}ms · 상태 ${다시.res.status} · ${다시.ms}ms`);
}

/* ── ④ 답 없는 거울은 쉬게 한다 ─────────────────────────────
   캐시는 이미 눌러 본 자리만 구한다 — 새 자리를 누를 때마다 죽은 거울을 다시 두드리면
   여전히 12초를 버린다. Overpass 가 멀쩡하면 밖에서는 이 상황을 못 만들어
   external.mjs 의 A26 처럼 모듈을 직접 부르고 fetch 를 대신 세운다(바깥으로 한 발짝도 안 나간다).
   거울이 셋이고 예산이 12초라 한 번에 한둘씩만 제 시간을 받는다 — 세 번째 부름부터 안 기다린다. */
async function 거울쉼() {
  console.log('④ 답 없는 거울은 쉬게 한다');
  const PLACES = new URL('../lib/places.ts', import.meta.url).href;
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜키 = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-only-not-a-real-key';
  console.warn = () => {};
  /* 카카오는 빈손, 거울은 끊는 신호가 올 때까지 매달려 있는다(진짜 늘어짐과 같다) */
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('dapi.kakao.com')) return Response.json({ documents: [] });
    if (u.includes('overpass')) return new Promise((_, rej) => {
      init?.signal?.addEventListener('abort',
        () => rej(Object.assign(new Error('시간 초과'), { name: 'TimeoutError' })));
    });
    throw new Error('예상 못한 바깥 호출: ' + u);   /* 캐시(Neon)도 여기 걸린다 — 알아서 꺼진다 */
  };
  /* AbortSignal.timeout 의 타이머는 이벤트 루프를 붙잡지 않는다 — 노드가 그냥 끝나 버린다 */
  const 깨움 = setInterval(() => {}, 500);
  try {
    const { placesNear } = await import(PLACES);
    const 한번 = async (n) => {
      const t0 = Date.now();
      try { await placesNear(37.5 + n / 1000, 128.3 + n / 1000, 300); } catch { /* 실패가 맞다 */ }
      return Date.now() - t0;
    };
    const 잰것 = [await 한번(1), await 한번(2), await 한번(3)];
    ok('거울이 다 쉬면 새 자리도 안 기다린다', 잰것[2] < 1000,
       잰것.map((ms, i) => `${i + 1}번째 ${ms}ms`).join(' → '));
  } catch (e) {
    ok('모듈을 부를 수 있다', false, String(e?.message ?? e));
  } finally {
    clearInterval(깨움);
    globalThis.fetch = 진짜fetch;
    console.warn = 진짜warn;
    if (진짜키 === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = 진짜키;
  }
}

/* ── ⑤ 캐시를 붙였다고 입구 가드가 헐거워지면 안 된다 ────────── */
async function 입구() {
  console.log('⑤ 입구 가드');
  const 나쁜반경 = await 두들기기('/api/places?lat=37.5445&lng=127.0557&r=-1');
  ok('반경 -1 은 그대로 막는다', 나쁜반경.res.status === 400, `상태 ${나쁜반경.res.status}`);
  const 나쁜좌표 = await 두들기기('/api/places?lat=0&lng=0&r=300');
  ok('한국 밖 좌표는 그대로 막는다', 나쁜좌표.res.status === 400, `상태 ${나쁜좌표.res.status}`);
}

/* ── ⑥ 캐시를 거쳐도 목록이 그대로여야 한다 ─────────────────
   좌표가 문자열로 굳거나 칸이 하나 빠지면 지도에 안 찍힌다. */
async function 그대로() {
  console.log('⑥ 캐시를 거쳐도 목록은 그대로');
  const 자리 = 도심();
  const 첫 = await 두들기기(`/api/places?${자리}`);
  const 둘 = await 두들기기(`/api/places?${자리}`);
  if (!첫.res.ok || 첫.곳수 <= 0) {
    건너뜀('캐시를 거쳐도 목록이 그대로다', `첫 응답이 ${첫.res.status}/${첫.곳수}곳`);
    return;
  }
  ok('캐시를 거쳐도 목록이 그대로다',
     JSON.stringify(첫.body.places) === JSON.stringify(둘.body?.places), `${첫.곳수}곳 → ${둘.곳수}곳`);
  ok('캐시에서 나온 좌표도 숫자다',
     (둘.body?.places ?? []).every((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
     `${둘.곳수}곳`);
}

await 자재기();
await 캐시();
await 반경열쇠();
await 그대로();
await 실패는안굳는다();
await 입구();
await 거울쉼();     /* 모듈 상태를 건드리니 맨 끝에 */

console.log(`\n통과 ${pass} · 실패 ${fail}${skip ? ` · 건너뜀 ${skip}` : ''}`);
if (fail) process.exit(1);
