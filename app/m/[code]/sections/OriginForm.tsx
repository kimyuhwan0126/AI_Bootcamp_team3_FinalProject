"use client";

// ─────────────────────────────────────────────────────────────
// 내 출발지 등록 폼 (STAGE: MAIN 의 첫 카드)
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// 자동완성에서 고른 항목은 **좌표까지** 함께 올린다. 텍스트만 보내면 서버가
// 다시 검색해 사용자가 본 것과 다른 동명이인 결과를 고를 수 있다
// (예: "성수역"이 실제로는 아파트 상가를 집는 경우). 직접 타이핑하면
// 이전 선택 좌표는 버린다 — 그래서 `coord` 는 부모가 관리한다.
// ─────────────────────────────────────────────────────────────
import type { Transport } from "@/lib/types";
import type { GeoSuggest } from "@/app/api/geocode/route";

export interface OriginFormProps {
  /** 지금 등록하는 사람 이름 (신원 전환 가능해서 매번 다를 수 있다) */
  myName: string | undefined;
  /** 이미 출발지를 등록했으면 버튼 문구가 "수정"이 된다 */
  registered: boolean;
  value: string;
  onChange: (v: string) => void;
  /** null = 아직 검색 전 · [] = 검색했는데 결과 없음 */
  suggests: GeoSuggest[] | null;
  onPickSuggest: (s: GeoSuggest) => void;
  /** 내정보 탭에 저장해 둔 위치 — 누르면 입력칸에 채워진다 */
  savedPlaces: string[];
  onPickSaved: (name: string) => void;
  transport: Transport;
  onTransportChange: (t: Transport) => void;
  busy: boolean;
  onSubmit: () => void;
}

export default function OriginForm({
  myName,
  registered,
  value,
  onChange,
  suggests,
  onPickSuggest,
  savedPlaces,
  onPickSaved,
  transport,
  onTransportChange,
  busy,
  onSubmit,
}: OriginFormProps) {
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div>
        <span className="eyebrow">1. 메인 · 내 출발지</span>
        <h2 className="sec" style={{ marginTop: 4 }}>
          어디서 출발하세요?
        </h2>
        <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 0" }}>
          <b>{myName}</b> 님의 출발지를 등록하면 모두에게 공평한 거점 후보를 찾아드려요.
        </p>
      </div>

      <div style={{ position: "relative" }}>
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="예: 강남역, 사당, 홍대입구…"
          autoComplete="off"
        />
        {suggests !== null && (
          <div className="v8-ac">
            {suggests.length === 0 ? (
              <div className="empty">검색 결과가 없어요.</div>
            ) : (
              suggests.map((s) => (
                <button key={`${s.name}${s.lat}`} type="button" onClick={() => onPickSuggest(s)}>
                  <b>{s.name}</b>
                  <span className="addr">{s.address}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {savedPlaces.length > 0 && (
        <div>
          <label className="label">내 저장 위치</label>
          <div className="v8-tags" style={{ marginBottom: 0 }}>
            {savedPlaces.map((n) => (
              <button key={n} type="button" className="v8-tag" onClick={() => onPickSaved(n)}>
                📍 {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label">이동 수단</label>
        <div className="seg">
          <button className={transport === "transit" ? "on" : ""} onClick={() => onTransportChange("transit")}>
            🚌 대중교통
          </button>
          <button className={transport === "car" ? "on" : ""} onClick={() => onTransportChange("car")}>
            🚗 자차
          </button>
        </div>
      </div>

      <button className="btn" disabled={busy || !value.trim()} onClick={onSubmit}>
        {registered ? "출발지 수정" : "출발지 등록"}
      </button>
    </div>
  );
}
