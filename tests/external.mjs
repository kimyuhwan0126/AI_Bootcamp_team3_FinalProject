/* 바깥 서비스(카카오·Nominatim·Overpass) 갈래 회귀 시험 — A23·A24·A26·A31.
   개발 서버가 떠 있어야 한다 (기본 http://127.0.0.1:3000 · MOIMER_BASE 로 바꿀 수 있다).
     node tests/external.mjs
   HTTP 로 두들기는 시험이 주(主)다. 카카오 한 갈래만 죽는 상황은 밖에서 만들 수 없어
   A26 만 모듈을 직접 부르고 fetch 를 대신 세운다(바깥으로 나가지 않는다). */

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const PLACES = new URL('../lib/places.ts', import.meta.url).href;
const GEO = new URL('../lib/geo.ts', import.meta.url).href;

let pass = 0, fail = 0;
const ok = (name, good, note = '') => {
  if (good) { pass++; console.log(`  통과  ${name}${note ? ' — ' + note : ''}`); }
  else { fail++; console.log(`  실패  ${name}${note ? ' — ' + note : ''}`); }
};

/* 응답이 '못 불러왔다'를 말하고 있나. null 이면 200 인데 빈손 = '없다'고 말한 것이다. */
function 실패로_알리나(res, body) {
  if (!res.ok) return `상태 ${res.status}`;
  if (body?.failed === true) return 'failed:true';
  if (Array.isArray(body?.places) && body.places.length > 0) return `${body.places.length}곳`;
  return null;
}

async function 두들기기(path) {
  const res = await fetch(BASE + path);
  let body = null;
  try { body = await res.json(); } catch { /* HTML 오류 쪽지 — 본문은 안 본다 */ }
  return { res, body };
}

/* ── A23 · 바깥이 실패한 것을 '없다'고 말하지 않는다 ─────────── */
async function a23() {
  console.log('A23 — 못 불러온 것과 정말 없는 것');

  /* 반경 -1 은 카카오도 Overpass 도 받지 않는다 = 바깥이 통째로 빈손 */
  {
    const { res, body } = await 두들기기('/api/places?lat=37.5445&lng=127.0557&r=-1');
    const 신호 = 실패로_알리나(res, body);
    ok('주변 지점: 바깥이 다 막히면 실패를 알린다', 신호 !== null,
       신호 ?? `200 + 빈 목록(화면이 "등록된 지점이 없어요"라고 한다)`);
  }

  /* 반대 방향 — 멀쩡할 때 실패 신호가 켜지면 안 된다 */
  {
    const { res, body } = await 두들기기('/api/places?lat=37.5445&lng=127.0557&r=300');
    ok('주변 지점: 멀쩡할 때는 그대로 목록', res.ok && Array.isArray(body?.places) && body.places.length > 0,
       `상태 ${res.status} / ${Array.isArray(body?.places) ? body.places.length + '곳' : '목록 아님'}`);
  }
  {
    const { res, body } = await 두들기기(`/api/places/search?q=${encodeURIComponent('성수역')}`);
    ok('이름 찾기: 멀쩡할 때는 그대로 목록', res.ok && Array.isArray(body?.places) && body.places.length > 0,
       `상태 ${res.status} / ${Array.isArray(body?.places) ? body.places.length + '곳' : '목록 아님'}`);
  }
  /* 바깥이 통째로 막힌 상황은 라우트의 입력 가드(반경·좌표 범위)가 생겨
     HTTP 로는 더 못 만든다 — 아래 A26 에서 모듈을 직접 불러 확인한다. */

  /* 반대쪽 절반이 더 중요하다: 둘 다 멀쩡히 답했는데 빈손이면 그건 정말 없는 것이다.
     이때까지 던지면 화면이 멀쩡한 자리를 두고 "못 불러왔어요"만 말하게 된다. */
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜키 = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-only-not-a-real-key';
  console.warn = () => {};
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('dapi.kakao.com')) return Response.json({ documents: [] });
    if (u.includes('overpass')) return Response.json({ elements: [] });
    if (u.includes('nominatim')) return Response.json([]);
    throw new Error('예상 못한 바깥 호출: ' + u);
  };
  try {
    const { placesNear, searchPlaces } = await import(PLACES);
    let 결과 = null, 던졌나 = false;
    try { 결과 = await placesNear(37.5445, 127.0557, 300); } catch { 던졌나 = true; }
    ok('주변 지점: 둘 다 답했는데 빈손이면 정말 없는 것이다(안 던진다)',
       !던졌나 && Array.isArray(결과) && 결과.length === 0 && !결과.partial,
       던졌나 ? '던짐' : `${Array.isArray(결과) ? 결과.length + '곳' : '목록 아님'} · partial=${결과?.partial}`);

    결과 = null; 던졌나 = false;
    try { 결과 = await searchPlaces('없는이름'); } catch { 던졌나 = true; }
    ok('이름 찾기: 둘 다 답했는데 빈손이면 정말 없는 것이다(안 던진다)',
       !던졌나 && Array.isArray(결과) && 결과.length === 0,
       던졌나 ? '던짐' : `${Array.isArray(결과) ? 결과.length + '곳' : '목록 아님'}`);
  } catch (e) {
    ok('모듈을 부를 수 있다', false, String(e?.message ?? e));
  } finally {
    globalThis.fetch = 진짜fetch;
    console.warn = 진짜warn;
    if (진짜키 === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = 진짜키;
  }
}

