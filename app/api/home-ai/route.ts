/* 홈 탭 'AI' 기준 (2026-08-22, 사용자 요청) — 로그인도 모임도 없는 맛보기 지도에서
   AI 추천을 실제로 부른다. 모임 화면의 AI(app/api/m/[code]/route.ts case 'ai')와
   같은 lib/ai.ts(askOllama)를 쓰지만, 여기는 아직 모임(DB 줄)이 없어 그쪽 한도
   (meetings.ai_used_region, 모임당 3번, db.useAi)를 못 건다 — 걸 줄 자체가 없다.
   대신 /api/geo·/api/places 와 같은 길(lib/ratelimit.ts, 기기 쿠키)로 기기 하나가
   짧은 시간에 너무 많이 못 부르게 막는다('home-ai' 버킷, 10분에 5번). */
import { NextResponse } from 'next/server';
import { suggestForOrigins } from '@/lib/ai';
import { 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
/* Ollama 응답을 기다린다(lib/ai.ts, primary 최대 35초 + 안 붙으면 fallback 또 35초) —
   기본 한도로 두면 Vercel 이 먼저 함수를 잘라 "AI 가 늦되다"가 아니라 "AI 가 늘
   죽어 있다"로 보인다(app/api/m/[code]/route.ts 와 같은 사고, 같은 값). */
export const maxDuration = 75;

type 원본출발지 = { name?: unknown; lat?: unknown; lng?: unknown };

export async function POST(req: Request) {
  const 제한 = 횟수확인('home-ai');
  if (!제한.ok) return 너무잦음(제한.다시);

  const body = await req.json().catch(() => null);
  const 받은것: 원본출발지[] = Array.isArray(body?.origins) ? body.origins : [];
  /* 사람이 지도에서 잡은 출발지만 믿는다 — 이름·좌표가 온전하지 않은 줄은 버린다.
     최대 8곳(홈 출발지 한도, app/탐색/탐색.tsx 의 `최대`)까지만 본다 — 그 이상은
     보낼 길이 화면에 없으니 여기 온 것은 어차피 그 안이지만, 잘못 보낸 값이 프롬프트를
     끝없이 늘리는 것까지는 막는다. */
  const 출발지 = 받은것
    .filter((o): o is { name: string; lat: number; lng: number } =>
      typeof o?.name === 'string' && o.name.trim().length > 0
      && typeof o.lat === 'number' && typeof o.lng === 'number' && 한국안(o.lat, o.lng))
    .slice(0, 8);
  if (!출발지.length) return NextResponse.json({ error: 'no_origins' }, { status: 400 });

  const 결과 = await suggestForOrigins(출발지);
  /* 모임 화면과 같은 잣대 — 못 붙은 것과 '답은 받았는데 쓸 게 없다'를 갈라 화면이
     다른 말을 하게 한다(논의101 · 위 lib/ai.ts 머리말). 여기는 되돌려 줄 횟수가 없다
     (애초에 DB 에 안 셌다) — 그냥 503 이면 된다. */
  if (!결과.닿음 || !결과.picks.length) {
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 });
  }
  return NextResponse.json({
    picks: 결과.picks.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng })),
  });
}
