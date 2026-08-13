// POST /api/midpoint — 중간지점 추천
//  mode=dist : 거리 기반(동기, 외부 호출 없음)  — 기본
//  mode=time : ODsay(대중교통)/TMAP(자차) 실 이동시간 기반
//
// 시간 모드는 후보 거점 × 참가자 수만큼 외부 API를 호출하므로
// routing.ts 의 캐시를 그대로 타고, 키가 없거나 실패하면 거리 추정으로 폴백한다.
import { NextRequest, NextResponse } from "next/server";
import { recommendRegionsWithMeta } from "@/lib/routing";
import { recommendRegions as recommendByDist } from "@/lib/geo";
import { resolveHubPool } from "@/lib/hub-pool";
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

  // ── 후보 목록을 **한 번만** 구해 두 모드에 같이 넘긴다 ──
  //
  //  카카오 실제 지하철역 → 없으면 하드코딩 28곳 (`lib/hub-pool.ts`).
  //  💰 카카오 1콜(후보가 모자라면 반경을 넓혀 최대 2콜). 참가자 수와 무관하다.
  //
  //  ⚠️ 거리순도 이 후보를 쓴다. 예전엔 거리순만 하드코딩 목록을 봐서
  //     **노원+의정부 → 종로3가**(둘 다에게서 14.8km 멀어지는 방향)가 나왔다
  //     — 2026-08-06 CEO 실측. 실제 정답은 도봉산역(중심에서 0.9km)이었다.
  //  ⚠️ 두 모드가 같은 후보를 써야 한다. 토글은 *같은 후보의 다른 계산*이어야지,
  //     목록 자체가 바뀌면 사용자가 무엇이 달라졌는지 알 수 없다.
  const located = participants.filter((p) => p.lat != null && p.lng != null) as { lat: number; lng: number }[];
  const { pool } = await resolveHubPool(located);

  if (mode === "time") {
    // ⚠️ 예전에는 `live: has.odsay || has.tmap`, 즉 **키가 있는지**만 봤다.
    //    그러면 키를 넣는 순간 무조건 true 라, 프록시·터널이 죽어 전부 거리 추정으로
    //    떨어져도 화면에는 계속 "실 이동시간 기준"이 뜬다(2026-08-03 프로덕션 실측:
    //    실측 40분과 추정 894분이 한 목록에 섞였는데 전부 실시간으로 표시됐다).
    //    이제 **실제로 API 값을 받았는지**를 그대로 싣는다.
    const { items, live } = await recommendRegionsWithMeta(participants, pool);
    return NextResponse.json({ items, mode, live });
  }

  return NextResponse.json({ items: recommendByDist(participants, pool), mode, live: false });
}
