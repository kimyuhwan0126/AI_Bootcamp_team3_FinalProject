/* ============================================================
   moimer store — 목업 상태 저장소 · 역할 · 시뮬 · AI

   백엔드가 없다. 순서도(기능 순서도)가 말하는 Neon Postgres · participantId 쿠키 ·
   1.8초 폴링은 Next.js 로 옮길 때의 이야기고, 여기서는 localStorage 한 덩어리로 대신한다.

   일부러 동기 API 다 — 목업에 프로미스를 끼우면 읽기만 나빠진다.
   가짜 지연은 M.AI 한 곳에만 있다.

   상한: 이 파일은 파생 상태 캐싱도, undo 스택도, 검증 라이브러리도 두지 않는다.
   클릭으로 보여줄 수 없는 규칙은 구현하지 않고 화면의 .note 에 글로 적는다.
   ============================================================ */
(function (M) {
  'use strict';

  var DB_KEY    = 'moimer.demo.v1';
  var ME_KEY    = 'moimer.me';        /* 내정보 기본값 — 데모 초기화에도 살아남는다 */
  var TOOL_KEY  = 'moimer.tools';
  var HANDOFF   = 'moimer.handoff';   /* ① → ④ 로 넘기는 출발지 꾸러미 */

  var MAX_MEMBERS = 8;
  /* 후보 상한 — 지역·지점 모두 같다. 여섯 개를 놓고 고르라고 하면
     표가 흩어져 1위가 안 나온다. AI가 넣은 것도 이 수에 포함된다. */
  var MAX_CANDS = 5;
  var CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* 0O1I 제외 — 불러줄 수 있어야 한다 */

  /* ---------------- 서울 행정동 중심점 ----------------
     ⑥ 의 '동 단위 스냅'은 Local.region(coord2regioncode) 이 제대로다.
     이 표는 카카오 키가 없을 때의 폴백이다 — 키 0개로도 ⑥ 을 끝까지 시연할 수 있어야 한다.
     AI 지역 추천도 이 표에서 고른다. */
  var DONGS = M.DONGS = [
    { code:'1144055000', nm:'연남동',   full:'서울 마포구 연남동',   lat:37.5626, lng:126.9256 },
    { code:'1144057000', nm:'서교동',   full:'서울 마포구 서교동',   lat:37.5520, lng:126.9199 },
    { code:'1144056000', nm:'합정동',   full:'서울 마포구 합정동',   lat:37.5495, lng:126.9137 },
    { code:'1144061000', nm:'망원동',   full:'서울 마포구 망원동',   lat:37.5559, lng:126.9020 },
    { code:'1144058000', nm:'상수동',   full:'서울 마포구 상수동',   lat:37.5478, lng:126.9226 },
    { code:'1144051000', nm:'아현동',   full:'서울 마포구 아현동',   lat:37.5548, lng:126.9560 },
    { code:'1144012000', nm:'공덕동',   full:'서울 마포구 공덕동',   lat:37.5443, lng:126.9515 },
    { code:'1141066000', nm:'연희동',   full:'서울 서대문구 연희동', lat:37.5686, lng:126.9295 },
    { code:'1141063000', nm:'신촌동',   full:'서울 서대문구 신촌동', lat:37.5595, lng:126.9426 },
    { code:'1120068000', nm:'성수동',   full:'서울 성동구 성수동',   lat:37.5445, lng:127.0447 },
    { code:'1120060000', nm:'왕십리동', full:'서울 성동구 왕십리동', lat:37.5615, lng:127.0290 },
    { code:'1121555000', nm:'화양동',   full:'서울 광진구 화양동',   lat:37.5442, lng:127.0713 },
    { code:'1121560000', nm:'자양동',   full:'서울 광진구 자양동',   lat:37.5340, lng:127.0820 },
    { code:'1123067000', nm:'회기동',   full:'서울 동대문구 회기동', lat:37.5896, lng:127.0574 },
    { code:'1123070000', nm:'장안동',   full:'서울 동대문구 장안동', lat:37.5722, lng:127.0651 },
    { code:'1168051000', nm:'역삼동',   full:'서울 강남구 역삼동',   lat:37.5006, lng:127.0364 },
    { code:'1168053000', nm:'논현동',   full:'서울 강남구 논현동',   lat:37.5110, lng:127.0224 },
    { code:'1168054000', nm:'삼성동',   full:'서울 강남구 삼성동',   lat:37.5140, lng:127.0565 },
    { code:'1168052000', nm:'청담동',   full:'서울 강남구 청담동',   lat:37.5238, lng:127.0480 },
    { code:'1168056000', nm:'신사동',   full:'서울 강남구 신사동',   lat:37.5237, lng:127.0203 },
    { code:'1171051000', nm:'잠실동',   full:'서울 송파구 잠실동',   lat:37.5133, lng:127.0838 },
    { code:'1171055000', nm:'방이동',   full:'서울 송파구 방이동',   lat:37.5133, lng:127.1177 },
    { code:'1171058000', nm:'가락동',   full:'서울 송파구 가락동',   lat:37.4950, lng:127.1183 },
    { code:'1165051000', nm:'서초동',   full:'서울 서초구 서초동',   lat:37.4923, lng:127.0079 },
    { code:'1165053000', nm:'방배동',   full:'서울 서초구 방배동',   lat:37.4816, lng:126.9970 },
    { code:'1159051000', nm:'사당동',   full:'서울 동작구 사당동',   lat:37.4767, lng:126.9814 },
    { code:'1156054000', nm:'여의도동', full:'서울 영등포구 여의도동', lat:37.5217, lng:126.9243 },
    { code:'1156051000', nm:'당산동',   full:'서울 영등포구 당산동', lat:37.5344, lng:126.9028 },
    { code:'1156052000', nm:'문래동',   full:'서울 영등포구 문래동', lat:37.5178, lng:126.8950 },
    { code:'1153051000', nm:'구로동',   full:'서울 구로구 구로동',   lat:37.4954, lng:126.8874 },
    { code:'1147051000', nm:'목동',     full:'서울 양천구 목동',     lat:37.5265, lng:126.8752 },
    { code:'1114055000', nm:'명동',     full:'서울 중구 명동',       lat:37.5636, lng:126.9827 },
    { code:'1114052000', nm:'을지로동', full:'서울 중구 을지로동',   lat:37.5660, lng:126.9910 },
    { code:'1111051500', nm:'종로1가동', full:'서울 종로구 종로1가동', lat:37.5704, lng:126.9826 },
    { code:'1111063000', nm:'혜화동',   full:'서울 종로구 혜화동',   lat:37.5860, lng:127.0018 },
    { code:'1117051000', nm:'이태원동', full:'서울 용산구 이태원동', lat:37.5343, lng:126.9946 },
    { code:'1117052000', nm:'한남동',   full:'서울 용산구 한남동',   lat:37.5345, lng:127.0025 },
    { code:'1130560000', nm:'불광동',   full:'서울 은평구 불광동',   lat:37.6100, lng:126.9296 },
    { code:'1130551000', nm:'수유동',   full:'서울 강북구 수유동',   lat:37.6383, lng:127.0254 }
  ];

  /* 위경도 → 가장 가까운 동. 서울 안에서만 쓰므로 평면 근사로 충분하다. */
  M.nearestDong = function (lat, lng) {
    var best = DONGS[0], bd = Infinity;
    DONGS.forEach(function (d) {
      var dy = (d.lat - lat) * 111, dx = (d.lng - lng) * 88;   /* 위도 37도 기준 */
      var s = dy * dy + dx * dx;
      if (s < bd) { bd = s; best = d; }
    });
    return best;
  };

  /* ---------------- 저장 ---------------- */
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function write(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

  var db = null, listeners = [];
  /* 메모리에 있는 db 가 유일한 진실이고 localStorage 는 그 사본이다.
     매번 다시 파싱하면 안 된다 — get() 으로 꺼낸 객체를 고치는 사이 다른 get() 이
     db 를 새 파싱본으로 갈아치우면, save() 는 고치지 않은 쪽을 저장하게 된다. */
  function load() {
    if (db) return db;
    db = read(DB_KEY, null);
    if (!db || !db.meetings || !db.meetings.length) { db = seed(); write(DB_KEY, db); }
    return db;
  }
  function save() { db.stamp = (db.stamp || 0) + 1; write(DB_KEY, db); emit(); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }

  function code6() {
    var s = '';
    for (var i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  function uid(p) { return p + Math.random().toString(36).slice(2, 7); }

  /* 지금부터 n일 뒤 hh:mm — <input type="datetime-local"> 이 그대로 먹는 모양 */
  function inDays(n, hh, mm) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hh, mm, 0, 0);
    var p = M.ui.pad2;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(hh) + ':' + p(mm);
  }

  /* ---------------- 시드 ----------------
     순서도 ② 그림이 그대로 뜨도록 맞춘 네 개. 좌표는 전부 하드코딩이라
     카카오 키가 없어도, 네트워크가 없어도 ② 는 뜬다. */
  function member(id, name, nm, lat, lng, mode, opt) {
    opt = opt || {};
    return { id:id, name:name, origin:{ nm:nm, lat:lat, lng:lng }, mode:mode,
             login: !!opt.login, pin: opt.pin || '', bot: !!opt.bot,
             status: opt.status || null, lateMin: opt.lateMin || 0 };
  }
  function dong(nm) { return DONGS.filter(function (d) { return d.nm === nm; })[0]; }
  function ping(id, nm, by, ai) {
    var d = dong(nm);
    return { id:id, code:d.code, dong:d.nm, full:d.full, lat:d.lat, lng:d.lng, by:by.slice(), ai:!!ai };
  }

  function seed() {
    var m1 = {
      id:'AB12CD', name:'우리 팀 회식', when: inDays(3, 19, 0),
      scope:'place', purpose:'음식', hostId:'p1', stage:'vote-region',
      members: [
        member('p1','김방장','역삼역',37.500622,127.036456,'지하철',{ login:1 }),
        member('p2','박영희','홍대입구역',37.557192,126.925381,'버스',{ bot:1, pin:'2345' }),
        member('p3','이민준','성수역',37.544581,127.055961,'자차',{ bot:1, pin:'3456' }),
        member('p4','김철수','강남역',37.497942,127.027621,'지하철',{ pin:'1234' })
      ],
      pings: [ ping('r1','연남동',['p2']), ping('r2','성수동',['p1','p3']), ping('r3','왕십리동',['p4']) ],
      /* 3/4 · 미투표: 철수 — ② 의 "투표하세요" 배너가 가리키는 바로 그 상태 */
      regionVotes: { p1:'r2', p2:'r1', p3:'r2' },
      confirmedRegion:null, radius:700, placeCandidates:[], placeVotes:{}, confirmedPlace:null
    };

    var m2 = {
      id:'EF34GH', name:'동아리 정모', when: inDays(7, 18, 30),
      scope:'place', purpose:'술집', hostId:'p1', stage:'vote-place',
      members: [
        member('p1','김방장','역삼역',37.500622,127.036456,'지하철',{ login:1 }),
        member('p2','정하늘','건대입구역',37.540408,127.070574,'지하철',{ bot:1 }),
        member('p3','최유진','잠실역',37.513950,127.100158,'버스',{ bot:1 }),
        member('p4','한도윤','왕십리역',37.561533,127.037732,'지하철',{ bot:1 }),
        member('p5','서지우','성수역',37.544581,127.055961,'도보',{ bot:1 })
      ],
      pings: [ ping('r1','성수동',['p1','p2']), ping('r2','자양동',['p3']), ping('r3','왕십리동',['p4','p5']) ],
      regionVotes: { p1:'r1', p2:'r1', p3:'r1', p4:'r3', p5:'r1' },
      confirmedRegion:'r1', radius:700,
      /* 2-2 동점 — ⑨ 의 동점 팝업이 한 번 탭 거리에 있어야 검토가 된다 */
      /* 좌표는 확정 동(성수동 37.5445,127.0447) 중심에서 반경 700m 안에 둔다 —
         밖에 두면 한 번 뺀 뒤 다시 넣을 수 없어 시드 자체가 막다른 길이 된다. */
      placeCandidates: [
        { id:'c1', name:'황소곱창 성수점', cat:'술집', lat:37.5451, lng:127.0472, addr:'서울 성동구 연무장길 12', url:'', by:'p1', ai:false },
        { id:'c2', name:'온기족발',        cat:'술집', lat:37.5432, lng:127.0492, addr:'서울 성동구 아차산로 7길 5', url:'', by:'p3', ai:false },
        { id:'c3', name:'성수동 브루어리',  cat:'술집', lat:37.5468, lng:127.0431, addr:'서울 성동구 성수이로 20', url:'', by:'p2', ai:true }
      ],
      placeVotes: { p1:'c1', p2:'c1', p3:'c2', p4:'c2' },
      confirmedPlace:null
    };

    var m3 = {
      id:'IJ56KL', name:'가족 모임', when: inDays(-9, 12, 0),
      scope:'region', purpose:'', hostId:'p1', stage:'past',
      members: [
        member('p1','김방장','역삼역',37.500622,127.036456,'지하철',{ login:1, status:'go' }),
        member('p2','어머니','수유역',37.638369,127.025307,'자차',{ bot:1, status:'go' }),
        member('p3','누나','목동역',37.526111,126.875099,'지하철',{ bot:1, status:'late', lateMin:15 })
      ],
      pings: [ ping('r1','혜화동',['p1','p2']), ping('r2','종로1가동',['p3']) ],
      regionVotes: { p1:'r1', p2:'r1', p3:'r2' },
      confirmedRegion:'r1', radius:700, placeCandidates:[], placeVotes:{}, confirmedPlace:null
    };

    /* 링크 전용 — ② 목록에는 안 뜨고 #/join/MN78OP 로만 닿는다. ⑤ 가 착지할 곳. */
    var m4 = {
      id:'MN78OP', name:'친구들 번개', when:'', hidden:true,
      scope:'place', purpose:'카페', hostId:'p1', stage:'ping',
      members: [
        member('p1','윤서준','신촌역',37.555134,126.936893,'지하철',{ login:1 }),
        member('p2','김철수','여의도역',37.521624,126.924191,'버스',{ bot:1 })
      ],
      pings: [ ping('r1','신촌동',['p1']) ],
      regionVotes:{}, confirmedRegion:null, radius:700,
      placeCandidates:[], placeVotes:{}, confirmedPlace:null
    };

    return {
      meetings: [m1, m2, m3, m4],
      /* 지금 내가 누구인지. m1 은 '아직 투표 안 한 철수'로 시작해야 배너가 참말이 된다.
         m2 는 방장이어야 동점 팝업까지 한 번에 닿는다. */
      meAs: { AB12CD:'p4', EF34GH:'p1', IJ56KL:'p3' },
      stamp: 0
    };
  }

  /* ---------------- 목업 도구 플래그 ---------------- */
  var tools = read(TOOL_KEY, null) || { rolebar:1, simOn:0, aiReal:0, aiFail:0, today:0 };
  M.tools = {
    get: function (k) { return tools[k]; },
    set: function (k, v) { tools[k] = v; write(TOOL_KEY, tools); emit(); },
    all: function () { return tools; }
  };

  /* ---------------- 저장소 ---------------- */
  var S = M.Store = {
    MAX_MEMBERS: MAX_MEMBERS,
    MAX_CANDS: MAX_CANDS,

    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    emit: emit,

    /* ② 목록 — 숨김(링크 전용) 모임은 빼고 시간순, 단 내가 아직 투표 안 한 것은 위로 */
    list: function () {
      load();
      var out = db.meetings.filter(function (m) { return !m.hidden; });
      out.sort(function (a, b) {
        var ta = S.needsMyVote(a) ? 0 : 1, tb = S.needsMyVote(b) ? 0 : 1;
        if (ta !== tb) return ta - tb;
        var pa = a.stage === 'past' ? 1 : 0, pb = b.stage === 'past' ? 1 : 0;
        if (pa !== pb) return pa - pb;
        return String(a.when || '9999').localeCompare(String(b.when || '9999'));
      });
      return out;
    },
    get: function (id) { load(); return db.meetings.filter(function (m) { return m.id === id; })[0] || null; },

    /* ---- 나 ---- */
    me: function (id) {
      load();
      var m = S.get(id); if (!m) return '';
      var pid = db.meAs[id];
      if (pid && m.members.some(function (x) { return x.id === pid; })) return pid;
      return m.members.length ? m.members[0].id : '';
    },
    setMe: function (id, pid) { load(); db.meAs[id] = pid; save(); },
    isHost: function (m) { return !!m && S.me(m.id) === m.hostId; },
    member: function (m, pid) { return m.members.filter(function (x) { return x.id === pid; })[0] || null; },
    meName: function (m) { var x = S.member(m, S.me(m.id)); return x ? x.name : '?'; },

    /* ---- 진행 상태 ---- */
    voteKey: function (m) { return m.stage === 'vote-place' ? 'placeVotes' : 'regionVotes'; },
    isVoting: function (m) { return m.stage === 'vote-region' || m.stage === 'vote-place'; },
    needsMyVote: function (m) { return S.isVoting(m) && !m[S.voteKey(m)][S.me(m.id)]; },
    voted: function (m) {
      var v = m[S.voteKey(m)] || {};
      return m.members.filter(function (x) { return v[x.id]; }).length;
    },
    nonVoters: function (m) {
      var v = m[S.voteKey(m)] || {};
      return m.members.filter(function (x) { return !v[x.id]; }).map(function (x) { return x.name; });
    },
    /* 표 집계 — 후보 id → 표수 */
    tally: function (m) {
      var v = m[S.voteKey(m)] || {}, out = Object.create(null);
      Object.keys(v).forEach(function (pid) { out[v[pid]] = (out[v[pid]] || 0) + 1; });
      return out;
    },
    /* 1위(들). 둘 이상이면 동점이다. */
    leaders: function (m) {
      var t = S.tally(m), top = 0, out = [];
      Object.keys(t).forEach(function (k) { if (t[k] > top) top = t[k]; });
      if (!top) return [];
      Object.keys(t).forEach(function (k) { if (t[k] === top) out.push(k); });
      return out;
    },
    candidates: function (m) { return m.stage === 'vote-place' || m.stage === 'place' ? m.placeCandidates : m.pings; },
    /* 확정된 것 꺼내기 — 저장은 id 로만 하므로 화면마다 이걸 거친다 */
    regionOf: function (m) { return m.pings.filter(function (p) { return p.id === m.confirmedRegion; })[0] || null; },
    placeOf:  function (m) { return m.placeCandidates.filter(function (c) { return c.id === m.confirmedPlace; })[0] || null; },

    STAGE_LABEL: {
      ping:'지역 후보 모으는 중', 'vote-region':'지역 투표 중',
      place:'지점 후보 모으는 중', 'vote-place':'지점 투표 중',
      result:'확정됨', past:'지난 모임'
    },
    /* ② 상태 필터 — 전체 · 모집 · 투표 · 확정 · 마감 */
    statusOf: function (m) {
      if (m.stage === 'past') return '마감';
      if (m.stage === 'result') return '확정';
      if (S.isVoting(m)) return '투표';
      return '모집';
    },

    /* ---- 쓰기 ---- */
    create: function (o) {
      load();
      var id = code6();
      while (S.get(id)) id = code6();
      var host = member('p1', o.hostName || '나', o.origin.nm, o.origin.lat, o.origin.lng, o.mode || '지하철', { login:1 });
      var m = {
        id:id, name:o.name, when:o.when || '', scope:o.scope || 'place',
        purpose: o.scope === 'region' ? '' : (o.purpose || '음식'),
        hostId:'p1', stage:'ping', members:[host],
        pings:[], regionVotes:{}, confirmedRegion:null,
        radius:700, placeCandidates:[], placeVotes:{}, confirmedPlace:null,
        createdAt: Date.now()
      };
      /* ① 에서 넘어온 나머지 출발지는 '미배정 핑'으로 앉힌다 —
         프로세스 순서도 ① 캡션이 말하는 그대로. */
      (o.seedPings || []).forEach(function (p, i) {
        /* ① 이 지도로 진짜 행정동을 붙여 넘겼으면 그걸 쓰고, 못 붙였을 때만 폴백 표로 */
        var d = p.code ? p : M.nearestDong(p.lat, p.lng);
        var same = m.pings.filter(function (x) { return x.code === d.code; })[0];
        if (same) return;
        m.pings.push({ id:'r' + (i + 1), code:d.code, dong:d.nm || '', full:d.full || '', lat:d.lat, lng:d.lng, by:[], ai:false, unassigned:true });
      });
      db.meetings.push(m);
      db.meAs[id] = 'p1';
      save();
      return m;
    },

    _push: function (id, o) {
      load();
      var m = S.get(id);
      if (!m) throw { code:'NO_MEETING' };
      if (m.members.length >= MAX_MEMBERS) throw { code:'FULL' };
      if (m.members.some(function (x) { return x.name === o.name; })) throw { code:'DUP_NAME' };
      var pid = uid('p');
      m.members.push(member(pid, o.name, o.origin.nm, o.origin.lat, o.origin.lng, o.mode || '지하철',
                            { pin:o.pin, login:!!o.login, bot:!!o.bot }));
      return pid;
    },
    /* 초대 링크로 들어오는 길 — 링크는 곧 신원 인계다. 걸으면 내가 그 사람이 된다. */
    join: function (id, o) {
      var pid = S._push(id, o);
      db.meAs[id] = pid;
      save();
      return pid;
    },
    /* [목업 전용] 링크를 오가지 않고 옆에서 한 명 밀어 넣는다.
       join 과 달리 meAs 를 건드리지 않는다 — 나는 계속 나로 남아야
       방장 화면을 보면서 사람이 느는 걸 확인할 수 있다. */
    addMember: function (id, o) {
      var pid = S._push(id, o);
      save();
      return pid;
    },

    /* ⑥ 핑 — 같은 동(코드)이면 병합, 인원당 하나 */
    addPing: function (id, d, opt) {
      opt = opt || {};
      var m = S.get(id), me = opt.by || S.me(id), moved = false;
      /* AI 가 얹는 후보는 누구의 한 표도 쓰지 않는다 — 사람 핑과 섞이면
         "인원당 1개" 규칙이 무너진다 */
      if (opt.anon) me = null;
      /* 내가 이미 다른 곳에 찍어 뒀으면 거기서 먼저 뺀다 */
      if (me) m.pings.forEach(function (p) {
        var i = p.by.indexOf(me);
        if (i >= 0) { p.by.splice(i, 1); moved = true; }
      });
      /* 병합 키는 행정동 코드다 — 이름으로 묶으면 '같은 이름 다른 동'이 뭉개진다.
         다만 폴백 표(키 없을 때)의 코드는 카카오의 진짜 코드와 다르다. 그래서
         코드가 안 맞아도 '이름이 같고 1.5km 안'이면 같은 동으로 본다 —
         같은 이름의 다른 행정동은 서로 훨씬 멀리 떨어져 있다. */
      var hit = m.pings.filter(function (p) { return p.code === d.code; })[0]
             || m.pings.filter(function (p) {
                  return p.dong && p.dong === d.nm && dist2(p, d) < 2.25;   /* dist2 는 km² — 1.5km */
                })[0];
      var merged = false;
      if (hit) {
        if (me && hit.by.indexOf(me) < 0) hit.by.push(me);
        if (me) hit.unassigned = false;
        if (opt.ai) hit.ai = true;
        merged = true;
      } else {
        m.pings.push({ id:uid('r'), code:d.code, dong:d.nm, full:d.full, lat:d.lat, lng:d.lng,
                       by: me ? [me] : [], ai: !!opt.ai, unassigned: !me });
      }
      /* 아무도 안 남은 핑은 지운다 — AI 가 얹어 둔 건 남긴다 */
      m.pings = m.pings.filter(function (p) { return p.by.length || p.ai || p.unassigned; });
      save();
      return { merged:merged, moved:moved };
    },
    removePing: function (id, pid) {
      var m = S.get(id);
      m.pings = m.pings.filter(function (p) { return p.id !== pid; });
      Object.keys(m.regionVotes).forEach(function (k) { if (m.regionVotes[k] === pid) delete m.regionVotes[k]; });
      save();
    },

    /* 같은 동인 핑 찾기 — addPing 의 병합 규칙과 같은 잣대여야
       "AI 목록에 등록됨으로 보이는데 실제로는 다른 핑" 같은 어긋남이 안 생긴다. */
    findPing: function (m, d) {
      return m.pings.filter(function (p) { return p.code === d.code; })[0]
          || m.pings.filter(function (p) {
               return p.dong && p.dong === (d.nm || d.dong) && dist2(p, d) < 2.25;
             })[0]
          || null;
    },

    /* 후보를 지울 수 있는가 — 방장이면 언제든, 아니면 아무도 안 골랐거나 나 혼자일 때만.
       남의 선택을 말없이 지우는 일이 없어야 한다. */
    canDropPing: function (m, p) {
      if (S.isHost(m)) return true;
      var me = S.me(m.id);
      return p.by.length === 0 || (p.by.length === 1 && p.by[0] === me);
    },

    /* ---- AI 추천 팔레트 ----
       AI가 고른 것을 바로 후보로 밀어 넣지 않는다. 따로 담아 두고 사람이 골라 올린다 —
       추천은 제안이지 결정이 아니고, 다섯 자리를 AI가 먼저 차지해서도 안 된다.
       호출에 돈이 드니 화면을 옮겨도 사라지지 않게 모임에 저장한다. */
    setAi: function (id, kind, list, replace) {
      var m = S.get(id), key = kind === 'place' ? 'aiPlaces' : 'aiRegions';
      var cur = replace ? [] : (m[key] || []);
      var seen = Object.create(null);
      cur.forEach(function (x) { seen[x.key] = 1; });
      (list || []).forEach(function (x) {
        if (seen[x.key]) return;
        seen[x.key] = 1; cur.push(x);
      });
      m[key] = cur;
      save();
      return cur;
    },
    ai: function (m, kind) { return (kind === 'place' ? m.aiPlaces : m.aiRegions) || []; },
    clearAi: function (id, kind) {
      var m = S.get(id);
      m[kind === 'place' ? 'aiPlaces' : 'aiRegions'] = [];
      save();
    },

    /* ⑧ 지점 후보 */
    addCandidate: function (id, c) {
      var m = S.get(id);
      if (m.placeCandidates.some(function (x) { return x.name === c.name; })) return false;
      m.placeCandidates.push({
        id: uid('c'), name:c.name, cat:c.cat || '', lat:c.lat, lng:c.lng,
        addr:c.addr || '', url:c.url || '', by: c.by || S.me(id), ai: !!c.ai, why: c.why || ''
      });
      save();
      return true;
    },
    removeCandidate: function (id, cid) {
      var m = S.get(id);
      m.placeCandidates = m.placeCandidates.filter(function (x) { return x.id !== cid; });
      Object.keys(m.placeVotes).forEach(function (k) { if (m.placeVotes[k] === cid) delete m.placeVotes[k]; });
      save();
    },
    setRadius: function (id, r) { var m = S.get(id); m.radius = r; save(); },

    /* 1인 1표 — 같은 곳을 다시 누르면 취소, 다른 곳이면 이동 */
    vote: function (id, key, opt) {
      var m = S.get(id), me = (opt && opt.by) || S.me(id), k = S.voteKey(m);
      if (m[k][me] === key) delete m[k][me];
      else m[k][me] = key;
      save();
    },

    /* 방장 — 후보를 잠그고 투표를 연다 */
    startVote: function (id) {
      var m = S.get(id);
      m.stage = (m.stage === 'ping') ? 'vote-region' : 'vote-place';
      save();
      return m.stage;
    },
    /* 방장 — 확정. 동점이면 화면이 먼저 물어보고 choice 를 넘겨준다. */
    confirm: function (id, choice) {
      var m = S.get(id);
      if (m.stage === 'vote-region' || m.stage === 'ping') {
        m.confirmedRegion = choice;
        m.stage = (m.scope === 'region') ? 'result' : 'place';
      } else {
        m.confirmedPlace = choice;
        m.stage = 'result';
      }
      save();
      return m.stage;
    },
    /* 방장 — 재투표. 표는 지우고 후보는 남긴다(순서도: 표 유지는 '되돌리기' 쪽 규칙) */
    revote: function (id) {
      var m = S.get(id);
      m[S.voteKey(m)] = {};
      save();
    },
    /* 방장 — 되돌리기 사다리. 한 칸씩만 내려가고 표는 그대로 둔다. */
    reopen: function (id) {
      var m = S.get(id);
      var LADDER = m.scope === 'region'
        ? { result:'vote-region', 'vote-region':'ping' }
        : { result:'vote-place', 'vote-place':'place', place:'vote-region', 'vote-region':'ping' };
      var next = LADDER[m.stage];
      if (!next) return null;
      if (m.stage === 'result') { if (m.scope === 'region') m.confirmedRegion = null; else m.confirmedPlace = null; }
      if (next === 'vote-region' && m.stage === 'place') m.confirmedRegion = null;
      m.stage = next;
      save();
      return next;
    },
    /* 방장 — '지점도 정하기' 승격 ('지역까지' 모임 전용) */
    promote: function (id) {
      var m = S.get(id);
      m.scope = 'place'; m.stage = 'place'; m.radius = 700;
      if (!m.purpose) m.purpose = '음식';
      save();
    },
    /* 방장 — 강퇴. 그 사람의 핑·표를 함께 지운다(순서도: 재참여는 허용). */
    kick: function (id, pid) {
      var m = S.get(id);
      m.members = m.members.filter(function (x) { return x.id !== pid; });
      m.pings.forEach(function (p) { p.by = p.by.filter(function (b) { return b !== pid; }); });
      m.pings = m.pings.filter(function (p) { return p.by.length || p.ai; });
      delete m.regionVotes[pid]; delete m.placeVotes[pid];
      save();
    },
    remove: function (id) {
      load();
      db.meetings = db.meetings.filter(function (m) { return m.id !== id; });
      delete db.meAs[id];
      save();
    },
    setStatus: function (id, st, lateMin, pid) {
      var m = S.get(id), x = S.member(m, pid || S.me(id));
      if (!x) return;
      x.status = st; x.lateMin = st === 'late' ? (lateMin || 10) : 0;
      save();
    },

    /* ---- 날짜 ---- */
    /* 신호등은 모임 당일에만 활성이다 — 목업에서는 영영 오지 않으므로
       '오늘로 취급' 토글이 없으면 이 기능은 시연 자체가 불가능하다. */
    isToday: function (m) {
      if (M.tools.get('today')) return true;
      if (!m.when) return false;
      return String(m.when).slice(0, 10) === new Date().toISOString().slice(0, 10);
    },
    dday: function (m) {
      if (!m.when) return null;
      var t = new Date(m.when); t.setHours(0, 0, 0, 0);
      var n = new Date(); n.setHours(0, 0, 0, 0);
      return Math.round((t - n) / 86400000);
    },
    ddayLabel: function (m) {
      var d = S.dday(m);
      if (d === null) return '시간 미정';
      if (d === 0) return 'D-DAY';
      return d > 0 ? 'D-' + d : 'D+' + (-d);
    },
    whenLabel: function (m) {
      if (!m.when) return '시간 미정';
      var d = new Date(m.when), W = ['일','월','화','수','목','금','토'], p = M.ui.pad2;
      return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + W[d.getDay()] + ') ' + p(d.getHours()) + ':' + p(d.getMinutes());
    },

    /* ---- 내정보 기본값 (데모 초기화와 별개 키) ---- */
    defaults: function () {
      return read(ME_KEY, { name:'김방장', origin:{ nm:'역삼역', lat:37.500622, lng:127.036456 }, mode:'지하철', pin:'', push:true, login:true });
    },
    setDefaults: function (o) { write(ME_KEY, o); emit(); },

    /* ---- ① → ④ 손바꿈 ---- */
    setHandoff: function (o) { write(HANDOFF, o); },
    takeHandoff: function () { var v = read(HANDOFF, null); localStorage.removeItem(HANDOFF); return v; },

    /* ---- 목업 도구 ---- */
    reset: function () { localStorage.removeItem(DB_KEY); db = null; load(); emit(); },
    fill: function (id) {
      var m = S.get(id), NAMES = ['봇하나','봇둘','봇셋','봇넷','봇다섯','봇여섯','봇일곱'];
      var i = 0;
      while (m.members.length < MAX_MEMBERS && i < NAMES.length) {
        var d = DONGS[(i * 5) % DONGS.length];
        m.members.push(member(uid('p'), NAMES[i], d.nm, d.lat, d.lng, '지하철', { bot:1 }));
        i++;
      }
      save();
    }
  };

  /* ---------------- 역할 바 [목업 전용] ----------------
     방장 전용 버튼(AI 추천·투표 시작·확정·되돌리기)은 방장일 때만 보인다.
     역할을 바꿔볼 수단이 없으면 화면 절반을 확인할 수 없어서 둔다.
     점선·회색·11px — 제품 UI 로 오해되지 않게 일부러 미완성처럼 둔다. */
  M.rolebar = {
    sync: function () {
      var el = M.$('rolebar');
      var ctx = M.router.ctx;
      var id = ctx && ctx.code;
      var m = id && S.get(id);
      /* 지도 흐름 화면(⑥~⑩)에서만. ⑪ 지난 모임은 읽기 전용이라 역할을 바꿀 이유가 없고,
         전면 페이지에서는 알약이 들어앉을 자리(.flowtop) 자체가 없다. */
      if (!m || M.router.layer !== 'map' || !M.tools.get('rolebar')) { el.hidden = true; el.innerHTML = ''; return; }

      var meId = S.me(id), meMem = S.member(m, meId);
      var host = meId === m.hostId;
      var full = m.members.length >= MAX_MEMBERS;
      el.hidden = false;
      el.innerHTML =
        '<button class="rb-btn' + (host ? ' host' : '') + '" type="button" data-who="1" ' +
          'title="[목업 전용] 누를 때마다 다음 사람이 됩니다">' +
          '나: ' + M.esc(meMem ? meMem.name : '?') + (host ? ' (방장)' : '') + ' ▾</button>' +
        '<button class="rb-btn" type="button" data-add="1"' + (full ? ' disabled' : '') +
          ' title="[목업 전용] 링크를 오가지 않고 여기서 참여자 한 명 추가">＋사람 ' +
          m.members.length + '/' + MAX_MEMBERS + '</button>' +
        '<button class="rb-btn" type="button" data-step="1" ' +
          'title="[목업 전용] 다른 사람의 다음 행동을 한 칸 진행">▶</button>';

      el.querySelector('[data-who]').addEventListener('click', function () {
        var i = m.members.map(function (x) { return x.id; }).indexOf(meId);
        var next = m.members[(i + 1) % m.members.length];
        S.setMe(id, next.id);
        M.toast('이제 ' + next.name + (next.id === m.hostId ? ' (방장)' : '') + ' 입니다');
      });
      el.querySelector('[data-step]').addEventListener('click', function () { M.Sim.step(false); });
      el.querySelector('[data-add]').addEventListener('click', function () {
        if (full) { M.toast('정원 ' + MAX_MEMBERS + '명이 다 찼어요'); return; }
        M.rolebar.addPerson(m);
      });
    },

    /* [목업 전용] 화면을 떠나지 않고 참여자 한 명 넣기.
       진짜 경로는 초대 링크지만, 그 길은 '내가 그 사람이 되는' 길이라
       방장 화면에서 사람이 느는 걸 보려면 이쪽이 필요하다. */
    addPerson: function (m) {
      var NAMES = ['박서준','최수아','정하늘','한도윤','서지우','임채원','오시윤','강나린'];
      var SPOTS = ['강남역','홍대입구역','잠실역','여의도역','신촌역','건대입구역','성수역','수유역'];
      var used = m.members.map(function (x) { return x.name; });
      var name = NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || ('참여자' + (m.members.length + 1));
      var spot = SPOTS[m.members.length % SPOTS.length];
      var mode = '지하철';

      M.modal.open({
        title: '참여자 추가 [목업 전용]',
        text: '초대 링크를 오가지 않고 바로 넣습니다. <b>나는 계속 나로 남아요</b> — ' +
              '링크로 들어가면 내가 그 사람이 되는 것과 다릅니다.',
        html:
          '<div class="fld"><label for="rbName">이름</label>' +
            '<input type="text" id="rbName" maxlength="12" value="' + M.esc(name) + '">' +
            '<div class="fm-err" id="rbErr" hidden></div></div>' +
          '<div class="fld"><span class="fld-label">출발지</span>' +
            '<div class="fm-chips" id="rbSpots">' + SPOTS.map(function (s) {
              return '<button class="ccard" type="button" data-spot="' + s + '" aria-pressed="' +
                     (s === spot ? 'true' : 'false') + '">' + s + '</button>';
            }).join('') + '</div></div>' +
          '<div class="fld"><span class="fld-label">이동수단</span><div id="rbMode"></div></div>',
        actions: [
          { label: '취소' },
          { label: '추가', kind: 'primary', keepOpen: true, fn: null }
        ],
        onrender: function (box) {
          box.querySelector('#rbMode').appendChild(
            M.ui.seg(['지하철', '버스', '자차', '도보'], mode, function (v) { mode = v; }));

          Array.prototype.forEach.call(box.querySelectorAll('[data-spot]'), function (b) {
            b.addEventListener('click', function () {
              spot = b.getAttribute('data-spot');
              Array.prototype.forEach.call(box.querySelectorAll('[data-spot]'), function (c) {
                c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
              });
            });
          });

          /* '추가'는 실패할 수 있어서(이름 중복·정원) 모달을 닫지 않고 직접 처리한다 */
          var addBtn = box.querySelectorAll('[data-act]')[1];
          addBtn.addEventListener('click', function () {
            var v = box.querySelector('#rbName').value.trim();
            var err = box.querySelector('#rbErr');
            if (!v) { err.hidden = false; err.textContent = '이름을 적어주세요'; return; }
            var st = STATIONS[spot];
            try {
              S.addMember(m.id, { name: v, origin: { nm: spot, lat: st.lat, lng: st.lng }, mode: mode, bot: true });
              M.modal.close(true);
              M.toast(v + ' 님이 들어왔어요 — ▶ 로 이 사람 행동을 진행할 수 있어요');
            } catch (e) {
              err.hidden = false;
              err.innerHTML = e.code === 'DUP_NAME'
                ? '<b>' + M.esc(v) + '</b> 님이 이미 있어요 — 다른 이름으로 해주세요'
                : '정원 ' + MAX_MEMBERS + '명이 다 찼어요';
            }
          });
        }
      });
    }
  };

  /* 참여자 추가에 쓰는 대표 출발지 — 검색 없이 한 번에 고르라고 좌표까지 들고 있는다 */
  var STATIONS = {
    '강남역':    { lat:37.497942, lng:127.027621 },
    '홍대입구역': { lat:37.557192, lng:126.925381 },
    '잠실역':    { lat:37.513950, lng:127.100158 },
    '여의도역':   { lat:37.521624, lng:126.924191 },
    '신촌역':    { lat:37.555134, lng:126.936893 },
    '건대입구역': { lat:37.540408, lng:127.070574 },
    '성수역':    { lat:37.544581, lng:127.055961 },
    '수유역':    { lat:37.638369, lng:127.025307 }
  };

  /* ---------------- 가짜 참여자 ----------------
     기능 순서도의 1.8초 폴링 주기를 그대로 시뮬 틱으로 쓴다.
     자동 진행은 기본 꺼짐 — 무작위를 기다리는 건 검토에 쓸모가 없다.
     쓸모 있는 건 '▶ 다음 사람 행동' 한 칸씩이다. */
  var simTimer = null;
  M.Sim = {
    SPEED_MS: 1800,
    start: function () {
      M.Sim.stop();
      if (!M.tools.get('simOn')) return;
      simTimer = setInterval(function () { M.Sim.step(true); }, M.Sim.SPEED_MS);
    },
    stop: function () { clearInterval(simTimer); simTimer = null; },
    sync: function () { M.Sim.start(); },

    /* 지금 보고 있는 모임에서 봇 하나가 할 만한 일을 한 칸 진행시킨다.
       quiet 이면 자동 틱 — 할 일이 없으면 조용히 아무것도 안 한다. */
    step: function (quiet) {
      var ctx = M.router.ctx;
      var id = ctx && ctx.code;
      var m = id && M.Store.get(id);
      if (!m) { if (!quiet) M.toast('모임 화면에서만 쓸 수 있어요'); return false; }
      var me = M.Store.me(id);
      var bots = m.members.filter(function (x) { return x.id !== me; });
      if (!bots.length) { if (!quiet) M.toast('나 말고는 아무도 없어요'); return false; }

      if (m.stage === 'ping') {
        var free = bots.filter(function (b) { return !m.pings.some(function (p) { return p.by.indexOf(b.id) >= 0; }); });
        if (!free.length) { if (!quiet) M.toast('다들 이미 핑을 찍었어요'); return false; }
        var b = free[0];
        var d = M.nearestDong(b.origin.lat, b.origin.lng);
        M.Store.addPing(id, d, { by: b.id });
        M.toast(b.name + '님이 ' + d.nm + '에 핑을 찍었어요');
        return true;
      }
      if (M.Store.isVoting(m)) {
        var key = M.Store.voteKey(m);
        var todo = bots.filter(function (b) { return !m[key][b.id]; });
        if (!todo.length) { if (!quiet) M.toast('전원 투표를 마쳤어요'); return false; }
        var list = M.Store.candidates(m);
        if (!list.length) return false;
        var who = todo[0];
        /* 자기 출발지에서 가까운 후보를 고른다 — 무작위보다 그럴듯하고, 결과가 재현된다 */
        var pick = list.slice().sort(function (a, c) {
          return dist2(a, who.origin) - dist2(c, who.origin);
        })[0];
        M.Store.vote(id, pick.id, { by: who.id });
        M.toast(who.name + '님이 ' + (pick.dong || pick.name) + '에 투표했어요');
        return true;
      }
      if (m.stage === 'place') {
        if (!quiet) M.toast('후보는 지도에서 직접 눌러 등록해요');
        return false;
      }
      if (m.stage === 'result') {
        var no = bots.filter(function (b) { return !b.status; });
        if (!no.length) { if (!quiet) M.toast('전원이 신호등을 남겼어요'); return false; }
        var w = no[0], ST = ['go','go','late','no'], st = ST[(m.members.indexOf(w)) % ST.length];
        M.Store.setStatus(id, st, 15, w.id);
        M.toast(w.name + '님: ' + (st === 'go' ? '도착 예정' : st === 'late' ? '15분 지각' : '불참'));
        return true;
      }
      if (!quiet) M.toast('이 단계에서는 할 일이 없어요');
      return false;
    }
  };
  function dist2(a, o) {
    var dy = (a.lat - o.lat) * 111, dx = (a.lng - o.lng) * 88;
    return dy * dy + dx * dx;
  }

  /* ---------------- AI 추천 (⑥ ⑧) ----------------
     실물은 GLM 5.2 (Ollama Cloud), 방장 opt-in, 안 누르면 0원. 보통 25초.
     목업에서는 3.5초로 줄여 둔다 — 스무 번 반복하며 25초를 앉아 기다릴 사람은 없다.
     다만 진짜 소요로 한 번은 판단해야 하므로 '실제 속도' 토글을 남긴다.
     그걸 숨기는 게 목업이 자기 지연시간에 대해 거짓말하는 방식이다. */
  var aiHandle = null;
  M.AI = {
    running: function () { return !!aiHandle; },
    cancel: function () { if (aiHandle) { aiHandle.cancel(); aiHandle = null; } },

    /* produce() → Promise<items>. 결과가 나오면 onDone(items). */
    ask: function (o) {
      if (aiHandle) return;
      var real = !!M.tools.get('aiReal');
      var wait = real ? 25000 : 3500;
      var t0 = Date.now(), tickTimer = null, doneTimer = null, killed = false;

      M.modal.open({
        cls: 'ai',
        title: o.title || 'AI가 후보를 고르는 중',
        html: '<div class="mo-clock" id="aiClock">00:00</div>' +
              '<div class="mo-dots"><i></i><i></i><i></i></div>' +
              '<p class="mo-text">보통 <b>25초</b>쯤 걸려요. 그동안 지도를 보고 계셔도 됩니다.</p>' +
              '<div class="note" style="text-align:left">이 버튼은 <b>방장에게만</b> 보이고,<br>' +
              '누르지 않으면 <b>비용이 들지 않습니다</b>.</div>',
        actions: [{ label:'취소', fn: function () { kill(); if (o.onCancel) o.onCancel(); } }],
        onclose: function () { kill(); if (o.onCancel) o.onCancel(); }
      });

      tickTimer = setInterval(function () {
        var s = Math.floor((Date.now() - t0) / 1000);
        var el = M.$('aiClock');
        if (el) el.textContent = M.ui.pad2(Math.floor(s / 60)) + ':' + M.ui.pad2(s % 60);
      }, 500);

      function kill() {
        killed = true;
        clearInterval(tickTimer); clearTimeout(doneTimer);
        aiHandle = null;
      }
      aiHandle = { cancel: function () { kill(); M.modal.close(true); } };

      doneTimer = setTimeout(function () {
        if (killed) return;
        /* 결정적 실패 스위치가 없으면 실패 화면은 검토 자체가 불가능하다 */
        if (M.tools.get('aiFail')) {
          kill(); M.modal.close(true);
          M.toast('AI 추천에 실패했어요');
          M.modal.open({
            title: 'AI 추천에 실패했어요',
            text: '잠시 뒤 다시 시도하거나, 직접 골라서 진행해도 됩니다.',
            actions: [
              { label:'직접 진행' },
              { label:'다시 시도', kind:'primary', fn: function () { M.AI.ask(o); } }
            ]
          });
          return;
        }
        Promise.resolve(o.produce()).then(function (items) {
          if (killed) return;
          kill(); M.modal.close(true);
          o.onDone(items || []);
        }, function (e) {
          if (killed) return;
          kill(); M.modal.close(true);
          M.toast('AI 추천에 실패했어요 — ' + (e && e.message ? e.message : '알 수 없는 오류'));
        });
      }, wait);
    },

    /* ⑥ — 멤버 출발지 무게중심 쪽으로 치우친 동 3곳.
       (실물은 GLM 이 고르지만, 목업은 표에서 고른다 — 키가 없어도 돌아야 하므로) */
    regions: function (m, n) {
      var la = 0, ln = 0;
      m.members.forEach(function (x) { la += x.origin.lat; ln += x.origin.lng; });
      la /= m.members.length; ln /= m.members.length;
      return DONGS.slice()
        .sort(function (a, b) { return dist2(a, { lat:la, lng:ln }) - dist2(b, { lat:la, lng:ln }); })
        .slice(0, n || 3);
    },
    /* ⑧ 의 한 줄 근거 — 지어낸 이름보다 진짜 POI 에 근거를 붙이는 쪽이 훨씬 설득력 있다 */
    WHY: ['역에서 가깝고 여럿이 앉을 수 있어요', '확정 동 한가운데라 다들 비슷하게 걸어요',
          '이 시간대에 자리가 있는 편이에요', '골목 안이라 조용하고 대화가 됩니다']
  };

  /* ---------------- 가짜 POI ----------------
     ⑧ 은 카카오 Local 로 진짜 장소를 부른다. 키가 없으면 거기서 흐름이 끊기는데,
     ⑧⑨⑩ 을 못 걸어보는 건 목업으로서 치명적이라 그때만 이걸 깐다.
     이름 뒤에 '(예시)'를 붙여 진짜 데이터와 헷갈리지 않게 한다. */
  var MOCK_NAMES = {
    '음식': ['황소곱창', '온기족발', '할매국밥', '연탄구이집', '손칼국수', '동경식당'],
    '카페': ['모닝빈', '로스터리 하루', '카페 뜰', '작은숲', '커피상점', '오후세시'],
    '술집': ['포장마차 밤', '이자카야 유', '탭하우스', '와인바 온', '노가리집', '브루어리'],
    '문화': ['시네마 라운지', '동네책방', '갤러리 담', '작은극장', '보드게임방', '전시공간 결'],
    '야외': ['근린공원', '천변 산책로', '옥상정원', '문화광장', '체육공원', '전망대']
  };
  M.mockPlaces = function (center, cat, n) {
    var names = MOCK_NAMES[cat] || MOCK_NAMES['음식'];
    var out = [];
    for (var i = 0; i < (n || 6) && i < names.length; i++) {
      /* 반경 안에 고르게 흩어놓는다 — 결정적이라 새로고침해도 같은 자리에 있다 */
      var ang = (i / names.length) * Math.PI * 2 + 0.7;
      var rad = 0.0022 + (i % 3) * 0.0011;
      out.push({
        place_name: names[i] + ' (예시)',
        category_name: '음식점 > ' + cat,
        road_address_name: (center.full || '') + ' ' + (10 + i * 7) + '길 ' + (3 + i),
        address_name: center.full || '',
        x: String(center.lng + Math.cos(ang) * rad * 1.25),
        y: String(center.lat + Math.sin(ang) * rad),
        place_url: '', phone: '', mock: true
      });
    }
    return out;
  };

  load();

})(window.MOIMER);
