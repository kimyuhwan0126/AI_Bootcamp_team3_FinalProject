import { NextRequest, NextResponse } from "next/server";
import { seedScenario } from "@/lib/debug";
import { SCENARIOS } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

// 운영(production) 빌드에서는 완전 비활성화
function blocked() {
  // ⚠️ `!process.env.ENABLE_DEBUG` 로 쓰면 안 된다 — 값이 아니라 "존재"만 보므로
  //    `ENABLE_DEBUG=0` 도 문자열 "0"(truthy)이라 잠금이 풀린다. 끈 줄 알았는데
  //    열려 있는 상태가 되므로, 정확히 "1" 일 때만 연다.
  return process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG !== "1";
}

// GET /api/debug → 시나리오 목록
export async function GET() {
  if (blocked()) return NextResponse.json({ error: "disabled" }, { status: 403 });
  return NextResponse.json({ scenarios: SCENARIOS });
}

// POST /api/debug { scenario } → 해당 상태로 시드된 모임 생성
export async function POST(req: NextRequest) {
  if (blocked()) return NextResponse.json({ error: "disabled" }, { status: 403 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const result = await seedScenario(String(body?.scenario || ""));
  if (!result) return NextResponse.json({ error: "unknown_scenario" }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
