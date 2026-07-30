"use client";

import { useEffect, useState } from "react";

const KEY = "moimer:v8:splash";

// 차별점 키워드 — "공평한 중간지점"만으로는 기존 서비스와 구분이 안 된다는
// 지적을 반영해, 무엇이 다른지 한눈에 보이게 세 가지를 앞세운다.
const KEYWORDS = ["🤖 AI 맞춤 추천", "🗳️ 함께 투표", "👥 모임 관리"];

// 첫 방문 시 1회 노출되는 인트로.
// 자동 전환 슬라이드가 아니라 한 화면으로 두고 사용자가 눌러서 넘어가게 한다 —
// 자동으로 넘어가면 읽기 전에 사라져 정작 차별점이 전달되지 않았다.
export default function Splash() {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY)) return;
    setShow(true);
  }, []);

  function dismiss() {
    localStorage.setItem(KEY, "1");
    setFade(true);
    setTimeout(() => setShow(false), 450);
  }

  if (!show) return null;
  return (
    <div
      className={"v8-splash" + (fade ? " fade" : "")}
      role="button"
      tabIndex={0}
      onClick={dismiss}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") dismiss();
      }}
    >
      <div className="s-logo">MOIMER</div>
      <div className="s-head">
        <div>우리 사이 어딘가,</div>
        <div>최적의 만남 장소</div>
      </div>
      <div className="s-sub">
        참가자들의 위치와 선호도를 고려해
        <br />
        <b>AI가 완벽한 장소</b>를 추천해드립니다.
      </div>
      <div className="s-keys">
        {KEYWORDS.map((k) => (
          <span key={k}>{k}</span>
        ))}
      </div>
      {/* 화면 어디를 눌러도 넘어가지만, 눌러야 한다는 걸 알려주는 명시적 CTA */}
      <button
        className="s-skip"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        시작하기
      </button>
    </div>
  );
}
