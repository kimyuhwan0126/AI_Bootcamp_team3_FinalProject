/* 시험이 로그인하는 길 — 모든 시험이 여기 하나만 부른다.

   왜 있나: 논의123 으로 **모임 만들기가 로그인 필수**가 됐다(401 login_required).
   카카오 왕복은 사람만 누를 수 있으므로, 시험은 개발용 guest 통로로 진짜 세션을 만든다.
   ⚠ guest 통로를 진짜 서비스에도 열어 둘지는 사람이 정해야 한다 (lib/auth.ts 참고).

   시험 파일마다 베끼지 않는다 — 로그인하는 방법이 바뀌면 고칠 자리가 하나여야 한다.
   부르는 쪽은 `person()` 처럼 `call` 하나만 있으면 된다(쿠키 항아리를 스스로 든다) —
   `get` 을 안 가진 person 도 있어서 여기서는 call 만 쓴다. */

/** 이 사람에게 진짜 세션을 준다. 이름이 같으면 늘 같은 계정이다. */
export async function 로그인(누가, 이름 = '시험방장') {
  const csrf = JSON.parse((await 누가.call('/api/auth/csrf')).text)?.csrfToken;
  if (!csrf) return false;
  /* NextAuth 의 Credentials 통로는 폼 모양(urlencoded)으로 받는다.
     json:true 를 실어야 302 대신 200 JSON 으로 답해 준다 — 리다이렉트를 따라갈 필요가 없다. */
  const r = await 누가.call('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf, nickname: 이름, json: 'true' }).toString(),
  });
  return r.status === 200;
}

/** 브라우저(playwright) 안에서 로그인한다 — 크롬으로 여는 시험용.
    페이지가 이미 우리 주소에 있어야 한다(같은 출처라야 쿠키가 붙는다). */
export const 브라우저로그인 = (page, 이름 = '시험방장') => page.evaluate(async (n) => {
  const { csrfToken } = await (await fetch('/api/auth/csrf')).json();
  const r = await fetch('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, nickname: n, json: 'true' }).toString(),
  });
  return r.status;
}, 이름);
