-- ─────────────────────────────────────────────────────────────
-- 001_api_cache.sql — 외부 API 응답 캐시 (지오코딩 · 이동시간)
--
--  왜 필요한가
--    지금 캐시는 `lib/routing.ts` 의 메모리 Map 뿐이라 **서버를 재시작하면 전부 사라진다.**
--    실측(2026-08-05): 캐시가 빈 상태의 첫 조회는 2,597ms(외부 14콜), 재조회는 190ms.
--    즉 재시작할 때마다 유료 호출을 처음부터 다시 한다.
--
--  계층
--    L1 메모리(routing.ts) → L2 이 테이블 → L3 외부 API
--    L2 히트면 외부 호출이 0 이다. 재시작해도 L2 가 남아 비용이 안 든다.
--
--  ⚠️ 만료(expires_at)는 선택이 아니라 필수다. 두 가지 이유:
--     ① ODsay 이용약관 4.5.10 은 "사전 동의 없이 결과 데이터를 복제·**저장**"을 금한다.
--        무기한 축적은 명백한 "저장"이지만, 만료되는 임시 캐시는 성격이 다르다.
--        영구 보관이 필요하면 ODsay 에 사전 동의를 받고 TTL 을 늘린다.
--     ② 대중교통 소요시간은 시간대·요일에 따라 달라진다. 낡은 값이 계속 나오면 안 된다.
--
--  ⚠️ 개인정보를 담지 않는다. 여기 들어가는 것은 "강남역 → 좌표", "좌표쌍 → 분" 같은
--     공개 지리 정보뿐이다. 참가자의 실제 출발지는 `participants` 에 이미 있고
--     모임 삭제 시 함께 지워진다(on delete cascade). 그 경로를 우회하지 않는다.
-- ─────────────────────────────────────────────────────────────

-- 지오코딩: 검색어 → 좌표. 좌표는 거의 변하지 않아 TTL 이 길다.
create table if not exists geo_cache (
  q          text primary key,                       -- 공백 제거한 검색어
  lat        double precision not null,
  lng        double precision not null,
  hits       int         not null default 0,         -- 재사용 횟수 (효과 측정용)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_geo_cache_expires on geo_cache(expires_at);

-- 이동시간: 좌표쌍 + 수단 → 분. 시간대 영향이 있어 TTL 이 짧다.
create table if not exists route_cache (
  k          text primary key,                       -- "lat,lng|lat,lng|transport" (소수점 4자리)
  minutes    int         not null,
  hits       int         not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_route_cache_expires on route_cache(expires_at);
