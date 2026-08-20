'use client';
/* 내정보 — 모임을 만들 때·참여할 때 **먼저 채워질 값**을 여기 한 번 넣어 둔다.
   넣는 것은 셋뿐이다: 기본 출발지 · 기본 이동 수단 · 기본 PIN.

   ⚠ 이 값은 **이 기기에만** 남는다(lib/기본값.ts). 논의52(카카오 로그인)가 아직이라
   서버에는 '누구 것인지' 를 적을 자리가 없다. 그 사정을 화면 맨 위에 한 줄로 밝힌다 —
   폰을 바꾸면 사라지는 것을 말하지 않으면 사람은 서버에 있는 줄 안다.

   불러오는 일은 이 화면이 하지 않는다. 출발지 칸(app/originfield.tsx)이 스스로 얹고,
   PIN 은 참여 폼이 얹는다 — 저장하는 곳과 불러오는 곳이 갈라지면 예전판이 된다(기록 §6·7).

   로그인 자리는 맨 위에 따로 있다 (논의52·123). 이건 이 기기 값이 아니라 **계정**이다 —
   그래서 '이 기기에만' 이라는 말 위에 둔다. 카카오 열쇠가 서버에 없으면 단추를 그리지 않는다:
   논의105 — 안 되는 것을 되는 척하지 않는다.

   가져오지 않은 것 (예전판 기록 §11)
     ❌ `스케줄 가져오기 (준비 중)` — 꺼진 단추로 자리만 차지한다
     ❌ `앱 푸시 알림` — 없는 기능이다 */
import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import OriginField, { type Origin, type Transport } from '../originfield';
import { 기본값읽기, 기본값쓰기, 기본값지우기, 넣어둔게있나 } from '@/lib/기본값';
import s from './내정보.module.css';

type 세션 = { name?: string | null; image?: string | null; key?: string } | null;

/* 개발용 임시 로그인은 개발 중일 때만 화면에 보인다. 통로 자체가 닫히는 것은 아니다 —
   그것은 사람이 정할 일이다(lib/auth.ts 의 guest provider). */
const 개발중 = process.env.NODE_ENV !== 'production';

/* NextAuth 가 오류를 우리 화면으로 돌려보낸다(authOptions.pages.error) — 코드가 그대로
   보이면 말투 규칙 위반이라 여기서 사람 말로 바꾼다. 무엇이 됐든 사실대로 말하고 멈춘다(논의57). */
const 로그인오류 = (코드: string) =>
  코드 === 'OAuthAccountNotLinked'
    ? '이미 다른 방식으로 들어온 적이 있는 계정이에요'
    : '카카오 로그인이 잠시 안 돼요. 좀 있다 다시 해 주세요';

