/* SSE 알림 버스 — 누가 무엇을 바꿨는지는 안 보낸다.
   '이 모임이 바뀌었다'만 알리고 화면이 다시 받아 간다. 보낼 것을 고르지 않으니 코드가 안 는다. */
type Fn = () => void;
const rooms = new Map<string, Set<Fn>>();

export function listen(code: string, fn: Fn) {
  let s = rooms.get(code);
  if (!s) rooms.set(code, (s = new Set()));
  s.add(fn);
  return () => { s!.delete(fn); if (!s!.size) rooms.delete(code); };
}

export function bump(code: string) {
  rooms.get(code)?.forEach((fn) => { try { fn(); } catch { /* 끊긴 연결은 무시 */ } });
}
