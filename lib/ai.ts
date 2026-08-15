/* AI 추천 — 방장이 눌렀을 때만 부른다(설계 v3 opt-in · 비용).
   가짜 후보를 지어내지 않는다 — 그건 사용자를 속이는 것이다.

   빈손인 까닭을 갈라 준다 (논의93). 셋은 서로 다른 일이다:
     닿음    — 답을 받았다. 쓸 만한 것이 있든 없든 **토큰은 나갔다**
     못붙음  — 키가 없거나 서버에 못 닿았다. **한 푼도 안 들었다**
   가르지 않으면 AI 가 죽어 있는 동안 방장이 세 번 눌러 아무것도 못 받고 막힌다 —
   실제로 이 PC 에서 그랬다(22초 뒤 503). 못 붙은 것은 횟수를 안 태운다.

   ── 프롬프트를 다시 쓴 까닭 (2026-08-13) ─────────────────────────
   전에는 이런 글을 보냈다:
     지역: "출발지: 지훈: 성수역, 영희: 홍대입구역 / 모두가 모이기 좋은 **서울** 행정동 3곳을…"
     지점: "**확정된 동네 근처에서** 모임에 어울리는 장소 3곳을…"
   네 군데가 틀렸다.
     ① **지점 단계가 어디인지 안 알려 줬다.** "확정된 동네 근처" 라고만 하고 그 동네 이름도 좌표도
        안 넣었다 — 받는 쪽은 알 길이 없다. 사실상 아무 데나 찍는 물음이었다
     ② **'이미 나온 곳' 에 종류가 섞였다.** 지점을 물으면서 지역 후보(성수동·연남동)까지 함께 붙였다
     ③ **'서울' 이 박혀 있었다.** 부산 모임에도 서울 동네를 달라고 했다
     ④ **좌표를 안 줬다.** 우리는 가운데를 정확히 셈할 수 있는데 역 이름만 주고 짐작하게 했다.
        그래서 그럴듯한 헛 좌표가 오고, 그중 한국 밖만 걸러졌다
   지금은 **우리가 아는 것을 다 준다** — 가운데 좌표·출발지 좌표·확정된 지역·같은 종류의 이미 나온 곳.
   그래도 AI 는 좌표를 지어낸다. 그건 부르는 쪽이 사람과 같은 잣대로 거른다(논의55). */
import type { Meeting, MeetingView } from './types';
import { 한국안 } from './geo';
import { 지금종류 } from './단계';
import { AI추천_잠시멈춤 } from './기능스위치';

type Pick = { refId: string; name: string; lat: number; lng: number; address?: string };
/** 닿았나 못 붙었나 — 부른 쪽이 횟수를 태울지 정하는 데 쓴다 (논의93) */
export type AiResult = { 닿음: true; picks: Pick[] } | { 닿음: false; 까닭: string };

const 못붙음 = (까닭: string): AiResult => ({ 닿음: false, 까닭 });
const 닿음 = (picks: Pick[]): AiResult => ({ 닿음: true, picks });

/* 좌표는 소수 다섯 자리면 1m 남짓이다. 그 아래는 글자만 늘리고 뜻이 없다. */
const 자리 = (n: number) => n.toFixed(5);

