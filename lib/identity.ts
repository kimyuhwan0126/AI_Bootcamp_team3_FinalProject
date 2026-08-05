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
    // ⚠️ JSON 파싱 성공 ≠ 우리가 기대한 모양. 이 값이 배열이 아니면 호출부의
    //    `.filter`/`.find` 에서 터지고, /m/[code]·/votes·/members 세 화면이
    //    통째로 `Application error` 가 된다 — UI 로 복구할 방법이 없다
    //    (2026-08-05 검증에서 재현). 저장 형식이 바뀌는 앱 업데이트에서도 같은 일이 난다.
    const raw: unknown = JSON.parse(localStorage.getItem(key(code)) || "[]");
    if (!Array.isArray(raw)) return [];
    // 항목 모양까지 본다 — 배열이어도 안이 문자열이면 `x.id` 에서 같은 사고가 난다
    return raw.filter(
      (x): x is Identity => !!x && typeof x === "object" && typeof (x as Identity).id === "string"
    );
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
