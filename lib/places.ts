/* 좌표 주변의 가게. 카카오가 먼저, 막히면 OSM (그릴링 논의32 · 논의27과 같은 규칙).
   같은 자리를 두 번 묻지 않는다 — lib/geo.ts 의 geo_cache 와 같은 칸으로 저장한다 (논의63). */
import { neon } from '@neondatabase/serverless';

export type Place = {
  id: string; name: string; address: string; lat: number; lng: number;
  /** 카카오 category_group_name('음식점'…) 이거나 OSM 태그(restaurant…) */
  category?: string;
  /** 카카오 category_name — "음식점 > 술집 > 호프,요리주점". **술집을 음식점에서 갈라내는
      것은 이것뿐이다**(lib/장소갈래.ts 머리말). 옛 캐시 줄에는 없을 수 있어 선택값이다. */
  categoryDetail?: string;
  /* ── 아래 둘은 2026-08-20 에 늘렸다 — 홈 탐색 모드의 **장소 시트**가 쓴다
     (app/홈/시트내용_장소.tsx). 그 시트가 이름과 주소만 적으면 눌러서 얻는 것이 없다.
     ⚠ 둘 다 **카카오에만 있다.** OSM 폴백에는 없고, 카카오도 안 주는 가게가 많다 —
     화면은 있을 때만 그 줄을 세운다. 옛 캐시 줄에도 없으므로 선택값이다. */
  /** 카카오 phone — "031-413-5051". 빈 문자열로 오는 일이 잦아 아래에서 걸러 담는다. */
  phone?: string;
  /** 카카오 place_url — 그 가게의 카카오맵 페이지. 사진·영업시간은 우리가 안 받아 온다. */
  url?: string;
};

/* 몇 곳은 불러왔고 몇 곳은 못 불러왔다 — 목록에 곁가지로 얹는다(정규식 match.index 와 같은 결).
   JSON 은 배열의 번호 칸만 내보내니 통신 모양은 그대로다. 알고 싶은 쪽만 partial 을 본다. */
export type PlaceList = Place[] & { partial?: boolean };

/* '없다'와 '못 불러왔다'는 다른 말이다. 빈 목록으로 돌려주면 화면이
   "여기엔 등록된 지점이 없어요" 라고 해, 바깥이 죽은 것을 없는 것으로 만든다.
   부르는 쪽이 두 가지를 갈라 말할 수 있게 못 불러온 것은 던진다. */
export class PlacesUnavailable extends Error {
  where: string;
  constructor(where: 'kakao' | 'osm' | 'all') {
    super(`places_unavailable:${where}`);
    this.name = 'PlacesUnavailable';
    this.where = where;
  }
}

/* Overpass 는 서버마다 가용성이 다르다. 살아 있는 곳을 차례로 쓴다.
   이 회선에서 재 보니 mail.ru 만 답한다(1.8초). kumi 25초·본진 21초 둘 다 안 닿는다 —
   답하는 곳을 앞에 두어야 폴백마다 9초씩 버리지 않는다. 회선이 바뀔 수 있어 뒤는 남겨 둔다. */
const OVERPASS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

/* 모이머가 다루는 자리 — 밥·술·커피·문화·야외 */
const KAKAO_GROUPS = ['FD6', 'CE7', 'CT1', 'AT4'];

/* ── 무엇을 물을 것인가 ─────────────────────────────────────
   부르는 화면마다 묻는 것이 다르다. 한 함수에 두 갈래를 두는 대신 **이름 붙인 변종**으로
   둔다 — 화면이 갈래 코드를 직접 보내면 바깥에서 아무 코드나 밀어 넣을 수 있고,
   무엇을 물었는지가 캐시 열쇠에 안 담겨 두 화면이 서로의 목록을 뺏어 간다.

     기본  모임 화면 지점 고르기(app/m/[code]/ui.tsx) — 네 갈래 · 갈래당 5곳.
           **안 건드린다.** 지점 후보 목록은 짧아야 고를 만하다.
     홈    홈 화면 주변 탐색(app/홈) — 위 넷 + 주차장, **갈래당 갯수 제한 없음**
           (2026-08-20 사용자 요청). 홈은 갈래 칩을 하나씩 켜 보는 자리라 한 번에
           보이는 것은 한 갈래뿐이고, 그 갈래는 둘레에 있는 만큼 다 보여야 뜻이 있다. */
