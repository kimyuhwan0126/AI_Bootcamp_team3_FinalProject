/* 한 모임의 조회와 모든 변경.
   변경을 엔드포인트마다 쪼개지 않는다 — 기능이 늘어도 파일이 안 늘고 case 한 줄만 는다.
   권한은 여기서만 막는다(그릴링: 서버 Route Handler 에서만). */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db';
import { getParticipantId, setParticipantCookie, hashPin, 지금로그인 } from '@/lib/auth';
import { bump } from '../stream-bus';
import { suggest } from '@/lib/ai';
import { 지금종류 } from '@/lib/단계';
import { 방장인가 } from '@/lib/방장';
import { 한국안 } from '@/lib/geo';
import { 횟수확인, 너무잦음 } from '@/lib/ratelimit';
/* 약속 시간 잣대는 만들 때(api/m)와 고칠 때가 한 벌이어야 한다 (논의70 · E 갈래가 옮겨 뒀다) —
   베껴 두면 한쪽만 고치고 잊는다. */
import { 약속시간유효 } from '@/lib/time';
import type { Action, Kind } from '@/lib/types';
import { 이동수단 } from '@/lib/이동수단';
import { 기다릴시간, 틀렸다, 맞혔다 } from '@/lib/pin지연';

export const dynamic = 'force-dynamic';

const bad = (msg: string, code = 400) => NextResponse.json({ error: msg }, { status: code });

/* 폼이 막는 것은 서버도 막는다 — 화면만 믿으면 API 로 200자 이름이 그대로 들어왔다.
   참여자 이름은 참여 폼(form.tsx maxLength=12)과 같은 한도를 쓴다. */
const 이름한도 = 12;
const 모임이름한도 = 40;

/* 좌표 검사는 한 곳에만 둔다 — AI 경로가 db.ping 을 바로 불러 ping 의 가드를 통째로
   비껴갔다. 모이머가 다루는 자리는 한국이다(그릴링 논의55) — 여기를 안 보면
   join·ping·ai 셋으로 도쿄 좌표가 그대로 들어왔다(운영 DB 에 이미 4줄). */
const 좌표유효 = (lat: unknown, lng: unknown) =>
  Number.isFinite(lat) && Number.isFinite(lng) && 한국안(lat as number, lng as number);

/* ── 지금 이 모임에서 나는 누구인가 (논의124) ─────────────────────
   두 가지를 함께 본다: 계정(세션)과 참가자 쿠키.
   계정이 방장이면 쿠키가 없어도, 딴 줄을 가리켜도 방장 줄로 되돌려 준다 —
   쿠키를 잃은 방장이 자기 모임을 아무것도 못 만지던 것(논의122 '방장 벽돌')이 여기서 끝난다.
   되돌리면서 쿠키도 다시 심는다: 그래야 그다음 요청부터는 조회 한 번이 준다. */
async function 신원(code: string) {
  const 나 = await 지금로그인();
  const 방장 = await db.hostAccount(code);
  let myId = getParticipantId(code);
  if (나 && 방장?.userId && 방장.userId === 나.id && myId !== 방장.id) {
    myId = 방장.id;
    setParticipantCookie(code, 방장.id);
  } else if (나 && !myId) {
    /* **참여자도 계정으로 되살린다** (논의130).
       전에는 방장만 되살렸다. 그 시절엔 참가자 줄이 계정에 안 이어졌으니(`userId: null`)
       되살릴 근거가 없었다 — 그런데 논의130 이 참여도 계정에 잇기 시작하면서
       "목록엔 뜨는데 들어가면 남" 이라는 반쪽 약속이 참여자에게 그대로 생겼다.
       논의124 가 방장에게서 없앤 바로 그 병이다.

       ⚠ **쿠키가 아예 없을 때만** 본다. 쿠키가 있으면 그것을 따른다 —
          한 사람이 한 모임에 두 자리를 가질 일은 없지만(user_id 로 못 박힌다),
          쿠키를 덮어쓰기 시작하면 '지금 누구로 보고 있나' 가 요청마다 흔들린다.

       ⚠ **`active` 일 때만** 미리 잇는다. `kicked`·`pending` 은 여기서 손대지 않는다 —
          그 아래 `join` 갈래의 `계정자리` 가 **이름이 달라도 알아보는** 더 정교한 처리를
          이미 하고 있다. 여기서 먼저 낚아채면 강퇴된 사람이 다른 이름으로 돌아왔을 때
          `me.name !== name` 검사에 걸려 `kicked_out` 으로 튕긴다 — 실제로 그랬다. */
    const 자리 = await db.findByUser(code, 나.id);
    if (자리?.state === 'active') {
      myId = 자리.id;
      setParticipantCookie(code, 자리.id);
    }
  }
  return { 나, 방장, myId };
}

