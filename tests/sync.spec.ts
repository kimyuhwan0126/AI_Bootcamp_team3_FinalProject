// ─────────────────────────────────────────────────────────────
// 참여자 간 연결 · 동시 쓰기 — "4명이 같이 쓰는 화면"이 실제로 버티는지
//
// 왜 이 파일이 따로 있나
//   `CLAUDE.md` 데이터 계층 규칙은 **실제로 겪은 사고**에서 나왔다:
//     · 참가자·투표를 모임 행에 같이 담았더니 **동시 쓰기에 표가 사라졌다**
//     · DB 모드에서 인메모리 캐시를 뒀더니 남이 쓴 표가 폴링에 안 보였다
//   그런데 지금까지 테스트는 전부 **한 명이 순서대로** 하는 것만 봤다.
//
// ⚠️ 이 파일은 **DATABASE_URL 이 있으면 Neon 에, 없으면 인메모리에** 그대로 돈다.
//    Next.js 가 `.env.local` 을 자동으로 읽으므로, 노트북에서 `npm run verify` 를
//    돌리면 **실제 DB 쓰기 경로가 검증된다.** CI(키 없음)에서는 인메모리로 돈다.
//    → 같은 테스트가 두 환경을 다 지킨다.
// ─────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

interface Ident { id: string; name: string; isLeader: boolean }

