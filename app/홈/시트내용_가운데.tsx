'use client';
/* 바텀시트의 **중간지점** 갈래 — 지금 판 홈(app/탐색/탐색.tsx)이 지도 아래에 늘어놓던 것을
   전부 여기로 받는다. 없앤 것은 하나도 없다:

     지도밑문구 → `.작은글` (둘 미만일 때의 '더 넣어 달라'는 윗칸의 `.안내줄` 이 맡는다)
     AI 알약 줄 → `.칸이름 AI 추천` + 알약
     이동 수단  → 전역 `.segs`/`.seg` (globals.css:323 — `/new` 와 같은 결)
     만들기 CTA → 전역 `.cta` (⚠ `<a>` 로 남긴다, 아래 주석)
     출발지별 상세 → 아코디언 그대로

   ⚠ 만들기 단추는 **`<a>` 여야 한다.** 주소가 있는 자리로 가는 길이라 새 탭·오래 눌러
   열기가 되어야 하고, 자바스크립트가 아직 안 붙은 동안에도 눌리면 만들기로 가야 한다
   (app/탐색/탐색.tsx:255–259). 목업은 `<button class="cta">` 지만 그건 해시 라우터라
   그럴 수밖에 없었던 것이다 — 우리는 진짜 주소가 있다. */

import Link from 'next/link';
import type { Origin, Transport } from '../originfield';
import type { RouteStep } from '@/lib/routes';
import s from './홈.module.css';

export type 상세경로 = {
  id: string;
  points: { lat: number; lng: number }[];
  distanceM: number | null;
  durationS: number | null;
  steps?: RouteStep[];
};

const 분 = (초: number) => `${Math.round(초 / 60)}분`;

