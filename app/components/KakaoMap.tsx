"use client";

// ─────────────────────────────────────────────────────────────
// KakaoMap — 실제 카카오 지도 (JavaScript 키 사용)
//  · NEXT_PUBLIC_KAKAO_JS_KEY 로 Maps SDK를 동적 로드
//  · 로드 실패(키 없음/도메인 미등록/오프라인) 시 onFail 콜백
//    → 호출부에서 기존 스키매틱 지도로 폴백
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    kakao: any;
    __kakaoMapLoading?: Promise<boolean>;
  }
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  emoji: string;       // 🧑 / 🚗
}
export interface MapCenterPin {
  lat: number;
  lng: number;
  label: string;       // "왕십리" | "예상 중간지점"
}

const JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";

// SDK 스크립트를 1회만 로드 (autoload=false → kakao.maps.load로 초기화)
function loadSdk(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.kakao?.maps?.LatLng) return Promise.resolve(true);
  if (!JS_KEY) return Promise.resolve(false);
  if (window.__kakaoMapLoading) return window.__kakaoMapLoading;

  window.__kakaoMapLoading = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
    s.async = true;
    s.onload = () => {
      try {
        window.kakao.maps.load(() => resolve(true));
      } catch {
        resolve(false);
      }
    };
    s.onerror = () => resolve(false); // 도메인 미등록/차단 등
    document.head.appendChild(s);
  });
  return window.__kakaoMapLoading;
}

export default function KakaoMap({
  pins,
  center,
  onFail,
}: {
  pins: MapPin[];
  center: MapCenterPin | null;
  onFail: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // SDK 로드 + 지도 생성
  useEffect(() => {
    let alive = true;
    loadSdk().then((ok) => {
      if (!alive) return;
      if (!ok) {
        onFail();
        return;
      }
      const { kakao } = window;
      if (!mapRef.current && boxRef.current) {
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(37.5665, 126.978), // 서울 시청 기본
          level: 8,
        });
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀/중심 갱신
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const { kakao } = window;
    const map = mapRef.current;

    // 기존 오버레이 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();
    let hasAny = false;

    // 참가자 핀 (이모지 + 이름 라벨)
    for (const p of pins) {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      bounds.extend(pos);
      hasAny = true;
      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;transform:translateY(-4px);pointer-events:none;";
      el.innerHTML =
        `<div style="font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))">${p.emoji}</div>` +
        `<div style="font-size:10px;font-weight:800;background:#fff;border:1px solid #d8dee9;border-radius:999px;padding:1px 7px;margin-top:1px;color:#1c2433;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.12)">${p.label}</div>`;
      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1 });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    // 중간지점 핀 (강조)
    if (center) {
      const pos = new kakao.maps.LatLng(center.lat, center.lng);
      bounds.extend(pos);
      hasAny = true;
      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;pointer-events:none;";
      el.innerHTML =
        `<div style="font-size:11px;font-weight:900;background:#2f6fed;color:#fff;border-radius:999px;padding:3px 10px;margin-bottom:3px;white-space:nowrap;box-shadow:0 2px 8px rgba(47,111,237,.45)">📍 ${center.label}</div>` +
        `<div style="width:14px;height:14px;border-radius:50%;background:#2f6fed;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`;
      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1 });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    if (hasAny) {
      map.setBounds(bounds, 40, 40, 40, 40); // 모든 핀이 보이도록
      if (pins.length + (center ? 1 : 0) === 1) map.setLevel(5); // 핀 1개면 과확대 방지
    }
  }, [ready, pins, center]);

  return <div ref={boxRef} style={{ position: "absolute", inset: 0 }} />;
}
