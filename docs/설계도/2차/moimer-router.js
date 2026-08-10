/* ============================================================
   moimer router — 화면 11대의 내비게이션

   해시 라우트를 쓴다. 이유는 두 가지다.
     · serve.js 를 한 줄도 안 고쳐도 된다 (경로 라우팅이면 서버가 받아야 한다)
     · #/join/AB12CD 가 복사해서 새 탭에 붙일 수 있는 진짜 주소가 된다 —
       한 브라우저에서 방장 창과 참여자 창을 나란히 놓고 ⑤ 를 시연할 유일한 방법.

   화면은 두 속성으로 갈린다.
     data-screen — 화면별 치장 (11값)
     data-layer  — 구조적 표시/숨김 (map | page). 레지스트리가 정하고 손으로 쓰지 않는다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$;
  var screens = {};                    /* name → { layer, tab, title, enter, leave } */
  var cur = null, curName = '', pending = null;

  var ROUTES = [
    { re: /^\/home$/,                    name: 'home' },
    { re: /^\/hub$/,                     name: 'hub' },
    { re: /^\/me$/,                      name: 'me' },
    { re: /^\/create$/,                  name: 'create' },
    { re: /^\/join\/([A-Za-z0-9]+)$/,    name: 'join',  code: 1 },
    { re: /^\/m\/([A-Za-z0-9]+)\/([a-z-]+)$/, name: null, code: 1, stage: 2 }
  ];
  /* 모임 단계 이름 = 화면 이름 그대로 */
  var STAGE_SCREENS = { ping:1, 'vote-region':1, place:1, 'vote-place':1, result:1, past:1 };

  function parse(hash) {
    var raw = String(hash || '').replace(/^#/, '') || '/home';
    var qi = raw.indexOf('?');
    var path = qi < 0 ? raw : raw.slice(0, qi);
    var query = new URLSearchParams(qi < 0 ? '' : raw.slice(qi + 1));
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i].re);
      if (!m) continue;
      var r = ROUTES[i];
      var name = r.name || m[r.stage];
      if (!r.name && !STAGE_SCREENS[name]) return null;
      return { name: name, code: r.code ? m[r.code] : '', query: query, path: path };
    }
    return null;
  }

  var R = M.router = {
    layer: 'map',
    ctx: null,

    register: function (name, def) { screens[name] = def; },

    /* 지금 화면 이름 — 방장 전용 버튼 등이 "내가 어디에 있나"를 물을 때 */
    get name() { return curName; },

    go: function (path, replace) {
      var h = '#' + path;
      if (location.hash === h) { R.reenter(); return; }
      if (replace) location.replace(location.pathname + location.search + h);
      else location.hash = h;
    },

    /* 모임 하나를 그 모임의 현재 단계 화면으로 — 순서도의 "현재 단계 화면으로" */
    goMeeting: function (mtg) { R.go('/m/' + mtg.id + '/' + mtg.stage); },

    reenter: function () { render(parse(location.hash), true); },

    start: function () {
      window.addEventListener('hashchange', function () { render(parse(location.hash)); });
      bindTabs();
      /* 역할이 바뀌면(내가 다른 사람이 되면) 알약도 같이 바뀌어야 한다 */
      M.Store.on(function () { M.rolebar.sync(); });
      if (!location.hash) location.replace(location.pathname + location.search + '#/home');
      render(parse(location.hash));
    }
  };

  /* ---------------- 탭바 ---------------- */
  var TAB_ROUTE = ['/home', '/hub', '/me'];
  function bindTabs() {
    var btns = $('tabbar').querySelectorAll('button');
    Array.prototype.forEach.call(btns, function (b, i) {
      b.addEventListener('click', function () { R.go(TAB_ROUTE[i]); });
    });
  }
  function syncTabs(tab) {
    var btns = $('tabbar').querySelectorAll('button');
    Array.prototype.forEach.call(btns, function (b, i) {
      if (i === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  /* ---------------- 렌더 ---------------- */
  function render(ctx, force) {
    if (!ctx) { R.go('/home', true); return; }
    var def = screens[ctx.name];
    if (!def) { def = stub(ctx.name); }

    /* 지도가 필요한 화면인데 키가 없다 — 이때만 게이트를 띄운다.
       ②③④⑤⑪ 은 여기 걸리지 않고 그대로 열린다. */
    if (def.layer === 'map' && !M.gate.ok()) {
      pending = ctx;
      M.gate.show();
      return;
    }
    pending = null;
    M.gate.hide();

    /* 같은 화면·같은 인자면 다시 그리지 않는다 (해시만 건드린 경우) */
    if (!force && cur && curName === ctx.name && cur.code === ctx.code) { R.ctx = ctx; return; }

    if (cur && screens[curName] && screens[curName].leave) {
      try { screens[curName].leave(); } catch (e) { console.error('[moimer] leave 실패:', curName, e); }
    }
    M.modal.close(true);
    M.sheet.reset();

    var device = $('device');
    device.setAttribute('data-screen', ctx.name);
    device.setAttribute('data-layer', def.layer);
    /* page 레이어에서는 지도 UI 상태값이 의미가 없다 — 기본으로 되돌려 둔다 */
    if (def.layer === 'page') {
      device.setAttribute('data-ui', 'on');
      device.setAttribute('data-tabs', 'on');
      device.setAttribute('data-explore', 'off');
    }
    /* ① 과 모임 흐름은 상단 자리를 나눠 쓴다 — 한쪽이 뜨면 다른 쪽은 없다 */
    $('flowtop').hidden = (def.layer !== 'map' || ctx.name === 'home');
    M.map.topEl = (ctx.name === 'home') ? $('top') : $('flowtop');
    syncTabs(def.tab);

    cur = ctx; curName = ctx.name; R.ctx = ctx; R.layer = def.layer;
    M.soon(M.sheet.layout);

    try { def.enter(ctx); M.rolebar.sync(); M.Sim.sync(); }
    catch (e) {
      console.error('[moimer] enter 실패:', ctx.name, e);
      $('pageBody').innerHTML = '<div class="pg-empty">이 화면을 여는 중 오류가 났어요.<br>' +
        '<span style="font-size:11.5px">' + M.esc(e.message) + '</span></div>';
    }
  }

  /* 아직 안 만든 화면 — 빈 화면 대신 무엇이 없는지 적는다.
     단계별로 만들어 나가는 동안 라우터가 먼저 살아 있어야 하기 때문. */
  function stub(name) {
    return {
      layer: 'page', tab: 1,
      enter: function () {
        $('pageHead').innerHTML = '<h1 class="pg-title">' + M.esc(name) + '</h1>' +
          '<p class="pg-sub">아직 만들지 않은 화면</p>';
        $('pageBody').innerHTML = '<div class="pg-empty">이 화면은 다음 단계에서 만듭니다.</div>';
        $('page').setAttribute('data-foot', 'off');
      },
      leave: function () {}
    };
  }

  /* 지도가 늦게 준비돼도(키 입력·SDK 로딩) 기다리던 화면으로 들어간다 */
  M.map.whenReady(function () { if (pending) render(pending, true); });

})(window.MOIMER);
