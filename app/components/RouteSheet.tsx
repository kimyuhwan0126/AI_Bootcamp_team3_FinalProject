"use client";

// ─────────────────────────────────────────────────────────────
// RouteSheet — 경로 상세 바텀시트 (시안 1·2)
//   대중교통: ODsay 경로 후보 카드 + 구간(leg) 막대
//   자차:     TMAP 옵션 비교 + 택시요금 + 카풀 정산 미리보기
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { formatMinutes, formatDistance, formatWon } from "@/lib/format";

interface Props {
  code: string;
  participantId: string;
  dest: { name: string; lat: number; lng: number };
  onClose: () => void;
}

// 수도권 노선 색 (없으면 액센트)
const LINE_COLORS: [RegExp, string][] = [
  [/1호선/, "#0052A4"], [/2호선/, "#00A84D"], [/3호선/, "#EF7C1C"],
  [/4호선/, "#00A5DE"], [/5호선/, "#996CAC"], [/6호선/, "#CD7C2F"],
  [/7호선/, "#747F00"], [/8호선/, "#E6186C"], [/9호선/, "#BDB092"],
  [/신분당/, "#D31145"], [/경의|중앙/, "#77C4A3"], [/공항/, "#0090D2"],
  [/수인|분당/, "#F5A200"], [/경춘/, "#0C8E72"], [/우이|신설/, "#B0CE18"],
];
function lineColor(name: string, kind: string): string {
  if (kind === "bus") return "#4c8df6";
  for (const [re, c] of LINE_COLORS) if (re.test(name)) return c;
  return "var(--ac)";
}

