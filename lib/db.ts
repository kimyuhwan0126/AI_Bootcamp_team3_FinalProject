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
  return u.replace(/^([a-z+]+:\/\/[^:@/]+):[^@]*@/i, "$1:***@");
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
