// ─────────────────────────────────────────────────────────────
// identity.ts — 클라이언트 참가자 신원 (localStorage)
// 한 기기에서 여러 참가자로 참여/전환하며 전체 플로우를 테스트할 수 있게 함.
// ─────────────────────────────────────────────────────────────
export interface Identity {
  id: string;
  name: string;
  isLeader: boolean;
}

const key = (code: string) => `moimer:${code.toUpperCase()}`;
const activeKey = (code: string) => `moimer:${code.toUpperCase()}:active`;

export function getIdentities(code: string): Identity[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key(code)) || "[]");
  } catch {
    return [];
  }
}

export function addIdentity(code: string, id: Identity) {
  if (typeof window === "undefined") return;
  const list = getIdentities(code).filter((x) => x.id !== id.id);
  list.push(id);
  localStorage.setItem(key(code), JSON.stringify(list));
  setActive(code, id.id);
}

export function getActive(code: string): Identity | null {
  if (typeof window === "undefined") return null;
  const list = getIdentities(code);
  if (list.length === 0) return null;
  const id = localStorage.getItem(activeKey(code));
  return list.find((x) => x.id === id) || list[0];
}

export function setActive(code: string, id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(activeKey(code), id);
}

// 디버그 시드용: 여러 신원을 한 번에 등록하고 active를 지정
export function setIdentities(code: string, list: Identity[], activeId?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(code), JSON.stringify(list));
  const active = activeId ?? (list[0]?.id ?? "");
  if (active) localStorage.setItem(activeKey(code), active);
}
