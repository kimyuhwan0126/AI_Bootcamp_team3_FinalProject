import { NextRequest, NextResponse } from "next/server";
import { readTrace, aiInfo } from "@/lib/ai";

export const dynamic = "force-dynamic";

// 운영(production) 빌드에서는 비활성화 (디버그 라우트와 동일 정책)
function blocked() {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEBUG;
}

// GET /api/ai-trace?n=50 → 최근 AI 추적 이벤트 (llm_call / tool_exec / silent / failover)
export async function GET(req: NextRequest) {
  if (blocked()) return NextResponse.json({ error: "disabled" }, { status: 403 });
  const n = Math.min(500, Number(req.nextUrl.searchParams.get("n")) || 50);
  return NextResponse.json({ config: aiInfo(), events: readTrace(n) });
}
