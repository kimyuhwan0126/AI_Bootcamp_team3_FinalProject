/* 목업 확인용 정적 서버 + Kakao Local API 프록시.
 *
 * 카카오 지도 JS SDK는 등록된 도메인에서만 동작하므로 file:// 로는 열 수 없다.
 * 그리고 REST API 키는 서버 전용 비밀키라 브라우저에 넣으면 안 되므로,
 * 검색 요청만 이 서버가 대신 받아 Authorization 헤더를 붙여 전달한다.
 * (Next.js로 옮길 때 Route Handler가 하게 될 역할과 같다)
 *
 * 반대로 카카오 JS 키와 ODsay 웹 키는 브라우저에서 쓰는 공개 키다 —
 * 숨길 수 있는 값이 아니고 콘솔의 도메인 등록이 보호 수단이다.
 * 열 때마다 손으로 입력하지 않도록 HTML에 심어서 내려준다.
 *
 * 실행: node mockups/serve.js  →  http://localhost:3000/moimer-app-kakao.html
 *       --open 을 붙이면 준비된 뒤 브라우저를 알아서 연다 (start.cmd 가 쓴다)
 * 키   : 환경변수 또는 mockups/.env.local (git에 올라가지 않음)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const OPEN = process.argv.includes('--open');

/* 서버가 실제로 듣기 시작한 뒤에 열어야 "연결할 수 없음" 화면을 안 본다.
   그래서 listen 콜백에서만 부른다 — .cmd 에서 미리 열면 타이밍이 어긋난다. */
