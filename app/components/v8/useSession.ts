"use client";

import { useEffect, useState } from "react";
import { getSession, subscribeSession, type Session } from "@/lib/session";

/**
 * 세션 훅 — localStorage 기반이라 SSR에선 항상 null로 시작하고
 * 마운트 후 실제 값으로 채운다(하이드레이션 불일치 방지).
 * ready=false 동안은 로그인 여부를 단정하지 않는다.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    setReady(true);
    const unsub = subscribeSession(sync);
    // 다른 탭에서 로그인/로그아웃한 경우도 반영
    window.addEventListener("storage", sync);
    return () => {
      unsub();
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { session, ready };
}
