/* 남의 투표가 바로 보이게 — 서버가 밀어 준다(그릴링: SSE).
   자체 서버(Node 상시 프로세스)라면 연결을 물고 있어도 된다.

   ⚠ Vercel(서버리스)에서는 얘기가 다르다 — 함수마다 실행 시간 한도가 있어
     이 연결은 그 한도에서 끊긴다. maxDuration 을 넉넉히 잡아 두는 것으로
     끊기는 간격을 늘릴 뿐, 아예 안 끊기게는 못 한다(플랜마다 상한이 다르다).
     다행히 클라이언트(`app/m/[code]/ui.tsx`)가 onerror 에서 스스로 다시 붙으니
     끊겨도 서비스가 죽지는 않는다 — 몇 초 반짝 끊겼다 이어지는 정도다.
     새 연결은 'stream' 한도(lib/ratelimit.ts)로 세는데, 그 한도는 이 프로세스의
     메모리에 있다 — Vercel 이 여러 인스턴스를 띄우면 인스턴스마다 따로 센다
     (같은 파일의 주석 참고). 지금은 그대로 둔다 — 사고를 막는 정도는 여전히 된다.

   [주의] 닫힌 스트림에 쓰면 ERR_INVALID_STATE 가 나고, 그게 타이머 안에서 터지면
   uncaughtException 으로 서버가 죽는다(실제로 죽었다). 그래서
     · 닫힘을 스스로 기억하고(closed)
     · 쓰기를 한 곳(send)으로 모아 try 로 감싸고
     · 실패하면 즉시 정리한다. */
import { listen } from '../../stream-bus';
import * as db from '@/lib/db';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
/* Vercel Hobby/Pro 모두 60초까지는 별도 설정 없이 허용된다(그 이상은 플랜에 따라
   상한이 다르다) — 기본값(대개 10~15초)보다 넉넉히 잡아 재연결 빈도를 줄인다.
   자체 서버(Node 상시 프로세스)에서는 이 값 자체가 무시되니 해가 없다. */
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { code: string } }) {
  /* 배포 점검 §3⑦ — 여기도 한도가 없었다. **새 연결을 여는 순간만** 센다 —
     한 번 붙은 뒤 그 안에서 도는 하트비트·이벤트는 이 줄을 다시 지나지 않는다.
     정상적인 재연결(페이지를 열 때·탭에 돌아올 때·망이 끊겼다 돌아올 때)은 기본 한도로도 넉넉하다. */
  const 제한 = 횟수확인('stream');
  if (!제한.ok) return 너무잦음(제한.다시);
  /* 없는 모임에도 200 으로 열려 연결이 그대로 유지됐다 — 조회(GET)는 404 인데 여기만 달랐다.
     아무 코드나 대면 서버가 연결과 25초 타이머를 계속 떠안는다. */
  if (!(await db.getMeeting(params.code))) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { 'content-type': 'application/json' },
    });
  }

  const enc = new TextEncoder();
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(c) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (timer) { clearInterval(timer); timer = null; }
        if (off) { off(); off = null; }
        try { c.close(); } catch { /* 이미 닫혔으면 그만 */ }
      };

      const send = (ev: string) => {
        if (closed) return;
        try { c.enqueue(enc.encode(`data: ${ev}\n\n`)); }
        catch { cleanup(); }          /* 상대가 떠났다 — 조용히 접는다 */
      };

      send('hello');
      off = listen(params.code, () => send('changed'));
      timer = setInterval(() => send('ping'), 25000);   /* 조용한 연결이 끊기지 않게 */

      /* 브라우저가 떠나면 여기로 온다 */
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (off) off();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
