'use client';
/* 바텀시트의 **출발지** 갈래 — 칩이나 지도 핀을 눌러 들어온 자리.

   ⚠ 2026-08-20 — **머리 블록을 통째로 뺐다**(사람이 정했다). 눈썹(‹ 뒤로 · 출발지 N) ·
   이름 · 거리 줄 · [지도에서 보기 / 삭제] 가 있던 자리다. 시트 맨 위 요약 줄
   (홈.tsx 의 `.시트요약`)이 이름과 소요시간을 이미 말하고 있어 같은 것이 화면에 두 번
   나왔다. 그래서 요약 줄을 한 줄 폼으로 고치고 — (번호)(출발지) (가운데)까지 (소요시간)
   [빼기] — 이 파일은 **정말 자세한 것만** 남겼다.

   그 블록과 함께 사라진 것 셋, 어디로 갔는지 —
     삭제          → 요약 줄의 휴지통 단추
     ‹ 뒤로        → 칩을 다시 누르거나(3단) 지도의 가운데 말풍선을 누른다
     지도에서 보기  → 없앴다. 되살리려면 홈.tsx 에 '홀로' 상태를 다시 세우면 된다(git 기록)

   남은 것 셋 —
     이동 수단 (2026-08-19 사용자 요청 — 예전에는 중간지점 시트에 하나뿐이라 모두가 같은
       수단으로 잼혔다. 차를 가져오는 사람과 대중교통으로 오는 사람이 섞이므로 고르는 자리도
       사람마다 있어야 한다. 고르면 지도의 그 사람 경로선이 다시 그려지고, 위 칩 글자도 바뀐다)
     이동 요약 (거리 · 걸리는 시간 · 이 모임에서 가장 오래 걸리는 사람인지)
     오는 길   (카카오가 준 구간별 안내 — 목업의 직선거리 **추정값**과 달리 진짜 경로다) */

import type { Origin, Transport } from '../originfield';
import type { RouteStep } from '@/lib/routes';
import { 수단이름 } from '@/lib/수단표기';
import s from './홈.module.css';

const 분 = (초: number) => `${Math.round(초 / 60)}분`;
const 킬로 = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

export default function 시트내용출발지({
  출발지, 이동수단, 이동수단정하기, 경로, 경로구하는중, 가장오래,
}: {
  /* 이름은 화면에 안 적는다(요약 줄이 적는다) — 읽어 주는 기계에게 '누구의 수단인가'를
     말하는 데만 쓴다. 그 줄과 이 칸은 서로 다른 자리라 눈으로 잇지 못하는 사람도 있다. */
  출발지: Origin;
  /* **이 출발지의** 이동 수단이다 — 모임 전체의 값이 아니다(홈.tsx 의 `수단들`) */
  이동수단: Transport;
  이동수단정하기: (t: Transport) => void;
  경로: { distanceM: number | null; durationS: number | null; steps?: RouteStep[] } | null;
  경로구하는중: boolean;
  /** 이 사람이 이 모임에서 가장 오래 걸리는가 */
  가장오래: boolean;
}) {
  const 걸리는시간 = 경로?.durationS != null ? 분(경로.durationS) : null;

  return (
    <div data-slot="시트-출발지">
      <p className={s.칸이름}>이동 수단</p>
      {/* 전역 `.segs`/`.seg` 를 그대로 쓴다 — 만들기 폼(`/new`)과 결이 같아진다.
          바꾸면 이 사람 몫의 `/api/routes` 만 다시 부른다(홈.tsx) — 남의 경로선은 그대로다. */}
      <div className="segs" data-slot="출발지수단"
        role="group" aria-label={`${출발지.name}의 이동 수단`}>
        {(['transit', 'car'] as const).map((k) => (
          <button key={k} type="button" className="seg" aria-pressed={이동수단 === k}
            onClick={() => 이동수단정하기(k)}>{수단이름[k]}</button>
        ))}
      </div>

      <div className={s.가름줄} />
      <p className={s.칸이름}>이동 요약</p>
      <div className={s.값들}>
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
        {/* 머리 블록이 있던 때는 이 말이 거리 줄 끝에 붙어 있었다 — 그 줄이 없어져
            이리로 옮겼다. 없애지는 않는다: 약속 시간을 정할 때 보는 것이 이 한 줄이다. */}
        {가장오래 && (
          <div className={s.값줄}>
            <span className={s.키}>이 모임에서</span>
            <span className={s.값}>가장 오래 걸려요</span>
          </div>
        )}
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