export async function GET(_: Request, { params }: { params: { code: string } }) {
  /* 배포 점검 §3⑦ — 조회에는 아무 한도가 없었다. 잠그지 않고 횟수만 본다(그릴링 논의92 와 같은 결) —
     초대 링크만 받은 사람도 참여 전에 이 길을 거친다. 한도는 geo·places 보다 넉넉하다
     (lib/ratelimit.ts 의 길별한도) — SSE 'changed' 한 번마다 화면이 다시 읽으러 오기 때문이다. */
  const 제한 = 횟수확인('view');
  if (!제한.ok) return 너무잦음(제한.다시);
  const code = params.code;
  await db.expirePending(code);
  const { 나, 방장, myId } = await 신원(code);
  const view = await db.getView(code, myId);
  if (!view) return bad('not_found', 404);
  /* 화면이 방장 단추를 그리는 근거는 이 한 칸이다 — db 는 쿠키만 아는 자리라
     계정 규칙을 여기서 한 번 더 씌운다 (논의124). */
  view.me.isHost = 방장인가(나, 방장, myId);
  return NextResponse.json(view);
}

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const code = params.code;
  /* 본문 파싱이 try 밖에 있어 깨진 JSON 이 500 이 됐다 — 없는 모임까지 404 대신 500 이었다.
     모양이 아닌 본문(null·문자열·action 없음)도 여기서 끊는다. 아래는 action 이 있다고 믿는다. */
  let 받은것: unknown;
  try { 받은것 = await req.json(); } catch { return bad('bad_json'); }
  if (!받은것 || typeof 받은것 !== 'object' || typeof (받은것 as Action).action !== 'string')
    return bad('unknown_action');
  const body = 받은것 as Action;
  const m = await db.getMeeting(code);
  if (!m) return bad('not_found', 404);

  const { 나, 방장, myId } = await 신원(code);
  const view = await db.getView(code, myId);
  const me = view?.participants.find((p) => p.id === myId) ?? null;
  const isHost = 방장인가(나, 방장, myId);

  /* 마무리한 모임은 읽기 전용 — 참여도 막고 열람만 시킨다.
     close 도 예외가 아니다. 예외로 두었더니 두 번째 마무리가 200 을 내고
     closed_at 만 지금으로 갱신됐다 — '언제 끝난 모임인가'가 눌러 볼 때마다 바뀌었다.
     지우기만 예외다 (논의54·107) — 이 한 줄이 지우기까지 삼켜서 굳어 버린 모임을
     방장조차 치울 수 없었다. 방장 검사는 아래 HOST_ONLY 가 그대로 한다. */
  if (m.closed_at && body.action !== 'remove') return bad('closed', 409);

  /* ── 권한 3단 (그릴링 확정) ───────────────────────────────
       ① 열람   : 누구나. 여기 오지 않는다(GET).
       ② 멤버   : 내 것을 다룬다 — 찍기·취소·투표. 참여도 여기.
       ③ 방장   : 단계를 넘기고, 사람을 다루고, 모임 자체를 건드린다.
     한 곳에 표로 두는 이유 — 새 동작이 늘 때 어디에 넣을지 고민이 한 줄로 끝난다. */
  const HOST_ONLY: Action['action'][] = [
    'confirm', 'reopen',                      /* 단계 */
    'kick', 'approve',                        /* 사람 */
    'close', 'remove', 'update',              /* 모임 자체 — 넘기기는 없앴다 (논의125) */
    'ai', 'clearAi',                          /* 돈이 드는 호출과 그 뒷정리 (v3 opt-in) */
  ];
  if (HOST_ONLY.includes(body.action) && !isHost) return bad('forbidden', 403);

  /* 참여 말고는 멤버여야 한다 — '멤버 아님'은 참여 폼으로 (그릴링 Q1=A) */
  if (body.action !== 'join' && (!me || me.state !== 'active')) return bad('not_member', 403);

  switch (body.action) {
    case 'join': {
      /* 이미 이 모임 사람이면 또 들어올 수 없다. 멤버 검사는 join 을 비껴가서
         이름만 바꿔 반복하면 한 브라우저로 참가자·표를 늘릴 수 있었다(재현됨).

         ⚠ **계정으로 알아본 사람은 빼 준다** (논의130). `신원()` 이 쿠키 없는 로그인 사용자를
         계정으로 되살리기 시작하면서, 새 폰에서 참여 폼을 낸 사람이 여기서 409 를 맞았다 —
         화면은 그것을 오류로 그리는데 실제로는 **이미 자기 자리에 돌아와 있는 상태**였다.
         아래 `계정자리` 갈래로 흘려보내면 출발지를 새로 받고 `resumed` 로 답한다. */
      if (me && me.state === 'active' && !(나 && me.user_id === 나.id))
        return bad('already_joined', 409);
      /* 승인을 기다리는 중이면 또 신청할 수 없다 */
      if (me && me.state === 'pending') return bad('awaiting_approval', 409);
      if (typeof body.name !== 'string') return bad('name_required');
      const name = body.name.trim();
      if (!name) return bad('name_required');
      if ([...name].length > 이름한도) return bad('name_too_long');

      /* 내보내진 기기가 '다른 이름'으로 들어오는 것은 강퇴 우회다 (전수 조사에서 재현).
         본인 이름으로 다시 오는 것은 아래에서 승인 대기로 받아 준다.

         ⚠ 여기도 **계정으로 알아본 사람은 빼 준다** — 위 `already_joined` 검사와 같은 까닭이다.
         빼지 않으면 **같은 사람·같은 계정인데 쿠키가 남아 있나 없나로 결과가 갈린다**:
         쿠키를 잃고 오면(→ 계정만 남음) 아래 `계정자리` 갈래가 이름이 달라도 알아보고
         승인 대기로 받아 주는데, **쿠키가 아직 남아 있으면** 여기서 그냥 튕겼다.
         강퇴 우회 방어는 '계정이 다른가' 로 이미 충분하다 — 계정이 같으면 이름을 얼마든지
         바꿔도 그 사람이라는 것을 계정이 증명한다. */
      if (me && me.state === 'kicked' && me.name !== name && !(나 && me.user_id === 나.id))
        return bad('kicked_out', 403);

      /* ── 신원의 열쇠는 **셋**이다 (논의130) ────────────────────────
         쿠키 · 계정 · 이름+PIN. 전에는 셋째 하나뿐이라, **로그인한 사람에게도 PIN 을 물었다** —
         카카오로 들어와 놓고 또 네 자리를 만들어 외워야 했다. 계정이 훨씬 센 열쇠인데도.

         로그인한 사람은 PIN 을 안 낸다. 대신 **PIN 을 낼 수도 있다** —
         로그인하기 전에 이름+PIN 으로 만들어 둔 자리를 되찾아 계정에 잇는 길이다(아래 `흡수`). */
      const pin = (body.pin ?? '').trim();
      const pin모양 = /^\d{4}$/.test(pin);
      if (!나 && !pin모양) return bad('pin_required');
      /* 로그인했어도 **적었으면 모양은 맞아야 한다** — 세 자리를 적고 넘어가면
         되찾기가 조용히 안 일어나고, 사람은 왜 옛 자리가 안 돌아오는지 모른다. */
      if (나 && pin && !pin모양) return bad('pin_required');

      /* **틀릴수록 느려진다** (논의51). 아직 아무것도 안 했는데 미리 막는다 —
         PIN 검사보다 앞이라야 뜻이 있다. 잠그지 않고 늦춘다: 잠그면 남이 일부러 틀려서
         주인을 가두는 장난이 통한다. `Retry-After` 로 언제 다시 되는지도 말해 준다. */
      const 기다림 = 기다릴시간(code, name);
      if (기다림 > 0) {
        return NextResponse.json(
          { error: 'pin_too_many', retryAfterMs: 기다림 },
          { status: 429, headers: { 'retry-after': String(Math.ceil(기다림 / 1000)) } });
      }

      /* 출발지도 필수 (그릴링 논의35 ①) — 모이머는 '어디서 오는가'로 가운데를 잡는다.
         재참여도 같다: 폼이 늘 새 출발지를 받으므로 신원을 돌려주기 전에 여기서 본다. */
      const origin = String(body.origin ?? '').trim();
      if (!origin) return bad('origin_required');
      if (!좌표유효(body.lat, body.lng)) return bad('bad_coords');
      /* 이동수단 잣대는 `lib/이동수단.ts` 한 곳이다 — 만들기 쪽과 여기가 각자 목록을 적어 두면
         값이 바뀌는 날 한쪽만 고쳐 놓고 "만들 때는 되는데 참여할 때는 안 되는" 값이 생긴다.
         옛 값 'walk' 는 거절하지 않고 'transit' 으로 옮겨 받는다(걷기를 대중교통에 합쳤다). */
      const transport = 이동수단(body.transport);
      if (transport === '잘못됨') return bad('bad_transport');

      /* ── ① 계정으로 내 자리를 먼저 찾는다 (논의130) ─────────────────
         이름도 PIN 도 안 본다. 쿠키를 잃어도, **이름을 바꿔 적어도** 같은 자리로 돌아온다 —
         계정이 곧 그 사람이기 때문이다. 그래서 이 길이 맨 앞이다.

         ⚠ 강퇴 우회를 여기서 더 단단히 막는다: 쿠키는 지우면 그만이지만 계정은 그렇지 않다.
            강퇴된 계정이 이름을 바꿔 와도 아래 kicked 갈래로 떨어져 **승인 대기**가 된다. */
      const 계정자리 = 나 ? await db.findByUser(code, 나.id) : null;
      if (계정자리) {
        if (계정자리.state === 'pending') return bad('awaiting_approval', 409);
        if (계정자리.state === 'kicked') {
          await db.setState(계정자리.id, 'pending');
          await db.setOrigin(계정자리.id, { origin, lat: body.lat!, lng: body.lng!, transport });
          setParticipantCookie(code, 계정자리.id);
          bump(code);
          return NextResponse.json({ ok: true, pending: true, participantId: 계정자리.id });
        }
        /* active — 쿠키만 잃은 사람이다. 그 자리를 그대로 돌려준다 */
        await db.setOrigin(계정자리.id, { origin, lat: body.lat!, lng: body.lng!, transport });
        setParticipantCookie(code, 계정자리.id);
        bump(code);
        return NextResponse.json({ ok: true, resumed: true, participantId: 계정자리.id });
      }

      /* ── ② 이름으로 찾는다 ──────────────────────────────────────
         이 이름이 이미 있으면 셋으로 갈린다 (논의121) — 셋 다 PIN 이 맞아야 신원을 돌려준다.
           kicked  : 복구하되 방장 승인을 다시 받는다 (그릴링 Q8=C)
           pending : 이미 신청해 두었다
           active  : **그 자리를 그대로 돌려준다** — 쿠키를 잃은 사람이다
         쿠키는 생각보다 자주 사라진다(카톡에서 열었다가 크롬으로 여는 것이 가장 흔하다).
         전에는 그런 사람이 이름·PIN 을 맞게 넣어도 name_taken 으로 막혀,
         자기 출발지는 가운데 계산에 들어가 있는데 정작 본인만 아무것도 못 만졌다. */
      const prior = await db.findByName(code, name);

      /* **남의 계정에 이어진 자리는 PIN 으로도 못 뺏는다** (논의130).
         계정이 PIN 보다 센 열쇠다 — 여기가 뚫리면 계정으로 신원을 잡는 뜻이 없어진다.
         (내 계정 자리였다면 위 ①에서 이미 돌아갔다.) */
      if (prior?.user_id) return bad('name_taken');

      /* 로그인했는데 그 이름이 **PIN 으로 만든 자리**다 — 로그인하기 전의 내 자리일 수 있다.
         PIN 을 안 냈으면 여기서 멈추고 화면에 PIN 칸을 열라고 말한다.
         맞으면 아래 갈래에서 자리를 돌려주고 **계정에 흡수**한다(그다음부터 PIN 이 필요 없다). */
      if (나 && prior && !pin) return bad('pin_required');

      if (prior?.state === 'active') {
        if (!(await db.pinOk(prior.id, hashPin(code, pin)))) { 틀렸다(code, name); return bad('pin_wrong', 403); }
        맞혔다(code, name);
        /* 흡수 — 다음부터는 계정만으로 돌아온다. 이미 남의 계정 것이면 안 뺏는다(db.linkUser) */
        if (나) await db.linkUser(prior.id, 나.id);
        /* 새로 낸 출발지로 갱신한다 (논의17 과 같은 결) — 폼이 늘 새로 받으므로
           옛 값을 두면 이사 간 사람이 옛 집에서 오는 것으로 잡힌다 */
        await db.setOrigin(prior.id, { origin, lat: body.lat!, lng: body.lng!, transport });
        setParticipantCookie(code, prior.id);
        /* 사람이 는 것도 준 것도 아니다 — 남들 화면을 다시 읽게 하지 않는다.
           바뀐 것은 출발지 하나뿐이라 가운데가 움직인다: 그것은 알린다. */
        bump(code);
        return NextResponse.json({ ok: true, resumed: true, participantId: prior.id });
      }
      if (prior?.state === 'kicked') {
        if (!(await db.pinOk(prior.id, hashPin(code, pin)))) { 틀렸다(code, name); return bad('pin_wrong', 403); }
        맞혔다(code, name);
        if (나) await db.linkUser(prior.id, 나.id);       /* 흡수 — 위 active 갈래와 같은 까닭 */
        await db.setState(prior.id, 'pending');
        /* 폼이 늘 새 출발지를 받는데 옛 값을 그대로 뒀었다 — 이사 간 사람이 옛 집에서
           오는 것으로 잡혀 가운데가 어긋났다. 검사는 위에서 이미 끝났다. */
        await db.setOrigin(prior.id, { origin, lat: body.lat!, lng: body.lng!, transport });
        setParticipantCookie(code, prior.id);
        bump(code);
        return NextResponse.json({ ok: true, pending: true, participantId: prior.id });
      }
      if (prior?.state === 'pending') return bad('awaiting_approval', 409);
      /* 셋 말고 다른 상태가 생기면 여기로 떨어진다 — 모르는 상태를 조용히 통과시키지 않는다 */
      if (prior) return bad('name_taken');

      /* 같은 이름 둘이 동시에 들어오면 위의 검사를 나란히 지나쳐 유니크 위반이 나고,
         드라이버 예외가 그대로 튀어 빈 500 이 됐다 — 화면은 문구조차 못 띄웠다. */
      let pid: string;
      try {
        /* 로그인했으면 **계정에 이어 둔다** (논의130) — 그래야 폰을 바꿔도 이 자리로 돌아오고,
           `/api/mine` 이 쿠키 없이도 이 모임을 찾아 준다(논의124).
           ⚠ 이 말은 곧 **'이 계정이 어느 모임에 갔었나' 가 서버에 남는다**는 뜻이다.
              참여를 익명으로 두고 싶으면 로그아웃하고 들어오면 된다 — 그때는 이름+PIN 이 신원이다.
           PIN 은 안 냈으면 안 만든다. DB 의 `pin_required_for_guest` 가
           '계정이 있거나 PIN 이 있거나' 를 지키므로 로그인한 사람은 PIN 이 없어도 된다. */
        pid = await db.join(code, {
          name, pinHash: pin ? hashPin(code, pin) : null, userId: 나?.id ?? null,
          origin, lat: body.lat, lng: body.lng, transport,
        });
      } catch (e) {
        if (e instanceof db.DbError) return bad(e.code, e.status);
        throw e;
      }
      setParticipantCookie(code, pid);
      bump(code);
      return NextResponse.json({ ok: true, participantId: pid });
    }

    /* 핑 = 투표 (지역). 찍는 것이 곧 표다. */
    case 'ping': {
      /* 종류를 안 보면 kind 없는 본문이 DB 의 check 까지 내려가 빈 500 이 됐다 */
      if (body.kind !== 'region' && body.kind !== 'place') return bad('bad_kind');
      /* refId 가 없으면 unique(code,kind,ref_id) 가 NULL 을 서로 다르게 봐서
         누를 때마다 후보가 새로 생겼다(재현됨). 검사만 하고 원본을 저장해
         'rX' 와 ' rX' 가 딴 후보가 됐다 — 다듬은 값을 그대로 넘긴다. */
      const refId = String(body.refId ?? '').trim();
      if (!refId) return bad('ref_required');
      if (!좌표유효(body.lat, body.lng)) return bad('bad_coords');
      const 후보이름 = typeof body.name === 'string' ? body.name.trim() : '';
      if (!후보이름) return bad('name_required');
      /* 지점도 지역과 같다 — 모으는 중에도, 선정 중에도 찍는 것이 곧 표 (논의26 ①) */
      if (body.kind !== m.stage) return bad('wrong_stage');
      const id = await db.ping(code, me!.id, {
        kind: body.kind, refId, name: 후보이름,
        lat: body.lat, lng: body.lng, address: body.address,
      });
      bump(code);
      return NextResponse.json({ ok: true, candidateId: id });
    }

    case 'unping': {
      /* 끝난 단계의 표는 못 뺀다 — 확정된 후보를 지워 우승자가 허공을 가리켰다(재현됨) */
      if (m.stage !== 'region' && m.stage !== 'place') return bad('wrong_stage');
      const c = view!.candidates.find((x) => x.id === body.candidateId);
      if (!c) return bad('not_found', 404);
      const nowKind: Kind = m.stage === 'region' ? 'region' : 'place';
      if (c.kind !== nowKind) return bad('wrong_stage');
      /* 뺄 표도, 지울 후보도 없으면 아무 일도 안 났다 — 헛 SSE 를 쏘면 모두의 화면이
         까닭 없이 다시 받아 간다. (내가 올렸고 표가 0인 후보는 실제로 지워진다) */
      const 내표 = c.voters.includes(me!.id);
      /* AI 가 올린 곳은 0표여도 안 사라진다(논의47) — 지울 수 없는 것에 헛 알림을 쏘지 않는다 */
      const 지워질내후보 = c.created_by === me!.id && c.votes === 0 && !c.by_ai;
      if (!내표 && !지워질내후보) return NextResponse.json({ ok: true, changed: false });
      await db.unping(body.candidateId, me!.id);
      bump(code);
      return NextResponse.json({ ok: true });
    }

    /* 옛 `vote` 는 없앴다 (논의98) — 지점도 핑=투표로 합쳐(논의26 ①) 화면이 한 번도 안 부르는데
       API 로는 누구나 부를 수 있었다. 안 쓰는 길일수록 검사가 안 닿아 결함이 숨는다.
       지금은 아래 default 로 떨어져 400 unknown_action 이 된다. */

    case 'confirm': {
      /* 무엇을 고르는 중인가 — 잣대는 `lib/단계.ts` 하나다 (getView·myMeetings·ai 가 같은 것을 쓴다).
         여기서 따로 셈하면 화면이 세는 수와 서버가 받아 주는 것이 갈라진다. */
      const kind: Kind = 지금종류(m);
      if (m.stage !== 'region' && m.stage !== 'place') return bad('wrong_stage');
      /* 이 모임의, 지금 종류의, 실제로 있는 후보만 확정할 수 있다.
         전에는 아무 문자열이나 우승자로 기록됐다(재현됨). */
      const pick = view!.candidates.find((x) => x.id === body.candidateId && x.kind === kind);
      if (!pick) return bad('not_found', 404);
      /* 표를 가장 많이 받은 곳만 확정한다 (논의46) — 전에는 순위를 아예 안 봐서
         꼴찌도 그대로 우승자가 됐다(실측 200). 동점이면 동점인 곳 전부가 1위다. */
      const 최다 = Math.max(...view!.candidates.filter((x) => x.kind === kind).map((x) => x.votes));
      /* 아무도 안 찍었으면 1위가 없다 — 그때는 정할 수 없는 것이 맞다 (논의46) */
      if (최다 <= 0) return bad('no_votes');
      if (pick.votes < 최다) return bad('not_top');
      await db.confirm(code, kind, body.candidateId);
      bump(code);
      return NextResponse.json({ ok: true });
    }

    case 'reopen':
      /* 첫 칸에서는 더 내려갈 데가 없다 — 조용히 확정만 지우지 않는다 (논의39 ④) */
      if (!(await db.reopen(code))) return bad('nothing_to_undo', 409);
      bump(code);
      return NextResponse.json({ ok: true });

    case 'close': {
      /* 방장 검사는 위 HOST_ONLY 가 이미 했다.
         '정하지 않고 끝내기'(논의106) 는 force 를 실어야 지나간다 — 약속은 깨지기도 하니
         닫을 길이 있어야 하되, 실수로 누른 마무리가 빈 모임을 닫아 버리면 안 된다.
         화면이 한 번 더 묻고 나서 이 길로 온다. */
      if ('force' in body && body.force === true) {
        if (!(await db.closeWithoutPick(code))) return bad('not_found', 404);
        bump(code);
        return NextResponse.json({ ok: true, decided: false });
      }
      /* 아무 것도 안 정한 채로는 끝내지 못한다 (그릴링 논의36).
         판단은 db.close 가 같은 문장에서 한다 — 여기서 미리 읽어 판단하면
         그 사이 되돌리기가 끼어들어 빈 모임이 마무리됐다. */
      if (!(await db.close(code))) return bad('nothing_decided', 409);
      bump(code);
      return NextResponse.json({ ok: true });
    }

    /* 사람을 다루는 액션은 '이 모임 사람인가'를 먼저 본다.
       전에는 id 만 보고 바꿔서 남의 모임 사람을 강퇴할 수 있었다(재현됨). */
    case 'kick': {
      const who = view!.participants.find((p) => p.id === body.participantId);
      if (!who) return bad('not_found', 404);
      if (who.id === m.host_id) return bad('cannot_kick_host');
      /* 내보내면 표도 같이 뺀다 (논의45) — 나가기와 규칙이 하나여야 1위가 정직하다 */
      await db.kick(code, who.id);
      bump(code);
      return NextResponse.json({ ok: true });
    }

    case 'approve': {
      const who = view!.participants.find((p) => p.id === body.participantId);
      if (!who) return bad('not_found', 404);
      /* 승인은 '대기 중인 사람'에게만 — 이걸 안 보면 approve(false) 가
         cannot_kick_host 를 우회하는 강퇴 뒷문이 된다(재현됨). */
      if (who.state !== 'pending') return bad('not_pending', 409);
      await db.setState(who.id, body.ok ? 'active' : 'kicked');
      bump(code);
      return NextResponse.json({ ok: true });
    }

    case 'update': {
      /* 모임 범위는 만들 때 정하고 끝이다 (논의79) — 전에는 scope 를 실어 보내면
         조용히 무시하고 200 을 냈다. 화면은 바뀐 줄 알았고 값은 그대로였다.
         같은 값이어도 거절한다: '되기는 되네' 로 읽히면 잠금이 아니다.
         한 칸이라도 잠겨 있으면 나머지도 저장하지 않는다 — 반만 먹힌 저장이 더 헷갈린다. */
      if ('scope' in body) return bad('scope_locked');
      /* 검사가 하나도 없어서 빈 이름이 그대로 저장되고, 형식이 안 맞는 시간은
         null 로 바뀌어 정해 둔 약속 시간이 말없이 사라졌다.
         엉터리는 400 으로 돌려보내고 저장된 값은 건드리지 않는다. */
      const 고칠것: { name?: string; meetAt?: string | null } = {};
      if (body.name !== undefined) {
        if (typeof body.name !== 'string') return bad('name_required');
        const nm = body.name.trim();
        if (!nm) return bad('name_required');
        if ([...nm].length > 모임이름한도) return bad('name_too_long');
        고칠것.name = nm;
      }
      if (body.meetAt !== undefined) {
        if (body.meetAt !== null && typeof body.meetAt !== 'string') return bad('bad_time');
        /* 빈 문자열은 '시간을 비운다' — 화면이 보내는 모양이다 */
        const at = (body.meetAt ?? '').trim();
        if (at && !약속시간유효(at)) return bad('bad_time');
        고칠것.meetAt = at || null;
      }
      /* 고칠 것이 없으면 알리지도 않는다 */
      if (!('name' in 고칠것) && !('meetAt' in 고칠것))
        return NextResponse.json({ ok: true, changed: false });
      await db.updateMeeting(code, 고칠것);
      bump(code);
      return NextResponse.json({ ok: true });
    }

    case 'leave': {
      /* 마지막 한 명이 나가면 모임도 사라진다 (논의69). '내가 마지막인가'는 여기서 세지 않는다 —
         미리 조회해 판단하면 그 사이 남이 들어오거나 함께 나가 판단이 낡는다(동시에 세 번 누르면
         셋 다 '모임이 사라졌어요' 를 받았다). 판단·표 정리·지우기를 db 가 한 문장에서 한다.
         '남은 사람'이 누구까지인가(활동 중인 사람만 — 강퇴·승인 대기만 남으면 승인해 줄 사람이
         없으니 그 모임도 끝난 것이다)도 그 문장 안에 있다.
         **방장은 아예 못 나간다** (논의125) — 넘길 곳이 없어졌으니 빠지려면 모임을 지운다.
         여기서 먼저 끊는 이유: db 도 같은 판단을 하지만(방어), 방장 판정은 계정까지 봐야 한다. */
      if (isHost) return bad('host_cannot_leave', 409);
      const 결과 = await db.leaveOrRemove(code, me!.id);
      if (결과 === 'host_cannot_leave') return bad('host_cannot_leave', 409);
      if (결과 === 'not_found') return bad('not_found', 404);
      /* 지운 뒤에 알린다 — 남들 화면이 다시 받으러 갔다가 404 를 보고 닫는다 (논의112) */
      bump(code);
      return NextResponse.json({ ok: true, left: true, ...(결과 === 'removed' && { removed: true }) });
    }

    /* 옛 `handover`(방장 넘기기)는 없앴다 (논의125) — 넘겨받는 사람이 로그인 안 했으면
       그 모임이 다시 '쿠키만 가진 방장'이 되어 방장 벽돌(논의122)이 그대로 돌아온다.
       기능을 없애서 그 구멍을 막는다. 지금은 아래 default 로 떨어져 400 unknown_action 이다.
       함께 사라진 오류 코드: already_host · host_must_handover. */

    case 'remove':                                 /* 되돌릴 수 없다 — 화면이 한 번 더 묻는다 */
      await db.remove(code);
      /* 지운 뒤에 알린다 — 그래야 남들 화면이 다시 받으러 갔다가 404 를 보고 닫는다 */
      bump(code);
      return NextResponse.json({ ok: true, removed: true });

    case 'ai': {
      /* 무엇을 고르는 중인가 — 잣대는 `lib/단계.ts` 하나다.
         전에 여기만 따로 셈했다: 끝난 모임을 안 보고 단계만 봐서, 지점까지 정하고 끝난 모임에
         AI 를 부르면 지역을 물을 뻔했다. */
      const kind: Kind = 지금종류(m);
      /* 이 단계에서 몇 번 남았나 (논의93). 화면이 "남은 횟수"를 미리 말할 수 있게
         되는 길·안 되는 길 모두 응답에 실어 준다 — 다 쓰고 나서 막히면 당황스럽다.
         세는 것과 막는 것은 db 가 한 문장에서 한다: 메모리에 세던 때는 서버를 다시 구울 때마다
         한도가 통째로 풀렸다. 부르기 전에 센다 — 답이 이상해도 토큰은 이미 나갔을 수 있다.
         못 붙어서 한 푼도 안 든 경우는 아래에서 돌려준다. */
      const 남은 = await db.useAi(code, kind);
      if (남은 === null) return NextResponse.json({ error: 'ai_limit', aiLeft: 0 }, { status: 429 });

      const 결과 = await suggest(m, view!);
      /* 못 붙었으면 한 푼도 안 들었다 — 횟수를 돌려준다 (논의93).
         가르기 전에는 AI 가 죽어 있는 동안 세 번 눌러 아무것도 못 받고 막혔다. */
      if (!결과.닿음) {
        await db.refundAi(code, kind);
        return NextResponse.json({ error: 'ai_unavailable', aiLeft: 남은 + 1 }, { status: 503 });
      }
      const picked = 결과.picks;
      /* AI 가 준 좌표도 사람이 찍은 것과 같은 검사를 거친다 — 전에는 db.ping 을 바로 불러
         ping 의 가드를 통째로 비껴갔다. 이상한 것만 버리고 쓸 것이 없으면 못 불렀다고 한다. */
      const 쓸것 = picked
        .map((p) => ({ ...p, refId: String(p.refId ?? '').trim(), name: String(p.name ?? '').trim() }))
        .filter((p) => p.refId && p.name && 좌표유효(p.lat, p.lng));
      /* 실패했으면 아무것도 안 건드린다 (논의90) — 앞엣것을 먼저 치웠더니 AI 가 안 닿는 동안
         이 단추가 '앞 추천 지우기'로만 동작했다. */
      if (!쓸것.length) return NextResponse.json({ error: 'ai_unavailable', aiLeft: 남은 }, { status: 503 });
      /* 새것을 받아 온 지금에야 앞엣것을 치운다 (논의53·90) — 아무도 안 찍은 AI 후보만.
         누가 찍었으면 그건 사람이 고른 진짜 후보라 남는다. */
      await db.clearAiPicks(code, kind);
      /* AI 가 올린 곳에는 방장의 표가 안 붙는다 (논의47) — 부른 것과 고른 것은 다르다 */
      for (const p of 쓸것) await db.ping(code, me!.id, { ...p, kind, byAi: true });
      bump(code);
      return NextResponse.json({ ok: true, added: 쓸것.length, aiLeft: 남은 });
    }

    /* AI 가 올린 곳을 한 번에 치운다 (논의94) — 방장 도구.
       AI 것은 0표여도 안 사라지게 해 두었으므로(논의53) 이 길이 없으면 앱 안에 치울 방법이
       하나도 없었다. 누가 고른 AI 후보는 사람이 고른 진짜 후보라 남는다 —
       db.clearAiPicks 가 0표인 것만, 그것도 확정된 곳은 빼고 지운다. */
    case 'clearAi': {
      /* 끝난 단계에서는 치울 것도 없다 — unping·confirm 과 같은 가드다 */
      if (m.stage !== 'region' && m.stage !== 'place') return bad('wrong_stage');
      const 치운수 = await db.clearAiPicks(code, m.stage);
      /* 치운 것이 없으면 안 알린다 — 헛 SSE 는 모두의 화면을 까닭 없이 다시 읽게 한다 */
      if (치운수) bump(code);
      return NextResponse.json({ ok: true, cleared: 치운수 });
    }

    /* 신호등 — 제때 가는지 셋 중 하나로 알린다 (논의115·116).
       participantId 를 안 받는다: 받는 순간 남의 불을 끄는 길이 된다. 늘 내 것이다.
       표도 가운데 계산도 안 건드린다 — 논의116 이 정한 것은 알리는 것 하나뿐이다.
       방장 도구가 아니라 멤버 누구나 쓴다. 위 '멤버여야 한다' 가드가 이미 걸러 준다. */
    case 'going': {
      /* 시간이 없으면 '제때'라는 말이 성립하지 않는다 (논의116) — 화면도 그때만 켠다.
         화면만 믿으면 API 로 아무 때나 들어온다. */
      if (!m.meet_at) return bad('no_meet_time');
      const s = body.status ?? null;
      if (s !== null && s !== 'go' && s !== 'late' && s !== 'no') return bad('bad_going');
      await db.setGoing(me!.id, s);
      /* 남들 화면이 곧바로 받아야 '모두에게 알린다' 가 된다 (논의116) */
      bump(code);
      return NextResponse.json({ ok: true, going: s });
    }

    default:
      return bad('unknown_action');
  }
}
