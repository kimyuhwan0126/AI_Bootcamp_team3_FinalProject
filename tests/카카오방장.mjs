/* **진짜 카카오 계정**으로 방장 노릇이 도는가 (논의124).

   guest 우회로는 못 재는 물음이 있다. 방장은 계정으로 가리는데(논의124), guest 계정도 계정이라
   "계정으로 가린다" 까지는 확인되지만 **카카오로 들어온 계정도 똑같이 대접받는가** 는 안 재진다.
   `kakao_id` 가 숫자냐 `guest:이름` 이냐로 갈리는 자리가 실제로 코드에 있어서(`hostAccount`),
   그 갈래를 한 번은 진짜 값으로 밟아 봐야 한다.

   ⚠ 사람이 카카오로 한 번이라도 들어온 적이 없으면 **건너뛴다**(빨간불이 아니다) —
     기계는 카카오 화면을 못 누른다. 그때는 `/me` 에서 한 번 눌러 주면 그다음부터 돈다.

   운영 DB 를 쓴다. **내가 만든 모임만** 치운다.
   node tests/카카오방장.mjs — 개발 서버가 떠 있어야 한다 */
import { 카카오사람 } from './카카오세션.mjs';
import { 로그인 } from './세션.mjs';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const BASE = process.env.MOIMER_BASE ?? 'http://127.0.0.1:3000';
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const DSN = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const sql = neon(DSN, { fetchOptions: { cache: 'no-store' } });

let 통과 = 0, 실패 = 0, 건너뜀 = 0;
const ok = (n, c, d) => { c ? 통과++ : 실패++; console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  → ' + d : ''}`); };
const 건너 = (n, 왜) => { 건너뜀++; console.log(`  – ${n} (건너뜀 — ${왜})`); };

/* guest 사람 — '남' 노릇을 맡는다 */
function person() {
  const jar = new Map();
  return {
    jar,
    async call(path, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(BASE + path, { ...init,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });
      (r.headers.getSetCookie?.() ?? []).forEach((c) => {
        const kv = c.split(';')[0]; const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1));
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text };
    },
    post(p, b) { return this.call(p, { method: 'POST', body: JSON.stringify(b) }); },
    get(p) { return this.call(p); },
  };
}

const 치울것 = [];

console.log('\n[K] 진짜 카카오 계정으로 방장 노릇');
const 방장 = await 카카오사람();

