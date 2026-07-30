"use client";

import { useEffect, useState } from "react";

const SLIDES = [
  { head: "출발지를 입력하면\n중간 지점을 추천해 드립니다", sub: "각자 위치에서 가장 공평한 곳을 찾아드려요" },
  { head: "중간 지역을\n직접 설정할 수도 있어요", sub: "모임 장소가 이미 정해졌다면 원하는 지역으로" },
  { head: "모임 생성과 투표로\n다 같이 정해요", sub: "거점 투표 → 가게 투표 → 최종 확정까지" },
];

const KEY = "moimer:v8:splash";

// 첫 방문 시 1회: 로고 + 3단계 안내 슬라이드 자동 전환 후 메인으로
export default function Splash() {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(KEY)) return;
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    if (idx >= SLIDES.length - 1) {
      const t = setTimeout(dismiss, 1800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx((i) => i + 1), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, idx]);

  function dismiss() {
    localStorage.setItem(KEY, "1");
    setFade(true);
    setTimeout(() => setShow(false), 450);
  }

  if (!show) return null;
  const s = SLIDES[idx];
  return (
    <div className={"v8-splash" + (fade ? " fade" : "")}>
      <button className="s-skip" onClick={dismiss}>건너뛰기</button>
      <div className="s-logo">MOIMER</div>
      <div className="s-head">
        {s.head.split("\n").map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      <div className="s-sub">{s.sub}</div>
      <div className="s-dots">
        {SLIDES.map((_, i) => (
          <span key={i} className={i === idx ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
