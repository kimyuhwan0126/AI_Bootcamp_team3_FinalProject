"use client";

// ─────────────────────────────────────────────────────────────
// RouteSheet — 경로 상세 바텀시트 (시안 1·2)
//   대중교통: ODsay 경로 후보 카드 + 구간(leg) 막대
//   자차:     TMAP 옵션 비교 + 택시요금 + 카풀 정산 미리보기
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { formatMinutes, formatDistance, formatWon, formatFare } from "@/lib/format";

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
  // 아래 셋은 수도권 노선색 규칙과 무관하므로 따로 둔다.
  // 고속·시외버스는 시내버스(파랑)와 한눈에 갈려야 해서 계열을 다르게 잡았다.
  if (kind === "train") return "#3b4a6b";      // KTX·SRT 등
  if (kind === "expressBus") return "#7c3aed";  // 고속버스 (trafficType 5)
  if (kind === "intercityBus") return "#0d9488"; // 시외버스 (trafficType 6)
  if (kind === "air") return "#06b6d4";         // 항공 (trafficType 7)
  if (kind === "other") return "var(--hair2)";
  for (const [re, c] of LINE_COLORS) if (re.test(name)) return c;
  return "var(--ac)";
}

/** 구간 아이콘. `other` 는 우리가 모르는 수단이라 중립 기호를 쓴다. */
const KIND_ICON: Record<string, string> = {
  walk: "🚶",
  subway: "🚇",
  bus: "🚌",
  expressBus: "🚍",
  intercityBus: "🚐",
  train: "🚄",
  air: "✈️",
  other: "🚏",
};

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

  // 진단 모드에서만 내려오는 "껍데기 가드를 통과 못 한" 경로.
  // 평소(플래그 OFF)엔 서버가 이런 값을 아예 안 주므로 항상 false 다.
  // ⚠️ 훅은 조건부 return 뒤에 두지 않는다 — 화면이 통째로 안 그려진 사고가 있었다.
  const unverified: boolean =
    data?.mode === "transit" &&
    Array.isArray(data.transit) &&
    data.transit.length > 0 &&
    data.transit.every((t: { verified?: boolean }) => t.verified === false);

  // 도시간 경로는 ODsay 가 역↔역만 답해서, 출발지↔역 구간을 우리가 추정해 더한다.
  // 추정이 섞였으면 그 사실을 반드시 밝힌다 (CLAUDE.md §6).
  const estOf = (t: { estimatedMin?: number }) => t.estimatedMin ?? 0;
  const hasEstimate: boolean =
    data?.mode === "transit" && Array.isArray(data.transit) && data.transit.some((t: never) => estOf(t) > 0);

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
            경로 불러오는 중…
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
              {/* ⚠️ 예전엔 `ODsay 실시간` · `TMAP 실시간` 이었다. **"실시간"이 아니다** —
                  우리는 두 API 어디에도 시각을 보내지 않는다(`odsay.ts`·`tmap.ts` 요청 파라미터
                  확인). 그러니 이 값은 "지금"이 아니라 "실제 노선을 계산한 결과"다.
                  게다가 이 앱은 다음 주 모임을 잡는 도구라 "지금 막히는 정도"는 애초에 필요 없다.
                  → 앱 전체를 `경로 기준` / `거리 추정` 두 단어로 통일했다(2026-08-05, CEO 결정). */}
              {data.live && !unverified ? (
                <span className="chip ok">경로 기준</span>
              ) : unverified ? (
                // 진단 모드(NEXT_PUBLIC_FF_ODSAY_PROBE)에서만 나온다 —
                // 껍데기 가드를 통과 못 한 값이라 실제 경로처럼 표시하면 안 된다.
                <span className="chip warn">⚠ 검증 안 된 원시 응답</span>
              ) : (
                <span className="chip warn">거리 추정</span>
              )}
            </div>

            {/* ══ 대중교통 (시안 1) ══ */}
            {data.mode === "transit" && (
              <>
                <p className="faint" style={{ fontSize: 11, margin: "-4px 0 0" }}>
                  {unverified
                    ? "진단 모드 — ODsay 가 돌려준 원시 응답입니다. 탑승 구간이 없어 평소엔 걸러지는 값이라 실제와 다를 수 있어요"
                    : data.live
                    ? // ⚠️ "시간표 기준"이라 단정하지 않는다. "실시간"을 뺀 근거가 *"우리가 확인하지
                      //    않은 것은 말하지 않는다"* 였는데, 그 자리에 역시 확인 안 한 주장을 넣으면
                      //    같은 잘못이다 — ODsay 응답에는 어느 시각·어느 편 기준인지 표기가 없다.
                      `경로 후보 ${data.transit.length}개 · 실제 노선으로 계산`
                    : "실제 경로를 계산하지 못해 직선거리로 추정했어요"}
                </p>
                {/* 도시간 경로(KTX·고속버스·항공)는 ODsay 가 역·터미널·공항 사이만 답한다.
                    표시 시간에 우리가 더한 추정치가 섞여 있으므로 그대로 밝힌다 —
                    안 밝히면 "강남역에서 제주까지 75분"처럼 사실과 다른 값이 실시간으로 보인다. */}
                {data.live && hasEstimate && (
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
                    <b>역까지 가는 시간은 추정이에요.</b> ODsay 는 역·터미널·공항 <b>사이 구간만</b>
                    알려줘서, 출발지에서 역까지·환승 지점 사이·역에서 목적지까지는 직선거리로
                    계산해 더했어요 — 실제보다 넉넉하게 잡히는 편입니다.
                  </div>
                )}
                {/* 실 경로를 못 가져온 경우엔 왜 그런지와 무엇을 보고 있는지 밝힌다.
                    ⚠️ 예전엔 "시외는 API 커버리지 밖"이라고 안내했는데 **사실이 아니었다** —
                    2026-08-03 실측에서 ODsay 는 KTX·SRT(`trafficType: 4`)를 제대로 돌려줬고,
                    우리 매핑이 그걸 "도보"로 뭉개 버린 것이었다. 원인을 오해하게 만드는
                    문구라 지웠다. 지금 이 자리는 "키 없음/호출 실패"일 때만 뜬다. */}
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
                    <b>직선거리로 추정한 값이에요.</b> 실제 경로를 계산하지 못해
                    거리로만 계산했어요 — 실제 소요시간과 크게 다를 수 있습니다.
                    {/* ⚠️ 예전엔 "카카오맵·네이버지도에서 확인해주세요"라고만 하고
                        **링크가 없었다.** 사용자는 앱을 따로 열어 목적지를 다시 타이핑해야
                        했는데, 그 값은 우리가 이미 갖고 있다 (2026-08-06 CEO 지적 —
                        경로 구간이 하나도 안 나와서 "고장난 듯" 보이는 자리다.
                        실제로는 ODsay 키가 없어 보여줄 게 없는 것).

                        🔴 **처음엔 `?sName=출발&eName=도착`(이름만) 으로 붙였다가 실패했다** —
                           카카오맵이 그 파라미터를 그대로 무시해서 **출발지·도착지가 빈 채로**
                           길찾기 화면만 열렸다(2026-08-06 CEO 실측). 링크가 있으나 마나였다.
                           공식 URL 스킴은 **좌표를 요구**한다:
                             map.kakao.com/link/to/{이름},{위도},{경도}
                           그래서 `route-detail` 응답에 `to` 좌표를 함께 싣게 했다.

                        ✅ **도착지만 넣는 것이 의도다** (2026-08-06 CEO 결정 —
                           *"출발지는 굳이 등록하지 말고 도착지만 찾게 해. 어차피 카카오맵
                           안에서 내 위치 찾아주잖아"*). 카카오맵이 현위치를 잡아주므로
                           우리가 등록한 출발지 텍스트를 밀어 넣는 것보다 정확하다 —
                           그 텍스트는 "압구정역" 같은 **역 이름**이지 사용자가 지금 있는
                           자리가 아니다. **미완성이 아니니 출발지를 다시 넣지 말 것.**
                           문구도 그래서 "목적지로 길찾기"까지만 한다(CLAUDE.md §6).
                        ⚠️ 수단(대중교통/자차)도 지정하지 않는다. 우리가 고른 수단으로
                           열린다고 말할 수 없다. */}
                    {data.destName && data.to && (
                      <a
                        href={`https://map.kakao.com/link/to/${encodeURIComponent(data.destName)},${data.to.lat},${data.to.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="chip line"
                        style={{ display: "inline-flex", marginTop: 8, textDecoration: "none", fontSize: 10.5 }}
                      >
                        🗺 카카오맵에서 ‘{data.destName}’ 으로 길찾기
                      </a>
                    )}
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
                              <span style={{ fontSize: 10 }}>{KIND_ICON[l.kind] ?? "🚏"}</span>
                              <i style={{ display: "block", flex: 1, height: 6, borderRadius: 99, background: lineColor(l.name, l.kind) }} />
                            </span>
                          )
                        )}
                      </div>
                      <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                        {t.legs
                          .filter((l: any) => l.kind !== "walk")
                          .map((l: any) =>
                            // 철도는 정거장 수가 의미 없거나 0으로 오므로 붙이지 않는다
                            l.stations > 0
                              ? `${l.name} ${l.from}→${l.to} (${l.stations}정거장 ${formatMinutes(l.min)})`
                              : `${l.name} ${l.from}→${l.to} (${formatMinutes(l.min)})`
                          )
                          .join(" · ")}
                        {" · "}
                        {/* 대중교통 요금은 0·-1 이 "무료"가 아니라 "정보 없음"이다
                            (철도 0 · 시외버스 -1 — 2026-08-03 실측). formatWon 이 아니라
                            formatFare 를 쓴다 — 4시간짜리 경로가 "무료"로 표시되던 버그. */}
                        <b style={{ color: "var(--ink-soft)" }}>{formatFare(t.fare)}</b>
                        {/* 도시간 응답에는 `totalWalk` 가 없어 0 으로 온다 —
                            "도보 0m" 라고 쓰면 안 걷는다는 뜻이 되므로 아예 생략한다 */}
                        {t.walkM > 0 && <>{" · 도보 "}{formatDistance(t.walkM)}</>}
                        {" · 환승 "}{t.transfers}회
                        {estOf(t) > 0 && (
                          <>
                            {" · "}
                            <b style={{ color: "var(--warn)" }}>역까지·환승 이동 추정 {formatMinutes(estOf(t))} 포함</b>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </>
            )}

            {/* ══ 자차 (시안 2) ══ */}
            {data.mode === "car" && data.live && (
              <>
                {/* 자차는 대중교통과 사정이 다르다 — TMAP 에도 시각을 안 보내므로 이 값은
                    **호출한 순간**의 도로 상황이다. 모임은 보통 며칠 뒤라, 신선한데 엉뚱한
                    시점의 신선함이다. "실시간 교통 반영"이라고만 적으면 장점처럼 읽혀서
                    그 어긋남을 그대로 밝힌다(2026-08-05 CEO 지적). */}
                <p className="faint" style={{ fontSize: 11, margin: "-4px 0 0" }}>지금 출발 기준 — 모임 시각의 도로 상황은 다를 수 있어요</p>
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
              <p className="muted" style={{ fontSize: 12.5 }}>경로를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
            )}

            <button className="btn ghost" onClick={onClose}>닫기</button>
          </div>
        )}
      </div>
    </div>
  );
}