if (!방장) {
  건너('카카오 계정으로 방장 시험', '카카오로 들어온 계정이 아직 없다 — /me 에서 한 번 눌러 주세요');
} else {
  console.log(`  · 쓰는 계정: ${방장.누구.nickname}`);
  try {
    /* ── 만들기 ── */
    let r = await 방장.post('/api/m', { name: 'K 카카오방장 시험', hostName: '방장', scope: 'region',
      origin: '성수역', lat: 37.5446, lng: 127.056, transport: 'transit' });
    ok('카카오 세션으로 모임을 만든다', r.status === 200 && !!r.json?.code, `${r.status} ${r.text.slice(0, 60)}`);
    const C = r.json?.code;
    if (!C) throw new Error('모임을 못 만들어 더 못 간다');
    치울것.push(C);

    /* ── 방장 줄이 계정에 붙었나 ── */
    const [m] = await sql`select h.user_id, (uu.kakao_id is not null) as 계정있나,
                                 (uu.kakao_id like 'guest:%') as 게스트인가
      from meetings m join participants h on h.id = m.host_id
      left join users uu on uu.id = h.user_id where m.code = ${C}`;
    ok('방장 줄이 계정에 이어진다', !!m?.user_id && m.계정있나 === true, JSON.stringify(m));
    /* 이 한 줄이 guest 로는 못 재는 자리다 — 진짜 카카오 열쇠라야 false 가 된다 */
    ok('그 계정이 개발용 guest 가 아니다', m?.게스트인가 === false, String(m?.게스트인가));

    /* ── 방장 전용 동작들 ── */
    for (const [이름, 몸] of [
      ['이름 고치기', { action: 'update', name: 'K 카카오방장 시험 2' }],
      ['AI 횟수 비우기', { action: 'clearAi' }],
    ]) {
      const x = await 방장.post(`/api/m/${C}`, 몸);
      ok(`방장이 ${이름} 를 할 수 있다`, x.status === 200, `${x.status} ${x.json?.error ?? ''}`);
    }

    /* ── 방장은 못 나간다 (논의125) ── */
    const 나감 = await 방장.post(`/api/m/${C}`, { action: 'leave' });
    ok('방장은 모임에서 못 나간다', 나감.status === 409 && 나감.json?.error === 'host_cannot_leave',
       `${나감.status} ${나감.json?.error ?? ''}`);

    /* ── 남이 방장 노릇을 못 한다 ── */
    const 남 = person();
    await 로그인(남, '시험남');
    await 남.post(`/api/m/${C}`, { action: 'join', name: '영희', pin: '1111',
      origin: '왕십리역', lat: 37.5612, lng: 127.0378, transport: 'transit' });
    const 남시도 = await 남.post(`/api/m/${C}`, { action: 'update', name: '남이 바꿈' });
    ok('로그인한 남도 방장 노릇은 못 한다', 남시도.status === 403, `${남시도.status} ${남시도.json?.error ?? ''}`);

    /* 참가자 쿠키만 훔친 사람 — 서명이 붙어 있어도 계정이 아니라서 막혀야 한다 (논의124·126) */
    const 훔친이 = person();
    훔친이.jar.set(`moimer.p.${C}`, 방장.병.get(`moimer.p.${C}`) ?? '');
    const 훔침 = await 훔친이.post(`/api/m/${C}`, { action: 'update', name: '훔쳐서 바꿈' });
    ok('방장 참가자 쿠키를 훔쳐도 방장이 못 된다', 훔침.status === 403,
       `${훔침.status} ${훔침.json?.error ?? ''}`);

    /* ── 화면이 못 지킬 약속을 안 하는가 (논의125) ── */
    {
      /* 서버가 409 로 막는 단추를 화면이 그려 두면, 사람은 눌러야만 안 되는 것을 알게 된다.
         전에는 [나가기] 가 방장에게도 떴고, 혼자면 "나가면 모임이 사라져요" 를 묻고
         **예 를 눌러도 서버가 거절했다.** 화면 글에 그 흔적이 남아 있는지 본다. */
      const 글 = readFileSync(new URL('../app/m/[code]/ui.tsx', import.meta.url), 'utf8');
      /* **주석을 통째로 걷어내고** 본다. 주석에는 '무엇을 왜 없앴는지' 가 옛 문구 그대로 인용돼 있고,
         그건 남아 있어야 하는 글이다 — 줄 앞머리만 보고 거르면 그 인용에 걸려 헛빨간불이 켜진다
         (실제로 그랬다). 재려는 것은 **사람에게 나가는 글**뿐이다. */
      const 코드 = 글.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      ok('방장에게 나가기를 안 그린다', /!v\.me\.isHost && \(/.test(코드));
      ok("'방장을 먼저 넘겨 주세요' 가 화면에 안 나간다", !코드.includes('방장을 먼저 넘겨'));
      ok("'나가면 모임이 사라져요' 가 화면에 안 나간다", !코드.includes('나가면 모임이 사라져요'));
    }

    /* ── **첫 그림**도 계정을 보나 (논의124·130) ─────────────────
       가장 오래 숨어 있던 구멍이다. API(`GET /api/m/<코드>`)는 처음부터 계정을 봤는데
       사람이 실제로 거치는 길인 **화면 첫 그림**(`app/m/[code]/page.tsx`)은 쿠키만 봤다.
       그래서 폰을 바꿔 로그인만 하고 들어온 방장이 자기 모임에서 "이 모임에 참여하기" 를 봤다.
       시험이 전부 API 만 재고 있어 늘 초록이었다 — 그래서 여기서는 **화면 글자**를 본다. */
    {
      const 쿠키없이 = await 카카오사람();          /* 세션만 있고 참가자 쿠키는 없는 새 기기 */
      const r2 = await 쿠키없이.get(`/m/${C}`);
      const 글 = r2.text;
      ok('새 기기에서 모임 화면이 열린다', r2.status === 200, String(r2.status));
      ok('첫 그림이 "참여하기" 를 그리지 않는다', !/이 모임에 참여하기/.test(글),
         (글.match(/이 모임에 참여하기/) ?? [''])[0] || '없음');
      /* 방장 도구 단추들은 접힘(스피드다이얼 토글) 안이라 첫 HTML 에 없다 — 그건 맞는 모습이다.
         대신 **사람 줄의 [방장] 표**가 첫 그림에 있어야 한다: 그것이 '이 모임은 내 것' 이라는
         첫 신호다. SSE 로 다시 읽은 뒤에야 나타나면 그 사이에 "내 모임이 아닌가" 싶어진다. */
      const 사람말 = 글.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      ok('첫 그림에 [방장] 표가 붙는다', /방장/.test(사람말), 사람말.replace(/\s+/g, ' ').slice(-90));
      /* ⚠ 2026-08-15 — 도구 열기 단추가 '⋯ 더보기' 글자 단추에서 동그란 아이콘 단추로
         바뀌었다(스피드다이얼, 그릴링 논의 없이 실제 화면 신고로 진행). 보이는 글자는
         '⋯' 뿐이고 '더보기'는 aria-label 로 옮겨 갔다 — 태그를 벗긴 사람말에는 안 잡히니
         (attribute 는 태그와 함께 지워진다) 벗기기 전 원본 글에서 dial-toggle 자체를 본다. */
      ok('첫 그림에 방장 도구를 여는 길이 있다', /class="dial-toggle"/.test(글));
    }

    /* ── 목록에서 계정으로 찾아지나 (논의124 딸린 결과) ── */
    const 쿠키없는방장 = await 카카오사람();          /* 세션만 있고 참가자 쿠키는 없는 새 기기 */
    const 목록 = await 쿠키없는방장.get('/api/mine');
    ok('쿠키 하나 없는 새 기기에서도 내 모임이 보인다',
       목록.status === 200 && (목록.json?.meetings ?? []).some((x) => x.code === C),
       `${목록.status} · ${(목록.json?.meetings ?? []).length}건`);
  } catch (e) {
    실패++;
    console.log(`  ✗ 시험이 넘어졌다 — ${e?.message ?? e}`);
  }
}

console.log('\n[치우기]');
{
  let 지움 = 0;
  for (const c of 치울것) {
    const r = await 방장?.post(`/api/m/${c}`, { action: 'remove' }).catch(() => ({ status: 0 }));
    if (r?.status === 200) 지움++;
  }
  if (치울것.length) ok('내가 만든 모임을 전부 치웠다', 지움 === 치울것.length, `${지움}/${치울것.length}건`);
  else console.log('  · 치울 것이 없다');
}

console.log('\n──────────────────────────────');
console.log(`통과 ${통과} · 실패 ${실패}${건너뜀 ? ` · 건너뜀 ${건너뜀}` : ''}`);
process.exit(실패 ? 1 : 0);
