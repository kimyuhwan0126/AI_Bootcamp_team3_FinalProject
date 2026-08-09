// ─────────────────────────────────────────────────────────────
// v19 흐름 — 설계 확정판(docs/설계_v19.md)으로 바꾼 규칙이 실제로 걸리는지.
//
// 기존 smoke.spec 은 "핵심 경로가 그려지는가"를 본다. 이 파일은 그 위에서
// **v19 가 새로 못박은 규칙**만 골라 검사한다:
//
//   §3  확정 범위 분기 — '지역까지'는 지점 단계를 건너뛴다
//   §5  후보 게이트 0/1/2+ · 투표 시작 = 잠금 · 늦은 표 거부
//   §6  reopen 사다리 — 한 칸씩, 표는 유지
//   §4-⑧ 지점 반경 700m · 밖은 거부 · 확장 1회 · 삭제 권한
//
// 대부분 API 로 검사한다 — 규칙은 **서버가 최종 관문**이기 때문이다(v12).
// 화면이 규칙을 지키는지는 마지막 테스트에서 눈으로(=DOM) 본다.
//
// 외부 키 없이 돈다 (CLAUDE.md §3-4 — mock 폴백).
// ─────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

interface Ident { id: string; name: string; isLeader: boolean }

/** 성공을 기대하는 액션 */
async function act(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 실패 (${res.status()}): ${body}`).toBeTruthy();
  return JSON.parse(body);
}

/** **거부를 기대하는** 액션 — 서버가 막아야 하는 규칙을 검사할 때 쓴다 */
async function actFails(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 이 거부돼야 하는데 통과했다: ${body}`).toBeFalsy();
  return JSON.parse(body) as { error?: string };
}

const get = async (request: APIRequestContext, code: string) =>
  (await request.get(`/api/meeting?code=${code}`)).json();

async function loginAs(page: Page, code: string, list: Ident[], activeId: string) {
  await page.addInitScript(
    ([c, l, a]) => {
      localStorage.setItem(`moimer:${c}`, l as string);
      localStorage.setItem(`moimer:${c}:active`, a as string);
    },
    [code.toUpperCase(), JSON.stringify(list), activeId] as const
  );
}

/** 모임 하나를 만들고 방장 출발지까지 넣는다 */
async function setup(
  request: APIRequestContext,
  opts: { scope?: "region" | "place"; name?: string } = {}
) {
  const created = await act(request, {
    action: "create",
    name: opts.name ?? "v19 테스트",
    leaderName: "방장",
    scope: opts.scope ?? "place",
    purposeCategory: "food",
  });
  const code: string = created.code;
  const leaderId: string = created.participantId;
  await act(request, { action: "origin", code, participantId: leaderId, origin: "강남역", transport: "transit" });
  return { code, leaderId };
}

/** 지역 후보를 만들어 두고 첫 후보 id 를 준다 */
async function seedRegions(request: APIRequestContext, code: string) {
  const r = await act(request, { action: "regions", code });
  expect(r.regions?.length, "지역 후보가 하나도 안 나왔다").toBeGreaterThan(0);
  return r.regions as { id: string; name: string }[];
}

// ═══════════════════════════════════════════════════════════════
// §5 후보 게이트 · 투표 시작 = 잠금
// ═══════════════════════════════════════════════════════════════

test("§5 투표 시작 전에는 표를 거부한다 (늦은 표 방지의 반대편)", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);

  // 아직 등록 단계(main) — 투표는 열리지 않았다
  const fail = await actFails(request, {
    action: "vote", code, participantId: leaderId, target: "region", candidateId: regions[0].id,
  });
  expect(fail.error).toContain("단계가 바뀌었어요");

  // 투표 시작 후에는 받는다
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, {
    action: "vote", code, participantId: leaderId, target: "region", candidateId: regions[0].id,
  });
  const st = await get(request, code);
  expect(st.regionVotes[leaderId]).toBe(regions[0].id);
});

test("§5 투표가 시작되면 후보가 잠긴다 — 늦은 핑은 거부", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });

  const fail = await actFails(request, {
    action: "addRegion", code, participantId: leaderId,
    name: "늦은동", lat: 37.5, lng: 127.0,
  });
  expect(fail.error).toContain("단계가 바뀌었어요");
});

