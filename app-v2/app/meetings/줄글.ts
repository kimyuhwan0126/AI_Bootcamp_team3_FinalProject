/* 목록 카드에 적는 말. 순수 함수만 둔다 —
   '3일 뒤' 를 화면 한복판에서 셈하면 눈으로 세어 볼 수밖에 없다.

   ⚠ 낱말은 논의71~73 으로 못 박혀 있다: 모임 · 방장 · 참여자 · 지역 · 지점 · 선택 · 마무리 · 지난 모임.
   '투표 · 표 · 동네 · 가게 · 마감' 은 여기에도 화면에도 없다. */
import type { MyMeeting } from '@/lib/db';

/* 화면이 보는 상태는 넷이다. 서버의 stage(셋) + closed(참·거짓)를 여기서 한 축으로 편다 —
   두 칸을 화면 곳곳에서 따로 보면 '마무리한 result 모임' 이 두 갈래로 갈린다. */
export type 상태 = 'region' | 'place' | 'result' | 'past';

/* 거르개 칩 이름과 카드에 적는 말이 **같은 표**에서 나온다.
   예전판은 이 둘이 다른 표였다(`stageKey` 와 `STAGE_LABEL`) — 칩 '모집' 으로 걸러 낸 카드에
   '지역 정하는 중' 이라 적혀 있어 무엇으로 걸러진 것인지 알 수 없었다 (11_예전판_기록 §4). */
export const 상태이름: Record<상태, string> = {
  region: '지역 정하는 중',
  place: '지점 정하는 중',
  result: '정해짐',
  past: '지난 모임',
};

/* 마무리한 모임은 무엇을 정했든 '지난 모임' 이다 (논의73) */
export function 상태of(m: MyMeeting): 상태 {
  if (m.closed) return 'past';
  return m.stage === 'result' ? 'result' : m.stage;
}

/** 아직 고를 것이 남은 모임인가 — 여기서만 '내 할 일' 이 생긴다 */
export const 진행중 = (s: 상태) => s === 'region' || s === 'place';

/* 날은 한국시간 자정으로 가른다 (lib/time.ts 와 같은 잣대 +9h).
   UTC 로 가르면 저녁 약속이 하루씩 밀려 '오늘' 이 '내일' 이 된다. */
const KST = 9 * 60 * 60_000;
const 한국날 = (t: number) => Math.floor((t + KST) / 86_400_000);

/** 언제 만나나. `D-3` 대신 읽히는 말로 (논의73) */
export function 언제(m: MyMeeting, 지금: number): string {
  if (!m.meetAt) {
    /* 약속 시간 없이 만든 모임이 끝나면 여기서 그냥 빈 줄로 남았다 — "언제쯤 일이었나" 를
       영영 알 길이 없어졌다(논의109 가 고치라고 세운 안건). 서버가 아는 마지막 사실인
       **만든 날**로 대신 짚는다. 진행 중인 모임에는 안 붙인다 — "8월 1일" 이 '언제 만나나' 로
       읽히면 안 되고, 그건 만든 날일 뿐 약속한 날이 아니다. */
    if (!m.closed || !m.createdAt) return '';
    const c = new Date(new Date(m.createdAt).getTime() + KST);
    return `${c.getUTCMonth() + 1}월 ${c.getUTCDate()}일쯤`;
  }
  const t = new Date(m.meetAt).getTime();
  if (Number.isNaN(t)) return '';
  /* 지난 모임에 '며칠 뒤'는 뜻이 없다. 대신 **언제 만났는지**를 적는다 —
     예전판은 이 줄을 통째로 뺐다(논의109 가 고치라고 한 바로 그 자리). */
  if (m.closed) {
    const d = new Date(t + KST);
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  }
  const 차 = 한국날(t) - 한국날(지금);
  if (차 === 0) return '오늘';
  if (차 === 1) return '내일';
  if (차 > 1) return `${차}일 뒤`;
  if (차 === -1) return '어제';
  return `${-차}일 전`;
}

/** 어디로 정해졌나. 지점을 고르는 중이면 `winner` 는 **정해진 지역**이다 (규약) */
export function 어디(m: MyMeeting): string {
  if (!m.winner) return '';
  /* 지역만 정해진 모임에 곳 이름을 덜렁 적으면 '다 정해졌다'로 읽힌다 — 조사로 갈라 준다.
     '에서' 는 받침을 안 가리므로 따로 고를 것이 없다. */
  return 상태of(m) === 'place' ? `${m.winner}에서` : m.winner;
}

/** 카드 아래 한 줄 — 지금 무엇을 하는 중인가 · 언제 · 몇 명 · 어디로 정해졌나 */
export function 요약(m: MyMeeting, 지금: number): string {
  return [상태이름[상태of(m)], 언제(m, 지금), `${m.people}명`, 어디(m)]
    .filter(Boolean).join(' · ');
}
