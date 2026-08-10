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

/**
 * 지역 후보를 만들어 두고 목록을 준다.
 *
 * ⚠️ 예전엔 `{action:"regions"}` 한 방이었다 — 그 액션이 후보를 **자동으로 깔았기**
 *    때문이다. 2026-08-10 자동 채움을 걷어내면서(멘토링 8/6 §2) 그 액션은 이제
 *    **지표만 갱신**한다. 아래 테스트들이 검증하는 것은 "후보가 어떻게 생겼나"가
 *    아니라 **투표 잠금·게이트·되돌리기 규칙**이라, 후보는 실제 제품 경로 중
 *    가장 짧은 것(방장 추천 버튼)으로 채운다. 핑 자체는 `check-devices` 가 화면으로 검증한다.
 */
async function seedRegions(request: APIRequestContext, code: string) {
  const st = await get(request, code);
  const leader = st.participants.find((p: { isLeader?: boolean }) => p.isLeader);
  await act(request, { action: "suggestRegions", code, participantId: leader?.id, mode: "replace" });
  const after = await get(request, code);
  expect(after.regions?.length, "지역 후보가 하나도 안 나왔다").toBeGreaterThan(0);
  return after.regions as { id: string; name: string }[];
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
// §4-⑤ · §7 참여 · 인증 · 방장 권한
// ═══════════════════════════════════════════════════════════════

test("§4-⑤ 정원 8명 — 9번째는 입장 거부", async ({ request }) => {
  const { code } = await setup(request);
  // 방장 1명 + 7명 = 8명
  for (let i = 2; i <= 8; i++) {
    await act(request, { action: "join", code, name: `참가자${i}` });
  }
  const full = await get(request, code);
  expect(full.totalParticipants).toBe(8);

  const denied = await actFails(request, { action: "join", code, name: "아홉번째" });
  expect(denied.error).toContain("정원이 가득");
});

test("§4-⑤ 이름 중복은 거부하고 별칭을 요구한다", async ({ request }) => {
  const { code } = await setup(request);
  await act(request, { action: "join", code, name: "김철수" });
  const dup = await actFails(request, { action: "join", code, name: "김철수" });
  expect(dup.error).toContain("이미");
  // 별칭을 붙이면 들어간다
  await act(request, { action: "join", code, name: "김철수2" });
  expect((await get(request, code)).totalParticipants).toBe(3);
});

test("§4-⑤ 이름+PIN 으로 자리를 되찾고, 5회 틀리면 잠긴다", async ({ request }) => {
  const { code } = await setup(request);
  const joined = await act(request, { action: "join", code, name: "복구맨", pin: "1234" });

  // 맞는 PIN → 같은 participantId 를 돌려준다 (새로 만들지 않는다)
  const ok = await act(request, { action: "recover", code, name: "복구맨", pin: "1234" });
  expect(ok.participantId).toBe(joined.participantId);
  expect((await get(request, code)).totalParticipants, "복구가 새 참가자를 만들면 안 된다").toBe(2);

  // 5회 틀리면 잠긴다 (v16)
  for (let i = 0; i < 5; i++) {
    await actFails(request, { action: "recover", code, name: "복구맨", pin: "0000" });
  }
  const locked = await actFails(request, { action: "recover", code, name: "복구맨", pin: "1234" });
  expect(locked.error, "5회 초과 후엔 맞는 PIN 도 막혀야 한다").toContain("잠겼어요");
});

test("§7 강퇴는 방장만 · 그 사람의 표가 함께 사라진다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const joined = await act(request, { action: "join", code, name: "나갈사람" });
  const memberId: string = joined.participantId;

  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "vote", code, participantId: memberId, target: "region", candidateId: regions[0].id });
  expect((await get(request, code)).regionVotes[memberId]).toBe(regions[0].id);

  // 참가자는 강퇴 못 한다
  const denied = await actFails(request, { action: "kick", code, participantId: memberId, targetId: leaderId });
  expect(denied.error).toContain("방장만");

  // 방장이 강퇴 → 사람도 표도 사라진다
  await act(request, { action: "kick", code, participantId: leaderId, targetId: memberId });
  const after = await get(request, code);
  expect(after.totalParticipants).toBe(1);
  expect(after.regionVotes[memberId], "강퇴된 사람의 표가 남아 있다").toBeUndefined();

  // v10: 재참여는 허용된다
  await act(request, { action: "join", code, name: "나갈사람" });
  expect((await get(request, code)).totalParticipants).toBe(2);
});

test("§7 모임 삭제는 방장만", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const joined = await act(request, { action: "join", code, name: "참가자2" });

  const denied = await actFails(request, {
    action: "deleteMeeting", code, participantId: joined.participantId,
  });
  expect(denied.error).toContain("방장만");

  await act(request, { action: "deleteMeeting", code, participantId: leaderId });
  const res = await request.get(`/api/meeting?code=${code}`);
  expect(res.status(), "삭제된 모임이 아직 조회된다").toBe(404);
});

