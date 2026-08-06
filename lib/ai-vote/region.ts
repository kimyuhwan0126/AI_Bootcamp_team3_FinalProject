// ─────────────────────────────────────────────────────────────
// ai-vote/region.ts — 1차: 지역 투표지 3곳 (GLM 제안 → 코드 3중 검증 → 실측 비교)
//
//  제품 흐름: 참가자 좌표는 입력 시점에 이미 지오코딩돼 있다 → 재해석하지 않는다(③ 원칙).
//  검증 근거: 후보는 코드가 고정해야 탐색이 운에 좌우되지 않는다(R1·R2 실측).
//  상권 임계 12 = 24개 지점 실측(시골≤6·거점≥18, 중복 포함 합산 기준).
// ─────────────────────────────────────────────────────────────
import type { Participant, RegionCandidate } from "../types";
import { travelMinutesEx } from "../routing";
import { webSearch, webRouteRetry, isRouteError, hav, type WebPlace } from "./web-kakao";
import { glmChat, extractJson, newUsage, type Profile, type ToolSpec, type Usage } from "./glm";

// 도간(道間) 판단 임계 — 카카오맵 웹은 일부 도간 구간에서 KTX 를 아예 안 준다
// (실측: 부산→신경주가 시내버스 199분만 표시). 직선 50km 초과 대중교통은
// ODsay(travelMinutesEx: L1/L2 캐시 + 속도게이트 + 실패 시 추정 내장)를 먼저 쓴다.
// 수도권 내부(강남↔정발산 ~35km)는 임계 미만이라 기존 웹 경로 그대로다.
const INTERCITY_KM = 50;

const MIN_NEAR = 12;
const PRE_N = 12;
const MAXT = 12;

type Pt = { name: string; lat: number; lng: number; transport: string; origin: string };
const sidoOf = (addr: string): string => addr.split(" ")[0] ?? "";

async function densityOf(anchor: { lat: number; lng: number }, name: string, sido: string, kws: string[]): Promise<number> {
  // 키워드 3종 병렬 — 직렬 대비 후보당 ~0.4초 절약 (시간 최적화)
  const counts = await Promise.all(kws.map(async (kw) =>
    (await webSearch(`${sido} ${name} ${kw}`)).places.filter((p) => hav(anchor, p) <= 1.0).length));
  return counts.reduce((s, x) => s + x, 0);
}

/** 동시성 제한 병렬 맵 — 후보 검증 20곳이 완전 직렬(~15초)이던 것을 풀로 돌린다 */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

export interface RegionSheet {
  items: RegionCandidate[]; live: boolean; notes: string;
  checked: { name: string; ok: boolean; why?: string }[];
  legSources: { odsay: number; odsayFallback: number; web: number };
  glmTokens: Usage;
}

