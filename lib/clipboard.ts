// ─────────────────────────────────────────────────────────────
// clipboard.ts — 어디서든 되는 복사
//
// ⚠️ **`navigator.clipboard` 는 보안 출처(https · localhost)에서만 존재한다.**
//    우리 발표는 팀원 폰이 `http://10.x.x.x:3000` 으로 들어오는 구조라,
//    그 기기에서는 이 객체 자체가 `undefined` 다. 그래서
//      · `navigator.clipboard.writeText(...)` → TypeError (화면이 죽는다)
//      · `navigator.clipboard?.writeText(...)` → 조용히 아무 일도 안 일어난다
//    둘 다 나쁘다. **초대 링크 공유가 이 앱의 첫 단추**라 조용한 실패가 특히 치명적이다.
//    (2026-08-10: 윈도우 크롬에서 'Write permission denied' 로 실제로 터짐)
//
// 그래서 3단계다:
//   ① 최신 API 가 있으면 그걸 쓴다
//   ② 없거나 거부되면 **숨긴 textarea + execCommand** 로 떨어진다 (http 에서도 된다)
//   ③ 그것도 안 되면 `false` 를 돌려준다 — 호출부가 "직접 복사하세요"를 띄운다
// ─────────────────────────────────────────────────────────────

/** 복사 성공 여부. 실패해도 절대 throw 하지 않는다 (호출부가 안내를 띄운다). */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  // ① 보안 출처에서만 존재한다 — 있으면 이게 가장 안전하다
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부·포커스 없음 등 — ②로 떨어진다
  }

  // ② 폴백: 화면 밖 textarea 를 만들어 선택 후 복사.
  //    구식 API 지만 http 출처·구형 브라우저에서 유일하게 동작한다.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // 화면에 보이면 안 되지만 `display:none` 이면 선택이 안 된다
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 는 select() 만으로는 부족하다
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
