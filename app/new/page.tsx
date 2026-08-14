'use client';
/* 모임 만들기 폼. `app/page.tsx` 에 있던 것을 그대로 옮겨 왔다 —
   `/` 는 홈이 되고 만들기는 자기 주소를 갖는다. 폼 자체는 한 줄도 안 고쳤다.
   여기는 탭바를 띄우지 않는다(한 가지 일에만 매달리는 자리라 새는 길을 두지 않는다) —
   대신 머리말에 돌아가는 길을 둔다. 그것마저 없으면 브라우저 뒤로가기 말고는 나갈 데가 없다. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OriginField, { type Origin, type Transport } from '../originfield';
import { 엿보기, 내려놓기, 만들던것담기, 만들던것꺼내기 } from '@/lib/넘기기';
import { 이동수단 } from '@/lib/이동수단';

/* 서버가 돌려주는 까닭을 사람 말로 옮긴다. 표에 없는 코드는 영문 대신 아래 일반 문구가 나간다 —
   화면에 영문이 새면 사용자는 무엇을 해야 할지 알 수 없다 (그릴링 논의24). */
const MSG: Record<string, string> = {
  name_required: '모임 이름과 내 이름을 적어 주세요',
  origin_required: '출발지를 골라 주세요',
  name_too_long: '모임 이름은 40자, 내 이름은 12자까지예요',
  bad_time: '약속 시간을 다시 골라 주세요',
  /* 논의123 — 방장은 로그인해야 한다. 기다린다고 되는 일이 아니니 갈 곳을 알려 준다 */
  login_required: '모임을 만들려면 로그인해 주세요',
};
const FAILED = '모임을 만들지 못했어요 — 잠시 뒤 다시 해 주세요';