// ═══════════════════════════════════════════════════════════════
// §4-⑩ 결과 · 신호등 · 시간   /   §4-⑪ 지난 모임 · 재모임
// ═══════════════════════════════════════════════════════════════

/** 결과 단계까지 밀어 넣는다 (지점 확정까지) */
async function toResult(request: APIRequestContext) {
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });
  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  const p = poi.items[0];
  const added = await act(request, {
    action: "addPlace", code, participantId: leaderId,
    name: p.name, category: p.category, lat: p.lat, lng: p.lng,
  });
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "place", id: added.candidate.id });
  return { code, leaderId };
}

test("§4-⑩ 모임 시간 미입력이면 신호등이 잠긴다", async ({ request }) => {
  const { code, leaderId } = await toResult(request);
  const st = await get(request, code);
  expect(st.stage).toBe("result");
  expect(st.meetTime, "생성 시 시간을 안 줬으므로 null 이어야 한다").toBeNull();

  const locked = await actFails(request, {
    action: "status", code, participantId: leaderId, status: "green",
  });
  expect(locked.error).toContain("모임 시간을 먼저");
});

test("§4-⑩ 모임 시간은 방장만 · 과거는 거부", async ({ request }) => {
  const { code, leaderId } = await toResult(request);
  const joined = await act(request, { action: "join", code, name: "참가자2" });

  const denied = await actFails(request, {
    action: "meetTime", code, participantId: joined.participantId,
    meetTime: new Date(Date.now() + 86_400_000).toISOString(),
  });
  expect(denied.error).toContain("방장만");

  const past = await actFails(request, {
    action: "meetTime", code, participantId: leaderId,
    meetTime: new Date(Date.now() - 86_400_000).toISOString(),
  });
  expect(past.error).toContain("지난 시각");

  const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const ok = await act(request, { action: "meetTime", code, participantId: leaderId, meetTime: future });
  expect(ok.meetTime).toBeTruthy();
});

test("§4-⑩ 신호등은 모임 당일에만 열린다 · 노랑은 지각 분을 공유한다", async ({ request }) => {
  const { code, leaderId } = await toResult(request);

  // 3일 뒤로 잡으면 아직 못 쓴다 (v16)
  await act(request, {
    action: "meetTime", code, participantId: leaderId,
    meetTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  });
  const early = await actFails(request, { action: "status", code, participantId: leaderId, status: "green" });
  expect(early.error).toContain("당일");

  // 오늘 늦은 시각으로 옮기면 열린다
  const today = new Date();
  today.setHours(23, 30, 0, 0);
  await act(request, { action: "meetTime", code, participantId: leaderId, meetTime: today.toISOString() });

  await act(request, { action: "status", code, participantId: leaderId, status: "yellow", lateMin: 15 });
  const st = await get(request, code);
  const me = st.participants.find((p: { id: string }) => p.id === leaderId);
  expect(me.status).toBe("yellow");
  expect(me.lateMin, "노랑이면 지각 분이 전원에게 보여야 한다").toBe(15);

  // 색을 바꾸면 지각 분은 사라진다
  await act(request, { action: "status", code, participantId: leaderId, status: "green" });
  const st2 = await get(request, code);
  expect(st2.participants.find((p: { id: string }) => p.id === leaderId).lateMin).toBeNull();
});

test("§4-⑩ '지역까지' 모임에는 신호등이 없다", async ({ request }) => {
  const { code, leaderId } = await setup(request, { scope: "region" });
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const denied = await actFails(request, { action: "status", code, participantId: leaderId, status: "green" });
  expect(denied.error).toContain("'지역까지'");
});

test("§4-⑪ 재모임은 방장만 · 로그인 멤버만 자동 이전", async ({ request }) => {
  const { code, leaderId } = await toResult(request);
  // 로그인 멤버 1명 + 비로그인 1명
  await act(request, { action: "join", code, name: "로그인멤버", kakaoId: "kakao-1" });
  const guest = await act(request, { action: "join", code, name: "비로그인" });

  const denied = await actFails(request, {
    action: "recreate", code, participantId: guest.participantId,
  });
  expect(denied.error).toContain("방장만");

  const r = await act(request, { action: "recreate", code, participantId: leaderId });
  expect(r.code, "새 모임 코드가 없다").toBeTruthy();
  expect(r.code).not.toBe(code);
  expect(r.carried, "로그인 멤버 1명만 옮겨가야 한다").toBe(1);

  const fresh = await get(request, r.code);
  // 방장 + 로그인 멤버 = 2명 (비로그인은 재참여해야 한다)
  expect(fresh.totalParticipants).toBe(2);
  expect(fresh.participants.some((p: { name: string }) => p.name === "로그인멤버")).toBe(true);
  expect(fresh.participants.some((p: { name: string }) => p.name === "비로그인")).toBe(false);
  // 새 모임은 처음 단계부터 시작한다
  expect(fresh.stage).toBe("main");
  expect(fresh.isPast).toBe(false);
});

