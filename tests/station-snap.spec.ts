// ─────────────────────────────────────────────────────────────
// 핑을 **지하철역으로 묶기** (멘토링 2026-08-06 §2 괄호 항목)
//   "핑 찍으면 시·군·구 단위로 자동 묶기 (또는 서울은 지하철역 기준)"
//
// 이 파일은 두 벌로 돈다:
//   · 플래그 꺼짐(기본)  → "역 스냅을 **하지 않는다**" 만 검사한다
//   · 플래그 켜짐        → 나머지 전부. `.github/workflows/ci.yml` 의
//                          flags-on 잡이 이 빌드를 만든다
//
// ⚠️ `NEXT_PUBLIC_FF_*` 는 **빌드 시점에 박힌다.** 테스트 안에서 켤 수 없으므로
//    지금 서버가 무엇을 켜고 빌드됐는지 `/api/status` 에 물어보고 갈라진다.
//
// ⚠️ CI 에는 카카오 키가 없다. 그래서 여기서 실제로 도는 것은 폴백 사슬의 ②번
//    칸(`lib/geo.ts` 의 거점 좌표표)이다. ①번(카카오 SW8 실제 역)은 키가 있는
//    기기에서만 도는데, **둘 다 같은 계약**을 지킨다 — 역/거점 이름이 나오고
//    후보 좌표가 그 지점으로 옮겨간다. 그래서 아래 단언이 양쪽에서 성립한다.
// ─────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext } from "@playwright/test";
import { normalizeStationName, SNAP_HUBS } from "@/lib/station-snap";