export type 둘레변종 = '기본' | '홈';

/* 카카오에 무엇을 물을 것인가. 갈래 코드가 있는 것은 카테고리 검색으로, 없는 것(술집)은
   **낱말 검색**으로 묻는다 — 카카오의 갈래 코드는 음식점(FD6)까지고 술집은 그 안에 있어서,
   FD6 안에서 골라내기만 하면 가까운 음식점 45곳에 낀 술집 몇 곳뿐이다. 따로 물으면
   술집에도 제 몫의 45곳이 생긴다. */
type 물음 = { 갈래코드: string } | { 낱말: string };

const 변종표: Record<둘레변종, { 물음들: 물음[]; 갈래당: number | null; 열쇠칸: number }> = {
  /* `갈래당: null` 은 '카카오가 주는 만큼 다' 다 — 아래 fromKakao 가 쪽을 넘겨 가며 받는다 */
  기본: { 물음들: KAKAO_GROUPS.map((갈래코드) => ({ 갈래코드 })), 갈래당: 5, 열쇠칸: 0 },
  홈: {
    물음들: [...KAKAO_GROUPS.map((갈래코드) => ({ 갈래코드 })), { 갈래코드: 'PK6' }, { 낱말: '술집' }],
    갈래당: null, 열쇠칸: 2,
  },
};

/* 카카오 카테고리 검색의 한 쪽 크기와 쪽 수 상한. size 는 15가 최대이고 그 위로는 400 이 온다.
   쪽은 끝(is_end)까지 넘기되 3쪽에서 멈춘다 — 카카오가 한 물음에 내주는 것이 45개까지다. */
const 카카오한쪽 = 15;
const 카카오최대쪽 = 3;

/* 안 끊기는 것이 늦게 오는 것보다 나쁘다 — 바깥으로 나가는 것은 전부 시간을 걸어 둔다 */
const T_KAKAO = 5_000;
const T_NOMINATIM = 8_000;
const T_OVERPASS = 9_000;
/* 거울이 셋인데 하나에 9초씩 매달리면 27초다 — 실측으로 그렇게 됐다.
   mail.ru 는 잇달아 부르면 답을 안 준다: 한 번 성공한 직후 셋 다 타임아웃이 났다.
   거울을 옮겨 다니는 값을 다 합쳐도 이 시간을 못 넘게 못 박는다. */
const T_OVERPASS_전체 = 12_000;

/* 답이 없던 거울은 몇 분 쉬게 둔다 (논의63 곁들이).
   캐시는 이미 눌러 본 자리만 구한다 — 새 자리를 누를 때마다 죽은 거울을 9초씩 다시 두드리면
   그 12초를 그대로 버린다. 거울은 되살아나므로 영영 빼지는 않는다. */
const 거울쉼 = 3 * 60_000;
/* 앞 거울이 예산을 다 써 3초밖에 못 받고 끊긴 거울은 짧게만 쉰다 —
   멀쩡할 때도 5~9초 걸리는 곳이라(실측) 3초로 판정하면 살아 있는 거울을 벤치에 앉힌다. */
const 거울짧은쉼 = 30_000;
const 쉬는거울 = new Map<string, number>();

/* 왜 실패했는지 남긴다 — 401(키 만료)과 '결과 없음'이 로그에서 같아 보이면 고칠 수가 없다.
   키는 헤더에만 있고 여기 찍히는 것은 상태와 사유뿐이다. */
const why = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

/* partial 은 세지 않는 칸으로 붙인다 — 목록을 돌리거나 JSON 으로 바꿀 때 끼어들지 않게 */
const 목록 = (ps: Place[], partial: boolean): PlaceList => {
  if (partial) Object.defineProperty(ps, 'partial', { value: true, enumerable: false });
  return ps as PlaceList;
};

