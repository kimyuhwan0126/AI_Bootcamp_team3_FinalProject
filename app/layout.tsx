import './globals.css';
import TabBar from './tabbar';
export const metadata = { title: '모이머', description: '중간에서 만나요' };
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
     어디에 보일지는 탭바가 스스로 안다(app/tabbar.tsx). */
  return <html lang="ko"><body>{children}<TabBar /></body></html>;
}
