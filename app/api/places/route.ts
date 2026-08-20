/* 누른 자리 주변의 가게 (그릴링 논의32).
   화면이 카카오를 직접 부르지 않는다 — 키를 숨기고, 할당량 오류를 한 곳에서 옮긴다.
   카카오가 막히면 OSM(Overpass)으로 내려간다. 지도와 같은 규칙이다(논의27). */
import { NextResponse } from 'next/server';
import { placesNear, PlacesUnavailable, type PlaceList, type 둘레변종 } from '@/lib/places';
import { 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/* 모이머가 다루는 자리는 한국이다(카카오도 countrycodes=kr 로 묻는다).
   범위를 안 보면 파라미터가 빠졌을 때 Number(null) 이 0 이 돼 (0,0) — 대서양 한가운데로
   실제 외부 호출이 나갔다. 값이 없으면 NaN 으로 만들어 아래 비교에서 함께 걸린다.
   기준은 lib/geo.ts 한 곳에만 둔다 — 세 군데에 베껴 두면 하나만 고치고 잊는다. */
const 수 = (v: string | null) => (v === null || v.trim() === '' ? NaN : Number(v));
/* 반경 상한 — r=-1·Infinity 가 그대로 Overpass 로 나가 12초를 흘려보냈다 */
const R_기본 = 300, R_최소 = 50, R_최대 = 5000;

export async function GET(req: Request) {
  /* 잠그지 않고 횟수만 본다 (그릴링 논의92) — 참여 전 출발지 고르기가 열려 있어야 한다.
     검사보다 앞에 둔다: 엉터리 파라미터로 두들기는 것도 서버 일감이다. */
  const 제한 = 횟수확인('places');
  if (!제한.ok) return 너무잦음(제한.다시);
  const u = new URL(req.url);
  const lat = 수(u.searchParams.get('lat'));
  const lng = 수(u.searchParams.get('lng'));
  if (!한국안(lat, lng)) return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
  const raw = u.searchParams.get('r');
  const radius = raw === null || raw.trim() === '' ? R_기본 : Number(raw);
  if (!(radius >= R_최소 && radius <= R_최대)) {
    return NextResponse.json({ error: 'bad_radius' }, { status: 400 });
  }
  /* 누가 묻는가 — 화면마다 무엇을 물을지가 다르다(lib/places.ts 의 `변종표`).
     `for=home` 만 홈 갈래(주차장 포함 · 갯수 제한 없음)로 간다. 아무 값이나 오면 기본이다:
     화면이 갈래 코드를 직접 보내게 두면 바깥에서 아무 코드나 밀어 넣을 수 있다. */
  const 변종: 둘레변종 = u.searchParams.get('for') === 'home' ? '홈' : '기본';

  /* '못 불러왔다'와 '정말 없다'는 다른 말이다. 안 받으면 Next 가 500 + HTML 을 내보내고
     화면은 "여기엔 등록된 지점이 없어요" 라고 잘못 말한다.
     partial 은 셀 수 없는 칸이라 JSON.stringify 가 지운다 — 봉투에 따로 싣는다. */
  let r: PlaceList | 'quota';
  try {
    r = await placesNear(lat, lng, radius, 변종);
  } catch (e) {
    /* retryable 은 '기다리면 된다'는 표다 — 화면이 "잠시 뒤에 다시" 를 붙일지 여기서 갈린다
       (그릴링 논의101). 못 고를 자리(좌표 밖)와 지금 못 부르는 것은 다른 말이다. */
    if (e instanceof PlacesUnavailable)
      return NextResponse.json({ error: 'places_unavailable', where: e.where, retryable: true }, { status: 503 });
    throw e;
  }
  if (r === 'quota') return NextResponse.json({ error: 'quota_kakao', retryable: false }, { status: 429 });
  return NextResponse.json({ places: r, partial: r.partial === true });
}
