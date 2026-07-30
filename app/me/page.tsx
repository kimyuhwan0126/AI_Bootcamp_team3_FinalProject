"use client";

// ─────────────────────────────────────────────────────────────
// v7 내정보 탭 — 목업의 마이페이지 (저장 위치 · 이동수단 · 스케줄)
//  저장 위치/이동수단은 localStorage에 보관되어 다음 모임에 재사용.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import BottomNav from "../components/v7/BottomNav";
import V7Header from "../components/v7/V7Header";
import { IcPin, IcWalk, IcTransit, IcCar, IcRefresh, IcLogout, IcPerson } from "../components/v7/Icons";
import LoginSheet from "../components/v7/LoginSheet";
import { useSession } from "../components/v7/useSession";
import { logout, sessionLabel } from "@/lib/session";

const PROFILE_KEY = "moimer:v7:profile";

interface Profile {
  savedPlaces: string[];
  transport: "transit" | "car";
}

const DEFAULT_PROFILE: Profile = { savedPlaces: [], transport: "transit" };

export default function MePage() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [placeInput, setPlaceInput] = useState("");
  const { session, ready } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      // 도보 옵션 제거 이전에 저장된 값 보정 (walk → transit)
      if (p) setProfile({ ...DEFAULT_PROFILE, ...p, transport: p.transport === "car" ? "car" : "transit" });
    } catch {
      /* 무시 */
    }
  }, []);

  function save(next: Profile) {
    setProfile(next);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }

  function addPlace() {
    const v = placeInput.trim();
    if (!v || profile.savedPlaces.includes(v)) return;
    save({ ...profile, savedPlaces: [...profile.savedPlaces, v] });
    setPlaceInput("");
  }

  return (
    <main className="device v7-page">
      <V7Header />

      <div className="row" style={{ padding: "6px 16px 14px", gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--ac-soft)", color: "var(--ac-deep)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 20, height: 20, display: "inline-flex" }}><IcPerson /></span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{session ? session.name : "비회원"}</div>
          <div className="faint" style={{ fontSize: 11 }}>
            {ready ? sessionLabel(session) : " "}
          </div>
        </div>
        {ready && !session && (
          <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setLoginOpen(true)}>
            로그인
          </button>
        )}
        {ready && session?.kind === "guest" && (
          <a href="/api/auth/kakao" className="btn kakao sm" style={{ marginLeft: "auto", textDecoration: "none" }}>
            카카오로 전환
          </a>
        )}
      </div>

      <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />

      <div className="v7-mycard">
        <div className="t"><IcPin />내 저장 위치</div>
        <div className="d">자주 가는 출발지를 미리 등록해두면, 모임을 만들 때 바로 불러와요.</div>
        <div className="v7-tags">
          {profile.savedPlaces.length === 0 && <span className="faint" style={{ fontSize: 11 }}>아직 저장된 위치가 없어요.</span>}
          {profile.savedPlaces.map((p) => (
            <button key={p} className="v7-tag" onClick={() => save({ ...profile, savedPlaces: profile.savedPlaces.filter((x) => x !== p) })}>
              {p} ✕
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" style={{ padding: "9px 12px", fontSize: 12.5 }} value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlace()} placeholder="예: 강남, 홍대입구" />
          <button className="btn sm" onClick={addPlace}>+ 추가</button>
        </div>
      </div>

      <div className="v7-mycard">
        <div className="t"><IcWalk />애용 이동수단</div>
        <div className="d">새로 만드는 모임에 이 이동수단이 기본으로 적용돼요.</div>
        <div className="v7-trans">
          <button className={profile.transport === "transit" ? "on" : ""} onClick={() => save({ ...profile, transport: "transit" })}><IcTransit />대중교통</button>
          <button className={profile.transport === "car" ? "on" : ""} onClick={() => save({ ...profile, transport: "car" })}><IcCar />차량</button>
        </div>
      </div>

      <div className="v7-mycard">
        <div className="t"><IcRefresh />스케줄 가져오기</div>
        <div className="d">구글 캘린더에서 일정을 가져와 모임 조율에 활용하는 기능 — 팀 결정에 따라 후순위로 분류되어 다음 단계에서 연결돼요.</div>
        <button className="btn ghost sm" disabled>구글 캘린더에서 가져오기 (준비 중)</button>
      </div>

      <div className="v7-mycard">
        <div className="t">계정</div>
        {ready && session ? (
          <>
            <div className="d" style={{ marginBottom: 8 }}>
              {session.kind === "guest"
                ? "임시 로그인 상태예요. 로그아웃하면 이 기기의 임시 키가 즉시 삭제돼요."
                : "카카오 계정으로 로그인되어 있어요."}
            </div>
            <button
              className="row"
              style={{ border: 0, background: "none", color: "var(--danger)", fontSize: 12.5, fontWeight: 800, gap: 6, cursor: "pointer", font: "inherit", padding: 0 }}
              onClick={logout}
            >
              <span style={{ width: 14, height: 14, display: "inline-flex" }}><IcLogout /></span> 로그아웃
            </button>
          </>
        ) : (
          <div className="faint" style={{ fontSize: 11 }}>로그인하지 않은 상태예요.</div>
        )}
      </div>

      <BottomNav active="me" />
    </main>
  );
}