export default function 시트내용가운데({
  출발지들, 가운데라벨, 기준, 안내,
  AI결과, AI고름, AI고르기,
  이동수단, 이동수단정하기,
  경로들, 경로구하는중, 열쇠로, 펼친것, 토글,
  짐싣기,
}: {
  출발지들: Origin[];
  가운데라벨: string;
  기준: '거리' | 'AI';
  안내: string;
  AI결과: { name: string; lat: number; lng: number }[] | null;
  AI고름: number;
  AI고르기: (i: number) => void;
  이동수단: Transport;
  이동수단정하기: (t: Transport) => void;
  경로들: 상세경로[];
  경로구하는중: boolean;
  열쇠로: (o: Origin) => string;
  펼친것: Set<string>;
  토글: (열쇠: string) => void;
  짐싣기: () => void;
}) {
  const 잰것 = 경로들.map((r) => r.durationS).filter((v): v is number => v != null);
  const 평균 = 잰것.length ? Math.round(잰것.reduce((a, b) => a + b, 0) / 잰것.length / 60) : null;
  const 최대 = 잰것.length ? Math.round(Math.max(...잰것) / 60) : null;

  return (
    <div data-slot="시트-가운데">
      <p className={s.눈썹}>추천 중간지점 · {기준 === '거리' ? '거리 기준' : 'AI 추천'}</p>
      <h2 className={s.큰글}>{가운데라벨}</h2>
      <p className={s.작은글}>{안내}</p>

      {/* 이 화면의 주 행동. 지금처럼 짐(출발지·이동수단)을 싣고 `/new` 로 간다. */}
      <Link className="cta" href="/new" onClick={짐싣기} data-slot="만들기">
        {출발지들.length ? '이 출발지들로 모임 만들기' : '＋ 모임 만들기'}
      </Link>
      {출발지들.length > 1 && (
        <p className="mut" style={{ margin: '6px 0 0' }}>
          폼에는 첫 출발지로 채워져요 — 바꾸기를 누르면 여기서 잡은 곳 중 고를 수 있어요.
        </p>
      )}

      {/* 잰 값이 있을 때만 — 없는 숫자를 '—' 로 채워 두면 아직 못 잰 것인지 없는 것인지 모른다 */}
      {(평균 != null || 최대 != null) && (
        <>
          <div className={s.가름줄} />
          <div className={s.값들}>
            {평균 != null && (
              <div className={s.값줄}><span className={s.키}>평균 소요</span><span className={s.값}>약 {평균}분</span></div>
            )}
            {최대 != null && (
              <div className={s.값줄}><span className={s.키}>가장 오래 걸리는 사람</span><span className={s.값}>약 {최대}분</span></div>
            )}
            <div className={s.값줄}><span className={s.키}>출발지</span><span className={s.값}>{출발지들.length}곳</span></div>
          </div>
        </>
      )}

      {/* AI 추천 — 기준을 AI 로 두면 출발지가 바뀔 때마다 알아서 다시 묻는다(자동 갱신).
          받아 온 최대 3곳 중 고른 하나가 지도 핀이 된다. */}
      {기준 === 'AI' && !!AI결과?.length && (
        <>
          <div className={s.가름줄} />
          <div data-slot="AI">
            <p className={s.칸이름}>AI 가 고른 곳</p>
            <div className={s.단추줄} style={{ flexWrap: 'wrap' }}>
              {AI결과.map((p, i) => (
                <button key={`${p.name}${p.lat}`} type="button"
                  className={`cta ${s.보조}`} aria-pressed={i === AI고름}
                  style={i === AI고름 ? { background: 'var(--brand)', color: '#fff' } : undefined}
                  onClick={() => AI고르기(i)}>{p.name}</button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={s.가름줄} />
      <p className={s.칸이름}>이동 수단</p>
      {/* 전역 `.segs`/`.seg` 를 그대로 쓴다 — `/new` 와 결이 같아진다.
          목업에는 없는 칸이지만 우리는 이 값을 만들기 폼으로 실어 보내므로 없애면 안 된다. */}
      <div className="segs">
        {([['transit', '대중교통'], ['car', '자동차']] as const).map(([k, t]) => (
          <button key={k} type="button" className="seg" aria-pressed={이동수단 === k}
            onClick={() => 이동수단정하기(k)}>{t}</button>
        ))}
      </div>

      {/* 출발지별 상세 — 지금 판의 아코디언 그대로다. 여럿을 한꺼번에 펼쳐 견줘 볼 수 있다. */}
      {출발지들.length >= 2 && (
        <>
          <div className={s.가름줄} />
          <div data-slot="출발지별상세">
            <p className={s.칸이름}>출발지별 상세</p>
            <ul className="rows">
              {출발지들.map((o) => {
                const 열쇠 = 열쇠로(o);
                const r = 경로들.find((x) => x.id === 열쇠);
                const 열림 = 펼친것.has(열쇠);
                const 시간표시 = r?.durationS != null ? 분(r.durationS)
                  : r ? '경로 없음' : 경로구하는중 ? '찾는 중…' : '—';
                return (
                  <li key={열쇠}>
                    <button type="button" className="row" aria-expanded={열림} onClick={() => 토글(열쇠)}>
                      <span className="nm">{o.name}</span>
                      <span className="ct">{시간표시}</span>
                    </button>
                    {열림 && (
                      <div className="orinner">
                        <p className="mut" style={{ margin: '0 0 8px' }}>
                          {이동수단 === 'car' ? '자동차로 이동' : '대중교통으로 이동'}
                        </p>
                        {!r ? (
                          <p className="mut">{경로구하는중 ? '경로를 찾는 중이에요…' : '경로를 아직 못 찾았어요.'}</p>
                        ) : r.steps?.length ? (
                          /* 구간별 안내 — 카카오가 준 문장 그대로. 시간을 문장과 **같은 span 안에**
                             둔다: 형제로 두면 글이 길어 줄바꿈될 때 시간만 뚝 떨어져 나간다
                             (2026-08-17 실사용 신고). */
                          <ol className="orsteps">
                            {r.steps.map((st, i) => (
                              <li key={i}>
                                <span className="orstepicon" aria-hidden>
                                  {st.type === 'SUBWAY' ? '🚇' : st.type === 'BUS' ? '🚌'
                                    : st.type === 'WALKING' ? '🚶' : '•'}
                                </span>
                                <span className="orsteptext">
                                  {st.guidance}
                                  {st.durationS != null && <span className="mut"> · {분(st.durationS)}</span>}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : r.durationS != null ? (
                          <p className="mut">
                            {r.distanceM != null ? `${(r.distanceM / 1000).toFixed(1)}km · ` : ''}
                            {분(r.durationS)}
                          </p>
                        ) : (
                          <p className="mut">여기까지 가는 경로를 찾지 못했어요.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <div className={s.가름줄} />
      <p className={s.귀띔}>
        각자 출발지를 내고 가고 싶은 곳을 고르면, <b>가장 많이 고른 곳</b>으로 정해져요.
      </p>
    </div>
  );
}
