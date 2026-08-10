/* ============================================================
   ⑩ 결과 — 모이기만 하면 됨

   전면 페이지가 아니라 '지도 + 높은 시트'로 만든다.
   순서도는 전면 화면으로 그렸지만 '지역까지' 변형이 명시적으로 "지도만"을 요구하고,
   시트는 이미 끌어내려 지도를 보는 어포던스를 그대로 준다. 내용은 어느 쪽이든 같다.

   경로는 여기서 처음 계산된다 — 확정 전에는 부를 이유가 없다.
   (지금은 직선거리 기반 추정. 실제 대중교통 시간은 ODsay 연동 후.)
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;
  var dis = null, offStore = null, spot = null, marks = [], circle = null;

  var ST_LABEL = { go:'도착 예정', late:'지각', no:'불참' };

  function clearMap() {
    if (spot) { spot.setMap(null); spot = null; }
    if (circle) { circle.setMap(null); circle = null; }
    marks.forEach(function (x) { x.setMap(null); });
    marks = [];
  }

  function targetOf(m) {
    var p = S.placeOf(m);
    if (p) return { nm:p.name, sub:p.addr, lat:p.lat, lng:p.lng, url:p.url, place:true };
    var r = S.regionOf(m);
    if (r) return { nm:r.dong, sub:r.full, lat:r.lat, lng:r.lng, url:'', place:false };
    return null;
  }

  function kakaoLink(t) {
    /* place_url 이 있으면 그게 제일 정확하다. 없으면(예시 데이터 등) 검색 딥링크로 보낸다. */
    return t.url || ('https://map.kakao.com/link/search/' + encodeURIComponent(t.nm));
  }

  function drawMap(m, t) {
    clearMap();
    if (!M.map.ready || !t) return;
    var pos = new kakao.maps.LatLng(t.lat, t.lng);

    var el = document.createElement('div');
    el.className = (t.place ? 'ov-cand' : 'ov-ping') + ' won';
    el.innerHTML = '<div class="bubble">' + M.esc(t.nm) + '</div><div class="stem"></div><div class="dot"></div>';
    spot = new kakao.maps.CustomOverlay({ position: pos, zIndex: 6, yAnchor: 1, xAnchor: 0.5 });
    spot.setContent(el); spot.setMap(M.map.map);

    /* '지역까지' 모임은 가게가 없다 — 동네 범위를 원으로 대신 보여준다 */
    if (!t.place) {
      circle = new kakao.maps.Circle({
        center: pos, radius: 700,
        strokeWeight: 1.6, strokeColor: '#2e7d32', strokeOpacity: 0.8, strokeStyle: 'dashed',
        fillColor: '#2e7d32', fillOpacity: 0.06, zIndex: 1
      });
      circle.setMap(M.map.map);
    }

    marks = M.flow.memberPins(m, { add: function (fn) { dis.add(fn); } });
    M.map.fitTo(m.members.map(function (x) { return new kakao.maps.LatLng(x.origin.lat, x.origin.lng); }).concat([pos]));
  }

  /* ---------------- 시트 ---------------- */
  function render(id) {
    var m = S.get(id);
    if (!m) { M.router.go('/hub'); return; }
    if (m.stage !== 'result') { M.router.goMeeting(m); return; }

    var t = targetOf(m);
    var host = S.isHost(m), me = S.me(m.id), meMem = S.member(m, me);
    var today = S.isToday(m);
    var showRoute = !!(t && t.place);      /* '지역까지'면 경로·링크·신호등을 숨긴다 */

    M.flow.stagebar(m, { ratio: 1, text: S.whenLabel(m) + ' · ' + m.members.length + '명 · ' + S.ddayLabel(m) });
    drawMap(m, t);

    $('sheetMini').style.display = 'flex';
    $('sheetMini').innerHTML =
      '<span class="ic" style="--c:var(--ok)">✓</span>' +
      '<span class="nm">' + M.esc(t ? t.nm : m.name) + '</span>' +
      '<span class="rt"><span class="t">' + S.ddayLabel(m) + '</span>' +
      '<span class="d">' + M.esc(S.whenLabel(m)) + '</span></span>';

    var html =
      '<p class="eyebrow">확정됨</p>' +
      '<div class="rs-card">' +
        '<span class="r1"><span class="nm">' + M.esc(t ? t.nm : '장소 미정') + '</span>' +
        '<span class="dday" data-tone="' + (m.when ? 'ok' : 'none') + '">' + S.ddayLabel(m) +
        (m.when ? ' · ' + M.esc(S.whenLabel(m).split(' ').pop()) : '') + '</span></span>' +
        (t && t.sub ? '<div class="ad">' + M.esc(t.sub) + '</div>' : '') +
      '</div>' +
      M.flow.mapNote();

    if (!m.when) {
      html += '<div class="fm-err" style="margin-bottom:12px">모임 <b>시간이 없어요</b> — ' +
              '도착 신호등은 시간이 있어야 켜집니다.' + (host ? ' 방장이 아래에서 넣을 수 있어요.' : '') + '</div>';
    }

    /* 내 경로 — 확정 후 여기서만 계산한다 (각자 출발지 기준) */
    if (showRoute && meMem && t) {
      var dist = M.map.ready
        ? M.map.metersBetween(new kakao.maps.LatLng(meMem.origin.lat, meMem.origin.lng), new kakao.maps.LatLng(t.lat, t.lng))
        : Math.round(Math.sqrt(Math.pow((meMem.origin.lat - t.lat) * 111000, 2) + Math.pow((meMem.origin.lng - t.lng) * 88000, 2)));
      html += '<div class="kv" style="margin-bottom:14px">' +
        '<div class="kv-row"><span class="k">내 경로 (' + M.esc(meMem.origin.nm) + ' → ' + M.esc(t.nm) + ')</span>' +
        '<span class="v">약 ' + M.estMinutes(dist, meMem.mode) + '분</span></div>' +
        '<div class="kv-row"><span class="k">직선거리 · 이동수단</span><span class="v">' +
        M.fmtDist(dist) + ' · ' + M.esc(meMem.mode) + '</span></div>' +
      '</div>';
    }

    /* 도착 신호등 — 모임 당일에만 활성 */
    if (showRoute) {
      html += '<div class="section-title">도착 신호등' + (today ? '' : ' <span style="font-weight:600;color:var(--ink-3)">— 모임 당일에 켜져요</span>') + '</div>' +
        '<div class="rs-sig' + (today ? '' : ' rs-lock') + '">' +
        m.members.map(function (x) {
          var isMe = x.id === me;
          var label = x.status ? (x.status === 'late' ? x.lateMin + '분 지각' : ST_LABEL[x.status]) : '아직';
          return '<' + (isMe && today ? 'button class="rs-row me" type="button" data-sig="1"' : 'div class="rs-row"') +
            ' data-st="' + (x.status || '') + '">' +
            '<span class="dot" aria-hidden="true"></span>' +
            '<span class="nm">' + M.esc(x.name) + (x.id === m.hostId ? ' (방장)' : '') + (isMe ? ' · 나' : '') + '</span>' +
            '<span class="st">' + M.esc(label) + '</span>' +
            (host && !isMe ? '<span class="kick" data-kick="' + x.id + '" role="button" tabindex="0">강퇴</span>' : '') +
            '</' + (isMe && today ? 'button' : 'div') + '>';
        }).join('') + '</div>';
      if (!today) {
        html += '<div class="note" style="margin-top:10px">지금은 잠겨 있어요. 확인하려면 ' +
                '<b>내정보 → 목업 도구 → 오늘로 취급</b>을 켜주세요.</div>';
      }
    } else {
      html += '<div class="note">이 모임은 <b>지역까지</b>만 정했어요 — 경로·지점 링크·도착 신호등은 ' +
              '가게가 정해져야 의미가 있어서 숨겨 둡니다. 지도에는 확정된 동네만 표시돼요.</div>';
    }

    /* 항상 있는 버튼 · 지점 모임만의 버튼 */
    html += '<div class="divider"></div>' +
      '<div class="ctarow">' +
        '<button class="cta" type="button" data-share="1">카카오톡 알리기</button>' +
        (showRoute ? '<button class="cta secondary" type="button" data-map="1">카카오맵</button>' : '') +
      '</div>';

    if (host) {
      html += '<div class="divider"></div><div class="section-title">방장</div>';
      if (m.scope === 'region') {
        html += '<button class="cta secondary" type="button" data-promote="1" style="margin-bottom:8px">지점도 정하기</button>';
      }
      html += '<div class="ctarow">' +
        '<button class="cta secondary" type="button" data-reopen="1">되돌리기</button>' +
        '<button class="cta secondary" type="button" data-del="1" style="color:var(--danger)">모임 삭제</button>' +
      '</div>' +
      '<div class="note" style="margin-top:12px"><b>되돌리기</b>는 한 칸씩 내려갑니다 — ' +
      (m.scope === 'region' ? '확정 → 지역 투표 → 지역 후보' : '확정 → 지점 투표 → 지점 후보 → 지역 투표 → 지역 후보') +
      '. <b>표는 그대로 남습니다.</b></div>';
    }

    html += '<div class="note" style="margin-top:12px">소요시간은 <b>직선거리 기반 추정값</b>입니다. ' +
            '실제 대중교통 시간은 ODsay 연동 후 반영됩니다.<br>' +
            '모임일 <b>다음날</b>이면 자동으로 지난 모임으로 넘어가요.</div>';

    $('sheetBody').innerHTML = html;
    bind(m, t);
  }

  function bind(m, t) {
    var body = $('sheetBody');

    var sig = body.querySelector('[data-sig]');
    if (sig) sig.addEventListener('click', function () { askStatus(m); });

    Array.prototype.forEach.call(body.querySelectorAll('[data-kick]'), function (b) {
      function run(e) {
        e.stopPropagation();
        var x = S.member(m, b.getAttribute('data-kick'));
        M.modal.open({
          title: M.esc(x.name) + ' 님을 내보낼까요?',
          text: '그 사람의 <b>핑과 표</b>도 함께 지워집니다. 초대 링크로 <b>다시 들어올 수는</b> 있어요.',
          actions: [{ label:'취소' }, { label:'강퇴', kind:'primary', fn: function () {
            S.kick(m.id, x.id); M.toast(x.name + ' 님을 내보냈어요');
          } }]
        });
      }
      b.addEventListener('click', run);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') run(e); });
    });

    var sh = body.querySelector('[data-share]');
    if (sh) sh.addEventListener('click', function () { share(m, t); });

    var mp = body.querySelector('[data-map]');
    if (mp) mp.addEventListener('click', function () { window.open(kakaoLink(t), '_blank', 'noopener'); });

    var pr = body.querySelector('[data-promote]');
    if (pr) pr.addEventListener('click', function () {
      M.modal.open({
        title: '지점까지 정할까요?',
        text: '확정된 <b>' + M.esc(t ? t.nm : '') + '</b> 안에서 가게를 고르는 단계로 넘어갑니다. ' +
              '지금까지의 지역 투표 결과는 그대로 남아요.',
        actions: [{ label:'취소' }, { label:'지점 정하기', kind:'primary', fn: function () {
          S.promote(m.id);
          M.toast('지점 후보를 모아요');
          M.router.go('/m/' + m.id + '/place');
        } }]
      });
    });

    var ro = body.querySelector('[data-reopen]');
    if (ro) ro.addEventListener('click', function () {
      var LADDER = { result: m.scope === 'region' ? '지역 투표' : '지점 투표' };
      M.modal.open({
        title: '한 칸 되돌릴까요?',
        text: '<b>' + LADDER.result + '</b> 단계로 돌아갑니다. <b>표는 지우지 않습니다</b> — ' +
              '그대로 두고 다시 열어요. 필요하면 거기서 한 칸 더 되돌릴 수 있습니다.',
        actions: [{ label:'취소' }, { label:'되돌리기', kind:'primary', fn: function () {
          var next = S.reopen(m.id);
          if (!next) { M.toast('더 되돌릴 곳이 없어요'); return; }
          M.toast(S.STAGE_LABEL[next] + ' 로 되돌렸어요');
          M.router.go('/m/' + m.id + '/' + next);
        } }]
      });
    });

    var del = body.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      M.modal.open({
        title: '모임을 삭제할까요?',
        text: '<b>' + M.esc(m.name) + '</b> 과(와) 모든 후보·표가 사라집니다. 되돌릴 수 없어요.',
        actions: [{ label:'취소' }, { label:'삭제', kind:'primary', fn: function () {
          S.remove(m.id); M.toast('모임을 삭제했어요'); M.router.go('/hub');
        } }]
      });
    });
  }

  /* 신호등 자가신고 — 노랑이면 몇 분인지까지 받는다(순서도: 전원 공유) */
  function askStatus(m) {
    M.modal.open({
      title: '어떻게 가고 계세요?',
      text: '고른 상태는 <b>모두에게</b> 바로 보입니다.',
      html: '<div class="mo-list">' +
        '<button class="mo-opt" type="button" data-st="go"><span class="nm">🟢 도착 예정 — 제때 갑니다</span></button>' +
        '<button class="mo-opt" type="button" data-st="late"><span class="nm">🟡 조금 늦어요</span></button>' +
        '<button class="mo-opt" type="button" data-st="no"><span class="nm">🔴 못 갑니다</span></button>' +
      '</div>',
      actions: [{ label: '닫기' }],
      onrender: function (box) {
        Array.prototype.forEach.call(box.querySelectorAll('[data-st]'), function (b) {
          b.addEventListener('click', function () {
            var st = b.getAttribute('data-st');
            M.modal.close(true);
            if (st === 'late') askLate(m);
            else { S.setStatus(m.id, st); M.toast(st === 'go' ? '도착 예정으로 알렸어요' : '불참으로 알렸어요'); }
          });
        });
      }
    });
  }

  function askLate(m) {
    var min = S.member(m, S.me(m.id)).lateMin || 10;
    M.modal.open({
      title: '몇 분쯤 늦으세요?',
      html: '<div class="rs-step">' +
        '<button type="button" data-d="-5" aria-label="5분 줄이기">−</button>' +
        '<span class="val" id="lateVal">' + min + '분</span>' +
        '<button type="button" data-d="5" aria-label="5분 늘리기">＋</button>' +
      '</div>',
      actions: [
        { label:'취소' },
        { label:'알리기', kind:'primary', fn: function () { S.setStatus(m.id, 'late', min); M.toast(min + '분 지각으로 알렸어요'); } }
      ],
      onrender: function (box) {
        Array.prototype.forEach.call(box.querySelectorAll('[data-d]'), function (b) {
          b.addEventListener('click', function () {
            min = Math.max(5, Math.min(120, min + (+b.getAttribute('data-d'))));
            $('lateVal').textContent = min + '분';
          });
        });
      }
    });
  }

  function share(m, t) {
    var url = location.origin + location.pathname + '#/m/' + m.id + '/result';
    var text = m.name + ' — ' + (t ? t.nm : '') + ' ' + S.whenLabel(m);
    if (navigator.share) {
      navigator.share({ title: m.name, text: text, url: url })
        .then(function () {}, function () { M.copy(text + '\n' + url, '공유 내용을 복사했어요'); });
      return;
    }
    M.copy(text + '\n' + url, '공유 내용을 복사했어요');
  }

  M.router.register('result', {
    layer: 'map', tab: 1,
    enter: function (ctx) {
      dis = M.util.disposer();
      M.sheet.mode = 'flow';
      $('device').setAttribute('data-ui', 'on');
      $('device').setAttribute('data-tabs', 'on');
      $('explore').hidden = true;
      M.sheet.onEscape = function () { M.router.go('/hub'); };

      offStore = S.on(function () { if (M.router.name === 'result') render(ctx.code); });
      render(ctx.code);
      M.soon(function () { M.sheet.layout(); M.sheet.go('half', true); });

      M.map.whenReady(function () {
        if (M.router.name !== 'result') return;
        render(ctx.code);
        dis.on($('locate'), 'click', function () {
          var mm = S.get(ctx.code), tt = targetOf(mm);
          if (!tt) return;
          M.map.fitTo(mm.members.map(function (x) { return new kakao.maps.LatLng(x.origin.lat, x.origin.lng); })
            .concat([new kakao.maps.LatLng(tt.lat, tt.lng)]));
          M.toast('전체 ' + mm.members.length + '곳 ↔ ' + tt.nm);
        });
      });
    },
    leave: function () {
      clearMap();
      $('flowtop').hidden = true;
      M.sheet.onEscape = null;
      if (offStore) { offStore(); offStore = null; }
      if (dis) { dis.all(); dis = null; }
    }
  });

})(window.MOIMER);