export async function generateRegionSheet(participants: Participant[], profile: Profile, eco = false): Promise<RegionSheet> {
  const glmTokens = newUsage();
  const pts: Pt[] = participants
    .filter((p): p is Participant & { lat: number; lng: number } => p.lat != null && p.lng != null)
    .map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, transport: p.transport, origin: p.origin ?? p.name }));
  if (pts.length < 2) throw new Error("좌표 있는 참가자가 2명 미만");

  // ① GLM 지명 제안 + 참가자 시도 조회를 병렬로 (서로 독립 — 시간 최적화)
  const centroid = { lat: pts.reduce((s, q) => s + q.lat, 0) / pts.length, lng: pts.reduce((s, q) => s + q.lng, 0) / pts.length };
  const reachKm = Math.max(...pts.map((q) => hav(q, centroid))) + 40;
  const [ask, ptSidosRaw] = await Promise.all([
    glmChat([{ role: "user",
      content: `${pts.map((p) => `${p.name}: ${p.origin}`).join(" / ")}\n이 사람들이 중간쯤에서 만난다면 후보가 될 만한 지역·역 이름을 20개 나열하라.\n설명 없이 쉼표로만 구분해 이름만 적어라. 실제로 상권이 있는 곳으로.` }], undefined, glmTokens),
    Promise.all(pts.map(async (p) => sidoOf((await webSearch(p.origin)).places[0]?.address ?? ""))),
  ]);
  const ptSidos = [...new Set(ptSidosRaw)].filter(Boolean);
  const names = [...new Set(ask.text.replace(/[\n·•\-*]/g, ",").split(",").map((s) => s.trim())
    .filter((s) => s && s.length <= 12 && /[가-힣]/.test(s)))].slice(0, 24);

  // ② 코드 3중 검증: 실존 → 동명(중심거리+전원 시도 재검색) → 상권 밀도
  //    완전 직렬(20곳 ~15초)이던 것을 동시 6개 풀로 — JSONP 는 가볍고 결과 순서는 배열이 보존한다.
  type Checked = (WebPlace & { candName: string; near: number; proxy: number; ok: true }) | { candName: string; ok: false; why: string };
  const checked = await mapPool<string, Checked>(names, 6, async (n) => {
    const found = (await webSearch(n)).places;
    // ⚠️ "신촌"처럼 역 없이 온 지명은 상위 결과가 전부 관광명소일 수 있다(서버 실측:
    //    "신촌" 1위=등산로 안산자락길, "여의도" 1위=한강 → 상권 0 오탈락). 앵커는
    //    ① 결과 내 역 → ② "{이름}역" 재검색 → ③ 첫 결과 순으로 잡는다.
    const isStation = (p: WebPlace): boolean => /지하철|기차/.test(p.category) || (p.name.startsWith(n) && p.name.includes("역"));
    let hit = found.find(isStation);
    if (!hit && !/역$/.test(n)) hit = (await webSearch(`${n}역`)).places.find(isStation);
    hit = hit ?? found[0];
    if (!hit) return { candName: n, ok: false, why: "실존 확인 실패" };
    if (hav(centroid, hit) > reachKm) {
      let retry: WebPlace | undefined;
      for (const sido of ptSidos) {
        const r = (await webSearch(`${sido} ${n}`)).places[0];
        if (r && hav(centroid, r) <= reachKm) { retry = r; break; }
      }
      if (!retry) return { candName: n, ok: false, why: `동명 의심(중심 ${Math.round(hav(centroid, hit))}km)` };
      hit = retry;
    }
    const near = await densityOf(hit, n, sidoOf(hit.address), profile.densKw);
    if (near < MIN_NEAR) return { candName: n, ok: false, why: `상권 부족(1km내 ${near})` };
    const ds = pts.map((p) => hav(p, hit));
    const mx = Math.max(...ds);
    return { ...hit, candName: n, near, proxy: mx + (mx - Math.min(...ds)) * 0.8, ok: true };
  });
  const picked = checked.filter((c): c is Extract<typeof checked[number], { ok: true }> => c.ok)
    .sort((a, b) => a.proxy - b.proxy).slice(0, eco ? 8 : PRE_N);   // ECO(L3): 실측상 상위 4곳은 항상 8곳 안
  if (picked.length < 3) throw new Error(`검증 통과 후보 부족(${picked.length}곳)`);

  // ③ GLM 실측 비교 — 도구는 이름 사전에 있는 것만 (열린 재검색 금지)
  const dict = new Map<string, { name: string; lat: number; lng: number }>();
  for (const p of pts) dict.set(p.name, p);
  for (const c of picked) dict.set(c.candName, { name: c.candName, lat: c.lat, lng: c.lng });
  const routeLog: { from: string; to: string; minutes: number }[] = [];
  const tools: ToolSpec[] = [
    { type: "function", function: { name: "transit_route", description: "대중교통 소요시간(분). 참가자·후보 이름만 사용.", parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } } },
    { type: "function", function: { name: "car_route", description: "자동차 소요시간(분). 자차 참가자용.", parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } } },
  ];
  const legSources = { odsay: 0, odsayFallback: 0, web: 0 };
  const impl = async (name: string, a: { from?: string; to?: string }): Promise<unknown> => {
    const f = dict.get(String(a.from ?? "").trim()), t = dict.get(String(a.to ?? "").trim());
    if (!f || !t) return { error: `사전에 없는 이름: ${!f ? a.from : a.to}` };
    // 도간 대중교통은 ODsay 우선 — real:true 일 때만 채택하고, 아니면 웹으로 떨어진다.
    if (name === "transit_route" && hav(f, t) > INTERCITY_KM) {
      const o = await travelMinutesEx({ lat: f.lat, lng: f.lng }, { lat: t.lat, lng: t.lng }, "transit");
      if (o.real) {
        legSources.odsay++;
        routeLog.push({ from: f.name, to: t.name, minutes: o.min });
        return { minutes: o.min, source: "odsay(도간)" };
      }
      legSources.odsayFallback++;
    }
    const r = await webRouteRetry(name === "car_route" ? "car" : "traffic", f, t);
    if (!isRouteError(r)) { legSources.web++; routeLog.push({ from: f.name, to: t.name, minutes: r.minutes }); }
    return r;
  };

  const sys = `너는 모임 지역 투표지를 만든다. 1등이 아니라 투표할 후보 3곳을 고른다.
[공식] 비용 = 최대이동시간(분) + 편차(분) × 0.8 (작을수록 공평). 편차 = 최대 − 최소.
[후보 — 전부 조회하라. 빼거나 바꾸지 마라] ${picked.map((c) => c.candName).join(", ")}
대중교통 참가자는 transit_route, 자차는 car_route.
[규칙] 3곳은 비용 낮은 축 + 성격 상이. 1등 선언 금지. reason 한 줄(40자), 도구로 확인 안 한 사실(노선·시설) 금지.
[출력] 여는 중괄호로 시작해 닫는 중괄호로 끝낸다. {"regions":[{"name":"","maxMin":0,"devMin":0,"reason":""}],"notes":""}`;
  const user = pts.map((p) => `- ${p.name}: ${p.origin} 출발, ${p.transport === "car" ? "자차" : "대중교통"}`).join("\n") + `\n\n${profile.label}. 투표지를 만들어줘.`;

  let finalText = "";
  if (eco) {
    // ── ECO(L1) 원콜 — 다리 전부를 코드가 선조회하고, GLM 은 압축표를 보고 "고르기 1콜"만 한다.
    //    도구 루프의 토큰 낭비 원인(결과 48건이 이후 턴마다 반복 포함)을 구조적으로 제거.
    //    reasoning_effort 는 3회 재측정에서 효과 없음(-2%)으로 기각 — 채택 안 함.
    await Promise.all(picked.flatMap((c) => pts.map((p) =>
      impl(p.transport === "car" ? "car_route" : "transit_route", { from: p.name, to: c.candName }))));
    const rows = picked.map((c) => {
      const mins = pts.map((p) => routeLog.find((x) => x.to === c.candName && x.from === p.name)?.minutes ?? -1);
      const mx = Math.max(...mins), mn = Math.min(...mins.filter((m) => m >= 0));
      return { name: c.candName, mins, full: mins.every((m) => m >= 0),
        maxMin: mx, devMin: mx - mn, cost: +(mx + (mx - mn) * 0.8).toFixed(1) };
    });
    const dropped = rows.filter((r) => !r.full).map((r) => r.name);
    // 비용을 코드가 계산해 정렬까지 해서 준다 — GLM 이 표를 보고 암산하는 추론(출력 ~5k)이 사라진다
    const table = rows.filter((r) => r.full).sort((a, b) => a.cost - b.cost)
      .map((r) => `${r.name} 최대${r.maxMin} 편차${r.devMin} 비용${r.cost}`).join("\n");
    const oneShot = `모임 지역 투표지 — 1등이 아니라 투표할 후보 3곳을 고른다. 성격이 서로 달라야 한다(대학가/직장가/번화가 등).
아래 표는 실측이고 비용 낮은 순으로 이미 정렬돼 있다. 계산은 다시 하지 마라 — 비용 낮은 축에서 성격만 분산해 골라라.
reason 한 줄(40자), 확인 안 한 사실(노선·시설) 금지. maxMin·devMin 은 표의 값을 그대로 옮겨라.
출력은 여는 중괄호로 시작하는 JSON 만: {"regions":[{"name":"","maxMin":0,"devMin":0,"reason":""}],"notes":""}

${table}${dropped.length ? `\n(결측으로 제외된 후보: ${dropped.join(", ")})` : ""}
목적: ${profile.label}`;
    finalText = (await glmChat([{ role: "user", content: oneShot }], undefined, glmTokens)).text;
  } else {
  const msgs: Parameters<typeof glmChat>[0] = [{ role: "system", content: sys }, { role: "user", content: user }];
  for (let i = 0; i < MAXT; i++) {
    const last = i === MAXT - 1;
    if (last) msgs.push({ role: "user", content: "마지막 턴이다. 도구 없이 지금까지 결과로 JSON 을 내라." });
    const r = await glmChat(msgs, last ? undefined : tools, glmTokens);
    if (!r.toolCalls.length) { finalText = r.text; break; }
    msgs.push(r.raw);
    const results = await Promise.all(r.toolCalls.map(async (c) => ({
      c, res: await impl(c.function.name, JSON.parse(c.function.arguments || "{}") as { from?: string; to?: string }) })));
    for (const { c, res } of results) msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(res) });
  }
  }

  // ④ 조립 + 자동 검산 — 숫자·좌표는 로그가 정답이다
  const parsed = extractJson<{ regions?: { name: string; maxMin: number; devMin: number; reason?: string }[]; notes?: string }>(finalText);
  if (!parsed.ok) throw new Error(`JSON 추출 실패: ${parsed.why}`);
  const items: RegionCandidate[] = (parsed.data.regions ?? []).slice(0, 3).map((r, i) => {
    const c = picked.find((x) => x.candName === r.name);
    const per = pts.map((p, j) => {
      const l = routeLog.find((x) => x.to === r.name && x.from === p.name);
      return { pid: participants[j]?.id ?? `p${j + 1}`, name: p.name, min: l ? l.minutes : -1 };
    });
    const mins = per.map((x) => x.min).filter((m) => m >= 0);
    const maxMin = mins.length ? Math.max(...mins) : r.maxMin;
    return { id: `ai-r${i + 1}`, name: r.name, lat: c?.lat ?? 0, lng: c?.lng ?? 0,
      maxMin, devMin: mins.length ? maxMin - Math.min(...mins) : r.devMin,
      reason: r.reason ?? "", perParticipant: per };
  });
  if (items.length < 2) throw new Error("지역 후보가 2곳 미만으로 조립됨");
  return { items, live: true, notes: parsed.data.notes ?? "", legSources, glmTokens,
    checked: checked.map((c) => ({ name: c.candName, ok: c.ok, why: c.ok ? undefined : c.why })) };
}
