// ─────────────────────────────────────────────────────────────
// kakao.ts — 카카오 로그인(OAuth) + 로컬(주소/키워드 → 좌표)
// 모든 호출은 서버에서만. 키 없으면 null 반환 → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";

export interface Coord { lat: number; lng: number; }

// ── 지오코딩: 키워드 우선, 실패 시 주소 검색 ──
export async function geocodeKakao(query: string): Promise<Coord | null> {
  if (!env.kakaoRest) return null;
  const headers = { Authorization: `KakaoAK ${env.kakaoRest}` };
  try {
    // 1) 키워드(장소명/역명) 검색
    const kw = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
      { headers }
    );
    if (kw.ok) {
      const d = await kw.json();
      const doc = d.documents?.[0];
      if (doc) return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
    // 2) 주소 검색 폴백
    const ad = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=1`,
      { headers }
    );
    if (ad.ok) {
      const d = await ad.json();
      const doc = d.documents?.[0];
      if (doc) return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
  } catch {
    /* 네트워크/파싱 오류 → null → mock 폴백 */
  }
  return null;
}

// ── 역지오코딩: 좌표 → 사람이 알아볼 지명 ──
//  수도권 밖(안동·대구 등) 참가자를 위한 좌표 기반 중간지점 후보에 실제
//  동/읍/면 이름을 붙일 때 쓴다. 실패하면 null → 상위에서 "중간지점 N" 같은
//  좌표 기반 이름으로 폴백한다.
export async function coord2AddressKakao(c: Coord): Promise<string | null> {
  if (!env.kakaoRest) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${c.lng}&y=${c.lat}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } });
    if (!r.ok) return null;
    const d = await r.json();
    const doc = d.documents?.[0];
    const a = doc?.road_address ?? doc?.address;
    if (!a) return null;
    // "시/군/구" + "동/읍/면" 정도로 — region_1(도)까지 붙이면 너무 길다
    const name = [a.region_2depth_name, a.region_3depth_name].filter(Boolean).join(" ");
    return name || a.region_1depth_name || null;
  } catch {
    return null;
  }
}

/**
 * 좌표 → **행정동** 스냅 (v19 §4-⑥ · v4 확정).
 *
 * 지도에 찍은 핑은 좌표 그대로가 아니라 **동 단위로 스냅**돼야 한다.
 * 그래야 "같은 동은 하나로 병합"(v4)이 성립한다 — 3m 옆에 찍은 두 핑이
 * 서로 다른 후보가 되면 투표가 갈라진다.
 *
 * `coord2regioncode` 는 법정동(`B`)과 행정동(`H`)을 함께 준다. 우리는 **행정동(H)**
 * 을 쓴다 — 사람들이 말하는 "연남동·성수동"이 행정동 쪽에 가깝다.
 *
 * ⚠️ 실패하면 `null` 이고, **호출부가 좌표 기반 이름으로 폴백**한다 (v4).
 *    키가 없어도 전체 플로우가 돌아야 한다 (CLAUDE.md §3-4).
 */
export async function coord2RegionKakao(
  c: Coord
): Promise<{ name: string; lat: number; lng: number } | null> {
  if (!env.kakaoRest) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${c.lng}&y=${c.lat}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } });
    if (!r.ok) return null;
    const d = await r.json();
    const docs = (d.documents ?? []) as {
      region_type?: string;
      region_2depth_name?: string;
      region_3depth_name?: string;
      x?: number;
      y?: number;
    }[];
    // 행정동(H) 우선, 없으면 법정동(B)
    const doc = docs.find((x) => x.region_type === "H") ?? docs[0];
    if (!doc) return null;
    const name = [doc.region_2depth_name, doc.region_3depth_name].filter(Boolean).join(" ");
    if (!name) return null;
    // ⚠️ 좌표는 **동 중심**(카카오가 주는 x/y)을 쓴다. 찍은 자리를 그대로 두면
    //    같은 동인데 후보 위치가 사람마다 달라 지도에서 핀이 흩어진다.
    return {
      name,
      lat: Number.isFinite(doc.y) ? Number(doc.y) : c.lat,
      lng: Number.isFinite(doc.x) ? Number(doc.x) : c.lng,
    };
  } catch {
    return null;
  }
}

// ── (선택) 지역 인근 가게 검색 — 2차 추천장소 실데이터용 ──
// 카카오 category_name 은 "음식점 > 카페 > 커피전문점 > 파스쿠찌" 처럼
// 마지막 칸이 브랜드명인 경우가 많다. 마지막을 그대로 쓰면 상호가 카테고리로
// 표시되므로(=이름과 중복), 2번째 칸(실제 업종)을 우선 사용한다.
export function displayCategory(categoryName: string): string {
  const parts = (categoryName || "").split(">").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "가게";
  return parts[1] || parts[0];
}

export async function searchPlacesKakao(
  keyword: string,
  center: Coord,
  size = 5
): Promise<{ name: string; category: string; path: string; distanceM: number; lat: number; lng: number; url: string }[] | null> {
  if (!env.kakaoRest) return null;
  try {
    const url =
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}` +
      `&x=${center.lng}&y=${center.lat}&radius=1500&sort=distance&size=${size}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.documents || []).map((doc: Record<string, string>) => ({
      name: doc.place_name,
      category: displayCategory(doc.category_name),
      // 아이콘 판정은 전체 경로로 해야 정확하다 ("음식점 > 카페 > …" → 카페)
      path: doc.category_name || "",
      distanceM: Number(doc.distance) || 0,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      url: doc.place_url || "",
    }));
  } catch {
    return null;
  }
}

// ── 카테고리 그룹 코드 검색 — 주차장(PK6)/지하철역(SW8)처럼 코드가 있는 대상은
//    키워드보다 정확하다. detail 에는 카카오 분류 경로의 마지막 두 칸을 담아
//    "수도권2호선" 같은 노선 정보를 화면에 노출한다.
export async function searchByCategoryKakao(
  code: string,
  center: Coord,
  size = 5,
  /**
   * 검색 반경(m). 기본 2,000 은 "거점 주변 정보" 용도의 값이라 그대로 뒀다 —
   * `/api/places` 의 정류장·역 탭이 이 기본값에 기대고 있다.
   *
   * ⚠️ 중간지점 후보를 찾을 땐 참가자 퍼짐에 맞춰 넓혀야 한다. 2km 고정으로는
   *    8인이 의정부~수원에 흩어진 경우(퍼짐 29.6km) 중심 주변만 훑는다.
   *    계산은 `lib/hub-pool.ts` 의 `adaptiveRadiusM` 이 한다.
   * ⚠️ 카카오 상한은 **20,000m**. 넘겨 보내면 400 이 온다.
   */
  radius = 2_000
): Promise<{ name: string; category: string; detail: string; distanceM: number; lat: number; lng: number; url: string }[] | null> {
  if (!env.kakaoRest) return null;
  try {
    const safeRadius = Math.min(20_000, Math.max(0, Math.round(radius)));
    const url =
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${encodeURIComponent(code)}` +
      `&x=${center.lng}&y=${center.lat}&radius=${safeRadius}&sort=distance&size=${size}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.documents || []).map((doc: Record<string, string>) => {
      const parts = (doc.category_name || "").split(">").map((s) => s.trim()).filter(Boolean);
      return {
        name: doc.place_name,
        category: parts[parts.length - 1] || "",
        detail: parts.slice(-2).join(" · "),
        distanceM: Number(doc.distance) || 0,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        url: doc.place_url || "",
      };
    });
  } catch {
    return null;
  }
}

// ── OAuth: 인가 URL ──
/**
 * 이 요청을 보낸 주소 기준의 Redirect URI.
 *
 * ⚠️ **발표 시연(LAN)에서 이게 핵심이다.** 팀원 휴대폰은 `http://10.x.x.x:3000` 으로
 *    들어온다. 그런데 redirect_uri 를 `.env.local` 의 `http://localhost:3000/...` 로
 *    고정해 보내면, 카카오는 로그인 뒤 **그 휴대폰의 localhost** 로 돌려보낸다 —
 *    폰 자기 자신이라 아무것도 없다. 로그인이 "안 되는" 실제 이유가 이것이다.
 *    (2026-08-10 팀원 폰에서 실측)
 *
 * 그래서 들어온 주소(Host)를 그대로 써서, 폰에서 시작한 로그인은 폰이 보고 있던
 * 그 주소로 돌아오게 한다. 인가·토큰교환 **양쪽에 같은 값**을 써야 한다(카카오 요구).
 *
 * 물론 그 주소가 카카오 콘솔의 Redirect URI 목록에 **등록돼 있어야** 한다.
 * 등록 안 된 주소면 KOE006 이 뜨는데, 그건 `/api/auth/kakao?debug=1` 이 알려준다.
 */
export function redirectUriFor(origin?: string): string {
  if (!origin) return env.kakaoRedirect;
  return `${origin.replace(/\/$/, "")}/api/auth/kakao/callback`;
}

/**
 * 브라우저가 **실제로 친 주소**. `new URL(req.url).origin` 을 쓰면 안 된다 —
 * Next 가 호스트를 정규화해서 `127.0.0.1:3100` 으로 들어온 요청이
 * `localhost:3100` 으로 나온다(테스트에서 잡힘). 카카오 Redirect URI 는
 * **글자 단위로** 일치해야 하므로 Host 헤더를 그대로 쓴다.
 */
export function originOfRequest(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export function kakaoAuthorizeUrl(origin?: string): string {
  const p = new URLSearchParams({
    client_id: env.kakaoRest,
    redirect_uri: redirectUriFor(origin),
    response_type: "code",
    scope: "profile_nickname",
  });
  return `https://kauth.kakao.com/oauth/authorize?${p.toString()}`;
}

// ── OAuth: code → 토큰 → 사용자 정보(닉네임) ──
// 실패 시 원인을 그대로 돌려준다. 예전엔 null만 반환해 화면에 "로그인 실패"만
// 뜨고 무엇이 잘못됐는지 알 수 없었다.
export type KakaoExchangeResult =
  | { ok: true; id: string; nickname: string }
  | { ok: false; step: "token" | "user" | "network"; detail: string };

export async function kakaoExchange(code: string, origin?: string): Promise<KakaoExchangeResult> {
  if (!env.kakaoRest) return { ok: false, step: "token", detail: "KAKAO_REST_API_KEY 미설정" };
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.kakaoRest,
      // ⚠️ 인가 때 보낸 값과 **글자 그대로 같아야** 한다. 여기만 env 로 두면
      //    폰(LAN IP)에서 시작한 로그인이 토큰 교환에서 KOE320 으로 떨어진다.
      redirect_uri: redirectUriFor(origin),
      code,
    });
    const tk = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    const tokText = await tk.text();
    if (!tk.ok) {
      // 카카오는 error/error_description 으로 사유를 알려준다
      let detail = tokText.slice(0, 200);
      try {
        const e = JSON.parse(tokText);
        detail = `${e.error ?? tk.status}: ${e.error_description ?? ""}`.trim();
      } catch {
        /* 원문 유지 */
      }
      return { ok: false, step: "token", detail };
    }
    const tok = JSON.parse(tokText);

    const me = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const meText = await me.text();
    if (!me.ok) return { ok: false, step: "user", detail: `${me.status}: ${meText.slice(0, 200)}` };

    const u = JSON.parse(meText);
    const nickname =
      u?.properties?.nickname || u?.kakao_account?.profile?.nickname || "카카오사용자";
    return { ok: true, id: String(u.id), nickname };
  } catch (e) {
    return { ok: false, step: "network", detail: e instanceof Error ? e.message : String(e) };
  }
}
