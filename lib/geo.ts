// ─────────────────────────────────────────────────────────────
// geo.ts — 오프라인 mock 지오코딩 + 중간지점 AI 추천 + 장소 생성
// (외부 지도 API 없이 기기에서 바로 동작. Neon/Vercel 배포 시에도
//  KAKAO/ODsay/TMAP 키를 넣으면 이 파일만 교체하면 됩니다.)
// ─────────────────────────────────────────────────────────────
import type { Participant, RegionCandidate, PlaceCandidate } from "./types";
import { fairnessRaw } from "./scoring/fairness";

// 주요 거점 좌표(대략값). 지오코딩/후보지 풀로 함께 사용.
//
// ⚠️ 이름은 **사람이 아는 이름**으로 쓴다. `geocode()` 가 입력 텍스트에 이 키가
//    들어 있으면 그 좌표를 쓰므로, 여기 있는 이름은 카카오 키가 없어도 잡힌다.
export const HUBS: Record<string, { lat: number; lng: number }> = {
  강남역: { lat: 37.4979, lng: 127.0276 },
  "강남": { lat: 37.4979, lng: 127.0276 },
  사당: { lat: 37.4765, lng: 126.9816 },
  교대: { lat: 37.4934, lng: 127.0146 },
  잠실: { lat: 37.5133, lng: 127.1001 },
  건대입구: { lat: 37.5405, lng: 127.0703 },
  홍대입구: { lat: 37.5572, lng: 126.9245 },
  신촌: { lat: 37.5551, lng: 126.9368 },
  종로3가: { lat: 37.5714, lng: 126.9917 },
  시청: { lat: 37.5657, lng: 126.9769 },
  서울역: { lat: 37.5547, lng: 126.9707 },
  왕십리: { lat: 37.5613, lng: 127.0374 },
  구로디지털단지: { lat: 37.4854, lng: 126.9016 },
  영등포: { lat: 37.5156, lng: 126.9074 },
  수원역: { lat: 37.2659, lng: 127.0002 },
  판교: { lat: 37.3948, lng: 127.1112 },
  안양: { lat: 37.4018, lng: 126.9227 },
  부천: { lat: 37.4845, lng: 126.7831 },
  인천: { lat: 37.4563, lng: 126.7052 },
  일산: { lat: 37.6584, lng: 126.7699 },
  노원: { lat: 37.6542, lng: 127.0568 },

  // ── 전국 거점 (2026-08-03 추가) ───────────────────────────────
  //  좌표는 역/도심 상권 기준 근사값이다.
  대전역: { lat: 36.3320, lng: 127.4342 },
  천안아산역: { lat: 36.7946, lng: 127.1045 },
  청주: { lat: 36.6372, lng: 127.4897 },       // 성안길 도심 (오송역 아님 — 아래 주석)
  동대구역: { lat: 35.8797, lng: 128.6285 },
  부산역: { lat: 35.1151, lng: 129.0413 },
  서면: { lat: 35.1578, lng: 129.0594 },
  울산: { lat: 35.5384, lng: 129.3114 },       // 삼산동 (KTX 울산역=언양 아님)
  창원: { lat: 35.2270, lng: 128.6810 },       // 상남동
  전주역: { lat: 35.8497, lng: 127.1600 },
  광주송정역: { lat: 35.1361, lng: 126.7912 },
  순천역: { lat: 34.9455, lng: 127.5030 },
  목포역: { lat: 34.7913, lng: 126.3868 },
  원주: { lat: 37.3422, lng: 127.9202 },
  강릉역: { lat: 37.7639, lng: 128.8990 },

  // 지오코딩 전용 별칭 — 후보 풀에는 넣지 않는다.
  //  "대전"처럼 짧게 쓰는 입력을 카카오 키 없이도 잡기 위한 것.
  //
  //  ⚠️ `geocode()` 는 **부분 문자열 매칭**이라, 다른 지명 안에 들어가는 이름은
  //     넣으면 안 된다. 실측으로 걸러낸 것:
  //       · "광주" ❌ 광주광역시 / 경기 광주시가 갈린다
  //       · "순천" ❌ **"순천향대학교"(충남 아산)가 전남 순천으로 잡힌다**
  //         → `순천역` 키만 두어 "순천역" 입력에서만 매칭되게 한다
  대전: { lat: 36.3320, lng: 127.4342 },
  대구: { lat: 35.8797, lng: 128.6285 },
  부산: { lat: 35.1151, lng: 129.0413 },
  천안: { lat: 36.7946, lng: 127.1045 },
  전주: { lat: 35.8497, lng: 127.1600 },
  목포: { lat: 34.7913, lng: 126.3868 },
  강릉: { lat: 37.7639, lng: 128.8990 },
};

