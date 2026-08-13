/* ============================================================
   ⑧ 지점 후보 — 반경 700m · ⑨ 지점 투표

   ⑧ 은 ① 탐색 모드의 기계를 거의 그대로 물려받는다 —
   카테고리로 주변 장소를 부르고, 회색 원을 지도에 뿌리고, 누르면 고른다.
   달라진 것은 넷뿐이다.
     · 카테고리 표가 목적 5종(음식·카페·술집·문화·야외)이고 반경은 모임의 radius 하나
     · 중심이 중간지점이 아니라 '확정된 동'
     · 점선 반경 원 (kakao.maps.Circle — 앱에는 없던 것)
     · 회색 원 = 미리보기, 누르면 후보로 등록되고 노란 말풍선이 된다

   ⑨ 는 ⑦ 과 규칙이 같다 — M.flow 를 그대로 쓴다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;

  /* 목적 카테고리 5종. ① 의 CATS 와 다른 표다 —
     저쪽은 '중간지점 주변에 뭐가 있나'이고 이쪽은 '무엇을 하러 모이나'다. */
  var PLACE_CATS = M.PLACE_CATS = [
    { label:'음식', ic:'🍽️', code:'FD6' },
    { label:'카페', ic:'☕',  code:'CE7' },
    { label:'술집', ic:'🍺',  kw:'술집' },
    { label:'문화', ic:'🎬',  code:'CT1' },
    { label:'야외', ic:'🌳',  code:'AT4' }
  ];

  var dis = null, offStore = null;
  var circle = null, previews = [], candOvs = [], centerMk = null;
  var cat = '음식', poiSeq = 0, loading = false;
  /* 마지막으로 불러온 주변 장소. 표가 바뀔 때마다 시트를 다시 그리는데,
     그때 목록이 사라지면 후보를 하나 넣을 때마다 다시 조회해야 한다. */
  var lastItems = [];
  /* [변경] 추천 후보를 눌러도 곧바로 등록하지 않는다 — 먼저 어떤 곳인지 보여준다.
     시트가 두 얼굴을 갖는다: 'list' 후보 목록 · 'place' 장소 상세 + [후보로 추가] */
  var view = { mode:'list', place:null, detail:null };
  /* 후보 상한 — 지역과 같은 값을 쓴다(저장소가 갖고 있다) */
  var MAX_CANDS = S.MAX_CANDS;
  /* 지금 시트에 펴 둔 AI 팔레트 줄 */
  var aiRows = [];

  function clearPreviews() { previews.forEach(function (p) { p.ov.setMap(null); }); previews = []; }
  function clearCands()    { candOvs.forEach(function (o) { o.setMap(null); }); candOvs = []; }

  function centerOf(m) {
    var r = S.regionOf(m);
    if (r) return r;
    /* 확정 지역이 없으면(되돌리기 중 등) 멤버 무게중심으로 버틴다 */
    var la = 0, ln = 0;
    m.members.forEach(function (x) { la += x.origin.lat; ln += x.origin.lng; });
    return { dong:'중간지점', full:'', lat: la / m.members.length, lng: ln / m.members.length };
  }

  /* ---------------- 지도 ---------------- */
  function drawCircle(m) {
    if (!M.map.ready) return;
    var c = centerOf(m);
    if (circle) circle.setMap(null);
    circle = new kakao.maps.Circle({
      center: new kakao.maps.LatLng(c.lat, c.lng), radius: m.radius,
      strokeWeight: 1.6, strokeColor: '#2f6bff', strokeOpacity: 0.9, strokeStyle: 'dashed',
      fillColor: '#2f6bff', fillOpacity: 0.07, zIndex: 1
    });
    circle.setMap(M.map.map);

    if (centerMk) centerMk.setMap(null);
    var el = document.createElement('div');
    el.className = 'ov-ping won';
    el.innerHTML = '<div class="bubble">' + M.esc(c.dong) + ' · 확정</div><div class="stem"></div><div class="dot"></div>';
    centerMk = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(c.lat, c.lng), zIndex: 6, yAnchor: 1, xAnchor: 0.5 });
    centerMk.setContent(el); centerMk.setMap(M.map.map);
  }

  function drawCands(m) {
    clearCands();
    if (!M.map.ready) return;
    var voting = m.stage === 'vote-place';
    var t = S.tally(m), lead = S.leaders(m), me = S.me(m.id);
    var mine = m.placeVotes[me];

    m.placeCandidates.forEach(function (c) {
      var ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(c.lat, c.lng),
        zIndex: (voting && lead.indexOf(c.id) >= 0) ? 8 : 4, yAnchor: 1, xAnchor: 0.5
      });
      var el = document.createElement('div');
      el.className = 'ov-cand' + (c.ai ? ' ai' : '') + (mine === c.id ? ' mine' : '');
      if (voting) {
        el.setAttribute('data-votes', t[c.id] || 0);
        if (lead.indexOf(c.id) >= 0 && t[c.id]) el.setAttribute('data-rank', '1');
      }
      el.innerHTML = '<div class="bubble">' + M.esc(c.name) + (voting ? ' ' + (t[c.id] || 0) + '표' : '') + '</div>' +
                     '<div class="stem"></div><div class="dot"></div>';
      el.addEventListener('click', function (e) { e.stopPropagation(); tapCand(m, c); });
      ov.setContent(el); ov.setMap(M.map.map);
      candOvs.push(ov);
    });
  }

  /* 등록된 후보를 카카오 장소 문서 모양으로 되돌린다 —
     그래야 미리보기 핀·검색 결과와 똑같은 상세 화면(M.place)을 태울 수 있다.
     url 이 있으면 사진·별점·영업시간까지 따라온다(AI·예시 후보는 url 이 없어 그 줄만 빠진다). */
  function candToDoc(m, c) {
    var center = centerOf(m), dist = '';
    if (M.map.ready) {
      dist = String(M.map.metersBetween(
        new kakao.maps.LatLng(center.lat, center.lng), new kakao.maps.LatLng(c.lat, c.lng)));
    }
    return {
      place_name: c.name, category_name: c.cat || '',
      road_address_name: c.addr || '', address_name: c.addr || '',
      x: String(c.lng), y: String(c.lat),
      phone: '', place_url: c.url || '', distance: dist,
      why: c.why || ''
    };
  }

  /* AI 팔레트 항목도 상세 화면을 태우려면 같은 모양이어야 한다 */
  function aiToDoc(x) {
    return {
      place_name: x.nm, category_name: x.cat || '',
      road_address_name: x.addr || '', address_name: x.addr || '',
      x: String(x.lng), y: String(x.lat),
      phone: '', place_url: x.url || '', distance: '', why: x.why || ''
    };
  }

  function tapCand(m, c) {
    if (m.stage === 'vote-place') {
      var had = m.placeVotes[S.me(m.id)] === c.id;
      S.vote(m.id, c.id);
      M.toast(had ? '표를 뺐어요' : c.name + '에 투표했어요');
      return;
    }
    /* [변경] 작은 확인창 대신 미리보기 핀과 똑같은 상세 시트를 연다 —
       "이미 넣은 곳"과 "아직 안 넣은 곳"이 다른 화면을 쓸 이유가 없다.
       그 안에서 후보 등록/해제를 오갈 수 있다. */
    openPlace(m, candToDoc(m, c));
  }

  function catConf() { return PLACE_CATS.filter(function (c) { return c.label === cat; })[0] || PLACE_CATS[0]; }

  function loadPreviews(m) {
    if (m.stage !== 'place') { clearPreviews(); return; }
    var conf = catConf(), c = centerOf(m), seq = ++poiSeq;
    loading = true;
    var center = M.map.ready ? new kakao.maps.LatLng(c.lat, c.lng) : null;

    var req = (M.map.ready && center)
      ? (conf.code
          ? M.Local.category(conf.code, center, m.radius, 15)
          : M.Local.keyword(conf.kw, { location: center, radius: m.radius, sortByDistance: true, size: 15 }))
      : Promise.resolve({ status: 'ERROR', items: [], error: '지도 없음' });

    req.then(function (r) {
      if (seq !== poiSeq) return;
      loading = false;
      var items = r.items || [];
      /* 키가 없거나 호출이 막혔을 때만 예시 데이터를 깐다 —
         ⑧⑨⑩ 을 못 걸어보는 건 목업으로서 치명적이다. 이름에 '(예시)'를 붙여 구분한다. */
      if (r.status === 'ERROR') items = M.mockPlaces(c, cat, 6);
      lastItems = items;
      drawPreviews(m, items);
      renderSheet(m, items);
      if (r.status === 'ZERO_RESULT') offerWiden(m);
    });
  }

  function drawPreviews(m, items) {
    clearPreviews();
    if (!M.map.ready) return;
    var c = centerOf(m), center = new kakao.maps.LatLng(c.lat, c.lng);
    var taken = Object.create(null);
    m.placeCandidates.forEach(function (x) { taken[x.name] = 1; });

    items.forEach(function (d) {
      if (taken[d.place_name]) return;                 /* 이미 후보면 노란 말풍선이 대신 있다 */
      var pos = new kakao.maps.LatLng(+d.y, +d.x);
      var ov = new kakao.maps.CustomOverlay({ position: pos, zIndex: 3 });
      var el = document.createElement('div');
      el.className = 'ov-poi';
      el.textContent = catConf().ic;
      el.title = d.place_name + ' — 누르면 상세 정보';
      el.addEventListener('click', function (e) { e.stopPropagation(); openPlace(m, d); });
      ov.setContent(el); ov.setMap(M.map.map);
      previews.push({ data: d, ov: ov, el: el });
    });
  }

  /* [추가] 장소 상세 — ① 탐색 모드와 같은 화면(M.place)을 쓴다.
     사진·별점·영업시간은 뒤늦게 오므로, 먼저 있는 것으로 그리고 도착하면 다시 그린다. */
  function openPlace(m, d) {
    view = { mode:'place', place:d, detail:null };
    renderSheet(m);
    M.sheet.go('half', true);
    if (M.map.ready && d.y && d.x) M.map.map.panTo(new kakao.maps.LatLng(+d.y, +d.x));

    var mine = d;
    M.Local.detail(d.place_url || d.id).then(function (det) {
      /* 그 사이 다른 걸 눌렀으면 덮어쓰지 않는다 */
      if (view.mode !== 'place' || view.place !== mine) return;
      view.detail = det;
      renderSheet(S.get(m.id));
    });
  }

  function register(m, d, center) {
    /* 반경 밖은 거부한다 — 확정한 동네에서 걸어갈 수 있어야 '중간지점'이 의미가 있다.
       (지도가 없으면 거리를 잴 수 없으므로 이 검사는 건너뛴다) */
    if (center && M.map.ready) {
      var pos = new kakao.maps.LatLng(+d.y, +d.x);
      if (M.map.metersBetween(center, pos) > m.radius) {
        M.toast('반경 ' + M.fmtDist(m.radius) + ' 밖이에요');
        return;
      }
    }
    var ok = S.addCandidate(m.id, {
      name: d.place_name, cat: cat, lat: +d.y, lng: +d.x,
      addr: d.road_address_name || d.address_name || '', url: d.place_url || ''
    });
    M.toast(ok ? d.place_name + ' 를 후보에 넣었어요' : '이미 후보에 있어요');
  }

  /* 0개 — 순서도의 조회 팝업. 반경 확장은 1회, 전원에게 공유된다. */
  function offerWiden(m) {
    var acts = [{ label: '다른 종류 보기' }];
    if (m.radius < 1400) {
      acts.push({ label: '반경 넓히기 (1.4km)', kind: 'primary', fn: function () {
        S.setRadius(m.id, 1400);
        M.toast('반경을 1.4km 로 넓혔어요 — 전원에게 적용됩니다');
      } });
    }
    M.modal.open({
      title: '이 종류로는 나온 곳이 없어요',
      text: '반경 <b>' + M.fmtDist(m.radius) + '</b> 안에 ' + cat + '이(가) 없습니다.' +
            (m.radius < 1400
              ? '<br>반경은 <b>한 번만</b> 넓힐 수 있고, 넓히면 <b>전원</b>에게 적용됩니다.'
              : '<br>반경은 이미 최대(1.4km)입니다. 다른 종류를 보거나 방장의 AI 추천을 써보세요.'),
      actions: acts
    });
  }

  /* ---------------- 시트 ---------------- */
  function backToList(m) {
    view = { mode:'list', place:null, detail:null };
    renderSheet(S.get(m.id));
    M.sheet.go('peek', true);
  }

  /* 장소 상세 얼굴 — 미리보기 핀·검색 결과·등록된 후보가 모두 여기로 온다.
     ⑧ 이면 [후보로 추가] ↔ [후보에서 빼기] 를 그 자리에서 오갈 수 있고,
     ⑨ 는 후보가 잠긴 뒤라 읽기만 한다. */
  function renderPlaceView(m) {
    var p = view.place, c = centerOf(m);
    var editable = m.stage === 'place';
    var already = m.placeCandidates.filter(function (x) { return x.name === p.place_name; })[0];
    var over = m.placeCandidates.length >= MAX_CANDS;
    /* 반경 밖이면 눌러 보고 토스트로 거절당하는 대신, 버튼에서 미리 알려준다 —
       (검색 결과는 반경 밖도 나오므로 실제로 생기는 상태다) */
    var far = 0;
    if (M.map.ready && p.y && p.x) {
      far = M.map.metersBetween(new kakao.maps.LatLng(c.lat, c.lng), new kakao.maps.LatLng(+p.y, +p.x));
    }
    var outside = far > m.radius;

    $('sheetMini').style.display = 'flex';
    $('sheetMini').innerHTML =
      '<span class="ic plain">' + (already ? '✓' : '📍') + '</span>' +
      '<span class="nm">' + M.esc(p.place_name) + '</span>' +
      '<span class="rt"><span class="t">' + m.placeCandidates.length +
      (editable ? '/' + MAX_CANDS : '') + '</span>' +
      '<span class="d">후보</span></span>';

    $('sheetBody').innerHTML =
      '<p class="eyebrow"><button class="back" type="button" data-back="1">‹</button> ' +
        M.esc(c.dong) + (already ? ' · 등록된 후보' : ' 주변 · ' + M.esc(cat)) + '</p>' +
      M.place.html(p, view.detail, { from: c.dong }) +
      (p.why ? '<div class="note" style="margin-top:12px;color:var(--ai)">AI 추천 이유 — ' + M.esc(p.why) + '</div>' : '') +
      (editable
        ? (already
            ? '<button class="cta secondary" type="button" data-drop="' + already.id + '" style="margin-top:13px">후보에서 빼기</button>'
            : '<button class="cta" type="button" data-pick="1" style="margin-top:13px"' +
              ((over || outside) ? ' disabled' : '') + '>' +
              (outside ? '반경 ' + M.fmtDist(m.radius) + ' 밖이에요'
               : over ? '후보가 이미 ' + MAX_CANDS + '개예요' : '후보로 추가') + '</button>')
        : '') +
      M.place.actions(p) +
      (editable && outside && !already
        ? '<div class="note" style="margin-top:12px">확정된 <b>' + M.esc(c.dong) + '</b> 중심에서 ' +
          '<b>' + M.fmtDist(far) + '</b> 떨어져 있어요. 다들 걸어갈 수 있는 거리만 후보가 됩니다' +
          (m.radius < 1400 ? ' — 방장이 반경을 1.4km 까지 한 번 넓힐 수 있어요.' : '.') + '</div>'
        : '') +
      (editable && over && !already && !outside
        ? '<div class="note" style="margin-top:12px">후보는 <b>최대 ' + MAX_CANDS + '개</b>입니다. ' +
          '하나를 빼야 이 곳을 넣을 수 있어요.</div>'
        : '') +
      (!editable
        ? '<div class="note" style="margin-top:12px">투표가 시작돼 <b>후보가 잠겼습니다</b>. ' +
          '넣거나 빼려면 방장이 되돌리기로 후보 단계를 다시 열어야 해요.</div>'
        : '');

    var body = $('sheetBody');
    body.querySelector('[data-back]').addEventListener('click', function () { backToList(m); });

    /* [변경] 넣거나 빼도 목록으로 튀지 않는다 — 버튼이 그 자리에서 뒤집혀
       "지금 이 곳이 후보인가 아닌가"가 눈으로 확인된다. 잘못 눌렀으면 바로 되돌린다. */
    var pick = body.querySelector('[data-pick]');
    if (pick) pick.addEventListener('click', function () {
      register(m, p, M.map.ready ? new kakao.maps.LatLng(c.lat, c.lng) : null);
    });
    var drop = body.querySelector('[data-drop]');
    if (drop) drop.addEventListener('click', function () {
      S.removeCandidate(m.id, drop.getAttribute('data-drop'));
      M.toast('후보에서 뺐어요');
    });
    M.place.bind(body);
  }

  function renderSheet(m, items) {
    /* ⑧·⑨ 모두 상세를 열 수 있다 — 다만 ⑨ 는 읽기만 (renderPlaceView 가 가른다) */
    if (view.mode === 'place' && view.place) { renderPlaceView(m); return; }
    if (!items) items = lastItems;
    var host = S.isHost(m);
    var voting = m.stage === 'vote-place';
    var me = S.me(m.id), c = centerOf(m);
    var t = S.tally(m), lead = S.leaders(m);
    var mineVote = m.placeVotes[me];
    var cands = m.placeCandidates;

    $('sheetMini').style.display = 'flex';
    $('sheetMini').innerHTML =
      '<span class="ic" style="--c:var(--brand)">' + (voting ? '표' : '점') + '</span>' +
      '<span class="nm">' + M.esc(c.dong) + ' · ' + M.fmtDist(m.radius) + '</span>' +
      '<span class="rt"><span class="t">' + cands.length + '곳</span>' +
      '<span class="d">' + (voting ? S.voted(m) + '/' + m.members.length + ' 투표' : '후보') + '</span></span>';

    var html =
      '<p class="eyebrow">' + (voting ? '④ 지점 투표' : '③ 지점 후보 모으기') + '</p>' +
      '<h2 class="headline">' + (voting ? '어디로 갈까요?' : M.esc(c.dong) + ' 안에서 골라요') + '</h2>' +
      '<p class="subline">' + (voting
        ? '규칙은 지역 투표와 같아요 — <b>한 사람 한 표</b>, 다시 누르면 취소.'
        : '확정된 동 중심에서 <b>' + M.fmtDist(m.radius) + '</b> 안만 후보가 됩니다. ' +
          '지도의 <b>회색 동그라미</b>나 아래 목록을 누르면 어떤 곳인지 먼저 보여드려요. ' +
          '후보는 <b>최대 ' + MAX_CANDS + '개</b>입니다.') +
      '</p>' +
      M.flow.mapNote();

    /* 카테고리 줄은 ⑧ 에만. 시트 안에 두어 ①의 검색바와 자리를 다투지 않게 한다. */
    if (!voting) {
      html += '<div class="hb-filters" style="margin-bottom:12px"><div class="hb-frow">' +
        PLACE_CATS.map(function (p) {
          return '<button class="ccard" type="button" data-cat="' + p.label + '" aria-pressed="' +
                 (p.label === cat ? 'true' : 'false') + '"><span aria-hidden="true">' + p.ic + '</span>' + p.label + '</button>';
        }).join('') + '</div></div>';
      if (items && items.length && items[0].mock) {
        html += '<div class="note" style="margin-bottom:12px">지도를 열지 못해 <b>예시 장소</b>를 대신 띄웠어요 — ' +
                '이름 뒤 <b>(예시)</b>가 그 표시입니다. 흐름은 그대로 확인할 수 있습니다.</div>';
      }
      /* [변경] '주변 ○○ N곳' 목록을 뺐다 — 지도의 회색 동그라미와 위 검색창이
         같은 일을 하는데 시트까지 세 번째 통로를 두면 무엇이 후보인지가 흐려졌다.
         그 자리를 AI 추천이 대신한다: 골라 올려야 후보가 되는 팔레트. */
      var pal = S.ai(m, 'place');
      aiRows = pal.map(function (x) {
        var hit = cands.filter(function (c) { return c.name === x.nm; })[0];
        return { key:x.key, nm:x.nm, sub: hit ? '후보에 올라가 있어요' : (x.why || x.addr || 'AI 추천'),
                 on: !!hit, item:x, cand:hit };
      });
      html += M.flow.aiHTML(aiRows, {
        label: '지점', canClear: true, info: true,
        full: cands.length >= MAX_CANDS
      });
    }

    if (!cands.length) {
      html += '<div class="vt-none">아직 후보가 없어요.<br>' +
              (voting ? '방장이 되돌리기로 후보를 다시 받아야 해요.' : '위 종류를 고르고 지도의 회색 동그라미를 눌러보세요.') + '</div>';
    } else {
      html += '<div class="section-title">후보 ' + cands.length + '곳' +
        (voting ? '' : ' <span style="font-weight:700;color:' +
          (cands.length > MAX_CANDS ? 'var(--danger)' : 'var(--ink-3)') + '">/ 최대 ' + MAX_CANDS + '</span>') +
        '</div><div class="vt-list">' +
        cands.map(function (x) {
          var by = S.member(m, x.by);
          var sub = (x.cat ? x.cat + ' · ' : '') + (x.why || x.addr || (by ? by.name + ' 추천' : ''));
          return '<button class="vt-row" type="button" data-c="' + x.id + '"' +
            (voting ? ' aria-pressed="' + (mineVote === x.id ? 'true' : 'false') + '" data-votes="' + (t[x.id] || 0) + '"' : '') + '>' +
            '<span style="min-width:0"><span class="nm">' + M.esc(x.name) + '</span>' +
            '<span class="sub">' + M.esc(sub) + '</span></span>' +
            (x.ai ? '<span class="ai-tag">AI</span>' : '') +
            /* ⑨ 에서는 줄을 누르면 곧바로 한 표다 — 그러니 '보기'는 따로 있어야
               찍기 전에 어떤 곳인지 확인할 수 있다. */
            (voting ? '<span class="info" data-info="' + x.id + '" role="button" tabindex="0" ' +
                      'aria-label="' + M.esc(x.name) + ' 상세 정보">ⓘ</span>' : '') +
            (voting
              ? '<span class="cnt">' + (t[x.id] || 0) + '<small>' + (lead.indexOf(x.id) >= 0 && t[x.id] ? '1위' : '표') + '</small></span>'
              : '') +
          '</button>';
        }).join('') + '</div>';
    }

    if (voting && mineVote) {
      var mv = cands.filter(function (x) { return x.id === mineVote; })[0];
      html += '<p class="vt-mine">내 표: ' + M.esc(mv ? mv.name : '') + '</p>';
    }
    if (voting && S.nonVoters(m).length) {
      html += '<div class="note" style="margin-top:12px">아직 <b>' + M.esc(S.nonVoters(m).join(', ')) + '</b> 님이 투표하지 않았어요.</div>';
    }

    if (host) {
      html += '<div class="divider"></div><div class="section-title">방장</div>' +
        (voting
          ? '<div class="ctarow"><button class="cta" type="button" data-confirm="1">지점 확정</button>' +
            '<button class="cta secondary" type="button" data-revote="1">재투표</button></div>' +
            M.flow.reopenBtn(m) + M.flow.inviteBtn() +
            '<div class="note" style="margin-top:12px">확정하면 그때 <b>경로를 처음 계산</b>합니다 — 각자 출발지 기준으로요.</div>'
          : '<div class="ctarow"><button class="cta secondary" type="button" data-ai="1">AI 지점 추천</button>' +
            '<button class="cta" type="button" data-start="1">투표 시작</button></div>' +
            M.flow.reopenBtn(m) + M.flow.inviteBtn() +
            '<div class="note" style="margin-top:12px">반경은 <b>' + M.fmtDist(m.radius) + '</b>' +
            (m.radius >= 1400 ? ' (이미 최대)' : ' · 결과가 없으면 1.4km 까지 한 번 넓힐 수 있어요') + '.</div>');
    } else {
      html += '<div class="note" style="margin-top:14px">' +
        (voting ? '확정은 <b>방장</b>만 할 수 있어요.' : '<b>투표 시작</b>은 방장이 누릅니다.') +
        ' 왼쪽 위 점선 알약으로 방장 화면을 볼 수 있어요.</div>';
    }

    $('sheetBody').innerHTML = html;
    bindSheet(m);
  }

  function bindSheet(m) {
    var body = $('sheetBody');

    Array.prototype.forEach.call(body.querySelectorAll('[data-cat]'), function (b) {
      b.addEventListener('click', function () {
        cat = b.getAttribute('data-cat');
        loadPreviews(m);
      });
    });

    Array.prototype.forEach.call(body.querySelectorAll('[data-c]'), function (b) {
      b.addEventListener('click', function () {
        var c = m.placeCandidates.filter(function (x) { return x.id === b.getAttribute('data-c'); })[0];
        if (!c) return;
        tapCand(m, c);
        if (M.map.ready) M.map.map.panTo(new kakao.maps.LatLng(c.lat, c.lng));
      });
    });

    /* ⓘ — 표를 주지 않고 상세만 연다. 줄 전체의 클릭(=투표)까지 번지면 안 된다. */
    Array.prototype.forEach.call(body.querySelectorAll('[data-info]'), function (b) {
      function open(e) {
        e.stopPropagation(); e.preventDefault();
        var c = m.placeCandidates.filter(function (x) { return x.id === b.getAttribute('data-info'); })[0];
        if (c) openPlace(m, candToDoc(m, c));
      }
      b.addEventListener('click', open);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
    });

    /* AI 팔레트 — 등록/빼기 · ⓘ 로 상세. 후보에서 빼도 팔레트에는 남는다. */
    M.flow.bindAi(body, aiRows, {
      info: true,
      onToggle: function (r) {
        if (r.on) { S.removeCandidate(m.id, r.cand.id); M.toast(r.nm + ' 를 후보에서 뺐어요'); return; }
        var ok = S.addCandidate(m.id, {
          name: r.item.nm, cat: r.item.cat || cat, lat: r.item.lat, lng: r.item.lng,
          addr: r.item.addr || '', url: r.item.url || '', ai: true, why: r.item.why || ''
        });
        M.toast(ok ? r.nm + ' 를 후보에 올렸어요' : '이미 후보에 있어요');
        if (M.map.ready) M.map.map.panTo(new kakao.maps.LatLng(r.item.lat, r.item.lng));
      },
      onInfo: function (r) { openPlace(m, aiToDoc(r.item)); },
      onClear: function () { S.clearAi(m.id, 'place'); M.toast('AI 추천 목록을 지웠어요'); }
    });

    var start = body.querySelector('[data-start]');
    if (start) start.addEventListener('click', function () { startVote(m); });

    var ai = body.querySelector('[data-ai]');
    if (ai) ai.addEventListener('click', function () { askAI(m); });

    var conf = body.querySelector('[data-confirm]');
    if (conf) conf.addEventListener('click', function () {
      M.flow.confirm(m, m.placeCandidates, function (c) { return c ? c.name : ''; });
    });

    var re = body.querySelector('[data-revote]');
    if (re) re.addEventListener('click', function () {
      M.modal.open({
        title: '다시 투표할까요?',
        text: '표만 지우고 후보는 그대로 둡니다.',
        actions: [{ label:'취소' }, { label:'재투표', kind:'primary', fn: function () { S.revote(m.id); M.toast('표를 지웠어요'); } }]
      });
    });

    M.flow.bindReopen(body, m);
    M.flow.bindInvite(body, m);
  }

  function startVote(m) {
    if (!m.placeCandidates.length) { M.toast('후보가 없어요 — 지도에서 한 곳은 골라주세요'); return; }
    /* 후보 상한 — ⑥ 과 같은 모달(M.flow.capGate). AI가 올린 것도 이 수에 든다. */
    if (M.flow.capGate(m, m.placeCandidates, function (c) { return c.name; },
        function (c) {
          S.removeCandidate(m.id, c.id);
          var mm = S.get(m.id);
          M.toast('후보에서 뺐어요 — 지금 ' + mm.placeCandidates.length + '개');
          /* 아직 넘치면 곧바로 다시 물어본다 — 몇 번을 눌러야 하는지가 보이게 */
          if (mm.placeCandidates.length > S.MAX_CANDS) startVote(mm);
        })) return;
    if (m.placeCandidates.length === 1) {
      M.modal.open({
        title: '후보가 한 곳뿐이에요',
        text: '<b>' + M.esc(m.placeCandidates[0].name) + '</b> 하나뿐이라 투표를 건너뛰고 확정할까요?',
        actions: [{ label:'더 모으기' }, { label:'바로 확정', kind:'primary', fn: function () {
          S.confirm(m.id, m.placeCandidates[0].id);
          M.router.go('/m/' + m.id + '/result');
        } }]
      });
      return;
    }
    M.modal.open({
      title: '투표를 시작할까요?',
      text: '시작하면 <b>후보가 잠깁니다</b>. 후보 <b>' + m.placeCandidates.length + '곳</b>으로 투표해요.',
      actions: [{ label:'취소' }, { label:'시작', kind:'primary', fn: function () {
        S.startVote(m.id);
        M.toast('투표를 시작했어요');
        M.router.go('/m/' + m.id + '/vote-place');
      } }]
    });
  }

  function askAI(m) {
    var had = S.ai(m, 'place');
    if (!had.length) { runAI(m, false); return; }
    M.modal.open({
      title: '다시 추천받을까요?',
      text: '먼저 받은 AI 추천 <b>' + had.length + '곳</b>을 어떻게 할까요?',
      actions: [
        { label:'이전 것 지우고 새로', kind:'primary', fn: function () { runAI(m, true); } },
        { label:'기존에 더하기', fn: function () { runAI(m, false); } }
      ]
    });
  }

  function runAI(m, replace) {
    var c = centerOf(m);
    M.AI.ask({
      title: 'AI가 지점을 고르는 중',
      /* 진짜 POI 에 근거 한 줄을 입힌다 — 지어낸 이름보다 훨씬 설득력 있고,
         키가 없으면 예시 데이터로 자연히 내려간다. */
      produce: function () {
        if (!M.map.ready) return M.mockPlaces(c, cat, 3);
        var conf = catConf(), center = new kakao.maps.LatLng(c.lat, c.lng);
        var req = conf.code
          ? M.Local.category(conf.code, center, m.radius, 15)
          : M.Local.keyword(conf.kw, { location: center, radius: m.radius, sortByDistance: true, size: 15 });
        return req.then(function (r) {
          var items = (r.status === 'OK' && r.items.length) ? r.items : M.mockPlaces(c, cat, 3);
          return items.slice(0, 3);
        });
      },
      /* [변경] 바로 후보에 넣지 않는다 — 위쪽 AI 목록에 담아 두고 골라 올린다 */
      onDone: function (list) {
        var rows = list.map(function (d, i) {
          return { key: d.place_url || d.place_name, nm: d.place_name, cat: cat,
                   lat: +d.y, lng: +d.x, addr: d.road_address_name || d.address_name || '',
                   url: d.place_url || '', why: M.AI.WHY[i % M.AI.WHY.length] };
        });
        S.setAi(m.id, 'place', rows, replace);
        M.toast('AI가 ' + rows.length + '곳을 골랐어요 — 위 목록에서 후보로 올려주세요');
        M.sheet.go('half', true);
      }
    });
  }

  /* ---------------- 화면 ---------------- */
  function paint(id) {
    var m = S.get(id);
    if (!m) { M.router.go('/hub'); return; }
    if (m.stage !== M.router.name) { M.router.goMeeting(m); return; }

    var voting = m.stage === 'vote-place';
    var ratio = voting ? S.voted(m) / Math.max(1, m.members.length)
                       : Math.min(1, m.placeCandidates.length / 3);
    var text = voting
      ? S.voted(m) + '/' + m.members.length + ' 투표' + (S.nonVoters(m).length ? ' · 미투표: ' + S.nonVoters(m).join(', ') : ' · 전원 완료')
      : '후보 ' + m.placeCandidates.length + '곳 · 반경 ' + M.fmtDist(m.radius);

    M.flow.stagebar(m, { ratio: ratio, text: text });
    drawCircle(m);
    drawCands(m);
    if (voting) { clearPreviews(); renderSheet(m); }
    else if (!loading) renderSheet(m);
  }

  function makeScreen(name) {
    return {
      layer: 'map', tab: 1,
      enter: function (ctx) {
        dis = M.util.disposer();
        M.sheet.mode = 'flow';
        $('device').setAttribute('data-ui', 'on');
        $('device').setAttribute('data-tabs', 'on');
        $('explore').hidden = true;
        M.sheet.onEscape = function () { M.router.go('/hub'); };

        var m0 = S.get(ctx.code);
        if (m0 && m0.purpose && PLACE_CATS.some(function (p) { return p.label === m0.purpose; })) cat = m0.purpose;

        view = { mode:'list', place:null, detail:null };

        /* ⑧ 에서만 검색으로 후보를 넣을 수 있다 — ⑨ 는 후보가 잠긴 뒤다.
           고른 결과는 바로 등록하지 않고 상세를 먼저 연다(지도 핀과 같은 길). */
        if (name === 'place') {
          var m0 = S.get(ctx.code), c0 = m0 ? centerOf(m0) : null;
          M.flow.search({
            dis: dis,
            placeholder: (c0 ? c0.dong : '') + ' 주변 장소 검색',
            head: '검색 결과 — 누르면 상세 정보', tail: '정보 ›',
            near: (M.map.ready && c0) ? new kakao.maps.LatLng(c0.lat, c0.lng) : null,
            radius: m0 ? m0.radius * 2 : 1400,
            onpick: function (x) { openPlace(S.get(ctx.code), x); }
          });
        } else {
          M.flow.search(null);
        }

        offStore = S.on(function () { if (M.router.name === name) paint(ctx.code); });
        paint(ctx.code);
        M.soon(function () { M.sheet.layout(); M.sheet.go('peek', true); });

        M.map.whenReady(function () {
          if (M.router.name !== name) return;
          var m = S.get(ctx.code);
          if (!m) return;
          paint(ctx.code);
          if (name === 'place') loadPreviews(m);
          dis.on($('locate'), 'click', function () {
            var mm = S.get(ctx.code), c = centerOf(mm);
            M.map.map.setLevel(4);
            M.map.map.panTo(new kakao.maps.LatLng(c.lat, c.lng));
            M.toast(c.dong + ' 중심 · 반경 ' + M.fmtDist(mm.radius));
          });
          var c = centerOf(m);
          M.map.map.setLevel(4);
          M.map.map.setCenter(new kakao.maps.LatLng(c.lat, c.lng));
        });

        /* 지도가 없어도 ⑧ 은 예시 장소로 걸어갈 수 있어야 한다 */
        if (name === 'place' && !M.map.ready) loadPreviews(S.get(ctx.code));
      },
      leave: function () {
        clearPreviews(); clearCands();
        lastItems = []; aiRows = [];
        if (circle) { circle.setMap(null); circle = null; }
        if (centerMk) { centerMk.setMap(null); centerMk = null; }
        M.AI.cancel();
        ++poiSeq; loading = false;
        $('flowtop').hidden = true;
        M.sheet.onEscape = null;
        if (offStore) { offStore(); offStore = null; }
        if (dis) { dis.all(); dis = null; }
      }
    };
  }

  M.router.register('place', makeScreen('place'));
  M.router.register('vote-place', makeScreen('vote-place'));

})(window.MOIMER);
