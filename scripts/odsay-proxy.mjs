#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// odsay-proxy.mjs — ODsay 중계 서버 (배포용 우회로의 **받는 쪽**)
//
//  왜 필요한가
//   ODsay 서버 키는 "호출하는 서버의 공인 IP"를 화이트리스트에 등록해야 통한다.
//   그런데 Vercel 서버리스는 나가는 IP 가 유동이라 등록할 수가 없다.
//   그래서 **화이트리스트에 등록된 노트북**에서 이 서버를 띄우고,
//   Cloudflare Tunnel 로 공개 주소를 만들어 Vercel 이 그리로 부르게 한다.
//
//     Vercel(유동 IP) ──→ Cloudflare Tunnel ──→ 이 서버(등록된 IP) ──→ api.odsay.com
//
//   보내는 쪽은 `lib/odsay-client.ts` 다 (`ODSAY_BASE_URL` · `x-proxy-secret`).
//   지금까지 **받는 쪽 코드가 저장소에 없어서** 터널을 다시 세울 때마다 처음부터
//   만들어야 했다(2026-08-13 확인: `x-proxy-secret` 이 저장소에서 보내는 쪽에만 있었다).
//   그 반복을 없애려고 여기 넣는다.
//
//  실행 (화이트리스트 등록된 노트북에서)
//     ODSAY_PROXY_SECRET=아무거나긴문자열 node scripts/odsay-proxy.mjs
//     cloudflared tunnel --url http://localhost:8787      # 다른 터미널
//
//   그 다음 Vercel 환경변수 (자세히는 docs/ODsay_터널_런북.md)
//     ODSAY_BASE_URL     = cloudflared 가 출력한 https://....trycloudflare.com
//     ODSAY_PROXY_SECRET = 위에서 쓴 그 문자열 (**글자 단위로 같아야 한다**)
//     ODSAY_API_KEY      = ODsay 서버 키
//
//  ⚠️ 이 서버는 키를 갖고 있지 않다. `apiKey` 는 앱이 쿼리에 실어 보내고 우리는
//     그대로 넘긴다. 그래서 **로그에 전체 URL 을 찍으면 키가 평문으로 남는다** —
//     `safePath()` 로 반드시 가린다 (`lib/odsay-client.ts` 와 같은 원칙).
//  ⚠️ 127.0.0.1 에만 바인딩한다. 공개는 cloudflared 가 하는 일이지 이 서버가 아니다.
//     0.0.0.0 으로 열면 같은 Wi-Fi 의 아무나 이 중계를 쓸 수 있다.
//  ⚠️ 의존성 0 — `npm install` 없이 노트북에서 바로 돈다 (Node 18+, 저장소는 22).
// ─────────────────────────────────────────────────────────────
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.ODSAY_PROXY_PORT || 8787);
const SECRET = (process.env.ODSAY_PROXY_SECRET || "").trim();
//  ⚠️ `ODSAY_UPSTREAM` 은 **시험용 탈출구**다. 녹화해 둔 응답을 돌려주는 로컬
//     replay 서버를 끼우면 터널·중계·앱까지 전 구간을 💰 0콜로 확인할 수 있다.
//     평상시에는 넣지 않는다 — 비어 있으면 진짜 ODsay 로 간다.
const UPSTREAM = (process.env.ODSAY_UPSTREAM || "https://api.odsay.com").trim().replace(/\/+$/, "");

/**
 * 중계를 허용할 경로. 앱이 실제로 부르는 두 개만 연다 (`lib/odsay.ts`).
 * 터널 주소는 공개라 아무나 두드릴 수 있으므로, 넓게 열어 둘 이유가 없다.
 * 앱에 새 ODsay 엔드포인트를 붙이면 여기도 함께 추가한다.
 */
const ALLOWED = new Set(["/v1/api/searchPubTransPathT", "/v1/api/loadLane"]);

/** 업스트림이 늘어질 때 Vercel 함수 실행시간이 같이 늘어나는 걸 막는다. */
const UPSTREAM_TIMEOUT_MS = 10_000;