export default function 내정보() {
  /* 출발지·이동 수단은 OriginField 가 스스로 저장된 값을 얹는다 —
     이 화면이 또 읽으면 불러오는 길이 둘이 되고, 그중 하나만 고치는 날이 온다. */
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [transport, setTransport] = useState<Transport>('transit');
  const [pin, setPin] = useState('');
  const [넣어뒀다, set넣어뒀다] = useState(false);
  const [알림, set알림] = useState('');

  /* undefined = 아직 안 물어봤다 · null = 로그인 안 했다 — 셋을 갈라야
     읽기도 전에 '로그인해 주세요' 가 깜빡이지 않는다 */
  const [세션, set세션] = useState<세션 | undefined>(undefined);
  const [통로, set통로] = useState<{ kakao: boolean; guest: boolean } | null>(null);
  const [게스트이름, set게스트이름] = useState('');
  const [로그인말, set로그인말] = useState('');
  /* 로그인이 끝나면 돌아갈 곳. 만들기 폼이 로그인 때문에 막혀 보낸 사람은 그 폼으로 돌아가야 한다 —
     여기 남겨 두면 적어 둔 것을 되찾으러 스스로 길을 찾아가야 한다 (논의123). */
  const [돌아갈곳, set돌아갈곳] = useState('');

  /* 서버는 이 기기 값을 모른다 — 그린 뒤에 읽어야 첫 그림과 어긋나지 않는다 */
  useEffect(() => {
    const 기본 = 기본값읽기();
    setPin(기본.pin);
    set넣어뒀다(넣어둔게있나(기본));

    /* 세션과 '어떤 로그인 통로가 살아 있나' 를 함께 읽는다. 통로를 모르면 단추를 그릴 수 없다.
       통로 목록은 NextAuth 가 내준다 — 카카오 열쇠가 없으면 그 통로 자체가 목록에 없다(lib/auth.ts) */
    세션읽기();
    fetch('/api/auth/providers').then((r) => r.json())
      .then((j) => set통로({ kakao: !!j?.kakao, guest: !!j?.credentials && 개발중 }))
      .catch(() => set통로({ kakao: false, guest: false }));
    const 물음 = new URLSearchParams(window.location.search);
    const 오류 = 물음.get('error');
    if (오류) set로그인말(로그인오류(오류));
    /* 로그인하러 보낸 화면이 '끝나면 여기로' 를 실어 보낸다 (지금은 `/new` 하나뿐이다).
       ⚠ **우리 집 안 주소만** 받는다. 남이 준 주소를 그대로 믿으면 로그인 뒤에 남의 사이트로
          보내는 발판이 된다(열린 리다이렉트). `//남의집` 도 브라우저에는 바깥이라 함께 막는다. */
    const 갈곳 = 물음.get('next') ?? '';
    if (/^\/(?!\/)/.test(갈곳)) set돌아갈곳(갈곳);
  }, []);

  async function 세션읽기() {
    try {
      const r = await fetch('/api/auth/session');
      const j = await r.json();
      set세션(j?.user ?? null);
    } catch { set세션(null); }
  }

  /* 개발용 임시 로그인 — 카카오 없이 세션을 만든다. 진짜 서비스에도 열어 둘지는 사람이 정한다 */
  async function 임시로그인(e: React.FormEvent) {
    e.preventDefault();
    const 이름 = 게스트이름.trim();
    if (!이름) { set로그인말('이름을 적어 주세요'); return; }
    set로그인말('');
    const r = await signIn('credentials', { nickname: 이름, redirect: false });
    if (r?.error) { set로그인말('임시 로그인이 안 됐어요'); return; }
    set게스트이름('');
    /* 카카오와 달리 이 길은 화면을 안 떠난다 — 돌려보내는 일을 여기서 손으로 한다.
       `location` 으로 간다(router 가 아니라): 세션 쿠키가 방금 생겨서, 서버가 그리는
       그 화면이 새 쿠키를 보고 그려야 한다. */
    if (돌아갈곳) { window.location.href = 돌아갈곳; return; }
    await 세션읽기();
  }

  /* 손을 대면 '저장했어요' 를 거둔다 — 안 그러면 안 저장한 값 옆에 저장했다는 말이 남는다 */
  const 손댐 = <T,>(f: (v: T) => void) => (v: T) => { set알림(''); f(v); };

  /* 넣다 만 PIN 을 그대로 두면 참여 폼에 반쯤 적힌 채로 얹힌다 — 아예 못 저장하게 막는다.
     비워 두는 것은 괜찮다(안 쓰겠다는 뜻이다). */
  const pin덜됐다 = pin.length > 0 && pin.length < 4;

  function 저장() {
    if (pin덜됐다) return;
    const 값 = { origin, transport, pin };
    기본값쓰기(값);
    set넣어뒀다(넣어둔게있나(값));
    set알림('저장했어요');
  }

  function 지우기() {
    기본값지우기();
    setOrigin(null); setTransport('transit'); setPin('');
    set넣어뒀다(false);
    set알림('기본값을 지웠어요');
  }

  return (
    <div className="wrap">
      <div className="hd"><h1>내정보</h1></div>

      <div className={s.몸}>
        {/* 로그인 — 계정 이야기라 '이 기기' 이야기보다 위에 둔다 (논의52·123).
            아직 안 읽었을 때는 아무것도 안 그린다: 없는 상태를 잠깐 보여 주면 그것도 거짓말이다. */}
        {세션 !== undefined && (
          <section className={s.로그인}>
            {세션 ? (
              <div className={s.줄}>
                {세션.image
                  ? <img className={s.얼굴} src={세션.image} alt="" />
                  : <span className={s.얼굴} aria-hidden="true" />}
                <span className={s.누구}>
                  <b>{세션.name || '이름 없음'}</b>
                  <span className="mut">{세션.key?.startsWith('guest:') ? '임시 로그인' : '카카오 로그인'}</span>
                </span>
                <button className={s.작은단추} onClick={() => signOut({ callbackUrl: '/me' })}>로그아웃</button>
              </div>
            ) : (
              <>
                <p className={s.권함}>로그인하면 내가 만든 모임을 다른 기기에서도 열 수 있어요.</p>
                {통로?.kakao && (
                  <button className={s.카카오} onClick={() => signIn('kakao', { callbackUrl: 돌아갈곳 || '/me' })}>
                    카카오로 로그인
                  </button>
                )}
                {통로 && !통로.kakao && (
                  <p className="mut">카카오 로그인이 아직 켜지지 않았어요.</p>
                )}
                {통로?.guest && (
                  /* 개발용이다. 진짜 서비스에서는 안 보인다(NODE_ENV) — 다만 통로 자체를
                     닫을지는 사람이 정해야 한다(lib/auth.ts guest provider) */
                  <form className={s.임시} onSubmit={임시로그인}>
                    <label htmlFor="gn" className="mut">개발용 임시 로그인 — 카카오 없이 시험할 때만 써요</label>
                    <div className={s.임시줄}>
                      <input id="gn" value={게스트이름} placeholder="이름"
                        onChange={(e) => set게스트이름(e.target.value.slice(0, 12))} />
                      <button className={s.작은단추}>이름으로</button>
                    </div>
                  </form>
                )}
              </>
            )}
            {로그인말 && <p className="err" role="status">{로그인말}</p>}
          </section>
        )}

        <p className="note">
          아래 값은 <b>이 기기에만</b> 저장돼요. 폰을 바꾸거나 브라우저 기록을 지우면 다시 넣어야 해요.
        </p>

        {/* 칸 이름을 따로 얹지 않는다 — 칸마다 제목·설명·라벨을 다 두면 '기본 출발지' 가
            바로 위아래로 두 번 적힌다(처음에 그렇게 만들어 사진에서 잡혔다).
            라벨이 곧 제목이고, 그 밑 한 줄이 왜 넣는지를 말한다. 가르는 것은 줄 하나면 된다. */}
        <OriginField origin={origin} setOrigin={손댐(setOrigin)}
          transport={transport} setTransport={손댐(setTransport)} 쓰임="기본값" />

        {/* PIN 은 로그인 안 한 사람의 신원이다(이름+PIN, 논의130) — 로그인하면 계정이
            그 자리를 대신하므로 참여 폼도 PIN 칸을 숨긴다(join/[code]/form.tsx 의 PIN보임).
            여기서 기본값을 미리 채워 둘 곳이 없는데 칸만 남겨 두면 로그인한 사람에게
            쓸데없는 숫자를 채우게 시키는 셈이다 — 세션을 아직 못 읽었을 때는
            깜빡이지 않게 아예 안 그린다(위 로그인 칸과 같은 규칙). */}
        {세션 === null && (
          <div className={s.칸}>
            <div className="fld">
              <label htmlFor="pin">기본 PIN</label>
              <input id="pin" value={pin} inputMode="numeric" placeholder="숫자 4자리"
                onChange={(e) => { set알림(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); }} />
              {pin덜됐다 && <p className="err">PIN 은 숫자 네 자리로 넣어 주세요</p>}
              <p className="mut" style={{ margin: '6px 0 0' }}>
                모임에 참여할 때 이름과 함께 나를 알아보는 숫자예요. 넣어 두면 참여 폼에 먼저 채워져요.
              </p>
            </div>
          </div>
        )}

        <button className="cta" onClick={저장} disabled={pin덜됐다}>내 정보 저장</button>
        {넣어뒀다 && <button className="cta sub" onClick={지우기}>이 기기에서 지우기</button>}
        {알림 && <p className={s.알림} role="status">{알림}</p>}
      </div>
    </div>
  );
}
