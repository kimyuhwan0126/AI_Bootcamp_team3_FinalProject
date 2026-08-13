/* ============================================================
   ① 홈 — 중간지점 맛보기 (탐색 탭)

   로그인 없이 출발지를 넣어보고 중간지점을 확인하는 화면.
   여기서 '이 출발지들로 모임 만들기'를 누르면 ④ 생성으로 넘어가고,
   지금 찍어 둔 출발지들이 그대로 따라간다.

   화면 상태 3가지
     browse : 검색바 + 출발지 슬라이더 + 현위치 + 탭바   (시트 없음)
     clean  : 현위치만                                   (지도 한 번 탭)
     detail : 바텀시트 + 현위치                          (마커·카드 탭, 탭바 숨김)

   · 소요시간은 직선거리 기반 추정 — ODsay 연동 전까지의 임시값
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$;
  var device, slider, cslider, exploreBtn, locate, miniEl, sheetBody, qEl, panel;

  var SEED = [
    { nm:'강남역',    lat:37.497942, lng:127.027621, who:'나',   mode:'지하철' },
    { nm:'홍대입구역', lat:37.557192, lng:126.925381, who:'민서', mode:'버스'   },
    { nm:'판교역',    lat:37.394776, lng:127.111211, who:'현우', mode:'지하철' }
  ];
  /* [변경] 탐색 카테고리.
     카카오 카테고리 코드가 있는 것은 code로, 없는 것(술집·버스정류장)은
     키워드 검색에 좌표·반경을 실어 대신한다. 술집은 FD6 하위 분류라
     코드가 따로 없고, 버스정류장은 아예 카테고리 목록에 없다. */
  var CATS = [
    { label:'카페',   ic:'☕',  code:'CE7',      radius:1000 },
    { label:'음식점', ic:'🍽️', code:'FD6',      radius:1000 },
    { label:'술집',   ic:'🍺',  kw:'술집',        radius:1200 },
    { label:'주차장', ic:'🅿️', code:'PK6',      radius:900  },
    /* 버스정류장은 카카오 장소 DB에 아예 없다 — 카테고리 코드도, 키워드로도
       안 나온다("버스"로 치면 상호에 버스가 든 가게가 나올 뿐이다).
       그래서 이 종류만 ODsay를 출처로 쓴다. */
    { label:'정류장', ic:'🚏',  odsay:true,      radius:600  },
    { label:'역',     ic:'🚇',  code:'SW8',      radius:1600 }
  ];

  var midOv = null, origins = [], pois = [];
  var sel = { type:'overview', i:-1 };
  var cat = '카페';
  /* [추가] 탐색 모드 — 중간지점 주변을 카테고리로 훑어보는 상태 */
  var exploreOn = false;
  var midName = '중간지점', midRegion = '';
  var nameSeq = 0, poiSeq = 0, kwSeq = 0;
  var focusIdx = 0, sliderTimer = null, searchTimer = null;
  /* [변경] 출발지 칩 터치 단계 — 1 지도 포커싱 · 2 시트 열림 · 3 시트 숨김 */
  var tapChip = -1, tapStage = 0;
  var stats = { mid:null, dists:[], mins:[], avg:0, max:0 };
  /* [추가] 중간지점 기준 — 'dist' 거리 기준 · 'time' 이동시간 기준 */
  var midBasis = 'dist';
  var focusMode = 0;   /* 0 아직 없음 · 1 첫 출발지 기준 · 2 전체 기준 */

  var built = false, dis = null;
  var HKEY = 'moimer.searchHistory';

  /* ---------------- 화면 상태 ---------------- */
  function setMode(next) {
    M.sheet.mode = next;
    device.setAttribute('data-ui',   next === 'browse' ? 'on' : 'off');
    device.setAttribute('data-tabs', next === 'browse' ? 'on' : 'off');
    if (next !== 'detail') {
      sel = { type:'overview', i:-1 };
      /* 시트가 다른 경로(지도 탭·뒤로)로 닫혔으면 칩은 '포커싱만 된' 상태로
         되돌린다 — 다음 탭이 다시 시트를 연다. */
      if (tapChip >= 0) tapStage = 1;
      pois.forEach(function (p) { p.el.classList.remove('sel'); });
      if (midOv) midOv.midEl.classList.remove('sel');
      M.sheet.go('hidden', true);
    }
    M.soon(M.sheet.layout);
  }
  function openDetail(type, i) {
    sel = { type: type, i: (i === undefined ? -1 : i) };
    /* 지도의 핀을 직접 눌러 들어온 경우에도 칩 순환 단계를 맞춰 둔다 —
       그래야 그 다음 칩 탭이 '시트 숨김'으로 이어진다. */
    if (type === 'origin') {
      tapChip = sel.i; tapStage = 2; focusIdx = sel.i;
      Array.prototype.forEach.call(slider.children, function (el, k) { el.classList.toggle('on', k === sel.i); });
    } else { tapChip = -1; tapStage = 0; }
    pois.forEach(function (p, k) { p.el.classList.toggle('sel', type === 'place' && k === sel.i); });
    midOv.midEl.classList.toggle('sel', type === 'mid');
    renderSheet();
    setModeDetail();
    raiseFocusedPin();
    if (type === 'place' && pois[sel.i]) M.map.map.panTo(pois[sel.i].ov.getPosition());
    if (type === 'origin' && origins[sel.i]) M.map.map.panTo(origins[sel.i].pos);
  }
  function setModeDetail() {
    M.sheet.mode = 'detail';
    /* [변경] 출발지 시트는 검색창·출발지 목록을 가리지 않는다 —
       다른 출발지를 더 검색하거나 비교하려면 위 목록이 계속 보여야 한다.
       탐색 모드에서도 마찬가지로 카테고리 줄과 검색창이 계속 떠 있어야
       핀 → 정보 → 다른 종류로 이어서 훑을 수 있다. */
    device.setAttribute('data-ui', (sel.type === 'origin' || exploreOn) ? 'on' : 'off');
    device.setAttribute('data-tabs', 'off');
    /* layout()은 current 스냅을 다시 적용한다. 먼저 half로 바꿔두지 않으면
       hidden이 재적용되면서 방금 연 시트가 도로 닫힌다. */
    M.soon(function () { M.sheet.go('half', false); M.sheet.layout(); M.sheet.go('half', true); });
  }

  /* ---------------- [추가] 중간지점 기준 탐색 모드 ----------------
     중간지점 말풍선이나 오른쪽 핀 버튼으로 들어온다.
     상단은 출발지 목록 대신 카테고리 줄이 되고, 검색창은 출발지 추가가 아니라
     장소 검색으로 바뀐다. 지도의 주인공이 '누가 어디서 오나'에서
     '거기서 뭘 할까'로 넘어가는 단계. */
  function enterExplore(silent) {
    if (!stats.mid) { M.toast('출발지를 2곳 이상 넣어 주세요'); return; }
    exploreOn = true;
    device.setAttribute('data-explore', 'on');
    exploreBtn.setAttribute('aria-pressed', 'true');
    syncSearchbar();
    /* [변경] 들어오자마자 종류를 고르지 않는다.
       예전에는 카페가 자동으로 켜져 핀 15개가 곧장 떨어졌는데, 그러면
       (1) 고르지도 않은 조회로 호출이 나가고 (2) 지도가 처음부터 덮여
       "여기서 뭘 고르라는 건지"가 안 읽힌다. 종류를 누르는 것이 첫 동작이 되게 한다. */
    cat = null;
    renderCats();
    clearPois();
    setMode('browse');
    M.map.map.panTo(stats.mid);
    if (!silent) M.toast('종류를 골라 ' + midName + ' 주변을 살펴보세요');
  }

  function exitExplore() {
    exploreOn = false;
    device.setAttribute('data-explore', 'off');
    exploreBtn.setAttribute('aria-pressed', 'false');
    syncSearchbar();
    closePanel();
    setMode('browse');
    /* [변경] 장소 아이콘은 탐색 모드에서만 남긴다 — 출발지 화면의 지도는
       '누가 어디서 오나'만 보여줘야 한다(P1 조용한 지도). */
    clearPois();
    M.toast('출발지 화면으로');
  }

  /* 검색창의 역할이 모드에 따라 달라진다 — 문구도 같이 바꿔야
     "여기에 뭘 치는 자리인지"가 어긋나지 않는다. */
  function syncSearchbar() {
    if (exploreOn) {
      qEl.placeholder = '장소를 검색하세요';
      qEl.setAttribute('aria-label', '장소 검색');
    } else {
      qEl.placeholder = '출발지 지역을 검색하세요';
      qEl.setAttribute('aria-label', '출발지 지역 검색');
    }
    qEl.value = '';
  }

  /* [변경] 고른 종류를 한 번 더 누르면 선택이 풀리고 핀이 사라진다.
     지도를 비워 지형을 보고 싶을 때 모드를 나갈 필요가 없다. */
  function renderCats() {
    cslider.innerHTML = '';
    CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ccard';
      b.setAttribute('aria-pressed', c.label === cat ? 'true' : 'false');
      b.innerHTML = '<span aria-hidden="true">' + c.ic + '</span>' + c.label;
      b.addEventListener('click', function () {
        var off = (cat === c.label);
        cat = off ? null : c.label;
        renderCats();
        /* 핀이 사라지면 그 핀을 가리키던 시트도 의미가 없다 */
        if (M.sheet.mode === 'detail' && sel.type === 'place') setMode('browse');
        if (off) { clearPois(); M.toast(c.label + ' 끄기'); }
        else searchNearby(stats.mid);
      });
      cslider.appendChild(b);
    });
  }

  /* ---------------- 지도 ---------------- */
  function build() {
    var map = M.map.map;

    midOv = new kakao.maps.CustomOverlay({ zIndex: 5, yAnchor: 1, xAnchor: 0.5 });
    var el = document.createElement('div');
    el.className = 'ov-mid';
    el.innerHTML = '<div class="bubble">계산 중…</div><div class="stem"></div><div class="dot"></div>';
    /* [변경] 중간지점 오버레이는 말풍선(간략 정보)이든 핀이든 어디를 눌러도
       중간지점 바텀시트를 연다. 탐색 모드로는 오른쪽 핀 버튼이나
       시트 안의 '주변 탐색'으로 들어간다. */
    el.addEventListener('click', function (e) { e.stopPropagation(); openDetail('mid'); });
    midOv.setContent(el); midOv.midEl = el;

    SEED.forEach(function (o) { addOrigin(o, false); });
    built = true;
    fitAll();
    recompute();
  }

  function addOrigin(o, refit) {
    if (origins.length >= 6) { M.toast('목업에서는 출발지를 최대 6곳까지 넣을 수 있어요'); return; }
    var i = origins.length;
    var pos = new kakao.maps.LatLng(o.lat, o.lng);
    /* zIndex는 중간 오버레이(5)보다 위. 겹쳤을 때 끌 수 없는 중간 마커가
       포인터를 가로채면 첫 출발지가 드래그되지 않는다. */
    var marker = new kakao.maps.Marker({ position: pos, map: M.map.map, draggable: true, image: M.pinImage(i), zIndex: 7, title: o.nm });
    var rec = { data: o, marker: marker, pos: pos };
    origins.push(rec);

    /* [추가] 잡고 있는 동안 핀을 띄운다 — 끌리는 중이라는 걸 손끝으로 확인할
       유일한 단서다. 뗄 때 반드시 되돌려 뜬 채로 남지 않게 한다. */
    kakao.maps.event.addListener(marker, 'dragstart', function () { setPinLifted(rec, true); });
    kakao.maps.event.addListener(marker, 'drag', function () { rec.pos = marker.getPosition(); recompute(true); });
    kakao.maps.event.addListener(marker, 'dragend', function () {
      setPinLifted(rec, false);
      rec.pos = marker.getPosition(); reverseName(rec); recompute();
    });
    /* 데스크톱에서는 올려놓기만 해도 '집을 수 있다'가 보이게 */
    kakao.maps.event.addListener(marker, 'mouseover', function () { setPinLifted(rec, true); });
    kakao.maps.event.addListener(marker, 'mouseout',  function () { setPinLifted(rec, false); });
    kakao.maps.event.addListener(marker, 'click', function () { openDetail('origin', origins.indexOf(rec)); });

    if (refit) fitAll();
    renderSlider(); raiseFocusedPin();
  }

  /* 프레임을 순서대로 갈아끼워 뜨고 내려앉는 동작을 만든다.
     이미 그 방향으로 가고 있으면 새로 시작하지 않는다(같은 상태 재생 방지). */
  function setPinLifted(rec, on) {
    if (rec.lifted === on) return;
    rec.lifted = on;
    clearInterval(rec.animTimer);
    var i = origins.indexOf(rec);
    if (i < 0) return;
    rec.frame = rec.frame || 0;
    rec.animTimer = setInterval(function () {
      rec.frame += on ? 1 : -1;
      if (rec.frame <= 0 || rec.frame >= M.PIN_FRAMES.length - 1) {
        rec.frame = on ? M.PIN_FRAMES.length - 1 : 0;
        clearInterval(rec.animTimer);
        rec.animTimer = null;
      }
      rec.marker.setImage(M.pinImage(i, rec.frame));
    }, M.PIN_STEP_MS);
  }

  /* [추가] 핀이 겹쳐 있으면 위에 있는 마커가 포인터를 가져간다.
     지금 선택(포커싱)된 출발지의 핀을 항상 맨 위로 올려, 겹친 자리에서도
     보고 있던 출발지가 먼저 잡히게 한다. */
  function raiseFocusedPin() {
    /* 시트가 실제로 열려 있을 때만 sel을 믿는다. 닫힌 뒤에도 sel이 남아 있으면
       칩을 옮겨도 이전 출발지의 핀이 계속 위에 있게 된다. */
    var top = (M.sheet.mode === 'detail' && sel.type === 'origin' && origins[sel.i]) ? sel.i : focusIdx;
    origins.forEach(function (o, i) { o.marker.setZIndex(i === top ? 12 : 7); });
  }

  function reverseName(rec) {
    M.Local.dong(rec.pos).then(function (d) {
      if (!d) return;
      rec.data.nm = d.region_3depth_name || d.region_2depth_name || rec.data.nm;
      renderSlider(); renderSheet();
    });
  }

  function fitAll() {
    if (!origins.length) return;
    var pts = origins.map(function (o) { return o.pos; });
    if (stats.mid) pts.push(stats.mid);
    M.map.fitTo(pts);
  }

  /* ---------------- [변경] 중간지점 — 기준 두 가지 ----------------
     둘 다 결정론적 알고리즘이다. 투표 대상이 되려면 누가 언제 계산해도
     같은 답이 나와야 하므로 이 부분은 AI로 대체하지 않는다. */

  /* 거리순 — 무게중심. 모두의 거리 합이 가장 작은 지점에 가깝다. */
  function midByDistance() {
    var la = 0, ln = 0;
    origins.forEach(function (o) { la += o.pos.getLat(); ln += o.pos.getLng(); });
    return new kakao.maps.LatLng(la / origins.length, ln / origins.length);
  }

  /* 시간순 — '가장 오래 걸리는 사람'의 시간을 가장 작게 만드는 지점(미니맥스).
     공평성 지표가 "가장 오래 걸리는 사람 기준 N분"이므로 그 값을 직접 줄인다.
     무게중심에서 시작해 격자 폭을 절반씩 줄여가며 국소 탐색한다 — 볼록 문제라
     이 방식으로도 실용적인 정밀도(수십 m)까지 안정적으로 수렴한다. */
  function midByTime() {
    /* 표시용 estMinutes는 분 단위로 반올림돼 값이 계단처럼 평평해진다.
       그대로 쓰면 탐색이 평지에서 멈추므로 최적화에는 반올림 전 값을 쓴다. */
    function worst(p) {
      var w = 0;
      for (var i = 0; i < origins.length; i++) {
        var s = M.SPEED[origins[i].data.mode] || M.SPEED['지하철'];
        var t = (M.map.metersBetween(origins[i].pos, p) / 1000) / s.v * 60 + s.fix;
        if (t > w) w = t;
      }
      return w;
    }
    var best = midByDistance(), bw = worst(best);
    var step = 0.06;                       /* 약 6km에서 시작 */
    var DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (var round = 0; round < 14; round++) {
      var moved = false;
      for (var d = 0; d < DIRS.length; d++) {
        var c = new kakao.maps.LatLng(best.getLat() + DIRS[d][0] * step,
                                      best.getLng() + DIRS[d][1] * step);
        var w = worst(c);
        if (w < bw) { best = c; bw = w; moved = true; }
      }
      if (!moved) step /= 2;               /* 더 나아지지 않으면 보폭을 줄인다 */
    }
    return best;
  }

  function midpoint() { return midBasis === 'time' ? midByTime() : midByDistance(); }
  function basisLabel() { return midBasis === 'time' ? '시간순' : '거리순'; }

  function recompute(light) {
    if (!built) return;
    /* [변경] 출발지가 2곳 미만이면 중간지점을 없애고 핀만 남긴다 */
    if (origins.length < 2) {
      midOv.setMap(null); clearPois();
      stats = { mid:null, dists:[], mins:[], avg:0, max:0 };
      focusMode = 0; locate.removeAttribute('data-focus');
      renderSlider(); syncExploreBtn();
      if (!light) renderSheet();
      return;
    }
    var mid = midpoint();
    stats.mid = mid;
    stats.dists = origins.map(function (o) { return M.map.metersBetween(o.pos, mid); });
    stats.mins = origins.map(function (o, i) { return M.estMinutes(stats.dists[i], o.data.mode); });
    stats.avg = Math.round(stats.mins.reduce(function (a, b) { return a + b; }, 0) / stats.mins.length);
    stats.max = Math.max.apply(null, stats.mins);

    midOv.setPosition(mid); midOv.setMap(M.map.map);
    midOv.midEl.querySelector('.bubble').textContent = midName + ' · 평균 ' + stats.avg + '분';
    renderSlider(); syncExploreBtn();
    if (light) return;
    nameMidpoint(mid); searchNearby(mid); renderSheet();
  }

  function nameMidpoint(mid) {
    var seq = ++nameSeq;
    M.Local.category('SW8', mid, 2000, 1).then(function (r) {
      if (seq !== nameSeq) return null;
      if (r.status === 'OK' && r.items.length) midName = r.items[0].place_name.replace(/\s*\d*번출구$/, '');
      else if (r.status === 'ERROR') console.warn('[moimer] 중간지점 이름 조회 실패:', r.error);
      return M.Local.dong(mid);
    }).then(function (doc) {
      if (seq !== nameSeq || doc === null || doc === undefined) return;
      if (doc) midRegion = doc.address_name;
      midOv.midEl.querySelector('.bubble').textContent = midName + ' · 평균 ' + stats.avg + '분';
      renderSlider(); renderSheet();
    });
  }

  function catConf(label) {
    return CATS.filter(function (c) { return c.label === label; })[0] || null;
  }

  /* [추가] 지도에 장소 핀 하나를 올린다. */
  function addPoi(d, conf, idx) {
    var ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(+d.y, +d.x), zIndex: 3 });
    var el = document.createElement('div');
    el.className = 'ov-poi';
    el.textContent = conf.ic; el.title = d.place_name;
    el.addEventListener('click', function (e) { e.stopPropagation(); openDetail('place', idx); });
    ov.setContent(el); ov.setMap(M.map.map);
    pois.push({ data: d, ov: ov, el: el, ic: conf.ic, cat: conf.label });
  }

  function searchNearby(mid) {
    /* [변경] 장소 핀은 탐색 모드에서, 종류가 켜져 있을 때만 존재한다.
       출발지 화면에서는 그릴 이유도 부를 이유도 없다(호출 수 = 비용). */
    if (!exploreOn || !cat) { clearPois(); return; }
    if (!mid) return;
    var conf = catConf(cat);
    if (!conf) { clearPois(); return; }
    var seq = ++poiSeq;
    if (conf.odsay) { searchStops(mid, conf, seq); return; }
    /* 카테고리 코드가 있으면 category 검색, 없으면 좌표를 실은 키워드 검색 */
    var req = conf.code
      ? M.Local.category(conf.code, mid, conf.radius, 15)
      : M.Local.keyword(conf.kw, { location: mid, radius: conf.radius, sortByDistance: true, size: 15 });

    req.then(function (r) {
      if (seq !== poiSeq) return;
      clearPois();
      if (r.status !== 'OK') {
        if (r.status === 'ERROR') console.warn('[moimer] 주변 장소 조회 실패:', cat, r.error);
        renderSheet(); return;
      }
      r.items.slice(0, 15).forEach(function (d, i) {
        /* 키워드 검색은 반경 밖 결과가 섞여 오기도 해 거리를 직접 채운다 */
        if (d.distance === undefined || d.distance === '') {
          d.distance = String(M.map.metersBetween(mid, new kakao.maps.LatLng(+d.y, +d.x)));
        }
        addPoi(d, conf, i);
      });
      renderSheet();
    });
  }

  /* [추가] 버스정류장 — ODsay 응답을 카카오 장소와 같은 모양으로 맞춰
     시트·핀 코드가 출처를 몰라도 되게 한다. */
  function searchStops(mid, conf, seq) {
    if (!M.Odsay.ready) {
      clearPois(); renderSheet();
      M.toast('ODsay 키가 없어 정류장을 못 불러와요');
      console.warn('[moimer] ODsay 웹 키가 없습니다 — mockups/.env.local 의 ODSAY_WEB_KEY 확인');
      return;
    }
    M.Odsay.stops(mid, conf.radius).then(function (r) {
      if (seq !== poiSeq) return;
      clearPois();
      if (r.status !== 'OK') {
        console.warn('[moimer] 정류장 조회 실패:', r.error);
        M.toast('정류장을 불러오지 못했어요');
        renderSheet(); return;
      }
      var list = (r.result && r.result.station) || [];
      /* 같은 이름이 양방향으로 두 번 나온다 — 정류장 번호(arsID)로만 중복을 거른다 */
      var seen = Object.create(null);
      list = list.filter(function (s) {
        var k = s.arsID || s.stationID;
        if (seen[k]) return false;
        seen[k] = 1; return true;
      });
      list.forEach(function (s) {
        s._dist = M.map.metersBetween(mid, new kakao.maps.LatLng(+s.y, +s.x));
      });
      list.sort(function (a, b) { return a._dist - b._dist; });

      list.slice(0, 15).forEach(function (s, i) {
        addPoi({
          place_name: s.stationName,
          category_name: '교통 > 버스정류장',
          address_name: '', road_address_name: '',
          x: s.x, y: s.y, distance: String(s._dist),
          /* 정류장 전용 정보 — 노선은 시트를 열 때 따로 불러온다 */
          stop: { id: s.stationID, ars: s.arsID, central: s.busOnlyCentralLane === 1 }
        }, conf, i);
      });
      renderSheet();
    });
  }
  function clearPois() { pois.forEach(function (p) { p.ov.setMap(null); }); pois = []; }

  /* ---------------- [변경] 출발지 슬라이더 ---------------- */
  /* [변경] 같은 칩을 반복해서 누르면 3단계로 순환한다.
       1번째 — 지도만 그 출발지로 포커싱 (시트 없음)
       2번째 — 바텀시트 열림 (검색창·출발지 목록은 그대로 남는다)
       3번째 — 시트가 아래로 밀려 사라짐 → 다음 탭이면 다시 2번째로 */
  function focusOrigin(i) {
    focusIdx = i;
    Array.prototype.forEach.call(slider.children, function (el, k) { el.classList.toggle('on', k === i); });
    M.map.map.panTo(origins[i].pos);
    raiseFocusedPin();
  }

  function chipTap(i) {
    if (tapChip !== i) {
      /* 다른 사람으로 옮기면 열려 있던 시트는 접고 1번째 단계부터 다시 시작한다 */
      if (M.sheet.mode === 'detail') setMode('browse');
      tapChip = i; tapStage = 1; focusOrigin(i); return;
    }
    if (tapStage === 1) { tapStage = 2; openDetail('origin', i); return; }
    if (tapStage === 2) {                 /* 3번째 — 시트만 내려 감춘다 */
      tapStage = 3;
      sel = { type:'overview', i:-1 };
      M.sheet.mode = 'browse';
      device.setAttribute('data-ui', 'on');
      device.setAttribute('data-tabs', 'on');
      M.sheet.go('hidden', true);
      M.soon(M.sheet.layout);
      focusOrigin(i);
      return;
    }
    tapStage = 2; openDetail('origin', i);
  }

  function renderSlider() {
    var keep = slider.scrollLeft;
    slider.innerHTML = '';
    origins.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ocard' + (i === focusIdx ? ' on' : '');
      b.style.setProperty('--c', M.COLORS[i % M.COLORS.length]);
      b.innerHTML = '<span class="badge">' + (i + 1) + '</span>' + M.esc(o.data.nm) +
                    ' <span class="mt">· ' + M.esc(o.data.mode) + '</span>';
      b.addEventListener('click', function () { chipTap(i); });
      slider.appendChild(b);
    });
    slider.scrollLeft = keep;
  }

  /* ---------------- 시트 내용 ---------------- */

  /* [추가] 최소 정보 바 — 시트를 끝까지 내려도 남는 한 줄 */
  function renderMini() {
    var h = '';
    if (sel.type === 'origin' && origins[sel.i]) {
      var o = origins[sel.i];
      h = '<span class="ic" style="--c:' + M.COLORS[sel.i % M.COLORS.length] + '">' + (sel.i + 1) + '</span>' +
          '<span class="nm">' + M.esc(o.data.nm) + '</span>' +
          (stats.mid
            ? '<span class="rt"><span class="t">약 ' + stats.mins[sel.i] + '분</span>' +
              '<span class="d">' + M.fmtDist(stats.dists[sel.i]) + '</span></span>'
            : '<span class="rt"><span class="d">출발지 1곳</span></span>');
    } else if (sel.type === 'place' && pois[sel.i]) {
      var p = pois[sel.i];
      h = '<span class="ic plain">' + p.ic + '</span>' +
          '<span class="nm">' + M.esc(p.data.place_name) + '</span>' +
          '<span class="rt"><span class="t">' + M.fmtDist(+p.data.distance) + '</span>' +
          '<span class="d">중간지점에서</span></span>';
    } else if (sel.type === 'mid') {
      h = '<span class="ic" style="--c:var(--brand)">중</span>' +
          '<span class="nm">' + M.esc(midName) + '</span>' +
          '<span class="rt"><span class="t">평균 ' + stats.avg + '분</span>' +
          '<span class="d">최대 ' + stats.max + '분</span></span>';
    }
    miniEl.innerHTML = h;
    miniEl.style.display = h ? 'flex' : 'none';
  }

  /* [추가] 정류장 노선 목록 — 시트를 열 때 그 정류장만 따로 불러온다.
     정류장 15곳의 노선을 미리 다 받아오면 호출 수가 15배가 된다. */
  function laneHTML(poi) {
    var st = poi.data.stop;
    if (st.error) return '<div class="note">노선 정보를 불러오지 못했어요.<br>' + M.esc(st.error) + '</div>';
    if (!st.lanes) return '<div class="note">노선 불러오는 중…</div>';
    if (!st.lanes.length) return '<div class="note">등록된 노선이 없어요.</div>';
    return '<div class="lanes">' + st.lanes.map(function (l) {
      var t = M.busType(l.type);
      return '<div class="lane">' +
        '<span class="no" style="--bc:' + t.c + '">' + M.esc(l.busNo) + '</span>' +
        '<span class="mid"><span class="ty">' + t.n + (l.busCityName ? ' · ' + M.esc(l.busCityName) : '') + '</span>' +
        '<span class="dir">' + M.esc(l.busDirectionName ? l.busDirectionName + ' 방향' : (l.busStartPoint || '') + ' → ' + (l.busEndPoint || '')) + '</span></span>' +
        /* busInterval 은 "13" 처럼 분 단위 숫자로 오지만 "2회" 같은 값도 섞여 온다 —
           숫자일 때만 '분'을 붙인다(그러지 않으면 "2회분 간격"이 된다) */
        '<span class="tm">' + (l.busInterval
          ? (/^\d+$/.test(String(l.busInterval).trim()) ? l.busInterval + '분 간격' : M.esc(l.busInterval) + ' 간격')
          : '') +
        (l.busFirstTime ? '<span>' + M.esc(l.busFirstTime) + '–' + M.esc(l.busLastTime) + '</span>' : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* [추가] 사진·별점·영업시간은 시트를 열 때 그 장소만 따로 부른다 —
     핀 15개를 미리 다 받으면 호출이 15배가 된다(정류장 노선과 같은 이유). */
  function loadDetail(poi) {
    if (poi.detail || poi.detailLoading) return;
    poi.detailLoading = true;
    M.Local.detail(poi.data.place_url || poi.data.id).then(function (d) {
      poi.detailLoading = false;
      poi.detail = d || { photos: [], rating: null };
      if (sel.type === 'place' && pois[sel.i] === poi) renderSheet();
    });
  }

  function loadLanes(poi) {
    var st = poi.data.stop;
    if (!st || st.lanes || st.loading) return;
    st.loading = true;
    M.Odsay.routes(st.id).then(function (r) {
      st.loading = false;
      if (r.status !== 'OK') {
        st.error = r.error || '알 수 없는 오류';
        console.warn('[moimer] 노선 조회 실패:', st.ars, r.error);
      } else {
        st.lanes = (r.result && r.result.lane) || [];
        /* ODsay 는 도/구/동을 여기서만 준다 — 위치 줄을 이때 채운다 */
        var d = r.result || {};
        var addr = [d['do'], d.gu, d.dong].filter(Boolean).join(' ');
        if (addr) poi.data.address_name = addr;
      }
      /* 그 사이 다른 걸 골랐으면 다시 그리지 않는다 */
      if (sel.type === 'place' && pois[sel.i] === poi) renderSheet();
    });
  }

  function renderSheet() {
    if (M.router.name !== 'home') return;
    renderMini();
    var html = '';
    if (sel.type === 'origin' && origins[sel.i]) {
      var o = origins[sel.i], m = stats.mins[sel.i], d = stats.dists[sel.i];
      html =
        '<p class="eyebrow"><button class="back" type="button" data-back="1">‹</button> 출발지 ' + (sel.i + 1) + ' · ' + M.esc(o.data.who) + '</p>' +
        '<h2 class="headline">' + M.esc(o.data.nm) + '</h2>' +
        (stats.mid
          ? '<p class="subline">' + M.esc(midName) + '까지 직선 <b>' + M.fmtDist(d) + '</b> · 약 <b>' + m + '분</b>' +
            (m === stats.max ? ' · 이 모임에서 가장 오래 걸려요' : '') + '</p>'
          : '<p class="subline">출발지가 <b>한 곳뿐</b>이라 중간지점을 계산할 수 없어요.<br>위에서 지역을 검색해 한 곳 더 넣어보세요.</p>') +
        '<div class="ctarow"><button class="cta" type="button" data-center="1">지도에서 보기</button>' +
        '<button class="cta secondary" type="button" data-del="1">삭제</button></div>' +
        (stats.mid
          ? '<div class="divider"></div><div class="section-title">이동 요약</div>' +
            '<div class="kv">' +
              '<div class="kv-row"><span class="k">이동수단</span><span class="v">' + M.esc(o.data.mode) + '</span></div>' +
              '<div class="kv-row"><span class="k">직선거리</span><span class="v">' + M.fmtDist(d) + '</span></div>' +
              '<div class="kv-row"><span class="k">추정 소요</span><span class="v">약 ' + m + '분</span></div>' +
            '</div>' +
            '<div class="note" style="margin-top:14px">핀을 <b>끌어서</b> 위치를 바꾸면 중간지점이 즉시 다시 계산돼요.</div>'
          : '');

    } else if (sel.type === 'place' && pois[sel.i]) {
      /* [변경] ⑧ 지점 후보와 같은 화면(M.place)을 쓴다 — 사진·별점·영업시간까지.
         정류장만은 출처가 ODsay 라 장소 상세가 없고, 대신 지나는 노선을 보여준다. */
      var p = pois[sel.i].data;
      html = '<p class="eyebrow"><button class="back" type="button" data-back="1">‹</button> ' + M.esc(pois[sel.i].cat) + '</p>';

      if (p.stop) {
        var pd = +p.distance || 0;
        html +=
          '<h2 class="headline">' + M.esc(p.place_name) + '</h2>' +
          '<div class="kv" style="margin-top:12px">' +
            '<div class="kv-row"><span class="k">정류장 번호</span><span class="v">' + M.esc(p.stop.ars || '—') + '</span></div>' +
            (p.stop.central ? '<div class="kv-row"><span class="k">중앙차로</span><span class="v">예</span></div>' : '') +
            (p.address_name ? '<div class="kv-row"><span class="k">위치</span><span class="v" style="font-weight:600;text-align:right">' + M.esc(p.address_name) + '</span></div>' : '') +
            (pd ? '<div class="kv-row"><span class="k">' + M.esc(midName) + '에서</span><span class="v">' +
                  M.fmtDist(pd) + ' · 도보 약 ' + M.estMinutes(pd, '도보') + '분</span></div>' : '') +
          '</div>' +
          '<div class="divider"></div><div class="section-title">이 정류장을 지나는 노선</div>' +
          '<div id="laneBox">' + laneHTML(pois[sel.i]) + '</div>';
      } else {
        html += M.place.html(p, pois[sel.i].detail || null, { from: midName }) + M.place.actions(p);
      }

    } else if (sel.type === 'mid') {
      html =
        '<p class="eyebrow"><button class="back" type="button" data-back="1">‹</button> 추천 중간지점 · ' + basisLabel() + '</p>' +
        '<h2 class="headline">' + M.esc(midName) + '</h2>' +
        '<p class="subline">' + (midRegion ? M.esc(midRegion) + '<br>' : '') +
        '평균 <b>' + stats.avg + '분</b> · 가장 오래 걸리는 사람 <b>' + stats.max + '분</b> · ' + origins.length + '개 출발지 기준<br>' +
        (midBasis === 'time'
          ? '<b>시간순</b> — 가장 오래 걸리는 사람의 시간을 가장 짧게 만드는 지점이에요.'
          : '<b>거리순</b> — 모두의 거리를 기준으로 한 무게중심이에요.') + '</p>' +
        '<div class="ctarow"><button class="cta" type="button" data-make="1">이 출발지들로 모임 만들기</button>' +
        (exploreOn ? '' : '<button class="cta secondary" type="button" data-explore="1">주변 탐색</button>') +
        '</div>' +
        '<div class="divider"></div>' +
        '<div class="kv">' +
          '<div class="kv-row"><span class="k">평균 소요</span><span class="v">약 ' + stats.avg + '분</span></div>' +
          '<div class="kv-row"><span class="k">가장 오래 걸리는 사람</span><span class="v">약 ' + stats.max + '분</span></div>' +
          '<div class="kv-row"><span class="k">출발지</span><span class="v">' + origins.length + '곳</span></div>' +
        '</div>' +
        '<div class="note" style="margin-top:14px">소요시간은 <b>직선거리 기반 추정값</b>입니다. 실제 대중교통 시간은 ODsay 연동 후 반영됩니다.</div>';
    }

    sheetBody.innerHTML = html;

    /* 정류장 시트를 처음 열었으면 노선을 이때 불러온다 */
    if (sel.type === 'place' && pois[sel.i]) {
      if (pois[sel.i].data.stop) loadLanes(pois[sel.i]);
      else loadDetail(pois[sel.i]);
    }

    var back = sheetBody.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () { setMode('browse'); });
    var ex = sheetBody.querySelector('[data-explore]');
    if (ex) ex.addEventListener('click', function () { enterExplore(); });
    var mk = sheetBody.querySelector('[data-make]');
    if (mk) mk.addEventListener('click', handoffToCreate);
    M.place.bind(sheetBody);
    var c = sheetBody.querySelector('[data-center]');
    if (c) c.addEventListener('click', function () { M.map.map.setLevel(4); M.map.map.panTo(origins[sel.i].pos); });
    var del = sheetBody.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (origins.length <= 1) { M.toast('출발지는 최소 한 곳은 남아야 해요'); return; }
      origins[sel.i].marker.setMap(null);
      clearInterval(origins[sel.i].animTimer);
      origins.splice(sel.i, 1);
      origins.forEach(function (o, k) {
        clearInterval(o.animTimer); o.animTimer = null; o.lifted = false; o.frame = 0;
        o.marker.setImage(M.pinImage(k, 0));
      });
      focusIdx = 0; tapChip = -1; tapStage = 0;
      setMode('browse'); renderSlider(); recompute(); raiseFocusedPin();
    });
  }

  /* [추가] ④ 모임 생성으로 넘기기.
     프로세스 순서도 ① 캡션대로 — 방장 출발지는 첫 칸에 프리필하고,
     나머지 출발지는 '미배정 핑'으로 넘겨 ⑥ 에서 그대로 살아나게 한다. */
  function handoffToCreate() {
    if (!origins.length) { M.toast('출발지를 먼저 넣어 주세요'); return; }
    var rest = origins.slice(1);
    /* 여기서는 지도가 살아 있으니 진짜 행정동으로 바꿔 넘긴다.
       저장소의 폴백 표(서울 39개 동)에 맡기면 경기도 출발지가 엉뚱한 동으로 앉는다. */
    Promise.all(rest.map(function (o) {
      return M.Local.dong(o.pos).then(function (doc) {
        return doc
          ? { nm: doc.region_3depth_name || doc.region_2depth_name, code: doc.code,
              full: doc.address_name, lat: +doc.y || o.pos.getLat(), lng: +doc.x || o.pos.getLng(), mode: o.data.mode }
          : { nm: o.data.nm, lat: o.pos.getLat(), lng: o.pos.getLng(), mode: o.data.mode };
      });
    })).then(function (list) {
      M.Store.setHandoff({
        host: { nm: origins[0].data.nm, lat: origins[0].pos.getLat(), lng: origins[0].pos.getLng(), mode: origins[0].data.mode },
        rest: list
      });
      M.router.go('/create');
    });
  }

  /* ---------------- 검색 ---------------- */
  function readHistory() {
    try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (_) { return []; }
  }
  function pushHistory(item) {
    var h = readHistory().filter(function (x) { return x.nm !== item.nm; });
    h.unshift({ nm: item.nm, ad: item.ad, lat: item.lat, lng: item.lng });
    localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 8)));
  }
  function openPanel() { panel.hidden = false; qEl.setAttribute('aria-expanded', 'true'); }
  function closePanel() { panel.hidden = true; qEl.setAttribute('aria-expanded', 'false'); }

  /* [변경] 오른쪽 꼬리표가 모드마다 다르다 —
     출발지 모드는 '추가', 탐색 모드는 '정보'(누르면 장소 정보 시트) */
  function rowHTML(icon, name, addr) {
    return M.ui.rowHTML(icon, name, addr, exploreOn ? '정보 ›' : '＋ 추가');
  }

  function showHistory() {
    /* 탐색 모드의 최근 검색은 출발지 이력과 성격이 달라 섞지 않는다 */
    if (exploreOn) {
      panel.innerHTML = '<div class="sp-empty">' + M.esc(midName) + ' 주변에서 찾을 장소를 입력하세요.<br>' +
                        '목록에서 누르면 장소 정보가 열립니다.</div>';
      openPanel(); return;
    }
    var h = readHistory();
    if (!h.length) {
      panel.innerHTML = '<div class="sp-empty">지역을 입력하면 장소 목록이 나와요.<br>목록에서 눌러 출발지로 추가합니다.</div>';
      openPanel(); return;
    }
    panel.innerHTML = '<div class="sp-head">최근 검색<button type="button" data-clear="1">전체 삭제</button></div>' +
      h.map(function (x, i) { return '<button class="sp-row" type="button" data-hist="' + i + '">' + rowHTML('🕘', x.nm, x.ad || '') + '</button>'; }).join('');
    openPanel();
    panel.querySelector('[data-clear]').addEventListener('click', function () {
      localStorage.removeItem(HKEY); showHistory();
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-hist]'), function (b) {
      b.addEventListener('click', function () { pick(h[+b.getAttribute('data-hist')]); });
    });
  }

  /* 출발지는 '지역 단위'로 받기로 했으므로 일반 키워드 검색만으로는 부족하다.
     "강남"을 치면 일반 검색은 관광지(선릉과정릉·압구정로데오거리)를 돌려준다.
     행정구역 · 지하철역 · 일반 장소를 각각 조회해 묶어 보여준다.
     상태(OK · ZERO_RESULT · ERROR)를 함께 돌려줘야
     "결과 없음"과 "호출 실패"를 화면에서 구분할 수 있다. */
  function searchAddress(q) {
    return M.Local.address(q).then(function (r) {
      return { status: r.status, error: r.error, items: r.items.slice(0, 3).map(function (x) {
        return { nm: x.address_name, ad: '행정구역', lat: +x.y, lng: +x.x };
      }) };
    });
  }
  /* raw 문서를 함께 들고 다닌다 — 탐색 모드에서 장소 정보 시트를 채우려면
     주소·전화·카테고리·place_url이 그대로 필요하다. */
  function searchKeyword(q, opt, limit) {
    return M.Local.keyword(q, opt).then(function (r) {
      return { status: r.status, error: r.error, items: r.items.slice(0, limit).map(function (x) {
        return { nm: x.place_name, ad: x.road_address_name || x.address_name || '',
                 lat: +x.y, lng: +x.x, raw: x };
      }) };
    });
  }

  function showResults(q) {
    var seq = ++kwSeq;
    /* [변경] 탐색 모드에서는 '지역'을 찾을 이유가 없다 — 중간지점 주변 장소만
       거리순으로 본다. 출발지 모드에서는 기존대로 지역·역·장소를 묶어 보여준다. */
    var jobs = exploreOn
      ? [ searchKeyword(q, { location: stats.mid, radius: 5000, sortByDistance: true, size: 15 }, 12),
          searchKeyword(q, { size: 5 }, 5) ]
      : [ searchAddress(q),
          searchKeyword(q, { category_group_code: 'SW8' }, 5),
          searchKeyword(q, {}, 5) ];

    Promise.all(jobs).then(function (r) {
      if (seq !== kwSeq) return;
      var seen = Object.create(null), groups = exploreOn ? [
        { head: midName + ' 주변', icon: '📍', res: r[0] },
        { head: '그 밖의 결과',     icon: '🔎', res: r[1] }
      ] : [
        { head: '지역',     icon: '🗺️', res: r[0] },
        { head: '지하철역', icon: '🚇', res: r[1] },
        { head: '장소',     icon: '📍', res: r[2] }
      ];
      var flat = [], html = '';
      groups.forEach(function (g) {
        var rows = g.res.items.filter(function (x) {
          if (seen[x.nm]) return false;
          seen[x.nm] = 1; return true;
        });
        if (!rows.length) return;
        html += '<div class="sp-head">' + g.head + '</div>';
        rows.forEach(function (x) {
          html += '<button class="sp-row" type="button" data-res="' + flat.length + '">' +
                  rowHTML(g.icon, x.nm, x.ad) + '</button>';
          flat.push(x);
        });
      });

      if (!flat.length) {
        var sts = groups.map(function (g) { return g.res.status; });
        var allZero = sts.every(function (s) { return s === 'ZERO_RESULT'; });
        console.warn('[moimer] 검색 결과 없음:', q, sts.join(' / '));
        html = allZero
          ? '<div class="sp-empty">"' + M.esc(q) + '" 검색 결과가 없어요.<br>지역이나 역 이름으로 다시 검색해 보세요.</div>'
          : '<div class="sp-empty">검색 서비스에 연결하지 못했어요.<br>' +
            '<span style="font-size:11.5px">응답: ' + sts.join(' · ') + '</span><br>' +
            '<span style="font-size:11.5px">카카오 개발자 콘솔에서 <b>카카오맵 API 활성화</b>와 일일 쿼터를 확인해 주세요.</span></div>';
      }
      panel.innerHTML = html;
      openPanel();
      Array.prototype.forEach.call(panel.querySelectorAll('[data-res]'), function (b) {
        b.addEventListener('click', function () { pick(flat[+b.getAttribute('data-res')]); });
      });
    });
  }

  /* [변경] 고른 결과를 어떻게 쓸지가 모드에 따라 갈린다.
       출발지 모드 — 곧바로 출발지로 추가 (별도 추가 버튼 없음)
       탐색 모드   — 그 장소만 핀으로 남기고 장소 정보 시트를 연다 */
  function pick(item) {
    if (exploreOn) { pickPlace(item); return; }
    pushHistory(item);
    addOrigin({ nm: item.nm, lat: item.lat, lng: item.lng, who: '참석자 ' + (origins.length + 1), mode: '지하철' }, true);
    qEl.value = ''; qEl.blur(); closePanel(); recompute();
  }

  function pickPlace(item) {
    var pos = new kakao.maps.LatLng(item.lat, item.lng);
    /* 검색 결과에는 중간지점 기준 거리가 없다 — 시트가 쓰는 값이라 채워 넣는다 */
    var d = item.raw || { place_name: item.nm, address_name: item.ad, x: item.lng, y: item.lat };
    d.distance = String(stats.mid ? M.map.metersBetween(stats.mid, pos) : 0);

    ++poiSeq;                    /* 진행 중인 카테고리 조회가 덮어쓰지 않도록 */
    clearPois();
    addPoi(d, { ic:'📍', label:'검색' }, 0);
    qEl.value = ''; qEl.blur(); closePanel();
    M.map.map.panTo(pos);
    openDetail('place', 0);
  }

  /* ---------------- 오른쪽 버튼들 ---------------- */
  /* 1회는 '지금 선택된 출발지' 기준 — 시트에서 연 출발지가 있으면 그것,
     없으면 슬라이더에서 보고 있는 칩 */
  function currentOriginIndex() {
    if (sel.type === 'origin' && origins[sel.i]) return sel.i;
    return Math.min(Math.max(focusIdx, 0), origins.length - 1);
  }

  /* 중간지점이 없으면(출발지 1곳) 들어갈 데가 없으니 버튼을 감춘다 */
  function syncExploreBtn() { exploreBtn.hidden = !stats.mid; if (!stats.mid && exploreOn) exitExplore(); }

  function syncSortBtn() {
    var sortBtn = $('sortToggle');
    sortBtn.setAttribute('data-sort', midBasis);
    $('sortLabel').textContent = basisLabel();
    sortBtn.setAttribute('aria-label',
      '중간지점 기준: ' + basisLabel() + ' — 눌러서 ' + (midBasis === 'dist' ? '시간순' : '거리순') + '으로 전환');
  }

  /* ---------------- 한 번만 하는 DOM 배선 ---------------- */
  var wired = false;
  function wireOnce() {
    if (wired) return;
    wired = true;

    /* 스와이프(또는 마우스 휠) → 현재 카드 감지 → 지도 이동 */
    slider.addEventListener('scroll', function () {
      clearTimeout(sliderTimer);
      sliderTimer = setTimeout(function () {
        if (M.router.name !== 'home') return;
        var cards = slider.querySelectorAll('.ocard');
        var mid = slider.scrollLeft + slider.clientWidth / 2;
        var best = 0, bd = Infinity;
        Array.prototype.forEach.call(cards, function (c, i) {
          var d = Math.abs((c.offsetLeft + c.offsetWidth / 2) - mid);
          if (d < bd) { bd = d; best = i; }
        });
        /* 스와이프로 도착한 칩은 '1번째 탭'과 같은 상태로 둔다 */
        if (best !== focusIdx && best < origins.length) { tapChip = best; tapStage = 1; focusOrigin(best); }
      }, 120);
    }, { passive: true });

    /* [추가] PC: 세로 휠로 가로 슬라이더를 넘길 수 있게 */
    slider.addEventListener('wheel', function (e) {
      var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!dx) return;
      e.preventDefault();
      slider.scrollLeft += dx;
    }, { passive: false });

    /* [추가] 마우스로 끌어서 넘기기.
       출발지가 넷을 넘으면 화면 밖으로 나가는데, 마우스에는 스와이프가 없고
       휠은 슬라이더 위에 올려놔야만 듣는다. 손으로 잡아 미는 쪽이 먼저 떠오르는 동작이다.
       터치는 브라우저 기본 관성 스크롤이 더 나으므로 건드리지 않는다. */
    var od = null;
    slider.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      od = { id:e.pointerId, x:e.clientX, left:slider.scrollLeft, moved:false };
    });
    slider.addEventListener('pointermove', function (e) {
      if (!od || e.pointerId !== od.id) return;
      var dx = e.clientX - od.x;
      /* 4px 은 넘겨야 끌기로 친다 — 그 전에는 칩을 누르려는 손떨림일 수 있다 */
      if (!od.moved && Math.abs(dx) < 4) return;
      if (!od.moved) {
        od.moved = true;
        slider.classList.add('drag');
        try { slider.setPointerCapture(od.id); } catch (_) {}
      }
      slider.scrollLeft = od.left - dx;
      e.preventDefault();
    });
    function odEnd(e) {
      if (!od || e.pointerId !== od.id) return;
      slider.classList.remove('drag');
      /* 끌어서 놓은 손가락은 클릭도 함께 낸다 — 그대로 두면 놓은 자리의 칩이
         눌린 것으로 처리돼 지도가 엉뚱한 사람에게 튄다. 한 번만 삼킨다. */
      od.moved ? (dragSwallow = true) : 0;
      od = null;
    }
    slider.addEventListener('pointerup', odEnd);
    slider.addEventListener('pointercancel', odEnd);
    var dragSwallow = false;
    slider.addEventListener('click', function (e) {
      if (!dragSwallow) return;
      dragSwallow = false;
      e.stopPropagation(); e.preventDefault();
    }, true);

    qEl.addEventListener('focus', function () { if (M.router.name === 'home' && !qEl.value.trim()) showHistory(); });
    qEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var v = qEl.value.trim();
      if (!v) { showHistory(); return; }
      searchTimer = setTimeout(function () { showResults(v); }, 280);
    });
    qEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); var v = qEl.value.trim(); if (v) showResults(v); }
      if (e.key === 'Escape') { closePanel(); qEl.blur(); }
    });
    device.addEventListener('pointerdown', function (e) {
      if (!panel.hidden && !e.target.closest('.searchwrap')) closePanel();
    }, true);

    $('sortToggle').addEventListener('click', function () {
      if (M.router.name !== 'home') return;
      midBasis = (midBasis === 'dist') ? 'time' : 'dist';
      syncSortBtn();
      recompute();
      M.toast(midBasis === 'time'
        ? '시간순 — 가장 오래 걸리는 사람 기준'
        : '거리순 — 모두의 거리 기준');
    });
    syncSortBtn();
  }

  /* ---------------- 화면 진입/이탈 ---------------- */
  M.router.register('home', {
    layer: 'map', tab: 0,

    enter: function () {
      device = $('device'); slider = $('oslider'); cslider = $('cslider');
      exploreBtn = $('explore'); locate = $('locate');
      miniEl = $('sheetMini'); sheetBody = $('sheetBody');
      qEl = $('q'); panel = $('searchPanel');
      wireOnce();

      dis = M.util.disposer();
      M.sheet.onEscape = function () { setMode('browse'); };
      exploreBtn.hidden = true;

      /* [변경] 범위 맞추기 — 누를 때마다 '첫 출발지 ↔ 중간지점'과
         '전체 출발지 ↔ 중간지점'이 번갈아 적용된다. */
      dis.on(locate, 'click', function () {
        if (!origins.length || !stats.mid) return;
        focusMode = (focusMode === 1) ? 2 : 1;
        var pts = [stats.mid];
        var i = currentOriginIndex();
        if (focusMode === 1) pts.push(origins[i].pos);
        else origins.forEach(function (o) { pts.push(o.pos); });
        M.map.fitTo(pts);
        locate.setAttribute('data-focus', focusMode === 1 ? 'first' : 'all');
        M.toast(focusMode === 1
          ? (i + 1) + '. ' + origins[i].data.nm + ' ↔ 중간지점'
          : '전체 ' + origins.length + '곳 ↔ 중간지점');
      });

      /* [추가] 핀 버튼 — 탐색 모드로 들어가고, 다시 누르면 출발지 화면으로 */
      dis.on(exploreBtn, 'click', function () { if (exploreOn) exitExplore(); else enterExplore(); });

      setMode('browse');
      device.setAttribute('data-explore', exploreOn ? 'on' : 'off');
      if (exploreOn) renderCats();

      M.map.whenReady(function () {
        if (M.router.name !== 'home') return;
        /* [변경] 지도 한 번 탭 → 위치 조정만 남기고 나머지는 밀어 감춤 (토글) */
        dis.kakao(M.map.map, 'click', function () {
          if (M.sheet.mode === 'detail') setMode('browse');
          else setMode(M.sheet.mode === 'browse' ? 'clean' : 'browse');
        });
        if (!built) { build(); return; }
        /* 다시 들어온 것 — 아까 그대로 되살린다 */
        origins.forEach(function (o) { o.marker.setMap(M.map.map); });
        if (stats.mid) midOv.setMap(M.map.map);
        pois.forEach(function (p) { p.ov.setMap(M.map.map); });
        syncExploreBtn(); renderSlider(); fitAll();
      });
    },

    leave: function () {
      /* 지도는 화면끼리 나눠 쓴다 — 내 것은 내가 걷어야 다음 화면이 깨끗하다 */
      origins.forEach(function (o) { clearInterval(o.animTimer); o.animTimer = null; o.marker.setMap(null); });
      if (midOv) midOv.setMap(null);
      pois.forEach(function (p) { p.ov.setMap(null); });
      clearTimeout(sliderTimer); clearTimeout(searchTimer);
      closePanel();
      exploreBtn.hidden = true;
      M.sheet.onEscape = null;
      if (dis) { dis.all(); dis = null; }
    }
  });

})(window.MOIMER);
