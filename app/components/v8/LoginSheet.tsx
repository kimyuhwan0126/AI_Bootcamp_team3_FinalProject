"use client";

// ─────────────────────────────────────────────────────────────
// LoginSheet — 로그인 모달
//  · 임시 로그인: 이름만 입력 (회원가입을 강제하지 않는다 — 회의록 1차)
//  · 카카오 로그인: 정식회원 승격
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { loginAsGuest } from "@/lib/session";

export default function LoginSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    const s = loginAsGuest(name);
    if (!s) {
      setErr("이름을 입력해주세요.");
      inputRef.current?.focus();
      return;
    }
    setName("");
    onDone?.();
    onClose();
  }

  return (
    <div className="v8-overlay" onClick={onClose}>
      <div className="v8-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="로그인">
        <h2>로그인</h2>
        <p className="m-sub">가입하지 않아도, 이름만 있으면 모임을 만들고 투표할 수 있어요.</p>

        <label htmlFor="guest-name" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
          이름 (닉네임)
        </label>
        <input
          id="guest-name"
          ref={inputRef}
          className="input"
          value={name}
          maxLength={20}
          placeholder="예: 김유환"
          onChange={(e) => {
            setName(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {err && (
          <div style={{ color: "var(--danger)", fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>{err}</div>
        )}

        <button className="btn primary" style={{ marginTop: 12 }} onClick={submit}>
          이름으로 시작하기
        </button>
        <p className="m-sub" style={{ margin: "8px 0 0", fontSize: 11 }}>
          임시 로그인은 <b>이 기기에만</b> 저장돼요. 다른 기기에서 이어보려면 카카오 로그인이 필요해요.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0" }}>
          <span style={{ flex: 1, height: 1, background: "var(--hair)" }} />
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>또는</span>
          <span style={{ flex: 1, height: 1, background: "var(--hair)" }} />
        </div>

        <a href="/api/auth/kakao" className="btn kakao" style={{ textDecoration: "none" }}>
          카카오로 로그인
        </a>

        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
