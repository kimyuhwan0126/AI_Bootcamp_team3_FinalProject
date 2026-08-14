'use client';
/* 홈의 '가운데 찾기' — 로그인도 모임도 없이 **써 보면서** 무엇을 해 주는 곳인지 알게 하는 자리.

   전에는 홈이 `[모임 만들기]` 와 `[코드 넣기]` 둘뿐인 갈림길이었다. 처음 온 사람은
   무엇을 해 주는 곳인지 모른 채 둘 중 하나를 골라야 했다. 출발지를 넣어 가운데가 잡히는 것을
   한 번 보면 설명이 필요 없다 (예전판 기록 §1).

   출발지 검색·고르기는 `app/originfield.tsx` 를 그대로 쓴다 — 만들기·참여와 한 벌이어야
   고칠 곳이 하나로 남는다(그 파일 머리말). 다만 그 칸은 '한 곳'을 받는 물건이라
   여기서는 **고른 것을 곧바로 목록으로 옮기고 칸을 새로 단다**(아래 `칸비우기`). */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OriginField, { type Origin, type Transport } from '../originfield';
import { 실어보내기, 두고간것읽기, 두고가기 } from '@/lib/넘기기';
import 지도 from './지도';
import s from './탐색.module.css';

/* 예전판과 같은 한도 — 모임 정원도 8이다 */
const 최대 = 8;
/* 가운데 둘레를 이만큼 본다. 카카오는 갈래마다 다섯 곳까지만 주므로 넓혀도 목록이 길어지지는 않고,
   가운데가 뒷골목에 떨어졌을 때 빈손이 되는 것만 막는다. */
const 반경 = 1000;
/* 손이 멈춘 뒤에 부른다 (논의92) — 출발지를 잇달아 넣으면 가운데가 그때마다 바뀐다 */
const 뜸 = 450;

/* 한국 밖은 안 받는다 (논의55·60). 판정하는 상자는 `lib/geo.ts` 의 `한국안` 이지만
   그 파일은 불러오는 순간 DB 연결을 만들어 브라우저에서는 못 쓴다 — 같은 상자를 여기 한 번 더 적는다.
   (옮기자는 이야기는 보고에 적었다.) */
const 한국안 = (lat: number, lng: number) =>
  lat >= 33 && lat <= 38.7 && lng >= 124.5 && lng <= 132;

/* 같은 곳을 두 번 넣지 않는다. 이름만 보면 '스타벅스'가 하나뿐이 되고,
   좌표만 보면 같은 건물의 다른 출입구가 두 곳이 된다 — 둘을 함께 본다. */
