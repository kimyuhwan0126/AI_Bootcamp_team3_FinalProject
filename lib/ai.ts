// ─────────────────────────────────────────────────────────────
// ai.ts — AI 모임 파실리테이터 (투표 대체)
//
//  · Ollama(OpenAI 호환)로 GLM 호출, 실패 시 로컬 모델 폴백
//  · 도구: confirm_region / confirm_place / evaluate_region
//  · 모임별 락 + pending 큐: 동시 발화에도 판단 유실 없음
//  · AI 완전 장애 시에도 앱은 동작 (방장 수동 확정이 안전망)
// ─────────────────────────────────────────────────────────────
import type { Meeting, RegionCandidate } from "./types";
import {
  getMeeting,
  setAiBusy,
  appendAiChat,
  appendSystemChat,
  confirmRegion,
  confirmPlace,
} from "./store";
import { resolveGeocode, travelMinutes } from "./routing";

// ── 설정 (.env.local에서 오버라이드 가능) ──
const PRIMARY_URL = process.env.OLLAMA_PRIMARY_URL || "http://10.20.2.164:11434/v1";
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

// primary 실패 시 fallback으로 전환해 재시도
async function llm(body: any): Promise<any> {
  if (S.active === "primary") {
    try {
      // 첫 판단은 짧은 타임아웃(접속 확인), 성공 이력 있으면 길게
      return await chatCompletion(PRIMARY_URL, PRIMARY_MODEL, body, GEN_TIMEOUT_MS);
    } catch (e: any) {
      console.warn(`[ai] primary(${PRIMARY_MODEL}) 실패 → fallback(${FALLBACK_MODEL}) 전환:`, e?.message);
      S.active = "fallback";
    }
  }
  return await chatCompletion(FALLBACK_URL, FALLBACK_MODEL, body, GEN_TIMEOUT_MS);
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
];

// ═════════ 도구 실행 ═════════

async function runTool(code: string, name: string, argsJson: string): Promise<string> {
  let args: any = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return JSON.stringify({ error: "bad_arguments" });
  }
  const m = getMeeting(code);
  if (!m) return JSON.stringify({ error: "모임 없음" });

  try {
    switch (name) {
      case "confirm_region": {
        // 단계 가드: 수동 확정과 경합해도 stale 확정은 거부됨
        const r = confirmRegion({ code, regionId: String(args.region_id), by: "ai" });
        if (!r.ok) return JSON.stringify({ error: r.error });
        const places = getMeeting(code)?.places ?? [];
        return JSON.stringify({
          confirmed: r.regionName,
          note: "지역 확정 완료. 이제 아래 장소 후보로 장소 논의를 시작하라.",
          place_candidates: places.map((p) => ({
            id: p.id, name: p.name, category: p.category, rating: p.rating,
            distance_m: p.distanceM, reservable: p.reservable, deposit_per_head: p.depositPerHead,
          })),
        });
      }
      case "confirm_place": {
        const r = confirmPlace({ code, placeId: String(args.place_id), by: "ai" });
        if (!r.ok) return JSON.stringify({ error: r.error });
        return JSON.stringify({ confirmed: r.placeName, note: "최종 확정 완료. 축하 인사와 함께 요약해라." });
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
  const regions = m.regions
    .map((r) => `- [${r.id}] ${r.name}: 최대 ${r.maxMin}분, 편차 ${r.devMin}분 (${r.perParticipant.map((x) => `${x.name} ${x.min}분`).join(", ")})`)
    .join("\n");
  const places = m.places
    .map((p) => `- [${p.id}] ${p.emoji} ${p.name} (${p.category}, ⭐${p.rating}, ${p.distanceM}m${p.reservable ? ", 예약가능" : ""})`)
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
- 취향이 갈리면 카테고리·평점·예약가능 여부를 근거로 절충을 유도하라.`;
  }

  const forceGuide = force
    ? `\n[방장 요청: 지금 결정] 방장이 지금 결정해 달라고 요청했다. 지금까지 나온 의견을 종합해 가장 합리적인 후보를 즉시 확정 도구로 확정하고, 그 이유를 한 문장으로 밝혀라. 의견이 전혀 없으면 데이터상 가장 공평한 후보를 확정하라.`
    : "";

  return `너는 모임앱 "모이머"의 채팅방에 상주하는 모임 도우미 AI다.
목적: 참가자들이 부담 없이 수다 떨듯 대화하면 네가 의견을 모아 중간지역과 장소를 확정하는 것. (투표를 대체한다)

모임: ${m.name} · 참가자 ${m.participants.length}명
${people}

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
  const m = getMeeting(code);
  if (!m || m.stage !== "chat") return;

  await probePrimary();

  const messages: any[] = buildMessages(m, force);

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const resp = await llm({ messages, tools: TOOL_SPECS, temperature: 0.4 });
    const msg = resp?.choices?.[0]?.message;
    if (!msg) return;

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const result = await runTool(code, call.function?.name, call.function?.arguments);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue; // 도구 결과 반영해 재판단 (확정 후 안내 멘트 생성 등)
    }

    const text = (msg.content || "").trim();
    if (!text || text.includes(SILENT)) return; // 침묵
    appendAiChat(code, text);
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
    appendSystemChat(
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
