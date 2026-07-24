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

// ── (선택) 지역 인근 가게 검색 — 2차 추천장소 실데이터용 ──
export async function searchPlacesKakao(
  keyword: string,
  center: Coord,
  size = 5
): Promise<{ name: string; category: string; distanceM: number; lat: number; lng: number; url: string }[] | null> {
  if (!env.kakaoRest) return null;
  try {
    const url =
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}` +
      `&x=${center.lng}&y=${center.lat}&radius=1500&sort=distance&size=${size}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.documents || []).map((doc: any) => ({
      name: doc.place_name,
      category: (doc.category_name || "").split(">").pop()?.trim() || "가게",
      distanceM: Number(doc.distance) || 0,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      url: doc.place_url || "",
    }));
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
export async function kakaoExchange(code: string): Promise<{ id: string; nickname: string } | null> {
  if (!env.kakaoRest) return null;
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
    if (!tk.ok) return null;
    const tok = await tk.json();
    const me = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!me.ok) return null;
    const u = await me.json();
    const nickname =
      u?.properties?.nickname || u?.kakao_account?.profile?.nickname || "카카오사용자";
    return { id: String(u.id), nickname };
  } catch {
    return null;
  }
}