const 열쇠 = (o: Origin) => `${o.name}@${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;

type 지점 = { id: string; name: string; address: string; lat: number; lng: number; category?: string };

/* ⚠ **갈래(카테고리) 거르개를 없앴다** — 옛 판 홈 모양으로 돌아오면서 사람이 뺀 것이다.
   둘레 목록은 그대로 나오되 갈래로 걸러 내지 않는다. 목록 줄에 붙는 갈래 표(`.갈래표`)는 남는다 —
   그건 거르는 장치가 아니라 '이게 무엇인지' 를 말하는 이름표다. */

export default function 탐색() {
  /* 두고 간 것을 읽기 전에는 출발지 칸을 안 단다 — 먼저 달면 그 칸이 스스로 얹는 기본 출발지가
     두고 간 목록보다 앞서 들어와 순서가 뒤엉킨다 */
  const [준비, set준비] = useState(false);
  const [출발지들, set출발지들] = useState<Origin[]>([]);
  const [이동수단, set이동수단] = useState<Transport>('transit');
  const [칸키, set칸키] = useState(0);
  const [알림, set알림] = useState('');

  /* 새로 단 출발지 칸은 **스스로** 내정보의 기본 출발지·이동 수단을 얹는다(originfield.tsx).
     그건 사람이 고른 것이 아니다 — 칸을 새로 달 때마다 기본값이 또 얹히면
     사람이 뺀 출발지가 되살아나고, 골라 둔 이동 수단이 매번 되돌아간다.
     자식의 첫 효과가 부모 효과보다 **먼저** 도는 성질을 써서 한 번만 흘려보낸다. */
  const 자동출발지무시 = useRef(false);
  const 자동이동수단무시 = useRef(false);
  /* 이 줄은 아래 두 효과보다 **먼저** 적혀 있어야 한다 — 같은 그리기에서는 적힌 차례대로 돈다 */
  useEffect(() => { 자동출발지무시.current = false; 자동이동수단무시.current = false; });

  useEffect(() => {
    const 두고간것 = 두고간것읽기();
    /* `null` 은 '두고 간 것이 없다', `[]` 는 '두고 갔는데 다 뺐다'.
       뒤엣것에 기본 출발지를 다시 얹으면 방금 뺀 것이 새로고침마다 살아난다 */
    if (두고간것) { set출발지들(두고간것); 자동출발지무시.current = true; }
    set준비(true);
  }, []);

  const 바꾸기 = (다음: Origin[]) => { set출발지들(다음); 두고가기(다음); };

  /* 검색칸을 새로 단다. 칸 안의 검색어를 밖에서 지울 길이 없어서다 —
     그냥 두면 방금 넣은 곳이 목록에 계속 떠 있고, 그것을 또 누르면 아무 일도 안 일어난다. */
  const 칸비우기 = () => {
    자동출발지무시.current = true; 자동이동수단무시.current = true;
    set칸키((v) => v + 1);
  };

  const 고름 = (o: Origin | null) => {
    if (!o) return;
    if (자동출발지무시.current) return;
    if (!한국안(o.lat, o.lng)) { set알림('한국 안에서만 가운데를 잡아 줘요'); 칸비우기(); return; }
    if (출발지들.length >= 최대) { set알림(`출발지는 ${최대}곳까지 넣을 수 있어요`); 칸비우기(); return; }
    if (출발지들.some((p) => 열쇠(p) === 열쇠(o))) { set알림('이미 넣은 출발지예요'); 칸비우기(); return; }
    set알림('');
    바꾸기([...출발지들, o]);
    칸비우기();
  };

  const 이동수단정하기 = (t: Transport) => {
    if (자동이동수단무시.current) return;
    set이동수단(t);
  };

  const 빼기 = (i: number) => {
    set알림('');
    바꾸기(출발지들.filter((_, k) => k !== i));
  };

  /* 모두의 출발지 가운데 — `app/m/[code]/ui.tsx:302` 와 **같은 셈**이다.
     두 화면이 다른 가운데를 말하면 홈에서 본 자리와 모임에서 여는 자리가 어긋난다. */
  const 가운데 = 출발지들.length
    ? { lat: 출발지들.reduce((a, o) => a + o.lat, 0) / 출발지들.length,
        lng: 출발지들.reduce((a, o) => a + o.lng, 0) / 출발지들.length }
    : null;

  /* ── 가운데 둘레 지점 ───────────────────────────────────── */
  const [지점들, set지점들] = useState<지점[] | null>(null);
  const [부르는중, set부르는중] = useState(false);
  const [지점문제, set지점문제] = useState('');
  const [반쪽, set반쪽] = useState(false);

  const 가lat = 가운데?.lat ?? null, 가lng = 가운데?.lng ?? null;
  useEffect(() => {
    if (가lat === null || 가lng === null) { set지점들(null); set지점문제(''); return; }
    let 살아있다 = true;
    set부르는중(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?lat=${가lat}&lng=${가lng}&r=${반경}`);
        const j = await res.json().catch(() => null);
        if (!살아있다) return;
        if (!res.ok) {
          /* 봉투의 `retryable` 이 '기다리면 되는가'를 말한다 — 화면이 상태 코드를 다시 해석하지 않는다
             (originfield.tsx 와 같은 규칙, 논의101) */
          set지점문제(
            j?.error === 'too_many' ? '너무 자주 불러서 잠깐 쉬는 중이에요 — 잠시 뒤에 다시 해 주세요'
            : j?.error === 'bad_coords' ? '한국 안에서만 둘레를 보여 줄 수 있어요'
            : j?.retryable ? '지금은 둘레 지점을 불러올 수 없어요 — 잠시 뒤에 다시 해 주세요'
            : '지금은 둘레 지점을 불러올 수 없어요');
          set지점들(null);
          return;
        }
        set지점문제('');
        set반쪽(j?.partial === true);
        set지점들(j?.places ?? []);
      /* 대답조차 못 받은 것은 망이 끊긴 쪽이다 — 그건 다시 해 보면 된다 */
      } catch { if (살아있다) { set지점문제('지금은 둘레 지점을 불러올 수 없어요 — 잠시 뒤에 다시 해 주세요'); set지점들(null); } }
      finally { if (살아있다) set부르는중(false); }
    }, 뜸);
    return () => { 살아있다 = false; clearTimeout(t); };
  }, [가lat, 가lng]);

  const 보일지점 = 지점들 ?? [];

  /* ── 만들기 폼으로 ───────────────────────────────────────
     **링크**로 둔다. 주소가 있는 자리로 가는 길이라 새 탭·오래 눌러 열기가 되어야 하고,
     자바스크립트가 아직 안 붙은 동안에도 눌리면 만들기로 가야 한다.
     짐은 누를 때 싣는다 — Link 는 같은 문서 안에서 옮겨 가므로 실어 둔 것이 그대로 살아 있다
     (lib/넘기기.ts). 새 탭으로 열면 문서가 새로 뜨니 짐은 없던 것이 되고, 폼은 기본값으로 뜬다. */
  function 짐싣기() {
    /* 넘기는 것은 **첫 출발지 하나**다 — 만들기 폼은 방장의 출발지만 받는다.
       나머지는 아직 안 온 사람들 것이라 방장이 대신 넣어 줄 자리가 없다.
       그래도 통째로 실어 보낸다: 몇 곳을 두고 왔는지 폼이 말해 줘야 사람이 사라진 줄 알지 않는다. */
    실어보내기({ 출발지들, 이동수단 });
  }

  /* 가운데 좌표는 눈으로 못 읽는다(지도 위 핀뿐이다) — 그 셈이 맞는지 시험이 볼 수 있게 적어 둔다 */
  return (
    <section className={s.칸} data-slot="탐색" data-출발지수={출발지들.length}
      data-가운데={가운데 ? `${가운데.lat},${가운데.lng}` : ''}>
      {/* 옛 판 홈에는 '가운데 찾기' 라는 제목도 딸린 설명도 없었다.
          큰 검색칸이 "어디에서 출발하시나요?" 라고 스스로 묻는다 — 물음이 곧 안내다.
          홈은 훑는 자리라 칸마다 설명을 붙이면 화면이 글로 덮인다. */}

      {/* 출발지 칸을 새로 달아 검색어를 비운다 — 위 `칸비우기` 주석 참고 */}
      {준비 && (
        <OriginField key={칸키} origin={null} setOrigin={고름} 쓰임="탐색"
          transport={이동수단} setTransport={이동수단정하기} />
      )}

      {/* 넣은 출발지 알약 줄. **점선 원 ＋ 는 늘 있다** — 옛 판이 그랬다(예전판 사진 02).
          아직 하나도 안 넣었을 때 이 자리가 통째로 비어 있으면 '무엇을 더 할 수 있는지' 가 안 보인다. */}
      <ul className={s.알약들}>
        {출발지들.map((o, i) => (
          <li key={열쇠(o)} className={s.알약}>
            <span className={s.알약이름}>{o.name}</span>
            <button type="button" onClick={() => 빼기(i)} aria-label={`${o.name} 빼기`}>✕</button>
          </li>
        ))}
        {출발지들.length < 최대 && (
          <li>
            <button type="button" className={s.더하기} aria-label="출발지 더 넣기"
              /* 검색칸은 늘 열려 있다 — 이 단추는 거기로 손을 데려다 준다 */
              onClick={() => document.getElementById('og')?.focus()}>＋</button>
          </li>
        )}
      </ul>
      <p className={s.잔글}>
        {출발지들.length ? `${출발지들.length}곳 넣었어요 · 최대 ${최대}곳까지 넣을 수 있어요.`
          : `최대 ${최대}곳까지 넣을 수 있어요.`}
      </p>
      {알림 && <p className="warn" style={{ margin: '0 0 10px', fontSize: 12.5 }}>{알림}</p>}

      <div className={s.지도칸}>
        <지도
          출발지들={출발지들.map((o) => ({ 이름: o.name, lat: o.lat, lng: o.lng }))}
          가운데={가운데}
          지점들={보일지점.map((p) => ({ 이름: p.name, lat: p.lat, lng: p.lng }))} />
      </div>

      {/* 옛 판은 지도 아래에 이 한 줄을 **늘** 뒀다 — 무엇을 하면 무엇이 나오는지 미리 말해 준다.
          한 곳만 넣은 사람에게는 '한 곳 더' 라고 더 또렷하게 말한다. */}
      {출발지들.length < 2 && (
        <p className={s.지도밑}>
          {출발지들.length === 1
            ? '출발지를 하나 더 넣으면 두 곳의 가운데를 잡아 줘요.'
            : '출발지를 2곳 이상 넣으면 가운데와 그 둘레를 보여 드려요.'}
        </p>
      )}

      {/* 이동 수단 — 옛 판 홈에는 없던 칸이다(거기서는 내정보에만 있었다).
          우리는 이 값을 만들기 폼으로 실어 보내므로 여기 남긴다. 다만 **지도 아래**로 내렸다:
          위쪽은 검색 → 출발지 → 지도 로 이어지는 옛 판의 흐름을 그대로 두려는 것이다. */}
      <div className={s.이동칸}>
        <span className={s.이동이름}>이동 수단</span>
        <div className="segs">
          {/* originfield.tsx 와 같은 잣대 — 값은 'transit' 하나로 합쳤지만 글자는 '대중교통' 만 보인다 */}
          {([['transit', '대중교통'], ['car', '자동차']] as const).map(([k, t]) => (
            <button key={k} type="button" className="seg" aria-pressed={이동수단 === k}
              onClick={() => 이동수단정하기(k)}>{t}</button>
          ))}
        </div>
      </div>

      {!!출발지들.length && (
        <div className={s.목록칸}>
          {지점문제 ? <p className="warn" style={{ fontSize: 12.5, margin: 0 }}>{지점문제}</p>
            : 부르는중 && !지점들 ? <p className="mut" style={{ margin: 0 }}>둘레를 살펴보는 중이에요…</p>
            : !보일지점.length ? <p className="mut" style={{ margin: 0 }}>여기엔 아직 보여 줄 지점이 없어요.</p>
            : (
              <ul className="rows">
                {보일지점.slice(0, 12).map((p) => (
                  <li key={p.id}>
                    <div className="row" data-static>
                      <span className="nm">{p.name}
                        {p.address && <span className="mut" style={{ display: 'block', fontWeight: 600 }}>{p.address}</span>}
                      </span>
                      {p.category && <span className={s.갈래표}>{p.category}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          {반쪽 && !지점문제 && (
            <p className="mut" style={{ margin: '6px 0 0' }}>몇 곳은 지금 못 불러왔어요.</p>
          )}
        </div>
      )}

      <Link className="cta" href="/new" onClick={짐싣기}>
        {출발지들.length ? '이 출발지들로 모임 만들기' : '＋ 모임 만들기'}
      </Link>
      {출발지들.length > 1 && (
        <p className="mut" style={{ margin: '6px 0 0' }}>
          폼에는 첫 출발지만 들어가요 — 나머지는 친구들이 들어와서 각자 넣어요.
        </p>
      )}
    </section>
  );
}