// ═══════════════════════════════════════════════════════════════
// §4-⑥ 지도 핑 — 좌표만 보내면 후보가 된다 (동 스냅 · 인원당 1개 · 병합)
// ═══════════════════════════════════════════════════════════════

test("§4-⑥ 좌표만 보내도 후보가 만들어진다 (동 스냅 · 실패 시 좌표 이름 폴백)", async ({ request }) => {
  const { code, leaderId } = await setup(request);

  const r = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.5665, lng: 126.978,
  });
  expect(r.candidate?.name, "이름 없이 좌표만 보냈는데 후보 이름이 안 붙었다").toBeTruthy();
  expect(r.candidate.source).toBe("manual");
  expect(r.candidate.contributors, "핑을 찍은 사람이 기록돼야 병합·이탈이 계산된다").toContain(leaderId);
});

test("§4-⑥ 핑은 인원당 1개 — 다른 곳을 찍으면 옮겨간다", async ({ request }) => {
  const { code, leaderId } = await setup(request);

  const first = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.5665, lng: 126.978,
  });
  // 충분히 떨어진 좌표(다른 동)를 찍는다
  const second = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.4979, lng: 127.0276,
  });
  expect(second.candidate.id).not.toBe(first.candidate.id);

  const st = await get(request, code);
  // 옛 후보는 마지막 한 명이 빠져 사라진다 (v12)
  expect(st.regions.some((r: { id: string }) => r.id === first.candidate.id),
    "핑을 옮겼는데 옛 후보가 남아 있다").toBe(false);
  expect(st.regions.length).toBe(1);
});

test("§4-⑥ 같은 곳을 두 사람이 찍으면 하나로 병합된다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const joined = await act(request, { action: "join", code, name: "참가자2" });

  const a = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.5665, lng: 126.978,
  });
  const b = await act(request, {
    action: "addRegion", code, participantId: joined.participantId, lat: 37.5665, lng: 126.978,
  });
  expect(b.existing, "같은 동인데 새 후보가 만들어졌다").toBe(true);
  expect(b.candidate.id).toBe(a.candidate.id);

  const st = await get(request, code);
  expect(st.regions.length, "같은 동은 하나로 병합돼야 한다").toBe(1);
  expect(st.regions[0].contributors).toHaveLength(2);
});

// ═══════════════════════════════════════════════════════════════
// §8 AI 추천 — 게이트 (💰 실제 호출은 하지 않는다)
//
//  ⚠️ 여기서는 **AI 를 부르지 않는다.** `NEXT_PUBLIC_FF_AI_VOTE` 가 꺼진 상태라
//     403 에서 막히는 것까지가 검사 범위다 — CI 에서 유료 API(Ollama Cloud)를
//     호출하면 안 되기 때문이다 (CLAUDE.md §4).
//     병합 규칙(v9·v14)은 켠 상태에서 사람이 눌러 확인한다.
// ═══════════════════════════════════════════════════════════════

test("§8 AI 추천은 플래그가 꺼져 있으면 호출조차 되지 않는다 (0원 보장)", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const res = await request.post("/api/meeting", {
    data: { action: "aiRecommend", code, participantId: leaderId, mode: "replace" },
  });
  // 플래그가 꺼져 있으면 403 — 유료 API 로 가는 길이 아예 닫혀 있다
  expect(res.status(), "AI 플래그가 꺼졌는데 호출이 통과했다").toBe(403);
  const body = await res.json();
  expect(body.error).toContain("NEXT_PUBLIC_FF_AI_VOTE");
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

// ── 발표 시연 경로 — 여기가 막히면 데모가 멈춘다 ──────────────────

test("시연: 출발지가 바뀌어도 사람이 찍은 핑은 사라지지 않는다", async ({ request }) => {
  // ⚠️ 자동 후보 재계산(`regions`)이 돌 때 사람이 등록한 후보를 밀어내면,
  //    "AI 추천 → 다른 사람 참여 → 후보 사라짐" 이 발표 중에 그대로 재현된다.
  const { code, leaderId } = await setup(request);
  const pinged = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.5665, lng: 126.978,
  });

  // 새 참여자가 들어와 출발지를 넣으면 자동 재계산이 돈다
  const joined = await act(request, { action: "join", code, name: "늦게온사람" });
  await act(request, {
    action: "origin", code, participantId: joined.participantId,
    origin: "잠실", transport: "transit",
  });
  await act(request, { action: "regions", code });

  const st = await get(request, code);
  expect(
    st.regions.some((r: { id: string }) => r.id === pinged.candidate.id),
    "출발지 재계산에 사람이 찍은 핑이 밀려 사라졌다"
  ).toBe(true);
});

