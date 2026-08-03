// ─────────────────────────────────────────────────────────────
// db.ts — 서버 전용 Neon(Postgres) 클라이언트
//
//  모든 DB 접근은 Next.js API 라우트(서버)에서만 일어난다. Neon 은 Supabase 와
//  달리 브라우저용 anon 키 개념이 없다 — DATABASE_URL 하나가 전부이고, 그 안에
//  비밀번호가 들어 있으므로 **절대 NEXT_PUBLIC_ 로 만들지 않는다.**
//  값이 없으면 null 을 돌려주고, store.ts 가 인메모리로 폴백한다 —
//  `npm run dev` 만으로 아무 설정 없이 전체 플로우 시연이 가능해야 하기 때문.
// ─────────────────────────────────────────────────────────────
import { neon } from "@neondatabase/serverless";

export type Sql = ReturnType<typeof neon>;

const rawUrl = process.env.DATABASE_URL || "";
const url = rawUrl.trim();

// HMR/서버리스 재로드마다 새로 만들지 않는다 (Supabase 시절과 같은 패턴).
// neon() 은 HTTP 기반이라 커넥션을 쥐고 있지는 않지만, URL 파싱을 반복할 이유가 없다.
const g = globalThis as unknown as { __moimerDb?: Sql | null };

function build(): Sql | null {
  if (!url) return null;
  try {
    return neon(url);
  } catch {
    // URL 형식이 아예 깨진 경우(neon() 이 생성자에서 던진다).
    // configured=true + ready=false 로 진단에 걸리도록 null 만 돌려준다.
    return null;
  }
}

export const db: Sql | null = g.__moimerDb !== undefined ? g.__moimerDb : (g.__moimerDb = build());

/** DB가 붙어 있는지 — 화면·진단에서 "인메모리인지 DB인지" 표시하는 데 쓴다 */
export const hasDb = !!db;

/** DATABASE_URL 이 설정돼 있는지 (형식이 깨져 클라이언트 생성에 실패한 경우 포함) */
export const dbConfigured = !!url;

/**
 * 앱이 실제로 접속을 시도하는 DB 주소 (진단용).
 *
 * `fetch failed` 는 원인을 전혀 말해주지 않는다 — 오타든 끝의 슬래시든
 * 값 뒤 공백이든 똑같이 그 한 줄만 나온다. 그래서 "앱이 무슨 주소로 갔는지"를
 * 보여준다. Neon 콘솔의 Connection string 과 대조하면 끝난다.
 *
 * ⚠️ Supabase URL 과 달리 **DATABASE_URL 에는 비밀번호가 들어 있다.**
 *    그래서 원문이 아니라 비밀번호를 *** 로 가린 masked 값만 노출한다.
 *    (호스트·DB 이름·사용자명은 오타 진단에 필요하고 비밀이 아니다)
 */
function maskPassword(u: string): string {
  // postgres://user:password@host/db → postgres://user:***@host/db
  //
  // ⚠️ 정규식 "스킴으로 시작할 때만 매칭" 방식은 금지 — 스킴이 빠진 값
  // (`u:pw@h/db`, `psql 'postgresql://…'` 통째 복사)에서 매칭이 실패하면
  // replace 가 원문을 그대로 돌려줘 비밀번호가 노출된다. 하필 그 경우가
  // 접속 실패 → 진단 노출로 이어지는 바로 그 상황이다 (PR #15 리뷰에서 발견).
  const at = u.lastIndexOf("@"); // 비밀번호에 @ 가 섞여도 마지막 @ 가 host 경계다
  if (at < 0) return u; // 계정부가 없으면 가릴 것도 없다
  const schemeEnd = u.indexOf("://");
  const colon = u.indexOf(":", schemeEnd >= 0 ? schemeEnd + 3 : 0);
  if (colon < 0 || colon > at) return u; // user 만 있고 비밀번호가 없는 형태
  return `${u.slice(0, colon + 1)}***${u.slice(at)}`;
}

/**
 * 오류 메시지를 밖으로 내보내기 전에 자격증명을 가린다.
 *
 * 드라이버·런타임에 따라 접속 실패 메시지에 주소가 통째로 섞여 나온다.
 * `DATABASE_URL` 에는 비밀번호가 들어 있으므로 그대로 응답에 실으면 사고다 —
 * `/api/status` 의 masked 노출과 같은 원칙을 오류 경로에도 적용한다.
 */
export function sanitizeDbError(message: string): string {
  let out = message;
  // ① 설정된 주소가 원문 그대로 섞인 경우 — masked 로 통째 치환
  if (url && out.includes(url)) out = out.split(url).join(dbUrlInfo.masked);
  // ② 그 외 형태의 자격증명(scheme://user:pw@)도 가린다.
  //    비밀번호 쪽은 `[^\s@]*` 로 잡으면 안 된다 — 첫 @ 에서 멈춰
  //    `u:p@ssSECRET@host` 의 뒷부분이 그대로 남는다(PR #15 🟡2 와 같은 실수).
  //    공백 전까지 greedy 로 마지막 @ 를 host 경계로 잡는다.
  return out.replace(/[a-z+]+:\/\/[^\s/@]+:[^\s]*@/gi, (m) => maskPassword(m));
}

export const dbUrlInfo = {
  /** 비밀번호를 가린 주소 — 원문은 절대 내보내지 않는다 */
  masked: maskPassword(url),
  len: rawUrl.length,
  trimmedLen: url.length,
  endsWithSlash: url.endsWith("/"),
  hasScheme: /^postgres(ql)?:\/\//.test(url),
  hasCredentials: /^[a-z+]+:\/\/[^:@/]+:[^@]+@/i.test(url),
};
