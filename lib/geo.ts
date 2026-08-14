/* 좌표 → 동 이름. 카카오가 먼저, 막히면 OSM (그릴링 논의27).
   같은 자리를 두 번 묻지 않는다 — 소수 4자리(약 11m)로 칸을 나눠 저장한다. */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!, { fetchOptions: { cache: 'no-store' } });

/* country 는 ISO 3166-1 두 글자(소문자) — 'kr', 'jp'…. 못 읽었으면 'zz'.
   국외를 지역 후보에서 막을지 말지는 사람이 정할 일이라 여기서는 알려만 준다. */
export type GeoHit = { code: string; name: string; source: 'kakao' | 'osm'; country: string };

/* 빈손인 까닭을 함께 준다 (그릴링 논의101) — 전에는 셋을 다 `null` 로 뭉갰다.
   그래서 `api/geo` 가 503 에 `retryable` 을 못 실었고, 화면은 '바다라 못 고르는 자리'와
   '바깥이 잠깐 못 답한 것'에 같은 말을 했다. 앞엣것은 기다려도 안 되고 뒤엣것은 기다리면 된다.
     outside   — 한국 상자 밖이라 물어보지도 않았다
     no_region — 물어봤고 답도 왔는데 고를 수 있는 자리가 아니다 (바다·국외)
     upstream  — 바깥이 못 답했다. 여기만 다시 해 볼 값이 있다 */
export type GeoMiss = 'outside' | 'no_region' | 'upstream';
export type GeoLookup = { hit: GeoHit; miss: null } | { hit: null; miss: GeoMiss };

const 찾음 = (hit: GeoHit): GeoLookup => ({ hit, miss: null });
const 못찾음 = (miss: GeoMiss): GeoLookup => ({ hit: null, miss });

const 나라모름 = 'zz';
const T_KAKAO = 5_000;
const T_NOMINATIM = 8_000;

/* 받아 주는 자리는 한국으로 못 박는다 (그릴링 결정). 제주·울릉·독도가 들어오는 상자다.
   입구(app/api/geo·places)에도 같은 상자가 있지만 여기에도 둔다 —
   AI 가 지어낸 좌표와 내부 호출은 입구를 거치지 않아 그대로 바깥으로 나갔다.
   NaN 도 이 비교에서 함께 걸린다: 파라미터가 빠져 Number(null) 이 0 이 되면
   (0,0) 대서양으로 진짜 호출이 나갔다. */
const 위도 = [33, 38.7], 경도 = [124.5, 132];
export const 한국안 = (lat: number, lng: number) =>
  lat >= 위도[0] && lat <= 위도[1] && lng >= 경도[0] && lng <= 경도[1];

/* 왜 실패했는지 남긴다 — 401(키 만료)과 '결과 없음'이 로그에서 같아 보이면 고칠 수가 없다.
   키는 헤더에만 있고 여기 찍히는 것은 상태와 사유뿐이다. */
const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

const key = (lat: number, lng: number) => ({
  gx: Math.round(lng * 10000), gy: Math.round(lat * 10000),
});

/* Nominatim 은 초당 1회. 시각만 재고 각자 기다리면 동시에 들어온 요청이 모두 같은 값을 보고
   한꺼번에 빠져나간다 — 10개가 2.3초에 끝났다(끝난 간격 0~9ms). 줄이 아니라 경주였다.
   앞사람의 약속 뒤에 이어 붙여야 진짜 줄이 선다. */
let lastOsm = 0;
let 줄: Promise<unknown> = Promise.resolve();
const spaceOut = () => {
  const 내차례 = 줄.then(async () => {
    const wait = 1100 - (Date.now() - lastOsm);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastOsm = Date.now();
  });
  /* 앞사람이 넘어져도 줄은 이어져야 한다 */
  줄 = 내차례.catch(() => {});
  return 내차례;
};

async function fromKakao(lat: number, lng: number): Promise<GeoLookup> {
  const k = process.env.KAKAO_REST_API_KEY;
  /* 키가 없으면 '자리가 아니다'가 아니라 '못 물어봤다'이다 — OSM 이 답하면 그쪽이 이긴다 */
  if (!k) return 못찾음('upstream');
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      {
        headers: { Authorization: `KakaoAK ${k}` }, cache: 'no-store',
        signal: AbortSignal.timeout(T_KAKAO),
      },
    );
    /* 401·429 면 OSM 으로 — 다만 조용히 넘어가지는 않는다 */
    if (!r.ok) { console.warn(`[geo] 카카오 응답 ${r.status} — OSM 으로 간다`); return 못찾음('upstream'); }
    const j = await r.json();
    const h = j.documents?.find((d: any) => d.region_type === 'H') ?? j.documents?.[0];
    if (!h) return 못찾음('no_region');
    /* 행정동이 아니면 고를 수 없다 (그릴링 논의33 ②).
       바다를 누르면 카카오가 '서해'(code 90009)를 돌려준다 — 그게 후보로 올라갔다.
       3단계 이름(동·읍·면)이 있어야 진짜 사람 사는 자리다. */
    if (!h.region_3depth_name) return 못찾음('no_region');
    /* 카카오는 국내만 답한다 — 답이 왔다는 것이 곧 한국이라는 뜻이다 */
    return 찾음({ code: h.code, name: h.region_3depth_name, source: 'kakao', country: 'kr' });
  } catch (e) { console.warn(`[geo] 카카오 못 부름 — ${why(e)}`); return 못찾음('upstream'); }
}