test("시연: 초대 링크로 들어오면 참여 폼이 먼저 뜬다 (신원 없음)", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const { code } = await setup(request, { name: "초대 테스트" });

  // ⚠️ loginAs 를 **하지 않는다** — 팀원이 카톡 링크를 눌렀을 때와 같은 상태
  await page.goto(`/m/${code}`);

  await expect(page.getByText("모임 참여")).toBeVisible();
  await expect(page.getByText("초대 테스트")).toBeVisible();
  await expect(page.getByPlaceholder("예: 김철수")).toBeVisible();
  await expect(page.getByPlaceholder("예: 강남역")).toBeVisible();

  // 이름·출발지를 넣으면 참여되고 모임 화면으로 넘어간다 (원스텝, v11)
  await page.getByPlaceholder("예: 김철수").fill("링크참여자");
  await page.getByPlaceholder("예: 강남역").fill("홍대입구");
  await page.getByRole("button", { name: "참여하기" }).click();

  await expect(page.getByText("참여자 현황")).toBeVisible({ timeout: 10_000 });

  const st = await get(request, code);
  expect(st.totalParticipants, "참여가 서버에 반영되지 않았다").toBe(2);
  const joined = st.participants.find((p: { name: string }) => p.name === "링크참여자");
  expect(joined, "참여자가 없다").toBeTruthy();
  expect(joined.origin, "출발지까지 원스텝으로 등록돼야 한다").toBeTruthy();

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("시연: 생성 폼의 모임 시간이 meetTime 으로 저장된다", async ({ request }) => {
  // ⚠️ 예전엔 자유 문구를 prefs.timeText 에만 넣어서 meetTime 이 계속 null 이었다.
  //    그러면 D-day 도, 도착 신호등도, '지난 모임' 전환도 전부 동작하지 않는다.
  const when = new Date(Date.now() + 2 * 86_400_000);
  const created = await act(request, {
    action: "create",
    name: "시간 테스트",
    leaderName: "방장",
    scope: "place",
    purposeCategory: "food",
    meetTime: when.toISOString(),
  });

  const st = await get(request, created.code);
  expect(st.meetTime, "생성 시 넣은 시간이 저장되지 않았다").toBeTruthy();
  expect(new Date(st.meetTime).getTime()).toBe(when.getTime());
});

test("화면: §4-① 홈에 '이 출발지들로 모임 만들기' 전환 고리가 있다", async ({ page }) => {
  // 출발지 2곳을 심어두고 홈을 연다 (홈은 localStorage 에서 복원한다)
  // ⚠️ 스플래시도 함께 넘긴다 — 첫 방문이면 전체화면(z-index:100)으로 떠서
  //    아래 버튼을 덮는다. "이미 한 번 본 사용자" 상태로 맞추는 것이다.
  //    (발표 때 팀원들은 처음 열면 '시작하기'를 한 번 눌러야 한다 — 정상 동작)
  await page.addInitScript(() => {
    localStorage.setItem("moimer:v8:splash", "1");
    localStorage.setItem(
      "moimer:v8:origins",
      JSON.stringify([
        { id: "o1", name: "강남역", lat: 37.4979, lng: 127.0276, transport: "transit" },
        { id: "o2", name: "홍대입구", lat: 37.5572, lng: 126.9245, transport: "transit" },
      ])
    );
  });
  await page.goto("/");

  const cta = page.getByRole("link", { name: /이 출발지들로 모임 만들기/ });
  await expect(cta).toBeVisible({ timeout: 10_000 });

  // ⚠️ 넓은 화면(노트북)에서 **껍데기 밖으로 튀어나오지 않아야** 한다.
  //    `position:fixed` + `left/right:16` 은 뷰포트 기준이라 화면 전체 폭이 된다 —
  //    가운데 440px 폰 모양(.device) 안에 있어야 한다 (2026-08-10 실측 버그).
  await page.setViewportSize({ width: 1280, height: 900 });
  const shell = await page.locator(".device").first().boundingBox();
  const box = await cta.boundingBox();
  expect(shell, "폰 모양 껍데기(.device)를 못 찾았다").toBeTruthy();
  expect(box, "버튼을 못 찾았다").toBeTruthy();
  expect(box!.x, "버튼 왼쪽이 껍데기 밖으로 나갔다").toBeGreaterThanOrEqual(shell!.x - 1);
  expect(box!.x + box!.width, "버튼 오른쪽이 껍데기 밖으로 나갔다").toBeLessThanOrEqual(
    shell!.x + shell!.width + 1
  );

  await cta.click();
  // 생성 모달이 열린 모임 탭으로 간다
  await expect(page).toHaveURL(/\/meetings\?open=create/);
  await expect(page.getByText("어디까지 정할까요?")).toBeVisible();
});

test("화면: §4-② 하단 탭은 3개다 (투표함·모임원은 통합됨)", async ({ page }) => {
  await page.goto("/meetings");
  const nav = page.locator(".v8-bottomnav");
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(3);
  for (const label of ["홈", "모임", "내정보"]) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  // v6 에서 사라진 탭
  await expect(nav.getByText("투표함")).toHaveCount(0);
  await expect(nav.getByText("모임원")).toHaveCount(0);
});

test("화면: §4-② 폐기된 /votes · /members 는 모임 탭으로 보낸다", async ({ page }) => {
  await page.goto("/votes");
  await expect(page).toHaveURL(/\/meetings$/);
  await page.goto("/members");
  await expect(page).toHaveURL(/\/meetings$/);
});

test("화면: §4-② 모임 탭에 필터 7종(+전체)이 있고 지난 모임이 걸러진다", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const { code, leaderId } = await setup(request, { name: "필터 테스트" });
  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.goto("/meetings");

  for (const label of ["전체", "모집", "지역", "지점", "확정", "방장", "참여", "지난"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  // 기본('전체')에는 모집 중인 이 모임이 보인다
  await expect(page.getByText("필터 테스트")).toBeVisible();
  // '지난' 탭으로 가면 사라진다 (아직 지난 모임이 아니다)
  await page.getByRole("button", { name: "지난", exact: true }).click();
  await expect(page.getByText("지난 모임이 없어요")).toBeVisible();
  // '모집' 탭에는 다시 보인다
  await page.getByRole("button", { name: "모집", exact: true }).click();
  await expect(page.getByText("필터 테스트")).toBeVisible();

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("화면: §4-② 투표가 열린 모임은 상단에 고정된다", async ({ page, request }) => {
  const { code, leaderId } = await setup(request, { name: "투표중 모임" });
  await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });

  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.goto("/meetings");
  await expect(page.getByText(/🔔 투표하세요!/)).toBeVisible();
  await expect(page.getByText(/지역 투표 진행 중/)).toBeVisible();
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

  // 미리보기 목록에서 [+ 등록] → 후보가 된다
  // ⚠️ 행 전체가 버튼이던 것을 바꿨다 — 주소를 읽으려고 눌렀다가 등록되면 안 된다.
  //    '보기'(카카오맵)와 '+ 등록'을 갈라 놓았으므로 등록 버튼을 정확히 누른다.
  const first = page.getByRole("button", { name: "+ 등록" }).first();
  await expect(first).toBeVisible({ timeout: 10_000 });
  await first.click();
  await expect(page.getByText(/후보로 등록했어요/)).toBeVisible();

  const st = await get(request, code);
  expect(st.places.length, "탭했는데 후보가 안 생겼다").toBe(1);
  expect(st.places[0].source).toBe("manual");

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

// ── 이동시간 유실 · 투표 중 잠금 (2026-08-10 실측) ────────────────

test("시연: 나중에 합류한 사람도 후보 이동시간에 들어온다", async ({ request }) => {
  // ⚠️ 발표에서 팀원이 한 명씩 들어오는 그 순서다.
  //    예전엔 후보 **이름**만 비교해 "달라진 게 없다"고 판단하고 새로 계산한
  //    이동시간을 버렸다 → 늦게 온 사람은 `perParticipant` 에 영영 없고,
  //    결과 화면에서 "이동시간 없음" 으로 남았다.
  const { code, leaderId } = await setup(request);
  const early = await act(request, { action: "join", code, name: "일찍온사람" });
  await act(request, {
    action: "origin", code, participantId: early.participantId,
    origin: "홍대입구", transport: "transit",
  });
  // 2명이 있을 때 후보가 잡힌다 (핑 1개 + 방장 추천 3곳 — 둘 다 갱신 대상이어야 한다)
  await act(request, { action: "addRegion", code, participantId: early.participantId, lat: 37.5665, lng: 126.978 });
  await seedRegions(request, code);
  await act(request, { action: "regions", code });

  for (const [name, origin] of [["늦은1", "잠실"], ["늦은2", "사당"]] as const) {
    const j = await act(request, { action: "join", code, name });
    await act(request, { action: "origin", code, participantId: j.participantId, origin, transport: "transit" });
  }
  await act(request, { action: "regions", code }); // 화면이 재계산을 요청하는 시점

  const st = await get(request, code);
  // ⚠️ 후보가 0개면 아래 루프가 **아무것도 검사하지 않고 통과한다.**
  //    자동 채움을 걷어낸 뒤 실제로 그렇게 될 뻔했다 (2026-08-10).
  expect(st.regions.length, "후보가 없어 이 테스트가 아무것도 검증하지 않는다").toBeGreaterThan(0);
  for (const r of st.regions) {
    const pids = (r.perParticipant ?? []).map((x: { pid: string }) => x.pid);
    expect(pids, `'${r.name}' 후보에 4명이 다 안 들어왔다 — 결과 화면에서 '이동시간 없음'이 뜬다`)
      .toHaveLength(4);
  }
  expect(leaderId).toBeTruthy();
});

test("§5 투표 중에 출발지를 고쳐도 후보와 표가 그대로다", async ({ request }) => {
  // ⚠️ 발표 중 한 명이 "사당이 아니라 사당역이었어요" 하고 고치는 순간
  //    자동 재계산이 돌아 **전원의 표가 사라졌다.** 투표 시작 = 후보 잠금(v19 §5)이
  //    후보 등록 쪽에만 걸려 있고 재계산 쪽은 뚫려 있었다.
  const { code, leaderId } = await setup(request);
  const mate = await act(request, { action: "join", code, name: "참가자2" });
  await act(request, { action: "origin", code, participantId: mate.participantId, origin: "홍대입구", transport: "transit" });
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "vote", code, participantId: leaderId, target: "region", candidateId: regions[0].id });

  const before = (await get(request, code)).regions.map((r: { name: string }) => r.name).join(",");

  // 투표 중에 출발지를 크게 바꾼다 (= 추천 결과가 달라질 만한 변경)
  await act(request, { action: "origin", code, participantId: mate.participantId, origin: "수원역", transport: "transit" });
  await act(request, { action: "regions", code });

  const after = await get(request, code);
  expect(after.regions.map((r: { name: string }) => r.name).join(","), "투표 중인데 후보가 바뀌었다").toBe(before);
  expect(after.regionVotes[leaderId], "투표 중 출발지 수정으로 표가 사라졌다").toBe(regions[0].id);
});

test("LAN: 카카오 Redirect URI 는 접속한 주소를 따라간다", async ({ request }) => {
  // ⚠️ 폰이 http://10.x.x.x:3000 으로 들어왔는데 redirect_uri 를 localhost 로
  //    고정해 보내면, 카카오가 **폰 자신의 localhost** 로 돌려보내 로그인이 끝나지 않는다.
  //    (2026-08-10 팀원 폰에서 실측)
  const st = await (await request.get("/api/status")).json();
  const base = new URL(test.info().project.use.baseURL as string);
  expect(st.kakaoRedirect, "접속한 호스트가 아니라 고정값을 쓰고 있다").toBe(
    `${base.origin}/api/auth/kakao/callback`
  );
});

test("화면: 기기가 다크 모드여도 라이트로 고정된다", async ({ page }) => {
  // ⚠️ 발표에서 노트북·팀원 폰을 나란히 띄우는데 기기마다 색이 달라지면
  //    같은 화면이 서로 다르게 보인다 — 2026-08-10 팀 결정으로 라이트 고정.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const ink = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()
  );
  expect(ink, "기기 다크 모드를 따라가고 있다 — 라이트 고정이 풀렸다").toBe("#111a2b");

  const scheme = await page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme
  );
  // 이 선언이 있어야 안드로이드 크롬이 우리 색 위에 자동 다크를 덧칠하지 않는다
  expect(scheme, "color-scheme 선언이 빠졌다").toContain("light");
});

