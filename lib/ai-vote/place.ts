// ─────────────────────────────────────────────────────────────
// ai-vote/place.ts — 2차: 가게 투표지 3곳 (확정 지역 "좌표" 입력 — 이름 재검색 금지)
//
//  검증 근거(하네스 V 시리즈):
//   · 확정 지역은 좌표로 받는다 — 이름 재검색은 동명 사고를 되들여온다(③, V9 실측)
//   · 상권 밀도 사전 조사 결과(목록)를 GLM 에게 준다 — 안 주면 검색 난사/유일 후보 누락(V6·V7)
//   · 검색 상한 15 · 도보 상한 18 · 마지막 턴 도구 차단 — 상권 0 지역 폭주 방지(V6→V8: 21초)
//   · 미달이면 있는 만큼만 + notes — 억지로 채우지 않는다(V4·V8)
// ─────────────────────────────────────────────────────────────
import type { PlaceCandidate } from "../types";
import { webSearch, webRouteRetry, isRouteError, hav, type WebPlace } from "./api-kakao";
import { glmChat, extractJson, newUsage, type Profile, type ToolSpec, type Usage } from "./glm";

const FIND_CAP = 15;
const WALK_CAP = 18;
const MAXT = 10;

export interface PlaceSheet { places: PlaceCandidate[]; live: boolean; notes: string; density: number; glmTokens: Usage }

