// ─────────────────────────────────────────────────────────────
// 스모크 — 발표에 쓸 핵심 경로가 "실제로 브라우저에서 그려지는지" 본다.
//
//   모임 생성 → 참여 → 출발지 → 거점 후보 → 투표 → 방장 확정
//
// 왜 이게 CI 에 필요한가
//   `npx tsc --noEmit` 과 `npm run build` 를 **둘 다 통과**하고도 모임 상세
//   화면이 통째로 안 그려진 적이 있다(useEffect 를 조건부 return 뒤에 배치).
//   타입검사·빌드는 "렌더링된다"를 보장하지 않는다.
//
// 외부 API 키 없이 돈다 — 전부 mock 폴백(CLAUDE.md §4). CI 에 키를 넣지 않으므로
// 이 테스트가 "키 없이도 전체 플로우가 돈다"는 규칙의 검사이기도 하다.
// ─────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

interface Ident {
  id: string;
  name: string;
  isLeader: boolean;
}

/** /api/meeting 액션 하나를 쏘고, 실패하면 응답 본문까지 보여주며 죽는다. */
async function act(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 실패 (${res.status()}): ${body}`).toBeTruthy();
  return JSON.parse(body);
}

/**
 * 참가자 신원은 localStorage 에 있다(lib/identity.ts).
 * 페이지를 열기 전에 심어야 하므로 addInitScript 를 쓴다.
 */
async function loginAs(page: Page, code: string, list: Ident[], activeId: string) {
  await page.addInitScript(
    ([c, l, a]) => {
      localStorage.setItem(`moimer:${c}`, l as string);
      localStorage.setItem(`moimer:${c}:active`, a as string);
    },
    [code.toUpperCase(), JSON.stringify(list), activeId] as const
  );
}

/** 콘솔 에러를 모은다 — "로그" 관점 검증(PR 템플릿의 3관점 중 하나). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/**
 * '투표 시작'. **통합 모드의 지역에는 이 절차가 아예 없다** (멘토링 2026-08-06 §2) —
 * 핑이 곧 표라 잠글 것이 없고, 서버가 거부하는 게 **정상**이다.
 *
 * 아래 테스트 대부분은 이 액션 자체를 검사하려는 게 아니라 **다음 칸으로 넘어가려고**
 * 부른다. 그래서 그 거부만 조용히 넘긴다 — 다른 실패는 그대로 터뜨린다.
 * (지점에는 여전히 '투표 시작'이 있으므로 그 경로는 그대로 검사된다)
 */
async function startVoteIfAny(request: APIRequestContext, code: string, leaderId: string) {
  const r = await request.post("/api/meeting", {
    data: { action: "startVote", code, participantId: leaderId },
  });
  if (r.ok()) return;
  const err = (await r.json())?.error ?? "";
  if (/핑이 곧 표/.test(err)) return; // 통합 모드의 지역 — 넘길 절차가 없다
  throw new Error(`startVote 실패: ${err}`);
}

test("홈 화면이 실제로 그려진다", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  // 하단 네비게이션 **3탭** — 이게 안 보이면 셸이 안 그려진 것.
  // v6 에서 5 → 3 으로 줄었다: '투표함'·'모임원'은 모임 탭으로 통합됐다
  // (설계_v19.md §4-②). 탭이 3개인지는 tests/v19-flow.spec.ts 가 따로 지킨다.
  for (const tab of ["홈", "모임", "내정보"]) {
    await expect(page.getByRole("link", { name: new RegExp(tab) }).first()).toBeVisible();
  }
  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("모임 생성 → 출발지 → 거점 투표 → 확정", async ({ page, request }) => {
  const errors = collectErrors(page);

  // ── 1. API 로 시나리오를 만든다 (UI 폼 입력은 별도 관심사) ──
  const created = await act(request, {
    action: "create",
    name: "스모크 모임",
    password: "1234",
    headcount: 2,
    leaderName: "방장",
  });
  const code: string = created.code;
  const leaderId: string = created.participantId;
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const joined = await act(request, {
    action: "join",
    code,
    password: "1234",
    name: "참가자2",
    headcount: 1,
  });
  const memberId: string = joined.participantId;

  // 참가자2 는 API 로, 방장은 아래에서 **화면을 직접 조작해** 등록한다
  await act(request, { action: "origin", code, participantId: memberId, origin: "홍대입구", transport: "transit" });

  // ── 2. 상세 화면이 실제로 렌더되는지 (여기서 화면 미렌더 버그가 잡힌다) ──
  const idents: Ident[] = [
    { id: leaderId, name: "방장", isLeader: true },
    { id: memberId, name: "참가자2", isLeader: false },
  ];
  await loginAs(page, code, idents, leaderId);
  await page.goto(`/m/${code}`);

  // ── 출발지 등록을 UI 로 (OriginForm) ──
  //  발표 시연에서 사람이 실제로 하는 동작이라 API 가 아니라 화면으로 확인한다.
  await page.getByPlaceholder("예: 강남역").fill("강남역");
  await page.getByRole("button", { name: /출발지 등록|출발지 수정/ }).click();
  await expect(page.getByText("출발지를 등록했어요")).toBeVisible();

  // 지역 후보를 만든다 — **방장 추천 버튼**(v19 §8)의 서버 액션이다.
  //  ⚠️ 예전엔 `{action:"regions"}` 만으로 후보가 생겼다. 2026-08-10 자동 채움을
  //     걷어내면서(멘토링 8/6 §2) 그 액션은 지표만 갱신하고, 후보는 **사람 핑**
  //     이나 **방장 버튼**으로만 생긴다.
  await act(request, { action: "suggestRegions", code, participantId: leaderId, mode: "replace" });
  const seeded = await (await request.get(`/api/meeting?code=${code}`)).json();
  const regions = { regions: seeded.regions as { id: string; name: string }[] };
  expect(regions.regions.length, "거점 후보가 하나도 안 나왔다").toBeGreaterThan(0);

  await expect(page.getByText("스모크 모임").first()).toBeVisible();
  await expect(page.getByText(`코드 ${code}`).first()).toBeVisible();
  // 참가자 두 명이 지도에 보여야 한다.
  //  filter({visible:true}) 가 필요하다 — 신원 전환 <select> 안에도 같은 이름의
  //  <option> 이 있는데 그건 화면에 안 보이는 요소다.
  await expect(page.getByText("참가자2").filter({ visible: true }).first()).toBeVisible();
  // 1순위 거점이 화면에 그려져야 한다
  const topRegion: string = regions.regions[0].name;
  await expect(page.getByText(topRegion).filter({ visible: true }).first()).toBeVisible();
  // 지역 칸의 칩은 **후보 개수**를 말한다. 통합 모드에선 "몇 명이 찍었나"까지 함께
  // 말하므로(`n/N명 · 후보 n/5`) 공통부인 `후보 n/` 로 찾는다.
  await expect(page.getByText(/후보 \d+\/\d+|후보 \d+개/).first()).toBeVisible();
  // 화면이 통째로 비지 않았는지 — 버튼이 하나도 없으면 미렌더다
  expect(await page.getByRole("button").count(), "버튼이 하나도 없다 = 화면 미렌더").toBeGreaterThan(0);

  // ── 3. 지역은 **핑이 곧 표**다 (멘토링 2026-08-06 §2) ──
  //  통합 모드(기본)에는 '투표 시작'도 별도 투표 칸도 없다. 참여자가 지도를 누르면
  //  그게 한 표고, 많이 찍힌 곳이 1위다. 방장은 전원을 기다리지 않고 확정할 수 있다.
  //  ⚠️ 옛 2단계(`NEXT_PUBLIC_FF_REGION_VOTE_STEP=1`)에서는 여기서 잠금이 일어난다 —
  //     `startVoteIfAny` 가 두 모드를 모두 통과시킨다.
  await startVoteIfAny(request, code, leaderId);

  // 참가자2 가 지도를 눌러 한 표를 던진다 (핑 = 표)
  await act(request, { action: "addRegion", code, participantId: memberId, lat: 37.5665, lng: 126.978 });
  const afterPing = await (await request.get(`/api/meeting?code=${code}`)).json();
  const mine = afterPing.regions.find((r: { contributors?: string[] }) =>
    (r.contributors ?? []).includes(memberId)
  );
  expect(mine, "지도를 눌렀는데 내 표가 어디에도 없다").toBeTruthy();

  // ── 4. 방장 확정 → result 단계 ──
  await act(request, {
    action: "confirmManual",
    code,
    participantId: leaderId,
    target: "region",
    id: regions.regions[0].id,
  });
  const afterConfirm = await (await request.get(`/api/meeting?code=${code}`)).json();
  expect(afterConfirm.winnerRegion?.name).toBe(topRegion);

  // 확정 결과가 화면에도 반영되는지 (폴링 1.8초라 넉넉히 기다린다)
  await page.reload();
  await expect(page.getByText(topRegion).filter({ visible: true }).first()).toBeVisible();

  // ── 5. 지점 후보 등록 → 투표 시작 → 확정 → 최종 결과 화면 ──
  //  발표에서 마지막으로 보여주는 화면이라 여기까지 와야 데모 경로가 끝난다.
  //
  //  ⚠️ v19: 지역을 확정해도 **지점 후보는 비어 있다.** 시스템이 후보를 미리
  //     담지 않고, 사람이 미리보기 핀을 탭해서 등록한다(§4-⑧).
  //     예전엔 confirmRegion 이 generatePlaces() 로 4개를 미리 넣었다.
  expect(afterConfirm.places?.length ?? 0, "지점 후보는 확정 직후 비어 있어야 한다").toBe(0);
  expect(afterConfirm.radiusM, "지점 반경은 700m 에서 시작한다").toBe(700);

  // 미리보기 POI 를 받아 그중 하나를 후보로 등록한다 (화면의 '탭' 에 해당)
  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  expect(poi.items?.length, "반경 안에 미리보기 POI 가 하나도 없다").toBeGreaterThan(0);
  const pick = poi.items[0];
  const added = await act(request, {
    action: "addPlace",
    code,
    participantId: leaderId,
    name: pick.name,
    category: pick.category,
    emoji: pick.emoji,
    lat: pick.lat,
    lng: pick.lng,
    url: pick.url,
  });
  const topPlace = added.candidate;
  expect(topPlace?.id, "지점 후보 등록이 실패했다").toBeTruthy();

  // 후보가 1개면 v8 규칙상 투표를 생략하고 방장이 바로 확정한다
  //  ⚠️ **지점**에는 '투표 시작'이 그대로 있다 — 통합된 것은 지역뿐이다.
  const started = await act(request, { action: "startVote", code, participantId: leaderId });
  expect(started.skipped, "후보 1개면 투표를 생략해야 한다").toBe(true);

  await act(request, {
    action: "confirmManual",
    code,
    participantId: leaderId,
    target: "place",
    id: topPlace.id,
  });

  await page.reload();
  await expect(page.getByText("추천장소 확정")).toBeVisible();
  await expect(page.getByText(topPlace.name).filter({ visible: true }).first()).toBeVisible();
  // 부가기능(캘린더·링크 공유)까지 그려져야 결과 화면이 온전한 것
  await expect(page.getByRole("button", { name: /Google 캘린더에 추가/ })).toBeVisible();

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("방장이 아니면 확정할 수 없다", async ({ request }) => {
  const created = await act(request, {
    action: "create",
    name: "권한 테스트",
    password: "1234",
    headcount: 2,
    leaderName: "방장",
  });
  const joined = await act(request, {
    action: "join",
    code: created.code,
    password: "1234",
    name: "참가자2",
    headcount: 1,
  });
  const res = await request.post("/api/meeting", {
    data: {
      action: "confirmManual",
      code: created.code,
      participantId: joined.participantId,
      target: "region",
      id: "r1",
    },
  });
  expect(res.ok(), "참가자가 확정에 성공했다 — 권한 검사가 뚫렸다").toBeFalsy();
});
