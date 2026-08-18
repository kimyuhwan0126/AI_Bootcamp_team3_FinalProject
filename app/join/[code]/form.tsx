'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OriginField, { type Origin, type Transport } from '@/app/originfield';
import { 기본값읽기 } from '@/lib/기본값';

const MSG: Record<string, string> = {
  pin_required: 'PIN 4자리를 적어주세요',
  name_taken: '같은 이름이 있어요 — 별칭을 붙여주세요',
  name_required: '이름을 적어주세요',
  origin_required: '출발지를 골라 주세요',
  closed: '이미 끝난 모임이에요',
  pin_wrong: 'PIN 이 달라요 — 그 이름은 다른 분이 쓰고 있어요',
  /* 논의51 — 틀릴수록 느려진다. 잠긴 것이 아니라 잠깐 쉬는 것이라고 말해 준다:
     '막혔다' 로 읽히면 주인은 그만두고, 정말 막을 상대는 어차피 기계다. */
  pin_too_many: 'PIN 을 여러 번 틀렸어요 — 잠시 뒤에 다시 해 주세요',
  awaiting_approval: '이미 신청했어요 — 방장의 승인을 기다리는 중이에요',
  already_joined: '이미 이 모임에 들어와 있어요',
  kicked_out: '이 모임에서 내보내졌어요',
  bad_coords: '출발지를 다시 골라 주세요',
  not_found: '없는 모임이에요 — 초대 코드를 다시 확인해 주세요',
};
/* 표에 없는 코드는 영문 대신 이 문구가 나간다 — 화면에 `pin_wrong` 이 그대로 뜨면
   사용자는 무엇을 해야 할지 알 수 없다 (그릴링 논의24). */
const FAILED = '참여하지 못했어요 — 잠시 뒤 다시 해 주세요';


/* 출발지는 반드시 받는다 (그릴링 논의35 ①).
   모이머는 '여러 사람이 어디서 오는가'로 가운데를 찾는 앱이다 —
   그게 없으면 그냥 지도에 표를 찍는 앱이 된다.

   ⚠ 2026-08-22(논의139, 실사용 신고) — 칸 차례를 이름→출발지→PIN 에서
   이름→PIN→출발지 로 바꿨다. PIN 을 먼저 받으면 그 사람이 **옛 참여자인지**를
   출발지를 묻기 **전에** 알 수 있다 — 옛 참여자면 지난 출발지를 미리 불러와
   채워 준다(아래 `찾아보기`). 그대로 두면 예전 자리로 곧장 돌아가고, 이사했으면
   다시 검색해서 바꾸면 된다. 예전엔 이름+PIN 을 맞게 적어도 출발지를 매번 새로
   찾아야만 참여 단추가 열려서 "왜 막혔지"로 보였다 — 원인은 그대로 두되(옛
   출발지를 그냥 자동으로 믿으면 "이사 간 사람이 옛 집에서 오는 것으로 잡힌다",
   논의35·121) 안내와 자동 채움으로 그 벽을 없앤다. */
