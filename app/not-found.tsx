/* 없는 주소를 열었을 때. Next.js 기본 화면은 영문 '404 This page could not be found.' 라
   한국어 앱에 그대로 나왔다 (그릴링 논의39 ③). */
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="hd"><h1>모이머</h1></div>
      <div className="sheet" style={{ maxHeight: 'none', flex: 1, padding: 20 }}>
        {/* 지워진 모임과 처음부터 없던 코드를 여기서는 가릴 수 없다 — 둘 다 흔적이 남지 않는다.
            그래서 까닭을 짚지 않고 다음에 할 일만 말한다 (그릴링 논의112). */}
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>이 모임은 없어요</p>
        <p className="mut" style={{ margin: '8px 0 18px' }}>
          없어졌거나, 초대 코드가 다를 수 있어요.
          코드가 여섯 자리인지, 대문자·숫자가 맞는지 다시 봐 주세요.
        </p>
        <Link className="cta" style={{ textAlign: 'center', lineHeight: '48px', textDecoration: 'none' }}
          href="/">처음으로</Link>
      </div>
    </div>
  );
}
