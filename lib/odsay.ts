// ─────────────────────────────────────────────────────────────
// odsay.ts — ODsay 대중교통 길찾기(searchPubTransPathT)
// 서버 키는 호출 IP 화이트리스트 등록 필요(lab.odsay.com).
// 키 없거나 오류 시 null → 상위에서 mock 폴백.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";
import type { Coord } from "./kakao";

export interface TransitResult {
  min: number;       // 총 이동시간(분)
  transfers: number; // 환승 횟수
  fare: number;      // 요금(원)
  walkM: number;     // 총 도보(m)
}

export async function transitRouteOdsay(from: Coord, to: Coord): Promise<TransitResult | null> {
  if (!env.odsay) return null;
  try {
    const p = new URLSearchParams({
      SX: String(from.lng),
      SY: String(from.lat),
      EX: String(to.lng),
      EY: String(to.lat),
      apiKey: env.odsay, // URLSearchParams가 인코딩 처리
    });
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const path = d?.result?.path?.[0];
    const info = path?.info;
    if (!info) return null;
    return {
      min: Math.round(info.totalTime),
      transfers: Math.max(0, (path.subPathCount ?? 1) - 1),
      fare: info.payment ?? 0,
      walkM: info.totalWalk ?? 0,
    };
  } catch {
    return null;
  }
}