function openBrowser() {
  const url = 'http://localhost:' + PORT + '/';
  const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
    : process.platform === 'darwin' ? 'open "' + url + '"'
    : 'xdg-open "' + url + '"';
  exec(cmd, (e) => {
    if (e) console.log('브라우저를 열지 못했습니다 — 직접 열어 주세요: ' + url);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function loadKey(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = txt.match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+?)\\s*$', 'm'));
    if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
  } catch (_) { /* 파일 없음 */ }
  return '';
}
const REST_KEY = loadKey('KAKAO_REST_API_KEY');

/* 브라우저로 내려보내는 키들. 둘 다 요청 주소에 실려 나가는 공개 키라서 숨길 수 없고,
   실제 방어선은 각 콘솔의 도메인 등록이다 (카카오: 플랫폼 > Web, ODsay: 웹 키 도메인).
   HTML 을 내려줄 때 심어주면 열 때마다 화면에서 입력할 필요가 없어진다. */
const CLIENT_KEYS = {
  kakaoJs: loadKey('KAKAO_JS_KEY'),
  odsayWeb: loadKey('ODSAY_WEB_KEY'),
};

const LOCAL_PATHS = {
  keyword: '/v2/local/search/keyword.json',
  address: '/v2/local/search/address.json',
  category: '/v2/local/search/category.json',
  region: '/v2/local/geo/coord2regioncode.json',
};

/* ── 장소 상세(사진·별점·영업시간) ────────────────────────────────
 * 공식 Local API(위 LOCAL_PATHS)는 이름·주소·전화·좌표까지만 준다.
 * 사진·별점·영업시간은 카카오맵 웹이 쓰는 내부 엔드포인트에만 있다.
 *
 * ⚠ 문서화되지 않은 내부 API 다. 'pf: web' 헤더가 없으면 406 을 뱉고,
 *   예고 없이 모양이 바뀌거나 막힐 수 있다. 그래서
 *     · 응답을 그대로 흘리지 않고 여기서 필요한 네 가지만 뽑아 고정된 모양으로 바꾸고
 *     · 실패하면 200 + 빈 값으로 돌려보내 화면이 조용히 그 줄만 빼도록 한다.
 *   (순서도의 '별점순(카카오 웹)' 이 가리키는 것도 이 출처다)
 * CORS 때문에 브라우저에서 직접 못 부르므로 서버가 대신 받는다.
 */
const PLACE_HOST = 'place-api.map.kakao.com';

function normPlace(j) {
  const out = { rating: null, reviewCount: 0, photos: [], hoursNow: '', hoursInfo: '', hoursToday: '', hoursWeek: [] };
  const sc = j.kakaomap_review && j.kakaomap_review.score_set;
  if (sc && sc.average_score) {
    out.rating = sc.average_score;
    out.reviewCount = sc.review_count || 0;
  }
  const ph = (j.photos && j.photos.photos) || [];
  /* 카카오는 http 로 준다 — 그대로 쓰면 https 페이지에서 혼합 콘텐츠로 막힌다 */
  out.photos = ph.slice(0, 8)
    .map((p) => String(p.url || '').replace(/^http:/, 'https:'))
    .filter(Boolean);

  const oh = j.open_hours || {};
  if (oh.headline) {
    out.hoursNow = oh.headline.display_text || '';
    out.hoursInfo = oh.headline.display_text_info || '';
  }
  const days = ((((oh.week_from_today || {}).week_periods || [])[0] || {}).days) || [];
  out.hoursWeek = days.map((d) => ({
    d: d.day_of_the_week_desc || '',
    t: (d.on_days && d.on_days.start_end_time_desc)
       || (d.off_days && (d.off_days.desc || d.off_days.start_end_time_desc))
       || '휴무',
    today: !!d.is_highlight,
  }));
  const today = out.hoursWeek.filter((x) => x.today)[0];
  out.hoursToday = today ? today.t : '';
  return out;
}

function proxyPlace(id, res) {
  if (!/^\d+$/.test(id)) { sendJSON(res, 400, { error: 'bad id' }); return; }
  const req = https.request({
    host: PLACE_HOST,
    path: '/places/panel3/' + id,
    method: 'GET',
    headers: {
      pf: 'web',                       /* 이게 없으면 406 이다 */
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://place.map.kakao.com/',
    },
  }, (up) => {
    let buf = '';
    up.setEncoding('utf8');
    up.on('data', (c) => { buf += c; });
    up.on('end', () => {
      if (up.statusCode !== 200) {
        console.warn('[place ' + id + '] ' + up.statusCode);
        sendJSON(res, 200, normPlace({}));           /* 화면은 그 줄만 빼면 된다 */
        return;
      }
      try { sendJSON(res, 200, normPlace(JSON.parse(buf))); }
      catch (e) { sendJSON(res, 200, normPlace({})); }
    });
  });
  req.on('error', () => sendJSON(res, 200, normPlace({})));
  req.end();
}

/* ODsay 프록시는 두지 않는다 — ODsay 는 키 종류로 호출한 쪽을 구분해서,
   서버 키는 등록된 공인 IP 에서만 통과한다. 개발 PC 의 공인 IP 는 수시로 바뀌므로
   localhost:3000 을 등록한 웹 키를 브라우저에 심어 직접 부르게 한다.
   (버스정류장 호출은 moimer-app-kakao.html 의 Odsay 계층이 맡는다) */

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function proxyLocal(kind, query, res) {
  const apiPath = LOCAL_PATHS[kind];
  if (!apiPath) { sendJSON(res, 404, { error: 'unknown kind: ' + kind }); return; }
  if (!REST_KEY) { sendJSON(res, 503, { error: 'no_rest_key' }); return; }

  const req = https.request({
    host: 'dapi.kakao.com',
    path: apiPath + (query ? '?' + query : ''),
    method: 'GET',
    headers: { Authorization: 'KakaoAK ' + REST_KEY },
  }, (up) => {
    let buf = '';
    up.setEncoding('utf8');
    up.on('data', (c) => { buf += c; });
    up.on('end', () => {
      res.writeHead(up.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
      if (up.statusCode >= 400) console.warn('[local ' + kind + '] ' + up.statusCode + ' ' + buf.slice(0, 200));
    });
  });
  req.on('error', (e) => sendJSON(res, 502, { error: e.message }));
  req.end();
}

const server = http.createServer((req, res) => {
  const [rawPath, query] = req.url.split('?');
  const url = decodeURIComponent(rawPath);

  if (url === '/api/local/health') {
    sendJSON(res, 200, { ok: !!REST_KEY });
    return;
  }
  if (url.startsWith('/api/local/')) {
    proxyLocal(url.slice('/api/local/'.length), query || '', res);
    return;
  }
  if (url.startsWith('/api/place/')) {
    proxyPlace(url.slice('/api/place/'.length), res);
    return;
  }

  const rel = url === '/' ? '/moimer-app-kakao.html' : url;
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('없는 파일: ' + rel);
      return;
    }
    const ext = path.extname(file);
    /* 페이지 스크립트보다 먼저 실행되어야 하므로 </head> 앞에 넣는다.
       '<' 는 이스케이프한다 — 키 안에 </script> 가 생겨 태그가 닫히는 일을 막는다. */
    let body = buf;
    if (ext === '.html' && (CLIENT_KEYS.kakaoJs || CLIENT_KEYS.odsayWeb)) {
      const json = JSON.stringify(CLIENT_KEYS).replace(/</g, '\\u003c');
      body = buf.toString('utf8').replace('</head>',
        '<script>window.__moimerKeys=' + json + ';</script>\n</head>');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
});

/* 런처를 두 번 눌렀을 때 빨간 스택트레이스 대신 브라우저만 열어준다 —
   이미 떠 있는 서버가 그대로 쓸모 있으므로 실패가 아니다. */
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(PORT + '번 포트에 이미 목업 서버가 떠 있습니다 — 브라우저만 엽니다.');
  if (OPEN) openBrowser();
});

server.listen(PORT, () => {
  console.log('moimer 목업 서버 → http://localhost:' + PORT + '/moimer-app-kakao.html');
  console.log(REST_KEY
    ? 'Kakao Local 프록시: 사용 (REST 키 로드됨)'
    : 'Kakao Local 프록시: 꺼짐 — mockups/.env.local 에 KAKAO_REST_API_KEY 를 넣으면 켜집니다');
  console.log(CLIENT_KEYS.kakaoJs
    ? 'Kakao JS 키: 주입됨 (입력 화면 생략)'
    : 'Kakao JS 키: 없음 — mockups/.env.local 에 KAKAO_JS_KEY 를 넣으면 입력 화면이 사라집니다');
  console.log(CLIENT_KEYS.odsayWeb
    ? 'ODsay 웹 키: 주입됨 (버스정류장·노선) — ODsay 앱에 도메인 localhost:' + PORT + ' 등록 필요'
    : 'ODsay 웹 키: 없음 — mockups/.env.local 에 ODSAY_WEB_KEY 를 넣으면 정류장이 켜집니다');
  if (OPEN) {
    console.log('\n이 창을 닫으면 서버가 멈춥니다.');
    openBrowser();
  }
});
