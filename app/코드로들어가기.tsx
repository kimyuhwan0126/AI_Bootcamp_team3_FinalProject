'use client';
/* 초대 코드를 손으로 받은 사람의 입구.

   ⚠ 지금은 **홈(`app/page.tsx`)이 이 컴포넌트를 안 부른다** — 지운 게 아니라 안 쓴다.
   초대는 카톡·공유로 전한 실제 링크(`https://.../join/<코드>`)를 눌러 `/join/<코드>` 로
   바로 들어오는 길이 전부이고, 그 화면은 비로그인으로도 바로 참여 폼을 채울 수 있다 —
   여섯 자리를 손으로 치는 사람이 없으니 홈에 이 칸을 둘 까닭이 없다는 결정이었다.
   (전에는 "카카오 인앱 브라우저가 링크를 막을 때의 유일한 길" 이라는 뜻으로 만들었던
   자리다 — 그 걱정이 실제로 벌어지면 이 파일을 다시 불러 쓰면 된다. 그래서 코드를
   '불러 줄 수 있게' 헷갈리는 글자(0·O·1·I)를 뺀 로직은 그대로 남겨 둔다.)

   만들기 폼(`/new`)에는 아직 같은 뜻의 칸이 따로(인라인으로) 남아 있다 —
   '만들러 왔다가 마음이 바뀐 사람' 용이라 이번 결정 범위 밖이다. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function 코드로들어가기() {
  const r = useRouter();
  const [코드, set코드] = useState('');
  const 됐나 = 코드.length === 6;

  return (
    <div id="코드로들어가기" style={{ marginTop: 18, scrollMarginTop: 70 }}>
      <p className="mut" style={{ margin: '0 0 6px' }}>초대 코드를 받았다면</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="fld" style={{ flex: 1, margin: 0 }}>
          <input
            value={코드}
            /* 코드는 대문자다 — 소문자로 쳐도 알아듣게 한다 */
            onChange={(e) => set코드(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && 됐나) r.push(`/join/${코드}`); }}
            maxLength={6}
            placeholder="6자리 코드"
            inputMode="text"
            autoCapitalize="characters"
            aria-label="초대 코드 여섯 자리"
          />
        </div>
        <button className="cta sub" style={{ flex: 'none', width: 92, margin: 0 }}
          onClick={() => r.push(`/join/${코드}`)} disabled={!됐나}>
          들어가기
        </button>
      </div>
    </div>
  );
}
