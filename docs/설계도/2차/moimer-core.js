/* ============================================================
   moimer core — 화면 11대가 공유하는 것

   · 2단계 부트스트랩 — M.boot() 은 키가 없어도 항상 돈다.
     지도가 필요한 화면에 들어갈 때만 키를 묻는다(게이트).
     예전에는 키가 없으면 IIFE 전체가 return 해 탭바조차 안 만들어졌다.
   · Local / Odsay 접근 계층 · 지도 헬퍼 · 바텀시트 엔진 · 토스트 · 모달 · disposer

   지도 z-index 예산 — 여기서 한 번에 배정한다. 화면이 제 마음대로 숫자를 지어내면
   겹쳤을 때 무엇이 먼저 잡히는지가 화면마다 달라진다.
       1  반경 원              3  장소 미리보기 핀(.ov-poi)
       4  지역 핑 · 지점 후보    5  중간지점(.ov-mid)
       6  확정된 곳             7  출발지 마커
       8  투표 1위             12  지금 포커싱된 출발지
     ※ 출발지 마커(7)가 중간지점 오버레이(5)보다 위여야 한다 —
       끌 수 없는 오버레이가 포인터를 가로채면 핀이 드래그되지 않는다.

   DOM z-index 는 CSS 쪽에 있다: .top/.stagebar 6 · .locate/.explore 7 · .sheet 8 ·
   .tabbar 9 · .rolebar 12 · .statusbar 35 · .island 40 · .modal 44 · .diag 45 · .gate 50
   ============================================================ */
