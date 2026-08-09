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

test("홈 화면이 실제로 그려진다", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  // 하단 네비게이션 5탭 — 이게 안 보이면 셸이 안 그려진 것
  for (const tab of ["홈", "모임", "투표함", "모임원", "내정보"]) {
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

  const regions = await act(request, { action: "regions", code });
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
  // 방장 확정 바가 투표 진행 상황을 말해야 한다
  await expect(page.getByText(/\d+\/\d+명 투표/).first()).toBeVisible();
  // 화면이 통째로 비지 않았는지 — 버튼이 하나도 없으면 미렌더다
  expect(await page.getByRole("button").count(), "버튼이 하나도 없다 = 화면 미렌더").toBeGreaterThan(0);

  // ── 3. 투표 시작(= 후보 잠금) → 투표가 서버에 실제로 기록되는지 ──
  //  v19 §5: 두 단계 모두 '등록 → 투표 시작(잠금) → 투표 → 방장 확정'이다.
  //  투표 시작 전에는 서버가 표를 **거부한다**(v12 — "단계가 바뀌었어요").
  //  예전 흐름(등록 화면에서 바로 투표)은 v19 에서 사라졌다.
  await act(request, { action: "startVote", code, participantId: leaderId });
  const afterStart = await (await request.get(`/api/meeting?code=${code}`)).json();
  expect(afterStart.stage, "투표 시작이 지역 투표 단계로 넘기지 못했다").toBe("chat");

  await act(request, {
    action: "vote",
    code,
    participantId: leaderId,
    target: "region",
    candidateId: regions.regions[0].id,
  });
  const afterVote = await (await request.get(`/api/meeting?code=${code}`)).json();
  expect(afterVote.regionVotes[leaderId]).toBe(regions.regions[0].id);

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

  // ── 5. 가게까지 확정 → 최종 결과 화면 ──
  //  발표에서 마지막으로 보여주는 화면이라 여기까지 와야 데모 경로가 끝난다.
  expect(afterConfirm.places?.length, "거점 확정 후 가게 후보가 안 만들어졌다").toBeGreaterThan(0);
  const topPlace = afterConfirm.places[0];
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