test("§5 지점 후보 0개면 투표 시작이 막힌다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  // v19: 지역 확정 직후 지점 후보는 비어 있다
  const st = await get(request, code);
  expect(st.places?.length ?? 0, "지점 후보가 미리 채워졌다").toBe(0);

  const fail = await actFails(request, { action: "startVote", code, participantId: leaderId });
  expect(fail.error).toContain("후보가 없어요");
});

// ═══════════════════════════════════════════════════════════════
// §3 확정 범위 분기 — '지역까지'
// ═══════════════════════════════════════════════════════════════

test("§3 '지역까지' 모임은 지점 단계를 건너뛰고 결과로 간다", async ({ request }) => {
  const { code, leaderId } = await setup(request, { scope: "region", name: "지역까지 모임" });
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const st = await get(request, code);
  expect(st.scope).toBe("region");
  expect(st.stage, "'지역까지'는 지점 단계 없이 바로 result 여야 한다").toBe("result");
  expect(st.aiPhase).toBe("done");
  expect(st.places?.length ?? 0, "'지역까지' 모임에 지점 후보가 생겼다").toBe(0);
  expect(st.winnerRegion?.id).toBe(regions[0].id);
});

test("§3 '지점도 정하기' 승격은 방장만 · 역방향 없음", async ({ request }) => {
  const { code, leaderId } = await setup(request, { scope: "region" });
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const joined = await act(request, { action: "join", code, name: "참가자2" });
  const memberId: string = joined.participantId;

  // 참가자는 못 한다
  const denied = await actFails(request, { action: "promoteToPlace", code, participantId: memberId });
  expect(denied.error).toContain("방장만");

  // 방장은 된다 → 지점 등록 단계로
  await act(request, { action: "promoteToPlace", code, participantId: leaderId });
  const st = await get(request, code);
  expect(st.scope).toBe("place");
  expect(st.stage).toBe("chat");
  expect(st.aiPhase).toBe("place");
  expect(st.placeVoteOpen, "승격 직후엔 등록 단계여야 한다").toBe(false);

  // 이미 '지점까지'면 다시 승격할 수 없다 (역방향 없음)
  const again = await actFails(request, { action: "promoteToPlace", code, participantId: leaderId });
  expect(again.error).toContain("이미");
});

// ═══════════════════════════════════════════════════════════════
// §4-⑧ 지점 반경 · 등록 · 삭제 권한
// ═══════════════════════════════════════════════════════════════

test("§4-⑧ 반경 700m 밖은 거부 · 확장은 1회", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const st0 = await get(request, code);
  expect(st0.radiusM).toBe(700);
  const center = st0.winnerRegion;

  // 중심에서 약 3km 떨어진 좌표 (위도 1도 ≈ 111km)
  const far = { lat: center.lat + 0.027, lng: center.lng };
  const rejected = await actFails(request, {
    action: "addPlace", code, participantId: leaderId,
    name: "너무먼집", category: "음식점", lat: far.lat, lng: far.lng,
  });
  expect(rejected.error).toContain("제한");

  // 확장 1회 → 1400
  const ex = await act(request, { action: "expandRadius", code, participantId: leaderId });
  expect(ex.radiusM).toBe(1400);
  // 두 번째는 거부
  const ex2 = await actFails(request, { action: "expandRadius", code, participantId: leaderId });
  expect(ex2.error).toContain("최대");
});

test("§4-⑧ 지점 후보 삭제는 방장·본인만", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const joined = await act(request, { action: "join", code, name: "참가자2" });
  const memberId: string = joined.participantId;

  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  expect(poi.items?.length, "미리보기 POI 가 비었다").toBeGreaterThan(0);

  // 방장이 등록한 후보를 참가자가 지우려 하면 거부
  const p = poi.items[0];
  const added = await act(request, {
    action: "addPlace", code, participantId: leaderId,
    name: p.name, category: p.category, lat: p.lat, lng: p.lng,
  });
  const denied = await actFails(request, {
    action: "removePlace", code, participantId: memberId, placeId: added.candidate.id,
  });
  expect(denied.error).toContain("내가 등록한");

  // 방장 본인은 지운다
  await act(request, { action: "removePlace", code, participantId: leaderId, placeId: added.candidate.id });
  const st = await get(request, code);
  expect(st.places.length).toBe(0);
});

