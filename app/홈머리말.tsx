'use client';
/* 홈 머리말 — **옛 판 모양**이다 (예전판 기록 §2 · §12-3).
   워드마크 `MOIMER` 왼쪽, 동그란 아이콘 단추 오른쪽.

   ⚠ 옛 판에는 단추가 셋(＋ 모임 생성 · → 모임 참가 · 🔔 알림)이었는데 여기는 **하나**다.
      알림은 우리 서비스에 **없는 기능**이라 안 그린다 — 눌러야만 안 되는 것을 알게 되는 단추는
      거짓말이다(논의105). 기능이 생기는 날 여기 한 줄만 늘리면 된다.
      → 모임 참가 단추도 없앴다 — 초대는 실제 링크(`/join/<코드>`)를 눌러 바로 들어오는 길이
      전부라, 홈에서 누를 '참가' 단추 자체가 갈 곳이 없어졌다(`app/page.tsx` 의 ④ 참고).

   워드마크는 옛 판 그대로 `MOIMER` 다. 화면 안 다른 글은 다 한글인데 여기만 로마자인 것이
   어색해 보일 수 있으나, **로고는 이름이지 글이 아니다** — 옛 판을 그대로 두라는 뜻으로 받았다. */
import Link from 'next/link';
import s from './홈머리말.module.css';

export default function 홈머리말() {
  return (
    <header className={s.머리} data-slot="홈머리말">
      <Link href="/" className={s.로고} aria-label="모이머 홈">MOIMER</Link>
      <div className={s.단추들}>
        {/* 옛 판의 ＋ 는 로그인 시트를 열었다. 우리는 만들기 폼이 로그인을 스스로 챙기므로(논의123)
            바로 그 자리로 보낸다 — 한 걸음이 줄어든다. */}
        <Link href="/new" className={s.동그라미} aria-label="모임 만들기" title="모임 만들기">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </Link>
      </div>
    </header>
  );
}
