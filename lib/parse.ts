// ─────────────────────────────────────────────────────────────
// parse.ts — 규칙 기반 한국어 파싱 (LLM 없이 동작)
//
// 왜 규칙인가
//   · 뽑아야 하는 게 날짜·시간·예산·목적 정도라 LLM 이 필요할 만큼 어렵지 않다.
//   · 팀원 PC 의 Ollama 는 배포된 앱이나 발표날 스마트폰에서 닿지 않는다.
//     규칙 파서는 키도 서버도 네트워크도 필요 없어 어디서나 돈다.
//   · 루트 CLAUDE.md §4("키가 없어도 전체 플로우가 돌아야 한다")를 파싱에도 적용한 것.
//
// AI(lib/ai.ts)는 이 결과를 **보강**하는 역할이다. 대체가 아니다.
//   사용자 발화 → parseKo()  [항상 동작]
//                → FLAGS.aiChat && Ollama 있으면 AI 가 덧붙임
//
// 순수 함수다. 브라우저·서버 양쪽에서 돌고, `now` 를 인자로 받아 테스트가 가능하다.
// ─────────────────────────────────────────────────────────────
import type { MeetingPrefs } from "./types";

export interface ParseResult {
  prefs: MeetingPrefs;
  /** 어떤 항목을 실제로 알아들었는지 — UI 가 "이렇게 이해했어요"로 보여준다. */
  matched: (keyof MeetingPrefs)[];
}

