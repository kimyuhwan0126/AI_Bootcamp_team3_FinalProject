import './globals.css';
import localFont from 'next/font/local';
import TabBar from './tabbar';
export const metadata = { title: '모이머', description: '중간에서 만나요' };

/* 앱 전체의 글꼴 — Spoqa Han Sans Neo (사람이 정했다, 2026-08-20).
   파일은 저장소 안에 있다(app/폰트/) — 받은 곳과 왜 세 벌뿐인지는 거기 `받은곳.md` 에 적었다.

   `next/font/local` 을 쓰는 까닭: 빌드 때 파일을 읽어 해시 붙인 이름으로 스스로 내보내고
   `@font-face` 까지 만들어 준다. 우리가 CSS 에 손으로 적으면 파일 이름을 바꿀 때마다
   캐시가 어긋난다.

   `preload: false` — 세 벌이 545KB 다. 첫 그림 앞에 그걸 다 밀어 넣으면 지도가 늦게 뜬다.
   `display: 'swap'` 이 대신 받는다: 글자는 대체 글꼴로 **먼저 보이고** 나중에 바뀐다.
   빈 화면을 보여 주는 것보다 낫다(노션 UIUX_독학가이드 07장 — 0.1/1/10초 법칙).

   `fallback` 을 여기 적으면 next/font 가 만드는 CSS 변수 안에 스택이 통째로 담긴다 —
   그래서 globals.css 는 `--font-sans: var(--font-spoqa)` 한 줄이면 되고, 폰트 스택이
   화면마다 흩어지지 않는다(전에는 globals.css 와 홈.module.css 에 두 벌로 적혀 있었다).

   `adjustFontFallback: false` — Next 가 켜 두면 Arial 의 몸집에 맞춘 가짜 대체 글꼴을
   하나 더 만든다. 라틴 기준이라 한글에는 오히려 어긋난다. */
const 스포카 = localFont({
  src: [
    { path: './폰트/SpoqaHanSansNeo-Regular.woff2', weight: '400', style: 'normal' },
    { path: './폰트/SpoqaHanSansNeo-Medium.woff2', weight: '500', style: 'normal' },
    { path: './폰트/SpoqaHanSansNeo-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-spoqa',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  /* 글꼴을 못 받아도 화면은 돌아야 한다 — 전에 쓰던 스택을 그대로 뒤에 세운다 */
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Apple SD Gothic Neo', 'Malgun Gothic', 'system-ui', 'sans-serif'],
});

/* 홈 셸이 `env(safe-area-inset-*)` 로 노치와 홈 표시줄을 피한다 — `viewportFit:'cover'`
   가 없으면 그 값이 **늘 0** 이라 검색바가 노치 밑에 깔린다(globals.css:131 이 이미
   그 사정을 적어 뒀다: "viewport-fit=cover 가 아니면 0 이다").
   전에는 viewport 지정이 아예 없어 Next 의 기본값만 나갔다. */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* 탭바를 여기 한 번만 둔다 — 화면마다 붙이면 새 화면에서 빠뜨린다.
     어디에 보일지는 탭바가 스스로 안다(app/tabbar.tsx).
     글꼴 변수는 `<html>` 에 얹는다 — `<body>` 에 얹으면 그 밖(모달 포털 등)이 못 본다. */
  return <html lang="ko" className={스포카.variable}><body>{children}<TabBar /></body></html>;
}
