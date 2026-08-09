import { NextRequest, NextResponse } from "next/server";
import { hasDb, sanitizeDbError } from "@/lib/db";
import {
  createMeeting,
  joinMeeting,
  setOriginCoords,
  openChat,
  appendUserChat,
  confirmRegion,
  confirmPlace,
  reopenDiscussion,
  backToMain,
  reserve,
  castVote,
  setRegionCandidates,
  addRegionCandidate,
  setParticipantStatus,
  updatePrefs,
  getState,
  promoteToPlace,
  startVote,
  reopenStep,
} from "@/lib/store";
import { MAX_PARTICIPANTS, PURPOSE_LABELS } from "@/lib/types";
import type { PurposeCategory } from "@/lib/types";

/**
 * 요청 본문의 목적 카테고리를 좁은 타입으로. 모르는 값이면 null.
 * (`any` 를 쓰지 않고 unknown 을 가드로 좁힌다 — CLAUDE.md §3-3)
 */
function toPurposeCategory(v: unknown): PurposeCategory | null {
  return typeof v === "string" && v in PURPOSE_LABELS ? (v as PurposeCategory) : null;
}
import {
  resolveGeocode,
  recommendRegions,
  recommendPlaces,
  scoreRegionForParticipants,
} from "@/lib/routing";
import { runAiTurn } from "@/lib/ai";

// 인메모리 스토어를 쓰므로 항상 동적 처리 (캐시 금지)
export const dynamic = "force-dynamic";

/**
 * 예상 못 한 예외를 원인이 보이는 500 으로 바꾼다.
 *
 * `lib/persistence.ts` 는 쓰기 실패 시 throw 한다(`모임 저장 실패: …`).
 * 그런데 여기서 잡지 않으면 Next.js 기본 500 이 나가는데 **본문이 비어 있어서**
 * 화면에도 로그에도 원인이 안 남는다 — 릴리스 리뷰가 지적한 지점이다.
 * `DATABASE_URL` 이 설정돼 있으면 인메모리 폴백을 타지 않는 설계라(의도됨),
 * DB 가 끊기면 이 경로로 죽는다. 그때 "무엇이 왜 실패했는지"는 나와야 한다.
 *
 * ⚠️ 오류 메시지에 접속 주소가 섞일 수 있어 `sanitizeDbError` 로 비밀번호를 가린다.
 */
function serverError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const detail = sanitizeDbError(raw);
  console.error("[api/meeting]", detail); // 로그 관점 — 서버에도 남긴다
  return NextResponse.json(
    {
      error: "서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
      detail,
      hint: hasDb
        ? "DB 접속 문제일 수 있어요 — /api/status 의 db.ready 를 확인하세요."
        : undefined,
    },
    { status: 500 },
  );
}

// GET /api/meeting?code=XXXXXX  → 모임 상태 (채팅 포함, 1.8초 폴링 대상)
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ error: "code 필요" }, { status: 400 });
    const state = await getState(code);
    if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(state);
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/meeting  { action, ... }
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (e) {
    return serverError(e);
  }
}

