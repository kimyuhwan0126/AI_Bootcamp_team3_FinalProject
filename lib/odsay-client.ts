// ─────────────────────────────────────────────────────────────
// odsay-client.ts — ODsay 호출 껍데기(프록시 경유)와 실패 진단 로그
//
// `odsay.ts` 에서 떼어냈다. 그 파일은 **응답을 해석하는 곳**이고 여기는
// **어디로 어떻게 부르고, 실패를 어떻게 남기는가**만 다룬다. 관심사가 다르고,
// `odsay.ts` 가 400줄 제한(CLAUDE.md §3)에 걸려 나눌 자리로 여기가 가장 자연스러웠다.
//
// 🔑 이 파일의 함수는 **절대 전체 URL 을 로그에 찍지 않는다** — 쿼리에 `apiKey` 가
//    들어 있어 그대로 남기면 Vercel 로그에 키가 평문으로 박힌다.
// ─────────────────────────────────────────────────────────────
import { env } from "./env";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ── 프록시 경유 ────────────────────────────────────────────────
// ODsay 서버 키는 호출 IP 화이트리스트가 필요한데 Vercel 은 나가는 IP 가 유동이다.
// `ODSAY_BASE_URL` 로 고정 IP 프록시를 가리키게 하고, 공유 비밀이 있으면 헤더로 보낸다.
// ⚠️ 둘 다 비어 있으면 base 는 api.odsay.com, init 은 undefined 라 **기존과 동일**하다.
export const PROXY_INIT: RequestInit | undefined = env.odsayProxySecret
  ? { headers: { "x-proxy-secret": env.odsayProxySecret } }
  : undefined;

/**
 * ODsay 는 **인증 실패에도 HTTP 200** 을 준다:
 *   `{"error":[{"code":"500","message":"[ApiKeyAuthFailed] ..."}]}`
 * `if (!r.ok)` 로는 못 잡고 뒤에서 우연히 걸러질 뿐이라, 여기서 명시적으로 본다.
 *
 * `console.warn` 을 남기는 게 핵심이다 — Vercel 로그에서 **"터널 장애"와 "키 문제"를
 * 구분**할 수 있어야 프록시를 붙인 의미가 있다.
 */
export function odsayError(d: unknown): boolean {
  if (typeof d !== "object" || d === null) return false;
  const err = (d as { error?: unknown }).error;
  if (err === null || err === undefined) return false;

  // ⚠️ ODsay 는 error 를 **두 가지 형태**로 보낸다 — 배열만 보면 절반을 놓친다.
  //    배열: {"error":[{"code":"500","message":"[ApiKeyAuthFailed] ..."}]}   인증 실패
  //    객체: {"error":{"code":"429","message":"Too Many Requests"}}          속도 제한
  //          {"error":{"code":"-98","msg":"출, 도착지가 700m이내입니다."}}   근거리
  //
  //    예전엔 `!Array.isArray(err) → return false` 라 **객체형이 통과**했고,
  //    뒤에서 `result.path` 가 없다는 이유로 warnEmpty 가 찍혀
  //    **"구간을 못 푸는 것으로 보인다"** 는 사실과 다른 진단이 남았다.
  //    실제 사유는 429(호출 과다)였다 — 같은 구간이 순차 호출에선 전부 성공한다
  //    (2026-08-05 동시 14건 vs 순차 14건 실측: 429 9건 → 0건).
  //
  //    ⚠️ `msg` 키도 함께 본다. -98 은 `message` 가 아니라 `msg` 로 온다.
  //
  //    🔴 이 본문은 이 파일이 `odsay.ts` 에서 추출될 때 **옛 버전이 따라왔다.**
  //       머지(3/3)에서 최신 본문으로 다시 이식했다. 이 파일을 옮기거나 다시
  //       추출할 일이 있으면 **여기가 최신인지 반드시 확인할 것** — 빌드는
  //       그대로 통과하므로 잃어버려도 티가 안 난다.
  const first = (Array.isArray(err) ? err[0] : err) as
    | { message?: unknown; msg?: unknown; code?: unknown }
    | undefined;
  if (!first) return false;

  // code 는 실측상 전부 문자열이었지만("429"·"-98"·"500"), 숫자로 와도
  // 진단이 "unknown" 으로 죽지 않게 둘 다 받는다.
  const code =
    typeof first.code === "number" ? String(first.code) : str(first.code);
  const text = str(first.message) || str(first.msg);
  console.warn("[odsay]", text || "(메시지 없음)", code ? `(code ${code})` : "");
  return true;
}

/**
 * 로그에 실을 호출 대상. **호스트만** 쓴다 — 전체 URL 에는 `apiKey` 가 들어 있어
 * 그대로 찍으면 Vercel 로그에 키가 평문으로 남는다.
 */
function odsayHost(): string {
  try {
    return new URL(env.odsayBase).host;
  } catch {
    return `(ODSAY_BASE_URL 형식 오류: ${env.odsayBase.slice(0, 30)})`;
  }
}

/**
 * 2xx 가 아닌 응답. **프록시·터널 장애가 여기로 온다** — Cloudflare 502/1033(터널
 * 다운) · 프록시 401/403(공유 비밀 불일치)이 전부 이 경로다.
 *
 * ⚠️ 예전에는 `if (!r.ok) return null` 이라 **로그 한 줄 없이 사라졌다.**
 *    #28 이 "로그로 터널 장애와 키 문제를 구분한다"고 했지만 실제로는 구분이
 *    안 됐다 — 2026-08-04 종단 확인에서 `live:false` 의 원인을 좁히지 못해 드러났다.
 */
export function warnHttp(label: string, status: number): void {
  console.warn(`[odsay] ${label} HTTP ${status} (via ${odsayHost()}) — 프록시/터널 응답으로 보인다`);
}

/** fetch 가 던진 경우. 터널 주소가 죽었거나 DNS 가 안 풀린다. */
export function warnThrown(label: string, e: unknown): void {
  console.warn(`[odsay] ${label} 요청 실패 (via ${odsayHost()}): ${e instanceof Error ? e.message : String(e)}`);
}

/** HTTP 200 · 에러본문도 없는데 경로가 비어 있는 경우 — ODsay 가 못 푸는 구간이다. */
export function warnEmpty(label: string): void {
  console.warn(`[odsay] ${label} 200 인데 경로가 비어 있다 (via ${odsayHost()}) — 구간을 못 푸는 것으로 보인다`);
}
