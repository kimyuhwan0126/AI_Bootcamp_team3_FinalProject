"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Diag {
  has: { kakaoLogin: boolean; kakaoGeocode: boolean; odsay: boolean; tmap: boolean };
  kakao: any;
  odsay: any;
  tmap: any;
  parsed: { geocode: any; transit: any; car: any };
  callerIP?: string;
}

function Badge({ live }: { live: boolean }) {
  return (
    <span
      className={"chip " + (live ? "ok" : "warn")}
      style={{ fontSize: 11, padding: "4px 10px" }}
    >
      {live ? "● LIVE" : "○ mock"}
    </span>
  );
}

export default function ApiLive() {
  const [d, setD] = useState<Diag | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ts, setTs] = useState<string>("");

  async function load() {
    setErr(null);
    try {
      const r = await fetch("/api/diag", { cache: "no-store" });
      if (!r.ok) throw new Error("진단 엔드포인트를 사용할 수 없어요 (개발 모드 전용).");
      setD(await r.json());
      setTs(new Date().toLocaleTimeString("ko-KR"));
    } catch (e: any) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const geoOk = !!d && typeof d.parsed?.geocode === "object" && d.parsed.geocode?.lat;
  const transitOk = !!d && typeof d.parsed?.transit === "object" && d.parsed.transit;
  const carOk = !!d && typeof d.parsed?.car === "object" && d.parsed.car;
  const loginOk = !!d?.has?.kakaoLogin;
  const liveCount = [geoOk, transitOk, carOk, loginOk].filter(Boolean).length;

  return (
    <main className="device">
      <div className="appbar">
        <div className="between">
          <div className="row" style={{ gap: 9 }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--ink-faint)", fontSize: 20 }}>←</Link>
            <div>
              <h1>API 실동작 상태</h1>
              <div className="faint" style={{ fontSize: 11 }}>
                실제 외부 API를 호출한 결과 · {ts && `${ts} 기준`}
              </div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={load}>새로고침</button>
        </div>
      </div>

      <div className="pad stack" style={{ gap: 14 }}>
        {err && <div className="chip warn" style={{ padding: "10px 12px", whiteSpace: "normal" }}>⚠ {err}</div>}

        {d && (
          <>
            <div className="card center" style={{ padding: 18 }}>
              <div style={{ fontSize: 34, fontWeight: 850, letterSpacing: "-.02em", color: "var(--ac)" }}>
                {liveCount}/4
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>API 연결됨 (실데이터)</div>
            </div>

            {/* 카카오 지오코딩 */}
            <div className="card stack" style={{ gap: 8 }}>
              <div className="between">
                <b style={{ fontSize: 14 }}>🗺️ 카카오 · 지오코딩</b>
                <Badge live={!!geoOk} />
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>주소/역명 → 좌표 변환</div>
              {geoOk && (
                <div style={{ background: "var(--panel2)", border: "1px solid var(--hair)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5 }}>
                  <div className="faint" style={{ fontSize: 11 }}>실호출: "역삼동 강남파이낸스센터"</div>
                  <div className="tnum" style={{ fontWeight: 700, marginTop: 2 }}>
                    → {d.parsed.geocode.lat.toFixed(5)}, {d.parsed.geocode.lng.toFixed(5)}
                  </div>
                </div>
              )}
            </div>

            {/* 카카오 로그인 */}
            <div className="card stack" style={{ gap: 8 }}>
              <div className="between">
                <b style={{ fontSize: 14 }}>🔐 카카오 · 로그인(OAuth)</b>
                <Badge live={loginOk} />
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {loginOk ? "인가 URL 구성됨 · kauth.kakao.com 리다이렉트" : "REST 키 필요"}
              </div>
            </div>

            {/* ODsay */}
            <div className="card stack" style={{ gap: 8 }}>
              <div className="between">
                <b style={{ fontSize: 14 }}>🚌 ODsay · 대중교통</b>
                <Badge live={!!transitOk} />
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>대중교통 경로 · 소요시간/요금/환승</div>
              {transitOk && (
                <div style={{ background: "var(--panel2)", border: "1px solid var(--hair)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5 }}>
                  <div className="faint" style={{ fontSize: 11 }}>실호출: 강남역 → 홍대입구</div>
                  <div className="row tnum" style={{ gap: 10, fontWeight: 700, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--ac)" }}>{d.parsed.transit.min}분</span>
                    <span>· {d.parsed.transit.fare.toLocaleString()}원</span>
                    <span>· 도보 {d.parsed.transit.walkM}m</span>
                  </div>
                </div>
              )}
            </div>

            {/* TMAP */}
            <div className="card stack" style={{ gap: 8 }}>
              <div className="between">
                <b style={{ fontSize: 14 }}>🚗 TMAP · 자차</b>
                <Badge live={!!carOk} />
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>자동차 경로 · 소요시간/거리</div>
              {carOk && (
                <div style={{ background: "var(--panel2)", border: "1px solid var(--hair)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5 }}>
                  <div className="faint" style={{ fontSize: 11 }}>실호출: 강남역 → 홍대입구</div>
                  <div className="row tnum" style={{ gap: 10, fontWeight: 700, marginTop: 3 }}>
                    <span style={{ color: "var(--ac)" }}>{d.parsed.car.min}분</span>
                    <span>· {(d.parsed.car.distanceM / 1000).toFixed(1)}km</span>
                  </div>
                </div>
              )}
            </div>

            {d.callerIP && (
              <p className="hint" style={{ textAlign: "left" }}>
                이 서버 공인 IP: <b className="tnum">{d.callerIP}</b> (ODsay 화이트리스트 등록값)
              </p>
            )}
          </>
        )}
        {!d && !err && <div className="center muted" style={{ padding: 30 }}>불러오는 중…</div>}
      </div>
    </main>
  );
}