async function handlePost(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const { action } = body ?? {};

  switch (action) {
    case "create": {
      // v2: 비밀번호 폐기 — 이름만 있으면 만들 수 있다(참여는 초대 링크로만).
      if (!body.name)
        return NextResponse.json({ error: "모임 이름을 입력하세요." }, { status: 400 });
      const { code, leaderId } = await createMeeting({
        name: String(body.name).trim(),
        password: String(body.password ?? ""),
        headcount: Number(body.headcount) || MAX_PARTICIPANTS,
        leaderName: String(body.leaderName || "방장").trim(),
        // ── v19 생성 폼 ──
        scope: body.scope === "region" ? "region" : "place",
        purposeCategory: toPurposeCategory(body.purposeCategory),
        meetTime: body.meetTime ? String(body.meetTime) : null,
        leaderTransport: body.transport === "car" ? "car" : "transit",
        leaderKakaoId: body.kakaoId ? String(body.kakaoId) : null,
      });
      return NextResponse.json({ ok: true, code, participantId: leaderId, isLeader: true });
    }
    case "join": {
      const r = await joinMeeting({
        code: String(body.code || "").toUpperCase(),
        name: String(body.name || "").trim(),
        headcount: Number(body.headcount) || 1,
        // ── v19 ── PIN 은 비로그인만, 로그인이면 kakaoId 로 식별한다 (v15)
        pin: body.pin ? String(body.pin) : null,
        kakaoId: body.kakaoId ? String(body.kakaoId) : null,
        transport: body.transport === "car" ? "car" : "transit",
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, code: String(body.code).toUpperCase(), participantId: r.participantId, isLeader: false });
    }
    // v5·v8: 투표 시작 = 후보 잠금. 후보 0개면 거부, 1개면 투표를 생략한다.
    case "startVote": {
      const r = await startVote({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, skipped: !!r.skipped, onlyCandidateId: r.onlyCandidateId ?? null });
    }
    // v10: reopen 사다리 — 누를 때마다 한 칸씩 되돌린다. 표는 유지된다.
    case "reopenStep": {
      const r = await reopenStep({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, step: r.step });
    }
    // v11: '지점도 정하기' 승격 — '지역까지' 모임을 '지점까지'로. 역방향 없음.
    case "promoteToPlace": {
      const r = await promoteToPlace({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    case "origin": {
      const origin = String(body.origin || "").trim();
      const transport = body.transport === "car" ? "car" : "transit";
      // 자동완성에서 정확히 고른 좌표가 있으면 그대로 쓴다 — 텍스트만 보내
      // resolveGeocode 가 다시 검색하면 사용자가 본 것과 다른 동명이인 결과를
      // 고를 수 있다(예: "성수역"이 실제로는 아파트 상가를 집는 경우).
      const hasCoord = typeof body.lat === "number" && typeof body.lng === "number";
      const coord = hasCoord ? { lat: body.lat, lng: body.lng } : await resolveGeocode(origin);
      const r = await setOriginCoords({
        code: body.code,
        participantId: body.participantId,
        origin,
        transport,
        lat: coord.lat,
        lng: coord.lng,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 거점 후보 계산 (단계 전환 없음) ──
    //  메인 화면에서 바로 거점 투표를 하기 위해, 출발지가 등록될 때마다
    //  클라이언트가 이 액션으로 후보를 갱신한다.
    case "regions": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (st.participants.filter((p: any) => p.lat != null).length === 0)
        return NextResponse.json({ ok: true, regions: [] });
      const regions = await recommendRegions(st.participants as any);
      const r = await setRegionCandidates(body.code, regions);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, regions });
    }

    // ── 후보 직접 등록 (방장 포함 누구나) ──
    //  자동 추천 3곳이 마음에 안 들 때의 탈출구. 지도 검색으로 고른 좌표를
    //  받아, 참가자 전원 기준 이동시간·편차를 계산해 후보에 올린다.
    case "addRegion": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p) => p.id === body.participantId);
      if (!me) return NextResponse.json({ error: "참가자를 찾을 수 없어요." }, { status: 400 });

      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "지역 이름이 비었어요." }, { status: 400 });

      // 좌표는 지도 검색 결과에서 그대로 받는다(없으면 이름으로 지오코딩)
      const hasCoord = typeof body.lat === "number" && typeof body.lng === "number";
      const hub = hasCoord ? { lat: body.lat as number, lng: body.lng as number } : await resolveGeocode(name);

      // 출발지를 등록한 사람이 아무도 없으면 이동시간을 계산할 수 없다 —
      // 그래도 후보로는 올릴 수 있게 0으로 두고, 출발지가 모이면 재계산된다.
      const { maxMin, devMin, perParticipant } = await scoreRegionForParticipants(
        hub,
        st.participants as never
      );
      const r = await addRegionCandidate({
        code: String(body.code || ""),
        name,
        lat: hub.lat,
        lng: hub.lng,
        maxMin,
        devMin,
        perParticipant,
        proposedBy: me.name,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, candidate: r.candidate, existing: r.existing ?? false });
    }

    // ── 투표 (모든 참가자, 1인 1표) ──
    //  집계만 한다. 마감은 피그마 설계대로 방장 확정(confirmManual)으로만 —
    //  전원 투표해도 자동으로 넘어가지 않는다.
    case "vote": {
      const r = await castVote({
        code: String(body.code || ""),
        participantId: String(body.participantId || ""),
        target: body.target === "place" ? "place" : "region",
        candidateId: body.candidateId ? String(body.candidateId) : null,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 모임 시간(확정용) 저장 — 피그마: 최종 확정 화면의 입력 ──
    case "meetTime": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p: any) => p.id === body.participantId);
      if (!me?.isLeader) return NextResponse.json({ error: "방장만 시간을 정할 수 있어요." }, { status: 400 });
      const r = await updatePrefs(String(body.code).toUpperCase(), { timeText: String(body.time || "").trim().slice(0, 40) });
      if (!r.ok) return NextResponse.json({ error: "저장 실패" }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 참가자 자가신고 도착 상태 — 본인 항목만 수정 가능(회의록) ──
    case "status": {
      const status = body.status === "green" || body.status === "yellow" || body.status === "red" ? body.status : null;
      const r = await setParticipantStatus({
        code: String(body.code || ""),
        participantId: String(body.participantId || ""),
        status,
        etaText: body.etaText !== undefined ? String(body.etaText ?? "") : undefined,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── AI 대화 시작 (Leader) — 실 이동시간 기반 지역 후보 계산 ──
    case "openChat": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const regions = await recommendRegions(st.participants as any);
      const r = await openChat({ code: body.code, participantId: body.participantId }, { regions });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 채팅 발화 (User) → AI가 백그라운드로 개입 판단 ──
    case "chat": {
      const r = await appendUserChat({
        code: body.code,
        participantId: body.participantId,
        text: String(body.text || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      // 응답을 막지 않도록 백그라운드 실행 (Vercel 배포 시 waitUntil로 교체)
      void runAiTurn(body.code);
      return NextResponse.json({ ok: true });
    }

    // ── 방장: AI에게 지금 결정 요청 (무응답·논의 정체 해소 = 타임아웃 대체) ──
    case "aiDecide": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p: any) => p.id === body.participantId);
      if (!me?.isLeader) return NextResponse.json({ error: "방장만 요청할 수 있어요." }, { status: 400 });
      void runAiTurn(body.code, { force: true });
      return NextResponse.json({ ok: true });
    }

    // ── 방장: 직접 확정 (AI 장애·논의 불능 시 안전망) ──
    case "confirmManual": {
      const st = await getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p: any) => p.id === body.participantId);
      if (!me?.isLeader) return NextResponse.json({ error: "방장만 확정할 수 있어요." }, { status: 400 });
      let r;
      if (body.target === "place") {
        r = await confirmPlace({ code: body.code, placeId: String(body.id), by: "leader" });
      } else {
        // 지역 수동 확정 시에도 실제 가게를 검색해 주입 (실패 시 mock 폴백)
        const region = st.regions.find((x: any) => x.id === String(body.id));
        const real = region
          ? await recommendPlaces(region.name, { lat: region.lat, lng: region.lng })
          : undefined;
        r = await confirmRegion(
          { code: body.code, regionId: String(body.id), by: "leader" },
          { places: real }
        );
      }
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 방장: 다시 논의 (지역/장소 되돌리기) ──
    case "reopen": {
      let opts: { regions?: any } | undefined;
      if (body.target === "region") {
        const st = await getState(body.code);
        if (st) opts = { regions: await recommendRegions(st.participants as any) };
      }
      const r = await reopenDiscussion(
        { code: body.code, participantId: body.participantId, target: body.target === "place" ? "place" : "region" },
        opts
      );
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 방장: 처음으로 ──
    case "backToMain": {
      const r = await backToMain({ code: body.code, participantId: body.participantId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    case "reserve": {
      const r = await reserve({ code: body.code, participantId: body.participantId, placeId: body.placeId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
