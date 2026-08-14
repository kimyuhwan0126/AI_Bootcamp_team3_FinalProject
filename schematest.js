/* v2 스키마가 그릴링 결정을 실제로 강제하는지 — 넣어 보고 확인한다.
   '테이블이 생겼다'가 아니라 '규칙이 막는다'를 본다. */
const fs=require('fs'); const {Client}=require('pg');
const env={};
fs.readFileSync('.env.local','utf8').split(/\r?\n/).forEach(l=>{
  const m=/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l.trim()); if(m) env[m[1]]=m[2].trim();
});
let pass=0, fail=0;
function ok(name, cond, detail){ cond?pass++:fail++; console.log('  '+(cond?'✓':'✗')+' '+name+(detail?'  → '+detail:'')); }
/* Postgres 는 오류 하나에 트랜잭션 전체를 중단시킨다.
   '막히는지' 보는 검사마다 세이브포인트를 잡고, 막히면 거기까지만 되돌린다. */
let sp = 0;
async function must_fail(c, sql, params, name){
  const s = 'sp' + (++sp);
  await c.query('savepoint ' + s);
  try {
    await c.query(sql, params);
    await c.query('release savepoint ' + s);
    ok(name, false, '막혔어야 하는데 통과함');
  } catch(e){
    await c.query('rollback to savepoint ' + s);
    ok(name, true, e.constraint || e.code);
  }
}
(async()=>{
  const c=new Client({connectionString:env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
  await c.connect();
  await c.query('begin');

  console.log('\n[준비] 모임 하나와 사람 넷');
  await c.query("insert into users(id,kakao_id,nickname) values ('u1','kakao:111','김방장')");
  await c.query("insert into meetings(code,name,scope,purpose,host_id) values ('TEST01','테스트 모임','place','음식','u1')");
  await c.query("insert into participants(id,code,user_id,name) values ('p1','TEST01','u1','김방장')");
  await c.query("insert into participants(id,code,name,pin_hash) values ('p2','TEST01','박영희','h2'),('p3','TEST01','이민준','h3'),('p4','TEST01','김철수','h4')");
  ok('로그인=계정 / 비로그인=PIN 둘 다 들어간다', true);

  console.log('\n[결정] 비로그인은 PIN 이 필수');
  await must_fail(c, "insert into participants(id,code,name) values ('p9','TEST01','핀없는사람')", [],
    'PIN 없는 비로그인 참여가 막힌다');

  console.log('\n[결정] 한 모임에 같은 이름 둘 금지');
  await must_fail(c, "insert into participants(id,code,name,pin_hash) values ('p8','TEST01','박영희','x')", [],
    '이름 중복이 막힌다');

  console.log('\n[결정] 핑 = 투표 — 한 사람이 여러 동, 같은 동엔 하나');
  await c.query(`insert into candidates(id,code,kind,ref_id,name,lat,lng,created_by) values
    ('c1','TEST01','region','1144055000','연남동',37.56,126.92,'p1'),
    ('c2','TEST01','region','1120068000','성수동',37.54,127.05,'p2'),
    ('c3','TEST01','region','1114055000','망원동',37.55,126.90,'p3')`);
  await c.query(`insert into votes(code,candidate_id,participant_id,kind) values
    ('TEST01','c1','p1','region'),('TEST01','c2','p1','region'),('TEST01','c3','p1','region')`);
  const many = await c.query("select count(*) n from votes where participant_id='p1'");
  ok('한 사람이 여러 동에 찍는다', +many.rows[0].n === 3, many.rows[0].n + '곳');
  await must_fail(c, "insert into votes(code,candidate_id,participant_id,kind) values ('TEST01','c1','p1','region')", [],
    '같은 동에 두 번은 막힌다');
  await c.query("delete from votes where candidate_id='c1' and participant_id='p1'");
  const after = await c.query("select count(*) n from votes where participant_id='p1'");
  ok('다시 누르면 취소된다', +after.rows[0].n === 2, after.rows[0].n + '곳 남음');

  console.log('\n[결정] 지점은 아직 1인 1표');
  await c.query(`insert into candidates(id,code,kind,ref_id,name,lat,lng) values
    ('d1','TEST01','place','k1','황소곱창',37.54,127.05),
    ('d2','TEST01','place','k2','온기족발',37.54,127.06)`);
  await c.query("insert into votes(code,candidate_id,participant_id,kind) values ('TEST01','d1','p2','place')");
  await must_fail(c, "insert into votes(code,candidate_id,participant_id,kind) values ('TEST01','d2','p2','place')", [],
    '지점에 두 곳 투표가 막힌다');

  console.log('\n[결정] 같은 동은 한 줄로 합쳐진다');
  await must_fail(c, "insert into candidates(id,code,kind,ref_id,name,lat,lng) values ('c9','TEST01','region','1144055000','연남동',37.56,126.92)", [],
    '같은 행정동 중복 등록이 막힌다');

  console.log('\n[결정] 승인 대기 · 강퇴 상태');
  await c.query("update participants set state='kicked' where id='p4'");
  await c.query("update participants set state='pending', requested_at=now() where id='p4'");
  const st = await c.query("select state, requested_at is not null r from participants where id='p4'");
  ok('강퇴 → 승인 대기로 바뀐다', st.rows[0].state==='pending' && st.rows[0].r);
  await must_fail(c, "update participants set state='이상한값' where id='p4'", [], '모르는 상태값이 막힌다');

  console.log('\n[결정] 마무리 = closed_at · 삭제 = 행 제거');
  await c.query("update meetings set closed_at=now() where code='TEST01'");
  const cl = await c.query("select closed_at is not null c, stage from meetings where code='TEST01'");
  ok("마무리해도 stage 는 그대로 (자동 전환 없음)", cl.rows[0].c && cl.rows[0].stage==='region', 'stage='+cl.rows[0].stage);

  console.log('\n[결정] stage 에 vote_region 이 없다 (⑥⑦ 합침)');
  await must_fail(c, "update meetings set stage='vote_region' where code='TEST01'", [], 'vote_region 을 넣으면 막힌다');

  console.log('\n[정리] 모임을 지우면 딸린 것도 사라진다');
  await c.query("delete from meetings where code='TEST01'");
  const left = await c.query(`select
    (select count(*) from participants where code='TEST01') p,
    (select count(*) from candidates where code='TEST01') c,
    (select count(*) from votes where code='TEST01') v`);
  const r=left.rows[0];
  ok('삭제하면 참가자·후보·표가 같이 사라진다', +r.p===0 && +r.c===0 && +r.v===0,
     'p'+r.p+' c'+r.c+' v'+r.v);

  await c.query('rollback');   /* 테스트 흔적을 남기지 않는다 */
  await c.end();
  console.log('\n──────────────────────────────');
  console.log('통과 '+pass+' · 실패 '+fail+'   (rollback — DB 에 흔적 없음)');
  process.exit(fail?1:0);
})().catch(e=>{ console.log('실행 오류:', e.message); process.exit(2); });