async function act(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/meeting", { data });
  const body = await res.text();
  expect(res.ok(), `${String(data.action)} 실패 (${res.status()}): ${body}`).toBeTruthy();
  return JSON.parse(body);
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

/** 방장 + 참여자 3명(총 4명), 전원 출발지 등록 — v13 데모 인원 구성 */
async function setupFour(request: APIRequestContext) {
  const created = await act(request, {
    action: "create", name: "동시성 테스트", leaderName: "방장",
    scope: "place", purposeCategory: "food",
  });
  const code: string = created.code;
  const ids: string[] = [created.participantId];
  await act(request, { action: "origin", code, participantId: ids[0], origin: "강남역", transport: "transit" });

  const origins = ["홍대입구", "잠실", "사당"];
  for (let i = 0; i < 3; i++) {
    const j = await act(request, { action: "join", code, name: `참가자${i + 2}` });
    ids.push(j.participantId);
    await act(request, { action: "origin", code, participantId: j.participantId, origin: origins[i], transport: "transit" });
  }
  return { code, ids };
}

/**
 * 4명이 각자 지도를 눌러 지역 후보를 만든다 (인원당 1개 · 서로 다른 자리).
 *
 * ⚠️ 예전엔 `{action:"regions"}` 한 방으로 후보가 생겼다 — 그 액션이 후보를
 *    **자동으로 깔았기** 때문이다. 2026-08-10 자동 채움을 걷어내면서
 *    (멘토링 8/6 §2) 후보는 사람이 찍어야 생긴다. 동시성 테스트가 검증하는 것은
 *    "표가 사라지지 않는가"라 후보의 출처는 상관없지만, **실제 경로로 만드는 편이
 *    테스트가 제품에서 멀어지지 않는다.**
 */
async function seedPings(request: APIRequestContext, code: string, ids: string[]) {
  const spots = [
    { lat: 37.5045, lng: 127.0490 }, // 강남
    { lat: 37.5563, lng: 126.9236 }, // 홍대
    { lat: 37.5133, lng: 127.1000 }, // 잠실
    { lat: 37.4765, lng: 126.9816 }, // 사당
  ];
  for (const [i, pid] of ids.entries()) {
    await act(request, { action: "addRegion", code, participantId: pid, ...spots[i % spots.length] });
  }
  const st = await get(request, code);
  expect(st.regions?.length, "핑을 찍었는데 지역 후보가 안 생겼다").toBeGreaterThan(0);
  return st.regions as { id: string; name: string }[];
}

// ═══════════════════════════════════════════════════════════════
// 동시 쓰기 — 표가 사라지지 않는가
// ═══════════════════════════════════════════════════════════════

test("4명이 동시에 투표해도 표가 하나도 안 사라진다", async ({ request }) => {
  const { code, ids } = await setupFour(request);
  const regions = await seedPings(request, code, ids);
  await act(request, { action: "startVote", code, participantId: ids[0] });

  // ⚠️ 순서대로가 아니라 **동시에** 쏜다 — 이게 실제로 표를 잃게 했던 상황이다.
  //    (모임 행에 표를 같이 담으면 마지막 쓰기가 앞선 쓰기를 덮어쓴다)
  await Promise.all(
    ids.map((pid, i) =>
      act(request, {
        action: "vote", code, participantId: pid,
        target: "region", candidateId: regions[i % regions.length].id,
      })
    )
  );

  const st = await get(request, code);
  for (const pid of ids) {
    expect(st.regionVotes[pid], `${pid} 의 표가 사라졌다 — 동시 쓰기 유실`).toBeTruthy();
  }
  expect(Object.keys(st.regionVotes)).toHaveLength(4);
});

test("4명이 동시에 출발지를 바꿔도 아무도 유실되지 않는다", async ({ request }) => {
  const { code, ids } = await setupFour(request);
  const next = ["수원역", "노원", "부천", "건대입구"];

  await Promise.all(
    ids.map((pid, i) =>
      act(request, { action: "origin", code, participantId: pid, origin: next[i], transport: "transit" })
    )
  );

  const st = await get(request, code);
  expect(st.totalParticipants).toBe(4);
  expect(st.originsSet, "동시 등록에서 출발지가 유실됐다").toBe(4);
  // 참가자 행은 각자 따로 써야 한다 — 한 명이 다른 사람 값을 덮으면 여기서 걸린다
  const origins = st.participants.map((p: { origin: string }) => p.origin);
  expect(new Set(origins).size, "출발지가 서로 덮어써졌다").toBe(4);
});

test("동시에 같은 지점 후보를 등록해도 중복이 생기지 않는다", async ({ request }) => {
  const { code, ids } = await setupFour(request);
  const regions = await seedPings(request, code, ids);
  await act(request, { action: "startVote", code, participantId: ids[0] });
  await act(request, {
    action: "confirmManual", code, participantId: ids[0],
    target: "region", id: regions[0].id,
  });

  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  const p = poi.items[0];

  // 네 명이 동시에 같은 가게를 탭한다
  const results = await Promise.all(
    ids.map((pid) =>
      request.post("/api/meeting", {
        data: {
          action: "addPlace", code, participantId: pid,
          name: p.name, category: p.category, lat: p.lat, lng: p.lng,
        },
      }).then((res) => res.json())
    )
  );
  expect(results.every((x) => x.ok), "동시 등록 중 일부가 실패했다").toBe(true);

  const st = await get(request, code);
  const same = st.places.filter((x: { name: string }) => x.name === p.name);
  expect(same.length, "같은 지점이 여러 후보로 쪼개졌다").toBe(1);
});

// ═══════════════════════════════════════════════════════════════
// 참여자 간 연결 — 남이 한 것이 내 화면에 뜨는가 (1.8초 폴링)
// ═══════════════════════════════════════════════════════════════

test("한 참여자의 투표가 다른 참여자 화면에 반영된다 (폴링)", async ({ browser, request }) => {
  const { code, ids } = await setupFour(request);
  const regions = await seedPings(request, code, ids);
  await act(request, { action: "startVote", code, participantId: ids[0] });

  const idents: Ident[] = [
    { id: ids[0], name: "방장", isLeader: true },
    { id: ids[1], name: "참가자2", isLeader: false },
  ];

  // 두 개의 독립된 브라우저 컨텍스트 = 두 사람의 폰
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await loginAs(pageA, code, idents, ids[0]);
  await loginAs(pageB, code, idents, ids[1]);
  await pageA.goto(`/m/${code}`);
  await pageB.goto(`/m/${code}`);

  // B 가 투표하기 전 — A 화면은 0표
  await expect(pageA.getByText(/0\/4명/).first()).toBeVisible({ timeout: 10_000 });

  // B 가 API 로 투표 (화면 조작 대신 — 여기서 볼 것은 "A 에게 보이는가"다)
  await act(request, {
    action: "vote", code, participantId: ids[1],
    target: "region", candidateId: regions[0].id,
  });

  // A 는 아무것도 안 했는데 폴링(1.8초)으로 표가 올라와야 한다
  await expect(pageA.getByText(/1\/4명/).first(), "남의 표가 내 화면에 안 들어온다 — 폴링 끊김")
    .toBeVisible({ timeout: 10_000 });

  await ctxA.close();
  await ctxB.close();
});

test("방장이 단계를 넘기면 참여자 화면도 따라 넘어간다", async ({ browser, request }) => {
  const { code, ids } = await setupFour(request);
  await seedPings(request, code, ids);

  const idents: Ident[] = [{ id: ids[1], name: "참가자2", isLeader: false }];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, code, idents, ids[1]);
  await page.goto(`/m/${code}`);

  // 아직 등록 단계 — 참여자 화면에 지도 핑 안내가 있다
  await expect(page.getByText("참여자 현황")).toBeVisible({ timeout: 10_000 });

  // 방장이 투표를 시작한다 (다른 기기에서)
  await act(request, { action: "startVote", code, participantId: ids[0] });

  // 참여자 화면이 투표 단계로 따라 넘어가야 한다
  await expect(page.getByText(/명 투표/).first(), "방장이 넘긴 단계가 참여자 화면에 안 온다")
    .toBeVisible({ timeout: 10_000 });

  await ctx.close();
});
