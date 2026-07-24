// ─────────────────────────────────────────────────────────────
// debug.ts — 시나리오별 모임 시드 생성 (개발 전용)
// 앱과 동일한 store 함수를 그대로 호출해 상태를 재현하므로,
// 시드된 데이터는 실제 사용 흐름과 100% 동일합니다.
// (시드는 LLM을 호출하지 않음 — 확정은 leader 수동 경로로 재현)
// ─────────────────────────────────────────────────────────────
import {
  createMeeting,
  joinMeeting,
  setOrigin,
  openChat,
  appendUserChat,
  confirmRegion,
  confirmPlace,
  reserve,
} from "./store";
import type { Transport } from "./types";
import { SCENARIOS } from "./scenarios";

export interface Identity {
  id: string;
  name: string;
  isLeader: boolean;
}
export interface SeedResult {
  code: string;
  identities: Identity[];
  scenario: string;
}

const NAMES = ["지훈", "유나", "민수", "서연", "하늘", "도윤", "지아", "은우"];
const STATIONS = ["강남역", "홍대입구", "잠실", "사당", "건대입구", "수원역", "노원", "부천"];
const PW = "1234";

// 참가자 N명으로 모임 뼈대 생성
function make(label: string, n: number, headcount: number): { code: string; leaderId: string; ids: Identity[] } {
  const leaderName = NAMES[0];
  const { code, leaderId } = createMeeting({ name: label, password: PW, headcount, leaderName });
  const ids: Identity[] = [{ id: leaderId, name: leaderName, isLeader: true }];
  for (let i = 1; i < n; i++) {
    // 시드는 정원 제한을 무시(정원 초과 시나리오 재현용)
    const r = joinMeeting({ code, password: PW, name: NAMES[i], ignoreCapacity: true });
    if (r.ok) ids.push({ id: r.participantId, name: NAMES[i], isLeader: false });
  }
  return { code, leaderId, ids };
}

// 출발지 등록 (count명, transport 지정)
function origins(code: string, ids: Identity[], count: number, transport: Transport | "mix") {
  for (let i = 0; i < Math.min(count, ids.length); i++) {
    const t: Transport = transport === "mix" ? (i === ids.length - 1 ? "car" : "transit") : transport;
    setOrigin({ code, participantId: ids[i].id, origin: STATIONS[i % STATIONS.length], transport: t });
  }
}

// 채팅 발화 일괄 (texts[i] = i번째 참가자의 발화, null이면 침묵)
function talks(code: string, ids: Identity[], texts: (string | null)[]) {
  for (let i = 0; i < ids.length; i++) {
    const t = texts[i];
    if (t) appendUserChat({ code, participantId: ids[i].id, text: t });
  }
}

export function isKnownScenario(id: string): boolean {
  return SCENARIOS.some((s) => s.id === id);
}

export function seedScenario(id: string): SeedResult | null {
  const meta = SCENARIOS.find((s) => s.id === id);
  if (!meta) return null;
  const label = `[디버그] ${meta.title}`;

  switch (id) {
    // ── 메인 ──
    case "main_empty": {
      const { code, ids } = make(label, 4, 4);
      return done(code, ids, id);
    }
    case "main_partial": {
      const { code, ids } = make(label, 4, 4);
      origins(code, ids, 2, "mix");
      return done(code, ids, id);
    }
    case "main_ready": {
      const { code, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      return done(code, ids, id);
    }
    case "main_allcar": {
      const { code, ids } = make(label, 4, 4);
      origins(code, ids, 4, "car");
      return done(code, ids, id);
    }
    case "main_large": {
      const { code, ids } = make(label, 8, 8);
      origins(code, ids, 8, "mix");
      return done(code, ids, id);
    }
    case "main_solo": {
      const { code, ids } = make(label, 1, 1);
      origins(code, ids, 1, "transit");
      return done(code, ids, id);
    }

    // ── AI 대화 (mock 지역 후보로 openChat — LLM 미호출) ──
    case "chat_open": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      return done(code, ids, id);
    }
    case "chat_opinions": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, ["여기 1번 후보 괜찮네요!", "저도 좋아요 👍", null, null]);
      return done(code, ids, id);
    }
    case "chat_split": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, [
        "저는 1번이 좋아요",
        "음 저는 2번이 나은데요",
        "1번이요!",
        "2번 쪽이 저는 더 가까워요 🥲",
      ]);
      return done(code, ids, id);
    }
    case "chat_region_done": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, ["1번 좋아요!", "동의합니다", "저도요 👍", null]);
      confirmRegion({ code, regionId: "r1", by: "leader" });
      return done(code, ids, id);
    }
    case "chat_stall": {
      // 의견 없이 정체 — 방장의 "AI에게 결정 요청"/"직접 확정" 사용을 유도하는 상황
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, [null, "ㅋㅋ 다들 바쁜가", null, null]);
      return done(code, ids, id);
    }

    // ── 결과 ──
    case "result": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, ["1번 좋아요!", "좋아요", "동의!", null]);
      confirmRegion({ code, regionId: "r1", by: "leader" });
      talks(code, ids, ["고기 먹으러 가요 🥩", "콜!", null, null]);
      confirmPlace({ code, placeId: "p1", by: "leader" });
      return done(code, ids, id);
    }
    case "result_reserved": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      talks(code, ids, ["1번 좋아요!", "좋아요", "동의!", null]);
      confirmRegion({ code, regionId: "r1", by: "leader" });
      confirmPlace({ code, placeId: "p1", by: "leader" });
      reserve({ code, participantId: leaderId, placeId: "p1" }); // 예약가능 장소
      return done(code, ids, id);
    }

    // ── 엣지: 예약불가 장소(p4=카페) 확정 ──
    case "result_noreserve": {
      const { code, leaderId, ids } = make(label, 4, 4);
      origins(code, ids, 4, "mix");
      openChat({ code, participantId: leaderId });
      confirmRegion({ code, regionId: "r1", by: "leader" });
      talks(code, ids, ["카페가 좋아요 ☕", "저도 커피!", null, null]);
      confirmPlace({ code, placeId: "p4", by: "leader" }); // p4 = 예약 불가
      return done(code, ids, id);
    }

    // ── 엣지: 정원 초과 (정원 3명인데 5명 참여) ──
    case "capacity_over": {
      const { code, ids } = make(label, 5, 3);
      origins(code, ids, 5, "mix");
      return done(code, ids, id);
    }

    default:
      return null;
  }
}

function done(code: string, ids: Identity[], scenario: string): SeedResult {
  return { code, identities: ids, scenario };
}