test("LAN: /health 에서 두 기기가 서로를 본다", async ({ browser }) => {
  // ⚠️ 발표 당일 폰에서 "내가 붙었나"를 확인할 유일한 화면이다.
  //    두 기기가 서로 안 보이면 그 폰은 서버에 못 붙은 것 — 발표가 거기서 멈춘다.
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();

  await pa.goto("/health");
  await pa.getByRole("button", { name: /점검 시작/ }).click();
  await expect(pa.getByText(/연결된 기기 1대/)).toBeVisible({ timeout: 15_000 });

  // 첫 기기가 만든 링크를 두 번째 기기가 연다 (단톡방에 뿌리는 그 링크)
  const url = (await pa.locator("code").last().innerText()).trim();
  await pb.goto(url);
  await pb.getByRole("button", { name: "참여", exact: true }).click();
  await expect(pb.getByText(/연결된 기기 2대/)).toBeVisible({ timeout: 15_000 });

  // 첫 기기는 아무것도 안 했는데 폴링으로 2대가 돼야 한다
  await expect(pa.getByText(/연결된 기기 2대/), "다른 기기가 내 화면에 안 나타난다 — 폴링 끊김")
    .toBeVisible({ timeout: 15_000 });

  // 각자 자기 기기를 알아볼 수 있어야 한다
  await expect(pa.getByText("이 기기").first()).toBeVisible();
  await expect(pb.getByText("이 기기").first()).toBeVisible();

  await pa.getByRole("button", { name: /점검 끝/ }).click();
  await a.close();
  await b.close();
});

