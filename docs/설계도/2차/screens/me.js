/* ============================================================
   ③ 내정보 — 설정

   여기 값은 ④ 생성·⑤ 참여 폼에 자동으로 채워진다.
   저장은 이 기기(localStorage)뿐이고 계정 병합은 없다 — 그래서
   '데모 초기화'를 눌러도 이 값만은 살아남게 별도 키에 둔다.

   아래쪽 점선 상자는 [목업 전용] 이다. 순서도에 없는 화면이지만,
   방장 전용 버튼·AI 실패·신호등 같은 것들은 스위치 없이는 볼 방법이 없다.
   ============================================================ */
(function (M) {
  'use strict';

  var $ = M.$, S = M.Store;
  var dis = null;

  function render() {
    if (M.router.name !== 'me') return;
    var me = S.defaults();

    $('pageHead').innerHTML =
      '<h1 class="pg-title">내정보</h1>' +
      '<p class="pg-sub">기본값은 참여 폼에 자동으로 채워집니다</p>';

    $('pageBody').innerHTML =
      /* 카카오 로그인 — 방장이 되려면 필요하다(순서도: 모임 생성은 로그인 필수) */
      '<div class="mi-kcard">' +
        '<span class="av" aria-hidden="true">' + (me.login ? '🙂' : '💬') + '</span>' +
        '<span style="min-width:0"><span class="nm">' + M.esc(me.login ? me.name : '로그인하지 않음') + '</span>' +
        '<span class="st">' + (me.login ? '카카오 로그인됨' : '모임을 만들려면 로그인이 필요해요') + '</span></span>' +
        '<button type="button" data-login="1">' + (me.login ? '로그아웃' : '카카오 로그인') + '</button>' +
      '</div>' +

      '<div class="fld"><span class="fld-label">기본 출발지</span>' +
        '<div class="searchwrap" style="margin:0">' +
          '<input type="text" id="miOrigin" value="' + M.esc(me.origin.nm) + '" placeholder="지역이나 역 이름" ' +
                 'autocomplete="off" role="combobox" aria-expanded="false" aria-controls="miPanel">' +
          '<div class="searchpanel" id="miPanel" role="listbox" aria-label="출발지 검색 결과" hidden></div>' +
        '</div>' +
        '<p class="fld-hint">모임마다 따로 고칠 수 있어요.</p>' +
      '</div>' +

      '<div class="fld"><span class="fld-label">기본 이동수단</span><div id="miMode"></div></div>' +

      '<div class="fld"><label for="miPin">기본 PIN — 참여 폼 자동 채움</label>' +
        '<input type="password" id="miPin" inputmode="numeric" maxlength="4" value="' + M.esc(me.pin) + '" placeholder="숫자 4자리">' +
        '<p class="fld-hint">비로그인으로 참여했을 때, 쿠키가 지워지면 <b>이름 + PIN</b>으로 되찾습니다.</p>' +
      '</div>' +

      '<button class="mi-switch" type="button" data-push="1" aria-pressed="' + (me.push ? 'true' : 'false') + '">' +
        '<span><span class="nm">앱 푸시 알림</span><span class="dd">투표 시작·확정 때 알려드려요</span></span>' +
        '<span class="tg" aria-hidden="true"></span></button>' +

      '<div class="note" style="margin-top:14px">저장은 <b>이 기기</b>에만 됩니다(localStorage). ' +
      '비로그인으로 참여한 기록과 카카오 계정을 <b>합치지 않습니다</b>.</div>' +

      toolsHTML();

    bind();
  }

  /* ---------------- 목업 도구 ---------------- */
  function toolsHTML() {
    var t = M.tools.all();
    function sw(key, nm, dd) {
      return '<button class="mi-switch" type="button" data-tool="' + key + '" aria-pressed="' + (t[key] ? 'true' : 'false') + '">' +
        '<span><span class="nm">' + nm + '</span><span class="dd">' + dd + '</span></span>' +
        '<span class="tg" aria-hidden="true"></span></button>';
    }
    return '<div class="mi-tools">' +
      '<div class="ti">목업 도구 [제품 아님]</div>' +
      '<div class="td">순서도에는 없는 스위치들입니다. 방장 전용 버튼·AI 실패·신호등처럼 ' +
      '평소에는 닿을 수 없는 상태를 눈으로 확인하려고 둡니다.</div>' +
      sw('rolebar', '역할 전환 알약', '모임 화면 왼쪽 위 · 방장 ↔ 참여자') +
      sw('simOn',   '다른 사람 자동 진행', '1.8초마다 봇이 한 칸씩 · 꺼도 ▶ 로 수동 진행') +
      sw('today',   '오늘로 취급',       '⑩ 도착 신호등은 모임 당일에만 켜집니다') +
      sw('aiReal',  'AI 실제 속도(25초)', '기본은 3.5초 · 진짜 소요로 한 번은 판단해야 합니다') +
      sw('aiFail',  'AI 항상 실패',      '실패 화면은 이 스위치 없이는 검토가 불가능합니다') +
      '<div class="ctarow" style="margin-top:12px">' +
        '<button class="cta secondary" type="button" data-reset="1">데모 초기화</button>' +
        '<button class="cta secondary" type="button" data-clearkey="1">카카오 키 지우기</button>' +
      '</div>' +
    '</div>';
  }

  function bind() {
    var body = $('pageBody');
    var me = S.defaults();

    /* 이동수단 세그먼티드 — ③④⑤ 가 같은 M.ui.seg 를 쓴다 */
    $('miMode').appendChild(M.ui.seg(['지하철', '버스', '자차', '도보'], me.mode, function (v) {
      var d = S.defaults(); d.mode = v; S.setDefaults(d);
      M.toast('기본 이동수단: ' + v);
    }));

    /* 기본 출발지 — ①의 검색 결과 줄(.sp-row)을 그대로 쓴다 */
    M.ui.placePicker($('miOrigin'), $('miPanel'), function (x) {
      if (!x) return;
      var d = S.defaults();
      d.origin = { nm:x.nm, lat:x.lat, lng:x.lng };
      S.setDefaults(d);
      M.toast('기본 출발지: ' + x.nm);
    }, dis);

    dis.on($('miPin'), 'input', function () {
      var v = $('miPin').value.replace(/\D/g, '').slice(0, 4);
      $('miPin').value = v;
      var d = S.defaults(); d.pin = v; S.setDefaults(d);
    });

    body.querySelector('[data-login]').addEventListener('click', function () {
      var d = S.defaults();
      d.login = !d.login;
      S.setDefaults(d);
      M.toast(d.login ? '카카오 로그인됨 (목업)' : '로그아웃했어요');
      render();
    });

    body.querySelector('[data-push]').addEventListener('click', function () {
      var d = S.defaults(); d.push = !d.push; S.setDefaults(d); render();
    });

    Array.prototype.forEach.call(body.querySelectorAll('[data-tool]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-tool');
        M.tools.set(k, M.tools.get(k) ? 0 : 1);
        if (k === 'simOn') M.Sim.sync();
        render();
      });
    });

    body.querySelector('[data-reset]').addEventListener('click', function () {
      M.modal.open({
        title: '데모 데이터를 초기화할까요?',
        text: '만든 모임과 투표가 모두 사라지고 <b>시드 4개</b>로 돌아갑니다.<br>' +
              '내정보 기본값(출발지·이동수단·PIN)은 <b>남습니다</b>.',
        actions: [
          { label: '취소' },
          { label: '초기화', kind: 'primary', fn: function () { S.reset(); M.toast('시드로 되돌렸어요'); render(); } }
        ]
      });
    });

    body.querySelector('[data-clearkey]').addEventListener('click', function () {
      localStorage.removeItem('moimer.kakaoJsKey');
      localStorage.removeItem('moimer.skipKey');
      M.toast('키를 지웠어요 — 새로고침하면 다시 묻습니다');
    });

    $('page').setAttribute('data-foot', 'off');
    $('pageFoot').innerHTML = '';
  }

  M.router.register('me', {
    layer: 'page', tab: 2,
    enter: function () { dis = M.util.disposer(); render(); },
    leave: function () { if (dis) { dis.all(); dis = null; } }
  });

})(window.MOIMER);