// ── 날짜 ───────────────────────────────────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** "다음주 토요일", "내일", "8월 3일" → { text, iso } */
function parseDate(text: string, now: Date): { text: string; iso?: string } | null {
  // 1) 상대 표현
  const rel: [RegExp, number][] = [
    [/오늘|금일/, 0],
    [/내일|낼모레|낼/, 1],
    [/모레/, 2],
    [/글피/, 3],
  ];
  // "낼모레"가 "낼"에 먼저 걸리지 않도록 긴 것부터 본다
  if (/낼모레/.test(text)) return { text: "낼모레", iso: ymd(addDays(now, 2)) };
  for (const [re, n] of rel) {
    const m = text.match(re);
    if (m) return { text: m[0], iso: ymd(addDays(now, n)) };
  }

  // 2) 요일 — "이번주/다음주/담주 X요일" 또는 그냥 "X요일"
  const wd = text.match(/(이번\s*주|다음\s*주|담주|차주)?\s*([월화수목금토일])요일/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    // 다가오는 그 요일까지 며칠 남았나 (오늘이면 0)
    let diff = (target - now.getDay() + 7) % 7;
    if (wd[1] && /다음|담주|차주/.test(wd[1])) diff += 7;
    return { text: wd[0].replace(/\s+/g, " ").trim(), iso: ymd(addDays(now, diff)) };
  }

  // 3) 절대 날짜 — "8월 3일", "8/3", "8.3"
  const abs = text.match(/(\d{1,2})\s*(?:월|[/.])\s*(\d{1,2})\s*일?/);
  if (abs) {
    const mo = Number(abs[1]);
    const da = Number(abs[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let d = new Date(now.getFullYear(), mo - 1, da);
      // 이미 지난 날짜면 내년으로 본다 ("1월 2일"을 12월에 말하는 경우)
      if (d < addDays(now, -1)) d = new Date(now.getFullYear() + 1, mo - 1, da);
      return { text: `${mo}월 ${da}일`, iso: ymd(d) };
    }
  }
  return null;
}

// ── 시간 ───────────────────────────────────────────────────────
/** "저녁 7시", "오후 3시반", "19:30" → { text, hhmm } */
function parseTime(text: string): { text: string; hhmm?: string } | null {
  const hhmm = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  // 1) "오후 7시 30분" / "저녁 7시반" / "7시"
  const k = text.match(/(오전|아침|오후|저녁|밤|낮|새벽)?\s*(\d{1,2})\s*시\s*(반|\d{1,2}\s*분)?/);
  if (k) {
    let h = Number(k[2]);
    if (h > 24) return null;
    let m = 0;
    if (k[3]) m = k[3] === "반" ? 30 : Number(k[3].replace(/\s*분/, ""));
    if (m > 59) m = 0;
    const period = k[1];
    if (period && /오후|저녁|밤/.test(period) && h < 12) h += 12;
    else if (period && /오전|아침/.test(period) && h === 12) h = 0;
    else if (period === "새벽" && h === 12) h = 0;
    // 기간 표시가 없는 "7시"는 사람이 보통 저녁으로 말한다 —
    // 다만 추측이므로 hhmm 만 채우고 원문(text)은 그대로 남긴다.
    if (!period && h >= 1 && h <= 8) h += 12;
    if (h >= 24) h -= 24;
    return { text: k[0].replace(/\s+/g, " ").trim(), hhmm: hhmm(h, m) };
  }

  // 2) "19:30"
  const c = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (c) {
    const h = Number(c[1]);
    const m = Number(c[2]);
    if (h <= 23 && m <= 59) return { text: c[0], hhmm: hhmm(h, m) };
  }
  return null;
}

// ── 예산 ───────────────────────────────────────────────────────
function parseBudget(text: string): string | null {
  // "2만~3만", "2만원대", "3만원 이하", "1만 5천원"
  const range = text.match(/(\d+)\s*만\s*원?\s*[~-]\s*(\d+)\s*만\s*원?/);
  if (range) return `${range[1]}만~${range[2]}만원`;

  const cap = text.match(/(\d+)\s*만\s*원?\s*(이하|이내|미만|안팎|정도|선)/);
  if (cap) return `${cap[1]}만원 ${cap[2]}`;

  const band = text.match(/(\d+)\s*만\s*원?\s*대/);
  if (band) return `${band[1]}만원대`;

  const plain = text.match(/(\d+)\s*만\s*원/);
  if (plain) return `${plain[1]}만원`;

  const thousand = text.match(/(\d+)\s*천\s*원/);
  if (thousand) return `${thousand[1]}천원`;
  return null;
}

// ── 키워드 항목 ────────────────────────────────────────────────
//  [정규식, 저장할 값] 순서대로 보고 처음 걸리는 걸 쓴다.
const PURPOSE: [RegExp, string][] = [
  [/회식|뒤풀이|팀\s*모임/, "회식"],
  [/스터디|공부|과제|팀플/, "스터디"],
  [/데이트|소개팅/, "데이트"],
  [/생일|생파/, "생일"],
  [/동아리|동방/, "동아리"],
  [/미팅|회의/, "회의"],
  [/술\s*모임|술약속/, "술모임"],
];

const MOOD: [RegExp, string][] = [
  [/조용한|조용히|차분/, "조용한"],
  [/시끄러|왁자지껄|활기|신나/, "활기찬"],
  [/아늑|아기자기|분위기\s*좋/, "아늑한"],
  [/깔끔|모던/, "깔끔한"],
];

const ALCOHOL: [RegExp, string][] = [
  [/술\s*안|금주|논알콜|안\s*마시|못\s*마시/, "안 마심"],
  [/가볍게\s*한\s*잔|반주|맥주\s*한/, "가볍게 한잔"],
  [/달리|부어라|끝까지|3차/, "많이"],
  [/소주|맥주|막걸리|와인|하이볼|술/, "마심"],
];

const DIETARY: [RegExp, string][] = [
  // 알러지 · 알레르기 · 알러기 — 표기가 제각각이라 셋 다 받는다
  [/([가-힣]+?)\s*알[러레]르?[기지]/, "$1 알러지"],
  [/비건/, "비건"],
  [/채식/, "채식"],
  [/매운\s*거?\s*(못|안)/, "매운 음식 X"],
  [/해산물\s*(못|안)/, "해산물 X"],
  [/할랄/, "할랄"],
];

function firstMatch(text: string, table: [RegExp, string][]): string | null {
  for (const [re, val] of table) {
    const m = text.match(re);
    if (m) return val.includes("$1") ? val.replace("$1", m[1] ?? "") : val;
  }
  return null;
}

/**
 * 한국어 발화 한 줄에서 모임 선호를 뽑는다.
 *
 * @param text 사용자가 친 문장
 * @param now  상대 날짜("내일") 기준 시각. 테스트에서 고정할 수 있게 인자로 받는다.
 */
export function parseKo(text: string, now: Date = new Date()): ParseResult {
  const prefs: MeetingPrefs = {};
  const matched: (keyof MeetingPrefs)[] = [];
  const t = String(text ?? "");
  if (!t.trim()) return { prefs, matched };

  const d = parseDate(t, now);
  if (d) {
    prefs.dateText = d.text;
    matched.push("dateText");
    if (d.iso) {
      prefs.dateIso = d.iso;
      matched.push("dateIso");
    }
  }

  const tm = parseTime(t);
  if (tm) {
    prefs.timeText = tm.text;
    matched.push("timeText");
    if (tm.hhmm) {
      prefs.timeHhmm = tm.hhmm;
      matched.push("timeHhmm");
    }
  }

  const b = parseBudget(t);
  if (b) {
    prefs.budget = b;
    matched.push("budget");
  }

  const pairs: [keyof MeetingPrefs, string | null][] = [
    ["purpose", firstMatch(t, PURPOSE)],
    ["mood", firstMatch(t, MOOD)],
    ["alcohol", firstMatch(t, ALCOHOL)],
    ["dietary", firstMatch(t, DIETARY)],
  ];
  for (const [key, val] of pairs) {
    if (val) {
      prefs[key] = val;
      matched.push(key);
    }
  }

  return { prefs, matched };
}