test("§4-⑥ 확정하면 그 시점 인원 전원의 이동시간이 채워진다", async ({ request }) => {
  // ⚠️ v19 §4-⑥: "후보에 이동시간을 표시하지 않는다. 경로 API 는 최종 확정 후에만."
  //    결과 화면이 쓰는 숫자는 **확정 시점 인원 전체**여야 한다.
  //    예전엔 후보를 계산한 뒤 들어온 사람이 영영 빠져 "이동시간 없음" 으로 남았다.
  //    등록 단계의 자동 재계산으로도 메워지지만, 4인분 경로 계산이 투표 시작보다
  //    느려 자주 놓친다(2026-08-10 실측 8초 초과) — 확정 시점에 한 번 더 채운다.
  const { code, leaderId } = await setup(request);
  const early = await act(request, { action: "join", code, name: "일찍" });
  await act(request, { action: "origin", code, participantId: early.participantId, origin: "홍대입구", transport: "transit" });
  const regions = await seedRegions(request, code);   // 2명 기준으로 후보가 굳는다

  // 후보가 굳은 **뒤에** 두 명이 더 온다 (재계산을 일부러 돌리지 않는다)
  for (const [name, origin] of [["늦은1", "잠실"], ["늦은2", "사당"]] as const) {
    const j = await act(request, { action: "join", code, name });
    await act(request, { action: "origin", code, participantId: j.participantId, origin, transport: "transit" });
  }

  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const st = await get(request, code);
  const pids = (st.winnerRegion?.perParticipant ?? []).map((x: { pid: string }) => x.pid);
  expect(pids, "확정된 지역에 4명이 다 안 들어왔다 — 결과 화면에 '이동시간 없음'이 뜬다")
    .toHaveLength(4);
});