/* ── 저장해 두기 (논의63) ──────────────────────────────────────
   geo_cache 와 같은 칸: 좌표를 소수 4자리(약 11m)로 잘라 나눈다.
   반경이 다르면 다른 목록이라 열쇠에 함께 넣는다 — 안 넣으면 300m 로 뜬 목록이 1km 요청에 그대로 나간다. */
/* 열쇠에 **무엇을 물었는가**까지 담는다 — 같은 자리·같은 반경이라도 홈(다섯 갈래·무제한)과
   모임 화면(네 갈래·갈래당 5곳)은 서로 다른 목록이다. 한 칸에 담으면 먼저 쓴 쪽이 뒤엣것에게
   반쪽짜리를 내민다.
   ⚠ 표에 칸을 더하지 않고 `radius` 정수 안에 섞는다 — 이미 만들어진 places_cache 의
   기본키(gx,gy,radius)까지 고쳐야 하는데, 이건 버려도 되는 캐시라 그 값이 없다.
   반경은 50~5000 만 들어온다(app/api/places/route.ts 가 막는다) — 백만 단위는 안 겹친다. */
const 열쇠칸너비 = 1_000_000;
const key = (lat: number, lng: number, radius: number, 변종: 둘레변종) => ({
  gx: Math.round(lng * 10000), gy: Math.round(lat * 10000),
  r: Math.round(radius) + 변종표[변종].열쇠칸 * 열쇠칸너비,
});

/* 동 이름은 1년을 둬도 되지만 가게는 문을 닫고 새로 생긴다 — 하루를 두면 없어진 가게를 계속 내민다.
   모임 하나가 자리를 정하는 데 걸리는 시간(길어야 한나절)만 덮으면 된다. 그 안에서는 여럿이
   같은 자리를 눌러도 바깥에 한 번만 나간다. 반나절 전에 생긴 가게를 못 보는 것이
   누를 때마다 12초를 버리는 것보다 낫다. */
const 유통기한 = 6 * 60 * 60_000;
/* 빈손은 더 짧게 — '아직 아무것도 안 올라온 동네'가 반나절 내내 빈 채로 굳으면
   그 사이 카카오에 가게가 등록돼도 못 본다 */
const 빈손유통기한 = 30 * 60_000;

/* 캐시는 곁다리다 — DATABASE_URL 이 없어도(모듈만 불러 보는 시험) 이 파일은 떠야 한다.
   geo.ts 처럼 맨 위에서 붙이면 import 하는 순간 터진다. 처음 쓸 때 붙는다. */
let _sql: ReturnType<typeof neon> | null = null;
const db = () => (_sql ??= neon(process.env.DATABASE_URL!, { fetchOptions: { cache: 'no-store' } }));

/* 이 표는 schema_v2.sql 이 가져야 한다(geo_cache 와 같은 자리). 그 파일을 지금 다른 갈래가 쥐고 있어
   여기서 한 번만 만들어 둔다 — DDL 이 스키마로 옮겨 가면 이 함수는 지운다. */
let 표만들기: Promise<unknown> | null = null;
function 표준비() {
  if (!표만들기) {
    표만들기 = db()`
      create table if not exists places_cache (
        gx      integer not null,           -- round(lng * 10000)
        gy      integer not null,           -- round(lat * 10000)
        radius  integer not null,           -- 반경(m) — 열쇠의 일부
        /* jsonb 가 아니라 json 이다 — jsonb 는 칸 차례를 제 맘대로 다시 세워
           (id,name,address,lat,lng → id,lat,lng,name,address) 캐시에서 나온 응답이
           갓 받아온 응답과 달라진다. 여기 담는 것은 뒤져 볼 값이 아니라 그대로 돌려줄 값이다. */
        places  json not null,
        made_at timestamptz not null default now(),
        primary key (gx, gy, radius)
      )
    `.catch((e) => { 표만들기 = null; throw e; });   /* 한 번 실패한 것이 굳지 않게 */
  }
  return 표만들기;
}

