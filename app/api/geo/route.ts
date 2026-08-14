/* 좌표 → 동 이름. 화면이 직접 외부를 부르지 않는다 (그릴링 논의27-2).
   이유 두 가지 —
     · Nominatim 운영 정책이 초당 1회·벌크 금지다. 브라우저마다 부르면 곧 막힌다.
     · 같은 자리를 여러 사람이 누른다. 한 번 물어 저장해 두면 두 번 안 묻는다.
   카카오가 살아 있으면 카카오를, 막히면 OSM 을 쓴다. 화면은 어느 쪽인지 모른다. */
import { NextResponse } from 'next/server';
import { lookupRegion, 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/* 모이머가 다루는 자리는 한국이다 — 그 밖은 물어볼 것도 없다.
   범위를 안 보면 파라미터가 빠졌을 때 Number(null) 이 0 이 돼 (0,0) 대서양으로
   실제 외부 호출이 나갔다(1초). 값이 없으면 NaN 으로 만들어 함께 걸리게 한다. */
const 수 = (v: string | null) => (v === null || v.trim() === '' ? NaN : Number(v));

export async function GET(req: Request) {
  /* 잠그지 않고 횟수만 본다 (그릴링 논의92). Nominatim 은 초당 1회 정책이라
     여기가 뚫리면 우리 서버가 아니라 바깥 서비스에서 먼저 막힌다. */
  const 제한 = 횟수확인('geo');
  if (!제한.ok) return 너무잦음(제한.다시);
  const u = new URL(req.url);
  const lat = 수(u.searchParams.get('lat'));
  const lng = 수(u.searchParams.get('lng'));
  /* 고를 수 없는 자리는 400 이 아니라 '여긴 못 골라요' 다 — 화면이 같은 말을 하게 503 으로 맞춘다.
     기다린다고 될 일이 아니라 retryable 은 false 다 (그릴링 논의101). */
  if (!한국안(lat, lng)) return NextResponse.json({ error: 'geo_unavailable', retryable: false }, { status: 503 });
  const r = await lookupRegion(lat, lng);
  if (r.hit) return NextResponse.json(r.hit);
  /* 빈손인 까닭을 이제 lib/geo 가 갈라 준다 — 여기는 그대로 옮겨 싣기만 한다 (논의101).
     바다·국외는 답을 받고도 고를 자리가 아닌 것이라 기다려도 안 되고(false),
     바깥이 못 답한 것만 다시 해 볼 값이 있다(true). 모르면서 true 를 싣지는 않는다. */
  return NextResponse.json(
    { error: 'geo_unavailable', retryable: r.miss === 'upstream' },
    { status: 503 },
  );
}
