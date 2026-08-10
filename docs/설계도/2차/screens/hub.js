/* ============================================================
   ② 모임 탭 — 통합 허브 · ⑪ 지난 모임 (읽기 전용)

   ② 는 모든 화면의 재진입 허브다. 카드를 누르면 그 모임의 '현재 단계 화면'으로 간다.
   필터는 두 줄로 나눈다 — 상태(전체·모집·투표·확정·마감)와 역할(방장·참여자).
   한 줄에 일곱 개를 몰아넣으면 무엇으로 걸러지는지가 안 읽힌다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;
  var STATUS = ['전체', '모집', '투표', '확정', '마감'];
  var ROLES  = ['방장', '참여자'];
  /* 필터는 화면을 오갈 때 유지된다 — 걸러 놓고 하나 눌러 보고 돌아왔는데
     다시 '전체'면 매번 다시 걸러야 한다. */
  var fStatus = '전체', fRoles = {};
  var offStore = null;

  function roleOf(m) { return S.isHost(m) ? '방장' : '참여자'; }

  function match(m) {
    if (fStatus !== '전체' && S.statusOf(m) !== fStatus) return false;
    var on = Object.keys(fRoles).filter(function (k) { return fRoles[k]; });
    if (on.length && on.indexOf(roleOf(m)) < 0) return false;
    return true;
  }

  function chips(row, list, isOn, onpick) {
    return '<div class="hb-frow' + (row === 'role' ? ' hb-frow--role' : '') + '" role="group">' +
      list.map(function (c) {
        return '<button class="ccard" type="button" data-f="' + row + '" data-v="' + M.esc(c) + '" ' +
               'aria-pressed="' + (isOn(c) ? 'true' : 'false') + '">' + M.esc(c) + '</button>';
      }).join('') + '</div>';
  }

  function cardHTML(m) {
    var past = m.stage === 'past';
    var todo = S.needsMyVote(m);
    var dl = S.ddayLabel(m);
    var tone = past ? 'past' : (m.when ? 'ok' : 'none');
    var sub = m.members.length + '명 · ' + S.whenLabel(m);
    if (S.isVoting(m)) sub += ' · 투표 ' + S.voted(m) + '/' + m.members.length;

    return '<button class="hb-card" type="button" data-go="' + m.id + '"' + (past ? ' data-past="1"' : '') + '>' +
      '<span class="r1"><span class="nm">' + M.esc(m.name) + '</span>' +
        '<span class="dday" data-tone="' + tone + '">' + dl + '</span></span>' +
      '<span class="r2">' +
        '<span class="hb-tag" data-k="' + (past ? 'past' : 'stage') + '">' + S.STAGE_LABEL[m.stage] + '</span>' +
        (S.isHost(m) ? '<span class="hb-tag" data-k="host">방장</span>' : '') +
        (m.scope === 'region' ? '<span class="hb-tag">지역까지</span>' : '') +
        (todo ? '<span class="hb-tag" data-k="todo">내 투표 필요</span>' : '') +
      '</span>' +
      '<span class="r3">' + M.esc(sub) + '</span>' +
    '</button>';
  }

  function render() {
    if (M.router.name !== 'hub') return;
    var all = S.list();
    var todo = all.filter(function (m) { return S.needsMyVote(m); });
    var shown = all.filter(match);

    $('pageHead').innerHTML =
      '<h1 class="pg-title">모임</h1>' +
      '<p class="pg-sub">투표할 것이 맨 위 · 카드를 누르면 그 모임의 지금 단계로 갑니다</p>';

    var html = '';
    /* 🔔 투표하세요 — 필터와 무관하게 항상 맨 위 (순서도: 투표할 것 상단 고정) */
    if (todo.length) {
      var t = todo[0];
      html += '<button class="hb-banner" type="button" data-go="' + t.id + '">' +
        '<span aria-hidden="true">🔔</span>' +
        '<span style="min-width:0"><span class="t">투표하세요!</span>' +
        '<span class="d">' + M.esc(t.name) + ' — ' + S.STAGE_LABEL[t.stage] +
        (todo.length > 1 ? ' 외 ' + (todo.length - 1) + '건' : '') + '</span></span>' +
        '<span class="go" aria-hidden="true">›</span></button>';
    }

    html += '<div class="hb-filters">' +
      '<div class="hb-flabel">상태</div>' +
      chips('status', STATUS, function (c) { return c === fStatus; }) +
      '<div class="hb-flabel" style="margin-top:8px">역할</div>' +
      chips('role', ROLES, function (c) { return !!fRoles[c]; }) +
    '</div>';

    html += shown.length
      ? '<div class="hb-list">' + shown.map(cardHTML).join('') + '</div>'
      : '<div class="pg-empty">이 조건에 맞는 모임이 없어요.<br>필터를 바꾸거나 아래에서 새로 만들어 보세요.</div>';

    $('pageBody').innerHTML = html;
    $('page').setAttribute('data-foot', 'on');
    $('pageFoot').innerHTML = '<button class="cta" type="button" data-new="1">+ 모임 만들기</button>';

    bind();
  }

  function bind() {
    Array.prototype.forEach.call($('pageBody').querySelectorAll('[data-f]'), function (b) {
      b.addEventListener('click', function () {
        var row = b.getAttribute('data-f'), v = b.getAttribute('data-v');
        if (row === 'status') fStatus = v;                    /* 단일 선택 */
        else fRoles[v] = !fRoles[v];                          /* 각각 토글 · 둘 다 꺼짐 = 전체 */
        render();
      });
    });
    Array.prototype.forEach.call($('pageBody').querySelectorAll('[data-go]'), function (b) {
      b.addEventListener('click', function () {
        var m = S.get(b.getAttribute('data-go'));
        if (m) M.router.goMeeting(m);
      });
    });
    $('pageFoot').querySelector('[data-new]').addEventListener('click', function () { M.router.go('/create'); });
  }

  M.router.register('hub', {
    layer: 'page', tab: 1,
    enter: function () {
      offStore = S.on(render);
      render();
    },
    leave: function () { if (offStore) { offStore(); offStore = null; } }
  });

  /* ============================================================
     ⑪ 지난 모임 — 읽기 전용
     재모임 버튼 외에는 전부 잠근다. 기록을 '볼 수만 있다'가 눈으로 읽혀야
     여기서 뭘 고치려 들지 않는다.
     ============================================================ */
  function renderPast(ctx) {
    var m = S.get(ctx.code);
    if (!m) { $('pageBody').innerHTML = '<div class="pg-empty">없는 모임이에요.</div>'; return; }

    var region = S.regionOf(m), place = S.placeOf(m);
    var where = place ? place.name : (region ? region.dong : '장소 미정');
    var whereSub = place ? (place.addr || '') : (region ? region.full : '');

    $('pageHead').innerHTML =
      '<button class="pg-back" type="button" data-back="1">‹ 모임</button>' +
      '<h1 class="pg-title">' + M.esc(m.name) + '</h1>' +
      '<p class="pg-sub">' + S.whenLabel(m) + ' · 종료됨 · 읽기 전용</p>';

    var host = S.isHost(m);
    $('pageBody').innerHTML =
      '<div class="pg-readonly">' +
        '<div class="rs-card">' +
          '<span class="r1"><span class="nm">' + M.esc(where) + '</span>' +
          '<span class="dday" data-tone="none">지난 모임</span></span>' +
          (whereSub ? '<div class="ad">' + M.esc(whereSub) + '</div>' : '') +
        '</div>' +
        '<div class="section-title" style="margin:16px 0 10px">함께한 멤버 ' + m.members.length + '명</div>' +
        '<div class="hb-list">' + m.members.map(function (x, i) {
          return '<div class="hb-mem"><span class="av" style="--c:' + M.COLORS[i % M.COLORS.length] + '">' +
            M.esc(x.name.slice(0, 1)) + '</span>' +
            '<span class="nm">' + M.esc(x.name) + '</span>' +
            '<span class="rl">' + (x.id === m.hostId ? '방장' : M.esc(x.origin.nm)) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="divider" style="margin:16px 0"></div>' +
        '<div class="kv">' +
          '<div class="kv-row"><span class="k">확정 범위</span><span class="v">' + (m.scope === 'region' ? '지역까지' : '지점까지') + '</span></div>' +
          (region ? '<div class="kv-row"><span class="k">확정 지역</span><span class="v">' + M.esc(region.dong) + '</span></div>' : '') +
          (place ? '<div class="kv-row"><span class="k">확정 지점</span><span class="v">' + M.esc(place.name) + '</span></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="note" style="margin-top:16px">재모임 버튼 외 모든 버튼은 <b>비활성</b>입니다 — 기록 열람만 가능해요.<br>' +
      '재모임을 만들면 <b>로그인 멤버는 자동으로 이전</b>되고, 비로그인 참여자는 초대 링크로 다시 들어옵니다.</div>';

    $('page').setAttribute('data-foot', 'on');
    $('pageFoot').innerHTML = host
      ? '<button class="cta" type="button" data-again="1">이 멤버로 재모임 만들기</button>'
      : '<button class="cta" type="button" disabled>재모임은 방장만 만들 수 있어요</button>';

    $('pageHead').querySelector('[data-back]').addEventListener('click', function () { M.router.go('/hub'); });
    var again = $('pageFoot').querySelector('[data-again]');
    if (again) again.addEventListener('click', function () { M.router.go('/create?from=' + m.id); });
  }

  var offPast = null;
  M.router.register('past', {
    layer: 'page', tab: 1,
    enter: function (ctx) {
      offPast = S.on(function () { if (M.router.name === 'past') renderPast(ctx); });
      renderPast(ctx);
    },
    leave: function () { if (offPast) { offPast(); offPast = null; } }
  });

})(window.MOIMER);
