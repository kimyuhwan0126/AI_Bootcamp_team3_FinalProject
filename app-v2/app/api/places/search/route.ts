/* 이름으로 자리 찾기 — 출발지 고르기 (그릴링 논의35 ①).
   지도 탭(=주변 가게)과는 쓰임이 다르다: 여기는 '역·동네·건물'을 이름으로 찾는다. */
import { NextResponse } from 'next/server';
import { searchPlaces, PlacesUnavailable, type PlaceList } from '@/lib/places';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/* 두 글자 아래는 찾을 것이 없고, 이 위로는 자리 이름이 아니다.
   상한이 없어 600자가 그대로 카카오까지 나갔다 — 둘 다 '못 찾았다'로 접는다(외부 미호출). */
const 최소 = 2, 최대 = 60;

export async function GET(req: Request) {
  /* 주변 가게 쪽과 같은 규칙 — 횟수만 본다 (그릴링 논의92). 여기가 참여 전에 열려 있어야 하는 길이다 */
  const 제한 = 횟수확인('search');
  if (!제한.ok) return 너무잦음(제한.다시);
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 최소 || q.length > 최대) return NextResponse.json({ places: [] });
  /* 주변 가게 쪽과 같은 규칙 — 못 불러온 것을 '없다'로 말하지 않는다 */
  let r: PlaceList | 'quota';
  try {
    r = await searchPlaces(q);
  } catch (e) {
    /* retryable = 기다리면 된다 (그릴링 논의101) — 화면이 "잠시 뒤에 다시" 를 붙일 표다 */
    if (e instanceof PlacesUnavailable)
      return NextResponse.json({ error: 'places_unavailable', where: e.where, retryable: true }, { status: 503 });
    throw e;
  }
  if (r === 'quota') return NextResponse.json({ error: 'quota_kakao', retryable: false }, { status: 429 });
  return NextResponse.json({ places: r, partial: r.partial === true });
}
