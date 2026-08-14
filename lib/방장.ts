/* **이 사람이 이 모임의 방장인가** — 잣대는 여기 하나다 (논의124).

   한동안 규칙이 둘이다:
     · 방장 줄에 계정이 있으면(논의123 뒤에 만든 모임) **계정이 열쇠다** — 참가자 쿠키를 주워도 못 한다
     · 계정이 없으면(옛 모임) 지금까지처럼 **쿠키로** — 옛 모임도 그대로 굴러가야 한다

   왜 한 곳이어야 하나: 조회와 변경이 서로 다른 잣대를 쓰면
   **화면에는 방장 단추가 보이는데 눌러도 403** 이 난다. 그 반대도 마찬가지로 나쁘다 —
   실제로 모임 화면의 첫 그림(`app/m/[code]/page.tsx`)만 이 규칙을 안 써서,
   폰을 바꿔 로그인만 하고 들어온 방장이 자기 모임에서 "이 모임에 참여하기" 를 봤다.

   쓰는 곳: `app/api/m/[code]/route.ts`(GET·POST) · `app/m/[code]/page.tsx`(첫 그림). */
import type { 로그인사람 } from './auth';

export function 방장인가(
  나: 로그인사람 | null,
  방장: { id: string; userId: string | null } | null,
  myId: string | null,
) {
  if (!방장) return false;                        /* 방장 줄이 없는 옛 유령 모임 */
  return 방장.userId ? !!나 && 나.id === 방장.userId : myId === 방장.id;
}
