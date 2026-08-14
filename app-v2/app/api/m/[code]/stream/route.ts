/* 남의 투표가 바로 보이게 — 서버가 밀어 준다(그릴링: SSE).
   자체 서버라 연결을 물고 있어도 된다.

   [주의] 닫힌 스트림에 쓰면 ERR_INVALID_STATE 가 나고, 그게 타이머 안에서 터지면
   uncaughtException 으로 서버가 죽는다(실제로 죽었다). 그래서
     · 닫힘을 스스로 기억하고(closed)
     · 쓰기를 한 곳(send)으로 모아 try 로 감싸고
     · 실패하면 즉시 정리한다. */
import { listen } from '../../stream-bus';
import * as db from '@/lib/db';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

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
