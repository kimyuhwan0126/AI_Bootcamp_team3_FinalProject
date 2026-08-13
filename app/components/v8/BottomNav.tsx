"use client";

import Link from "next/link";
import { IcHome, IcChat, IcPerson } from "./Icons";

/**
 * 하단 탭 — **3개** (설계_v19.md §4-②).
 *
 * v6 에서 5 → 3 으로 줄였다: '투표함'과 '모임원'은 **모임 탭 하나로 통합**됐다.
 * 투표할 것은 모임 탭 상단에 고정되고, 모임원은 각 모임 화면 안에 있다.
 *
 * ⚠️ `votes`·`members` 는 타입에 남겨 둔다 — 옛 라우트가 아직 리다이렉트로 살아 있고,
 *    그 페이지들이 `active` 를 넘긴다. 탭 바에는 그리지 않는다.
 */
export type V8Tab = "home" | "meetings" | "votes" | "members" | "me";

const TABS: { key: V8Tab; href: string; label: string; icon: () => JSX.Element }[] = [
  { key: "home", href: "/", label: "홈", icon: IcHome },
  { key: "meetings", href: "/meetings", label: "모임", icon: IcChat },
  { key: "me", href: "/me", label: "내정보", icon: IcPerson },
];

export default function BottomNav({ active }: { active: V8Tab }) {
  return (
    <nav className="v8-bottomnav">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={"v8-nav-item" + (active === t.key ? " on" : "")}>
          <t.icon />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
