/* 환경변수 연결 점검 — 키가 '있는지'가 아니라 '실제로 붙는지' 본다.
   비밀값은 절대 출력하지 않는다. 길이와 앞 4자만 보여준다.

   사용:  node envcheck.js
   전제:  같은 폴더의 .env.local */
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

const ENV = path.join(__dirname, '.env.local');
const env = {};
fs.readFileSync(ENV, 'utf8').split(/\r?\n/).forEach(function (ln) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(ln.trim());
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});

const mask = function (v) {
  if (!v) return '(비어 있음)';
  return v.slice(0, 4) + '…' + '(' + v.length + '자)';
};

const rows = [];
function say(name, ok, detail) {
  rows.push({ name: name, ok: ok, detail: detail });
  console.log('  ' + (ok === true ? '✓' : ok === false ? '✗' : '·') + ' ' +
    name.padEnd(26) + (detail || ''));
}

/* fetch 는 Node 18+ 내장. Norton 이 HTTPS 를 가로채면 인증서 오류가 날 수 있어
   메시지를 그대로 보여 준다(그 자체가 진단이다). */
async function get(url, opt) {
  const c = new AbortController();
  const t = setTimeout(function () { c.abort(); }, 12000);
  try {
    const r = await fetch(url, Object.assign({ signal: c.signal }, opt || {}));
    const text = await r.text();
    return { status: r.status, text: text };
  } finally { clearTimeout(t); }
}

