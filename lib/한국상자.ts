/* 받아 주는 자리는 한국이다 — 그 상자 하나.

   이 파일에는 **바깥으로 나가는 것도, DB 도 없다.** 그래야 브라우저가 불러 쓸 수 있다.
   `lib/geo.ts` 는 맨 위에서 곧바로 `neon(process.env.DATABASE_URL!)` 로 클라이언트를 만든다 —
   화면이 거기서 `한국안` 하나를 꺼내 쓰려 해도 그 줄이 먼저 돌아 못 쓴다. 그래서
   `app/탐색/탐색.tsx:22–26` 은 같은 상자를 **손으로 한 번 더 적어** 두고 있었다
   ("옮기자는 이야기는 보고에 적었다" — 그 빚을 여기서 갚는다).

   이제 상자는 여기 하나뿐이다. `lib/geo.ts` 도 이것을 다시 내보내므로
   `app/api/geo` · `app/api/places` · `app/api/home-ai` 는 부르는 자리를 안 바꿔도 된다.

   제주·울릉·독도가 들어오는 상자다.
   NaN 도 이 비교에서 함께 걸린다: 파라미터가 빠져 `Number(null)` 이 0 이 되면
   (0,0) 대서양으로 진짜 호출이 나갔다. */

export const 위도 = [33, 38.7] as const;
export const 경도 = [124.5, 132] as const;

export const 한국안 = (lat: number, lng: number) =>
  lat >= 위도[0] && lat <= 위도[1] && lng >= 경도[0] && lng <= 경도[1];