// ═══════════════════════════════════════════════════════════════
// §6 reopen 사다리
// ═══════════════════════════════════════════════════════════════

test("§6 되돌리기는 한 칸씩 내려가고 표는 유지된다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, {
    action: "vote", code, participantId: leaderId, target: "region", candidateId: regions[0].id,
  });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  // 지금: 지점 등록 단계
  expect((await get(request, code)).aiPhase).toBe("place");

  // 한 칸 ① 지점 등록 → 지역 투표 (경계 reopen)
  const s1 = await act(request, { action: "reopenStep", code, participantId: leaderId });
  expect(s1.step).toBe("region-vote");
  const a1 = await get(request, code);
  expect(a1.winnerRegion, "지역 확정이 풀려야 한다").toBeNull();
  expect(a1.regionVotes[leaderId], "지역 표는 유지돼야 한다").toBe(regions[0].id);

  // 한 칸 ② 지역 투표 → 지역 등록
  const s2 = await act(request, { action: "reopenStep", code, participantId: leaderId });
  expect(s2.step).toBe("region-register");
  expect((await get(request, code)).regionVotes[leaderId], "여기서도 표는 살아 있다").toBe(regions[0].id);

  // 더는 못 내려간다
  const s3 = await actFails(request, { action: "reopenStep", code, participantId: leaderId });
  expect(s3.error).toContain("더 되돌릴 단계가 없어요");
});

test("§6 경계 reopen 후 같은 동으로 재확정하면 지점 후보가 복원된다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  const p = poi.items[0];
  await act(request, {
    action: "addPlace", code, participantId: leaderId,
    name: p.name, category: p.category, lat: p.lat, lng: p.lng,
  });
  expect((await get(request, code)).places.length).toBe(1);

  // 지점 등록 → 지역 투표로 되돌린다 (지점 데이터가 보관된다)
  await act(request, { action: "reopenStep", code, participantId: leaderId });
  expect((await get(request, code)).places.length, "되돌리면 지점 후보는 화면에서 사라진다").toBe(0);

  // 같은 동으로 다시 확정 → 복원
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });
  const restored = await get(request, code);
  expect(restored.places.length, "같은 동으로 재확정했으면 지점 후보가 복원돼야 한다").toBe(1);
  expect(restored.places[0].name).toBe(p.name);
});

// ═══════════════════════════════════════════════════════════════
// 화면 — 규칙이 실제로 그려지는가
// ═══════════════════════════════════════════════════════════════

test("화면: 생성 폼에 확정 범위 토글이 있고 '지역까지'면 카테고리가 숨는다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/meetings?open=create");
  await expect(page.getByText("어디까지 정할까요?")).toBeVisible();

  // 기본은 '지점까지' → 목적 카테고리가 보인다
  await expect(page.getByText("무엇을 하러 모여요?")).toBeVisible();

  // '지역까지'로 바꾸면 카테고리가 사라진다 (v15)
  await page.getByRole("button", { name: /지역까지/ }).click();
  await expect(page.getByText("무엇을 하러 모여요?")).toHaveCount(0);

  // v2: 비밀번호 입력란은 없어졌다
  await expect(page.getByPlaceholder("참여자에게 공유할 비밀번호")).toHaveCount(0);

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("화면: 지점 등록 단계에 미리보기 목록이 뜨고 탭하면 후보가 된다", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.goto(`/m/${code}`);

  // 등록 화면이 떠야 한다 (투표 목록이 아니라)
  await expect(page.getByText("지점 후보 등록")).toBeVisible();
  await expect(page.getByText(/반경 700m/)).toBeVisible();

  // 미리보기 목록에서 하나 탭 → 후보가 된다
  const first = page.locator("button.cc").first();
  await expect(first).toBeVisible({ timeout: 10_000 });
  await first.click();
  await expect(page.getByText(/후보로 등록했어요/)).toBeVisible();

  const st = await get(request, code);
  expect(st.places.length, "탭했는데 후보가 안 생겼다").toBe(1);
  expect(st.places[0].source).toBe("manual");

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});