export async function generatePlaceSheet(
  region: { name: string; lat: number; lng: number },
  profile: Profile, headcount: number, eco = false
): Promise<PlaceSheet> {
  const glmTokens = newUsage();
  // 주소(시도)는 보충 검색으로만 얻는다 — 좌표는 절대 덮지 않는다
  const near2 = (await webSearch(region.name)).places.filter((p) => hav(region, p) <= 2);
  const sido = (near2.find((p) => p.name.includes(region.name)) ?? near2[0])?.address.split(" ")[0] ?? "";
  const anchor = { ...region };

  // 상권 밀도 + 사전 검색 목록 (밀도 조사가 찾은 가게를 버리지 않는다)
  const sampleMap = new Map<string, WebPlace & { straightM: number }>();
  let density = 0;
  // 밀도 키워드 3종 병렬 (시간 최적화)
  const dens = await Promise.all(profile.densKw.map((kw) => webSearch(`${sido} ${region.name} ${kw}`.trim())));
  for (const r of dens) for (const p of r.places) if (hav(anchor, p) <= 1.0) {
    density++;
    if (!sampleMap.has(p.name)) sampleMap.set(p.name, { ...p, straightM: Math.round(hav(anchor, p) * 1000) });
  }
  const samples = [...sampleMap.values()].sort((a, b) => a.straightM - b.straightM);
  const dict = new Map<string, WebPlace>();
  for (const s of samples) dict.set(s.name, s);

  let findN = 0, walkN = 0;
  const walkLog = new Map<string, number>(); // 가게명 → distanceM
  const tools: ToolSpec[] = [
    { type: "function", function: { name: "find_places", description: "지역 주변 가게 검색. 이름·업종·별점·직선거리.", parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] } } },
    { type: "function", function: { name: "walk_route", description: "확정 지역 → 가게 도보 시간(분)·거리(m). 최종 후보는 반드시 확인.", parameters: { type: "object", properties: { to: { type: "string" } }, required: ["to"] } } },
  ];
  const impl = async (name: string, a: { keyword?: string; to?: string }): Promise<unknown> => {
    if (name === "find_places") {
      if (++findN > FIND_CAP) return { error: `검색 한도(${FIND_CAP}) 초과 — 이미 찾은 후보로 결론을 내라` };
      const r = await webSearch(`${sido} ${region.name} ${a.keyword ?? "맛집"}`.trim());
      const kept = r.places.filter((p) => hav(anchor, p) <= 1.5);
      for (const p of kept) if (!dict.has(p.name)) dict.set(p.name, p);
      return { found: kept.length, note: "straightLineM 은 직선거리다. 가까운 것부터 walk_route 로 확인하라.",
        places: kept.slice(0, 10).map((p) => ({ name: p.name, category: p.category, rating: p.rating, reviews: p.reviews, straightLineM: Math.round(hav(anchor, p) * 1000) })) };
    }
    if (++walkN > WALK_CAP) return { error: `도보 조회 한도(${WALK_CAP}) 초과 — 확인한 가게 중에서 골라라` };
    const t = dict.get(String(a.to ?? "").trim());
    if (!t) return { error: `검색 결과에 없는 가게: ${a.to}` };
    const r = await webRouteRetry("walk", { ...anchor, name: region.name }, t);
    if (!isRouteError(r) && r.distanceM != null) walkLog.set(t.name, r.distanceM);
    return isRouteError(r) ? r : { minutes: r.minutes, distanceM: r.distanceM };
  };

  const thin = density < 12;
  const sys = `너는 모임 가게 투표지를 만든다. 모임 지역은 이미 "${region.name}" 로 확정되었다. 지역을 다시 고르지 마라.
[가게 3곳 — 위가 우선] 1순위 walk_route 10분 이내(넘으면 버려라) 2순위 ${profile.storeReq} 3순위 서로 다른 업종.
find_places 로 후보를 모으고 별점·업종으로 추린 뒤 유망한 것만 walk_route 로 확인하라.
도구가 실패하면 notes 에 밝혀라. 조용히 빼지 마라.
[출력] 여는 중괄호로 시작해 닫는 중괄호로 끝낸다. {"places":[{"name":"","category":"","walkMin":0,"emoji":""}],"notes":""}`;
  const user = `모임 인원 ${headcount}명. ${profile.label}.\n확정 지역: ${region.name}. 가게 투표지를 만들어줘.` +
    (thin ? `\n⚠️ 이 지역은 상권이 작다(1km 내 ${density}곳). 3곳이 안 되면 있는 만큼만 내고 notes 에 밝혀라. 검색을 반복하지 마라.` : "") +
    (samples.length ? `\n\n[시스템이 미리 찾아둔 1km 내 가게 — 여기서 시작하라]\n` +
      samples.slice(0, 12).map((p) => `  ${p.name} (${p.category}${p.rating ? ` · 별점${p.rating}` : ""} · 직선${p.straightM}m)`).join("\n") : "");

  let finalText = "";
  if (eco) {
    // ── ECO(L1) 원콜 — 사전 검색 상위 8곳의 도보를 코드가 선조회하고 GLM 은 1콜로 고르기만.
    const top = samples.slice(0, 8);
    const walkMin = new Map<string, number>();
    await Promise.all(top.map(async (s) => {
      const r = await webRouteRetry("walk", { ...anchor, name: region.name }, s);
      if (!isRouteError(r)) { walkMin.set(s.name, r.minutes); if (r.distanceM != null) walkLog.set(s.name, r.distanceM); }
    }));
    const table = top.map((s) => `${s.name}|${s.category}|${s.rating ? `별점${s.rating}` : "별점없음"}|도보${walkMin.get(s.name) ?? "?"}분`).join("\n");
    const oneShot = `"${region.name}" 모임의 가게 투표지 — 후보 3곳. 규칙(위가 우선):
1) 도보 10분 이내(넘으면 버려라) 2) ${profile.storeReq} 3) 서로 다른 업종.
예외: 10분 이내가 하나도 없으면 빈 투표지 대신 **가장 가까운 순 최대 3곳**을 내되,
walkMin 을 실측 그대로 적고 notes 에 전원 기준 초과임을 밝혀라 (방장이 지역 재검토를 판단한다).
후보가 부족하면 있는 만큼만 내고 notes 에 밝혀라. 아래는 실측 목록(가게|업종|별점|도보)이다.
출력은 여는 중괄호로 시작하는 JSON 만: {"places":[{"name":"","category":"","walkMin":0,"emoji":""}],"notes":""}

${table}
인원 ${headcount}명 · 목적: ${profile.label}`;
    finalText = (await glmChat([{ role: "user", content: oneShot }], undefined, glmTokens)).text;
  } else {
  const msgs: Parameters<typeof glmChat>[0] = [{ role: "system", content: sys }, { role: "user", content: user }];
  for (let i = 0; i < MAXT; i++) {
    const last = i === MAXT - 1;
    if (last) msgs.push({ role: "user", content: "마지막 턴이다. 도구 없이 지금까지 결과로 JSON 을 내라. 부족하면 있는 만큼만." });
    const r = await glmChat(msgs, last ? undefined : tools, glmTokens);
    if (!r.toolCalls.length) { finalText = r.text; break; }
    msgs.push(r.raw);
    const results = await Promise.all(r.toolCalls.map(async (c) => ({
      c, res: await impl(c.function.name, JSON.parse(c.function.arguments || "{}") as { keyword?: string; to?: string }) })));
    for (const { c, res } of results) msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(res) });
  }
  }

  const parsed = extractJson<{ places?: { name: string; category?: string; walkMin?: number; emoji?: string }[]; notes?: string }>(finalText);
  if (!parsed.ok) throw new Error(`JSON 추출 실패: ${parsed.why}`);
  const places: PlaceCandidate[] = (parsed.data.places ?? []).slice(0, 3).map((p, i) => {
    const g = dict.get(p.name);
    return { id: `ai-p${i + 1}`, name: p.name, category: p.category ?? g?.category ?? "",
      emoji: p.emoji ?? "🍽️", lat: g?.lat, lng: g?.lng,
      distanceM: walkLog.get(p.name) ?? (g ? Math.round(hav(anchor, g) * 1000) : -1),
      rating: g?.rating ?? 0, reservable: false, depositPerHead: 0,
      url: g?.pageUrl ?? (g?.kakaoId ? `https://place.map.kakao.com/${g.kakaoId}` : undefined) };
  });
  return { places, live: true, notes: parsed.data.notes ?? "", density, glmTokens };
}
