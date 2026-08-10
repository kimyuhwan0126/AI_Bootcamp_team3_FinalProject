// ─────────────────────────────────────────────────────────────
// handoff.ts — 홈에서 본 것을 새 모임으로 넘긴다 (v19 §4-① · 2차 그릴링 `seedPings`)
//
// 왜 필요한가
//   홈은 "맛보기"다. 출발지 몇 개를 넣어 중간지점을 보고, 마음에 들면
//   [이 출발지들로 모임 만들기]를 누른다. 그런데 지금까지 그 버튼은 **생성 폼으로
//   이동만** 했다 — 방금 넣은 출발지도, 방금 본 중간지점도 전부 사라지고
//   모임에 들어가서 처음부터 다시 넣어야 했다. 홈과 모임이 따로 노는 앱이 된다.
//
// 무엇을 넘기나 / 안 넘기나
//   ✅ **첫 출발지** → 방장 출발지 (내가 넣은 것이니 다시 물을 이유가 없다)
//   ✅ **홈에서 본 중간지점** → 지역 후보 씨앗 1개 (그 화면에서 본 답이 모임에 남는다)
//   ❌ **나머지 출발지** — 남의 출발지를 방장이 대신 등록하는 셈이라 넘기지 않는다.
//      참여자가 들어와 자기 것을 직접 넣는다.
//
//   ⚠️ 2차 프로토타입은 "나머지 출발지를 지역 후보 씨앗으로" 쓴다. 그대로 옮기지
//      않은 이유: **출발지는 사람이 사는 곳이지 만날 곳이 아니다.** 홍대·잠실에서
//      출발하는 모임인데 후보가 '홍대'·'잠실'로 뜨면, 한 사람은 집 앞이고 다른
//      사람은 가로질러 가야 한다 — 이 앱이 없애려는 상황 그 자체다.
//      대신 **중간지점**을 씨앗으로 쓴다. 그건 실제로 만날 만한 자리다.
//
// 왜 sessionStorage 인가
//   이 값은 **한 번 쓰고 버리는 것**이다. localStorage 에 두면 다음 날 새 모임을
//   만들 때 옛 중간지점이 후보로 튀어나온다. 탭을 닫으면 같이 사라지는 게 맞다.
// ─────────────────────────────────────────────────────────────

const KEY = "moimer:handoff";

export interface Handoff {
  /** 방장 출발지로 쓸 것 (홈에서 넣은 첫 출발지) */
  origin?: { name: string; lat: number; lng: number; transport: "transit" | "car" };
  /** 지역 후보 씨앗 (홈에서 본 중간지점) */
  seed?: { name: string; lat: number; lng: number };
}

/** 숫자 좌표인지까지 확인한다 — 깨진 값이 모임 생성 흐름을 막으면 안 된다 */
function isCoord(v: unknown): v is { lat: number; lng: number } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.lat === "number" && Number.isFinite(o.lat)
      && typeof o.lng === "number" && Number.isFinite(o.lng);
}

export function saveHandoff(h: Handoff): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // 사파리 프라이빗 모드 등 — 인계가 안 될 뿐 생성은 그대로 된다
  }
}

/**
 * 읽고 **즉시 지운다**(한 번만 쓰인다).
 *
 * ⚠️ 읽기만 하고 안 지우면, 생성 폼을 열었다 닫고 다른 모임을 만들 때
 *    엉뚱한 중간지점이 후보로 들어간다.
 */
export function takeHandoff(): Handoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const o = parsed as Record<string, unknown>;

    const out: Handoff = {};
    if (isCoord(o.origin)) {
      const src = o.origin as Record<string, unknown>;
      out.origin = {
        name: typeof src.name === "string" ? src.name : "",
        lat: (o.origin as { lat: number }).lat,
        lng: (o.origin as { lng: number }).lng,
        transport: src.transport === "car" ? "car" : "transit",
      };
    }
    if (isCoord(o.seed)) {
      const src = o.seed as Record<string, unknown>;
      out.seed = {
        name: typeof src.name === "string" ? src.name : "",
        lat: (o.seed as { lat: number }).lat,
        lng: (o.seed as { lng: number }).lng,
      };
    }
    return out.origin || out.seed ? out : null;
  } catch {
    return null;
  }
}
