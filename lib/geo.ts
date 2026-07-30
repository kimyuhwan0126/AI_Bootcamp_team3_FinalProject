// ─────────────────────────────────────────────────────────────
// geo.ts — 오프라인 mock 지오코딩 + 중간지점 AI 추천 + 장소 생성
// (외부 지도 API 없이 기기에서 바로 동작. Neon/Vercel 배포 시에도
//  KAKAO/ODsay/TMAP 키를 넣으면 이 파일만 교체하면 됩니다.)
// ─────────────────────────────────────────────────────────────
import type { Participant, RegionCandidate, PlaceCandidate } from "./types";

// 서울 주요 거점 좌표(대략값). 지오코딩/후보지 풀로 함께 사용.
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
};

// 후보 거점 풀(중간지역 투표 후보로 뽑히는 지역)
export const CANDIDATE_HUBS = [
  "사당", "교대", "강남역", "잠실", "건대입구", "홍대입구",
  "신촌", "종로3가", "시청", "왕십리", "영등포", "구로디지털단지",
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
  // 반경 안에 후보가 부족하면 가까운 순으로 최소 4곳은 확보
  return near.length >= 3 ? near : byDist.slice(0, 4).map((h) => h.name);
}

// CANDIDATE_HUBS 는 수도권 지하철역 12곳뿐이다. 참가자들이 수도권 밖(예: 안동·대구)
// 이면 위 "가까운 순 최소 확보" 폴백이 수백 km 떨어진 서울 후보를 그대로 내놓는다
// (신사·성수·신림 → 영등포 문제와 같은 원인이 지역 밖에서 재발한 것).
// 참가자 중심이 가장 가까운 고정 후보로부터도 이 거리보다 멀면 "수도권 밖"으로
// 보고, 이름표 있는 후보 대신 좌표 기반으로 계산한다.
const HUB_COVER_KM = 45;

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
        return { pid: p.id, name: p.name, min: estMinutes(km, p.transport) };
      });
      const mins = per.map((x) => x.min);
      const maxMin = Math.max(...mins);
      const devMin = maxMin - Math.min(...mins);
      // 공평성 점수: 최대 이동시간 + 편차 가중(편차가 클수록 불리)
      return { name, hub, per, maxMin, devMin, score: maxMin + devMin * 0.8 };
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

export function recommendRegions(participants: Participant[]): RegionCandidate[] {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  if (located.length === 0) return [];

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
