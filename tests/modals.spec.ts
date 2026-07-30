// ─────────────────────────────────────────────────────────────
// 모달 스모크 — 화면을 컴포넌트로 쪼갠 뒤 "열리기는 하는지"를 지킨다.
//
// 모달은 조건부 렌더라 빌드로도 타입검사로도 안 잡힌다. 부모가 넘기는 prop 하나만
// 어긋나도 조용히 안 열린다 — 그런데 사람은 매번 열어보지 않는다.
//
// AI 채팅 플래그가 켜져 있으면 투표 UI 자체가 채팅으로 대체되므로,
// 이 테스트는 플래그가 꺼진 경우에만 의미가 있다.
// ─────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext } from "@playwright/test";

const AI_CHAT_ON = process.env.NEXT_PUBLIC_FF_AI_CHAT === "1";

async function act(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 실패 (${res.status()}): ${body}`).toBeTruthy();
  return JSON.parse(body);
}

test("후보 등록 · 수동 확정 모달이 열리고 실제로 반영된다", async ({ page, request }) => {
  test.skip(AI_CHAT_ON, "AI 채팅이 켜지면 투표 UI 대신 채팅이 뜬다 — 이 경로가 없다");

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const created = await act(request, {
    action: "create",
    name: "모달 테스트",
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
  await act(request, {
    action: "origin",
    code: created.code,
    participantId: created.participantId,
    origin: "강남역",
    transport: "transit",
  });
  await act(request, {
    action: "origin",
    code: created.code,
    participantId: joined.participantId,
    origin: "홍대입구",
    transport: "transit",
  });
  await act(request, { action: "regions", code: created.code });

  await page.addInitScript(
    ([code, list, active]) => {
      localStorage.setItem(`moimer:${code}`, list as string);
      localStorage.setItem(`moimer:${code}:active`, active as string);
    },
    [
      created.code,
      JSON.stringify([{ id: created.participantId, name: "방장", isLeader: true }]),
      created.participantId,
    ] as const
  );
  await page.goto(`/m/${created.code}`);

  // ── ＋ 다른 후보 등록 (누구나) ──
  await page.getByRole("button", { name: /다른 후보 등록/ }).first().click();
  await expect(page.getByText("만나고 싶은 지역을 검색해")).toBeVisible();
  await page.getByPlaceholder("예: 대전역").fill("대전역");
  // 검색은 디바운스 + 네트워크(키 없으면 mock) — 결과 행이 뜰 때까지 기다린다.
  // 반드시 `.modal` 안으로 범위를 좁힌다: 이름으로만 찾으면 뒤에 가려진
  // "＋ 다른 후보 등록" 버튼까지 잡혀 클릭이 영원히 안 된다.
  const addRow = page.locator(".modal button.v8-voterow").first();
  await expect(addRow).toBeVisible();
  await addRow.click();
  // 참가자가 올린 후보에는 "○○ 제안" 배지가 붙는다
  await expect(page.getByText(/제안/).filter({ visible: true }).first()).toBeVisible();

  // ── ✍ 다른 후보로 확정 (방장 전용) ──
  await page.getByRole("button", { name: /다른 후보로 확정/ }).first().click();
  await expect(page.getByText("최다득표가 아닌 곳으로도")).toBeVisible();
  await page.locator('input[name="manualPick"]').first().check();
  await page.getByRole("button", { name: "이 후보로 확정" }).click();

  await expect
    .poll(async () => (await (await request.get(`/api/meeting?code=${created.code}`)).json()).winnerRegion?.name)
    .toBeTruthy();

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});
