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
  const state = getState(code);
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
      const { code, leaderId } = createMeeting({
        name: String(body.name).trim(),
        password: String(body.password),
        headcount: Number(body.headcount) || 4,
        leaderName: String(body.leaderName || "방장").trim(),
      });
      return NextResponse.json({ ok: true, code, participantId: leaderId, isLeader: true });
    }
    case "join": {
      const r = joinMeeting({
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
      const coord = await resolveGeocode(origin);
      const r = setOriginCoords({
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

    // ── AI 대화 시작 (Leader) — 실 이동시간 기반 지역 후보 계산 ──
    case "openChat": {
      const st = getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const regions = await recommendRegions(st.participants as any);
      const r = openChat({ code: body.code, participantId: body.participantId }, { regions });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 채팅 발화 (User) → AI가 백그라운드로 개입 판단 ──
    case "chat": {
      const r = appendUserChat({
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
      const st = getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p: any) => p.id === body.participantId);
      if (!me?.isLeader) return NextResponse.json({ error: "방장만 요청할 수 있어요." }, { status: 400 });
      void runAiTurn(body.code, { force: true });
      return NextResponse.json({ ok: true });
    }

    // ── 방장: 직접 확정 (AI 장애·논의 불능 시 안전망) ──
    case "confirmManual": {
      const st = getState(body.code);
      if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const me = st.participants.find((p: any) => p.id === body.participantId);
      if (!me?.isLeader) return NextResponse.json({ error: "방장만 확정할 수 있어요." }, { status: 400 });
      let r;
      if (body.target === "place") {
        r = confirmPlace({ code: body.code, placeId: String(body.id), by: "leader" });
      } else {
        // 지역 수동 확정 시에도 실제 가게를 검색해 주입 (실패 시 mock 폴백)
        const region = st.regions.find((x: any) => x.id === String(body.id));
        const real = region
          ? await recommendPlaces(region.name, { lat: region.lat, lng: region.lng })
          : undefined;
        r = confirmRegion(
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
        const st = getState(body.code);
        if (st) opts = { regions: await recommendRegions(st.participants as any) };
      }
      const r = reopenDiscussion(
        { code: body.code, participantId: body.participantId, target: body.target === "place" ? "place" : "region" },
        opts
      );
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ── 방장: 처음으로 ──
    case "backToMain": {
      const r = backToMain({ code: body.code, participantId: body.participantId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    case "reserve": {
      const r = reserve({ code: body.code, participantId: body.participantId, placeId: body.placeId });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