(async function () {
  console.log('\n[1] 키가 있는가 (값은 가립니다)');
  ['DATABASE_URL', 'KAKAO_REST_API_KEY', 'NEXT_PUBLIC_KAKAO_JS_KEY', 'KAKAO_REDIRECT_URI',
   'TMAP_APP_KEY', 'OLLAMA_PRIMARY_URL', 'OLLAMA_PRIMARY_MODEL',
   'OLLAMA_FALLBACK_URL', 'OLLAMA_FALLBACK_MODEL'].forEach(function (k) {
    say(k, !!env[k], mask(env[k]));
  });

  console.log('\n[2] 기능 플래그');
  ['NEXT_PUBLIC_FF_AI_CHAT', 'NEXT_PUBLIC_FF_REALTIME', 'NEXT_PUBLIC_FF_WEATHER', 'NEXT_PUBLIC_FF_PERSONAL']
    .forEach(function (k) { say(k, null, env[k] === '1' ? '켬' : '끔 (' + (env[k] || '없음') + ')'); });

  console.log('\n[3] Neon Postgres — 실제로 붙는가');
  if (!env.DATABASE_URL) { say('DATABASE_URL', false, '없음'); }
  else {
    let u = null;
    try { u = new URL(env.DATABASE_URL); } catch (e) { say('접속 문자열 형식', false, e.message); }
    if (u) {
      const host = u.hostname, port = +(u.port || 5432);
      say('호스트', true, host.replace(/^[^.]+/, '***') + ':' + port);
      /* TLS 핸드셰이크까지만 — 쿼리는 pg 드라이버가 있어야 한다 */
      await new Promise(function (res) {
        const sock = tls.connect({ host: host, port: port, servername: host, timeout: 12000 }, function () {
          say('TLS 연결', true, '핸드셰이크 성공 · ' + (sock.getProtocol() || ''));
          sock.end(); res();
        });
        sock.on('timeout', function () { say('TLS 연결', false, '시간 초과'); sock.destroy(); res(); });
        sock.on('error', function (e) { say('TLS 연결', false, e.code || e.message); res(); });
      });
      let pg = null;
      try { pg = require('pg'); } catch (_) {}
      if (!pg) say('쿼리 실행', null, 'pg 모듈 없음 — 설치하면 SELECT 까지 확인합니다');
      else {
        const cli = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        try {
          await cli.connect();
          const r = await cli.query('select current_database() db, version() v');
          say('쿼리 실행', true, r.rows[0].db + ' · ' + String(r.rows[0].v).split(' ').slice(0, 2).join(' '));
          const t = await cli.query(
            "select table_name from information_schema.tables where table_schema='public' order by 1");
          say('테이블', true, t.rows.length ? t.rows.map(function (x) { return x.table_name; }).join(', ')
                                            : '없음 — db/schema.sql 을 아직 안 돌렸습니다');
          await cli.end();
        } catch (e) { say('쿼리 실행', false, e.message.slice(0, 90)); try { await cli.end(); } catch (_) {} }
      }
    }
  }

  console.log('\n[4] Kakao Local — REST 키로 실제 검색');
  if (!env.KAKAO_REST_API_KEY) say('Kakao Local', false, '키 없음');
  else {
    try {
      const r = await get('https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent('성수동') + '&size=1',
        { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY } });
      if (r.status === 200) {
        const j = JSON.parse(r.text);
        say('Kakao Local', true, 'HTTP 200 · 결과 ' + (j.documents || []).length + '건 · ' +
          ((j.documents || [])[0] || {}).place_name);
      } else say('Kakao Local', false, 'HTTP ' + r.status + ' · ' + r.text.slice(0, 80));
    } catch (e) { say('Kakao Local', false, e.message.slice(0, 90)); }
  }

  console.log('\n[5] Kakao 대중교통 길찾기 — Local 검색과 같은 REST 키');
  /* 2026-07-21 에 카카오가 새로 연 API(대중교통·도보·자전거·정적지도) — 신청·심사 없이
     카카오 디벨로퍼스에서 [카카오맵] 사용 설정만 켜면 KAKAO_REST_API_KEY 그대로 쓴다.
     ⚠ 예전엔 여기서 ODsay 를 쟀었다 — Vercel 배포에서 IP 화이트리스트에 막혀 route_unavailable
     이 났고(실사용 신고), 이 API 로 바꿔 붙였다(lib/routes.ts). ODSAY_API_KEY 는 이제 안 쓴다. */
  if (!env.KAKAO_REST_API_KEY) say('Kakao 대중교통', false, '키 없음(Kakao Local 과 같은 키)');
  else {
    try {
      /* 강남역 → 성수역 */
      const r = await get(
        'https://dapi.kakao.com/v2/routing/publictraffic?start_x=127.027621&start_y=37.497942' +
        '&end_x=127.055961&end_y=37.544581',
        { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY } });
      if (r.status === 200) {
        const j = JSON.parse(r.text);
        const 첫길 = (j.routes || [])[0];
        say('Kakao 대중교통', true, 'HTTP 200 · 안내 ' + (j.routes || []).length + '개 · ' +
          (첫길 ? Math.round(첫길.properties.totalTime / 60) + '분 · ' + 첫길.properties.totalDistance + 'm' : j.status));
      } else say('Kakao 대중교통', false, 'HTTP ' + r.status + ' · ' + r.text.slice(0, 100));
    } catch (e) { say('Kakao 대중교통', false, e.message.slice(0, 90)); }
  }

  console.log('\n[6] TMAP — 자차 경로');
  if (!env.TMAP_APP_KEY) say('TMAP', false, '키 없음');
  else {
    try {
      const r = await get('https://apis.openapi.sk.com/tmap/routes?version=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: env.TMAP_APP_KEY },
        body: JSON.stringify({
          startX: '127.027621', startY: '37.497942',
          endX: '127.055961', endY: '37.544581', reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO'
        })
      });
      if (r.status === 200) {
        const j = JSON.parse(r.text);
        const f = (j.features || [])[0];
        say('TMAP', true, 'HTTP 200 · ' +
          (f && f.properties ? Math.round(f.properties.totalDistance / 100) / 10 + 'km · ' +
            Math.round(f.properties.totalTime / 60) + '분' : '응답 받음'));
      } else say('TMAP', false, 'HTTP ' + r.status + ' · ' + r.text.slice(0, 80));
    } catch (e) { say('TMAP', false, e.message.slice(0, 90)); }
  }

  console.log('\n[7] Ollama — 1순위 · 2순위');
  for (const [label, urlKey, modelKey] of [['1순위', 'OLLAMA_PRIMARY_URL', 'OLLAMA_PRIMARY_MODEL'],
                                            ['2순위', 'OLLAMA_FALLBACK_URL', 'OLLAMA_FALLBACK_MODEL']]) {
    const base = env[urlKey];
    if (!base) { say('Ollama ' + label, null, '주소 없음(의도된 공란일 수 있음)'); continue; }
    /* 주소가 /v1 로 끝나면 OpenAI 호환 경로다 — 그때는 /v1/models 를 물어야 한다.
       (예전엔 /api/tags 만 찔러서 /v1/api/tags → 404 가 났다) */
    const root = base.replace(/\/$/, '');
    const isV1 = /\/v1$/.test(root);
    const url = isV1 ? root + '/models' : root + '/api/tags';
    try {
      const r = await get(url);
      if (r.status === 200) {
        const j = JSON.parse(r.text);
        const names = isV1 ? (j.data || []).map(function (m) { return m.id; })
                           : (j.models || []).map(function (m) { return m.name; });
        const want = env[modelKey];
        say('Ollama ' + label, true, '모델 ' + names.length + '개 · 원하는 모델(' + want + ') ' +
          (names.indexOf(want) >= 0 ? '있음' : '없음 · 있는 것: ' + names.slice(0, 3).join(', ')));
      } else say('Ollama ' + label, false, 'HTTP ' + r.status + ' @ ' + url);
    } catch (e) { say('Ollama ' + label, false, ((e.cause && e.cause.code) || e.message.slice(0, 60)) +
      (/10\.|192\.168|172\./.test(root) ? ' → 사내망 주소라 이 자리에선 안 닿습니다' : '')); }
  }

  const bad = rows.filter(function (r) { return r.ok === false; });
  console.log('\n──────────────────────────────');
  console.log('확인 ' + rows.filter(function (r) { return r.ok === true; }).length +
              ' · 실패 ' + bad.length + ' · 정보 ' + rows.filter(function (r) { return r.ok === null; }).length);
  if (bad.length) { console.log('실패:'); bad.forEach(function (r) { console.log('  · ' + r.name + ' — ' + r.detail); }); }
})();