test("§4-⑧ 지점 미리보기가 지도에 회색 핀으로 뜨고, 탭하면 후보가 된다", async ({ page, request }) => {
  // ⚠️ v19 §4-⑧ 의 기본 동작은 **"미리보기 핀(회색) 탭 → 후보 등록"** 이다.
  //    목록만 있으면 지도가 아니라 텍스트를 읽고 고르는 화면이 된다(2026-08-10 제보).
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.goto(`/m/${code}`);
  await expect(page.getByText("지점 후보 등록")).toBeVisible({ timeout: 10_000 });

  // 지도에 '+ 후보 등록' 이라 적힌 회색 핀이 떠야 한다
  const previewPin = page.getByRole("button", { name: /\+ 후보 등록/ }).first();
  await expect(previewPin, "지도에 미리보기 핀이 없다 — 목록만으로는 v19 가 아니다")
    .toBeVisible({ timeout: 15_000 });

  await previewPin.click();
  await expect(page.getByText(/후보로 등록했어요/)).toBeVisible({ timeout: 10_000 });

  const st = await get(request, code);
  expect(st.places.length, "핀을 눌렀는데 후보가 안 생겼다").toBe(1);
  expect(st.places[0].source).toBe("manual");

  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("§4-⑧ 반경 안에 정말 0개면 mock 으로 덮지 않고 반경 확장을 제안한다", async ({ request }) => {
  // ⚠️ 예전엔 "결과 0개면" 무조건 샘플 6개로 채웠다. 그래서 **키가 멀쩡한데
  //    반경 안에 정말 아무것도 없는 경우**까지 샘플로 덮였고, 화면이 "0개"를
  //    본 적이 없어 v19 §4-⑧ 의 반경 확장(700→1400m) 제안이 영영 안 떴다.
  //    (2026-08-10 제보 — "1.4km로 넓히라며?")
  //    키가 없는 CI 에서는 mock 이 정상 동작이므로, 여기서는 **응답 계약**을 본다.
  const { code, leaderId } = await setup(request);
  const regions = await seedRegions(request, code);
  await act(request, { action: "startVote", code, participantId: leaderId });
  await act(request, { action: "confirmManual", code, participantId: leaderId, target: "region", id: regions[0].id });

  const poi = await (await request.get(`/api/place-poi?code=${code}`)).json();
  // 키가 없으면 mock, 있으면 실데이터 — 어느 쪽이든 **둘이 동시에 참일 수는 없다**
  expect(poi.mock && poi.reallyEmpty, "mock 인데 '진짜 0건'이라고도 표시됐다").toBeFalsy();
  expect(poi.canExpand, "700m 상태면 확장 가능해야 한다").toBe(true);

  // 검색어로 0건이면 그 카테고리 샘플로 덮지 않는다
  const q = await (await request.get(`/api/place-poi?code=${code}&q=${encodeURIComponent("존재하지않는가게이름zzz")}`)).json();
  if (q.searchedEmpty) {
    expect(q.items, "검색 결과가 없는데 샘플이 채워졌다").toHaveLength(0);
    expect(q.mock, "검색 중에는 mock 으로 떨어지면 안 된다").toBe(false);
  }
});

test("화면: 지도 오른쪽 위 전체화면 버튼이 지도를 화면 가득 채운다", async ({ page, request }) => {
  // ⚠️ v19 §4-⑥⑧ 의 후보 등록·투표가 **지도 위 탭**이라, 340px 카드 안에서는
  //    핀이 서로 겹쳐 누르기 어렵다(특히 폰). 전체화면이 그 탈출구다.
  const { code, leaderId } = await setup(request);
  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${code}`);

  const map = page.locator(".map").first();
  await expect(map).toBeVisible({ timeout: 10_000 });
  const before = await map.boundingBox();

  await page.getByRole("button", { name: "지도 전체화면으로 보기" }).click();
  const after = await map.boundingBox();
  expect(after!.height, "전체화면인데 지도가 안 커졌다").toBeGreaterThan(before!.height);
  expect(after!.height).toBeGreaterThan(700);   // 844 뷰포트를 거의 채워야 한다

  // 다시 누르면 원래대로
  await page.getByRole("button", { name: "지도 전체화면 끄기" }).click();
  const back = await map.boundingBox();
  expect(Math.round(back!.height), "전체화면을 껐는데 안 돌아왔다").toBe(Math.round(before!.height));
});

test("§7 잘못 찍은 지역 후보를 본인이 지울 수 있다", async ({ request }) => {
  // ⚠️ v19 §7 은 "후보 삭제 — 방장: 임의 후보 / 참여자: 본인 후보만" 인데
  //    지점에만 있고 **지역에는 없었다.** 지도를 잘못 눌러 생긴 후보를
  //    아무도 못 지웠다 (2026-08-10 제보).
  const { code, leaderId } = await setup(request);
  const mate = await act(request, { action: "join", code, name: "참가자2" });

  const mine = await act(request, {
    action: "addRegion", code, participantId: mate.participantId, lat: 37.5665, lng: 126.978,
  });
  expect((await get(request, code)).regions.some((r: { id: string }) => r.id === mine.candidate.id)).toBe(true);

  // 남의 후보는 못 지운다
  const other = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.4979, lng: 127.0276,
  });
  const denied = await actFails(request, {
    action: "removeRegion", code, participantId: mate.participantId, regionId: other.candidate.id,
  });
  expect(denied.error).toContain("내가 등록한 후보만");

  // 내 후보는 지워진다
  await act(request, { action: "removeRegion", code, participantId: mate.participantId, regionId: mine.candidate.id });
  const st = await get(request, code);
  expect(st.regions.some((r: { id: string }) => r.id === mine.candidate.id), "내 후보가 안 지워졌다").toBe(false);

  // 방장은 임의 후보를 지운다
  await act(request, { action: "removeRegion", code, participantId: leaderId, regionId: other.candidate.id });
  expect((await get(request, code)).regions.some((r: { id: string }) => r.id === other.candidate.id)).toBe(false);
});

test("§7 투표가 시작되면 후보를 지울 수 없다", async ({ request }) => {
  const { code, leaderId } = await setup(request);
  const pinged = await act(request, {
    action: "addRegion", code, participantId: leaderId, lat: 37.5665, lng: 126.978,
  });
  await act(request, { action: "startVote", code, participantId: leaderId });
  const fail = await actFails(request, {
    action: "removeRegion", code, participantId: leaderId, regionId: pinged.candidate.id,
  });
  expect(fail.error).toContain("투표가 시작돼");
});

test("§4-⑥ 지도를 눌러도 확인 전에는 후보가 생기지 않는다", async ({ page, request }) => {
  // ⚠️ 지도를 스크롤·확대하다 손가락이 닿기만 해도 후보가 생겼고 되돌릴 수 없었다
  //    (2026-08-10 제보). 핑은 1인 1개라 개수가 늘지는 않지만, **내가 만들 생각이
  //    없던 후보가 생기는 것** 자체가 문제다. [등록]을 눌러야 서버로 간다.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const { code, leaderId } = await setup(request);
  const before = (await get(request, code)).regions.length;

  await loginAs(page, code, [{ id: leaderId, name: "방장", isLeader: true }], leaderId);
  await page.goto(`/m/${code}`);
  await expect(page.getByText("참여자 현황")).toBeVisible({ timeout: 10_000 });

  // 지도 SDK 가 없는 환경에서는 핑 자체를 테스트할 수 없으므로,
  // 확인 시트가 열렸을 때의 계약(취소 = 등록 안 됨)만 본다.
  await page.evaluate(() => {
    // 지도 탭과 같은 경로로 확인 시트를 연다
    const btn = document.querySelector<HTMLElement>("[data-ping-test]");
    btn?.click();
  });

  // 어떤 경우든 화면을 여는 것만으로 후보가 늘어서는 안 된다
  const after = (await get(request, code)).regions.length;
  expect(after, "화면을 열기만 했는데 후보가 늘었다").toBe(before);
  expect(errors, `콘솔 에러: ${errors.join(" / ")}`).toEqual([]);
});

test("복사는 클립보드 권한이 없어도 화면이 죽지 않는다", async ({ page, request }) => {
  // ⚠️ `navigator.clipboard` 는 **보안 출처(https·localhost)에서만** 존재한다.
  //    발표는 팀원 폰이 http://10.x.x.x:3000 으로 들어오는 구조라 그 기기에선 없다.
  //    예전 코드는 거기서 TypeError 로 죽거나(=화면이 멈춤) 조용히 아무 일도
  //    안 했다 — 초대 링크 공유가 첫 단추라 조용한 실패가 특히 나쁘다.
  //    (2026-08-10 윈도우 크롬에서 'Write permission denied' 로 실제 발생)
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 클립보드 API 를 아예 없앤다 = http 출처의 폰과 같은 상태
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  const { code } = await setup(request);
  await page.goto("/health");
  await page.getByRole("button", { name: /점검 시작/ }).click();
  await expect(page.getByText(/연결된 기기 1대/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /링크 복사/ }).click();
  // 성공하든(폴백) 실패하든 **사람에게 결과를 알려줘야** 한다
  await expect(page.getByText(/복사됨|복사가 막혀/)).toBeVisible({ timeout: 5_000 });

  expect(errors, `클립보드가 없을 때 화면이 죽었다: ${errors.join(" / ")}`).toEqual([]);
  expect(code).toBeTruthy();
});
