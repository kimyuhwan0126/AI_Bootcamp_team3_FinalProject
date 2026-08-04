// POST /api/midpoint — 중간지점 추천
//  mode=dist : 거리 기반(동기, 외부 호출 없음)  — 기본
//  mode=time : ODsay(대중교통)/TMAP(자차) 실 이동시간 기반
//
// 시간 모드는 후보 거점 × 참가자 수만큼 외부 API를 호출하므로
// routing.ts 의 캐시를 그대로 타고, 키가 없거나 실패하면 거리 추정으로 폴백한다.
import { NextRequest, NextResponse } from "next/server";
import { recommendRegionsWithMeta } from "@/lib/routing";
import { recommendRegions as recommendByDist } from "@/lib/geo";
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
    // ⚠️ 예전에는 `live: has.odsay || has.tmap`, 즉 **키가 있는지**만 봤다.
    //    그러면 키를 넣는 순간 무조건 true 라, 프록시·터널이 죽어 전부 거리 추정으로
    //    떨어져도 화면에는 계속 "실 이동시간 기준"이 뜬다(2026-08-03 프로덕션 실측:
    //    실측 40분과 추정 894분이 한 목록에 섞였는데 전부 실시간으로 표시됐다).
    //    이제 **실제로 API 값을 받았는지**를 그대로 싣는다.
    const { items, live } = await recommendRegionsWithMeta(participants);
    return NextResponse.json({ items, mode, live });
  }

  return NextResponse.json({ items: recommendByDist(participants), mode, live: false });
}
