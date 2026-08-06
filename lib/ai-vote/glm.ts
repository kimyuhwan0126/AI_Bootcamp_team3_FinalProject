// ─────────────────────────────────────────────────────────────
// ai-vote/glm.ts — GLM 호출 · JSON 추출 · 목적 프로파일
//
//  검증 근거(하네스 V 시리즈):
//   · JSON 앞 군더더기는 프롬프트로 못 막는다(S 시리즈 5회 중 3회) → 코드가 꺼낸다
//   · 목적 분류는 규칙 → GLM 1콜 → 중립 기본값 3단 (parse.ts 원칙: 규칙이 기본, AI 는 보강)
//   · GLM 분류엔 클래스 정의가 필수 — 없으면 "상견례"를 dinner 로 오분류(실측)
// ─────────────────────────────────────────────────────────────

const PRIMARY_URL = process.env.OLLAMA_PRIMARY_URL || "";
const PRIMARY_MODEL = process.env.OLLAMA_PRIMARY_MODEL || "glm-5.2:cloud";
const PRIMARY_KEY = process.env.OLLAMA_PRIMARY_API_KEY || "ollama";

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
interface ChatMsg { role: string; content?: string; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ToolCall { id: string; function: { name: string; arguments: string } }
interface ChatResp { choices?: { message?: { content?: string; reasoning?: string; tool_calls?: ToolCall[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }

export const glmReady = (): boolean => !!PRIMARY_URL;

/** GLM 1콜. reasoning 모델이라 답이 reasoning 필드에 올 수 있다(실측) — 둘 다 본다. */
export async function glmChat(
  messages: ChatMsg[], tools?: ToolSpec[]
  , usage?: Usage
): Promise<{ text: string; toolCalls: ToolCall[]; raw: ChatMsg }> {
  const r = await fetch(`${PRIMARY_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PRIMARY_KEY}` },
    body: JSON.stringify({ model: PRIMARY_MODEL, temperature: 0.1, think: false, messages, ...(tools ? { tools } : {}) }),
  });
  if (!r.ok) throw new Error(`GLM HTTP ${r.status}`);
  const d = (await r.json()) as ChatResp;
  if (usage) { usage.calls++; usage.prompt += d.usage?.prompt_tokens ?? 0; usage.completion += d.usage?.completion_tokens ?? 0; }
  const m = d.choices?.[0]?.message;
  if (!m) throw new Error("GLM 응답에 message 없음");
  return { text: ((m.content ?? "") || (m.reasoning ?? "")).trim(), toolCalls: m.tool_calls ?? [], raw: m as ChatMsg };
}

/** LLM 이 JSON 앞뒤에 붙이는 설명·코드펜스를 걷어내고 파싱한다. */
export function extractJson<T>(t: string): { ok: true; data: T; hadPreamble: boolean } | { ok: false; why: string } {
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const i = body.indexOf("{"), j = body.lastIndexOf("}");
  if (i < 0 || j <= i) return { ok: false, why: "중괄호 없음" };
  try { return { ok: true, data: JSON.parse(body.slice(i, j + 1)) as T, hadPreamble: i > 0 || fence != null }; }
  catch (e) { return { ok: false, why: String(e).slice(0, 60) }; }
}

// ── 목적 프로파일 (종수·문구는 팀 결정 대상 — 초안) ──
export type PurposeKey = "dinner" | "meal" | "study" | "cafe" | "date";
export interface Profile { key: PurposeKey; label: string; densKw: string[]; storeReq: string }
export const PROFILES: Record<PurposeKey, Profile> = {
  dinner: { key: "dinner", label: "회식 — 술 중심",
    densKw: ["술집", "고기집", "음식점"],
    storeReq: "회식+술에 맞는 업종 (고기집·주점·요리주점 등. 카페·분식 제외)" },
  meal: { key: "meal", label: "식사 중심 모임",
    densKw: ["음식점", "맛집", "한식"],
    storeReq: "여럿이 앉아 식사할 식당 (술집·포차·카페 제외)" },
  study: { key: "study", label: "스터디 — 오래 앉아 작업",
    densKw: ["카페", "스터디카페", "음식점"],
    storeReq: "오래 앉아 작업할 수 있는 곳 (카페·스터디카페·북카페. 술집·고기집 제외)" },
  cafe: { key: "cafe", label: "카페 — 차·수다",
    densKw: ["카페", "디저트", "음식점"],
    storeReq: "대화하기 좋은 카페·디저트카페 (술집·식당 제외)" },
  date: { key: "date", label: "데이트 — 분위기",
    densKw: ["맛집", "카페", "음식점"],
    storeReq: "분위기 있는 식당·카페 (프랜차이즈·시끄러운 주점은 후순위)" },
};

const PURPOSE_RULES: [RegExp, PurposeKey][] = [
  [/회식|술|한잔|맥주|소주|번개|송년|신년|회포|치맥|막걸리|와인|포차|뒤풀이|동창회/, "dinner"],
  [/스터디|공부|과제|작업|노트북|시험|코딩/, "study"],
  [/데이트|기념일|커플|둘이/, "date"],
  [/카페|커피|수다|티타임|디저트|브런치/, "cafe"],
  [/밥|식사|점심|저녁|맛집|한끼/, "meal"],
];

export interface Usage { calls: number; prompt: number; completion: number }
export const newUsage = (): Usage => ({ calls: 0, prompt: 0, completion: 0 });
export interface Classified { profile: Profile; how: "규칙" | "GLM" | "기본값"; unknown: boolean; tokens: Usage }

/** 자유텍스트 → 프로파일. 미인식은 중립(meal) + unknown 표시 — 조용히 회식으로 떨어지지 않는다. */
export async function classifyPurpose(text: string): Promise<Classified> {
  const t = (text || "").trim();
  const u = newUsage();
  if (t) {
    for (const [re, key] of PURPOSE_RULES) if (re.test(t)) return { profile: PROFILES[key], how: "규칙", unknown: false, tokens: u };
    try {
      const { text: out } = await glmChat([{ role: "user",
        content: `다음 모임 목적을 분류하라. 답은 한 단어만.\ndinner=술이 중심인 모임(회식·뒤풀이) / meal=식사가 중심(가족·격식·상견례 포함) / study=공부·작업 / cafe=차·수다 / date=연인\n목적: "${t}"` }], undefined, u);
      const w = (out.match(/dinner|meal|study|cafe|date/) ?? [])[0] as PurposeKey | undefined;
      if (w) return { profile: PROFILES[w], how: "GLM", unknown: false, tokens: u };
    } catch { /* 분류 실패 → 중립 */ }
  }
  return { profile: PROFILES.meal, how: "기본값", unknown: true, tokens: u };
}
