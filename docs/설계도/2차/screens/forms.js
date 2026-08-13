/* ============================================================
   ④ 모임 생성 (방장 · 카카오 로그인) · ⑤ 참여 — 링크 진입 (참여자 · 이름만)

   두 화면은 같은 폼 부품을 쓴다 — 출발지 검색, 이동수단 세그먼티드, 하단 고정 CTA.
   다른 것은 '무엇을 처음 정하느냐'뿐이다.
     ④ 는 모임의 규칙(범위·목적·시간)을 정하고 초대 링크를 만든다.
     ⑤ 는 나를 등록하고 그 모임의 사람이 된다 — 링크는 곧 신원 인계다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;
  var PURPOSES = ['음식', '카페', '술집', '문화', '야외'];

  /* ============================================================
     ④ 모임 생성
     ============================================================ */
  var cDis = null, form = null, made = null;

  function nowLocal() {
    var d = new Date(), p = M.ui.pad2;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderCreate(ctx) {
    var me = S.defaults();

    /* 두 갈래로 프리필된다.
         ① 중간지점 시트 → 찍어 둔 출발지 꾸러미 (나머지는 ⑥ 의 미배정 핑으로)
         ⑪ 지난 모임 → 같은 이름·범위·목적으로 다시 */
    var hand = S.takeHandoff();
    var from = ctx.query.get('from') ? S.get(ctx.query.get('from')) : null;

    form = {
      name: from ? '(다시) ' + from.name : '',
      when: '',
      scope: from ? from.scope : 'place',
      purpose: (from && from.purpose) || '음식',
      origin: hand ? hand.host : { nm: me.origin.nm, lat: me.origin.lat, lng: me.origin.lng },
      mode: hand ? hand.host.mode : me.mode,
      seedPings: hand ? hand.rest : [],
      fromMembers: from ? from.members.filter(function (x) { return x.id !== from.hostId; }) : []
    };
    made = null;

    $('pageHead').innerHTML =
      '<button class="pg-back" type="button" data-back="1">‹ 뒤로</button>' +
      '<h1 class="pg-title">모임 만들기</h1>' +
      '<p class="pg-sub">' + (me.login ? '카카오 로그인됨 · 방장이 됩니다' : '방장은 카카오 로그인이 필요해요') + '</p>';

    $('pageBody').innerHTML =
      (me.login ? '' :
        '<div class="fm-err" style="margin-bottom:14px">모임을 만들려면 <b>카카오 로그인</b>이 필요합니다 — ' +
        '내정보 탭에서 로그인해 주세요. (목업이라 버튼 한 번이면 됩니다)</div>') +

      (form.seedPings.length
        ? '<div class="note" style="margin-bottom:14px">홈에서 찍어 둔 출발지 <b>' + (form.seedPings.length + 1) + '곳</b>을 가져왔어요.<br>' +
          '내 출발지는 아래에 채웠고, 나머지 ' + form.seedPings.length + '곳은 <b>지역 후보 핑</b>으로 옮겨 둡니다.</div>'
        : '') +
      (form.fromMembers.length
        ? '<div class="note" style="margin-bottom:14px">지난 모임의 멤버 <b>' + form.fromMembers.length + '명</b>에게 ' +
          '만든 뒤 <b>초대 링크</b>를 보내면 됩니다 — 비로그인 참여자는 계정이 없어 자동 이전이 안 돼요.</div>'
        : '') +

      '<div class="fld"><label for="cName">모임 이름</label>' +
        '<input type="text" id="cName" maxlength="24" placeholder="예) 우리 팀 회식" value="' + M.esc(form.name) + '">' +
        '<div class="fm-err" id="cNameErr" hidden>모임 이름을 적어주세요</div>' +
      '</div>' +

      '<div class="fld"><label for="cWhen">모임 시간 <span style="font-weight:600;color:var(--ink-3)">(선택)</span></label>' +
        '<input type="datetime-local" id="cWhen" min="' + nowLocal() + '">' +
        '<p class="fld-hint">비워도 됩니다. 다만 <b>도착 신호등</b>은 시간이 있어야 켜져요.</p>' +
      '</div>' +

      '<div class="fld"><span class="fld-label">확정 범위</span><div id="cScope"></div>' +
        '<p class="fld-hint" id="cScopeHint"></p>' +
      '</div>' +

      '<div class="fld fld-purpose"><span class="fld-label">목적 카테고리</span>' +
        '<div class="fm-chips" id="cPurpose"></div>' +
        '<p class="fld-hint">지점 후보를 찾을 때 이 종류부터 보여줍니다.</p>' +
      '</div>' +

      '<div class="fld"><label for="cOrigin">내 출발지</label>' +
        '<div class="searchwrap" style="margin:0">' +
          '<input type="text" id="cOrigin" value="' + M.esc(form.origin.nm) + '" placeholder="지역이나 역 이름" ' +
                 'autocomplete="off" role="combobox" aria-expanded="false" aria-controls="cPanel">' +
          '<div class="searchpanel" id="cPanel" role="listbox" aria-label="출발지 검색 결과" hidden></div>' +
        '</div>' +
      '</div>' +

      '<div class="fld"><span class="fld-label">내 이동수단</span><div id="cMode"></div></div>' +

      '<div class="note">만들면 <b>6자리 참여 코드</b>와 초대 링크가 나옵니다. ' +
      '링크를 받은 사람은 <b>이름만</b> 적고 바로 들어옵니다 — 비밀번호도 가입도 없습니다. 정원은 8명이에요.</div>';

    $('page').setAttribute('data-foot', 'on');
    $('pageFoot').innerHTML = '<button class="cta" type="button" data-make="1"' + (me.login ? '' : ' disabled') + '>만들기 → 초대 링크 발급</button>';

    bindCreate();
  }

  function syncScope() {
    /* '지역까지'면 목적 카테고리는 쓸 데가 없다 — CSS 한 줄로 감춘다 */
    $('pageBody').setAttribute('data-scope', form.scope);
    $('cScopeHint').innerHTML = form.scope === 'region'
      ? '<b>지역까지</b> — 동네만 정하고 끝냅니다. 지점 후보·투표를 건너뛰고 바로 결과로 가요.'
      : '<b>지점까지</b> — 동네를 정한 뒤 그 안에서 가게까지 골라요.';
  }

  function bindCreate() {
    var body = $('pageBody');

    $('cScope').appendChild(M.ui.seg(
      [{ v:'region', label:'지역까지' }, { v:'place', label:'지점까지' }],
      form.scope, function (v) { form.scope = v; syncScope(); }));
    syncScope();

    $('cPurpose').innerHTML = PURPOSES.map(function (p) {
      return '<button class="ccard" type="button" data-pp="' + p + '" aria-pressed="' + (p === form.purpose ? 'true' : 'false') + '">' + p + '</button>';
    }).join('');
    Array.prototype.forEach.call($('cPurpose').children, function (b) {
      b.addEventListener('click', function () {
        form.purpose = b.getAttribute('data-pp');
        Array.prototype.forEach.call($('cPurpose').children, function (c) {
          c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
        });
      });
    });

    $('cMode').appendChild(M.ui.seg(['지하철', '버스', '자차', '도보'], form.mode, function (v) { form.mode = v; }));

    M.ui.placePicker($('cOrigin'), $('cPanel'), function (x) {
      if (x) form.origin = { nm:x.nm, lat:x.lat, lng:x.lng };
    }, cDis);

    cDis.on($('cName'), 'input', function () { $('cNameErr').hidden = true; });
    cDis.on($('cWhen'), 'change', function () { form.when = $('cWhen').value; });

    $('pageHead').querySelector('[data-back]').addEventListener('click', function () { history.back(); });

    var mk = $('pageFoot').querySelector('[data-make]');
    if (mk) mk.addEventListener('click', function () {
      form.name = $('cName').value.trim();
      form.when = $('cWhen').value;
      if (!form.name) { $('cNameErr').hidden = false; $('cName').focus(); return; }
      if (!form.origin || form.origin.lat == null) {
        /* 카카오 키가 없어 검색이 안 될 수도 있다 — 그때는 이름만 있는 출발지로 둔다 */
        var d = M.DONGS[0];
        form.origin = { nm: $('cOrigin').value.trim() || d.nm, lat: d.lat, lng: d.lng };
      }
      made = S.create({
        name: form.name, when: form.when, scope: form.scope, purpose: form.purpose,
        hostName: S.defaults().name, origin: form.origin, mode: form.mode,
        seedPings: form.seedPings
      });
      renderMade();
    });
  }

  /* 만든 직후 — 링크를 실제로 써볼 수 있게 세 갈래로 내놓는다.
     '새 탭에서 열기'가 있어야 방장 창과 참여자 창을 나란히 놓고 볼 수 있다. */
  function renderMade() {
    var url = location.origin + location.pathname + '#/join/' + made.id;

    $('pageHead').innerHTML =
      '<h1 class="pg-title">만들었어요</h1>' +
      '<p class="pg-sub">' + M.esc(made.name) + ' · 이제 사람을 부르면 됩니다</p>';

    $('pageBody').innerHTML =
      '<div class="fm-link">' +
        '<div class="fld-label" style="text-align:center">참여 코드</div>' +
        '<div class="code">' + made.id + '</div>' +
        '<div class="url" id="mkUrl">' + M.esc(url) + '</div>' +
        '<div class="ctarow">' +
          '<button class="cta secondary" type="button" data-copy="1">링크 복사</button>' +
          '<button class="cta secondary" type="button" data-newtab="1">새 탭에서 열기</button>' +
        '</div>' +
      '</div>' +
      '<div class="note">새 탭에서 링크를 열면 <b>참여자 입장</b>이 됩니다 — 이름을 적는 순간 ' +
      '내가 그 사람이 되고, 방장 전용 버튼은 사라집니다. ' +
      '원래대로 돌아오려면 모임 화면 왼쪽 위 <b>점선 알약</b>으로 방장을 다시 고르세요.</div>' +
      (made.pings.length
        ? '<div class="note" style="margin-top:10px">홈에서 가져온 출발지 <b>' + made.pings.length + '곳</b>이 ' +
          '지역 후보로 먼저 찍혀 있습니다. 아직 아무도 고르지 않은 <b>미배정 핑</b>이에요.</div>'
        : '');

    $('pageFoot').innerHTML =
      '<div class="ctarow">' +
        '<button class="cta secondary" type="button" data-hub="1">모임 목록</button>' +
        '<button class="cta" type="button" data-go="1">지역 후보 모으러 가기</button>' +
      '</div>';

    var body = $('pageBody');
    body.querySelector('[data-copy]').addEventListener('click', function () { M.copy(url, '초대 링크를 복사했어요'); });
    body.querySelector('[data-newtab]').addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
    $('pageFoot').querySelector('[data-hub]').addEventListener('click', function () { M.router.go('/hub'); });
    $('pageFoot').querySelector('[data-go]').addEventListener('click', function () { M.router.goMeeting(made); });
  }


  M.router.register('create', {
    layer: 'page', tab: 1,
    enter: function (ctx) { cDis = M.util.disposer(); renderCreate(ctx); },
    leave: function () { if (cDis) { cDis.all(); cDis = null; } }
  });

  /* ============================================================
     ⑤ 참여 — 링크 진입
     ============================================================ */
  var jDis = null, jForm = null;

  function renderJoin(ctx) {
    var m = S.get(ctx.code);
    if (!m) {
      $('pageHead').innerHTML = '<h1 class="pg-title">없는 링크예요</h1>';
      $('pageBody').innerHTML = '<div class="pg-empty">이 참여 코드로는 모임을 찾을 수 없어요.<br>링크를 다시 확인해 주세요.</div>';
      $('page').setAttribute('data-foot', 'off');
      return;
    }

    /* 이 기기로 이미 이 모임에 들어온 적이 있으면 폼을 다시 보여줄 이유가 없다.
       S.me() 로 판단하면 안 된다 — 그건 아무도 안 정해졌을 때 첫 멤버(방장)를 돌려주므로,
       처음 링크를 걸어 온 사람까지 "이미 참여함"으로 튕겨버린다. */
    var joined = localStorage.getItem('moimer.joined.' + m.id);
    if (joined && S.member(m, joined) && ctx.query.get('again') !== '1') {
      S.setMe(m.id, joined);
      M.router.goMeeting(m);
      return;
    }

    /* 정원 초과 — 순서도: 8명이 상한, 초과분은 유료 구간 구상 */
    if (m.members.length >= S.MAX_MEMBERS) { renderFull(m); return; }

    var me = S.defaults();
    jForm = { origin: { nm: me.origin.nm, lat: me.origin.lat, lng: me.origin.lng }, mode: me.mode };

    $('pageHead').innerHTML =
      '<h1 class="pg-title">모임 참여</h1>' +
      '<p class="pg-sub">' + M.esc(m.name) + ' · 초대 링크로 들어왔어요 · 비밀번호 없음</p>';

    $('pageBody').innerHTML =
      '<div class="note" style="margin-bottom:16px">지금 <b>' + m.members.length + '명</b>이 있어요 ' +
      '(' + M.esc(m.members.map(function (x) { return x.name; }).join(', ')) + ').<br>' +
      '정원은 <b>' + S.MAX_MEMBERS + '명</b>입니다.</div>' +

      '<div class="fld"><label for="jName">이름</label>' +
        '<input type="text" id="jName" maxlength="12" placeholder="다른 사람이 알아볼 이름">' +
        '<div class="fm-err" id="jNameErr" hidden></div>' +
        '<p class="fld-hint">같은 이름이 있으면 별칭을 붙여주세요 — 투표에서 누가 누군지 갈라야 합니다.</p>' +
      '</div>' +

      '<div class="fld"><label for="jOrigin">출발지</label>' +
        '<div class="searchwrap" style="margin:0">' +
          '<input type="text" id="jOrigin" value="' + M.esc(jForm.origin.nm) + '" placeholder="지역이나 역 이름" ' +
                 'autocomplete="off" role="combobox" aria-expanded="false" aria-controls="jPanel">' +
          '<div class="searchpanel" id="jPanel" role="listbox" aria-label="출발지 검색 결과" hidden></div>' +
        '</div>' +
        '<p class="fld-hint">내정보 기본값을 채워 뒀어요. 출발지 수정은 <b>핑 잠금 전까지</b> 가능합니다.</p>' +
      '</div>' +

      '<div class="fld"><span class="fld-label">이동수단</span><div id="jMode"></div></div>' +

      (me.login ? '' :
        '<div class="fld"><label for="jPin">개인 PIN <span style="font-weight:600;color:var(--ink-3)">(비로그인만)</span></label>' +
          '<input type="password" id="jPin" inputmode="numeric" maxlength="4" value="' + M.esc(me.pin) + '" placeholder="숫자 4자리">' +
          '<p class="fld-hint">쿠키가 지워졌을 때 <b>이름 + PIN</b>으로 되찾습니다. 5회 틀리면 잠기고, ' +
          '그때는 방장이 강퇴한 뒤 다시 들어와야 해요.</p>' +
        '</div>') +

      '<div class="mi-tools" style="margin-top:18px">' +
        '<div class="ti">목업 도구 [제품 아님]</div>' +
        '<div class="td">정원 초과 거부 화면은 8명을 채워야 볼 수 있습니다.</div>' +
        '<button class="cta secondary" type="button" data-fill="1">봇으로 정원 채우기 (8명)</button>' +
      '</div>';

    $('page').setAttribute('data-foot', 'on');
    $('pageFoot').innerHTML = '<button class="cta" type="button" data-join="1">참여하기</button>';

    bindJoin(m);
  }

  function renderFull(m) {
    $('pageHead').innerHTML = '<h1 class="pg-title">모임 참여</h1><p class="pg-sub">' + M.esc(m.name) + '</p>';
    $('pageBody').innerHTML =
      '<div class="fm-reject">' +
        '<div class="ic" aria-hidden="true">🚪</div>' +
        '<h2 class="headline">정원이 찼어요</h2>' +
        '<p class="subline">이 모임은 <b>' + S.MAX_MEMBERS + '명</b>이 정원이고 이미 다 찼습니다.<br>' +
        '방장에게 자리를 비워달라고 해주세요.</p>' +
        '<div class="note" style="text-align:left;margin-top:16px">정원을 늘리는 것은 <b>유료 구간으로 구상</b> 중입니다. ' +
        '지금은 방장이 누군가를 <b>강퇴</b>해야 자리가 납니다 — 강퇴당한 사람도 다시 들어올 수 있어요.</div>' +
      '</div>';
    $('page').setAttribute('data-foot', 'on');
    $('pageFoot').innerHTML = '<button class="cta secondary" type="button" data-hub="1">모임 목록으로</button>';
    $('pageFoot').querySelector('[data-hub]').addEventListener('click', function () { M.router.go('/hub'); });
  }

  function bindJoin(m) {
    var nameEl = $('jName'), errEl = $('jNameErr');

    $('jMode').appendChild(M.ui.seg(['지하철', '버스', '자차', '도보'], jForm.mode, function (v) { jForm.mode = v; }));
    M.ui.placePicker($('jOrigin'), $('jPanel'), function (x) {
      if (x) jForm.origin = { nm:x.nm, lat:x.lat, lng:x.lng };
    }, jDis);

    /* 이름 중복은 제출할 때가 아니라 치는 동안 알려준다 —
       다 적고 눌렀는데 튕기면 처음부터 다시 읽어야 한다. */
    function checkName() {
      var v = nameEl.value.trim();
      var dup = v && m.members.some(function (x) { return x.name === v; });
      errEl.hidden = !dup;
      if (dup) errEl.innerHTML = '<b>' + M.esc(v) + '</b> 님이 이미 있어요 — 별칭을 붙여주세요 (예: ' + M.esc(v) + 'B)';
      return !dup && !!v;
    }
    jDis.on(nameEl, 'input', checkName);

    $('pageBody').querySelector('[data-fill]').addEventListener('click', function () {
      S.fill(m.id);
      M.toast('봇으로 ' + S.MAX_MEMBERS + '명을 채웠어요');
      M.router.reenter();
    });

    $('pageFoot').querySelector('[data-join]').addEventListener('click', function () {
      var v = nameEl.value.trim();
      if (!v) { errEl.hidden = false; errEl.textContent = '이름을 적어주세요'; nameEl.focus(); return; }
      if (!checkName()) { nameEl.focus(); return; }
      if (!jForm.origin || jForm.origin.lat == null) {
        var d = M.DONGS[0];
        jForm.origin = { nm: $('jOrigin').value.trim() || d.nm, lat:d.lat, lng:d.lng };
      }
      try {
        var pid = S.join(m.id, {
          name: v, origin: jForm.origin, mode: jForm.mode,
          pin: $('jPin') ? $('jPin').value : '', login: S.defaults().login
        });
        localStorage.setItem('moimer.joined.' + m.id, pid);
        M.toast(v + '님, 들어왔어요');
        M.router.goMeeting(S.get(m.id));
      } catch (e) {
        if (e.code === 'FULL') { renderFull(m); return; }
        if (e.code === 'DUP_NAME') { checkName(); nameEl.focus(); return; }
        M.toast('참여하지 못했어요');
      }
    });
  }

  M.router.register('join', {
    layer: 'page', tab: 1,
    enter: function (ctx) { jDis = M.util.disposer(); renderJoin(ctx); },
    leave: function () { if (jDis) { jDis.all(); jDis = null; } }
  });

})(window.MOIMER);