// 8/4 실패를 되짚을 때 실제로 본 것이 이 숫자들이다 — 401 이 쌓이면 공유 비밀
// 불일치, 502 가 쌓이면 업스트림 장애로 바로 갈린다.
const count = { ok: 0, unauthorized: 0, notFound: 0, upstreamError: 0, timeout: 0 };

/** 공유 비밀 비교. 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다. */
function secretOk(given) {
  if (!SECRET) return true; // 비밀 미설정 → 검사하지 않음 (로컬 실험용)
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 로그용 경로 — `apiKey` 를 가린다. 좌표는 비밀이 아니라 그대로 둔다(진단에 쓴다). */
function safePath(url) {
  const q = new URLSearchParams(url.search);
  if (q.has("apiKey")) q.set("apiKey", "***");
  const s = q.toString();
  return url.pathname + (s ? `?${s}` : "");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // ── 터널 생존 확인 — 💰 ODsay 0콜 ──────────────────────────
  //  터널이 살아 있는지 보려고 실제 경로검색을 부르면 무료 한도(1,000콜/일)를
  //  태운다. 공유 비밀도 요구하지 않는다 — 브라우저로 바로 열어볼 수 있어야
  //  "터널이 죽었나 / 비밀이 틀렸나"를 한 번에 가를 수 있다.
  if (url.pathname === "/healthz") {
    return send(
      res,
      200,
      JSON.stringify({ ok: true, upstream: UPSTREAM, secretRequired: !!SECRET, count }, null, 2)
    );
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    count.notFound++;
    return send(res, 405, JSON.stringify({ error: "method not allowed" }));
  }

  if (!ALLOWED.has(url.pathname)) {
    count.notFound++;
    console.warn(`[proxy] 404 ${url.pathname} — 허용 목록에 없음`);
    return send(res, 404, JSON.stringify({ error: "not found" }));
  }

  if (!secretOk(req.headers["x-proxy-secret"])) {
    count.unauthorized++;
    // 8/4 실패의 진짜 원인이 이것이었다 — 앱이 헤더를 안 보내 프록시가 401 을
    // 줬는데, 당시 앱 코드가 로그 없이 삼켜서 원인을 못 좁혔다.
    console.warn(`[proxy] 401 ${url.pathname} — x-proxy-secret 불일치/누락`);
    return send(res, 401, JSON.stringify({ error: "unauthorized" }));
  }

  const target = `${UPSTREAM}${url.pathname}${url.search}`;
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const body = await upstream.text();
    if (upstream.ok) count.ok++;
    else count.upstreamError++;
    console.log(`[proxy] ${upstream.status} ${safePath(url)}`);
    return send(
      res,
      upstream.status,
      body,
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    if (timedOut) count.timeout++;
    else count.upstreamError++;
    console.warn(
      `[proxy] 502 ${safePath(url)} — ${timedOut ? `업스트림 ${UPSTREAM_TIMEOUT_MS}ms 초과` : String(e)}`
    );
    return send(res, 502, JSON.stringify({ error: "upstream failed" }));
  }
});

// 127.0.0.1 고정 — 공개는 cloudflared 가 한다 (위 ⚠️ 참고).
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[proxy] http://127.0.0.1:${PORT} → ${UPSTREAM}`);
  console.log(`[proxy] 허용 경로: ${[...ALLOWED].join(" · ")}`);
  console.log(
    SECRET
      ? `[proxy] x-proxy-secret 검사 ON (길이 ${SECRET.length})`
      : `[proxy] ⚠️ x-proxy-secret 검사 OFF — ODSAY_PROXY_SECRET 를 넣어 켜세요`
  );
  console.log(`[proxy] 다음: cloudflared tunnel --url http://localhost:${PORT}`);
});

// 종료할 때 집계를 한 번 남긴다 — 세션이 끝난 뒤 "몇 건이 401 이었나"를
// 스크롤을 뒤지지 않고 확인할 수 있어야 한다.
process.on("SIGINT", () => {
  console.log(`\n[proxy] 집계 ${JSON.stringify(count)}`);
  server.close(() => process.exit(0));
});
