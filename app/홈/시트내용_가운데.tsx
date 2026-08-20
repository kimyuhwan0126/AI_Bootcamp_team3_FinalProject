'use client';
/* 바텀시트의 **중간지점** 갈래 — 지금 판 홈(app/탐색/탐색.tsx)이 지도 아래에 늘어놓던 것을
   여기로 받는다:

     지도밑문구 → `.작은글`
     만들기 CTA → 전역 `.cta` (⚠ `<a>` 로 남긴다, 아래 주석)

   ⚠ **이동 수단 칩(대중교통/자동차)과 출발지별 상세 아코디언은 2026-08-19 에 사람이
   정해 뺐다.** 이동 수단은 만들기 폼(`/new`)에서 고르고 — 홈은 대중교통으로 잰다
   (홈.tsx 의 `이동수단`) —, 출발지 하나하나의 오는 길은 칩이나 핀을 눌러 여는
   **출발지 시트**가 말한다(시트내용_출발지.tsx — 구간별 안내가 거기 그대로 있다).
   되살릴 일이 생기면 사람에게 먼저 묻는다.

   ⚠ 만들기 단추는 **`<a>` 여야 한다.** 주소가 있는 자리로 가는 길이라 새 탭·오래 눌러
   열기가 되어야 하고, 자바스크립트가 아직 안 붙은 동안에도 눌리면 만들기로 가야 한다
   (app/탐색/탐색.tsx:255–259). 목업은 `<button class="cta">` 지만 그건 해시 라우터라
   그럴 수밖에 없었던 것이다 — 우리는 진짜 주소가 있다. */

import Link from 'next/link';
import type { Origin } from '../originfield';
import type { RouteStep } from '@/lib/routes';
import s from './홈.module.css';

export type 상세경로 = {
  id: string;
  points: { lat: number; lng: number }[];
  distanceM: number | null;
  durationS: number | null;
  steps?: RouteStep[];
};

export default function 시트내용가운데({
  출발지들, 가운데라벨, 안내,
  경로들, 짐싣기,
}: {
  출발지들: Origin[];
  가운데라벨: string;
  안내: string;
  /* 평균·최대 소요를 셈하는 데만 쓴다 — 출발지별 상세가 빠진 뒤로 낱낱은 안 그린다 */
  경로들: 상세경로[];
  짐싣기: () => void;
}) {
  const 잰것 = 경로들.map((r) => r.durationS).filter((v): v is number => v != null);
  const 평균 = 잰것.length ? Math.round(잰것.reduce((a, b) => a + b, 0) / 잰것.length / 60) : null;
  const 최대 = 잰것.length ? Math.round(Math.max(...잰것) / 60) : null;

  return (
    <div data-slot="시트-가운데">
      {/* 눈썹('추천 중간지점 · 거리 기준')은 2026-08-20 에 **시트 요약 줄 오른쪽으로**
          옮겼다(홈.tsx 의 `.시트요약`) — 접어 둔 채로도 무엇을 보고 있는지 읽히게.
          안내 한 줄은 할 말이 있을 때만 그린다: '참가자들의 출발지 한가운데를 잡아요.' 는
          같은 날 뺐고(요약 줄이 이미 그 말을 한다), 빈 문자열이 그 자리에 온다.
          출발지가 모자랄 때의 안내는 그대로 남는다 — 그건 무엇을 더 해야 하는지의 말이다. */}
      <h2 className={s.큰글}>{가운데라벨}</h2>
      {!!안내 && <p className={s.작은글}>{안내}</p>}

      {/* 이 화면의 주 행동. 지금처럼 짐(출발지·이동수단)을 싣고 `/new` 로 간다. */}
      <Link className="cta" href="/new" onClick={짐싣기} data-slot="만들기">
        {출발지들.length ? '이 출발지들로 모임 만들기' : '＋ 모임 만들기'}
      </Link>
      {/* '폼에는 첫 출발지로 채워져요 — …' 는 2026-08-20 에 사람이 정해 뺐다.
          만들기 폼에 가면 첫 칸에 그 출발지가 이미 들어 있어 눈으로 보이는 것이고,
          바꾸는 길도 그 화면에 있다 — 가기 전에 미리 설명할 값이 없다. */}

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

      {/* ⚠ 'AI 가 고른 곳' 후보 단추 묶음은 2026-08-20 에 사람이 정해 뺐다 — 같은 후보를
          윗칸의 AI 칩줄(윗칸.tsx 의 `.AI칩줄`)이 이미 늘어놓고 있어 두 번이었다.
          고르는 자리는 그 칩줄 하나다. 되살릴 일이 생기면 사람에게 먼저 묻는다. */}

      {/* '각자 출발지를 내고 가고 싶은 곳을 고르면 …' 귀띔도 2026-08-20 에 함께 뺐다 —
          모임을 만든 뒤 그 화면에서 실제로 겪는 일이라, 만들기 전 홈에서 미리 말할 자리가
          아니다. 되살릴 일이 생기면 사람에게 먼저 묻는다. */}
    </div>
  );
}
