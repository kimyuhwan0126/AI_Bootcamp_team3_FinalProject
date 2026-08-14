/* **지금 무엇을 고르는 중인가** — 잣대는 여기 하나다.

   이 물음의 답이 네 곳에서 쓰인다:
     · `lib/db.ts` `getView`      — 화면에 줄 표·내 선택을 이 종류로 추린다
     · `lib/db.ts` `myMeetings`   — 목록의 '몇 명이 골랐어요'
     · `app/api/m/[code]/route.ts` — `confirm` 이 무엇을 확정할 수 있나 · `ai` 가 무엇을 물을까
     · `lib/ai.ts`                 — AI 에게 지역을 물을지 지점을 물을지

   넷이 각자 셈하면 언젠가 갈라진다. 갈라지면 **화면은 지점을 묻는데 AI 는 지역을 주고**,
   목록이 세는 수와 화면이 세는 수가 달라진다. 그런 어긋남은 재현이 어려워 오래 산다.

   규칙은 두 마디다:
     · **끝난 모임은 '실제로 정해진 것' 이 종류를 말한다** — 지점까지 정했으면 지점,
       지역만 정하고 끝났으면 지역. 단계 칸은 그때 이미 뜻을 잃는다
     · 진행 중이면 **단계가 말한다**

   ⚠ `myMeetings` 만 이 함수를 못 쓴다 — SQL 안에서 셈하기 때문이다(모임마다 왕복하지 않으려고).
      그쪽 `case` 문은 **이 규칙을 글자 그대로 옮긴 것**이다. 여기를 고치면 그쪽도 같이 고쳐라. */
import type { Kind, Meeting } from './types';

export const 지금종류 = (m: Pick<Meeting, 'closed_at' | 'stage' | 'winner_place_id'>): Kind =>
  m.closed_at || m.stage === 'result'
    ? (m.winner_place_id ? 'place' : 'region')
    : m.stage === 'region' ? 'region' : 'place';
