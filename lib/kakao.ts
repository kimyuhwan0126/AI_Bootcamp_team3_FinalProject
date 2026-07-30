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
  size = 5
): Promise<{ name: string; category: string; detail: string; distanceM: number; lat: number; lng: number; url: string }[] | null> {
  if (!env.kakaoRest) return null;
  try {
    const url =
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${encodeURIComponent(code)}` +
      `&x=${center.lng}&y=${center.lat}&radius=2000&sort=distance&size=${size}`;
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
export function kakaoAuthorizeUrl(): string {
  const p = new URLSearchParams({
    client_id: env.kakaoRest,
    redirect_uri: env.kakaoRedirect,
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

export async function kakaoExchange(code: string): Promise<KakaoExchangeResult> {
  if (!env.kakaoRest) return { ok: false, step: "token", detail: "KAKAO_REST_API_KEY 미설정" };
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.kakaoRest,
      redirect_uri: env.kakaoRedirect,
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
