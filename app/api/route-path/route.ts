// POST /api/route-path — 각 출발지 → 목적지 경로 좌표열
//  자차(car)   : TMAP routes 의 LineString geometry
//  대중교통     : ODsay searchPubTransPathT → loadLane 2단계로 폴리라인 획득
//  둘 다 실패하거나 키가 없으면 직선으로 내려보내고 real=false 로 표시한다
//  (가짜 경로를 실제인 것처럼 그리지 않기 위함).
import { NextRequest, NextResponse } from "next/server";
import { carPathTmap } from "@/lib/tmap";
import { transitPathOdsay } from "@/lib/odsay";
import { FLAGS } from "@/lib/flags";
import type { Coord } from "@/lib/kakao";

export const dynamic = "force-dynamic";

// ── 좌표쌍별 경로 캐시 ──────────────────────────────────────
// ODsay 무료 한도는 1,000회/일인데 대중교통 경로 1건당 2회(경로검색+loadLane)
// 를 쓴다. 화면을 다시 열 때마다 재호출하면 개발 중에도 금방 소진되므로
// 성공한 결과만 캐시한다(직선 폴백은 캐시하지 않는다).
const pathCache = new Map<string, Coord[]>();
const key = (a: Coord, b: Coord, t: string) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${t}`;

export interface RoutePath {
  id: string;
  points: Coord[];
  /** 실제 도로를 따라간 좌표인지(true), 직선 근사인지(false) */
  real: boolean;
}

interface Req {
  dest?: Coord;
  origins?: { id: string; lat: number; lng: number; transport?: string }[];
}

export async function POST(req: NextRequest) {
  let body: Req;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 });
  }

  const dest = body.dest;
  const origins = Array.isArray(body.origins) ? body.origins : [];
  if (!dest || origins.length === 0) return NextResponse.json({ paths: [] });

  const paths: RoutePath[] = await Promise.all(
    origins.map(async (o) => {
      const from: Coord = { lat: o.lat, lng: o.lng };
      const t = o.transport === "car" ? "car" : "transit";
      const k = key(from, dest, t);

      // 진단 모드에서는 캐시를 건너뛴다 — 이 캐시엔 TTL 이 없어서 한 번 성공하면
      // 서버 재시작 전까지 같은 좌표열만 돌아온다(실측 중 값이 안 바뀌어 보인다).
      const hit = FLAGS.odsayProbe ? undefined : pathCache.get(k);
      if (hit) return { id: o.id, points: hit, real: true };

      const pts = t === "car" ? await carPathTmap(from, dest) : await transitPathOdsay(from, dest);
      if (pts) {
        if (!FLAGS.odsayProbe) pathCache.set(k, pts);
        return { id: o.id, points: pts, real: true };
      }
      // 키 없음 / API 실패 — 직선 근사임을 real=false 로 알린다 (캐시하지 않음)
      return { id: o.id, points: [from, dest], real: false };
    })
  );

  return NextResponse.json({ paths });
}