export async function suggest(m: Meeting, v: MeetingView): Promise<AiResult> {
  /* 2026-08-15 — 쓰던 ollama 계정의 유료 구독이 끝나 모든 호출이 403 이다.
     굳이 태워 20초를 기다리다 못 붙었다고 답할 까닭이 없다 — 여기서 바로 못 붙었다고 한다.
     이래도 route 쪽 셈(횟수 매기기·환불)은 그대로 지나간다 — '설정 없음' 때와 같은 길이다.
     새 키를 받으면 lib/기능스위치.ts 값 하나만 false 로 돌리면 된다. */
  if (AI추천_잠시멈춤) return 못붙음('구독 만료로 잠시 멈춤');
  const url = process.env.OLLAMA_PRIMARY_URL;
  const model = process.env.OLLAMA_PRIMARY_MODEL;
  const key = process.env.OLLAMA_API_KEY;
  if (!url || !model) return 못붙음('설정 없음');

  const kind = 지금종류(m);

  /* 출발지 — **좌표까지 준다**(④). 이름만 주면 받는 쪽이 어디인지 짐작해야 한다.
     활동 중인 사람만 센다: 내보내진 사람과 승인 대기는 이 모임의 가운데에 안 들어간다. */
  const 낸사람 = v.participants.filter(
    (p) => p.state === 'active' && p.origin_name && p.lat != null && p.lng != null);
  const 출발지 = 낸사람.map((p) => `${p.origin_name}(${자리(p.lat!)},${자리(p.lng!)})`).join(' · ');

  /* 모두의 가운데 — `app/m/[code]/ui.tsx` 와 `app/탐색/탐색.tsx` 가 쓰는 것과 **같은 셈**이다.
     이 좌표 하나가 "어디쯤을 말하는 것인가" 를 통째로 말해 준다. */
  const 가운데 = 낸사람.length
    ? { lat: 낸사람.reduce((a, p) => a + p.lat!, 0) / 낸사람.length,
        lng: 낸사람.reduce((a, p) => a + p.lng!, 0) / 낸사람.length }
    : null;

  /* 이미 나온 곳 — **같은 종류만**(②). 지점을 물으면서 지역 이름을 붙이면
     받는 쪽은 그것을 '피해야 할 가게' 로 읽는다. */
  const 같은종류 = v.candidates.filter((c) => c.kind === kind).map((c) => c.name);
  const 이미 = 같은종류.length ? 같은종류.join(', ') : '없음';

  /* 확정된 지역 — 지점을 물을 때 **이것이 없으면 물음 자체가 성립하지 않는다**(①) */
  const 정해진지역 = m.winner_region_id
    ? v.candidates.find((c) => c.id === m.winner_region_id) ?? null
    : null;

  /* 무엇 하러 모이나. 없으면 굳이 '모임' 이라고 채워 넣지 않는다 —
     빈 말을 넣느니 그 줄을 통째로 빼는 편이 받는 쪽에 낫다. */
  const 목적 = (m.purpose ?? '').trim();

  /* ⚠ 나라·시·도를 **우리가 박지 않는다**(③). 좌표가 그것을 말한다.
     '서울' 을 박아 두면 부산 모임에도 서울 동네가 온다. */
  const 공통 = [
    `모임 이름: ${m.name}`,
    목적 ? `무엇 하러: ${목적}` : '',
    `출발지(위도,경도): ${출발지 || '아직 없음'}`,
    가운데 ? `모두의 가운데: ${자리(가운데.lat)},${자리(가운데.lng)}` : '',
  ].filter(Boolean).join('\n');

  const 끝말 =
    '설명·인사·머리말 없이 **JSON 배열만** 답하라. 배열 밖에는 한 글자도 쓰지 마라.\n' +
    '좌표는 실제로 존재하는 그 장소의 위도·경도여야 한다. 모르면 그 항목을 빼라 — 지어내지 마라.';

  const prompt = kind === 'region'
    ? `${공통}\n이미 나온 지역: ${이미}\n\n` +
      '위 사람들이 **모두 모이기 좋은 지역(행정동)** 을 3곳 고르라.\n' +
      '· 가운데에서 너무 멀지 않고, 대중교통으로 닿기 쉬운 곳\n' +
      '· 이미 나온 지역은 빼라\n' +
      `· 출발지가 있는 나라·도시 안에서 고르라\n${끝말}\n` +
      '형식: [{"name":"성수동","lat":37.54470,"lng":127.05570}]'
    : `${공통}\n` +
      (정해진지역
        ? `정해진 지역: ${정해진지역.name}(${자리(정해진지역.lat)},${자리(정해진지역.lng)})\n`
        /* 지역이 아직 없는데 지점을 묻는 경우 — '지역까지만' 모임(scope=region)이 아니면 드물다.
           그때는 가운데를 기준으로 삼는다고 밝힌다. 얼버무리면 아무 데나 찍는다. */
        : '정해진 지역: 아직 없음 — 위 "모두의 가운데" 를 기준으로 삼으라\n') +
      `이미 나온 곳: ${이미}\n\n` +
      `**그 지역 안이나 걸어갈 만한 거리**에서 ${목적 || '함께 모이기'}에 어울리는 장소를 3곳 고르라.\n` +
      '· 실제로 있는 가게·건물·공원 이름이어야 한다\n' +
      '· 이미 나온 곳은 빼라\n' +
      `${끝말}\n` +
      '형식: [{"name":"황소곱창","lat":37.54430,"lng":127.05610}]';

  try {
    const r = await fetch(url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
      signal: AbortSignal.timeout(20000),
    });
    /* 왜 빈손인지 남긴다 — 401(키 만료)과 '결과 없음'이 로그에서 똑같아
       AI 가 조용히 죽어 있어도 알 길이 없었다. 키는 헤더에만 있고 여기 안 찍힌다. */
    /* 401·429·5xx 는 우리가 못 붙은 것이다 — 답을 받은 것이 아니다 */
    if (!r.ok) { console.warn('[ai] 응답 아님', r.status); return 못붙음(`응답 ${r.status}`); }
    const j = await r.json();
    const text: string = j?.choices?.[0]?.message?.content ?? '';
    /* 생각을 길게 적는 모델은 ```json 울타리 안에 넣거나 앞뒤에 말을 붙인다 —
       가장 바깥 대괄호 한 쌍을 집는다. 못 찾으면 '답은 받았는데 못 쓰겠다' 다. */
    const m2 = text.match(/\[[\s\S]*\]/);
    /* 여기서부터는 **답을 받은 것**이다 — 쓸 만하지 않아도 토큰은 나갔다 */
    if (!m2) { console.warn('[ai] 목록을 못 찾음', text.slice(0, 80)); return 닿음([]); }
    let arr: { name?: string; lat?: number; lng?: number }[];
    try { arr = JSON.parse(m2[0]); }
    catch (e) { console.warn('[ai] 목록을 못 읽음', (e as Error)?.message); return 닿음([]); }
    if (!Array.isArray(arr)) return 닿음([]);
    /* AI 는 그럴듯한 좌표를 지어낸다 — 도쿄 한복판도 태연히 준다.
       사람이 찍은 것과 같은 잣대로 거른다 (그릴링 논의55).
       ⚠ 이름이 같은 것이 두 번 오면 하나만 쓴다 — `refId` 가 이름으로 만들어지므로
          그대로 두면 같은 곳이 후보로 두 줄 선다. */
    const 본이름 = new Set<string>();
    return 닿음(arr
      .filter((x) => x?.name && typeof x.lat === 'number' && typeof x.lng === 'number'
        && 한국안(x.lat, x.lng))
      .filter((x) => { const n = String(x.name).trim(); if (본이름.has(n)) return false; 본이름.add(n); return true; })
      .slice(0, 3)
      .map((x) => ({ refId: 'ai:' + x.name, name: x.name!, lat: x.lat!, lng: x.lng! })));
  } catch (e) {
    /* 시간 초과·그물 끊김 — 못 붙은 것이다 */
    console.warn('[ai] 못 불렀다', (e as Error)?.message);
    return 못붙음((e as Error)?.message ?? '못 붙음');
  }
}
