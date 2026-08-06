// ─────────────────────────────────────────────────────────────
// ai-vote/index.ts — 공개 API: 잠금 + 목적 분류 + 강등 배선
//
//  강등(⑤): GLM·웹 단이 어떤 이유로든 실패하면 기존 검증된 경로로 떨어진다.
//   · 지역 → recommendRegionsWithMeta (스코어러 + 추정, live 플래그 내장)
//   · 가게 → recommendPlaces (카카오 로컬 → mock 폴백 내장)
//  폴백 결과는 캐시하지 않으며 live:false 로 표시된다 (CLAUDE.md §4·§6).
//  잠금(⑤): 같은 키(모임 코드 등)의 동시 실행을 거부 — 중복 브라우저 폭주 방지(W6·W9 크래시).
// ─────────────────────────────────────────────────────────────
import type { Participant, RegionCandidate, PlaceCandidate } from "../types";
import { recommendRegionsWithMeta, recommendPlaces } from "../routing";
import { classifyPurpose, glmReady, type Classified, type Usage } from "./glm";
import { generateRegionSheet } from "./region";
import { generatePlaceSheet } from "./place";

// ⚠️ 모듈 스코프 Map 은 Next dev 의 HMR/재컴파일마다 새로 만들어져 잠금이 증발한다
//    (서버 실측: 동시 2요청이 둘 다 200). globalThis 에 둬야 모듈 재평가에도 살아남는다.
const g = globalThis as unknown as { __aiVoteLocks?: Map<string, number> };
const locks: Map<string, number> = (g.__aiVoteLocks ??= new Map());
const LOCK_MS = 10 * 60 * 1000;
function acquireLock(key: string): boolean {
  const t = locks.get(key);
  if (t && Date.now() - t < LOCK_MS) return false;
  locks.set(key, Date.now());
  return true;
}
const releaseLock = (key: string): void => { locks.delete(key); };

export interface RegionVoteResult {
  stage: "region"; items: RegionCandidate[]; live: boolean; degraded: boolean;
  purpose: Classified["how"]; purposeUnknown: boolean; notes: string; ms: number;
  checked?: { name: string; ok: boolean; why?: string }[]; error?: string;
  legSources?: { odsay: number; odsayFallback: number; kakaoApi: number };
  glmTokens?: Usage;
}
export interface PlaceVoteResult {
  stage: "place"; places: PlaceCandidate[]; live: boolean; degraded: boolean;
  purpose: Classified["how"]; purposeUnknown: boolean; notes: string; ms: number;
  density?: number; error?: string; glmTokens?: Usage;
}

/** 1차 — 지역 투표지. 실패 시 기존 스코어러로 강등(live:false). */
export async function aiRegionVote(
  lockKey: string, participants: Participant[], purposeText: string, forceFail = false, eco = false
): Promise<RegionVoteResult | { error: string; busy?: boolean }> {
  if (!acquireLock(`region:${lockKey}`)) return { error: "이미 생성 중입니다", busy: true };
  const t0 = Date.now();
  try {
    const cls = await classifyPurpose(purposeText);
    try {
      if (forceFail || !glmReady()) throw new Error(forceFail ? "강등 훈련(forceFail)" : "OLLAMA_PRIMARY_URL 미설정");
      const s = await generateRegionSheet(participants, cls.profile, eco);
      return { stage: "region", items: s.items, live: s.live, degraded: false,
        purpose: cls.how, purposeUnknown: cls.unknown, notes: s.notes, checked: s.checked, legSources: s.legSources,
        glmTokens: { calls: cls.tokens.calls + s.glmTokens.calls, prompt: cls.tokens.prompt + s.glmTokens.prompt, completion: cls.tokens.completion + s.glmTokens.completion }, ms: Date.now() - t0 };
    } catch (e) {
      // ⑤ 강등 — 검증된 기존 경로. 여기 결과는 추정이 섞일 수 있고 meta.live 가 그걸 말한다.
      const meta = await recommendRegionsWithMeta(participants);
      return { stage: "region", items: meta.items, live: meta.live, degraded: true,
        purpose: cls.how, purposeUnknown: cls.unknown,
        notes: `AI 경로 실패로 기존 추천으로 대체됨 (${String((e as Error).message).slice(0, 60)})`, ms: Date.now() - t0 };
    }
  } finally { releaseLock(`region:${lockKey}`); }
}

/** 2차 — 가게 투표지. 확정 지역은 반드시 좌표로 받는다(이름 재검색 금지, ③). */
export async function aiPlaceVote(
  lockKey: string, region: { name: string; lat: number; lng: number },
  purposeText: string, headcount: number, forceFail = false, eco = false
): Promise<PlaceVoteResult | { error: string; busy?: boolean }> {
  if (!Number.isFinite(region.lat) || !Number.isFinite(region.lng)) return { error: "확정 지역 좌표가 없습니다 — 이름만으로는 받지 않는다(동명 사고 방지)" };
  if (!acquireLock(`place:${lockKey}`)) return { error: "이미 생성 중입니다", busy: true };
  const t0 = Date.now();
  try {
    const cls = await classifyPurpose(purposeText);
    try {
      if (forceFail || !glmReady()) throw new Error(forceFail ? "강등 훈련(forceFail)" : "OLLAMA_PRIMARY_URL 미설정");
      const s = await generatePlaceSheet(region, cls.profile, headcount, eco);
      return { stage: "place", places: s.places, live: s.live, degraded: false,
        purpose: cls.how, purposeUnknown: cls.unknown, notes: s.notes, density: s.density,
        glmTokens: { calls: cls.tokens.calls + s.glmTokens.calls, prompt: cls.tokens.prompt + s.glmTokens.prompt, completion: cls.tokens.completion + s.glmTokens.completion }, ms: Date.now() - t0 };
    } catch (e) {
      const places = await recommendPlaces(region.name, { lat: region.lat, lng: region.lng });
      return { stage: "place", places, live: false, degraded: true,
        purpose: cls.how, purposeUnknown: cls.unknown,
        notes: `AI 경로 실패로 기존 검색으로 대체됨 (${String((e as Error).message).slice(0, 60)})`, ms: Date.now() - t0 };
    }
  } finally { releaseLock(`place:${lockKey}`); }
}
