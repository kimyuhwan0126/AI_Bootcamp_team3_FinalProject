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
  addPlaceCandidate,
  removePlaceCandidate,
  expandRadius,
  recoverParticipant,
  kickParticipant,
  deleteMeeting,
  setMeetTime,
  recreateMeeting,
  applyAiCandidates,
  getMeeting,
  setAiBusy,
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
  scoreRegionForParticipants,
} from "@/lib/routing";
import { runAiTurn } from "@/lib/ai";
import { coord2RegionKakao } from "@/lib/kakao";
import { aiRegionVote, aiPlaceVote } from "@/lib/ai-vote";

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
    // v15·v16: 이름 + PIN 으로 자기 자리 되찾기 (비로그인 전용 · 5회 제한)
    case "recover": {
      const r = await recoverParticipant({
        code: String(body.code || "").toUpperCase(),
        name: String(body.name || "").trim(),
        pin: String(body.pin || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({
        ok: true,
        code: String(body.code).toUpperCase(),
        participantId: r.participantId,
        isLeader: !!r.isLeader,
      });
    }
    // v10: 방장 강퇴 — 그 사람 핑·표 삭제, 재참여는 허용
    case "kick": {
      const r = await kickParticipant({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
        targetId: String(body.targetId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    // v10: 방장 모임 삭제 — 확인 팝업은 화면이 띄운다
    case "deleteMeeting": {
      const r = await deleteMeeting({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    // v7·v10: 지점 후보 등록 — 전원 가능 · 상한 없음 · 반경 밖은 서버가 거부
    case "addPlace": {
      const r = await addPlaceCandidate({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
        place: {
          name: String(body.name || "").trim(),
          category: String(body.category || "장소"),
          emoji: body.emoji ? String(body.emoji) : undefined,
          lat: Number(body.lat),
          lng: Number(body.lng),
          rating: Number(body.rating) || 0,
          url: body.url ? String(body.url) : undefined,
        },
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, candidate: r.candidate, existing: !!r.existing });
    }
    // v7: 방장은 임의 후보, 본인은 자기 후보만 삭제
    case "removePlace": {
      const r = await removePlaceCandidate({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
        placeId: String(body.placeId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    // v15: 반경 확장 700→1400m · 1회 한정 · 누구나 · 전체 공유
    case "expandRadius": {
      const r = await expandRadius({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, radiusM: r.radiusM });
    }
    // ── v19 §8: AI 추천 — **방장 opt-in 버튼 하나뿐. 안 누르면 0원.** ──
    //  💰 Ollama Cloud(GLM 5.2) 호출이다. NEXT_PUBLIC_FF_AI_VOTE=1 일 때만 열린다.
    //  후보 등록 단계에서만 되고(v8), 재호출은 무제한이되 교체/추가를 고른다(v14).
    case "aiRecommend": {
      if (process.env.NEXT_PUBLIC_FF_AI_VOTE !== "1")
        return NextResponse.json({ error: "AI 추천이 꺼져 있어요 (NEXT_PUBLIC_FF_AI_VOTE=1)." }, { status: 403 });

      const code = String(body.code || "").toUpperCase();
      const participantId = String(body.participantId || "");
      const mode: "replace" | "append" = body.mode === "append" ? "append" : "replace";

      const m = await getMeeting(code);
      if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const leader = m.participants.find((p) => p.id === participantId);
      if (!leader?.isLeader)
        return NextResponse.json({ error: "AI 추천은 방장만 쓸 수 있어요." }, { status: 400 });

      const wantRegion = m.stage === "main" && m.aiPhase === "region";
      const wantPlace = m.aiPhase === "place" && !m.placeVoteOpen;
      if (!wantRegion && !wantPlace)
        return NextResponse.json({ error: "후보 등록 단계에서만 AI 추천을 쓸 수 있어요." }, { status: 400 });

      // 로딩 표시는 방장 화면에만 뜬다 — aiBusy 는 폴링으로 전원에게 가지만
      // 화면이 `isLeader` 일 때만 그린다 (v19 §8).
      setAiBusy(code, true);
      try {
        const purposeText = m.purposeCategory ? PURPOSE_LABELS[m.purposeCategory] : (m.prefs.purpose ?? "");
        if (wantRegion) {
          const r = await aiRegionVote(code, m.participants, purposeText, false, true /* ECO 원콜 */);
          if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
          // v9: 실패하면 토스트 + 재시도다. 강등 결과를 후보로 밀어 넣지 않는다 —
          //     "AI 가 골라줬다"고 말할 수 없는 것을 AI 후보로 앉히면 거짓말이 된다.
          if (r.degraded)
            return NextResponse.json({ error: "AI 추천에 실패했어요. 다시 시도하거나 직접 후보를 등록해 주세요." }, { status: 502 });
          const applied = await applyAiCandidates({ code, participantId, mode, regions: r.items.slice(0, 3) });
          if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 });
          return NextResponse.json({ ...applied, ms: r.ms });
        }
        const region = m.regions.find((x) => x.id === m.winnerRegionId);
        if (!region) return NextResponse.json({ error: "확정된 지역이 없어요." }, { status: 400 });
        const r = await aiPlaceVote(code, { name: region.name, lat: region.lat, lng: region.lng }, purposeText, m.participants.length, false, true);
        if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
        if (r.degraded)
          return NextResponse.json({ error: "AI 추천에 실패했어요. 다시 시도하거나 직접 후보를 등록해 주세요." }, { status: 502 });
        const applied = await applyAiCandidates({ code, participantId, mode, places: r.places.slice(0, 3) });
        if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 });
        return NextResponse.json({ ...applied, ms: r.ms });
      } finally {
        // v17: 실행이 끝나면(성공·실패·취소 무관) 반드시 로딩을 내린다
        setAiBusy(code, false);
      }
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

      // ── v19 §4-⑥ 지도 핑 ──
      //  이름 없이 좌표만 오면(=지도를 탭한 경우) **동으로 스냅**한다.
      //  같은 동은 하나로 병합돼야 해서(v4), 좌표 그대로 두면 3m 옆에 찍은 핑이
      //  서로 다른 후보가 되고 투표가 갈라진다.
      //  ⚠️ 스냅 실패(키 없음·API 오류)는 정상 경로다 — **좌표 기반 이름으로 폴백**한다(v4).
      const hasCoord = typeof body.lat === "number" && typeof body.lng === "number";
      let name = String(body.name || "").trim();
      let hub: { lat: number; lng: number };

      if (!name && hasCoord) {
        const snapped = await coord2RegionKakao({ lat: body.lat as number, lng: body.lng as number });
        if (snapped) {
          name = snapped.name;
          hub = { lat: snapped.lat, lng: snapped.lng };
        } else {
          // 폴백: 좌표를 소수 3자리로 끊어 이름을 만든다 —
          // 같은 자리를 두 번 찍으면 같은 이름이 나와 병합 규칙이 그대로 산다.
          const la = (body.lat as number).toFixed(3);
          const ln = (body.lng as number).toFixed(3);
          name = `지도 ${la}, ${ln}`;
          hub = { lat: body.lat as number, lng: body.lng as number };
        }
      } else {
        if (!name) return NextResponse.json({ error: "지역 이름이 비었어요." }, { status: 400 });
        // 좌표는 지도 검색 결과에서 그대로 받는다(없으면 이름으로 지오코딩)
        hub = hasCoord ? { lat: body.lat as number, lng: body.lng as number } : await resolveGeocode(name);
      }

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
        // v4: 핑은 인원당 1개 — 누가 찍었는지 알아야 병합·이동·이탈이 계산된다
        participantId: me.id,
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

    // ── v2·v16: 모임 시간 — 생성 폼 입력이 원칙이고 여기선 변경만. 과거 불가. ──
    //  `time` 은 사람이 쓴 자유 문구(예: "이번 주 토요일 저녁 7시")라 표시용으로만 남기고,
    //  실제 판정(D-day · 신호등 당일 · 지난 모임)은 ISO 값 `meetTime` 이 맡는다.
    case "meetTime": {
      const r = await setMeetTime({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
        meetTime: body.meetTime ? String(body.meetTime) : null,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      // 자유 문구도 같이 왔으면 표시용으로 보관한다 (기존 동작 유지)
      if (body.time !== undefined) {
        await updatePrefs(String(body.code).toUpperCase(), {
          timeText: String(body.time || "").trim().slice(0, 40),
        });
      }
      return NextResponse.json({ ok: true, meetTime: r.meetTime });
    }

    // ── v18: '이 멤버로 재모임 만들기' — 방장만. 로그인 멤버만 자동 이전(v17) ──
    case "recreate": {
      const r = await recreateMeeting({
        code: String(body.code || "").toUpperCase(),
        participantId: String(body.participantId || ""),
        name: body.name ? String(body.name) : undefined,
        meetTime: body.meetTime ? String(body.meetTime) : null,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, code: r.code, participantId: r.leaderId, carried: r.carried });
    }

    // ── 참가자 자가신고 도착 상태 — 본인 항목만 수정 가능(회의록) ──
    case "status": {
      const status = body.status === "green" || body.status === "yellow" || body.status === "red" ? body.status : null;
      const r = await setParticipantStatus({
        code: String(body.code || ""),
        participantId: String(body.participantId || ""),
        status,
        etaText: body.etaText !== undefined ? String(body.etaText ?? "") : undefined,
        lateMin: body.lateMin !== undefined ? Number(body.lateMin) : undefined,
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
        // ⚠️ v19 §4-⑧: 지역을 확정해도 **지점 후보를 미리 주입하지 않는다.**
        //    후보는 사람이 미리보기 핀을 탭해서 만든다(`addPlace`) — 미리 담아두면
        //    "후보 0개면 투표 시작 불가"(v8) 규칙이 영영 안 걸린다.
        //    미리보기 목록은 `/api/place-poi` 가 따로 내려준다.
        //    (AI 지점 추천만 예외적으로 후보를 공급한다 — 방장 버튼)
        r = await confirmRegion({ code: body.code, regionId: String(body.id), by: "leader" });
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