export default function JoinForm({ code, name }: { code: string; name: string }) {
  const r = useRouter();
  const [nm, setNm] = useState('');
  const [pin, setPin] = useState('');
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [transport, setTransport] = useState<Transport>('transit');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* undefined = 아직 안 물어봤다 · false = 로그인 안 했다 (내정보·만들기 화면과 같은 셋 가르기).
     셋을 갈라야 읽기도 전에 PIN 칸이 깜빡였다 사라지지 않는다. */
  const [로그인했나, set로그인했나] = useState<boolean | undefined>(undefined);
  /* 로그인했는데도 PIN 을 물어야 하는 자리가 하나 있다 — 그 이름이 **로그인하기 전에
     이름+PIN 으로 만들어 둔 자리**일 때다. 서버가 `pin_required` 로 알려 주면 칸을 연다. */
  const [PIN열기, setPIN열기] = useState(false);
  const PIN보임 = 로그인했나 === false || PIN열기;

  /* 내정보(/me)에 넣어 둔 기본 PIN 을 먼저 채운다 (lib/기본값.ts).
     출발지·이동 수단은 OriginField 가 스스로 얹으니 여기서는 PIN 만 맡는다.
     그린 뒤에 넣는다 — 서버는 이 기기 값을 모른다. */
  useEffect(() => {
    const 기본 = 기본값읽기();
    if (기본.pin) setPin(기본.pin);
    /* 로그인했으면 PIN 을 안 묻는다 (논의130) — 계정이 훨씬 센 열쇠인데
       카카오로 들어와 놓고 또 네 자리를 만들어 외우게 할 까닭이 없다.
       못 물어봤으면 **로그인 안 한 것으로 친다** — PIN 칸을 괜히 감췄다가
       참여 자체가 막히는 것보다, 한 칸 더 보이는 편이 낫다. */
    fetch('/api/auth/session').then((r) => r.json())
      .then((s) => set로그인했나(!!s?.user))
      .catch(() => set로그인했나(false));
  }, []);

  /* 이름+PIN 이 다 채워지면 옛 자리를 미리 찾아본다('find', 읽기 전용).
     처음 쓰는 이름·PIN 이면 서버가 조용히 found:false 를 준다 — 그건 오류가 아니라
     "당신은 새 참여자예요" 라는 뜻이라 아무 말도 안 한다. PIN 이 남의 것과
     부딪히면(name_taken 이 될 자리) 여기서 먼저 알려 줘 출발지를 채우기 전에
     고치게 한다 — submit 때 가서야 아는 것보다 낫다. */
  const [찾기상태, set찾기상태] = useState<'idle' | '찾는중' | '찾음' | 'pin_wrong' | 'pin_too_many'>('idle');
  useEffect(() => {
    if (!PIN보임 || !nm.trim() || pin.length !== 4) { set찾기상태('idle'); return; }
    let 살아있나 = true;
    set찾기상태('찾는중');
    const t = setTimeout(() => {
      fetch(`/api/m/${code}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'find', name: nm.trim(), pin }),
      }).then(async (res) => {
        if (!살아있나) return;
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          set찾기상태(j.error === 'pin_too_many' ? 'pin_too_many' : j.error === 'pin_wrong' ? 'pin_wrong' : 'idle');
          return;
        }
        if (!j.found) { set찾기상태('idle'); return; }
        /* 지난 출발지를 그대로 채운다 — address 는 서버가 안 갖고 있어(이름·좌표만
           저장한다) 빈 채로 둔다, OriginField 는 있을 때만 보여 준다. */
        if (j.origin) setOrigin({ name: j.origin.name, address: '', lat: j.origin.lat, lng: j.origin.lng });
        if (j.transport) setTransport(j.transport);
        set찾기상태('찾음');
      }).catch(() => { if (살아있나) set찾기상태('idle'); });
    }, 350);
    return () => { 살아있나 = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, nm, pin, PIN보임]);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/m/${code}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          /* 로그인했고 PIN 칸이 안 보이면 아예 안 보낸다 — 내정보 기본 PIN 이 남아 있어도
             그것으로 남의 자리를 되찾으려 드는 셈이 되면 안 된다 */
          action: 'join', name: nm, pin: PIN보임 ? pin : undefined, transport,
          origin: origin?.name, lat: origin?.lat, lng: origin?.lng,
        }),
      });
      /* 500 은 본문이 비어 온다 — json() 이 여기서 터지면 화면이 아무 말도 못 했다 */
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      /* 그 이름이 PIN 으로 만든 옛 자리다 — 칸을 열어 주고 무엇을 하면 되는지 말한다.
         이 한 갈래가 없으면 사람은 'PIN 4자리를 적어주세요' 만 보고 적을 칸을 못 찾는다. */
      if (!res.ok && j.error === 'pin_required' && !PIN보임) {
        setPIN열기(true);
        setErr('그 이름은 전에 PIN 으로 만든 자리예요 — 그때 쓰던 4자리를 적어 주세요');
        return;
      }
      if (!res.ok) { setErr(MSG[j.error ?? ''] ?? FAILED); return; }
      r.push(`/m/${code}`);
      r.refresh();
    } catch {
      setErr('연결이 끊겼어요 — 잠시 뒤 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="hd"><h1>모임 참여</h1></div>
      <div className="sheet" style={{ maxHeight: 'none', flex: 1 }}>
        <p className="mut" style={{ marginTop: 0 }}>{name} · 초대 링크로 들어왔어요</p>

        <div className="fld">
          <label htmlFor="nm">이름</label>
          <input id="nm" value={nm} onChange={(e) => setNm(e.target.value)} maxLength={12}
                 placeholder="다른 사람이 알아볼 이름" />
        </div>

        {/* 로그인한 사람에게는 안 그린다 (논의130) — 계정이 신원이다.
            ⚠ 출발지보다 먼저 온다(2026-08-22, 논의139) — 옛 참여자인지를 먼저 알아야
            출발지를 미리 채워 줄 수 있다. */}
        {PIN보임 && (
        <div className="fld">
          <label htmlFor="pin">개인 PIN <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                 inputMode="numeric" placeholder="숫자 4자리" />
          {/* 논의121 로 규칙이 바뀌었다 — 이제 멀쩡한 참여자도 이름+PIN 으로 돌아온다.
              전에는 내보내진 사람만 그랬고, 그때 이 안내가 그 사실을 적고 있었다.
              쿠키는 생각보다 자주 사라진다: 카톡에서 들어갔다 크롬으로 열기 · 시크릿창 · 폰 바꾸기. */}
          <p className="mut" style={{ margin: '6px 0 0' }}>
            이 4자리가 <b>당신을 알아보는 표시</b>입니다.
            폰을 바꾸거나 다른 브라우저로 열어도 <b>이름과 이 숫자</b>면 내 자리로 돌아와요.
          </p>
          {/* 찾아보기 결과 — 논의139. '찾는중'은 깜빡임을 줄이려 아주 짧으면 안 보여도 그만이라
              일부러 문구를 안 두지 않는다(느린 회선에서는 그 잠깐도 사람이 본다). */}
          {찾기상태 === '찾는중' && <p className="mut" style={{ margin: '6px 0 0' }}>확인하는 중…</p>}
          {찾기상태 === '찾음' && (
            <p className="mut" style={{ margin: '6px 0 0', color: 'var(--brand)' }}>
              ✓ 전에 참여한 자리를 찾았어요 — 아래 출발지를 지난번 그대로 채워 뒀어요.
              그대로 두거나, 바뀌었으면 다시 검색해서 바꿔 주세요.
            </p>
          )}
          {찾기상태 === 'pin_wrong' && (
            <p className="err" style={{ margin: '6px 0 0' }}>{MSG.pin_wrong}</p>
          )}
          {찾기상태 === 'pin_too_many' && (
            <p className="err" style={{ margin: '6px 0 0' }}>{MSG.pin_too_many}</p>
          )}
        </div>
        )}

        {/* 로그인한 사람에게는 PIN 대신 이 한 줄을 준다 — 왜 안 묻는지 말해 주지 않으면
            '뭔가 빠졌나' 싶어진다 */}
        {로그인했나 === true && !PIN열기 && (
          <p className="mut" style={{ margin: '0 0 4px' }}>
            로그인해 두셔서 <b>PIN 은 필요 없어요</b> — 폰을 바꿔도 다시 로그인하면 내 자리로 돌아와요.
          </p>
        )}

        <OriginField origin={origin} setOrigin={setOrigin}
          transport={transport} setTransport={setTransport} />

        {err && <p className="err">{err}</p>}
        <button className="cta" onClick={submit}
          disabled={busy || !nm.trim() || (PIN보임 && pin.length !== 4) || !origin
            /* 찾아보기가 이미 이 PIN 이 틀렸다고/너무 잦다고 말했으면 눌러 봐야 서버가
               같은 말을 반복할 뿐이다 — 미리 막는다(출발지가 우연히 채워져 있던 경우 대비). */
            || 찾기상태 === 'pin_wrong' || 찾기상태 === 'pin_too_many'}>참여하기</button>
      </div>
    </div>
  );
}
