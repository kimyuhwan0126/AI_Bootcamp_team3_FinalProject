// ─────────────────────────────────────────────────────────────
// supabase.ts — 서버 전용 Supabase 클라이언트
//
//  모든 DB 접근은 Next.js API 라우트(서버)에서만 일어난다. 그래서 RLS는
//  켜 둔 채(= 브라우저에서 직접 접근 불가) 서버는 service_role 키로 우회한다.
//  키가 없으면 null 을 돌려주고, store.ts 가 인메모리로 폴백한다 —
//  `npm run dev` 만으로 아무 설정 없이 전체 플로우 시연이 가능해야 하기 때문.
// ─────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
// service_role 이 있으면 그걸 쓴다(RLS 우회 · 서버 전용).
// anon 키만 있으면 RLS를 끈 상태여야 읽기/쓰기가 통한다.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const key = serviceKey || anonKey;

// HMR/서버리스 재로드마다 클라이언트를 새로 만들면 커넥션이 쌓인다
const g = globalThis as unknown as { __moimerSupabase?: SupabaseClient | null };

function build(): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabase: SupabaseClient | null =
  g.__moimerSupabase !== undefined ? g.__moimerSupabase : (g.__moimerSupabase = build());

/** DB가 붙어 있는지 — 화면·진단에서 "인메모리인지 DB인지" 표시하는 데 쓴다 */
export const hasSupabase = !!supabase;

/** 어떤 키로 붙었는지 (진단용 — 키 값은 절대 노출하지 않는다) */
export const supabaseKeyKind: "service_role" | "anon" | "none" = serviceKey
  ? "service_role"
  : anonKey
  ? "anon"
  : "none";
