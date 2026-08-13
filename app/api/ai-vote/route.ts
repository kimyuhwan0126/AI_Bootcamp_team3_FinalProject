// ─────────────────────────────────────────────────────────────
// /api/ai-vote — AI 투표지 생성 (지역 1차 · 가게 2차)
//
//  플래그: NEXT_PUBLIC_FF_AI_VOTE=1 일 때만 동작 (팀 규칙: 만드는 중인 기능은 플래그 뒤에).
//  ⚠️ lib/flags.ts 는 🔒 통합 담당자 소유라 여기서 직접 env 를 읽는다 — 통합 시 FLAGS 로 이동 요청.
//
//  GET ?stage=region&code=모임코드[&purpose=자유텍스트][&people=JSON][&force_fail=1]
//  GET ?stage=place&name=지역명&lat=..&lng=..[&purpose=..][&headcount=4][&force_fail=1]
//   · people: 모임 없이 디버깅할 때 [{name,origin,lat,lng,transport}] 를 직접 넣는다
//   · 확정 지역은 좌표 필수 — 이름만 오면 400 (동명 사고 방지, 하네스 V9 실측)
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import type { Participant } from "@/lib/types";
import { getMeeting } from "@/lib/store";
import { aiRegionVote, aiPlaceVote } from "@/lib/ai-vote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function parsePeople(raw: string): Participant[] | null {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.map((x, i) => {
      const o = x as { name?: string; origin?: string; lat?: number; lng?: number; transport?: string };
      return { id: `dbg${i + 1}`, name: o.name ?? `참가자${i + 1}`, isLeader: i === 0, headcount: 1,
        origin: o.origin ?? o.name ?? null, lat: o.lat ?? null, lng: o.lng ?? null,
        transport: o.transport === "car" ? "car" : "transit", status: null, etaText: null } as Participant;
    });
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_FF_AI_VOTE !== "1") return bad("NEXT_PUBLIC_FF_AI_VOTE=1 로 켜야 한다", 403);
  const q = req.nextUrl.searchParams;
  const stage = q.get("stage");
  const purpose = q.get("purpose") ?? "";
  const forceFail = q.get("force_fail") === "1";
  const eco = q.get("eco") === "1" || process.env.AI_VOTE_ECO === "1";

  if (stage === "region") {
    let people: Participant[] | null = null;
    let lockKey = "debug";
    const code = q.get("code");
    if (code) {
      const m = await getMeeting(code);
      if (!m) return bad(`모임 없음: ${code}`, 404);
      people = m.participants; lockKey = code;
    } else if (q.get("people")) {
      people = parsePeople(q.get("people")!);
      if (!people) return bad("people JSON 파싱 실패");
    } else return bad("code 또는 people 이 필요하다");
    const r = await aiRegionVote(lockKey, people, purpose, forceFail, eco);
    return NextResponse.json(r, { status: "error" in r && !("stage" in r) ? ("busy" in r ? 409 : 422) : 200 });
  }

  if (stage === "place") {
    const name = q.get("name") ?? "";
    if (!name) return bad("name 이 필요하다");
    // ⚠️ Number(null)===0 — 파라미터 부재가 (0,0) 좌표로 둔갑해 널 아일랜드에서 검색이 돌았다(실측).
    const latS = q.get("lat"), lngS = q.get("lng");
    const lat = latS == null || latS === "" ? NaN : Number(latS);
    const lng = lngS == null || lngS === "" ? NaN : Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) < 1 || Math.abs(lng) < 1)
      return bad("lat/lng 좌표가 필요하다 — 이름만으로는 받지 않는다(동명 사고 방지)");
    const headcount = Math.max(1, Number(q.get("headcount") ?? 4) || 4);
    const r = await aiPlaceVote(`${name}:${lat.toFixed(3)}`, { name, lat, lng }, purpose, headcount, forceFail, eco);
    return NextResponse.json(r, { status: "error" in r && !("stage" in r) ? ("busy" in r ? 409 : 422) : 200 });
  }

  return bad("stage=region | place 가 필요하다");
}
