// ─────────────────────────────────────────────────────────────
// session.ts — 로그인 3단계 (회의록 1차 §2 "로그인 레벨 3단계")
//
//   비회원   : 세션 없음. 메인 화면 탐색만 가능
//   임시회원 : 이름만 입력 → 기기에 임시 키 저장. 모임 생성·참가·투표 가능
//   정식회원 : 카카오 로그인. 임시회원 기능 + 설정이 계정에 연결
//
// 임시 키는 이 기기 localStorage 에만 보관하며 서버로 보내지 않는다
// (본인인증 미도입 결정 — 회의록 1차). 로그아웃하면 즉시 소멸한다.
// ─────────────────────────────────────────────────────────────

export type SessionKind = "guest" | "kakao";

export interface Session {
  kind: SessionKind;
  name: string;
  /** 임시회원 식별용 기기 로컬 키. 정식회원에겐 없음 */
  tempKey?: string;
  createdAt: number;
}

const KEY = "moimer:session";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** 세션 변경 구독 — 같은 탭의 다른 컴포넌트도 즉시 갱신되도록 */
export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.name !== "string" || !s.name) return null;
    if (s.kind !== "guest" && s.kind !== "kakao") return null;
    return s;
  } catch {
    return null;
  }
}

function write(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
  emit();
}

/** 임시회원 로그인 — 이름만 받고 기기 로컬 키를 발급한다 */
export function loginAsGuest(rawName: string): Session | null {
  const name = rawName.trim().slice(0, 20);
  if (!name) return null;
  const s: Session = {
    kind: "guest",
    name,
    tempKey: `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  write(s);
  return s;
}

/** 정식회원 로그인 — 카카오 콜백에서 닉네임을 받아 승격 */
export function loginAsKakao(rawName: string): Session | null {
  const name = rawName.trim().slice(0, 20);
  if (!name) return null;
  const s: Session = { kind: "kakao", name, createdAt: Date.now() };
  write(s);
  return s;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  emit();
}

/** 화면 표기용 라벨 */
export function sessionLabel(s: Session | null): string {
  if (!s) return "비회원";
  return s.kind === "kakao" ? "카카오 로그인됨" : "임시 로그인 (이 기기에만 저장)";
}
