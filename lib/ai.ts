// ─────────────────────────────────────────────────────────────
// ai.ts — AI 모임 파실리테이터 (투표 대체)
//
//  · Ollama(OpenAI 호환)로 GLM 호출, 실패 시 로컬 모델 폴백
//  · 도구: confirm_region / confirm_place / evaluate_region
//  · 모임별 락 + pending 큐: 동시 발화에도 판단 유실 없음
//  · AI 완전 장애 시에도 앱은 동작 (방장 수동 확정이 안전망)
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import type { Meeting, RegionCandidate } from "./types";
import {
  getMeeting,
  setAiBusy,
  appendAiChat,
  appendSystemChat,
  confirmRegion,
  confirmPlace,
  updatePrefs,
  saveCandidates,
} from "./store";
import { resolveGeocode, travelMinutes, recommendPlaces, emojiFor } from "./routing";
import { searchPlacesKakao } from "./kakao";

// ── 설정 (.env.local에서 오버라이드 가능) ──
// 1순위 주소는 코드에 박지 않는다 — 팀 내부망 주소가 공개 저장소에 남고,
// /api/status 의 ai.url 로 그대로 응답에 실려 나간다. 쓸 사람이 .env.local 에 넣는다.
const PRIMARY_URL = process.env.OLLAMA_PRIMARY_URL || "";
const PRIMARY_MODEL = process.env.OLLAMA_PRIMARY_MODEL || "glm-5.2:cloud";
const FALLBACK_URL = process.env.OLLAMA_FALLBACK_URL || "http://localhost:11434/v1";
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || "qwen2.5-coder:7b";

const SILENT = "[SILENT]";
const MAX_TOOL_LOOPS = 5;
const CONNECT_TIMEOUT_MS = 6000;   // 접속 실패 → 빠르게 폴백
const GEN_TIMEOUT_MS = 90000;      // 생성 자체는 여유 있게

// 프로세스 상태 (HMR에도 유지)
const g = globalThis as unknown as {
  __moimerAi?: {
    active: "primary" | "fallback";
    locks: Map<string, boolean>;
    pending: Map<string, boolean>;
  };
};
const S = g.__moimerAi ?? (g.__moimerAi = { active: "primary", locks: new Map(), pending: new Map() });

// ═════════ 추적(trace): Ollama가 뭘 하는지 전부 기록 ═════════
// logs/ai-trace.jsonl 에 한 줄당 하나의 이벤트를 append.
// 조회: GET /api/ai-trace (개발용) 또는 파일을 직접 열기.
const TRACE_FILE = path.join(process.cwd(), "logs", "ai-trace.jsonl");

export function traceEvent(entry: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(TRACE_FILE), { recursive: true });
    fs.appendFileSync(TRACE_FILE, line + "\n", "utf8");
  } catch {
    /* 추적 실패가 챗봇을 막으면 안 됨 */
  }
}

export function readTrace(limit = 50): Record<string, unknown>[] {
  try {
    const lines = fs.readFileSync(TRACE_FILE, "utf8").trim().split("\n");
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    });
  } catch {
    return [];
  }
}

// ═════════ LLM 호출 (fetch 기반, 의존성 없음) ═════════

