"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IcPlus, IcLogin, IcBell } from "./Icons";
import LoginSheet from "./LoginSheet";
import { useSession } from "./useSession";
import { logout } from "@/lib/session";


// 로고 + 모임 생성(+) · 로그인/계정(→) · 알림(종)
// 회의록 1차: 상단 메뉴는 로그인 필요 영역 → 비회원이 누르면 로그인 유도
export default function V8Header() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [notifOpen, setNotifOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // 로그인 직후 이어서 이동할 곳 (비회원 → 로그인 → 원래 하려던 동작)
  const [afterLogin, setAfterLogin] = useState<string | null>(null);

  function guard(dest: string) {
    if (!session) {
      setAfterLogin(dest);
      setLoginOpen(true);
      return;
    }
    router.push(dest);
  }

  return (
    <header className="v8-header">
      <Link href="/" className="v8-logo" style={{ textDecoration: "none", color: "inherit" }}>
        MOIMER
      </Link>
      <div className="v8-hbtns">
        <button className="v8-iconbtn" title="모임 생성" onClick={() => guard("/meetings?open=create")}>
          <IcPlus />
        </button>

        {/* 모임 참가 — 로그인 상태는 배지로만 표시(목업과 동일).
            로그인 자체는 내정보 탭, 또는 비회원이 이 버튼을 누를 때 뜨는 시트에서 한다. */}
        <button className="v8-iconbtn" title="모임 참가" onClick={() => guard("/meetings?open=join")}>
          <IcLogin />
          {ready && session ? (
            <span className="s-badge" aria-label={session.kind === "kakao" ? "카카오 로그인됨" : "임시 로그인됨"}>
              {session.kind === "kakao" ? "K" : session.name.slice(0, 1)}
            </span>
          ) : null}
        </button>

        <button className="v8-iconbtn" title="알림" onClick={() => setNotifOpen((v) => !v)}>
          <IcBell />
        </button>

        {notifOpen && (
          <div className="v8-notif">
            <h3>알림</h3>
            {/* 실제 알림 발송은 미연동 — 가짜 알림을 채우지 않고 빈 상태를 보여준다 */}
            <p className="faint" style={{ fontSize: 11, margin: "2px 0 0", lineHeight: 1.6 }}>
              아직 받은 알림이 없어요.
            </p>
            {ready && (
              <p className="faint" style={{ fontSize: 10, margin: "8px 0 0" }}>
                {session
                  ? `${session.name}님 · ${session.kind === "kakao" ? "카카오 로그인" : "임시 로그인"}`
                  : "로그인하면 내 모임 알림을 받을 수 있어요."}
              </p>
            )}
            {ready &&
              (session ? (
                <button
                  className="btn ghost sm"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={() => {
                    logout();
                    setNotifOpen(false);
                  }}
                >
                  로그아웃
                </button>
              ) : (
                <button
                  className="btn sm"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={() => {
                    setNotifOpen(false);
                    setLoginOpen(true);
                  }}
                >
                  로그인
                </button>
              ))}
          </div>
        )}
      </div>

      <LoginSheet
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setAfterLogin(null);
        }}
        onDone={() => {
          if (afterLogin) {
            const dest = afterLogin;
            setAfterLogin(null);
            router.push(dest);
          }
        }}
      />
    </header>
  );
}