(function (M) {
  'use strict';

  /* ---------------- 잡동사니 ---------------- */
  var $ = M.$ = function (id) { return document.getElementById(id); };

  /* requestAnimationFrame은 탭이 숨겨져 있으면 발화하지 않는다.
     초기 배치가 영영 안 되는 일이 없도록 타이머로 예약한다. */
  M.soon = function (fn) { return setTimeout(fn, 0); };

  /* 기존 화면은 카카오가 준 장소 이름을 그대로 흘려보냈지만,
     ②~⑪ 은 사람이 친 모임 이름·별명을 다룬다 — 반드시 이스케이프한다. */
  M.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  M.on = function (el, ev, fn, opt) {
    if (el) el.addEventListener(ev, fn, opt);
    return function () { if (el) el.removeEventListener(ev, fn, opt); };
  };

  /* ---------------- disposer ----------------
     화면 11대를 자유롭게 오갈 수 있게 되면 타이머와 리스너가 층층이 쌓인다.
     (시뮬 1.8초 인터벌 · AI 경과 카운터 · 슬라이더/토스트/검색 타이머 ·
      마커마다 하나씩 도는 핀 애니메이션 · 오버레이마다 붙은 kakao 리스너)
     그래서 모든 화면은 leave() 에서 자기 자루를 비운다. */
  M.util = {
    disposer: function () {
      var jobs = [];
      return {
        add:   function (fn) { jobs.push(fn); return fn; },
        timer: function (id) { jobs.push(function () { clearTimeout(id); clearInterval(id); }); return id; },
        on:    function (el, ev, fn, opt) { if (el) { el.addEventListener(ev, fn, opt); jobs.push(function () { el.removeEventListener(ev, fn, opt); }); } },
        kakao: function (target, ev, fn) {
          if (!window.kakao || !target) return;
          kakao.maps.event.addListener(target, ev, fn);
          jobs.push(function () { kakao.maps.event.removeListener(target, ev, fn); });
        },
        overlay: function (ov) { if (ov) jobs.push(function () { ov.setMap(null); }); return ov; },
        all: function () { jobs.forEach(function (f) { try { f(); } catch (_) {} }); jobs = []; }
      };
    }
  };

  /* ---------------- 키 ---------------- */
  /* serve.js 가 .env.local 의 공개 키들을 여기에 심어준다 (kakaoJs · odsayWeb).
     서버 없이 열면 없으므로 빈 객체로 받는다. */
  var KEYS = M.KEYS = window.__moimerKeys || {};
  var params = new URLSearchParams(location.search);
  /* 키 출처 우선순위: ?key= → serve.js 주입(.env.local) → localStorage → 게이트 화면. */
  var kakaoKey = params.get('key') || KEYS.kakaoJs || localStorage.getItem('moimer.kakaoJsKey') || '';
  if (params.get('key')) {
    localStorage.setItem('moimer.kakaoJsKey', params.get('key'));
    history.replaceState(null, '', location.pathname + location.hash);
  }

  /* ---------------- Kakao Local 접근 계층 ----------------
     JS SDK의 services는 지도 타일과 별개 쿼터를 쓰는데, 이게 막히면
     status조차 null로 돌아와 원인 파악이 어렵다.
     로컬 서버(/api/local/*)가 REST 키로 대신 호출해주면 그쪽을 쓰고,
     없으면 SDK로 되돌아간다. REST 키는 서버에만 있고 브라우저로 내려오지 않는다.
     — Next.js로 옮길 때 Route Handler가 맡을 역할과 같은 구조. */
  var Local = M.Local = {
    proxy: false,
    /* [추가] 같은 조회를 반복하지 않는다. ⑧ 은 카테고리 탭마다·반경 바꿀 때마다
       다시 부르는데, 캐시가 없으면 반나절 만에 일일 쿼터가 말라
       "전부 ZERO_RESULT" 라는 헷갈리는 상태가 된다. */
    _memo: Object.create(null),
    _get: function (k, run) {
      if (Local._memo[k]) return Local._memo[k];
      var p = run().then(function (r) {
        /* 실패는 캐시하지 않는다 — 키를 고치고 새로고침 없이 다시 되어야 한다 */
        if (r.status === 'ERROR') delete Local._memo[k];
        return r;
      });
      Local._memo[k] = p;
      return p;
    },
    check: function () {
      return fetch('/api/local/health')
        .then(function (r) { return r.json(); })
        .then(function (j) { Local.proxy = !!j.ok; })
        .catch(function () { Local.proxy = false; });
    },
    _req: function (kind, params) {
      return fetch('/api/local/' + kind + '?' + new URLSearchParams(params))
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) return { status: 'ERROR', items: [], error: (j && (j.msg || j.error)) || ('HTTP ' + r.status) };
            var docs = j.documents || [];
            return { status: docs.length ? 'OK' : 'ZERO_RESULT', items: docs };
          });
        })
        .catch(function (e) { return { status: 'ERROR', items: [], error: e.message }; });
    },
    _sdk: function (call) {
      return new Promise(function (res) {
        if (!M.map.ready) { res({ status: 'ERROR', items: [], error: 'SDK 미로딩' }); return; }
        call(function (d, st) {
          var S = kakao.maps.services.Status;
          res({
            status: st === S.OK ? 'OK' : (st === S.ZERO_RESULT ? 'ZERO_RESULT' : 'ERROR'),
            items: st === S.OK ? d : [],
            error: st === S.OK ? null : ('SDK:' + st)
          });
        });
      });
    },
    /* REST와 SDK의 장소 응답은 필드명이 같아 그대로 흘려보낸다
       (place_name · road_address_name · x · y · distance · phone · place_url) */
    /* opt.location(+radius)을 주면 그 좌표 주변으로 좁혀 거리순으로 받는다.
       술집·버스정류장처럼 카테고리 코드가 없는 종류를 이걸로 대신한다. */
    keyword: function (q, opt) {
      opt = opt || {};
      if (Local.proxy) {
        var p = { query: q, size: opt.size || 10 };
        if (opt.category_group_code) p.category_group_code = opt.category_group_code;
        if (opt.location) {
          p.x = opt.location.getLng(); p.y = opt.location.getLat();
          if (opt.radius) p.radius = opt.radius;
          if (opt.sortByDistance) p.sort = 'distance';
        }
        return Local._req('keyword', p);
      }
      return Local._sdk(function (cb) {
        var o = { size: opt.size || 10 };
        if (opt.category_group_code) o.category_group_code = opt.category_group_code;
        if (opt.location) {
          o.location = opt.location;
          if (opt.radius) o.radius = opt.radius;
          if (opt.sortByDistance) o.sort = kakao.maps.services.SortBy.DISTANCE;
        }
        M.map.ps.keywordSearch(q, cb, o);
      });
    },
    address: function (q) {
      if (Local.proxy) return Local._req('address', { query: q, size: 5 });
      return Local._sdk(function (cb) { M.map.geocoder.addressSearch(q, cb); });
    },
    category: function (code, center, radius, size) {
      var k = 'c|' + code + '|' + center.getLat().toFixed(4) + '|' + center.getLng().toFixed(4) + '|' + radius + '|' + (size || 15);
      return Local._get(k, function () {
        if (Local.proxy) return Local._req('category', {
          category_group_code: code, x: center.getLng(), y: center.getLat(),
          radius: radius, sort: 'distance', size: size || 15
        });
        return Local._sdk(function (cb) {
          M.map.ps.categorySearch(code, cb, {
            location: center, radius: radius,
            sort: kakao.maps.services.SortBy.DISTANCE, size: size || 15
          });
        });
      });
    },
    region: function (center) {
      var k = 'r|' + center.getLat().toFixed(5) + '|' + center.getLng().toFixed(5);
      return Local._get(k, function () {
        if (Local.proxy) return Local._req('region', { x: center.getLng(), y: center.getLat() });
        return Local._sdk(function (cb) { M.map.geocoder.coord2RegionCode(center.getLng(), center.getLat(), cb); });
      });
    },
    /* 장소 상세 — 사진·별점·영업시간. 공식 Local API 에는 없어서 serve.js 가
       카카오맵 웹의 내부 엔드포인트를 대신 받아 준다(문서화되지 않은 곳이라
       언제든 막힐 수 있고, 그때는 null 이 와서 화면이 그 줄만 뺀다). */
    detail: function (idOrUrl) {
      var m = String(idOrUrl == null ? '' : idOrUrl).match(/(\d+)\s*$/);
      if (!m) return Promise.resolve(null);
      var id = m[1];
      return Local._get('d|' + id, function () {
        return fetch('/api/place/' + id)
          .then(function (r) {
            if (!r.ok) return { status:'ERROR', items:[], error:'HTTP ' + r.status };
            return r.json().then(function (j) { return { status:'OK', items:[j] }; });
          })
          .catch(function (e) { return { status:'ERROR', items:[], error:e.message }; });
      }).then(function (r) { return r.status === 'OK' ? r.items[0] : null; });
    },

    /* 좌표 → 행정동(H) 문서 하나. ⑥ 의 '동 단위 스냅'이 통째로 이 한 줄에 기댄다.
       code = 행정동 코드(병합 키) · x/y = 그 동의 대표점(스냅 위치) */
    dong: function (center) {
      return Local.region(center).then(function (r) {
        if (r.status !== 'OK' || !r.items.length) return null;
        return r.items.filter(function (x) { return x.region_type === 'H'; })[0] || r.items[0];
      });
    }
  };

  /* ---------------- ODsay 접근 계층 ----------------
     버스정류장은 카카오 장소 DB에 아예 없다 — 카테고리 코드도 없고
     "버스정류장"으로 키워드 검색해도 0건이다. ODsay만이 출처다.

     카카오 REST 키와 달리 프록시를 두지 않고 브라우저에서 직접 부른다.
     ODsay는 키 종류로 호출한 쪽을 구분하기 때문이다 —
     서버 키는 등록된 공인 IP 에서만, 웹 키는 등록된 도메인에서만 통과한다.
     웹 키는 도메인 등록이 보호 수단인 공개 키다 — 카카오 JS 키와 같은 성격이라
     브라우저에 노출돼도 되는 값이고, 그래서 서버가 감출 이유가 없다. */
  var ODSAY_API = 'https://api.odsay.com/v1/api/';
  var ODSAY_PATHS = { stops: 'pointSearch', routes: 'busStationInfo' };
  var Odsay = M.Odsay = {
    ready: false,
    check: function () {
      /* 키 유무만 본다 — 도메인 등록이 안 됐는지는 첫 조회의 error 로 드러난다. */
      Odsay.ready = !!KEYS.odsayWeb;
      return Promise.resolve();
    },
    _req: function (kind, params) {
      var p = new URLSearchParams(params);
      p.set('lang', '0');
      p.set('apiKey', KEYS.odsayWeb);
      return fetch(ODSAY_API + ODSAY_PATHS[kind] + '?' + p)
        .then(function (r) {
          return r.json().then(function (j) {
            /* ODsay 는 인증 실패도 HTTP 200 + error 본문으로 준다 —
               "결과 없음"과 구분되도록 여기서 갈라낸다. */
            if (!r.ok || j.error) {
              var e = j.error && j.error[0];
              return { status: 'ERROR', result: null, error: (e && e.message) || ('HTTP ' + r.status) };
            }
            return { status: 'OK', result: j.result || null };
          });
        })
        .catch(function (e) { return { status: 'ERROR', result: null, error: e.message }; });
    },
    /* stationClass 1 = 버스 (2는 지하철 — 그쪽은 카카오 SW8로 이미 다룬다) */
    stops: function (center, radius) {
      return Odsay._req('stops', {
        x: center.getLng(), y: center.getLat(),
        radius: radius || 500, stationClass: 1
      });
    },
    routes: function (stationID) { return Odsay._req('routes', { stationID: stationID }); }
  };

  /* ODsay 노선 종류 코드 → 화면 라벨·색. 서울 기준 색을 따른다. */
  var BUS_TYPE = {
    1:{ n:'일반', c:'#3d5bab' },  2:{ n:'좌석', c:'#3d5bab' },  3:{ n:'마을', c:'#5eb200' },
    4:{ n:'직행좌석', c:'#c83737' }, 5:{ n:'공항', c:'#aa9872' }, 6:{ n:'간선급행', c:'#c83737' },
    10:{ n:'외곽', c:'#5eb200' }, 11:{ n:'간선', c:'#3d5bab' }, 12:{ n:'지선', c:'#5eb200' },
    13:{ n:'순환', c:'#f99d1c' }, 14:{ n:'광역', c:'#c83737' }, 15:{ n:'급행', c:'#c83737' },
    16:{ n:'관광', c:'#aa9872' }, 21:{ n:'농어촌', c:'#5eb200' }, 22:{ n:'마을', c:'#5eb200' }
  };
  M.busType = function (t) { return BUS_TYPE[t] || { n:'버스', c:'#6b7280' }; };

  /* ---------------- 지도 ---------------- */
  /* 중간지점이 브랜드 블루를 쓰므로 출발지는 블루를 피한다.
     1번 핀이 중간 마커와 같은 색이면 "안 끌리는 핀"으로 오해된다. */
  var COLORS = M.COLORS = ['#e8590c', '#0d9488', '#9333ea', '#e11d48', '#b45309', '#0f766e'];

  /* [추가] 이동수단별 표정속도(km/h)와 승하차·환승 고정 손실(분).
     거리 기준과 시간 기준이 갈라지려면 사람마다 속도가 달라야 한다.
     ODsay 연동 전까지 쓰는 임시 계수. */
  var SPEED = M.SPEED = { '지하철':{ v:32, fix:8 }, '버스':{ v:19, fix:9 }, '자차':{ v:26, fix:5 }, '도보':{ v:4.5, fix:0 } };

  /* [변경] 이동수단을 반영한다 — 버스로 오는 사람은 같은 거리라도 더 걸린다.
     이 차이가 있어야 '시간순' 중간지점이 '거리순'과 다른 답을 낸다. */
  M.estMinutes = function (m, mode) {
    var s = SPEED[mode] || SPEED['지하철'];
    return Math.max(6, Math.round((m / 1000) / s.v * 60) + s.fix);
  };
  M.fmtDist = function (m) { return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm'; };

  /* 출발지 핀 — 34×48. 잡고 있는 동안 핀이 살짝 떠오르고 바닥 그림자는 옅어진다.
     마커는 <img>로 그려져 CSS 트랜지션이 닿지 않고, img로 참조된 SVG 안의 SMIL은
     재생이 보장되지 않는다. 그래서 뜬 높이별 정지 프레임을 미리 만들어
     setImage로 갈아끼운다 — 공개 API만 쓰므로 어디서나 같은 결과가 나온다. */
  var PIN_W = 34, PIN_H = 48, PIN_TIP = 40, PIN_LIFT = 7;
  /* 0 → 1 을 빠르게 시작해 부드럽게 멈추는 간격 (ease-out) */
  var PIN_FRAMES = M.PIN_FRAMES = [0, 0.3, 0.58, 0.79, 0.93, 1];
  M.PIN_STEP_MS = 26;
  var pinCache = [];

  function pinSVG(i, t) {
    var c = COLORS[i % COLORS.length];
    var lift = (PIN_LIFT * t).toFixed(2);
    /* 떠오를수록 그림자는 작고 옅게, 드롭섀도는 깊게 — '공중에 있다'가 읽힌다 */
    var rx = (7 - 2.4 * t).toFixed(2), ry = (2.6 - 0.9 * t).toFixed(2);
    var op = (0.3 - 0.14 * t).toFixed(3);
    var dy = (1.2 + 2.2 * t).toFixed(2), sd = (1.3 + 1.1 * t).toFixed(2);
    var fo = (0.3 + 0.08 * t).toFixed(3);

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + PIN_W + '" height="' + PIN_H + '" ' +
             'viewBox="0 0 ' + PIN_W + ' ' + PIN_H + '">' +
           '<defs><filter id="sd" x="-60%" y="-30%" width="220%" height="180%">' +
             '<feDropShadow dx="0" dy="' + dy + '" stdDeviation="' + sd + '" ' +
               'flood-color="#141827" flood-opacity="' + fo + '"/></filter></defs>' +
           '<ellipse cx="17" cy="42" rx="' + rx + '" ry="' + ry + '" fill="#141827" fill-opacity="' + op + '"/>' +
           '<g filter="url(#sd)" transform="translate(0,-' + lift + ')">' +
             '<path d="M17 41C17 41 31 25.5 31 16.2C31 8.4 24.7 2 17 2S3 8.4 3 16.2C3 25.5 17 41 17 41Z" ' +
               'fill="' + c + '" stroke="#fff" stroke-width="2.6"/>' +
             '<circle cx="17" cy="15.8" r="7.4" fill="#fff"/>' +
             '<text x="17" y="20.2" text-anchor="middle" font-size="11" font-weight="800" ' +
               'font-family="system-ui,sans-serif" fill="' + c + '">' + (i + 1) + '</text>' +
           '</g></svg>';
  }

  /* 프레임을 매번 만들면 data URI를 새로 디코드하느라 깜빡인다 — 한 번만 만들어 둔다 */
  M.pinImage = function (i, frame) {
    var f = frame || 0;
    if (!pinCache[i]) pinCache[i] = [];
    if (!pinCache[i][f]) {
      pinCache[i][f] = new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSVG(i, PIN_FRAMES[f])),
        new kakao.maps.Size(PIN_W, PIN_H),
        { offset: new kakao.maps.Point(PIN_W / 2, PIN_TIP) });
    }
    return pinCache[i][f];
  };

  var readyQueue = [];
  var Map_ = M.map = {
    ready: false, map: null, ps: null, geocoder: null,
    /* 지도 범위를 맞출 때 비워 둘 상단 요소 — 화면마다 다르다(.top / .stagebar) */
    topEl: null,

    whenReady: function (fn) { if (Map_.ready) fn(); else readyQueue.push(fn); },

    LatLng: function (lat, lng) { return new kakao.maps.LatLng(lat, lng); },
    metersBetween: function (a, b) { return Math.round(new kakao.maps.Polyline({ path: [a, b] }).getLength()); },

    /* 지금 화면에 떠 있는 UI만큼 여백을 두고 범위를 맞춘다.
       상단 오버레이·탭바·바텀시트가 상태마다 달라서 고정값을 쓸 수 없다. */
    fitBounds: function (b) {
      if (!Map_.ready) return;
      var device = $('device');
      var el = Map_.topEl;
      var topPad = 68;
      if (el && !el.hidden && device.getAttribute('data-ui') === 'on' && el.offsetHeight) {
        var dr = device.getBoundingClientRect(), er = el.getBoundingClientRect();
        topPad = Math.max(68, Math.round(er.bottom - dr.top) + 12);
      }
      var tabH = (device.getAttribute('data-tabs') === 'on') ? $('tabbar').offsetHeight : 0;
      var botPad = tabH + Sheet.visibleHeight() + 24;
      Map_.map.setBounds(b, topPad, 40, botPad, 40);
    },

    fitTo: function (points) {
      if (!Map_.ready || !points || !points.length) return;
      var b = new kakao.maps.LatLngBounds();
      points.forEach(function (p) { if (p) b.extend(p); });
      Map_.fitBounds(b);
    },

    /* SDK 를 못 불러온 상태. 키가 있어도 도메인 등록이 안 된 포트로 열면 여기로 온다 —
       "키는 있는데 지도는 안 뜬다"를 키 없음과 구분해야 안내 문구가 맞는다. */
    failed: false,

    boot: function () {
      if (!kakaoKey) return false;
      var s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(kakaoKey) + '&libraries=services&autoload=false';
      s.onerror = function () { failGate('SDK를 불러오지 못했습니다. 키가 맞는지, 네트워크가 되는지 확인해 주세요.'); };
      s.onload = function () { window.kakao.maps.load(initMap); };
      document.head.appendChild(s);
      return true;
    },
    hasKey: function () { return !!kakaoKey; }
  };

  function initMap() {
    Map_.map = new kakao.maps.Map($('map'), { center: new kakao.maps.LatLng(37.4966, 127.0246), level: 8 });
    Map_.ps = new kakao.maps.services.Places();
    Map_.geocoder = new kakao.maps.services.Geocoder();
    Map_.ready = true;

    /* 프록시 가용 여부를 먼저 확인한 뒤 화면이 첫 조회를 시작하게 한다 */
    Promise.all([Local.check(), Odsay.check()]).then(function () {
      console.info('[moimer] Kakao Local 경로:', Local.proxy ? '로컬 서버 프록시(REST 키)' : 'JS SDK services');
      console.info('[moimer] ODsay(버스정류장):', Odsay.ready ? '웹 키로 직접 호출' : '꺼짐 — ODSAY_WEB_KEY 없음');
      M.showDiag();
      var q = readyQueue; readyQueue = [];
      q.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    });
  }

  /* ---------------- 게이트 ---------------- */
  /* [변경] 키가 없다고 앱 전체를 세우지 않는다 — 지도가 필요한 화면에 들어갈 때만 묻는다.
     ②③④⑤⑪ 은 키 0개로 끝까지 볼 수 있어야 한다. */
  var SKIP_KEY = 'moimer.skipKey';
  M.gate = {
    skipped: function () { return localStorage.getItem(SKIP_KEY) === '1'; },
    show: function () {
      var g = $('gate');
      g.classList.add('on');
      $('keyInput').focus();
    },
    hide: function () { $('gate').classList.remove('on'); },
    /* 지도 화면에 들어가도 되는가 — 키가 살아 있거나, 사용자가 "키 없이 둘러보기"를 골랐거나 */
    ok: function () { return (Map_.hasKey() && !Map_.failed) || M.gate.skipped(); }
  };
  function failGate(msg) {
    Map_.failed = true;
    var g = $('gate');
    /* SDK 실패는 스크립트 로딩이 끝난 뒤에야 온다 — 그 사이 사용자가 이미
       page 화면(②③④⑤⑪)에 있을 수 있다. 지도가 필요 없는 자리에서
       "지도를 열지 못했어요"가 화면을 덮어버리면 안 된다. */
    if ($('device').getAttribute('data-layer') === 'map') g.classList.add('on');
    g.querySelector('h2').textContent = '지도를 열지 못했어요';
    g.querySelector('p').innerHTML = msg +
      '<br><br>키가 맞는데도 이 화면이 나오면 <b>도메인 등록</b>을 확인해 주세요 — ' +
      '카카오는 <b>포트까지</b> 봅니다. 지금 주소는 <code>' + location.origin + '</code> 입니다.';
  }

  /* 검색·중간지점 이름이 안 나오는 이유를 화면에서 바로 알 수 있게 한다.
     file:// 로 열면 지도 타일은 뜨지만 Local API만 막혀서 "지도는 되는데
     검색만 안 되는" 상태가 되는데, 원인을 짐작하기 어렵다. */
  M.showDiag = function () {
    var el = $('diag');
    if (!el || Local.proxy) return;
    var isFile = location.protocol === 'file:';
    el.innerHTML =
      '<button type="button" aria-label="닫기">✕</button>' +
      (isFile
        ? '<b>파일을 직접 열었어요.</b> 이렇게 열면 지도는 보이지만 ' +
          '<b>검색·주변 장소·중간지점 이름이 동작하지 않습니다.</b><br>' +
          '터미널에서 <code>node mockups/serve.js</code> 를 실행하고 ' +
          '<code>http://localhost:3000</code> 으로 열어 주세요.'
        : '<b>로컬 서버 프록시에 연결하지 못했어요.</b><br>' +
          '현재 주소: <code>' + location.origin + '</code><br>' +
          '<code>node mockups/serve.js</code> 가 실행 중인지, ' +
          '<code>mockups/.env.local</code> 에 REST 키가 있는지 확인해 주세요.');
    el.classList.add('on');
    el.querySelector('button').addEventListener('click', function () { el.classList.remove('on'); });
  };

  /* 클립보드 API 는 보안 컨텍스트에서만 있다 — localhost 는 되지만 그렇지 않은 곳도 있다.
     ④ 초대 링크 · ⑥~⑨ 초대 · ⑩ 카톡 알리기가 같은 길을 쓴다. */
  M.copy = function (text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { M.toast(okMsg || '복사했어요'); },
        function () { M.toast('복사가 막혀 있어요 — 주소를 직접 선택해 주세요'); });
    } else {
      M.toast('이 브라우저에서는 복사가 안 돼요 — 주소를 직접 선택해 주세요');
    }
  };

  /* ---------------- 토스트 ---------------- */
  var toastTimer = null;
  M.toast = function (msg) {
    var t = $('focusToast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  };

  /* ---------------- 바텀시트 ----------------
     [변경] hidden 스냅 + page 레이어 대응.
     mode: browse | clean | detail | flow
       flow = ⑥⑦⑧⑨⑩ — 시트가 상시 존재하고, 지도를 탭하면 hidden 이 아니라 mini 로 접힌다. */
  var SNAPS = { hidden:0, mini:0, peek:0, half:0, full:0 };
  var current = 'hidden', offset = 0, ready = false;

  var Sheet = M.sheet = {
    mode: 'browse',
    SNAPS: SNAPS,
    get current() { return current; },
    get offset() { return offset; },
    get ready() { return ready; },
    visibleHeight: function () { return ready ? Math.max(0, $('sheet').offsetHeight - offset) : 0; },
    layout: layout,
    go: go,
    snapOrder: snapOrder,
    placeLocate: placeLocate,
    /* 화면을 옮길 때 시트를 원점으로 돌린다 */
    reset: function () { Sheet.mode = 'browse'; $('sheetMini').innerHTML = ''; $('sheetMini').style.display = 'none'; $('sheetBody').innerHTML = ''; go('hidden', false); }
  };

  function layout() {
    var device = $('device'), sheet = $('sheet'), handle = $('handle'), miniEl = $('sheetMini');
    /* [가드] page 레이어에서는 시트를 재지 않는다.
       숨긴 시트의 offsetHeight 를 재려 들면 아래 재시도 분기가 32ms 마다 영원히 돈다. */
    if (device.getAttribute('data-layer') === 'page') { ready = true; return; }
    var h = device.clientHeight, sh = sheet.offsetHeight;
    if (h < 200 || sh < 100) { setTimeout(layout, 32); return; }
    var tabH = (device.getAttribute('data-tabs') === 'on') ? $('tabbar').offsetHeight : 0;
    var avail = h - tabH;
    sheet.style.bottom = tabH + 'px';
    SNAPS.hidden = sh + 10;                              /* browse: 화면 밖으로 완전히 */
    /* [변경] 최소 스냅은 '닫힘'이 아니라 핸들 + 요약 한 줄만 남기는 높이 */
    SNAPS.mini = sh - (handle.offsetHeight + (miniEl.offsetHeight || 60));
    SNAPS.peek = sh - Math.round(avail * 0.30);
    SNAPS.half = sh - Math.round(avail * 0.55);
    SNAPS.full = sh - Math.round(avail * 0.90);
    ready = true;
    go(current, false);
  }

  /* detail·flow 에서는 mini가 바닥, browse에서는 hidden만 쓴다 */
  function snapOrder() {
    if ($('device').getAttribute('data-layer') === 'page') return ['hidden'];
    return (Sheet.mode === 'detail' || Sheet.mode === 'flow') ? ['mini','peek','half','full'] : ['hidden'];
  }

  function go(name, animate) {
    if (!ready) return;
    if ($('device').getAttribute('data-layer') === 'page' && name !== 'hidden') name = 'hidden';
    var sheet = $('sheet'), handle = $('handle');
    current = name; offset = SNAPS[name];
    sheet.classList.toggle('animate', animate !== false);
    sheet.style.transform = 'translateY(' + offset + 'px)';
    handle.setAttribute('aria-expanded', (name === 'hidden' || name === 'mini') ? 'false' : 'true');
    $('handleHint').textContent =
      name === 'mini' ? '위로 올리면 자세히' :
      name === 'full' ? '아래로 끌어 접기' : '아래로 내리면 요약만 남아요';
    placeLocate();
    if (name === 'mini') $('sheetBody').scrollTop = 0;
  }

  function placeLocate() {
    var device = $('device');
    var tabH = (device.getAttribute('data-tabs') === 'on') ? $('tabbar').offsetHeight : 0;
    var visible = $('sheet').offsetHeight - offset;
    /* 시트가 닫혀 있으면 홈 인디케이터 위쪽에 여유 있게 */
    var bottom = (visible <= 0) ? tabH + 30 : tabH + visible + 12;
    $('locate').style.bottom = bottom + 'px';
    /* 아래에서부터 현위치 → 탐색 → 토스트 순으로 쌓는다 */
    var exBottom = bottom + 46 + 10;                    /* 버튼 지름 + 간격 */
    $('explore').style.bottom = exBottom + 'px';
    $('focusToast').style.bottom = (exBottom + 56) + 'px';
  }

  var sd = null;
  function sStart(e) {
    if (!ready) return;
    sd = { id:e.pointerId, sy:e.clientY, o:offset };
    $('sheet').classList.remove('animate');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function sMove(e) {
    if (!sd || e.pointerId !== sd.id) return;
    var order = snapOrder();
    var floor = SNAPS[order[0]];                 /* detail·flow 면 mini가 바닥 */
    offset = Math.max(SNAPS.full - 24, Math.min(floor, sd.o + (e.clientY - sd.sy)));
    $('sheet').style.transform = 'translateY(' + offset + 'px)';
    placeLocate();
  }
  function sEnd(e) {
    if (!sd || e.pointerId !== sd.id) return;
    sd = null;
    var best = snapOrder()[0], bd = Infinity;
    snapOrder().forEach(function (k) {
      var d = Math.abs(SNAPS[k] - offset);
      if (d < bd) { bd = d; best = k; }
    });
    go(best, true);
  }

  /* 시트 조작은 화면과 무관하게 늘 같으므로 한 번만 묶는다 */
  M.sheet.bind = function () {
    var handle = $('handle'), sheetBody = $('sheetBody');
    handle.addEventListener('pointerdown', sStart);
    handle.addEventListener('pointermove', sMove);
    handle.addEventListener('pointerup', sEnd);
    handle.addEventListener('pointercancel', sEnd);
    handle.addEventListener('keydown', function (e) {
      var order = snapOrder(), i = Math.max(0, order.indexOf(current));
      if (e.key === 'ArrowUp')   { e.preventDefault(); go(order[Math.min(order.length - 1, i + 1)], true); }
      if (e.key === 'ArrowDown') { e.preventDefault(); go(order[Math.max(0, i - 1)], true); }
      if (e.key === 'Escape')    { e.preventDefault(); if (Sheet.onEscape) Sheet.onEscape(); }
    });
    /* [추가] PC: 핸들 위에서 휠로 스냅 단계 이동 */
    handle.addEventListener('wheel', function (e) {
      if (!ready || snapOrder().length < 2) return;
      e.preventDefault();
      var order = snapOrder(), i = Math.max(0, order.indexOf(current));
      go(order[e.deltaY < 0 ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)], true);
    }, { passive: false });

    /* [변경] 마우스에서도 시트 본문을 끌어 내릴 수 있게 (기존에는 터치 전용) */
    var bd2 = null;
    sheetBody.addEventListener('pointerdown', function (e) {
      if (sheetBody.scrollTop > 0) return;
      bd2 = { id:e.pointerId, sy:e.clientY, armed:false };
    });
    sheetBody.addEventListener('pointermove', function (e) {
      if (!bd2 || e.pointerId !== bd2.id) return;
      var dy = e.clientY - bd2.sy;
      if (!bd2.armed) {
        if (dy > 12 && sheetBody.scrollTop <= 0) { bd2.armed = true; sStart({ pointerId:e.pointerId, clientY:e.clientY, currentTarget:sheetBody }); }
        else if (dy < -6) bd2 = null;
        return;
      }
      sMove(e);
    });
    function bEnd(e) { if (!bd2 || e.pointerId !== bd2.id) return; if (bd2.armed) sEnd(e); bd2 = null; }
    sheetBody.addEventListener('pointerup', bEnd);
    sheetBody.addEventListener('pointercancel', bEnd);

    window.addEventListener('resize', layout);
    M.soon(layout);
  };

  /* ---------------- 모달 ----------------
     동점 · AI · 삭제 확인 · 반경 확장. 포커스 트랩까지 여기서 한 번만 만든다. */
  var moPrev = null, moClose = null;
  M.modal = {
    open: function (o) {
      var box = $('modalBox'), wrap = $('modal');
      var acts = o.actions || [];
      box.innerHTML =
        '<h2 class="mo-title" id="modalTitle">' + M.esc(o.title) + '</h2>' +
        (o.text ? '<p class="mo-text">' + o.text + '</p>' : '') +
        (o.html || '') +
        (acts.length
          ? '<div class="ctarow">' + acts.map(function (a, i) {
              return '<button class="cta' + (a.kind === 'primary' ? '' : ' secondary') + '" type="button" data-act="' + i + '">' + M.esc(a.label) + '</button>';
            }).join('') + '</div>'
          : '');
      wrap.className = 'modal on' + (o.cls ? ' ' + o.cls : '');
      wrap.setAttribute('aria-labelledby', 'modalTitle');
      moPrev = document.activeElement;
      moClose = o.onclose || null;

      Array.prototype.forEach.call(box.querySelectorAll('[data-act]'), function (b) {
        b.addEventListener('click', function () {
          var a = acts[+b.getAttribute('data-act')];
          /* 기본은 닫고 실행 — 닫지 않으려면 keepOpen 을 준다 */
          if (!a.keepOpen) M.modal.close(true);
          if (a.fn) a.fn();
        });
      });
      if (o.onrender) o.onrender(box);
      var first = box.querySelector('button, [tabindex]');
      if (first) first.focus();
      return box;
    },
    close: function (silent) {
      var wrap = $('modal');
      if (!wrap.classList.contains('on')) return;
      wrap.classList.remove('on');
      $('modalBox').innerHTML = '';
      var cb = moClose; moClose = null;
      if (moPrev && moPrev.focus) { try { moPrev.focus(); } catch (_) {} }
      moPrev = null;
      if (cb && !silent) cb();
    },
    isOpen: function () { return $('modal').classList.contains('on'); },
    bind: function () {
      var wrap = $('modal');
      /* 배경 탭으로 닫기 — 취소와 같은 뜻이므로 onclose 가 돈다 */
      wrap.addEventListener('pointerdown', function (e) { if (e.target === wrap) M.modal.close(); });
      document.addEventListener('keydown', function (e) {
        if (!M.modal.isOpen()) return;
        if (e.key === 'Escape') { e.preventDefault(); M.modal.close(); return; }
        if (e.key !== 'Tab') return;
        /* 포커스 트랩 — 모달 밖으로 탭이 새어 나가지 않게 */
        var f = $('modalBox').querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  };

  /* ---------------- 장소 상세 시트 ----------------
     ① 탐색 모드와 ⑧ 지점 후보가 같은 화면을 쓴다 — 둘 다 "이 가게가 어떤 곳인가"를
     같은 순서로 읽어야 한다. 아래 CTA 만 다르다(카카오맵 열기 / 후보로 추가).

     [변경] 이름 밑 태그 줄(.pmeta)을 없앴다. 분류·거리·도보가 알약 세 개로 흩어져
     있었는데, 사진과 별점이 들어오면서 위쪽이 시끄러워졌다.
     거리·도보는 버리지 않고 아래 정보 줄로 내렸다 — 모일 자리를 고를 때 실제로 보는 값이다. */
  M.place = {
    /* p = 카카오 Local 문서 · d = M.Local.detail 결과(없으면 null) */
    html: function (p, d, opt) {
      opt = opt || {};
      var dist = +p.distance || 0;
      var lastCat = (p.category_name || '').split('>').pop().trim();
      var h = '';

      if (d && d.photos && d.photos.length) {
        h += '<div class="pl-photos" role="group" aria-label="장소 사진">' +
          d.photos.slice(0, 6).map(function (u) {
            return '<img src="' + M.esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
          }).join('') + '</div>';
      }

      h += '<h2 class="headline" style="margin-bottom:6px">' + M.esc(p.place_name) + '</h2>';

      if (d && d.rating) {
        h += '<div class="pl-rate"><span class="star" aria-hidden="true">★</span>' +
             '<b>' + d.rating.toFixed(1) + '</b>' +
             '<span class="cnt">리뷰 ' + d.reviewCount + '</span>' +
             (lastCat ? '<span class="cat">' + M.esc(lastCat) + '</span>' : '') + '</div>';
      } else if (lastCat) {
        h += '<div class="pl-rate"><span class="cat">' + M.esc(lastCat) + '</span>' +
             (d ? '<span class="cnt">별점 없음</span>' : '') + '</div>';
      }

      h += '<div class="kv" style="margin-top:12px">';
      /* [추가] 영업시간이 있으면 주소 위에 — 갈 수 있는 시간인지가 주소보다 먼저 궁금하다 */
      if (d && (d.hoursToday || d.hoursNow)) {
        h += '<div class="kv-row"><span class="k">영업시간</span>' +
             '<span class="v pl-hours">' + M.esc(d.hoursToday || '—') +
             (d.hoursNow ? '<em data-open="' + (/영업 중/.test(d.hoursNow) ? '1' : '0') + '">' +
                           M.esc(d.hoursNow) + (d.hoursInfo ? ' · ' + M.esc(d.hoursInfo) : '') + '</em>' : '') +
             '</span></div>';
      }
      h += '<div class="kv-row"><span class="k">주소</span>' +
           '<span class="v" style="font-weight:600;text-align:right">' +
           M.esc(p.road_address_name || p.address_name || '—') + '</span></div>';
      if (p.phone) h += '<div class="kv-row"><span class="k">전화</span><span class="v">' + M.esc(p.phone) + '</span></div>';
      if (dist) {
        h += '<div class="kv-row"><span class="k">' + M.esc(opt.from || '중간지점') + '에서</span>' +
             '<span class="v">' + M.fmtDist(dist) + ' · 도보 약 ' + M.estMinutes(dist, '도보') + '분</span></div>';
      }
      h += '</div>';
      return h;
    },

    /* 카카오맵·전화 버튼은 어디서 열든 같다 */
    actions: function (p) {
      return '<div class="ctarow" style="margin-top:13px">' +
        '<button class="cta secondary" type="button" data-url="' + M.esc(p.place_url || '') + '">카카오맵에서 열기</button>' +
        (p.phone ? '<button class="cta secondary" type="button" data-tel="' + M.esc(p.phone) + '">전화</button>' : '') +
        '</div>';
    },
    bind: function (box) {
      var u = box.querySelector('[data-url]');
      if (u) u.addEventListener('click', function () {
        var v = u.getAttribute('data-url');
        window.open(v || 'https://map.kakao.com/', '_blank', 'noopener');
      });
      var t = box.querySelector('[data-tel]');
      if (t) t.addEventListener('click', function () { location.href = 'tel:' + t.getAttribute('data-tel'); });
    }
  };

  /* ---------------- 공용 부품 ---------------- */
  M.ui = {
    /* 세그먼티드 컨트롤 — ③ 기본 이동수단 · ④ 확정 범위 · ⑤ 이동수단이 함께 쓴다 */
    seg: function (opts, value, onpick) {
      var el = document.createElement('div');
      el.className = 'seg';
      el.setAttribute('role', 'group');
      opts.forEach(function (o) {
        var v = (typeof o === 'string') ? o : o.v;
        var label = (typeof o === 'string') ? o : o.label;
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-pressed', v === value ? 'true' : 'false');
        b.addEventListener('click', function () {
          value = v;
          Array.prototype.forEach.call(el.children, function (c, k) {
            var cv = (typeof opts[k] === 'string') ? opts[k] : opts[k].v;
            c.setAttribute('aria-pressed', cv === v ? 'true' : 'false');
          });
          if (onpick) onpick(v);
        });
        el.appendChild(b);
      });
      return el;
    },

    /* 검색 결과 한 줄 — ① 출발지 추가 · ③ 기본 출발지 · ④⑤ 출발지가 함께 쓴다 */
    rowHTML: function (icon, name, addr, tail) {
      return '<span class="ic">' + icon + '</span>' +
             '<span style="min-width:0"><span class="nm">' + M.esc(name) + '</span>' +
             (addr ? '<span class="ad">' + M.esc(addr) + '</span>' : '') + '</span>' +
             '<span class="add">' + (tail || '＋ 추가') + '</span>';
    },

    /* 여러 화면이 "출발지를 검색해 고르는" 같은 일을 한다 — 한 번만 만든다.
       input 에 붙이고, 고르면 {nm,lat,lng,ad} 로 돌려준다. */
    placePicker: function (input, panel, onpick, dis) {
      var timer = null, seq = 0;
      function close() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); }
      function open()  { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); }
      function run(q) {
        var my = ++seq;
        Promise.all([
          Local.address(q),
          Local.keyword(q, { category_group_code: 'SW8', size: 4 }),
          Local.keyword(q, { size: 5 })
        ]).then(function (r) {
          if (my !== seq) return;
          var seen = Object.create(null), flat = [], html = '';
          [{ h:'지역', i:'🗺️', r:r[0], addr:1 }, { h:'지하철역', i:'🚇', r:r[1] }, { h:'장소', i:'📍', r:r[2] }]
            .forEach(function (g) {
              var rows = (g.r.items || []).map(function (x) {
                return g.addr
                  ? { nm:x.address_name, ad:'행정구역', lat:+x.y, lng:+x.x }
                  : { nm:x.place_name, ad:x.road_address_name || x.address_name || '', lat:+x.y, lng:+x.x };
              }).filter(function (x) { if (seen[x.nm]) return false; seen[x.nm] = 1; return true; }).slice(0, 4);
              if (!rows.length) return;
              html += '<div class="sp-head">' + g.h + '</div>';
              rows.forEach(function (x) {
                html += '<button class="sp-row" type="button" data-p="' + flat.length + '">' +
                        M.ui.rowHTML(g.i, x.nm, x.ad, '고르기') + '</button>';
                flat.push(x);
              });
            });
          if (!flat.length) {
            html = '<div class="sp-empty">"' + M.esc(q) + '" 검색 결과가 없어요.<br>' +
                   (Local.proxy || M.map.ready ? '지역이나 역 이름으로 다시 검색해 보세요.'
                                               : '카카오 키가 없어 검색이 꺼져 있어요 — 직접 입력해도 됩니다.') + '</div>';
          }
          panel.innerHTML = html;
          open();
          Array.prototype.forEach.call(panel.querySelectorAll('[data-p]'), function (b) {
            b.addEventListener('click', function () {
              var x = flat[+b.getAttribute('data-p')];
              input.value = x.nm; close(); onpick(x);
            });
          });
        });
      }
      var bag = dis || { on: function (el, ev, fn) { el.addEventListener(ev, fn); } };
      bag.on(input, 'input', function () {
        clearTimeout(timer);
        var v = input.value.trim();
        if (!v) { close(); onpick(null); return; }
        timer = setTimeout(function () { run(v); }, 280);
      });
      bag.on(input, 'keydown', function (e) {
        if (e.key === 'Escape') { close(); }
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); var v = input.value.trim(); if (v) run(v); }
      });
      bag.on(document, 'pointerdown', function (e) {
        if (!panel.hidden && !panel.contains(e.target) && e.target !== input) close();
      }, true);
      return { close: close };
    },

    /* 두 자리 시:분 · D-n 같은 잔심부름 */
    pad2: function (n) { return (n < 10 ? '0' : '') + n; }
  };

  /* ---------------- 부트 ---------------- */
  M.boot = function () {
    /* .then() 안에서 난 예외는 아무 데도 안 나타난다 — 화면만 조용히 비어 있게 된다.
       목업에서 그 침묵은 디버깅을 몇 배로 늘린다. */
    window.addEventListener('unhandledrejection', function (e) {
      console.error('[moimer] 처리되지 않은 오류:', e.reason);
    });
    $('originHint').textContent = location.origin;

    $('keySave').addEventListener('click', function () {
      var v = $('keyInput').value.trim(); if (!v) return;
      localStorage.setItem('moimer.kakaoJsKey', v); location.reload();
    });
    $('keyInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('keySave').click(); });
    $('gateSkip').addEventListener('click', function () {
      localStorage.setItem(SKIP_KEY, '1');
      M.gate.hide();
      M.router.reenter();
    });

    M.sheet.bind();
    M.modal.bind();
    Map_.boot();
    /* 키가 없어도 라우터는 돈다 — 이게 이 파일이 존재하는 이유의 절반이다 */
    M.router.start();
  };

})(window.MOIMER = window.MOIMER || {});
