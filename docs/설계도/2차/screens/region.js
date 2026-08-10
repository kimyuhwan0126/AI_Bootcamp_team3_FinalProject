/* ============================================================
   ⑥ 지역 후보 — 핑 등록 · ⑦ 지역 투표

   두 화면은 같은 지도, 같은 오버레이, 같은 시트를 쓴다. 다른 것은 딱 두 가지다 —
   ⑥ 은 지도를 눌러 후보를 만들고, ⑦ 은 후보를 눌러 표를 준다.
   그래서 한 모듈에 담고 stage 로 갈랐다.

   '동 단위 스냅'은 Local.region(coord2regioncode) 이 통째로 해준다.
     · 병합 키 = doc.code (행정동 코드). 이름이 아니다 — 같은 이름 다른 동이 있다.
     · 스냅 위치 = 응답의 x/y (그 동의 대표점). 누른 자리가 아니라 동 중심에 찍힌다.
   키가 없으면 번들해 둔 행정동 중심점 표로 떨어진다 — 키 0개로도 여기까지 와야 하므로.

   이 파일은 ⑧⑨ 가 함께 쓰는 흐름 부품(M.flow)도 만든다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;

  /* ============================================================
     M.flow — ⑥⑦⑧⑨⑩ 공통 부품
     ============================================================ */
  var STEPS_PLACE  = ['ping', 'vote-region', 'place', 'vote-place', 'result'];
  var STEPS_REGION = ['ping', 'vote-region', 'result'];

  M.flow = {
    /* 단계 바 — 모임 이름 · 몇 번째 단계 · 진행률 · 미투표자.
       진행 문구만 aria-live 다. 통째로 다시 그리면 스크린리더가 모임 이름과 단계까지
       매번 다시 읽는다 — 봇이 투표할 때마다 그러면 못 쓴다.
       그래서 껍데기는 한 번만 만들고, 바뀌는 두 곳(막대·문구)만 갈아 끼운다. */
    stagebar: function (m, meta) {
      var steps = m.scope === 'region' ? STEPS_REGION : STEPS_PLACE;
      var i = steps.indexOf(m.stage);
      var el = $('stagebar');
      var sig = m.id + '|' + m.stage;
      el.hidden = false;
      if (el.getAttribute('data-sig') !== sig) {
        el.setAttribute('data-sig', sig);
        el.innerHTML =
          '<div class="sb-top">' +
            '<button class="sb-back" type="button" data-back="1" aria-label="모임 목록으로">‹</button>' +
            '<span class="sb-name">' + M.esc(m.name) + '</span>' +
            '<span class="sb-step">' + (i + 1) + '/' + steps.length + ' · ' + S.STAGE_LABEL[m.stage] + '</span>' +
          '</div>' +
          '<div class="sb-bar"><i></i></div>' +
          '<div class="sb-meta" role="status" aria-live="polite"></div>';
        el.querySelector('[data-back]').addEventListener('click', function () { M.router.go('/hub'); });
      }
      el.querySelector('.sb-bar i').style.width = Math.round((meta.ratio || 0) * 100) + '%';
      var mt = el.querySelector('.sb-meta');
      if (mt.textContent !== (meta.text || '')) mt.textContent = meta.text || '';
    },

    /* 멤버 출발지 핀 — '누가 어디서 오나'가 지도에 있어야 후보를 고를 수 있다 */
    memberPins: function (m, dis) {
      if (!M.map.ready) return [];
      return m.members.map(function (x, i) {
        var mk = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(x.origin.lat, x.origin.lng),
          map: M.map.map, image: M.pinImage(i), zIndex: 7,
          title: x.name + ' · ' + x.origin.nm
        });
        dis.add(function () { mk.setMap(null); });
        return mk;
      });
    },

    /* 흐름 화면 검색창 — 후보 모으는 단계(⑥⑧)에서만 띄운다.
       ① 탐색 탭처럼 검색해서 바로 후보에 넣을 수 있어야, 지도에서 찍는 것 말고도
       "아는 데가 있는" 사람이 이름으로 넣을 길이 생긴다.
       onpick(item) 은 화면마다 다르다 — ⑥ 은 그 자리의 동으로 스냅하고, ⑧ 은 상세를 연다. */
    search: function (opt) {
      var wrap = $('flowSearchWrap'), input = $('fq'), panel = $('flowPanel');
      if (!opt) { wrap.hidden = true; panel.hidden = true; input.value = ''; return; }
      wrap.hidden = false;
      input.placeholder = opt.placeholder || '검색해서 후보 추가';
      input.setAttribute('aria-label', opt.placeholder || '후보 검색');
      input.value = '';
      panel.hidden = true;

      var timer = null, seq = 0;
      function close() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); }
      function run(q) {
        var my = ++seq;
        M.Local.keyword(q, opt.near
          ? { location: opt.near, radius: opt.radius || 5000, sortByDistance: true, size: 12 }
          : { size: 12 }
        ).then(function (r) {
          if (my !== seq) return;
          var items = r.items || [];
          panel.innerHTML = items.length
            ? '<div class="sp-head">' + M.esc(opt.head || '검색 결과') + '</div>' +
              items.map(function (x, i) {
                return '<button class="sp-row" type="button" data-r="' + i + '">' +
                  M.ui.rowHTML('📍', x.place_name, x.road_address_name || x.address_name || '', opt.tail || '＋ 후보') +
                  '</button>';
              }).join('')
            : '<div class="sp-empty">"' + M.esc(q) + '" 결과가 없어요.<br>' +
              (M.map.ready ? '다른 이름으로 찾아보세요.' : '지도를 열지 못해 검색이 꺼져 있어요.') + '</div>';
          panel.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          Array.prototype.forEach.call(panel.querySelectorAll('[data-r]'), function (b) {
            b.addEventListener('click', function () {
              var x = items[+b.getAttribute('data-r')];
              input.value = ''; close(); input.blur();
              opt.onpick(x);
            });
          });
        });
      }
      opt.dis.on(input, 'input', function () {
        clearTimeout(timer);
        var v = input.value.trim();
        if (!v) { close(); return; }
        timer = setTimeout(function () { run(v); }, 280);
      });
      opt.dis.on(input, 'keydown', function (e) {
        if (e.key === 'Escape') { close(); input.blur(); }
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); var v = input.value.trim(); if (v) run(v); }
      });
      opt.dis.on($('device'), 'pointerdown', function (e) {
        if (!panel.hidden && !e.target.closest('#flowSearchWrap')) close();
      }, true);
      opt.dis.add(function () { clearTimeout(timer); wrap.hidden = true; panel.hidden = true; });
    },

    /* AI 추천 팔레트 — ⑥ 지역 · ⑧ 지점 공용.
       시트 맨 위에 따로 서서, 후보 목록과 섞이지 않는다.
       각 줄에서 [등록] ↔ [빼기] 를 오간다 (빼도 팔레트에는 남는다 — 다시 올릴 수 있게).
       rows: [{ key, nm, sub, on, info }] · on = 이미 후보에 올라가 있음 */
    aiHTML: function (rows, opt) {
      if (!rows.length) return '';
      var full = opt.full;
      return '<div class="ai-sec">' +
        '<div class="hd"><span class="t">✦ AI 추천 ' + M.esc(opt.label) + ' ' + rows.length + '곳</span>' +
        (opt.canClear ? '<button class="clear" type="button" data-ai-clear="1">목록 지우기</button>' : '') + '</div>' +
        rows.map(function (r, i) {
          return '<div class="ai-row"' + (r.on ? ' data-on="1"' : '') + '>' +
            '<span style="min-width:0"><span class="nm">' + M.esc(r.nm) + '</span>' +
            (r.sub ? '<span class="sub">' + M.esc(r.sub) + '</span>' : '') + '</span>' +
            (opt.info ? '<span class="info" data-ai-info="' + i + '" role="button" tabindex="0" ' +
                        'aria-label="' + M.esc(r.nm) + ' 상세 정보">ⓘ</span>' : '') +
            '<span class="ai-pill' + (r.on ? ' on' : '') + '" data-ai-toggle="' + i + '" role="button" tabindex="0"' +
              (!r.on && full ? ' data-full="1"' : '') + '>' +
              (r.on ? '빼기' : (full ? '가득참' : '＋ 등록')) + '</span>' +
          '</div>';
        }).join('') +
        (full ? '<p class="ai-note">후보가 이미 ' + S.MAX_CANDS + '개예요 — 하나를 빼야 더 올릴 수 있어요.</p>' : '') +
        '</div>';
    },
    bindAi: function (body, rows, opt) {
      function act(el, attr, fn) {
        Array.prototype.forEach.call(body.querySelectorAll('[' + attr + ']'), function (b) {
          function go(e) { e.stopPropagation(); e.preventDefault(); fn(rows[+b.getAttribute(attr)], b); }
          b.addEventListener('click', go);
          b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
        });
      }
      act(null, 'data-ai-toggle', function (r, b) {
        if (!r.on && b.getAttribute('data-full')) { M.toast('후보는 최대 ' + S.MAX_CANDS + '개예요'); return; }
        opt.onToggle(r);
      });
      if (opt.info) act(null, 'data-ai-info', function (r) { opt.onInfo(r); });
      var c = body.querySelector('[data-ai-clear]');
      if (c) c.addEventListener('click', opt.onClear);
    },

    /* 후보가 상한을 넘으면 방장이 투표를 시작할 수 없다 — ⑥ ⑧ 같은 문구, 같은 모달.
       등록을 막지 않고 여기서 세우는 이유: 모으는 동안은 자유롭게 담아 두고,
       넘어가기 직전에 추려내는 편이 실제 대화 순서에 맞다. */
    capGate: function (m, items, nameOf, onDrop) {
      if (items.length <= S.MAX_CANDS) return false;
      M.modal.open({
        title: '후보는 최대 ' + S.MAX_CANDS + '개까지 가능합니다',
        text: '지금 <b>' + items.length + '개</b>예요. ' +
              '<b>' + (items.length - S.MAX_CANDS) + '개</b>를 빼야 투표를 시작할 수 있습니다.',
        html: '<div class="mo-list">' + items.map(function (x, i) {
          return '<button class="mo-opt" type="button" data-drop="' + i + '">' +
            '<span style="min-width:0"><span class="nm">' + M.esc(nameOf(x)) + '</span></span>' +
            (x.ai ? '<span class="ai-tag">AI</span>' : '') +
            '<span class="vt" style="color:var(--danger)">빼기</span></button>';
        }).join('') + '</div>',
        actions: [{ label: '닫기' }],
        onrender: function (box) {
          Array.prototype.forEach.call(box.querySelectorAll('[data-drop]'), function (b) {
            b.addEventListener('click', function () {
              M.modal.close(true);
              onDrop(items[+b.getAttribute('data-drop')]);
            });
          });
        }
      });
      return true;
    },

    /* 지도가 없을 때 화면이 텅 비지 않게 — 왜 비었는지를 적는다 */
    mapNote: function () {
      if (M.map.ready) return '';
      return '<div class="note" style="margin-bottom:12px">지도를 열지 못해 <b>핀이 보이지 않습니다</b>. ' +
             '아래 목록으로는 그대로 진행할 수 있어요. (내정보 → 목업 도구 → 카카오 키 지우기 후 새로고침하면 다시 물어봅니다)</div>';
    },

    /* 초대 링크 — ④ 에서 한 번 받고 끝이면, 아직 안 들어온 사람에게 다시 보낼 길이 없다.
       순서도는 발급을 ④ 에만 그렸지만 실제로는 ⑥~⑨ 내내 필요하다. */
    inviteBtn: function () {
      return '<button class="cta secondary" type="button" data-invite="1" style="margin-top:8px">초대 링크</button>';
    },
    bindInvite: function (body, m) {
      var b = body.querySelector('[data-invite]');
      if (!b) return;
      b.addEventListener('click', function () {
        var url = location.origin + location.pathname + '#/join/' + m.id;
        M.modal.open({
          title: '초대 링크',
          text: '받은 사람은 <b>이름만</b> 적고 바로 들어옵니다. 지금 ' +
                '<b>' + m.members.length + '/' + S.MAX_MEMBERS + '명</b>이에요.',
          html: '<div class="fm-link" style="border:0;padding:0">' +
                  '<div class="code">' + m.id + '</div>' +
                  '<div class="url">' + M.esc(url) + '</div>' +
                '</div>',
          actions: [
            { label: '새 탭에서 열기', fn: function () { window.open(url, '_blank', 'noopener'); } },
            { label: '링크 복사', kind: 'primary', fn: function () { M.copy(url, '초대 링크를 복사했어요'); } }
          ]
        });
      });
    },

    /* 되돌리기 사다리 — ⑩ 에만 두면 '확정 → 투표'까지밖에 못 간다.
       순서도의 사다리는 '확정 → 투표 다시 → 후보부터 다시'이므로 투표 화면에도 있어야 한다.
       한 칸씩만 내려가고 표는 지우지 않는다. */
    reopenBtn: function (m) {
      var PREV = { 'vote-region':'지역 후보 다시 모으기', 'vote-place':'지점 후보 다시 모으기',
                   'place':'지역 투표 다시 열기' };
      if (!PREV[m.stage]) return '';
      return '<button class="cta secondary" type="button" data-reopen="1" style="margin-top:8px">' +
             '되돌리기 — ' + PREV[m.stage] + '</button>';
    },
    bindReopen: function (body, m) {
      var b = body.querySelector('[data-reopen]');
      if (!b) return;
      b.addEventListener('click', function () {
        M.modal.open({
          title: '한 칸 되돌릴까요?',
          text: '앞 단계를 다시 엽니다. <b>표는 지우지 않습니다</b> — 그대로 두고 후보만 다시 받아요.',
          actions: [{ label:'취소' }, { label:'되돌리기', kind:'primary', fn: function () {
            var next = S.reopen(m.id);
            if (!next) { M.toast('더 되돌릴 곳이 없어요'); return; }
            M.toast(S.STAGE_LABEL[next] + ' 로 되돌렸어요');
            M.router.go('/m/' + m.id + '/' + next);
          } }]
        });
      });
    },

    /* 방장 확정 — 동점이면 화면이 먼저 물어본다.
       순서도: 재량 선택 또는 재투표(횟수 무제한). */
    confirm: function (m, items, nameOf) {
      var lead = S.leaders(m);
      if (!lead.length) { M.toast('아직 아무도 투표하지 않았어요'); return; }

      if (lead.length === 1) {
        var one = items.filter(function (x) { return x.id === lead[0]; })[0];
        M.modal.open({
          title: '이대로 확정할까요?',
          text: '<b>' + M.esc(nameOf(one)) + '</b> 으로 정합니다.' +
                (S.voted(m) < m.members.length
                  ? '<br>아직 <b>' + S.nonVoters(m).join(', ') + '</b> 님이 투표하지 않았어요.'
                  : ''),
          actions: [
            { label: '조금 더 기다리기' },
            { label: '확정', kind: 'primary', fn: function () { doConfirm(m, one.id); } }
          ]
        });
        return;
      }

      var t = S.tally(m);
      M.modal.open({
        title: '동점이에요',
        text: '<b>' + lead.length + '곳</b>이 같은 표를 받았습니다. 방장이 하나를 고르거나, 다시 투표할 수 있어요.',
        html: '<div class="mo-list">' + lead.map(function (id) {
          var x = items.filter(function (y) { return y.id === id; })[0];
          return '<button class="mo-opt" type="button" data-pick="' + id + '">' +
                 '<span class="nm">' + M.esc(nameOf(x)) + '</span>' +
                 '<span class="vt">' + t[id] + '표</span></button>';
        }).join('') + '</div>',
        actions: [
          { label: '닫기' },
          { label: '재투표 (표 초기화)', fn: function () { S.revote(m.id); M.toast('표를 지우고 다시 투표합니다'); } }
        ],
        onrender: function (box) {
          Array.prototype.forEach.call(box.querySelectorAll('[data-pick]'), function (b) {
            b.addEventListener('click', function () {
              M.modal.close(true);
              doConfirm(m, b.getAttribute('data-pick'));
            });
          });
        }
      });
    }
  };

  function doConfirm(m, choice) {
    var next = S.confirm(m.id, choice);
    M.toast(next === 'place' ? '지역 확정 — 이제 지점을 골라요'
          : next === 'result' ? '확정했어요'
          : '확정했어요');
    M.router.go('/m/' + m.id + '/' + next);
  }

  /* ============================================================
     ⑥ ⑦ 본체
     ============================================================ */
  var dis = null, offStore = null, overlays = [], busy = false;

  function clearOverlays() {
    overlays.forEach(function (o) { o.setMap(null); });
    overlays = [];
  }

  function pingLabel(m, p) {
    if (m.stage === 'ping') return p.dong + (p.by.length ? ' · 핑 ' + p.by.length : (p.ai ? ' · AI' : ' · 미배정'));
    var t = S.tally(m);
    return p.dong + ' ' + (t[p.id] || 0) + '표';
  }

  function drawPings(m) {
    clearOverlays();
    if (!M.map.ready) return;
    var t = S.tally(m), lead = S.leaders(m), me = S.me(m.id);
    var mine = m.regionVotes[me];

    m.pings.forEach(function (p) {
      var ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        zIndex: (lead.indexOf(p.id) >= 0 && m.stage !== 'ping') ? 8 : 4,
        yAnchor: 1, xAnchor: 0.5
      });
      var el = document.createElement('div');
      el.className = 'ov-ping' + (p.ai ? ' ai' : '') + (mine === p.id ? ' mine' : '');
      if (m.stage !== 'ping') {
        el.setAttribute('data-votes', t[p.id] || 0);
        if (lead.indexOf(p.id) >= 0 && t[p.id]) el.setAttribute('data-rank', '1');
      }
      el.innerHTML = '<div class="bubble">' + M.esc(pingLabel(m, p)) + '</div>' +
                     '<div class="stem"></div><div class="dot"></div>';
      el.addEventListener('click', function (e) { e.stopPropagation(); tapPing(m, p); });
      ov.setContent(el); ov.setMap(M.map.map);
      overlays.push(ov);
    });
  }

  function tapPing(m, p) {
    if (m.stage === 'ping') {
      /* 이미 있는 후보를 누르면 '나도 여기' — 인원당 1개라 내 핑이 옮겨간다 */
      var r = S.addPing(m.id, { code:p.code, nm:p.dong, full:p.full, lat:p.lat, lng:p.lng });
      M.toast(r.moved ? '핑을 ' + p.dong + '으로 옮겼어요' : p.dong + '에 핑을 찍었어요');
    } else {
      var had = m.regionVotes[S.me(m.id)] === p.id;
      S.vote(m.id, p.id);
      M.toast(had ? '표를 뺐어요' : p.dong + '에 투표했어요');
    }
  }

  /* 지도를 누르면 그 자리의 행정동으로 스냅한다 */
  function tapMap(m, latlng) {
    if (m.stage !== 'ping' || busy) return;
    busy = true;
    M.Local.dong(latlng).then(function (doc) {
      var d = doc
        ? { code: doc.code, nm: doc.region_3depth_name || doc.region_2depth_name, full: doc.address_name,
            lat: +doc.y || latlng.getLat(), lng: +doc.x || latlng.getLng() }
        /* 폴백 — 키가 없거나 조회가 막혔을 때. 번들 표에서 가장 가까운 동으로. */
        : M.nearestDong(latlng.getLat(), latlng.getLng());
      if (!d.nm) d = M.nearestDong(latlng.getLat(), latlng.getLng());
      var r = S.addPing(m.id, d);
      M.toast(r.merged ? '같은 동이라 병합했어요 — ' + d.nm
            : r.moved  ? '핑을 ' + d.nm + '으로 옮겼어요'
            : d.nm + '에 핑을 찍었어요');
    }).then(function () { busy = false; }, function () { busy = false; });
  }

  /* ---------------- 시트 ---------------- */
  var aiRows = [];

  function renderSheet(m) {
    var host = S.isHost(m);
    var voting = m.stage === 'vote-region';
    var me = S.me(m.id);
    var t = S.tally(m), lead = S.leaders(m);
    var mineVote = m.regionVotes[me];
    var minePing = m.pings.filter(function (p) { return p.by.indexOf(me) >= 0; })[0];

    $('sheetMini').style.display = 'flex';
    $('sheetMini').innerHTML =
      '<span class="ic" style="--c:var(--brand)">' + (voting ? '표' : '핑') + '</span>' +
      '<span class="nm">' + M.esc(m.name) + '</span>' +
      '<span class="rt"><span class="t">' + m.pings.length + '곳</span>' +
      '<span class="d">' + (voting ? S.voted(m) + '/' + m.members.length + ' 투표' : m.members.length + '명') + '</span></span>';

    var html =
      '<p class="eyebrow">' + (voting ? '② 지역 투표' : '① 지역 후보 모으기') + '</p>' +
      '<h2 class="headline">' + (voting ? '어디가 좋을까요?' : '가고 싶은 동네를 찍어주세요') + '</h2>' +
      '<p class="subline">' + (voting
        ? '핀이나 아래 목록을 눌러 <b>한 표</b>를 줍니다. 다시 누르면 취소, 다른 곳을 누르면 옮겨가요.'
        : '지도를 누르면 그 자리의 <b>동</b>으로 자동으로 맞춰집니다. <b>한 사람당 한 곳</b>이고, 같은 동은 하나로 합쳐져요.') +
      '</p>' +
      M.flow.mapNote();

    /* AI 추천 팔레트 — 후보 목록 위. 여기서 골라 올려야 후보가 된다. */
    if (!voting) {
      var pal = S.ai(m, 'region');
      aiRows = pal.map(function (x) {
        var hit = S.findPing(m, x);
        return { key:x.key, nm:x.nm, sub: hit ? '후보에 올라가 있어요' : (x.full || 'AI 추천'), on: !!hit, item:x, ping:hit };
      });
      html += M.flow.aiHTML(aiRows, {
        label: '지역', canClear: true,
        full: m.pings.length >= S.MAX_CANDS
      });
    }

    if (!m.pings.length) {
      html += '<div class="vt-none">아직 후보가 없어요.<br>' +
              (M.map.ready ? '지도를 눌러 첫 동네를 찍어보세요.' : '위 검색창으로 지역을 찾아 넣을 수 있어요.') + '</div>';
    } else {
      html += '<div class="section-title">후보 ' + m.pings.length + '곳' +
        (voting ? '' : ' <span style="font-weight:700;color:' +
          (m.pings.length > S.MAX_CANDS ? 'var(--danger)' : 'var(--ink-3)') + '">/ 최대 ' + S.MAX_CANDS + '</span>') +
        '</div><div class="vt-list">' +
        m.pings.map(function (p) {
          var who = p.by.map(function (b) { var x = S.member(m, b); return x ? x.name : ''; }).filter(Boolean).join(', ');
          var sub = voting
            ? (p.ai ? 'AI 추천 · ' : '') + M.esc(p.full)
            : (who ? who : (p.ai ? 'AI 추천' : '아직 아무도 안 골랐어요'));
          return '<button class="vt-row" type="button" data-p="' + p.id + '"' +
            (voting ? ' aria-pressed="' + (mineVote === p.id ? 'true' : 'false') + '" data-votes="' + (t[p.id] || 0) + '"' : '') + '>' +
            '<span style="min-width:0"><span class="nm">' + M.esc(p.dong) + '</span>' +
            '<span class="sub">' + sub + '</span></span>' +
            (p.ai ? '<span class="ai-tag">AI</span>' : '') +
            (voting
              ? '<span class="cnt">' + (t[p.id] || 0) + '<small>' + (lead.indexOf(p.id) >= 0 && t[p.id] ? '1위' : '표') + '</small></span>'
              : '<span class="cnt">' + p.by.length + '<small>핑</small></span>') +
            /* 후보 모으는 단계에서만 삭제 — 방장이거나, 아무도 안 골랐거나 나 혼자일 때 */
            (!voting && S.canDropPing(m, p)
              ? '<span class="del" data-del="' + p.id + '" role="button" tabindex="0" ' +
                'aria-label="' + M.esc(p.dong) + ' 후보에서 빼기">✕</span>'
              : '') +
          '</button>';
        }).join('') + '</div>';
    }

    if (!voting && minePing) html += '<p class="vt-mine">내 핑: ' + M.esc(minePing.dong) + '</p>';
    if (voting && mineVote) {
      var mv = m.pings.filter(function (p) { return p.id === mineVote; })[0];
      html += '<p class="vt-mine">내 표: ' + M.esc(mv ? mv.dong : '') + '</p>';
    }
    if (voting && S.nonVoters(m).length) {
      html += '<div class="note" style="margin-top:12px">아직 <b>' + M.esc(S.nonVoters(m).join(', ')) +
              '</b> 님이 투표하지 않았어요. 늦게 들어온 사람도 <b>확정 전까지</b>는 투표할 수 있습니다.</div>';
    }

    /* 방장 전용 — 순서도의 노랑 카드가 여기로 온다.
       지도 위에 띄우지 않고 시트에 두는 이유: 이 목업의 CTA 는 전부 시트에 있고,
       떠 있는 버튼을 늘리면 오른쪽 아래 쌓기 계산이 계속 늘어난다. */
    if (host) {
      html += '<div class="divider"></div>' +
        '<div class="section-title">방장</div>' +
        (voting
          ? '<div class="ctarow"><button class="cta" type="button" data-confirm="1">지역 확정</button>' +
            '<button class="cta secondary" type="button" data-revote="1">재투표</button></div>' +
            M.flow.reopenBtn(m) + M.flow.inviteBtn()
          : '<div class="ctarow"><button class="cta secondary" type="button" data-ai="1">AI 추천</button>' +
            '<button class="cta" type="button" data-start="1">투표 시작</button></div>' +
            M.flow.inviteBtn()) +
        '<div class="note" style="margin-top:12px">' + (voting
          ? '동점이면 <b>재량 선택</b>이나 <b>재투표</b>를 고를 수 있어요. 재투표 횟수에 제한은 없습니다.'
          : 'AI 추천은 <b>눌렀을 때만</b> 비용이 듭니다. 투표를 시작하면 <b>핑이 잠깁니다</b>.') +
        '</div>';
    } else {
      html += '<div class="note" style="margin-top:14px">' +
        (voting ? '확정은 <b>방장</b>만 할 수 있어요.' : '<b>투표 시작</b>은 방장이 누릅니다.') +
        ' 방장 화면을 보려면 왼쪽 위 점선 알약으로 바꿔보세요.</div>';
    }

    $('sheetBody').innerHTML = html;
    bindSheet(m);
  }

  function bindSheet(m) {
    var body = $('sheetBody');

    /* AI 팔레트 — 등록/빼기. 후보에서 빼도 팔레트에는 남는다(다시 올릴 수 있게) */
    M.flow.bindAi(body, aiRows, {
      onToggle: function (r) {
        if (r.on) {
          if (!S.canDropPing(m, r.ping)) { M.toast('다른 사람이 고른 곳이에요 — 방장만 뺄 수 있어요'); return; }
          S.removePing(m.id, r.ping.id);
          M.toast(r.nm + ' 를 후보에서 뺐어요');
        } else {
          /* AI 후보는 누구의 한 표도 쓰지 않는다(anon) — '인원당 1개'가 흐트러지면 안 된다 */
          S.addPing(m.id, r.item, { ai: true, anon: true });
          M.toast(r.nm + ' 를 후보에 올렸어요');
          if (M.map.ready) M.map.map.panTo(new kakao.maps.LatLng(r.item.lat, r.item.lng));
        }
      },
      onClear: function () { S.clearAi(m.id, 'region'); M.toast('AI 추천 목록을 지웠어요'); }
    });

    Array.prototype.forEach.call(body.querySelectorAll('[data-p]'), function (b) {
      b.addEventListener('click', function () {
        var p = m.pings.filter(function (x) { return x.id === b.getAttribute('data-p'); })[0];
        if (!p) return;
        tapPing(m, p);
        if (M.map.ready) M.map.map.panTo(new kakao.maps.LatLng(p.lat, p.lng));
      });
    });

    /* ✕ — 후보에서 통째로 뺀다. 줄 전체의 클릭(=내 핑 옮기기)까지 번지면 안 된다. */
    Array.prototype.forEach.call(body.querySelectorAll('[data-del]'), function (b) {
      function go(e) {
        e.stopPropagation(); e.preventDefault();
        var p = m.pings.filter(function (x) { return x.id === b.getAttribute('data-del'); })[0];
        if (!p) return;
        if (p.by.length > 1) {
          M.modal.open({
            title: M.esc(p.dong) + ' 를 뺄까요?',
            text: '<b>' + p.by.length + '명</b>이 고른 곳이에요. 빼면 그 사람들의 선택도 함께 사라집니다.',
            actions: [{ label:'취소' }, { label:'빼기', kind:'primary', fn: function () {
              S.removePing(m.id, p.id); M.toast(p.dong + ' 를 후보에서 뺐어요');
            } }]
          });
          return;
        }
        S.removePing(m.id, p.id);
        M.toast(p.dong + ' 를 후보에서 뺐어요');
      }
      b.addEventListener('click', go);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    });

    var start = body.querySelector('[data-start]');
    if (start) start.addEventListener('click', function () {
      if (M.AI.running()) { askCancelAI(m, function () { startVote(m); }); return; }
      startVote(m);
    });

    var ai = body.querySelector('[data-ai]');
    if (ai) ai.addEventListener('click', function () { askAI(m); });

    var conf = body.querySelector('[data-confirm]');
    if (conf) conf.addEventListener('click', function () {
      M.flow.confirm(m, m.pings, function (p) { return p ? p.dong : ''; });
    });

    var re = body.querySelector('[data-revote]');
    if (re) re.addEventListener('click', function () {
      M.modal.open({
        title: '다시 투표할까요?',
        text: '지금까지의 표를 지우고 <b>같은 후보</b>로 다시 받습니다. 후보는 그대로예요.',
        actions: [{ label: '취소' }, { label: '재투표', kind: 'primary',
          fn: function () { S.revote(m.id); M.toast('표를 지웠어요'); } }]
      });
    });

    M.flow.bindReopen(body, m);
    M.flow.bindInvite(body, m);
  }

  function startVote(m) {
    if (!m.pings.length) { M.toast('후보가 없어요 — 지도를 눌러 한 곳은 찍어주세요'); return; }
    /* AI가 올린 것까지 합쳐 5개를 넘으면 못 넘어간다 */
    if (M.flow.capGate(m, m.pings, function (p) { return p.dong; },
        function (p) {
          S.removePing(m.id, p.id);
          var mm = S.get(m.id);
          M.toast('후보에서 뺐어요 — 지금 ' + mm.pings.length + '개');
          if (mm.pings.length > S.MAX_CANDS) startVote(mm);
        })) return;
    if (m.pings.length === 1) {
      /* 후보가 하나면 투표는 형식이다 — 물어보고 바로 확정한다 */
      M.modal.open({
        title: '후보가 한 곳뿐이에요',
        text: '<b>' + M.esc(m.pings[0].dong) + '</b> 하나뿐이라 투표를 건너뛰고 바로 확정할까요?',
        actions: [
          { label: '더 모으기' },
          { label: '바로 확정', kind: 'primary', fn: function () { doConfirm(m, m.pings[0].id); } }
        ]
      });
      return;
    }
    M.modal.open({
      title: '투표를 시작할까요?',
      text: '시작하면 <b>핑이 잠겨</b> 후보를 더 넣을 수 없습니다. 후보 <b>' + m.pings.length + '곳</b>으로 투표해요.',
      actions: [
        { label: '취소' },
        { label: '시작', kind: 'primary', fn: function () {
          S.startVote(m.id);
          M.toast('투표를 시작했어요');
          M.router.go('/m/' + m.id + '/vote-region');
        } }
      ]
    });
  }

  function askCancelAI(m, then) {
    M.modal.open({
      title: 'AI 추천을 취소할까요?',
      text: '아직 결과가 오지 않았어요. 취소하고 지금 있는 후보로 투표를 시작합니다.',
      actions: [
        { label: '기다리기' },
        { label: '취소하고 시작', kind: 'primary', fn: function () { M.AI.cancel(); then(); } }
      ]
    });
  }

  /* AI 추천 — 두 번째 누름은 실행 전에 '교체 vs 추가'를 먼저 묻는다 */
  function askAI(m) {
    var had = S.ai(m, 'region');
    if (!had.length) { runAI(m, false); return; }
    M.modal.open({
      title: '다시 추천받을까요?',
      text: '먼저 받은 AI 추천 <b>' + had.length + '곳</b>을 어떻게 할까요?',
      actions: [
        { label: '이전 것 지우고 새로', kind: 'primary', fn: function () { runAI(m, true); } },
        { label: '기존에 더하기', fn: function () { runAI(m, false); } }
      ]
    });
  }

  function runAI(m, replace) {
    M.AI.ask({
      title: 'AI가 동네를 고르는 중',
      produce: function () { return M.AI.regions(m, 3); },
      /* [변경] 바로 후보에 넣지 않는다 — 위쪽 AI 목록에 담아 두고 사람이 골라 올린다.
         추천은 제안이지 결정이 아니고, 다섯 자리를 AI가 먼저 차지해서도 안 된다. */
      onDone: function (list) {
        var rows = list.map(function (d) {
          return { key:d.code, code:d.code, nm:d.nm, full:d.full, lat:d.lat, lng:d.lng };
        });
        S.setAi(m.id, 'region', rows, replace);
        M.toast('AI가 ' + rows.length + '곳을 골랐어요 — 위 목록에서 후보로 올려주세요');
        M.sheet.go('half', true);
      }
    });
  }

  /* ---------------- 화면 ---------------- */
  function paint(id) {
    var m = S.get(id);
    if (!m) { M.router.go('/hub'); return; }
    /* 단계가 바뀌었으면(봇이 아니라 나 자신이 옮겼어도) 그 화면으로 따라간다 */
    if (m.stage !== M.router.name) { M.router.goMeeting(m); return; }

    var voting = m.stage === 'vote-region';
    var ratio = voting
      ? S.voted(m) / Math.max(1, m.members.length)
      : m.members.filter(function (x) { return m.pings.some(function (p) { return p.by.indexOf(x.id) >= 0; }); }).length / Math.max(1, m.members.length);
    var text = voting
      ? S.voted(m) + '/' + m.members.length + ' 투표' + (S.nonVoters(m).length ? ' · 미투표: ' + S.nonVoters(m).join(', ') : ' · 전원 완료')
      : '후보 ' + m.pings.length + '곳 · ' + m.members.length + '명 중 ' +
        m.members.filter(function (x) { return m.pings.some(function (p) { return p.by.indexOf(x.id) >= 0; }); }).length + '명이 찍음';

    M.flow.stagebar(m, { ratio: ratio, text: text });
    drawPings(m);
    renderSheet(m);
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

        /* ⑥ 에서만 검색으로 후보를 넣을 수 있다 — ⑦ 은 핑이 잠긴 뒤라 검색창을 감춘다 */
        if (name === 'ping') {
          M.flow.search({
            dis: dis, placeholder: '지역·장소를 검색해 후보 추가', head: '검색 결과 — 그 자리의 동으로 들어갑니다',
            tail: '＋ 후보',
            onpick: function (x) {
              var mm = S.get(ctx.code);
              var lat = +x.y, lng = +x.x;
              var done = function (d) {
                var r = S.addPing(ctx.code, d);
                M.toast(r.merged ? '같은 동이라 병합했어요 — ' + d.nm
                      : r.moved  ? '핑을 ' + d.nm + '으로 옮겼어요'
                      : d.nm + '에 핑을 찍었어요');
                if (M.map.ready) M.map.map.panTo(new kakao.maps.LatLng(d.lat, d.lng));
              };
              if (!M.map.ready) { done(M.nearestDong(lat, lng)); return; }
              M.Local.dong(new kakao.maps.LatLng(lat, lng)).then(function (doc) {
                done(doc && doc.code
                  ? { code:doc.code, nm:doc.region_3depth_name || doc.region_2depth_name,
                      full:doc.address_name, lat:+doc.y || lat, lng:+doc.x || lng }
                  : M.nearestDong(lat, lng));
              });
              return mm;
            }
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
          M.flow.memberPins(m, dis);
          dis.kakao(M.map.map, 'click', function (e) { tapMap(S.get(ctx.code), e.latLng); });
          dis.on($('locate'), 'click', function () {
            var mm = S.get(ctx.code);
            var pts = mm.members.map(function (x) { return new kakao.maps.LatLng(x.origin.lat, x.origin.lng); })
              .concat(mm.pings.map(function (p) { return new kakao.maps.LatLng(p.lat, p.lng); }));
            M.map.fitTo(pts);
            M.toast('출발지 ' + mm.members.length + '곳 ↔ 후보 ' + mm.pings.length + '곳');
          });
          paint(ctx.code);
          var mm = S.get(ctx.code);
          M.map.fitTo(mm.members.map(function (x) { return new kakao.maps.LatLng(x.origin.lat, x.origin.lng); })
            .concat(mm.pings.map(function (p) { return new kakao.maps.LatLng(p.lat, p.lng); })));
        });
      },
      leave: function () {
        clearOverlays();
        M.AI.cancel();
        $('flowtop').hidden = true;
        M.sheet.onEscape = null;
        if (offStore) { offStore(); offStore = null; }
        if (dis) { dis.all(); dis = null; }
      }
    };
  }

  M.router.register('ping', makeScreen('ping'));
  M.router.register('vote-region', makeScreen('vote-region'));

})(window.MOIMER);
