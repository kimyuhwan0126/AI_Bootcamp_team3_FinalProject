/* 참여자 출발지 → 정해진 지점까지의 경로 (2026-08-15).
   화면이 카카오 대중교통 길찾기·TMAP 키를 직접 들고 부르지 않는다 — places 와 같은 규칙
   (키를 숨기고, 장애·할당량 오류를 한 곳에서 옮긴다). */
import { NextResponse } from 'next/server';
import { routeTransit, routeCar, RouteUnavailable } from '@/lib/routes';
import { 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const 수 = (v: string | null) => (v === null || v.trim() === '' ? NaN : Number(v));

export async function GET(req: Request) {
  /* 잠그지 않고 횟수만 본다 (places·geo 와 같은 규칙, 그릴링 논의92) */
  const 제한 = 횟수확인('routes');
  if (!제한.ok) return 너무잦음(제한.다시);

  const u = new URL(req.url);
  const from = { lat: 수(u.searchParams.get('fromLat')), lng: 수(u.searchParams.get('fromLng')) };
  const to = { lat: 수(u.searchParams.get('toLat')), lng: 수(u.searchParams.get('toLng')) };
  if (!한국안(from.lat, from.lng) || !한국안(to.lat, to.lng)) {
    return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
  }
  const mode = u.searchParams.get('mode');
  if (mode !== 'transit' && mode !== 'car') {
    return NextResponse.json({ error: 'bad_mode' }, { status: 400 });
  }

  try {
    const r = await (mode === 'car' ? routeCar(from, to) : routeTransit(from, to));
    /* null = 정말 길이 없다(장애가 아니다) — '못 그렸다'와 갈라 보여줘야 화면이
       "잠시 뒤 다시" 를 잘못 붙이지 않는다 (places 와 같은 규칙, 그릴링 논의101) */
    if (!r) return NextResponse.json({ points: [], distanceM: null, durationS: null, found: false });
    return NextResponse.json({ ...r, found: true });
  } catch (e) {
    if (e instanceof RouteUnavailable) {
      return NextResponse.json({ error: 'route_unavailable', where: e.where, retryable: true }, { status: 503 });
    }
    throw e;
  }
}