async function fromOsm(lat: number, lng: number): Promise<GeoLookup> {
  try {
    await spaceOut();
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`,
      {
        headers: { 'user-agent': 'moimer/0.1 (contact: whoami611319@gmail.com)' },
        cache: 'no-store', signal: AbortSignal.timeout(T_NOMINATIM),
      },
    );
    if (!r.ok) { console.warn(`[geo] nominatim 응답 ${r.status}`); return 못찾음('upstream'); }
    const a = (await r.json()).address ?? {};
    /* OSM 도 같은 규칙 — 동네 단위가 없으면 고를 수 없는 자리다.
       city_district(구)는 뺀다: '성동구'가 동 자리에 앉으면 지역을 두 번 고르는 꼴이다. */
    const name = a.quarter || a.neighbourhood || a.suburb || a.town || a.village;
    if (!name) return 못찾음('no_region');
    /* Nominatim 은 나라를 가리지 않는다 — 도쿄·뉴욕도 동 이름을 준다.
       막지는 않되 어느 나라인지는 반드시 함께 올려 보낸다 (위에서 가릴 수 있게). */
    const country = String(a.country_code ?? '').toLowerCase() || 나라모름;
    /* OSM 에는 행정동 코드가 없다 — 이름으로 같은 곳을 합친다.
       카카오 코드와 섞이지 않게 앞에 표시를 붙인다. */
    return 찾음({ code: `osm:${name}`, name, source: 'osm', country });
  } catch (e) { console.warn(`[geo] nominatim 못 부름 — ${why(e)}`); return 못찾음('upstream'); }
}

/* 캐시는 빠르라고 있는 것이다 — 여기서 넘어져도 요청까지 죽이지는 않는다 */
async function 캐시읽기(gx: number, gy: number): Promise<GeoHit | null> {
  try {
    const c = (await sql`
      select region_code, name, source, country from geo_cache where gx = ${gx} and gy = ${gy}
    `) as { region_code: string | null; name: string; source: string; country: string | null }[];
    /* 나라를 모르는 옛 줄은 없는 셈 친다 — 한 번 다시 물어 채운다 */
    if (!c[0]?.country) return null;
    await sql`update geo_cache set hit_at = now() where gx = ${gx} and gy = ${gy}`;
    return {
      code: c[0].region_code ?? `osm:${c[0].name}`,
      name: c[0].name,
      source: c[0].source as 'kakao' | 'osm',
      country: c[0].country,
    };
  } catch (e) { console.warn(`[geo] 캐시를 못 읽었다 — ${why(e)}`); return null; }
}

async function 캐시쓰기(gx: number, gy: number, hit: GeoHit) {
  try {
    /* 이름만 고치면 카카오로 들어간 줄이 OSM 값으로 덮여도 code·source 가 옛것으로 남는다 */
    await sql`
      insert into geo_cache (gx, gy, region_code, name, source, country)
      values (${gx}, ${gy}, ${hit.code}, ${hit.name}, ${hit.source}, ${hit.country})
      on conflict (gx, gy) do update set
        region_code = excluded.region_code, name = excluded.name,
        source = excluded.source, country = excluded.country, hit_at = now()
    `;
  } catch (e) { console.warn(`[geo] 캐시를 못 남겼다 — ${why(e)}`); }
}

/* 네모 상자는 바깥 호출을 아끼는 장치일 뿐이다 — 그 안에 대마도가 통째로 들어온다.
   돌아온 나라 코드가 마지막 증거다 (그릴링 논의60).
   못 읽었을 때('zz')는 막지 않는다 — 상자 안이면 한국일 가능성이 훨씬 크고,
   여기서 막으면 카카오가 죽었을 때 국내마저 못 고르게 된다. */
const 한국것 = (h: GeoHit) => h.country === 나라모름 || h.country === 'kr';

export async function lookupRegion(lat: number, lng: number): Promise<GeoLookup> {
  /* 캐시보다 앞이다 — 안 받는 자리는 저장할 값도 아니다 */
  if (!한국안(lat, lng)) return 못찾음('outside');
  const { gx, gy } = key(lat, lng);
  const c = await 캐시읽기(gx, gy);
  /* 캐시에도 국외가 이미 들어 있다(도쿄 12줄 등) — 읽을 때도 거른다.
     이미 답을 받아 적어 둔 자리라 기다린다고 달라지지 않는다 */
  if (c) return 한국것(c) ? 찾음(c) : 못찾음('no_region');

  const k = await fromKakao(lat, lng);
  const r = k.hit ? k : await fromOsm(lat, lng);
  /* 한쪽이라도 '답은 왔는데 고를 자리가 아니다' 라고 하면 그것이 답이다 —
     다른 한쪽이 못 답한 것은 다시 해 볼 까닭이 못 된다 */
  if (!r.hit) return 못찾음(k.miss === 'no_region' || r.miss === 'no_region' ? 'no_region' : 'upstream');
  /* 상자 안에 대마도가 통째로 들어온다 — 나라 코드가 마지막 증거다 (논의60).
     이것도 기다려서 될 일이 아니다 */
  if (!한국것(r.hit)) return 못찾음('no_region');

  await 캐시쓰기(gx, gy, r.hit);
  return r;
}