/* 캐시는 빠르라고 있는 것이다 — 여기서 넘어져도 요청까지 죽이지는 않는다 (geo.ts 와 같은 규칙) */
async function 캐시읽기(gx: number, gy: number, r: number): Promise<Place[] | null> {
  try {
    await 표준비();
    const c = (await db()`
      select places, made_at from places_cache where gx = ${gx} and gy = ${gy} and radius = ${r}
    `) as { places: Place[] | null; made_at: string | Date }[];
    if (!c[0]) return null;
    const ps = c[0].places ?? [];
    /* geo_cache 의 hit_at 같은 칸은 두지 않는다 — 읽을 때마다 update 왕복이 하나 더 붙어
       캐시가 카카오만큼 느려진다. 상한은 만든 시각 하나로 판정하고, 지난 줄은 다음 성공이 덮는다. */
    if (Date.now() - new Date(c[0].made_at).getTime() > (ps.length ? 유통기한 : 빈손유통기한)) return null;
    return ps;
  } catch (e) { console.warn(`[places] 캐시를 못 읽었다 — ${why(e)}`); return null; }
}

async function 캐시쓰기(gx: number, gy: number, r: number, ps: Place[]) {
  try {
    await 표준비();
    await db()`
      insert into places_cache (gx, gy, radius, places)
      values (${gx}, ${gy}, ${r}, ${JSON.stringify(ps)}::json)
      on conflict (gx, gy, radius) do update set places = excluded.places, made_at = now()
    `;
  } catch (e) { console.warn(`[places] 캐시를 못 남겼다 — ${why(e)}`); }
}

type KakaoOut =
  | { st: 'ok'; places: Place[]; partial: boolean }   /* partial = 넷 중 몇 갈래는 못 물어봤다 */
  | { st: 'quota' }
  | { st: 'down' }                                    /* 넷 다 막혔다 */
  | { st: 'off' };                                    /* 키가 없다 — 실패가 아니라 안 쓰는 것 */