// 후보 거점 풀(중간지역 투표 후보로 뽑히는 지역)
//
// 선정 기준은 **"역이 있는 곳"이 아니라 "모일 수 있는 곳"** 이다.
// KTX 정차역을 기계적으로 넣으면 안 된다 — 역세권에 상권이 없으면 도착해서 갈 데가 없다.
// 그래서 아래는 의도적으로 제외했다:
//   · 오송역      KTX 분기역이지만 주변이 연구단지·논밭. 청주 도심과 약 20km → `청주` 로 대체
//   · 김천(구미)역 김천 도심에서 떨어진 신설역. 역세권 상권 없음
//   · KTX 울산역  언양에 있어 울산 도심에서 약 30km → `울산`(삼산동) 으로 대체
//   · 광명역      수도권이지만 역세권이 창고·주차장 위주
//   · 제주        항공만 가능해 대중교통 경로 API 커버리지 밖
//
// ⚠️ 이 목록은 알고리즘이 아니라 **사람이 고른 큐레이션**이다. 숨길 일이 아니라
//    이 앱이 실제로 동작하는 방식이고, 최종 목록은 **팀 결정 사항**이다(CLAUDE.md §5).
export const CANDIDATE_HUBS = [
  // 수도권
  "사당", "교대", "강남역", "잠실", "건대입구", "홍대입구",
  "신촌", "종로3가", "시청", "왕십리", "영등포", "구로디지털단지",
  "서울역", "수원역",
  // 충청
  "천안아산역", "청주", "대전역",
  // 경북·경남
  "동대구역", "부산역", "서면", "울산", "창원",
  // 전라
  "전주역", "광주송정역", "순천역", "목포역",
  // 강원
  "원주", "강릉역",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// 텍스트 출발지 → 좌표. 알려진 거점명을 포함하면 그 좌표, 아니면
// 문자열 해시로 서울권 내 안정적(결정적) 좌표를 생성.
export function geocode(text: string): { lat: number; lng: number } {
  const t = text.replace(/\s/g, "");
  for (const key of Object.keys(HUBS)) {
    if (t.includes(key)) return HUBS[key];
  }
  const h = Math.abs(hashStr(t));
  const lat = 37.45 + ((h % 200) / 1000);       // 37.45 ~ 37.65
  const lng = 126.85 + (((h >> 8) % 300) / 1000); // 126.85 ~ 127.15
  return { lat, lng };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 이동수단별 예상 이동시간(분) — mock 모델 (API 폴백용)
//  car : 주차·진출입 8분 + 도로 보정 / transit : 환승·대기 6분 + 대중교통 보정
//  (도보는 대중교통에 포함 — 별도 수단으로 두지 않는다)
export function estMinutes(km: number, transport: string): number {
  const base = transport === "car" ? 8 : 6;   // 접근/대기
  const speed = transport === "car" ? 0.9 : 1.6; // 분/km 가중
  return Math.round(base + km * (transport === "car" ? 2.2 : 3.0) * speed);
}

// ── 도착 신호등: 초록(정시권)/노랑(지체)/빨강(많이 늦음) ──────────────
// 회의록에서 정한 "출발지별 예상 도착 상태" 색 구분. 이 앱은 참가자별
// 출발/약속 "시각"을 받지 않으므로(모임 시간은 방장이 선택적으로 남기는
// 메모일 뿐, 각자 언제 출발하는지는 모른다) "정시"를 절대 시각으로는 판정할
// 수 없다. 대신 같은 순간 출발한다고 가정했을 때 그룹에서 가장 빨리 도착하는
// 사람 대비 얼마나 더 걸리는지로 공평성 기준 신호등을 매긴다.
export type ArrivalStatus = "green" | "yellow" | "red";
export function arrivalStatus(min: number, groupMins: number[]): ArrivalStatus {
  const fastest = Math.min(...groupMins);
  const diff = min - fastest;
  if (diff <= 8) return "green";
  if (diff <= 20) return "yellow";
  return "red";
}
export const ARRIVAL_COLOR: Record<ArrivalStatus, string> = {
  green: "#16a34a",
  yellow: "#d97706",
  red: "#e11d48",
};
export const ARRIVAL_LABEL: Record<ArrivalStatus, string> = {
  green: "정시권",
  yellow: "지체",
  red: "많이 늦음",
};

// ── 중간지역 AI 추천: 참가자 출발지들로 "가장 공평한" 거점 후보 3개 ──
/**
 * 후보 거점을 참가자들의 기하 중심 근처로 좁힌다.
 *
 * 이전에는 고정 후보 12곳 전체를 스코어링해서, 도보 참가자가 한 명 있으면
 * 그 사람 쪽으로 후보가 끌려가 "중간"이라 부르기 어려운 곳(예: 신사·성수·신림
 * → 영등포, 중심에서 8.3km)이 1위가 되는 문제가 있었다.
 * 중심에서 (참가자 분산 + 여유) 안에 드는 후보만 남기고, 하나도 없으면
 * 중심에서 가까운 순으로 최소 개수를 확보한다.
 */
export function nearCentroidHubs(located: { lat?: number | null; lng?: number | null }[]): string[] {
  const cLat = located.reduce((s, p) => s + p.lat!, 0) / located.length;
  const cLng = located.reduce((s, p) => s + p.lng!, 0) / located.length;
  const centroid = { lat: cLat, lng: cLng };

  // 참가자가 중심에서 얼마나 흩어져 있는지 (가장 먼 사람까지의 거리)
  const spreadKm = Math.max(...located.map((p) => haversineKm({ lat: p.lat!, lng: p.lng! }, centroid)));
  // 중심 주변 허용 반경 — 분산의 절반 + 3km 여유, 최소 4km
  const allowKm = Math.max(4, spreadKm * 0.5 + 3);

  const byDist = CANDIDATE_HUBS.map((name) => ({
    name,
    km: haversineKm(centroid, HUBS[name]),
  })).sort((a, b) => a.km - b.km);

  const near = byDist.filter((h) => h.km <= allowKm).map((h) => h.name);
  if (near.length >= 3) return near;

  // 반경 안에 후보가 부족하면 가까운 순으로 채우되, **절대거리 상한을 넘지 않는다.**
  //
  // 전국 거점이 생기면서 생긴 문제다(2026-08-03 실측): 대구 사람 둘이 만나는데
  // "가까운 순 4곳"이 창원(72km)·울산(72km)·서면(88km)을 끌어와, 화면 후보 2·3위에
  // 200분짜리 후보가 그대로 떴다. 스코어러가 순위는 밀어내지만 **후보 목록에는 남고
  // 이동시간 API 를 후보 수만큼 때린다**(추천 1회 = 후보수 × 참가자수 콜).
  // 상한을 넘어 아무것도 안 남으면 가장 가까운 1곳은 남긴다 — 후보 0개보다는 낫다.
  const capped = byDist.filter((h) => h.km <= FALLBACK_MAX_KM).map((h) => h.name);
  return capped.length > 0 ? capped.slice(0, 4) : [byDist[0].name];
}

/**
 * "가까운 순 확보" 폴백에서 후보로 인정할 중심 거리 상한(km).
 *
 * 반경(`allowKm`) 안에 후보가 3곳 미만일 때만 쓰인다. 값이 크면 먼 도시가
 * 후보로 끌려오고(대구 → 창원·울산), 작으면 후보가 1곳으로 줄어 투표 의미가 옅어진다.
 * 60km 는 "같은 생활권에서 한 번에 갈 만한 거리" 기준의 팀 결정값이다.
 */
const FALLBACK_MAX_KM = 60;

// 참가자 중심이 가장 가까운 고정 후보로부터도 이 거리보다 멀면 "거점 커버리지 밖"으로
// 보고, 이름표 있는 후보 대신 좌표 기반(geometricCandidates)으로 계산한다.
//
// 45 → 55 로 올렸다(2026-08-03, 팀 결정). 45 는 후보가 **수도권 12곳뿐이던 시절**의
// 값이라 전국 풀에서는 의미가 달라졌다. 실측으로 확인한 것:
//   · 45km: 7개 장거리 조합 중 4개만 실제 거점 사용 — **서울+부산·광주·목포가 폴백**
//   · 55km: 7/7 전부 실제 거점 사용
// 서울↔부산의 중심은 경북 내륙 공백지대라 최근접 대전역이 55km 다. 딱 이 한 걸음
// 차이로 "옥천군 안남면 도덕리" 같은 좌표가 나오고 있었다.
// ⚠️ 수도권 내부에는 영향이 없다(강남+홍대+잠실 최근접 3km).
const HUB_COVER_KM = 55;

export function isOutsideHubCoverage(located: { lat?: number | null; lng?: number | null }[]): boolean {
  if (located.length === 0) return false;
  const centroid = {
    lat: located.reduce((s, p) => s + p.lat!, 0) / located.length,
    lng: located.reduce((s, p) => s + p.lng!, 0) / located.length,
  };
  const minKm = Math.min(...CANDIDATE_HUBS.map((name) => haversineKm(centroid, HUBS[name])));
  return minKm > HUB_COVER_KM;
}

function lerp(a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// 이름 있는 고정 후보 없이도 어디서나 동작하는 순수 기하학적 중간지점 후보.
// 가장 멀리 떨어진 두 참가자를 축으로 삼아 그 사이 5곳을 뽑되, 3인 이상일 때도
// 나머지 참가자를 반영하도록 전체 중심(centroid) 쪽으로 30% 당긴다.
//
// ⚠️ **이건 최후수단이다.** 좌표를 기하로 찍을 뿐이라 "모일 수 있는 곳"인지 전혀
//    모른다 — 실제로 서울+거제 모임에서 `옥천군 안남면 도덕리` 가 확정되고, 거기서
//    가게를 찾으니 존재하지 않는 mock 가게가 떴다(2026-08-03 CEO 실측).
//    전국 거점 풀이 생긴 뒤로는 국내 조합에서 거의 발동하지 않는다(위 HUB_COVER_KM 주석).
//    여기로 빠졌다면 **거점 풀에 그 지역이 비어 있다는 신호**이니, 값을 조정하기 전에
//    CANDIDATE_HUBS 에 실제로 모일 수 있는 곳을 추가할 수 있는지부터 본다.
export function geometricCandidates(
  located: { lat?: number | null; lng?: number | null }[]
): { lat: number; lng: number }[] {
  const pts = located.map((p) => ({ lat: p.lat!, lng: p.lng! }));
  if (pts.length === 1) return [pts[0]];

  let a = pts[0];
  let b = pts[1];
  let maxKm = haversineKm(a, b);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const km = haversineKm(pts[i], pts[j]);
      if (km > maxKm) {
        maxKm = km;
        a = pts[i];
        b = pts[j];
      }
    }
  }
  const centroid = {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
  return [0.3, 0.4, 0.5, 0.6, 0.7].map((t) => lerp(lerp(a, b, t), centroid, 0.3));
}

function scoreAndPick(
  candidates: { name: string; hub: { lat: number; lng: number } }[],
  located: { id: string; name: string; lat?: number | null; lng?: number | null; transport: string }[]
): RegionCandidate[] {
  const scored = candidates
    .map(({ name, hub }) => {
      const per = located.map((p) => {
        const km = haversineKm({ lat: p.lat!, lng: p.lng! }, hub);
        // 이 경로는 외부 API 를 아예 부르지 않는 직선거리 추정이다 —
        // `real: false` 를 붙여야 화면이 `경로 기준` 이라 말하지 않고 `거리 추정` 으로 뜬다(CLAUDE.md §6).
        return { pid: p.id, name: p.name, min: estMinutes(km, p.transport), real: false };
      });
      const mins = per.map((x) => x.min);
      const maxMin = Math.max(...mins);
      const devMin = maxMin - Math.min(...mins);
      // 공평성 점수 — 식은 lib/scoring/fairness.ts 한 곳에만 있다.
      // 여기는 브라우저에서도 도는 즉시 추정 경로라, 서버 스코어러(날씨·상권 등)를
      // await 할 수 없어 공평성만 본다. 실계산은 lib/routing.ts 가 전체 스코어러로 한다.
      return { name, hub, per, maxMin, devMin, score: fairnessRaw(maxMin, devMin) };
    })
    .sort((a, b) => a.score - b.score);

  return scored.slice(0, 3).map((s, i) => ({
    id: `r${i + 1}`,
    name: s.name,
    lat: s.hub.lat,
    lng: s.hub.lng,
    maxMin: s.maxMin,
    devMin: s.devMin,
    reason:
      i === 0
        ? `가장 균형적 — 최대 ${s.maxMin}분 · 편차 ${s.devMin}분`
        : `최대 ${s.maxMin}분 · 편차 ${s.devMin}분`,
    perParticipant: s.per,
  }));
}

export function recommendRegions(
  participants: Participant[],
  /**
   * 호출부가 미리 구해 둔 후보 목록.
   *
   * 이 함수는 **동기**라(브라우저에서도 도는 즉시 추정 경로) 카카오를 직접 못 부른다.
   * 그런데 실제 역 후보는 API 가 필요하다 — 그래서 `app/api/midpoint` 가 한 번 구해
   * **시간순·거리순 양쪽에 같은 목록**을 넘긴다.
   *
   * ⚠️ 두 모드가 같은 후보를 써야 한다. 후보가 다르면 사용자가 토글할 때 **목록 자체가
   *    바뀌어** "뭐가 바뀐 건지" 알 수 없다. 토글은 *같은 후보의 다른 계산*이어야 한다.
   * ⚠️ 안 넘기면 예전처럼 하드코딩 후보를 쓴다 — 이 함수를 직접 부르는 다른 곳이
   *    깨지지 않게 하기 위함이다.
   */
  presolved?: { name: string; hub: { lat: number; lng: number } }[],
): RegionCandidate[] {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  if (located.length === 0) return [];

  if (presolved && presolved.length > 0) return scoreAndPick(presolved, located);

  if (isOutsideHubCoverage(located)) {
    // 수도권 밖 — 이름 있는 서울 후보 대신 좌표 자체로 계산한다.
    // (실 API 키가 있으면 lib/routing.ts 쪽이 이 좌표를 실제 지명으로 바꿔준다)
    const candidates = geometricCandidates(located).map((hub, i) => ({ name: `중간지점 ${i + 1}`, hub }));
    return scoreAndPick(candidates, located);
  }

  const pool = nearCentroidHubs(located).map((name) => ({ name, hub: HUBS[name] }));
  return scoreAndPick(pool, located);
}

// ── 추천장소 생성: 선정된 지역 인근 가게 후보(2차 투표 대상) ──
const PLACE_SETS: { emoji: string; category: string; suffix: string; deposit: number; rating: number }[] = [
  { emoji: "🍺", category: "술집", suffix: "역전할머니맥주", deposit: 10000, rating: 4.5 },
  { emoji: "🍽️", category: "일식", suffix: "스시노메", deposit: 15000, rating: 4.7 },
  { emoji: "🍲", category: "한식", suffix: "더진국", deposit: 8000, rating: 4.3 },
  { emoji: "☕", category: "카페", suffix: "블루보틀", deposit: 5000, rating: 4.6 },
  { emoji: "🥩", category: "고기", suffix: "새마을식당", deposit: 12000, rating: 4.4 },
];

export function generatePlaces(regionName: string, center?: { lat: number; lng: number }): PlaceCandidate[] {
  const h = Math.abs(hashStr(regionName));
  return PLACE_SETS.slice(0, 4).map((p, i) => ({
    id: `p${i + 1}`,
    name: `${p.suffix} ${regionName}점`,
    category: p.category,
    emoji: p.emoji,
    // mock에도 좌표를 줘야 지도 후보 핀이 보인다 — 거점 주변으로 살짝 흩뿌림
    lat: center ? center.lat + (((h >> (i * 2)) % 9) - 4) * 0.0016 : undefined,
    lng: center ? center.lng + (((h >> (i * 2 + 7)) % 9) - 4) * 0.0021 : undefined,
    distanceM: 120 + ((h >> (i * 3)) % 400),
    rating: p.rating,
    reservable: i < 3,
    depositPerHead: p.deposit,
  }));
}
