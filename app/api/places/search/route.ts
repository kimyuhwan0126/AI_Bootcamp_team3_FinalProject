/* 이름으로 자리 찾기 — 출발지 고르기(그릴링 논의35 ①) · 지점 고르기(확정된 지역 안에서 찾기).
   지도 탭(=주변 가게)과는 쓰임이 다르다: 여기는 '역·동네·건물·가게'를 이름으로 찾는다.
   lat·lng·r 을 주면 그 반경 안으로 좁혀 찾는다(안 주면 예전처럼 전국). */
import { NextResponse } from 'next/server';
import { searchPlaces, PlacesUnavailable, type PlaceList } from '@/lib/places';
import { 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/* 두 글자 아래는 찾을 것이 없고, 이 위로는 자리 이름이 아니다.
   상한이 없어 600자가 그대로 카카오까지 나갔다 — 둘 다 '못 찾았다'로 접는다(외부 미호출). */
const 최소 = 2, 최대 = 60;
/* 반경 상한 — app/api/places/route.ts 와 같은 값. r=-1·Infinity 가 그대로 나가지 않게 */
const R_최소 = 50, R_최대 = 5000;
const 수 = (v: string | null) => (v === null || v.trim() === '' ? NaN : Number(v));

export async function GET(req: Request) {
  /* 주변 가게 쪽과 같은 규칙 — 횟수만 본다 (그릴링 논의92). 여기가 참여 전에 열려 있어야 하는 길이다 */
  const 제한 = 횟수확인('search');
  if (!제한.ok) return 너무잦음(제한.다시);
  const u = new URL(req.url);
  const q = u.searchParams.get('q')?.trim() ?? '';
  if (q.length < 최소 || q.length > 최대) return NextResponse.json({ places: [] });

  /* lat·lng 둘 다 있어야 좁혀 찾는다 — 하나만 있으면 무시하고 예전처럼 전국을 본다.
     좌표가 이상하면(bad_coords) 조용히 넘어가지 않고 막는다 — 엉뚱한 반경으로 찾고서
     '없다'고 답하면 사용자는 그 자리가 정말 없는 줄 안다. */
  const latRaw = u.searchParams.get('lat'), lngRaw = u.searchParams.get('lng');
  let near: { lat: number; lng: number; radius: number } | undefined;
  if (latRaw !== null || lngRaw !== null) {
    const lat = 수(latRaw), lng = 수(lngRaw);
    if (!한국안(lat, lng)) return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
    const rRaw = u.searchParams.get('r');
    const radius = rRaw === null || rRaw.trim() === '' ? R_최대 : Number(rRaw);
    if (!(radius >= R_최소 && radius <= R_최대)) {
      return NextResponse.json({ error: 'bad_radius' }, { status: 400 });
    }
    near = { lat, lng, radius };
  }

  /* 주변 가게 쪽과 같은 규칙 — 못 불러온 것을 '없다'로 말하지 않는다 */
  let r: PlaceList | 'quota';
  try {
    r = await searchPlaces(q, near);
  } catch (e) {
    /* retryable = 기다리면 된다 (그릴링 논의101) — 화면이 "잠시 뒤에 다시" 를 붙일 표다 */
    if (e instanceof PlacesUnavailable)
      return NextResponse.json({ error: 'places_unavailable', where: e.where, retryable: true }, { status: 503 });
    throw e;
  }
  if (r === 'quota') return NextResponse.json({ error: 'quota_kakao', retryable: false }, { status: 429 });
  return NextResponse.json({ places: r, partial: r.partial === true });
}
