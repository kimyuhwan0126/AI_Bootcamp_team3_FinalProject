import { NextRequest, NextResponse } from "next/server";
import { seedScenario } from "@/lib/debug";
import { SCENARIOS } from "@/lib/scenarios";

export const dynamic = "force-dynamic";

// 운영(production) 빌드에서는 완전 비활성화
function blocked() {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEBUG;
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
  const result = seedScenario(String(body?.scenario || ""));
  if (!result) return NextResponse.json({ error: "unknown_scenario" }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