async function chatCompletion(
  base: string,
  model: string,
  body: any,
  timeoutMs: number
): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({ model, ...body }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// primary 실패 시 fallback으로 전환해 재시도. ctx는 추적용 메타데이터.
async function llm(body: any, ctx?: Record<string, unknown>): Promise<any> {
  const t0 = Date.now();
  const finish = (r: any, model: string, url: string) => {
    const ms = Date.now() - t0;
    const msg = r?.choices?.[0]?.message;
    console.log(`[ai] ✔ ${model} @ ${url} (${(ms / 1000).toFixed(1)}s)`);
    traceEvent({
      type: "llm_call",
      ...ctx,
      model,
      url,
      ms,
      // Ollama가 실제로 얼마나 일했는지: 입력/출력 토큰 수
      usage: r?.usage
        ? { prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens }
        : undefined,
      reply_preview: (msg?.content || "").slice(0, 150) || undefined,
      tool_calls: msg?.tool_calls?.map((c: any) => ({
        name: c.function?.name,
        args: (c.function?.arguments || "").slice(0, 200),
      })),
    });
    return r;
  };

  if (S.active === "primary") {
    try {
      const r = await chatCompletion(PRIMARY_URL, PRIMARY_MODEL, body, GEN_TIMEOUT_MS);
      return finish(r, PRIMARY_MODEL, PRIMARY_URL);
    } catch (e: any) {
      console.warn(`[ai] primary(${PRIMARY_MODEL}) 실패 → fallback(${FALLBACK_MODEL}) 전환:`, e?.message);
      traceEvent({ type: "failover", ...ctx, from: PRIMARY_URL, to: FALLBACK_URL, reason: String(e?.message).slice(0, 200) });
      S.active = "fallback";
    }
  }
  const r = await chatCompletion(FALLBACK_URL, FALLBACK_MODEL, body, GEN_TIMEOUT_MS);
  return finish(r, FALLBACK_MODEL, FALLBACK_URL);
}

// 서버 살아있는지 빠른 확인 (첫 접속 시 6초 안에 폴백 결정)
async function probePrimary(): Promise<void> {
  if (S.active !== "primary") return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
    const r = await fetch(PRIMARY_URL.replace(/\/v1$/, "") + "/api/tags", { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch {
    console.warn(`[ai] primary 접속 불가 → fallback(${FALLBACK_MODEL}) 사용`);
    S.active = "fallback";
  }
}

// ═════════ 도구 정의 ═════════

const TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "confirm_region",
      description:
        "참가자들이 중간지역에 명확히 합의했을 때 지역을 확정한다. 합의가 애매하면 호출하지 말고 되물어라.",
      parameters: {
        type: "object",
        properties: {
          region_id: { type: "string", description: "확정할 지역 후보 id (예: r1)" },
        },
        required: ["region_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_place",
      description:
        "참가자들이 장소에 명확히 합의했을 때 최종 장소를 확정한다. 합의가 애매하면 호출하지 말고 되물어라.",
      parameters: {
        type: "object",
        properties: {
          place_id: { type: "string", description: "확정할 장소 후보 id (예: p1)" },
        },
        required: ["place_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_region",
      description:
        "후보 목록에 없는 지역을 참가자가 제안했을 때, 그 지역까지 전원의 이동시간을 계산해 후보에 추가한다. 결과를 보고 대화로 공유하라.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "지역/역 이름 (예: 판교, 서울역)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_preferences",
      description:
        "대화에서 모임의 목적/분위기/예산/알러지·채식/음주/날짜/시간 정보를 알게 되면 즉시 기록한다. 알게 된 필드만 부분 업데이트하면 된다. 날짜·시간은 원문과 함께 가능하면 정규화값(date_iso, time_hhmm)도 채워라.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", description: "모임 목적 (예: 회식, 스터디, 친목)" },
          mood: { type: "string", description: "원하는 분위기 (예: 조용한, 왁자지껄)" },
          budget: { type: "string", description: "1인 예산 (예: 2만원대)" },
          dietary: { type: "string", description: "알러지·채식 등 (예: 새우 알러지 1명)" },
          alcohol: { type: "string", description: "음주 여부 (예: 가볍게 한잔, 안 마심)" },
          date_text: { type: "string", description: "합의된 날짜 원문 (예: 다음주 토요일)" },
          date_iso: { type: "string", description: "정규화 날짜 YYYY-MM-DD" },
          time_text: { type: "string", description: "합의된 시간 원문 (예: 저녁 7시)" },
          time_hhmm: { type: "string", description: "정규화 시간 HH:MM (24시간제)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_more_places",
      description:
        "장소 논의 단계에서, 현재 후보에 없는 종류의 가게를 참가자가 원할 때(예: 고기집, 파스타, 노래방) 확정된 지역 근처에서 실제 가게를 더 검색해 후보에 추가한다. 결과를 대화로 제안하라.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "찾을 가게 종류 (예: 고기집, 파스타, 이자카야)" },
        },
        required: ["keyword"],
      },
    },
  },
];

const MAX_PLACES = 8; // 장소 후보 상한

// ═════════ 도구 실행 ═════════

async function runTool(code: string, name: string, argsJson: string): Promise<string> {
  let args: any = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return JSON.stringify({ error: "bad_arguments" });
  }
  const m = await getMeeting(code);
  if (!m) return JSON.stringify({ error: "모임 없음" });

  try {
    switch (name) {
      case "confirm_region": {
        // 확정 전에 실제 가게를 검색해 함께 주입 (실패 시 store가 mock 폴백)
        const target = m.regions.find((r) => r.id === String(args.region_id));
        const real = target
          ? await recommendPlaces(target.name, { lat: target.lat, lng: target.lng })
          : undefined;
        // 단계 가드: 수동 확정과 경합해도 stale 확정은 거부됨
        const r = await confirmRegion(
          { code, regionId: String(args.region_id), by: "ai" },
          { places: real }
        );
        if (!r.ok) return JSON.stringify({ error: r.error });
        const places = (await getMeeting(code))?.places ?? [];
        return JSON.stringify({
          confirmed: r.regionName,
          note: "지역 확정 완료. 아래는 카카오 검색 기반 실제 가게 후보다. 이걸로 장소 논의를 시작하라.",
          place_candidates: places.map((p) => ({
            id: p.id, name: p.name, category: p.category,
            distance_m: p.distanceM, reservable: p.reservable, deposit_per_head: p.depositPerHead,
          })),
        });
      }
      case "confirm_place": {
        const r = await confirmPlace({ code, placeId: String(args.place_id), by: "ai" });
        if (!r.ok) return JSON.stringify({ error: r.error });
        return JSON.stringify({ confirmed: r.placeName, note: "최종 확정 완료. 축하 인사와 함께 요약해라." });
      }
      case "save_preferences": {
        const r = await updatePrefs(code, {
          purpose: args.purpose,
          mood: args.mood,
          budget: args.budget,
          dietary: args.dietary,
          alcohol: args.alcohol,
          dateText: args.date_text,
          dateIso: args.date_iso,
          timeText: args.time_text,
          timeHhmm: args.time_hhmm,
        });
        if (!r.ok) return JSON.stringify({ error: "모임 없음" });
        return JSON.stringify({
          saved: true,
          prefs: r.prefs,
          note: "기록 완료. 굳이 언급할 필요 없으면 대화를 자연스럽게 이어가라.",
        });
      }
      case "search_more_places": {
        const kw = String(args.keyword || "").trim();
        if (!kw) return JSON.stringify({ error: "keyword가 비었어요" });
        if (m.aiPhase !== "place") return JSON.stringify({ error: "장소 논의 단계가 아니에요" });
        const region = m.regions.find((r) => r.id === m.winnerRegionId);
        if (!region) return JSON.stringify({ error: "확정된 지역이 없어요" });

        const found = await searchPlacesKakao(`${region.name} ${kw}`, { lat: region.lat, lng: region.lng }, 4);
        if (!found?.length) {
          return JSON.stringify({ found: 0, note: `'${kw}' 검색 결과가 없어요. 다른 키워드를 제안하거나 기존 후보로 진행하라.` });
        }
        // 중복 제외 후 상한(MAX_PLACES=8)까지 추가. 꽉 차면 뒤에서부터 교체.
        const existing = new Set(m.places.map((p) => p.name));
        const added: string[] = [];
        let replaceIdx = m.places.length - 1;
        for (const doc of found) {
          if (existing.has(doc.name)) continue;
          const cand = {
            id: "tmp",
            name: doc.name,
            category: doc.category,
            emoji: emojiFor(doc.category, "🍽️"),
            distanceM: doc.distanceM,
            rating: 0,
            reservable: true,
            depositPerHead: 10000,
            url: doc.url || undefined,
          };
          if (m.places.length < MAX_PLACES) {
            m.places.push(cand);
          } else if (replaceIdx >= 0) {
            m.places[replaceIdx--] = cand; // 상한 도달 → 오래된 뒷순위부터 교체
          } else break;
          added.push(doc.name);
        }
        m.places = m.places.map((p, i) => ({ ...p, id: `p${i + 1}` })); // id 재부여
        // DB 모드에서는 객체를 고쳐도 저장되지 않는다 — 명시적으로 써 준다
        await saveCandidates(code, { places: m.places });
        return JSON.stringify({
          found: added.length,
          added,
          note: added.length
            ? `후보에 추가됨(전체 ${m.places.length}/${MAX_PLACES}개). 새 후보를 거리와 함께 대화로 제안하라.`
            : "전부 이미 후보에 있어요.",
          all_candidates: m.places.map((p) => ({ id: p.id, name: p.name, category: p.category, distance_m: p.distanceM })),
        });
      }
      case "evaluate_region": {
        const nm = String(args.name || "").trim();
        if (!nm) return JSON.stringify({ error: "지역 이름이 비었어요" });
        if (m.aiPhase !== "region") return JSON.stringify({ error: "지역 논의 단계가 아니에요" });
        const hub = await resolveGeocode(nm);
        const located = m.participants.filter((p) => p.lat != null);
        const per = await Promise.all(
          located.map(async (p) => ({
            pid: p.id, name: p.name,
            min: await travelMinutes({ lat: p.lat!, lng: p.lng! }, hub, p.transport),
          }))
        );
        const mins = per.map((x) => x.min);
        const maxMin = Math.max(...mins);
        const devMin = maxMin - Math.min(...mins);
        const cand: RegionCandidate = {
          id: "pending", name: nm, lat: hub.lat, lng: hub.lng,
          maxMin, devMin, reason: `참가자 제안 — 최대 ${maxMin}분 · 편차 ${devMin}분`, perParticipant: per,
        };
        cand.id = `r${m.regions.length + 1}`;
        m.regions.push(cand); // 후보 목록에 추가 → UI 카드에도 표시됨
        await saveCandidates(code, { regions: m.regions });
        return JSON.stringify({
          added: { id: cand.id, name: nm, max_min: maxMin, dev_min: devMin,
                   per_person: per.map((x) => `${x.name} ${x.min}분`) },
          note: "후보에 추가됨. 기존 후보와 공평성을 비교해 대화로 알려라.",
        });
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message || "tool error" });
  }
}

// ═════════ 컨텍스트 구성 ═════════

function buildSystemPrompt(m: Meeting, force: boolean): string {
  const phase = m.aiPhase;
  const people = m.participants
    .map((p) => `- ${p.name}${p.isLeader ? "(방장)" : ""}: ${p.origin ?? "출발지 미등록"} · ${p.transport === "car" ? "자차" : "대중교통"}`)
    .join("\n");

  // 수집된 선호·일정 현황 (모르는 항목은 대화 중 자연스럽게 물어볼 대상)
  const P = m.prefs;
  const prefLine = (label: string, v?: string) => `- ${label}: ${v ?? "아직 모름"}`;
  const prefsBlock = [
    prefLine("목적", P.purpose),
    prefLine("분위기", P.mood),
    prefLine("1인 예산", P.budget),
    prefLine("알러지·채식", P.dietary),
    prefLine("음주", P.alcohol),
    prefLine("날짜", P.dateText ? `${P.dateText}${P.dateIso ? ` (${P.dateIso})` : ""}` : undefined),
    prefLine("시간", P.timeText ? `${P.timeText}${P.timeHhmm ? ` (${P.timeHhmm})` : ""}` : undefined),
  ].join("\n");
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")} (${"일월화수목금토"[today.getDay()]})`;
  const regions = m.regions
    .map((r) => `- [${r.id}] ${r.name}: 최대 ${r.maxMin}분, 편차 ${r.devMin}분 (${r.perParticipant.map((x) => `${x.name} ${x.min}분`).join(", ")})`)
    .join("\n");
  const places = m.places
    .map((p) => `- [${p.id}] ${p.emoji} ${p.name} (${p.category}${p.rating > 0 ? `, ⭐${p.rating}` : ""}, ${p.distanceM}m${p.reservable ? ", 예약가능" : ""})`)
    .join("\n");

  let phaseGuide = "";
  if (phase === "region") {
    phaseGuide = `[현재 단계: 1차 중간지역 정하기]
지역 후보 (id로 확정):
${regions}

- 의견이 모이면 confirm_region으로 확정하라.
- 후보에 없는 지역을 제안하면 evaluate_region으로 이동시간을 계산해 비교해줘라.
- 의견이 갈리면 공평성 데이터(최대 이동시간·편차)를 근거로 절충을 유도하라.`;
  } else if (phase === "place") {
    phaseGuide = `[현재 단계: 2차 장소 정하기 — 지역은 ${m.regions.find((r) => r.id === m.winnerRegionId)?.name ?? "?"}로 확정됨]
장소 후보 (id로 확정):
${places}

- 의견이 모이면 confirm_place로 확정하라.
- 후보에 없는 종류를 원하면(예: "고기 먹고 싶다") search_more_places로 실제 가게를 더 찾아 제안하라.
- 검색 키워드에 수집된 선호를 반영하라: 음주 원함→술집/이자카야, 조용한 분위기→조용한 카페, 예산 낮음→가성비, 채식→채식 식당 등.
- 알러지·채식 정보가 있으면 확정 전에 반드시 고려해 언급하라.
- 취향이 갈리면 카테고리·거리·예약가능 여부를 근거로 절충을 유도하라.`;
  }

  const forceGuide = force
    ? `\n[방장 요청: 지금 결정] 방장이 지금 결정해 달라고 요청했다. 지금까지 나온 의견을 종합해 가장 합리적인 후보를 즉시 확정 도구로 확정하고, 그 이유를 한 문장으로 밝혀라. 의견이 전혀 없으면 데이터상 가장 공평한 후보를 확정하라.`
    : "";

  return `너는 모임앱 "모이머"의 채팅방에 상주하는 모임 도우미 AI다.
목적: 참가자들이 부담 없이 수다 떨듯 대화하면 네가 의견을 모아 중간지역과 장소를 확정하는 것. (투표를 대체한다)
오늘 날짜: ${todayStr}

모임: ${m.name} · 참가자 ${m.participants.length}명
${people}

[수집된 모임 정보]
${prefsBlock}

[정보 수집 규칙]
- 대화에서 목적/분위기/예산/알러지·채식/음주/날짜/시간을 알게 되면 즉시 save_preferences로 기록하라. 기록했다고 티낼 필요는 없다.
- 날짜·시간이 합의되면 오늘 날짜 기준으로 date_iso(YYYY-MM-DD)와 time_hhmm(HH:MM)을 정규화해 함께 저장하라 (예: "다음주 토요일 저녁 7시" → 계산된 날짜 + 19:00).
- "아직 모름" 항목은 대화가 자연스러운 순간에 **한 번에 하나씩만** 물어라. 심문하듯 몰아서 묻지 마라. 장소 결정에 지장 없으면 안 물어도 된다.

${phaseGuide}

[개입 원칙]
- 의견이 나오면 짧게 반영하고, 애매하면 한 명씩 이름을 불러 물어라 (한 번에 질문 하나).
- 확정 도구는 **명확한 합의**가 보일 때만 호출하라. 애매하면 "OO로 확정할까요?"라고 되물어라.
- 과반이 동의하고 반대가 없으면 합의로 본다. 침묵하는 사람이 있으면 한 번은 의견을 물어보고, 그래도 없으면 나온 의견만으로 진행한다.
- 사람들끼리 대화가 잘 흘러가면 끼어들지 마라. 침묵할 때는 정확히 ${SILENT} 만 출력하라.
- 짧고 친근한 채팅체. 이름표(예: 'AI:')는 붙이지 마라.${forceGuide}`;
}

function buildMessages(m: Meeting, force: boolean) {
  const recent = m.chat.slice(-40).map((c) => {
    if (c.role === "ai") return `AI: ${c.text}`;
    if (c.role === "system") return `(안내) ${c.text}`;
    return `${c.name}: ${c.text}`;
  });
  return [
    { role: "system", content: buildSystemPrompt(m, force) },
    {
      role: "user",
      content: `아래는 채팅방의 최근 대화다. 마지막 발언까지 보고 판단하라.\n\n${recent.join("\n")}`,
    },
  ];
}

// ═════════ 판단 루프 ═════════

async function decide(code: string, force: boolean): Promise<void> {
  const m = await getMeeting(code);
  if (!m || m.stage !== "chat") return;

  await probePrimary();

  const messages: any[] = buildMessages(m, force);
  const lastUser = [...m.chat].reverse().find((c) => c.role === "user");
  const baseCtx = {
    code,
    phase: m.aiPhase,
    force: force || undefined,
    trigger: lastUser ? `${lastUser.name}: ${lastUser.text.slice(0, 60)}` : undefined,
  };

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const resp = await llm({ messages, tools: TOOL_SPECS, temperature: 0.4 }, { ...baseCtx, round: i + 1 });
    const msg = resp?.choices?.[0]?.message;
    if (!msg) return;

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const result = await runTool(code, call.function?.name, call.function?.arguments);
        traceEvent({
          type: "tool_exec",
          ...baseCtx,
          round: i + 1,
          tool: call.function?.name,
          args: (call.function?.arguments || "").slice(0, 200),
          result_preview: result.slice(0, 200),
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue; // 도구 결과 반영해 재판단 (확정 후 안내 멘트 생성 등)
    }

    const text = (msg.content || "").trim();
    if (!text || text.includes(SILENT)) {
      traceEvent({ type: "silent", ...baseCtx, round: i + 1 });
      return; // 침묵
    }
    await appendAiChat(code, text);
    return;
  }
}

// ═════════ 공개 API: AI 턴 실행 (락 + pending 큐) ═════════

export async function runAiTurn(code: string, opts?: { force?: boolean }): Promise<void> {
  const key = code.toUpperCase();
  if (S.locks.get(key)) {
    // 판단 중에 새 메시지 도착 → 끝나고 한 번 더 판단 (유실 방지)
    S.pending.set(key, true);
    return;
  }
  S.locks.set(key, true);
  setAiBusy(key, true);
  try {
    await decide(key, opts?.force ?? false);
    // 판단 중 쌓인 메시지가 있으면 한 번 더
    while (S.pending.get(key)) {
      S.pending.set(key, false);
      await decide(key, false);
    }
  } catch (e: any) {
    console.error("[ai] 판단 실패:", e?.message);
    await appendSystemChat(
      key,
      "⚠ AI 연결에 문제가 있어요. 잠시 후 다시 말을 걸거나, 방장은 하단 '직접 확정'으로 진행할 수 있어요."
    );
  } finally {
    S.locks.set(key, false);
    setAiBusy(key, false);
  }
}

export const aiInfo = () => ({
  active: S.active,
  primary: `${PRIMARY_MODEL} @ ${PRIMARY_URL}`,
  fallback: `${FALLBACK_MODEL} @ ${FALLBACK_URL}`,
});

// ── 상태 확인용: 두 Ollama 서버에 실제로 핑을 쏴서 어느 쪽이 살아있는지 반환 ──
async function ping(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(base.replace(/\/v1$/, "") + "/api/version", { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function probeAi(): Promise<{
  ok: boolean;
  active: "primary" | "fallback" | "none";
  model: string;
  url: string;
}> {
  if (await ping(PRIMARY_URL)) {
    S.active = "primary"; // 원격이 복구됐으면 primary로 복귀
    return { ok: true, active: "primary", model: PRIMARY_MODEL, url: PRIMARY_URL };
  }
  if (await ping(FALLBACK_URL)) {
    S.active = "fallback";
    return { ok: true, active: "fallback", model: FALLBACK_MODEL, url: FALLBACK_URL };
  }
  return { ok: false, active: "none", model: "-", url: "-" };
}
