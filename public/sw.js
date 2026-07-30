/* ─────────────────────────────────────────────────────────────
 * 모이머 서비스 워커 — 일부러 최소한만 한다.
 *
 * ⚠️ 이 파일을 "똑똑하게" 만들지 말 것.
 *    이 앱은 1.8초마다 폴링해서 남의 투표를 받아온다. 서비스 워커가 응답을
 *    캐시하면 **투표가 반영 안 되는 것처럼 보이는 버그**가 나고, 원인을 찾기
 *    극도로 어렵다(브라우저를 껐다 켜도 캐시가 남는다).
 *    그래서 아래 세 가지는 절대 캐시하지 않는다:
 *      · /api/*        — 모임 상태·투표·채팅
 *      · GET 이 아닌 요청
 *      · 다른 출처(카카오맵 SDK 등)
 *
 *    하는 일은 하나뿐이다: 오프라인일 때 안내 페이지를 보여준다.
 *    (설치 가능한 PWA 가 되려면 fetch 핸들러가 하나는 있어야 한다)
 * ───────────────────────────────────────────────────────────── */

const CACHE = "moimer-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 카카오맵 SDK 등은 손대지 않는다
  if (url.pathname.startsWith("/api/")) return; // 모임 상태는 절대 캐시하지 않는다

  // 페이지 이동만 처리한다. 네트워크 우선, 실패하면 오프라인 안내.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