export default function RouteSheet({ code, participantId, dest, onClose }: Props) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({
      code,
      participantId,
      toLat: String(dest.lat),
      toLng: String(dest.lng),
      toName: dest.name,
    });
    fetch(`/api/route-detail?${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "불러오기 실패");
        if (alive) setData(d);
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [code, participantId, dest.lat, dest.lng, dest.name]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "82vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--hair2)", margin: "0 auto 10px" }} />

        {err && (
          <div className="stack" style={{ gap: 10 }}>
            <b style={{ fontSize: 14 }}>경로를 불러올 수 없어요</b>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>⚠ {err}</p>
            <button className="btn ghost" onClick={onClose}>닫기</button>
          </div>
        )}

        {!data && !err && (
          <div className="center muted" style={{ padding: "26px 0", fontSize: 13 }}>
            <span className="spinner" style={{ display: "inline-block", borderColor: "color-mix(in srgb,var(--ac) 30%,transparent)", borderTopColor: "var(--ac)", verticalAlign: "-3px", marginRight: 8 }} />
            실시간 경로 불러오는 중…
          </div>
        )}

        {data && (
          <div className="stack" style={{ gap: 10 }}>
            {/* 헤더 */}
            <div className="between">
              <b style={{ fontSize: 15 }}>
                {data.participantName} · {data.origin} → {data.destName}{" "}
                {data.mode === "car" && <span style={{ fontSize: 12 }}>🚗</span>}
              </b>
              {data.live ? (
                <span className="chip ok">{data.mode === "car" ? "TMAP 실시간" : "ODsay 실시간"}</span>
              ) : (
                <span className="chip warn">추정값</span>
              )}
            </div>

            {/* ══ 대중교통 (시안 1) ══ */}
            {data.mode === "transit" && (
              <>
                <p className="faint" style={{ fontSize: 11, margin: "-4px 0 0" }}>
                  {data.live ? `경로 후보 ${data.transit.length}개 · 시간표 기준` : "실시간 경로를 가져오지 못해 추정값으로 표시해요"}
                </p>
                {/* 실 경로를 못 가져온 경우엔 왜 그런지와 무엇을 보고 있는지 밝힌다.
                    시외 장거리는 대중교통 API 커버리지 밖이라 KTX·고속버스가 반영되지
                    않는다 — 값이 실제보다 크게 어긋날 수 있음을 숨기지 않는다. */}
                {!data.live && (
                  <div
                    style={{
                      background: "var(--warn-soft)",
                      border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)",
                      borderRadius: 12,
                      padding: "9px 11px",
                      fontSize: 11,
                      lineHeight: 1.6,
                      color: "var(--warn)",
                    }}
                  >
                    <b>직선거리로 추정한 값이에요.</b> 대중교통 경로 API는 수도권·광역시
                    중심이라, 시외 장거리(KTX·고속버스)는 실제 소요시간과 크게 다를 수 있어요.
                    정확한 시간은 카카오맵·네이버지도에서 확인해주세요.
                  </div>
                )}
                {data.live &&
                  data.transit.map((t: any, i: number) => (
                    <div key={i} className={"ropt" + (i === 0 ? " sel" : "")}>
                      <div className="between">
                        <span className="row" style={{ gap: 6 }}>
                          {i === 0 && <span className="chip" style={{ background: "var(--ac)", color: "#fff" }}>추천</span>}
                          <b style={{ fontSize: 13 }}>{t.label}</b>
                        </span>
                        <b className="tnum" style={{ color: i === 0 ? "var(--ac)" : "var(--ink-soft)", fontSize: 14 }}>{formatMinutes(t.min)}</b>
                      </div>
                      {/* 구간 막대 */}
                      <div className="row" style={{ gap: 2, margin: "8px 0 6px", alignItems: "center" }}>
                        {t.legs.map((l: any, j: number) =>
                          l.kind === "walk" ? (
                            <span key={j} className="row" style={{ gap: 2, flexShrink: 0 }}>
                              <span style={{ fontSize: 10 }}>🚶</span>
                              <i style={{ display: "block", width: Math.max(6, Math.min(24, l.min * 3)), height: 6, borderRadius: 99, background: "var(--hair2)" }} />
                            </span>
                          ) : (
                            <span key={j} className="row" style={{ gap: 2, flex: l.min, minWidth: 24 }}>
                              <span style={{ fontSize: 10 }}>{l.kind === "subway" ? "🚇" : "🚌"}</span>
                              <i style={{ display: "block", flex: 1, height: 6, borderRadius: 99, background: lineColor(l.name, l.kind) }} />
                            </span>
                          )
                        )}
                      </div>
                      <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                        {t.legs
                          .filter((l: any) => l.kind !== "walk")
                          .map((l: any) => `${l.name} ${l.from}→${l.to} (${l.stations}정거장 ${formatMinutes(l.min)})`)
                          .join(" · ")}
                        {" · "}
                        <b style={{ color: "var(--ink-soft)" }}>{formatWon(t.fare)}</b>
                        {" · 도보 "}{formatDistance(t.walkM)} · 환승 {t.transfers}회
                      </div>
                    </div>
                  ))}
              </>
            )}

            {/* ══ 자차 (시안 2) ══ */}
            {data.mode === "car" && data.live && (
              <>
                <p className="faint" style={{ fontSize: 11, margin: "-4px 0 0" }}>지금 출발 기준 · 실시간 교통 반영</p>
                {/* 추천 옵션 */}
                <div className="ropt sel">
                  <div className="between">
                    <span className="row" style={{ gap: 6 }}>
                      <span className="chip" style={{ background: "var(--ac)", color: "#fff" }}>추천</span>
                      <b style={{ fontSize: 13 }}>{data.car[0].label}</b>
                    </span>
                    <b className="tnum" style={{ color: "var(--ac)", fontSize: 14 }}>{formatMinutes(data.car[0].min)}</b>
                  </div>
                  <div className="faint" style={{ fontSize: 10.5, marginTop: 5 }}>
                    {formatDistance(data.car[0].distanceM)} · 통행료 <b style={{ color: "var(--ink-soft)" }}>{formatWon(data.car[0].tollFare)}</b>
                  </div>
                </div>
                {/* 옵션 비교 3분할 */}
                <div className="row" style={{ gap: 8 }}>
                  {data.car.slice(1).map((c: any) => (
                    <div key={c.key} className="ropt" style={{ flex: 1, marginTop: 0 }}>
                      <div className="faint" style={{ fontSize: 10 }}>{c.label}</div>
                      <b className="tnum" style={{ fontSize: 13 }}>{formatMinutes(c.min)}</b>
                      <div className="faint" style={{ fontSize: 9.5 }}>{formatDistance(c.distanceM)}</div>
                    </div>
                  ))}
                  <div className="ropt" style={{ flex: 1, marginTop: 0 }}>
                    <div className="faint" style={{ fontSize: 10 }}>🚕 택시 시</div>
                    <b className="tnum" style={{ fontSize: 13 }}>{data.car[0].taxiFare.toLocaleString()}원</b>
                    <div className="faint" style={{ fontSize: 9.5 }}>참고용</div>
                  </div>
                </div>
                {/* 카풀 정산 미리보기 */}
                {data.carpool && (
                  <div style={{ background: "var(--warn-soft)", border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)", borderRadius: 13, padding: 11 }}>
                    <div className="between" style={{ marginBottom: 5 }}>
                      <b style={{ fontSize: 12.5 }}>🚗 카풀 정산 미리보기</b>
                      <span className="chip warn" style={{ fontSize: 9.5 }}>유류비 추정</span>
                    </div>
                    <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
                      통행료 {data.carpool.tollFare.toLocaleString()}원 + 유류비 추정 {data.carpool.fuelWon.toLocaleString()}원
                      ({(data.car[0].distanceM / 1000).toFixed(1)}km)
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 7 }}>
                      {data.carpool.perHead.map((h: any) => (
                        <div key={h.people} style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--hair)", borderRadius: 10, padding: "6px 8px", textAlign: "center" }}>
                          <div className="faint" style={{ fontSize: 9.5 }}>동승 {h.people}명</div>
                          <b className="tnum" style={{ fontSize: 12, color: "var(--warn)" }}>1인 ≈{h.won.toLocaleString()}원</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <a
                  className="btn"
                  style={{ textDecoration: "none" }}
                  href={`https://apis.openapi.sk.com/tmap/app/routes?appKey=&name=${encodeURIComponent(dest.name)}&lon=${dest.lng}&lat=${dest.lat}`}
                  onClick={(e) => e.preventDefault()}
                  title="프로토타입: 실제 앱 연동 시 TMAP 딥링크로 연결"
                >
                  이 경로로 안내 시작 (TMAP)
                </a>
              </>
            )}
            {data.mode === "car" && !data.live && (
              <p className="muted" style={{ fontSize: 12.5 }}>실시간 경로를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            )}

            <button className="btn ghost" onClick={onClose}>닫기</button>
          </div>
        )}
      </div>
    </div>
  );
}
