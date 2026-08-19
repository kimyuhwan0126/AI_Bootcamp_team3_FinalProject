'use client';
/* 바텀시트의 **출발지** 갈래 — 칩이나 지도 핀을 눌러 들어온 자리.

   목업(screens/home.js 3735–3758)의 짜임을 그대로 옮겼다:
     눈썹(‹ 뒤로 · 출발지 N) → 이름 → 거리·분 한 줄 → [지도에서 보기, 삭제]
     → 가름줄 → 이동 요약 → 구간별 안내

   다른 점 둘 —
     ① 목업은 직선거리 기반 **추정값**이지만 우리는 `/api/routes` 가 준 **진짜 경로**다
        (카카오 대중교통 · TMAP). 그래서 '약 N분'이 아니라 그냥 'N분'이고,
        구간별 안내(🚇🚌🚶)도 실제 문장이다.
     ② 목업에는 "핀을 끌어서 위치를 바꾸면 중간지점이 즉시 다시 계산돼요" 라는 귀띔이 있다.
        **안 넣는다** — 우리는 핀을 못 끈다(2026-08-19 사람이 정했다). 없는 기능을
        알려 주는 글은 거짓말이 된다. */

import type { Origin, Transport } from '../originfield';
import type { RouteStep } from '@/lib/routes';
import { 출발지색고르기 } from './핀그림';
import s from './홈.module.css';

const 분 = (초: number) => `${Math.round(초 / 60)}분`;
const 킬로 = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

export default function 시트내용출발지({
  출발지, 번호, 가운데라벨, 이동수단, 경로, 경로구하는중, 가장오래,
  뒤로, 지도에서보기, 삭제, 뺄수있나,
}: {
  출발지: Origin;
  /** 0부터. 화면에는 +1 해서 보여 준다 — 칩·핀의 번호와 같아야 한다. */
  번호: number;
  가운데라벨: string;
  이동수단: Transport;
  경로: { distanceM: number | null; durationS: number | null; steps?: RouteStep[] } | null;
  경로구하는중: boolean;
  /** 이 사람이 이 모임에서 가장 오래 걸리는가 */
  가장오래: boolean;
  뒤로: () => void;
  지도에서보기: () => void;
  삭제: () => void;
  /** 마지막 한 곳은 못 뺀다 — 뺄 수 있을 때만 삭제 단추가 산다 */
  뺄수있나: boolean;
}) {
  const 색 = 출발지색고르기(번호);
  const 걸리는시간 = 경로?.durationS != null ? 분(경로.durationS) : null;

  return (
    <div data-slot="시트-출발지">
      <p className={s.눈썹}>
        <button type="button" className={s.뒤로} onClick={뒤로} aria-label="중간지점으로 돌아가기">‹</button>
        <span style={{ color: 색 }}>●</span> 출발지 {번호 + 1}
      </p>
      <h2 className={s.큰글}>{출발지.name}</h2>

      <p className={s.작은글}>
        {걸리는시간
          ? <>{가운데라벨}까지 <b>{걸리는시간}</b>
              {경로?.distanceM != null && <> · {킬로(경로.distanceM)}</>}
              {가장오래 && <> · 이 모임에서 가장 오래 걸려요</>}</>
          : 경로구하는중 ? '오는 길을 찾는 중이에요…'
          : '여기까지 오는 길을 찾지 못했어요.'}
      </p>

      <div className={s.단추줄}>
        <button type="button" className="cta" onClick={지도에서보기}>지도에서 보기</button>
        <button type="button" className={`cta ${s.보조}`} onClick={삭제} disabled={!뺄수있나}
          /* 마지막 한 곳까지 빼면 가운데가 사라져 화면이 통째로 비어 버린다 —
             막되 **왜 막혔는지**를 읽어 주는 기계에도 말해 준다 */
          title={뺄수있나 ? undefined : '출발지는 최소 한 곳은 남아야 해요'}>
          삭제
        </button>
      </div>

      <div className={s.가름줄} />
      <p className={s.칸이름}>이동 요약</p>
      <div className={s.값들}>
        <div className={s.값줄}>
          <span className={s.키}>이동수단</span>
          <span className={s.값}>{이동수단 === 'car' ? '자동차' : '대중교통'}</span>
        </div>
        {경로?.distanceM != null && (
          <div className={s.값줄}>
            <span className={s.키}>거리</span>
            <span className={s.값}>{킬로(경로.distanceM)}</span>
          </div>
        )}
        <div className={s.값줄}>
          <span className={s.키}>걸리는 시간</span>
          <span className={s.값}>{걸리는시간 ?? (경로구하는중 ? '찾는 중…' : '—')}</span>
        </div>
      </div>

      {/* 구간별 안내 — 카카오가 준 문장 그대로. 시간을 문장과 **같은 span 안에** 둔다:
          형제로 두면 글이 길어 줄바꿈될 때 시간만 뚝 떨어져 나간다(2026-08-17 실사용 신고). */}
      {!!경로?.steps?.length && (
        <>
          <div className={s.가름줄} />
          <p className={s.칸이름}>오는 길</p>
          <ol className="orsteps">
            {경로.steps.map((st, i) => (
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
        </>
      )}
    </div>
  );
}
