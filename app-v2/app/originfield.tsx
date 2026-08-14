'use client';
/* 출발지 고르기 (그릴링 논의35 ①).
   모임을 만들 때도, 참여할 때도 같은 것을 묻는다 — 방장도 '그 모임의 참가자'다.
   두 화면이 각자 검색을 들고 있으면 고칠 곳이 둘이 된다. */
import { useEffect, useRef, useState } from 'react';
import { 기본값읽기 } from '@/lib/기본값';
import 찾기 from './출발지찾기.module.css';

export type Origin = { name: string; address: string; lat: number; lng: number };
/* 이동 수단 타입은 **`lib/types.ts` 하나뿐**이다. 전에는 여기에도 똑같은 것이 적혀 있어서,
   걷기를 대중교통에 합칠 때 저쪽만 고쳐도 tsc 가 아무 말을 안 했다 —
   화면은 여전히 없어진 값을 고를 수 있었다. 여기서는 다시 내보내기만 한다
   (부르는 쪽 여섯 곳이 이 파일에서 가져가고 있어 그 줄들은 그대로 둔다). */
export type { Transport } from '@/lib/types';
import type { Transport } from '@/lib/types';

export default function OriginField({
  origin, setOrigin, transport, setTransport, 쓰임 = '모임',
}: {
  origin: Origin | null;
  setOrigin: (o: Origin | null) => void;
  transport: Transport;
  setTransport: (t: Transport) => void;
  /* '모임'   = 모임을 만들거나 참여하는 자리(출발지가 필수다)
     '기본값' = 내정보에서 기본값을 정하는 자리(안 넣어도 된다)
     '탐색'   = 홈의 '가운데 찾기'. **겉모습이 다르다** — 옛 판의 큰 알약 검색칸이다
                (예전판 기록 §1·§12-7). 이름표도 딸린 설명도 없다: 홈은 훑는 자리라
                칸마다 설명이 붙으면 화면이 글로 덮인다. 검색·고르기 알맹이는 셋이 한 벌이다 —
                갈라 두면 카카오가 죽었을 때 어느 화면은 말하고 어느 화면은 조용해진다. */
  쓰임?: '모임' | '기본값' | '탐색';
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<(Origin & { id: string })[] | null>(null);
  /* 실패를 '없다'고 말하면 안 된다 — 출발지는 필수라 참여가 막히는데
     이유를 모르게 된다 (그릴링 논의43 ②).
     깃발 하나로 두던 것을 문구로 바꿨다: '너무 자주 불렀다'(429 too_many)와
     '바깥이 못 답했다'(503)는 할 일이 다른데 같은 말을 하고 있었다 (논의101).
     잠깐 쉬면 될 사람에게 영영 안 된다고 말하면 그 사람은 참여를 그만둔다. */
  const [문제, set문제] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 내정보(/me)에 넣어 둔 기본값을 **처음 한 번만** 얹는다 (lib/기본값.ts).
     불러오는 일을 화면마다 따로 붙이면 새 화면에서 또 빠뜨린다 — 예전판이 그래서
     "모임을 만들 때 바로 불러와요" 라고 적어 놓고 만들기 폼에는 안 넣었다(기록 §6·7).
     출발지 칸이 있는 곳이면 만들기든 참여든 저절로 따라온다.
     그린 뒤(useEffect)에 얹는 까닭: 서버는 이 기기 값을 모르니 첫 그림에 넣으면 어긋난다.
     사람이 지운 출발지를 되살리면 안 되므로 깃발로 한 번을 못 박는다. */
  const 얹었다 = useRef(false);
  const [불러왔다, set불러왔다] = useState(false);
  useEffect(() => {
    if (얹었다.current) return;
    얹었다.current = true;
    const 기본 = 기본값읽기();
    if (기본.origin && !origin) { setOrigin(기본.origin); set불러왔다(true); }
    setTransport(기본.transport);
    /* 처음 한 번뿐이라 다시 볼 것이 없다 — 뒤에 바뀌는 값을 여기 적으면 사람이 고른 것을 덮는다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 봉투의 `retryable` 이 '기다리면 되는가'를 말한다 — 화면이 상태 코드를 다시 해석하지 않는다.
     오늘치를 다 쓴 카카오 몫(quota_kakao)은 429 여도 기다려서 될 일이 아니다. */
  const 못찾은말 = (j: { error?: string; retryable?: boolean } | null) =>
    j?.error === 'too_many' ? '너무 자주 불러서 잠깐 쉬는 중이에요 — 잠시 뒤에 다시 해 주세요'
    : j?.retryable ? '지금은 장소를 찾을 수 없어요 — 잠시 뒤에 다시 해 주세요'
    : '지금은 장소를 찾을 수 없어요';

  /* 타이핑마다 부르지 않는다 — 손을 멈추면 찾는다 */
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const s = q.trim();
    if (origin || s.length < 2) { setHits(null); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(s)}`);
        if (!res.ok) {
          set문제(못찾은말(await res.json().catch(() => null)));
          setHits(null); return;
        }
        set문제(null);
        setHits((await res.json()).places ?? []);
      /* 대답조차 못 받은 것은 망이 끊긴 쪽이다 — 그건 다시 해 보면 된다 */
      } catch { set문제(못찾은말({ retryable: true })); setHits(null); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, origin]);

  const 탐색 = 쓰임 === '탐색';

  /* 찾은 것 목록 — 세 갈래가 똑같이 쓴다. 갈라 두면 카카오가 죽었을 때
     어느 화면은 말하고 어느 화면은 조용해진다. */
  const 찾은목록 = (
    <>
      {문제 && q.trim().length >= 2 &&
        <p className="warn" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{문제}</p>}
      {!문제 && hits && !hits.length && q.trim().length >= 2 &&
        <p className="mut" style={{ margin: '6px 0 0' }}>찾는 곳이 없어요 — 가까운 역 이름으로 해보세요.</p>}
      <ul className="rows" style={{ marginTop: 6 }}>
        {(hits ?? []).slice(0, 6).map((h) => (
          <li key={h.id}>
            <button className="row" onClick={() => { setOrigin(h); setHits(null); }}>
              <span className="nm">{h.name}
                {h.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{h.address}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  /* ── 홈의 큰 알약 검색칸 (옛 판 모양) ──────────────────────
     이름표도 딸린 설명도 없다. 물음이 곧 안내다 — "어디에서 출발하시나요?"
     여기서는 `origin` 이 늘 null 로 들어온다(탐색은 고르는 즉시 알약으로 옮겨 담는다).
     그래도 고른 모습을 그릴 줄은 알아야 한다 — 안 그러면 이 컴포넌트가 갈래마다 다른 물건이 된다. */
  if (탐색) {
    return (
      <div className={찾기.칸}>
        {origin ? (
          <button className={찾기.고른것} onClick={() => { setOrigin(null); setQ(''); }}>
            <span className="nm">{origin.name}</span>
            <span className="mut">바꾸기</span>
          </button>
        ) : (
          <>
            <div className={찾기.검색}>
              <svg viewBox="0 0 24 24" aria-hidden className={찾기.돋보기}>
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
              </svg>
              <input id="og" value={q} onChange={(e) => setQ(e.target.value)}
                     placeholder="어디에서 출발하시나요?" aria-label="출발지 찾기" />
            </div>
            {찾은목록}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="fld">
        <label htmlFor="og">
          {쓰임 === '기본값' ? '기본 출발지'
            : <>출발지 <span style={{ color: 'var(--danger)' }}>*</span></>}
        </label>
        {origin ? (
          <>
          <button className="row" onClick={() => { setOrigin(null); setQ(''); }}>
            <span className="nm">{origin.name}
              {origin.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{origin.address}</span>}
            </span>
            <span className="mut">바꾸기</span>
          </button>
          {/* 왜 이미 채워져 있는지 말해 준다 — 안 그러면 남이 넣어 둔 값처럼 보인다 */}
          {쓰임 === '모임' && 불러왔다 &&
            <p className="mut" style={{ margin: '0 0 7px' }}>내정보에 넣어 둔 기본 출발지예요 — 눌러서 바꿔도 돼요.</p>}
          </>
        ) : (
          <>
            <input id="og" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="역·지역·건물 이름 (예: 성수역)" />
            {찾은목록}
          </>
        )}
        <p className="mut" style={{ margin: '6px 0 0' }}>
          {쓰임 === '기본값'
            ? '모임을 만들거나 참여할 때 이 출발지와 이동 수단이 먼저 채워져요. 그 자리에서 바꿔도 돼요.'
            : '모두의 출발지로 가운데를 잡아 지도를 열어 줘요.'}
        </p>
      </div>

      <div className="fld">
        <label>{쓰임 === '기본값' ? '기본 이동 수단' : '이동 수단'}</label>
        <div className="segs">
          {/* 갈림은 하나다 — **차를 가져가나 안 가져가나** (lib/types.ts 의 Transport 주석).
              '걸어서' 를 따로 두었더니 가까운 곳을 고를 때 '대중교통' 과 어느 쪽인지 망설이게만 됐다.
              값은 둘 다 'transit' 으로 합쳤지만, 글자에 '걸어서' 를 남기면 없앤 뜻이 없다 —
              단추 이름은 그냥 '대중교통' 이다. */}
          {([['transit', '대중교통'], ['car', '자동차']] as const).map(([k, t]) => (
            <button key={k} className="seg" aria-pressed={transport === k}
              onClick={() => setTransport(k)}>{t}</button>
          ))}
        </div>
      </div>
    </>
  );
}
