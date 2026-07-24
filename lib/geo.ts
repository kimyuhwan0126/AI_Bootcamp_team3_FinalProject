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
export function estMinutes(km: number, transport: string): number {
  const base = transport === "car" ? 8 : 6;   // 접근/대기
  const speed = transport === "car" ? 0.9 : 1.6; // 분/km 가중
  return Math.round(base + km * (transport === "car" ? 2.2 : 3.0) * speed);
}

// ── 중간지역 AI 추천: 참가자 출발지들로 "가장 공평한" 거점 후보 3개 ──
export function recommendRegions(participants: Participant[]): RegionCandidate[] {
  const located = participants.filter((p) => p.lat != null && p.lng != null);
  if (located.length === 0) return [];

  const scored = CANDIDATE_HUBS.map((name) => {
    const hub = HUBS[name];
    const per = located.map((p) => {
      const km = haversineKm({ lat: p.lat!, lng: p.lng! }, hub);
      return { pid: p.id, name: p.name, min: estMinutes(km, p.transport) };
    });
    const mins = per.map((x) => x.min);
    const maxMin = Math.max(...mins);
    const minMin = Math.min(...mins);
    const devMin = maxMin - minMin;
    // 공평성 점수: 최대 이동시간 + 편차 가중(편차가 클수록 불리)
    const score = maxMin + devMin * 0.8;
    return { name, hub, per, maxMin, devMin, score };
  }).sort((a, b) => a.score - b.score);

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

// ── 추천장소 생성: 선정된 지역 인근 가게 후보(2차 투표 대상) ──
const PLACE_SETS: { emoji: string; category: string; suffix: string; deposit: number; rating: number }[] = [
  { emoji: "🍺", category: "술집", suffix: "역전할머니맥주", deposit: 10000, rating: 4.5 },
  { emoji: "🍽️", category: "일식", suffix: "스시노메", deposit: 15000, rating: 4.7 },
  { emoji: "🍲", category: "한식", suffix: "더진국", deposit: 8000, rating: 4.3 },
  { emoji: "☕", category: "카페", suffix: "블루보틀", deposit: 5000, rating: 4.6 },
  { emoji: "🥩", category: "고기", suffix: "새마을식당", deposit: 12000, rating: 4.4 },
];

export function generatePlaces(regionName: string): PlaceCandidate[] {
  const h = Math.abs(hashStr(regionName));
  return PLACE_SETS.slice(0, 4).map((p, i) => ({
    id: `p${i + 1}`,
    name: `${p.suffix} ${regionName}점`,
    category: p.category,
    emoji: p.emoji,
    distanceM: 120 + ((h >> (i * 3)) % 400),
    rating: p.rating,
    reservable: i < 3,
    depositPerHead: p.deposit,
  }));
}
