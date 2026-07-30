"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록 — "홈 화면에 추가"와 APK(TWA) 의 전제 조건.
 *
 * 개발 중에는 등록하지 않는다. 서비스 워커가 살아있으면 코드를 고쳐도 옛 화면이
 * 나오는 일이 생겨서, 원인을 엉뚱한 데서 찾게 된다.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.warn("[pwa] 서비스 워커 등록 실패", e);
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
