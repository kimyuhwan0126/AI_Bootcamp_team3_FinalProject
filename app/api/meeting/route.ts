import { NextRequest, NextResponse } from "next/server";
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
  setParticipantStatus,
  updatePrefs,
  getState,
} from "@/lib/store";
import { resolveGeocode, recommendRegions, recommendPlaces } from "@/lib/routing";
import { runAiTurn } from "@/lib/ai";

// 인메모리 스토어를 쓰므로 항상 동적 처리 (캐시 금지)
export const dynamic = "force-dynamic";

// GET /api/meeting?code=XXXXXX  → 모임 상태 (채팅 포함, 1.8초 폴링 대상)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code 필요" }, { status: 400 });
  const state = await getState(code);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(state);
}

// POST /api/meeting  { action, ... }
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const { action } = body ?? {};

  switch (action) {
    case "create": {
      if (!body.name || !body.password)
        return NextResponse.json({ error: "모임이름과 비밀번호를 입력하세요." }, { status: 400 });
      const { code, leaderId } = await createMeeting({
        name: String(body.name).trim(),
        password: String(body.password),
        headcount: Number(body.headcount) || 4,
        leaderName: String(body.leaderName || "방장").trim(),
      });
      return NextResponse.json({ ok: true, code, participantId: leaderId, isLeader: true });
    }
    case "join": {
      const r = await joinMeeting({
        code: String(body.code || "").toUpperCase(),
        password: String(body.password || ""),
        name: String(body.name || "").trim(),
        headcount: Number(body.headcount) || 1,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, code: String(body.code).toUpperCase(), participantId: r.participantId, isLeader: false });
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
