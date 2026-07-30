// POST /api/midpoint — 중간지점 추천
//  mode=dist : 거리 기반(동기, 외부 호출 없음)  — 기본
//  mode=time : ODsay(대중교통)/TMAP(자차) 실 이동시간 기반
//
// 시간 모드는 후보 거점 × 참가자 수만큼 외부 API를 호출하므로
// routing.ts 의 캐시를 그대로 타고, 키가 없거나 실패하면 거리 추정으로 폴백한다.
import { NextRequest, NextResponse } from "next/server";
import { recommendRegions as recommendByTime } from "@/lib/routing";
import { recommendRegions as recommendByDist } from "@/lib/geo";
import { has } from "@/lib/env";
import type { Participant } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { participants?: Participant[]; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }

  const participants = Array.isArray(body.participants) ? body.participants : [];
  if (participants.length < 2) {
    return NextResponse.json({ items: [], mode: "dist", live: false });
  }

  const mode = body.mode === "time" ? "time" : "dist";

  if (mode === "time") {
    const items = await recommendByTime(participants);
    // 실 API 키가 하나라도 있으면 live (없으면 내부적으로 거리 추정으로 폴백됨)
    return NextResponse.json({ items, mode, live: has.odsay || has.tmap });
  }

  return NextResponse.json({ items: recommendByDist(participants), mode, live: false });
}
