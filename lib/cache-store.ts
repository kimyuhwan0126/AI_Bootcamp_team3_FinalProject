// ─────────────────────────────────────────────────────────────
// cache-store.ts — 외부 API 응답의 영속 캐시 (L2)
//
//  `lib/routing.ts` 의 메모리 Map(L1) 은 서버를 재시작하면 사라진다. 그러면
//  유료 호출을 처음부터 다시 하게 되므로(실측: 재시작 직후 첫 조회 2,597ms /
//  외부 14콜), 그 아래에 DB 계층을 하나 둔다.
//
//    L1 메모리 → L2 여기 → L3 외부 API
//
//  설계 원칙
//   1. **실패해도 조용히 넘어간다.** 캐시는 있으면 좋은 것이지 필수가 아니다.
//      DB 가 없거나(팀원 로컬) 쿼리가 실패해도 상위는 그냥 API 를 부르면 된다.
//      그래서 모든 함수가 throw 하지 않는다.
//   2. **만료값은 없는 것과 같다.** 읽을 때 expires_at 을 조건에 넣는다.
//   3. **실 API 성공값만 넣는다.** 폴백(haversine 추정)을 저장하면 나중에
//      키를 넣어도 계속 추정값이 나온다 — 호출부가 지키고, 여기서도 가정한다.
//
//  ⚠️ 개인정보를 담지 않는다. "강남역 → 좌표", "좌표쌍 → 분" 같은 공개 지리
//     정보뿐이다. 참가자의 실제 출발지는 `participants` 가 갖고 모임과 함께 지워진다.
//  ⚠️ TTL 은 선택이 아니다 — db/migrations/001_api_cache.sql 의 설명 참고.
// ─────────────────────────────────────────────────────────────
import { db } from "./db";

/** 지오코딩 TTL — 역·건물 좌표는 거의 변하지 않는다. */
const GEO_TTL_DAYS = 30;
/**
 * 이동시간 TTL — 대중교통 소요시간은 시간대·요일에 따라 달라진다.
 * 6시간이면 한 번의 모임 계획 과정(수 분~수 시간)은 캐시가 받쳐 주면서
 * 아침 값이 저녁에 나오는 일은 막는다.
 */
const ROUTE_TTL_HOURS = 6;

export interface CachedCoord {
  lat: number;
  lng: number;
}

// ── 지오코딩 ──────────────────────────────────────────────────

export async function geoCacheGet(q: string): Promise<CachedCoord | null> {
  if (!db) return null;
  try {
    const rows = (await db`
      select lat, lng from geo_cache
      where q = ${q} and expires_at > now()
      limit 1`) as unknown as { lat: number; lng: number }[];
    const hit = rows[0];
    if (!hit) return null;
    // 재사용 횟수는 효과 측정용이라 실패해도 무시한다(await 하지 않는다).
    void db`update geo_cache set hits = hits + 1 where q = ${q}`.catch(() => {});
    return { lat: hit.lat, lng: hit.lng };
  } catch {
    return null;
  }
}

export async function geoCacheSet(q: string, c: CachedCoord): Promise<void> {
  if (!db) return;
  try {
    await db`
      insert into geo_cache (q, lat, lng, expires_at)
      values (${q}, ${c.lat}, ${c.lng}, now() + ${`${GEO_TTL_DAYS} days`}::interval)
      on conflict (q) do update set
        lat = excluded.lat,
        lng = excluded.lng,
        created_at = now(),
        expires_at = excluded.expires_at`;
  } catch {
    // 캐시 저장 실패는 기능에 영향이 없다 — 다음에 API 를 한 번 더 부를 뿐이다.
  }
}

// ── 이동시간 ──────────────────────────────────────────────────

export async function routeCacheGet(k: string): Promise<number | null> {
  if (!db) return null;
  try {
    const rows = (await db`
      select minutes from route_cache
      where k = ${k} and expires_at > now()
      limit 1`) as unknown as { minutes: number }[];
    const hit = rows[0];
    if (!hit) return null;
    void db`update route_cache set hits = hits + 1 where k = ${k}`.catch(() => {});
    return hit.minutes;
  } catch {
    return null;
  }
}

export async function routeCacheSet(k: string, minutes: number): Promise<void> {
  if (!db) return;
  try {
    await db`
      insert into route_cache (k, minutes, expires_at)
      values (${k}, ${minutes}, now() + ${`${ROUTE_TTL_HOURS} hours`}::interval)
      on conflict (k) do update set
        minutes = excluded.minutes,
        created_at = now(),
        expires_at = excluded.expires_at`;
  } catch {
    // 위와 같다.
  }
}

// ── 정리 ──────────────────────────────────────────────────────

/**
 * 만료된 행을 지운다.
 *
 * 읽을 때 `expires_at > now()` 로 거르므로 안 지워도 결과는 정확하다.
 * 다만 두면 계속 쌓이므로 가끔 비운다 — 지금은 호출부가 없고,
 * 필요해지면 진단 라우트나 예약 작업에서 부르면 된다.
 */
export async function cachePrune(): Promise<{ geo: number; route: number } | null> {
  if (!db) return null;
  try {
    const g = (await db`delete from geo_cache where expires_at <= now() returning q`) as unknown as unknown[];
    const r = (await db`delete from route_cache where expires_at <= now() returning k`) as unknown as unknown[];
    return { geo: g.length, route: r.length };
  } catch {
    return null;
  }
}