export default function New() {
  const r = useRouter();
  /* 홈에서 잡아 온 출발지 (lib/넘기기.ts). 여기서는 **보기만** 한다 —
     개발 모드가 그리기를 두 번 돌려서, 꺼내면서 지우면 두 번째에 빈손이 된다.
     내려놓는 것은 아래 효과에서 한다. */
  const [넘김] = useState(엿보기);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [scope, setScope] = useState<'region' | 'place'>('place');
  /* 시간은 받되 건너뛸 수 있다 (그릴링 논의70) — "일단 모이긴 모이자" 식 모임이 더 흔하다 */
  const [meetAt, setMeetAt] = useState('');
  /* 방장도 '그 모임의 참가자'다 — 출발지를 똑같이 받는다 (그릴링 논의35 ①).
     홈에서 여러 곳을 잡아 왔어도 폼이 받는 것은 **첫 곳 하나**다 —
     나머지는 아직 안 온 사람들 것이라 방장이 대신 낼 자리가 없다. */
  const [origin, setOrigin] = useState<Origin | null>(넘김?.출발지들[0] ?? null);
  const [transport, setTransport] = useState<Transport>(넘김?.이동수단 ?? 'transit');
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState('');
  const [err, setErr] = useState('');
  /* 로그인이 없어서 막힌 것은 오류가 아니라 '아직 안 한 일' 이다 — 따로 잡아 길을 준다 */
  const [로그인필요, set로그인필요] = useState(false);
  /* undefined = 아직 안 물어봤다 · false = 로그인 안 했다 (내정보 화면과 같은 셋 가르기).
     셋을 갈라야 읽기도 전에 '로그인해 주세요' 가 깜빡이지 않는다. */
  const [로그인했나, set로그인했나] = useState<boolean | undefined>(undefined);

  /* 출발지 칸은 달릴 때 스스로 내정보 기본값을 얹는다(originfield.tsx).
     자식의 첫 효과가 부모보다 먼저 도니, 홈에서 들고 온 이동 수단을 여기서 한 번 더 얹는다 —
     출발지는 처음부터 차 있어 그 칸이 손대지 않지만, 이동 수단은 조건 없이 덮어쓴다. */
  useEffect(() => {
    내려놓기();
    if (넘김?.이동수단) setTransport(넘김.이동수단);

    /* 로그인하러 갔다 온 사람에게 적어 둔 것을 돌려준다 (아래 `로그인하러`).
       서버가 먼저 그린 뒤에 얹는다 — 서버는 이 기기 저장소를 못 읽으므로 첫 그림이 어긋난다.
       홈에서 들고 온 것보다 **이쪽이 뒤에 온다**: 방금 적다 만 것이 더 최근이다. */
    const 적던것 = 만들던것꺼내기();
    if (적던것) {
      if (typeof 적던것.name === 'string') setName(적던것.name);
      if (typeof 적던것.host === 'string') setHost(적던것.host);
      if (적던것.scope === 'region' || 적던것.scope === 'place') setScope(적던것.scope);
      if (typeof 적던것.meetAt === 'string') setMeetAt(적던것.meetAt);
      /* 담아 둔 값이 옛 'walk' 일 수 있다 — 로그인 다녀오는 사이에 걷기가 대중교통에 합쳐졌으면
         그렇다. 잣대는 `lib/이동수단.ts` 한 곳이라 여기서 목록을 또 적지 않는다. */
      const t = 이동수단(적던것.transport);
      if (t && t !== '잘못됨') setTransport(t);
      /* 출발지는 좌표가 성해야 지도가 열린다 — 반쯤 담긴 것은 없는 셈 친다 (lib/기본값.ts 와 같은 규칙) */
      const o = 적던것.origin as Origin | undefined;
      if (o && typeof o.name === 'string' && Number.isFinite(o.lat) && Number.isFinite(o.lng)) setOrigin(o);
    }

    /* 로그인했는지 **미리** 본다 (논의123). 안 보면 사람이 폼을 다 채우고 [만들기] 를 눌러야
       비로소 막힌 것을 안다 — 긴 폼에서 그건 헛수고다. 막지는 않고 위에 한 줄로 알린다. */
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((s) => set로그인했나(!!s?.user))
      /* 못 물어봤으면 '모른다'로 둔다 — 로그인한 사람에게 거짓 안내를 띄우느니 아무 말도 안 한다.
         진짜 막히면 [만들기] 를 누를 때 서버가 말해 준다. */
      .catch(() => set로그인했나(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 로그인하러 떠난다 — 적어 둔 것을 담아 두고 간다. 담지 않으면 돌아왔을 때 빈 폼이고,
     그건 화면이 "적어 두신 것은 그대로 있어요" 라고 해 놓고 어기는 것이다. */
  function 로그인하러() {
    만들던것담기({ name, host, scope, meetAt, transport, origin });
  }

  async function make() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/m', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, hostName: host, scope, transport,
          /* 비운 칸은 아예 안 보낸다 — 빈 문자열도 서버가 '없음'으로 읽지만 뜻이 또렷하다 */
          meetAt: meetAt.trim() || undefined,
          origin: origin?.name, lat: origin?.lat, lng: origin?.lng }),
      });
      /* 500 은 본문이 비어 온다 — 여기서 json() 이 터지면 화면은 아무 말도 못 하고
         주소만 그대로 남는다(실제로 그랬다). 못 읽으면 빈 것으로 보고 아래에서 말한다. */
      const j = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      /* 로그인이 없어서 막힌 것이면 '잠시 뒤 다시' 가 거짓말이 된다 — 갈 길을 준다 */
      if (res.status === 401 || j.error === 'login_required') { set로그인필요(true); setErr(''); return; }
      if (!res.ok || !j.code) { setErr(MSG[j.error ?? ''] ?? FAILED); return; }
      r.push(`/m/${j.code}`); r.refresh();
    } catch {
      setErr('연결이 끊겼어요 — 잠시 뒤 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="hd">
        <Link className="back" href="/" aria-label="홈으로">‹</Link>
        <h1>모임 만들기</h1>
      </div>
      <div className="sheet" style={{ maxHeight: 'none', flex: 1 }}>
        <p className="mut" style={{ marginTop: 0 }}>중간에서 만나요 — 각자 가고 싶은 곳을 고르면 가장 많이 선정된 곳으로 정해집니다.</p>

        {/* 로그인이 필요하다는 것을 **폼 위에서** 먼저 말한다 (논의123).
            아래 `로그인필요` 안내와 겹치지 않게, 이미 눌러 본 사람에게는 이 줄을 숨긴다 —
            같은 말을 두 번 하면 어느 쪽을 따라야 할지 모른다. */}
        {로그인했나 === false && !로그인필요 && (
          <p className="mut" style={{ margin: '0 0 14px' }}>
            모임을 만들려면 로그인이 필요해요 —{' '}
            <a href="/me?next=/new" onClick={로그인하러} style={{ fontWeight: 700, color: '#2563eb' }}>
              지금 로그인하기
            </a>
            . 적어 두신 것은 그대로 있어요.
          </p>
        )}
        <div className="fld">
          <label htmlFor="mn">모임 이름</label>
          <input id="mn" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 우리 팀 회식" />
        </div>
        <div className="fld">
          <label htmlFor="hn">내 이름</label>
          <input id="hn" value={host} onChange={(e) => setHost(e.target.value)} placeholder="방장이 됩니다" />
        </div>
        {/* 어디서 온 값인지 말해 준다 — 안 그러면 남이 넣어 둔 값처럼 보인다.
            두고 온 출발지가 있으면 그것도 밝힌다: 말 없이 하나만 남으면 사라진 줄 안다 */}
        {!!넘김?.출발지들.length && (
          <p className="note" data-slot="넘어온출발지" style={{ margin: '0 0 12px' }}>
            홈에서 잡은 출발지를 가져왔어요.
            {넘김.출발지들.length > 1 &&
              ` 나머지 ${넘김.출발지들.length - 1}곳은 친구들이 들어와서 각자 넣어요.`}
          </p>
        )}
        <OriginField origin={origin} setOrigin={setOrigin}
          transport={transport} setTransport={setTransport} />

        <div className="fld">
          <label htmlFor="mt">약속 시간</label>
          <input id="mt" type="datetime-local" value={meetAt}
                 onChange={(e) => setMeetAt(e.target.value)} />
          <p className="mut" style={{ margin: '6px 0 0' }}>아직 안 정했으면 비워 두세요 — 나중에 설정에서 넣을 수 있어요.</p>
        </div>

        <div className="fld">
          <label htmlFor="sc">어디까지 정할까요</label>
          <select id="sc" value={scope} onChange={(e) => setScope(e.target.value as 'region' | 'place')}>
            <option value="place">지점까지 — 지역을 정한 뒤 지점까지</option>
            <option value="region">지역까지 — 지역만</option>
          </select>
        </div>
        {err && <p className="err">{err}</p>}

        {/* 로그인이 없어서 막힌 자리. 적어 둔 것은 그대로 두고 갈 길만 준다 —
            돌아왔을 때 다시 채우게 하면 두 번 일이다 (논의123) */}
        {로그인필요 && (
          <div className="note" style={{ marginTop: 10 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>모임을 만들려면 로그인해 주세요</p>
            <p className="mut" style={{ margin: '0 0 10px' }}>
              방장은 계정으로 알아봐요 — 폰을 바꿔도 내 모임으로 돌아올 수 있어요.
              적어 두신 것은 그대로 있어요.
            </p>
            <a className="cta sub" style={{ textAlign: 'center', lineHeight: '48px', textDecoration: 'none' }}
              href="/me?next=/new" onClick={로그인하러}>로그인하러 가기</a>
          </div>
        )}
        <button className="cta" onClick={make} disabled={busy || !name.trim() || !host.trim() || !origin}>만들기</button>

        <p className="mut" style={{ margin: '22px 0 6px' }}>초대 코드로 들어가기</p>
        <div className="fld">
          <input value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} maxLength={6} placeholder="6자리 코드" />
        </div>
        <button className="cta sub" onClick={() => r.push(`/join/${join}`)} disabled={join.length !== 6}>참여하기</button>
      </div>
    </div>
  );
}