async function fromKakao(lat: number, lng: number, radius: number, 변종: 둘레변종): Promise<KakaoOut> {
  const k = process.env.KAKAO_REST_API_KEY;
  if (!k) return { st: 'off' };
  const { 물음들, 갈래당 } = 변종표[변종];
  /* 갈래당 상한이 있으면 한 쪽만, 없으면 카카오가 끝났다고 할 때까지 쪽을 넘긴다 */
  const 한쪽 = 갈래당 ?? 카카오한쪽;
  const 쪽수 = 갈래당 ? 1 : 카카오최대쪽;
  const out: Place[] = [];
  let 성공 = 0, 실패 = 0;
  for (const 물 of 물음들) {
    const 이름 = '갈래코드' in 물 ? 물.갈래코드 : `낱말:${물.낱말}`;
    /* 낱말 검색은 endpoint 도 파라미터 이름도 다르다 — 나머지(좌표·반경·정렬·쪽)는 같다 */
    const 앞 = '갈래코드' in 물
      ? `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${물.갈래코드}`
      : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(물.낱말)}`;
    /* 한 갈래 안에서 쪽을 넘기다 막히면 거기서 멈추고 **모은 것은 남긴다** —
       2쪽이 안 왔다고 1쪽까지 버리면 있는 자리가 없는 자리가 된다. */
    let 갈래성공 = 0;
    for (let 쪽 = 1; 쪽 <= 쪽수; 쪽++) {
      try {
        const r = await fetch(
          `${앞}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=${한쪽}&page=${쪽}`,
          { headers: { Authorization: `KakaoAK ${k}` }, cache: 'no-store', signal: AbortSignal.timeout(T_KAKAO) });
        if (r.status === 429) return { st: 'quota' };  /* 한도 — 화면이 방장에게만 원인을 말한다 */
        /* 한 갈래가 막혔다고 모아 둔 것을 버리지 않는다 — 있는 자리가 없는 자리가 된다 */
        if (!r.ok) { console.warn(`[places] 카카오 ${이름} ${쪽}쪽 응답 ${r.status}`); break; }
        const j = await r.json();
        for (const d of j.documents ?? []) {
          out.push({
            id: `kakao:${d.id}`, name: d.place_name,
            address: d.road_address_name || d.address_name || '',
            lat: Number(d.y), lng: Number(d.x),
            category: d.category_group_name, categoryDetail: d.category_name,
            /* 빈 문자열은 아예 안 담는다 — 담으면 캐시 줄만 길어지고, 화면은 `!!phone`
               으로 가르므로 결과가 같다. `undefined` 는 JSON.stringify 가 지운다. */
            phone: d.phone || undefined, url: d.place_url || undefined,
          });
        }
        갈래성공++;
        /* 끝났다고 하면 더 안 묻는다 — 빈 쪽을 두 번 더 부르는 값이 없다 */
        if (j.meta?.is_end !== false) break;
      } catch (e) { console.warn(`[places] 카카오 ${이름} ${쪽}쪽 못 부름 — ${why(e)}`); break; }
    }
    if (갈래성공) 성공++; else 실패++;
  }
  if (!성공) return { st: 'down' };
  return { st: 'ok', places: out, partial: 실패 > 0 };
}

/* OSM 은 Overpass 로 묻는다. 느리니 한 번만, 반경도 좁게. null 은 '못 물어봤다'. */
async function fromOsm(lat: number, lng: number, radius: number, 변종: 둘레변종): Promise<Place[] | null> {
  /* 홈은 주차장까지 묻고 갯수 상한도 넉넉히 둔다 — 카카오가 막힌 날에도 칩이 비지 않게.
     ⚠ 문화시설(CT1)에 맞는 OSM 태그는 여기 없다 — 폴백일 때 홈 갈래 칩은 넷으로 줄어든다.
     Overpass 는 쪽 넘기기가 없어 한 번에 받는 수로만 조절한다. */
  const 홈인가 = 변종 === '홈';
  /* bar·pub 은 예전부터 있었지만 `lib/장소갈래.ts` 가 음식점으로 모으고 있었다 —
     2026-08-20 부터 술집 갈래로 간다. 질의는 그대로 두고 나누는 자리만 바뀐 것이다. */
  const 편의 = 홈인가 ? 'restaurant|cafe|bar|pub|fast_food|parking' : 'restaurant|cafe|bar|pub|fast_food';
  const 상한 = 홈인가 ? 200 : 20;
  const q = `[out:json][timeout:8];(
    node["amenity"~"${편의}"](around:${radius},${lat},${lng});
    node["leisure"~"park"](around:${radius},${lat},${lng});
  );out body ${상한};`;
  /* Overpass 는 서버마다 막히는 데가 다르다 — 본진(overpass-api.de)이 이 회선에서
     21초 타임아웃이라 폴백이 늘 빈손이었다. 살아 있는 곳을 차례로 두드린다.
     User-Agent 도 필수다(없으면 406). */
  let r: Response | null = null;
  const 마감 = Date.now() + T_OVERPASS_전체;
  for (const base of OVERPASS) {
    /* 아까 답이 없던 거울은 쉬는 중 — 다시 9초를 걸어 볼 값이 아니다 */
    if ((쉬는거울.get(base) ?? 0) > Date.now()) {
      console.warn(`[places] overpass ${host(base)} 는 쉬는 중 — 건너뛴다`); continue;
    }
    /* 남은 시간이 한 숨도 안 되면 다음 거울을 두드려 봐야 헛수고다 */
    const 남은 = 마감 - Date.now();
    if (남은 < 1_000) { console.warn('[places] overpass 시간이 다 됐다 — 남은 거울은 건너뛴다'); break; }
    const 준시간 = Math.min(T_OVERPASS, 남은);
    try {
      const t = await fetch(base, {
        method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'moimer/0.1 (contact: whoami611319@gmail.com)',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(준시간),
      });
      if (t.ok) { 쉬는거울.delete(base); r = t; break; }   /* 되살아났으면 바로 다시 끼운다 */
      쉬는거울.set(base, Date.now() + 거울쉼);
      console.warn(`[places] overpass ${host(base)} 응답 ${t.status}`);
    } catch (e) {
      /* 제 시간을 다 주고도 안 온 거울과, 우리 예산이 모자라 끊은 거울을 갈라 벌한다 */
      쉬는거울.set(base, Date.now() + (준시간 >= T_OVERPASS ? 거울쉼 : 거울짧은쉼));
      console.warn(`[places] overpass ${host(base)} 못 부름 — ${why(e)}`);
    }
  }
  if (!r) return null;
  try {
    return ((await r.json()).elements ?? [])
      .filter((e: any) => e.tags?.name)
      .map((e: any) => ({
        id: `osm:${e.id}`, name: e.tags.name,
        address: [e.tags['addr:street'], e.tags['addr:housenumber']].filter(Boolean).join(' '),
        lat: e.lat, lng: e.lon, category: e.tags.amenity ?? e.tags.leisure,
      }));
  } catch (e) { console.warn(`[places] overpass 응답을 못 읽었다 — ${why(e)}`); return null; }
}

export async function placesNear(
  lat: number, lng: number, radius: number, 변종: 둘레변종 = '기본',
): Promise<PlaceList | 'quota'> {
  const { gx, gy, r } = key(lat, lng, radius, 변종);
  /* 저장해 두는 것은 온전한 목록뿐이다(아래) — 꺼낸 것에 partial 을 달 일이 없다 */
  const 저장된 = await 캐시읽기(gx, gy, r);
  if (저장된) return 목록(저장된, false);

  const k = await fromKakao(lat, lng, radius, 변종);
  /* 한도 초과는 저장하지 않는다 — 자정에 한도가 풀려도 몇 시간을 막힌 채로 굳는다 */
  if (k.st === 'quota') return 'quota';
  if (k.st === 'ok' && k.places.length) {
    const ps = dedupe(k.places);
    /* 몇 갈래를 못 물어본 목록도 저장하지 않는다 — 반쪽짜리가 몇 시간 굳으면 있는 가게가 없어진다 */
    if (!k.partial) await 캐시쓰기(gx, gy, r, ps);
    return 목록(ps, k.partial);
  }

  const o = await fromOsm(lat, lng, radius, 변종);
  if (o?.length) {
    const ps = dedupe(o);
    const 반쪽 = k.st === 'ok' && k.partial;
    if (!반쪽) await 캐시쓰기(gx, gy, r, ps);
    return 목록(ps, 반쪽);
  }

  /* 여기서부터는 빈손이다. 못 물어본 곳이 하나라도 있으면 '없다'고 말할 자격이 없다 —
     둘 다 답을 주고서 빈손일 때만 정말 없는 자리다. */
  const 카카오못물음 = k.st === 'down' || (k.st === 'ok' && k.partial);
  const osm못물음 = !o;
  if (카카오못물음 || osm못물음) {
    /* 못 불러온 것은 저장하지 않는다 — 저장하면 바깥의 장애가
       "여기엔 등록된 지점이 없어요" 로 몇 시간 굳는다. 대신 거울을 쉬게 해 기다림을 줄인다(fromOsm). */
    throw new PlacesUnavailable(카카오못물음 && osm못물음 ? 'all' : osm못물음 ? 'osm' : 'kakao');
  }
  await 캐시쓰기(gx, gy, r, []);   /* 정말 없는 자리 — 짧게만 둔다(빈손유통기한) */
  return 목록([], false);
}

/* 같은 이름이 여러 분류로 두 번 오는 일이 있다 */
const dedupe = (ps: Place[]) => {
  const seen = new Set<string>();
  return ps.filter((p) => !seen.has(p.name) && seen.add(p.name));
};

/** 검색을 한 자리 둘레로 좁힌다 — 지점 고르기(확정된 지역 안에서 찾기)가 쓴다.
    안 주면(출발지 찾기처럼) 예전처럼 전국을 본다 — 골라 쓰는 것이지 늘 켜는 것이 아니다. */
export type SearchNear = { lat: number; lng: number; radius: number };

/* 이름으로 찾기 (그릴링 논의35 ①) — 출발지 고르기용으로 만들었지만, near 를 주면
   지점 고르기에서 '확정된 지역 안에서만' 찾는 검색으로도 쓴다 (같은 함수 — 갈라 두면
   한쪽만 고치고 잊는다).
   카카오 키워드가 역·건물을 잘 찾는다. 막히면 Nominatim 으로 내려간다. */
export async function searchPlaces(q: string, near?: SearchNear): Promise<PlaceList | 'quota'> {
  const k = process.env.KAKAO_REST_API_KEY;
  let 카카오못물음 = false;
  if (k) {
    try {
      /* 카카오 키워드 검색의 x·y·radius 는 그 반경 안으로 결과를 실제로 좁힌다
         (검색 자체가 아니라 정렬만 바꾸는 값이 아니다) — near 가 있으면 붙인다. */
      const 좌표제한 = near ? `&x=${near.lng}&y=${near.lat}&radius=${Math.round(near.radius)}` : '';
      const r = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=8${좌표제한}`,
        { headers: { Authorization: `KakaoAK ${k}` }, cache: 'no-store', signal: AbortSignal.timeout(T_KAKAO) });
      if (r.status === 429) return 'quota';
      if (r.ok) {
        const ps = ((await r.json()).documents ?? []).map((d: any) => ({
          id: `kakao:${d.id}`, name: d.place_name,
          address: d.road_address_name || d.address_name || '',
          lat: Number(d.y), lng: Number(d.x), category: d.category_group_name,
        }));
        if (ps.length) return 목록(dedupe(ps), false);
      } else { 카카오못물음 = true; console.warn(`[places] 카카오 검색 응답 ${r.status}`); }
    } catch (e) { 카카오못물음 = true; console.warn(`[places] 카카오 검색 못 부름 — ${why(e)}`); }
  }

  /* null 은 '못 물어봤다', 빈 배열은 '물어봤는데 없다' — 아래에서 이 둘을 갈라 쓴다 */
  let ps: Place[] | null = null;
  try {
    /* Nominatim 은 반경이 아니라 네모난 viewbox 다 — 반경을 낀 네모로 감싼다.
       bounded=1 이 없으면 viewbox 는 그저 힌트일 뿐이라 전국이 다시 섞여 든다. */
    const 상자 = near ? (() => {
      const dLat = near.radius / 111_000;
      const dLng = near.radius / (111_000 * Math.cos((near.lat * Math.PI) / 180));
      return `&viewbox=${near.lng - dLng},${near.lat + dLat},${near.lng + dLng},${near.lat - dLat}&bounded=1`;
    })() : '';
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=8` +
      `&accept-language=ko&q=${encodeURIComponent(q)}${상자}`,
      {
        headers: { 'user-agent': 'moimer/0.1 (contact: whoami611319@gmail.com)' },
        cache: 'no-store', signal: AbortSignal.timeout(T_NOMINATIM),
      });
    if (r.ok) {
      ps = ((await r.json()) ?? []).map((d: any) => ({
        id: `osm:${d.osm_type}${d.osm_id}`,
        name: (d.name || d.display_name || '').split(',')[0],
        address: d.display_name ?? '', lat: Number(d.lat), lng: Number(d.lon),
      }));
    } else { console.warn(`[places] nominatim 검색 응답 ${r.status}`); }
  } catch (e) { console.warn(`[places] nominatim 검색 못 부름 — ${why(e)}`); }

  if (ps?.length) return 목록(dedupe(ps), 카카오못물음);
  if (!ps || 카카오못물음) {
    throw new PlacesUnavailable(!ps && 카카오못물음 ? 'all' : !ps ? 'osm' : 'kakao');
  }
  return 목록([], false);
}
