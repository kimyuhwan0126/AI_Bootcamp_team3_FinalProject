import { NextResponse } from "next/server";
import { env, has } from "@/lib/env";
import { geocodeKakao } from "@/lib/kakao";
import { transitRouteOdsay } from "@/lib/odsay";
import { carRouteTmap } from "@/lib/tmap";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 개발 전용: 각 외부 API를 실제 호출해 상태코드/응답 앞부분을 그대로 반환(키는 노출 안 함)
function blocked() {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEBUG;
}

async function probe(label: string, url: string, opts?: RequestInit) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, opts);
    const body = await r.text();
    return { label, ok: r.ok, status: r.status, ms: Date.now() - t0, body: body.slice(0, 600) };
  } catch (e: any) {
    return { label, ok: false, error: String(e?.message || e), ms: Date.now() - t0 };
  }
}

export async function GET(req: Request) {
  if (blocked()) return NextResponse.json({ error: "disabled" }, { status: 403 });

  // ?q=... → 특정 검색어의 카카오 첫 결과 + 우리 파서 결과 비교
  const q = new URL(req.url).searchParams.get("q");
  if (q) {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`,
      { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } }
    );
    const d = await r.json();
    const docs = (d.documents || []).map((x: any) => ({
      name: x.place_name,
      cat: x.category_group_code,
      catName: x.category_name,
      lat: parseFloat(x.y),
      lng: parseFloat(x.x),
    }));
    return NextResponse.json({ q, top5: docs, ourParser: await geocodeKakao(q) });
  }

  // 샘플: 강남역 → 홍대입구
  const from = { lat: 37.4979, lng: 127.0276 };
  const to = { lat: 37.5572, lng: 126.9245 };

  const out: any = { has };

  // ── Neon: 테이블 3개가 실제로 읽히는지 각각 확인 ──
  //  URL만 있고 schema.sql 을 안 돌렸으면 여기서 드러난다.
  if (!db) {
    out.db = { configured: false, note: "DATABASE_URL 없음 — 인메모리 스토어로 동작 중" };
  } else {
    const tables = ["meetings", "participants", "votes"] as const;
    const checks: Record<string, { ok: boolean; error?: string }> = {};
    for (const t of tables) {
      try {
        // 테이블명은 파라미터로 못 넘긴다 — 위 상수 목록만 돌므로 주입 위험 없음
        await db.query(`select * from ${t} limit 1`);
        checks[t] = { ok: true };
      } catch (e) {
        checks[t] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    const allOk = Object.values(checks).every((c) => c.ok);
    out.db = {
      configured: true,
      tables: checks,
      ready: allOk,
      note: allOk ? "정상" : "db/schema.sql 을 Neon SQL Editor 에서 실행했는지 확인하세요.",
    };
  }

  // 키 위생 점검 — 길이와 공백 유무만. 키 조각도 내보내지 않는다
  //  (예전엔 앞 2자·뒤 2자를 실었는데, 주석의 '값 노출 X' 와 어긋났다)
  out.odsayKeyInfo = {
    len: env.odsay.length,
    trimmedLen: env.odsay.trim().length,
    hasWhitespace: /\s/.test(env.odsay),

  };

  out.kakao = has.kakaoGeocode
    ? await probe(
        "kakao-local",
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent("강남역")}&size=1`,
        { headers: { Authorization: `KakaoAK ${env.kakaoRest}` } }
      )
    : "키 없음";

  out.odsay = has.odsay
    ? await probe(
        "odsay-transit",
        `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${from.lng}&SY=${from.lat}&EX=${to.lng}&EY=${to.lat}&apiKey=${encodeURIComponent(env.odsay)}`
      )
    : "키 없음";

  out.tmap = has.tmap
    ? await probe("tmap-routes", "https://apis.openapi.sk.com/tmap/routes?version=1&format=json", {
        method: "POST",
        headers: { appKey: env.tmap, "Content-Type": "application/json" },
        body: JSON.stringify({
          startX: from.lng,
          startY: from.lat,
          endX: to.lng,
          endY: to.lat,
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
        }),
      })
    : "키 없음";

  // 우리 lib 파서로 실제 파싱되는지 확인
  out.parsed = {
    geocode: await geocodeKakao("역삼동 강남파이낸스센터").catch((e) => String(e)),
    transit: await transitRouteOdsay(from, to).catch((e) => String(e)),
    car: await carRouteTmap(from, to).catch((e) => String(e)),
  };

  // 호출 서버 공인 IP (ODsay 화이트리스트 등록용)
  try {
    const ipr = await fetch("https://api.ipify.org?format=json");
    out.callerIP = (await ipr.json()).ip;
  } catch {
    out.callerIP = "확인 실패";
  }

  return NextResponse.json(out);
}
