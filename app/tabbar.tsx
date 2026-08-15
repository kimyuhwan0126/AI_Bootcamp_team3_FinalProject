'use client';
/* 아래 탭바. app-v2 에는 화면 사이를 오갈 길이 아예 없었다 —
   모임을 만들고 나면 다른 모임으로 갈 방법이 없다(예전판 기록 §11).

   탭바는 자기가 보일 자리를 스스로 안다. 화면마다 붙이면 새 화면에서 빠뜨린다. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* 셋뿐이고 순서가 곧 화면 순서다 (주소 얼개 표).
   `/new` `/join/*` 에는 안 뜬다 — 한 가지 일에만 매달리는 자리라 새는 길을 두지 않는다.
   그래서 '앞이 같으면'이 아니라 **정확히 같을 때만** 켠다(아래 `/m/<코드>` 는 예외 — 주석 참고). */
const 탭 = [
  { 주소: '/', 이름: '홈', 그림: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.6 12 3.2l9 7.4" /><path d="M5.6 9.6V20.3h12.8V9.6" />
    </svg>
  ) },
  { 주소: '/meetings', 이름: '모임', 그림: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.3" /><path d="M3.4 20.2c0-3.1 2.5-5.4 5.6-5.4s5.6 2.3 5.6 5.4" />
      <path d="M16.2 5.4a3.3 3.3 0 0 1 0 6.2" /><path d="M17.6 15.3c1.9.8 3 2.6 3 4.9" />
    </svg>
  ) },
  { 주소: '/me', 이름: '내정보', 그림: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.7" /><path d="M4.6 20.3c0-3.7 3.3-6.1 7.4-6.1s7.4 2.4 7.4 6.1" />
    </svg>
  ) },
];

/* `/m/<코드>` 는 참가자에겐 계속 탭바를 뺀다(몰입 화면) — 링크 하나 타고 들어와
   그 모임만 보면 되는 사람에게 딴 데로 새는 길은 필요 없다. 그런데 **방장은 다르다** —
   그 모임만 보는 게 아니라 다른 모임도 만들고 오간다. 방장에게 탭바가 없으면
   자기 모임 화면에 들어온 뒤로는 홈에도 [모임] 탭에도 돌아갈 길이 브라우저 뒤로가기뿐이었다
   (실사용 신고, 2026-08-15). */
const 모임코드 = (path: string | null) => /^\/m\/([A-Za-z0-9_-]{1,32})$/.exec(path ?? '')?.[1] ?? null;

export default function TabBar() {
  const 지금 = usePathname();
  /* 내가 아직 안 고른 모임이 있나 (논의129). **수는 안 적고 점만 찍는다** —
     자리를 안 먹고, 숫자가 틀리는 순간 들통나는 위험도 없다. '뭐가 있다' 만 말한다.
     홈에 있던 '내 모임' 요약을 없애면서 그 칸이 하던 마지막 일 하나를 여기로 옮긴 것이다.

     로그인은 필요 없다 — `/api/mine` 은 쿠키만으로도 답한다(논의124). 못 물어보면 안 찍는다:
     있지도 않은 일감을 있다고 하면, 눌러 보고 아무것도 없을 때 그 점을 다시는 안 믿는다. */
  const [할일, set할일] = useState(false);
  /* 지금 보고 있는 `/m/<코드>` 에서 내가 방장인가 — 알기 전까지는 숨긴다(참가자에게
     잘못 보여주는 쪽보다 방장에게 한 박자 늦게 보이는 쪽이 안전하다). */
  const [방장인모임, set방장인모임] = useState(false);
  const 코드 = 모임코드(지금);
  const 알려진탭 = 탭.some((t) => t.주소 === 지금);
  const 보임 = 알려진탭 || (!!코드 && 방장인모임);
  /* 탭바가 절대 안 뜨는 화면(`/new` · `/join/…`)에서는 **묻지도 않는다.**
     전에는 `useEffect` 가 아래 `return null` 보다 위에 있어서, 탭바가 없는 화면에서도
     화면을 옮길 때마다 `/api/mine` 을 한 번씩 불렀다 — 아무 데도 안 쓰이는 왕복이었다.
     `/m/<코드>` 는 방장인지 몰라서 물어야 한다 — 알려진 탭이거나 모임 화면일 때만 부른다. */
  useEffect(() => {
    set방장인모임(false);   /* 코드가 바뀌면 다음 답이 올 때까지는 숨긴 채로 둔다 */
    if (!알려진탭 && !코드) return;
    let 살아있나 = true;
    fetch('/api/mine')
      .then((r) => r.json())
      .then((j) => {
        if (!살아있나) return;
        const 모임들: { code: string; iAmHost?: boolean; iChose?: boolean; closed?: boolean }[] = j?.meetings ?? [];
        set할일(모임들.some((m) => !m.closed && m.iChose === false));
        if (코드) set방장인모임(모임들.some((m) => m.code === 코드 && m.iAmHost === true));
      })
      .catch(() => { /* 못 물어봤으면 안 찍는다 · 방장 여부도 모르는 채로 둔다(숨김이 안전) */ });
    return () => { 살아있나 = false; };
    /* 화면을 옮길 때마다 다시 본다 — 방금 고르고 나온 사람에게 점이 남아 있으면 안 된다 */
  }, [지금, 알려진탭, 코드]);

  if (!보임) return null;
  return (
    <nav className="tabbar" aria-label="화면 이동">
      {탭.map((t) => (
        <Link key={t.주소} href={t.주소} className="tab"
          /* 지금 어디에 있는지는 색만으로 말하면 안 된다 — 읽어 주는 기계도 알아야 한다 */
          aria-current={t.주소 === 지금 ? 'page' : undefined}>
          <span className="tabicon">
            {t.그림}
            {t.주소 === '/meetings' && 할일 && (
              /* 읽어 주는 기계에도 말해 준다 — 색이나 점만으로 말하면 안 보이는 사람에게는 없는 것이다 */
              <span className="tabdot" aria-label="아직 고르지 않은 모임이 있어요" role="status" />
            )}
          </span>
          <span>{t.이름}</span>
        </Link>
      ))}
    </nav>
  );
}
