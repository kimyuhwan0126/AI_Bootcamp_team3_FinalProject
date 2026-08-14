import './globals.css';
import TabBar from './tabbar';
export const metadata = { title: '모이머', description: '중간에서 만나요' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* 탭바를 여기 한 번만 둔다 — 화면마다 붙이면 새 화면에서 빠뜨린다.
     어디에 보일지는 탭바가 스스로 안다(app/tabbar.tsx). */
  return <html lang="ko"><body>{children}<TabBar /></body></html>;
}