async function act(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 실패 (${res.status()}): ${body}`).toBeTruthy();
  return JSON.parse(body);
}

const get = async (request: APIRequestContext, code: string) =>
  (await request.get(`/api/meeting?code=${code}`)).json();

const status = async (request: APIRequestContext) => (await request.get("/api/status")).json();

/** 모임 하나 + 방장 출발지 */
async function setup(request: APIRequestContext) {
  const created = await act(request, {
    action: "create",
    name: "역 스냅 테스트",
    leaderName: "방장",
    scope: "place",
    purposeCategory: "food",
  });
  await act(request, {
    action: "origin",
    code: created.code,
    participantId: created.participantId,
    origin: "강남역",
    transport: "transit",
  });
  return { code: created.code as string, leaderId: created.participantId as string };
}

// 강남역 정확한 좌표 (lib/geo.ts HUBS) — 카카오 키가 있으면 SW8 이 같은 곳을 준다
const GANGNAM = { lat: 37.4979, lng: 127.0276 };

// ═══════════════════════════════════════════════════════════════
// 1. 순수 함수 — 키도 서버도 필요 없다
// ═══════════════════════════════════════════════════════════════

test("이름 정규화: 노선 꼬리를 떼야 같은 역이 하나로 묶인다", () => {
  // ⚠️ 이 함수가 없으면 기능이 **정반대로** 동작한다. 카카오 SW8 은 같은 역을
  //    노선마다 따로 주는데, 후보 병합은 이름 일치로 판정한다(store.ts).
  //    2호선 쪽을 찍은 사람과 신분당선 쪽을 찍은 사람이 다른 후보가 돼 표가 갈린다.
  expect(normalizeStationName("강남역 2호선")).toBe("강남역");
  expect(normalizeStationName("강남역 신분당선")).toBe("강남역");
  expect(normalizeStationName("신촌역 경의중앙선")).toBe("신촌역");
  expect(normalizeStationName("홍대입구역 공항철도")).toBe("홍대입구역");
  expect(normalizeStationName("총신대입구(이수)역 4호선")).toBe("총신대입구(이수)역");
  // 꼬리가 없으면 그대로 둔다
  expect(normalizeStationName("강남역")).toBe("강남역");
  // 역 이름 자체가 '선'으로 끝나도 통째로 지우지 않는다 (토큰이 하나면 유지)
  expect(normalizeStationName("선정릉역 수인분당선")).toBe("선정릉역");
  expect(normalizeStationName("")).toBe("");

  // ⚠️ 카카오 응답 형식을 저장소 안에서 확정할 수 없어(주석 두 개가 서로 다른
  //    그림을 그린다) **모르는 꼬리가 붙어도** 같은 답이 나와야 한다.
  //    형식이 예상과 달라도 병합이 깨지지 않게 하는 안전망이다.
  expect(normalizeStationName("강남역 2호선 3번출구")).toBe("강남역");
  expect(normalizeStationName("강남역 수도권 전철 어쩌고")).toBe("강남역");
  expect(normalizeStationName("동대문역사문화공원역 5호선")).toBe("동대문역사문화공원역");
  // 노선이 **앞에** 붙어 와도 같은 답이어야 한다 — 순서까지 가정하면
  // 형식이 예상과 다를 때 같은 역이 두 후보로 갈린다
  expect(normalizeStationName("2호선 강남역")).toBe("강남역");
  expect(normalizeStationName("신분당선 강남역")).toBe("강남역");
});

test("거점 좌표표: 지오코딩용 별칭이 후보로 새지 않는다", () => {
  // HUBS 아래쪽 별칭("대전"→대전역 …)은 좌표가 원본과 **완전히 같다**.
  // 좌표 중복으로 걷어내므로 같은 자리에 이름만 다른 후보가 두 개 생기지 않는다.
  const names = SNAP_HUBS.map((h) => h.name);
  expect(names).toContain("강남역");
  expect(names, "별칭 '강남'이 거점표에 남아 있다 — 같은 좌표가 두 번 들어간다").not.toContain("강남");
  expect(names).not.toContain("대전");
  const keys = SNAP_HUBS.map((h) => `${h.lat},${h.lng}`);
  expect(new Set(keys).size, "거점표에 같은 좌표가 두 번 있다").toBe(keys.length);
});

// ═══════════════════════════════════════════════════════════════
// 2. 플래그가 꺼져 있을 때 (= 기본 빌드) — 지금 동작이 안 바뀌었는가
// ═══════════════════════════════════════════════════════════════

test("플래그가 꺼져 있으면 역으로 묶지 않는다", async ({ request }) => {
  const s = await status(request);
  test.skip(!!s.flags?.pingSnapStation, "이 빌드는 역 스냅이 켜져 있다");

  const { code, leaderId } = await setup(request);
  const r = await act(request, { action: "addRegion", code, participantId: leaderId, ...GANGNAM });
  // 키가 없으면 좌표 이름, 있으면 시·군·구 이름 — 어느 쪽이든 **역 이름은 아니다**
  expect(r.candidate.name, "플래그가 꺼졌는데 역 이름이 나왔다").not.toBe("강남역");
});

// ═══════════════════════════════════════════════════════════════
// 3. 플래그가 켜져 있을 때
// ═══════════════════════════════════════════════════════════════

test("역 근처를 찍으면 후보가 그 역이 되고, 핀도 역 위로 옮겨간다", async ({ request }) => {
  const s = await status(request);
  test.skip(!s.flags?.pingSnapStation, "역 스냅이 꺼진 빌드");

  const { code, leaderId } = await setup(request);
  // 강남역에서 약 170m 떨어진 자리를 찍는다
  const r = await act(request, {
    action: "addRegion",
    code,
    participantId: leaderId,
    lat: GANGNAM.lat + 0.0011,
    lng: GANGNAM.lng + 0.0014,
  });
  expect(r.candidate.name, "역 이름으로 안 묶였다").toBe("강남역");
  // ⭐ 좌표까지 옮겨야 의미가 있다 — 2차 지점 검색(반경 700m)의 중심이 이 값이고,
  //    대중교통 경로의 목적지도 이 값이다. 찍은 자리에 그대로 두면 역세권이 아니다.
  expect(Math.abs(r.candidate.lat - GANGNAM.lat), "후보 좌표가 역으로 안 옮겨졌다").toBeLessThan(0.002);
  expect(Math.abs(r.candidate.lng - GANGNAM.lng)).toBeLessThan(0.002);
});

test("같은 역 근처를 둘이 찍으면 후보 하나로 합쳐진다 (표가 안 갈린다)", async ({ request }) => {
  const s = await status(request);
  test.skip(!s.flags?.pingSnapStation, "역 스냅이 꺼진 빌드");

  const { code, leaderId } = await setup(request);
  const mate = await act(request, { action: "join", code, name: "동행" });

  // 서로 400m 쯤 떨어진 두 자리 — 둘 다 강남역 반경 안이다
  await act(request, {
    action: "addRegion", code, participantId: leaderId,
    lat: GANGNAM.lat + 0.0015, lng: GANGNAM.lng + 0.0015,
  });
  await act(request, {
    action: "addRegion", code, participantId: mate.participantId,
    lat: GANGNAM.lat - 0.0016, lng: GANGNAM.lng - 0.0012,
  });

  const st = await get(request, code);
  expect(st.regions, "같은 역인데 후보가 둘로 갈렸다").toHaveLength(1);
  // 핑이 곧 표다(통합 모드) — 병합됐으면 그 후보에 두 사람이 다 들어 있어야 한다
  expect(st.regions[0].contributors).toHaveLength(2);
  expect(st.regions[0].name).toBe("강남역");
});

test("거점에서 먼 곳은 억지로 스냅하지 않는다", async ({ request }) => {
  const s = await status(request);
  test.skip(!s.flags?.pingSnapStation, "역 스냅이 꺼진 빌드");

  const { code, leaderId } = await setup(request);
  // 강원 산속 — 가장 가까운 거점(원주)이 60km 넘게 떨어져 있다
  const r = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.0, lng: 128.5,
  });
  expect(r.candidate.name, "60km 떨어진 거점으로 스냅했다 — 없는 역을 있다고 말한 셈이다")
    .not.toBe("원주");
  // 찍은 자리에서 크게 벗어나지도 않아야 한다
  expect(Math.abs(r.candidate.lat - 37.0), "핀이 딴 데로 날아갔다").toBeLessThan(0.5);
});