/* ── A26 · 카카오 4그룹 중 하나가 죽어도 나머지는 살린다 ───────── */
async function a26() {
  console.log('A26 — 카카오 부분 실패');
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜키 = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-only-not-a-real-key';
  console.warn = () => {};

  /* 바깥으로 한 발짝도 나가지 않는다 */
  const 대역 = ({ 죽는그룹 = null, 전부죽음 = false }) => async (url) => {
    const u = String(url);
    if (u.includes('dapi.kakao.com')) {
      const g = new URL(u).searchParams.get('category_group_code');
      if (전부죽음 || g === 죽는그룹) return new Response('nope', { status: 500 });
      return Response.json({ documents: [{ id: g, place_name: `가게-${g}`, address_name: '어딘가', x: '127.05', y: '37.54' }] });
    }
    if (u.includes('overpass')) return new Response('down', { status: 504 });
    throw new Error('예상 못한 바깥 호출: ' + u);
  };

  try {
    const { placesNear } = await import(PLACES);

    globalThis.fetch = 대역({ 죽는그룹: 'CE7' });
    let 살아남은 = -1, 부분표시 = false;
    try {
      const r = await placesNear(37.5445, 127.0557, 300);
      살아남은 = Array.isArray(r) ? r.length : -1;
      부분표시 = r?.partial === true;
    } catch (e) { 살아남은 = -2; }
    ok('한 그룹이 죽어도 나머지 3그룹은 살아남는다', 살아남은 === 3, `${살아남은}곳`);
    ok('일부만 실패했다는 것을 위로 알린다', 부분표시, 부분표시 ? 'partial' : 'partial 없음');

    globalThis.fetch = 대역({ 전부죽음: true });
    let 던졌나 = false, 돌려준것 = null;
    try { 돌려준것 = await placesNear(37.5445, 127.0557, 300); } catch { 던졌나 = true; }
    ok('4그룹 전부 + OSM 까지 죽으면 빈 목록이 아니라 실패다', 던졌나,
       던졌나 ? '던짐' : `${Array.isArray(돌려준것) ? 돌려준것.length + '곳' : '?'} 돌려줌`);

    /* 이름 찾기도 같은 규칙 — 카카오·Nominatim 둘 다 막히면 '없다'가 아니다 */
    const { searchPlaces } = await import(PLACES);
    globalThis.fetch = async (url) => {
      if (String(url).includes('kakao') || String(url).includes('nominatim')) {
        return new Response('down', { status: 503 });
      }
      throw new Error('예상 못한 바깥 호출: ' + url);
    };
    let 찾기던짐 = false, 찾은것 = null;
    try { 찾은것 = await searchPlaces('성수역'); } catch { 찾기던짐 = true; }
    ok('이름 찾기: 둘 다 죽으면 빈 목록이 아니라 실패다', 찾기던짐,
       찾기던짐 ? '던짐' : `${Array.isArray(찾은것) ? 찾은것.length + '곳' : '?'} 돌려줌`);
  } catch (e) {
    ok('모듈을 부를 수 있다', false, String(e?.message ?? e));
  } finally {
    globalThis.fetch = 진짜fetch;
    console.warn = 진짜warn;
    if (진짜키 === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = 진짜키;
  }
}

/* ── A24 · Nominatim 초당 1회를 동시 요청에서도 지킨다 ────────── */
async function a24() {
  console.log('A24 — Nominatim 줄서기');
  /* 카카오가 못 답하는 자리(동해 먼바다)라야 OSM 길로 간다.
     라우트의 한국 상자 안이면서 아무 동네도 안 나오는 자리 — 캐시도 안 남아 몇 번을 돌려도 같다. */
  const 좌표 = () => ({ lat: (35.7 + Math.random() * 0.7).toFixed(5), lng: (130.9 + Math.random() * 0.6).toFixed(5) });

  const t0 = Date.now();
  const 끝난시각 = (await Promise.all(Array.from({ length: 10 }, async () => {
    const { lat, lng } = 좌표();
    await fetch(`${BASE}/api/geo?lat=${lat}&lng=${lng}`).catch(() => {});
    return Date.now() - t0;
  }))).sort((a, b) => a - b);
  const 총초 = (Date.now() - t0) / 1000;
  const 간격 = 끝난시각.slice(1).map((t, i) => t - 끝난시각[i]);
  /* 줄서기는 '보내는 때'를 1.1초씩 벌린다. 밖에서는 '끝난 때'만 보이고 응답이 걸리는 시간이
     제각각이라 한 칸 한 칸을 재면 흔들린다 — 처음과 끝의 폭·평균 간격으로 본다. */
  const 폭 = 끝난시각[끝난시각.length - 1] - 끝난시각[0];
  const 평균간격 = Math.round(폭 / (끝난시각.length - 1));

  ok('새 좌표 10개 동시 → 9초 이상 걸린다', 총초 >= 9, `${총초.toFixed(2)}초`);
  ok('10개가 8.8초 넘게 흩어져 끝난다(한꺼번에 안 나간다)', 폭 >= 8800, `폭 ${(폭 / 1000).toFixed(2)}초`);
  ok('평균 간격이 초당 1회를 지킨다', 평균간격 >= 1000, `평균 ${평균간격}ms · 간격 ${간격.join(', ')}`);

  const t1 = Date.now();
  const one = 좌표();
  await fetch(`${BASE}/api/geo?lat=${one.lat}&lng=${one.lng}`).catch(() => {});
  const 단건초 = (Date.now() - t1) / 1000;
  ok('단건은 줄서기 때문에 느려지지 않는다', 단건초 <= 3, `${단건초.toFixed(2)}초`);
}

/* ── A31 · 국외는 아예 안 내준다 ─────────────────────────────
   전에는 '나라를 함께 실어 주면 위에서 가린다' 였다. 논의60 이 그 가리는 자리를 lib/geo 로
   내렸다 — 이제 lookupRegion 이 국외를 스스로 걸러 `/api/geo` 는 503 을 준다.
   그래서 '대마도의 country 가 jp 인가'는 물음 자체가 없어졌다: 대마도는 답이 안 나온다. */
async function a31() {
  console.log('A31 — 국외 좌표');
  /* 라우트가 한국 상자(위 33~38.7 · 경 124.5~132)로 한 번 거른다. 그런데 그 상자 안에
     쓰시마(일본)가 통째로 들어온다 — 상자만으로는 국외를 못 막는다. 나라 코드가 마지막 증거다. */
  {
    const { res, body } = await 두들기기('/api/geo?lat=34.4021&lng=129.3067');
    ok('쓰시마: 상자 안이어도 고를 수 없다', res.status === 503 && body?.error === 'geo_unavailable',
       `상태 ${res.status} ${body?.error ?? ''}`);
    /* 답을 받고도 고를 자리가 아닌 것이라 기다려도 안 된다 (논의101) */
    ok('쓰시마: 기다려도 안 된다고 말한다', body?.retryable === false, String(body?.retryable));
  }
  {
    const { res, body } = await 두들기기('/api/geo?lat=37.5445&lng=127.0557');
    const c = typeof body?.country === 'string' ? body.country.toLowerCase() : null;
    ok('성수: 응답에 나라 코드가 있다', res.ok && c !== null, `상태 ${res.status} · ${c ?? 'country 없음'}`);
    ok('성수: 나라가 맞다', c === 'kr', c ?? '없음');
  }
  /* 국외는 캐시에도 안 들어간다(lookupRegion 이 저장 전에 거른다) — 다시 물어도 그대로 막힌다.
     '한 번은 통과하고 두 번째부터 막힌다' 같은 자리가 생기면 여기가 빨개진다. */
  const 다시 = await 두들기기('/api/geo?lat=34.4021&lng=129.3067');
  ok('다시 물어도 국외는 그대로 막힌다', 다시.res.status === 503 && !다시.body?.country,
     `상태 ${다시.res.status} · ${다시.body?.country ?? 'country 없음'}`);
}

/* ── A23-2 · Overpass 거울 셋이 다 늘어져도 화면을 붙잡지 않는다 ──
   거울마다 9초씩 기다리면 27초다. 실측에서 mail.ru 가 연달아 부르면 막아 세워
   셋 다 타임아웃 나는 것을 봤다(27.01초) — 전체 시간을 못 박아야 한다. */
async function overpass예산() {
  console.log('A23 — Overpass 전체 시간');
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜키 = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-only-not-a-real-key';
  console.warn = () => {};
  /* 거울이 답을 안 준다 — 끊는 신호가 올 때까지 매달려 있는다(진짜 늘어짐과 같다) */
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('dapi.kakao.com')) return Response.json({ documents: [] });
    if (u.includes('overpass')) return new Promise((_, rej) => {
      init?.signal?.addEventListener('abort',
        () => rej(Object.assign(new Error('시간 초과'), { name: 'TimeoutError' })));
    });
    throw new Error('예상 못한 바깥 호출: ' + u);
  };
  /* AbortSignal.timeout 의 타이머는 이벤트 루프를 붙잡지 않는다 —
     대역 fetch 가 그것만 기다리면 노드가 할 일이 없다고 보고 그냥 끝나 버린다 */
  const 깨움 = setInterval(() => {}, 500);
  try {
    const { placesNear } = await import(PLACES);
    const t0 = Date.now();
    let 던졌나 = false;
    try { await placesNear(37.5445, 127.0557, 300); } catch { 던졌나 = true; }
    const 걸린초 = (Date.now() - t0) / 1000;
    ok('거울이 다 늘어져도 15초 안에 손을 뗀다', 걸린초 <= 15, `${걸린초.toFixed(2)}초`);
    ok('그리고 빈 목록이 아니라 실패로 알린다', 던졌나, 던졌나 ? '던짐' : '빈 목록');
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

/* ── A31-2 · 한국 상자를 lib/geo 에도 둔다 ───────────────────
   입구(app/api/*)에만 있으면 AI 가 만든 좌표나 내부 호출이 그대로 바깥으로 나간다.
   모듈을 직접 불러 '상자 밖이면 한 발짝도 안 나간다'를 본다. */
async function a31lib() {
  console.log('A31 — lib/geo 의 한국 상자');
  const 진짜fetch = globalThis.fetch;
  const 진짜warn = console.warn;
  const 진짜db = process.env.DATABASE_URL;
  /* 모듈이 뜰 때 연결 문자열을 본다. 진짜로 붙지는 않는다 — 아래에서 fetch 를 대신 세운다 */
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgres://x:x@example.invalid/x';
  console.warn = () => {};

  let 바깥 = 0, 캐시 = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('kakao') || u.includes('nominatim')) { 바깥++; return new Response('nope', { status: 500 }); }
    캐시++; throw new Error('캐시 못 붙음');   /* Neon 은 이 시험에서 안 붙는다 */
  };

  try {
    const { lookupRegion } = await import(GEO);
    for (const [이름, lat, lng] of [
      ['도쿄', 35.6812, 139.7671], ['(0,0) 대서양', 0, 0],
      ['베이징', 39.9042, 116.4074], ['위도만 빗나감', 40.5, 127.0],
    ]) {
      바깥 = 0; 캐시 = 0;
      /* 빈손일 때 까닭이 함께 온다 (논의101) — 상자 밖은 물어보지도 않은 것이라 'outside' 다 */
      const r = await lookupRegion(lat, lng);
      ok(`${이름}: 상자 밖은 아무것도 안 부른다`,
         r.hit === null && r.miss === 'outside' && 바깥 === 0 && 캐시 === 0,
         r.hit === null ? `${r.miss} · 바깥 ${바깥}번 · 캐시 ${캐시}번` : `${r.hit.name} 돌려줌`);
    }
    /* 반대 방향 — 상자 안(제주 남단·독도까지)이면 그대로 물어본다 */
    for (const [이름, lat, lng] of [
      ['성수', 37.5445, 127.0557], ['제주 남단', 33.2, 126.5], ['독도', 37.2417, 131.8667],
    ]) {
      바깥 = 0;
      await lookupRegion(lat, lng);
      ok(`${이름}: 상자 안이라 그대로 물어본다`, 바깥 > 0, `바깥 ${바깥}번`);
    }
  } catch (e) {
    ok('lib/geo 를 부를 수 있다', false, String(e?.message ?? e));
  } finally {
    globalThis.fetch = 진짜fetch;
    console.warn = 진짜warn;
    if (진짜db === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = 진짜db;
  }
}

await a23();
await overpass예산();
await a26();
await a24();
await a31();
await a31lib();

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
