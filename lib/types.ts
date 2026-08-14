/* 타입은 여기 한 곳. DB 컬럼 이름을 그대로 쓴다 —
   변환 계층을 두면 컬럼 하나 늘 때마다 두 곳을 고쳐야 한다. */

/* 지점은 한 단계다 (그릴링 논의34) — 모으기와 선정이 같은 손짓이라 나눌 이유가 없었다 */
export type Stage = 'region' | 'place' | 'result';
export type Kind = 'region' | 'place';
export type PState = 'active' | 'kicked' | 'pending';
/* 화면이 주는 것만 받는다 — 'bus' 는 고를 길이 없어 타입에만 남아 있었다.

   **'walk' 를 없애고 'transit' 에 합쳤다.** 둘을 갈라 둘 이유가 없었다:
   대중교통은 어차피 타는 곳까지 걸어가는 것이 앞뒤로 붙고, 가까운 곳이면 걷는 것이 곧 그 길이다.
   고르는 사람 눈에는 '걸어서' 와 '대중교통' 이 같은 답으로 이어지는데 둘을 물으면 망설이게만 된다.
   남은 갈림은 하나다 — **차를 가져가나 안 가져가나.**

   ⚠ 'walk' 를 받던 자리는 이제 'transit' 으로 바꿔 받는다(거절하지 않는다) —
      먼저 열어 둔 화면이나 옛 주소가 아직 그 값을 들고 있을 수 있다.
   ⚠ 운영 DB 의 check 제약에는 'walk' 가 아직 살아 있다. 쓰는 줄이 0개라 급하지 않고,
      제약을 좁히는 것은 되돌리기 어려워 사람이 정할 일로 남긴다. */
export type Transport = 'transit' | 'car';
/* 신호등 셋 (논의115·116) — 제때 간다 / 늦는다 / 못 간다. null 은 '아직 안 눌렀다'.
   약속 시간이 정해진 모임에서만 쓴다. 표에도 가운데 계산에도 안 들어간다 — 알리는 것이 전부다. */
export type Going = 'go' | 'late' | 'no';

export type Meeting = {
  code: string;
  name: string;
  scope: 'region' | 'place';
  purpose: string | null;
  stage: Stage;
  meet_at: string | null;
  radius_m: number;
  host_id: string;
  winner_region_id: string | null;
  winner_place_id: string | null;
  closed_at: string | null;
  /* 서버는 진작부터 줬다(`getMeeting` 이 select *, `isoRow` 가 ISO 문자열로 바꾼다) —
     타입에만 없어서 화면이 '언제 만든 모임인가'를 타입 안전하게 못 읽었다 (논의109) */
  created_at: string;
  updated_at: string;
  /* AI 를 이 단계에서 몇 번 썼나 (논의93) — 셈이 메모리가 아니라 모임 줄에 있다.
     화면은 응답의 `aiLeft` 를 쓴다. 여기 있는 것은 그 셈이 어디에 사는지를 말할 뿐이다. */
  ai_used_region: number;
  ai_used_place: number;
};

export type Participant = {
  id: string;
  code: string;
  user_id: string | null;
  name: string;
  origin_name: string | null;
  lat: number | null;
  lng: number | null;
  transport: Transport;
  state: PState;
  requested_at: string | null;
  /* 남들도 본다 (논의116) — 이 기기에만 남기면 "모두에게 알린다" 가 되지 않는다 */
  going: Going | null;
  /* 서버가 직접 알려 준다. 화면이 id 를 견주면 안 된다 — 코드만 아는 사람에게는
     id 를 다 비워 보내므로(논의95) 견주는 순간 전원이 방장이 됐다. */
  방장인가: boolean;
  /* 이 사람이 지금 단계에서 한 곳이라도 골랐나. voters 를 숨겨도(논의95)
     '4/5 선택' 은 셀 수 있어야 한다 — 누가 골랐는지가 아니라 몇 명인지는 가려 둘 것이 아니다. */
  골랐나: boolean;
};

export type Candidate = {
  id: string;
  code: string;
  kind: Kind;
  ref_id: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  by_ai: boolean;
  created_by: string | null;
  /* 조회할 때 붙여 준다 — votes 를 세로로 세지 않게 */
  votes: number;
  voters: string[];
};

/* 화면 하나가 필요한 전부. API 는 항상 이 모양으로 준다. */
export type MeetingView = {
  meeting: Meeting;
  participants: Participant[];
  candidates: Candidate[];
  me: { participantId: string | null; isHost: boolean; myVotes: string[] };
};

/* 변경은 전부 이 하나로 들어온다. 기능이 늘면 여기 한 줄만 는다. */
export type Action =
  | { action: 'join'; name: string; pin?: string; origin?: string; lat?: number; lng?: number; transport?: Transport }
  | { action: 'ping'; kind: Kind; refId: string; name: string; lat: number; lng: number; address?: string }
  | { action: 'unping'; candidateId: string }
  /* 옛 `vote` 는 없앴다 (논의98) — 지점도 핑=투표라(논의26 ①) 화면이 한 번도 안 부르는데
     API 로는 누구나 부를 수 있었다. 지금은 400 unknown_action 이다. */
  | { action: 'confirm'; candidateId: string }
  | { action: 'reopen' }
  /* 마무리 → 지난 모임. force 는 '정하지 않고 끝내기'(논의106) — 방장 도구이고
     화면이 한 번 더 묻고 나서 싣는다. 없으면 아무것도 안 정한 모임은 409 다. */
  | { action: 'close'; force?: boolean }
  | { action: 'kick'; participantId: string }
  | { action: 'approve'; participantId: string; ok: boolean }
  /* 모임 범위는 만들 때 정하고 끝이다 (논의79) — scope 가 실려 오면 400 scope_locked.
     받는 칸이 아니라 '와도 거절한다'는 뜻으로 적는다: 타입에서 지우면 route 의
     `'scope' in body` 가 왜 있는지 알 수 없어진다. */
  | { action: 'update'; name?: string; meetAt?: string | null; scope?: never }
  | { action: 'remove' }
  /* 스스로 나가기 (그릴링 논의28). 방장은 못 나간다 (논의125) — 409 host_cannot_leave */
  | { action: 'leave' }
  /* 옛 `handover`(방장 넘기기)는 없앴다 (논의125) — 넘겨받는 사람이 로그인 안 했으면
     그 모임이 다시 '쿠키만 가진 방장'이 되어 방장 벽돌(논의122)이 돌아온다.
     지금은 400 unknown_action 이다. */
  | { action: 'ai' }
  /* AI 가 올린 곳 한 번에 치우기 (논의94) — 방장 도구. AI 것은 0표여도 안 사라져(논의53)
     이 길이 없으면 앱 안에 치울 방법이 없다. 누가 고른 것은 남는다. */
  | { action: 'clearAi' }
  /* 내 신호등 (논의115·116) — 멤버가 자기 것만 바꾼다. 그래서 participantId 를 안 받는다.
     null 은 '아직'. 약속 시간이 없는 모임에서는 400 no_meet_time. */
  | { action: 'going'; status: Going | null };
