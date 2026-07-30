"use client";

import Link from "next/link";
import { IcHome, IcChat, IcBallot, IcPeople, IcPerson } from "./Icons";

export type V8Tab = "home" | "meetings" | "votes" | "members" | "me";

const TABS: { key: V8Tab; href: string; label: string; icon: () => JSX.Element }[] = [
  { key: "home", href: "/", label: "홈", icon: IcHome },
  { key: "meetings", href: "/meetings", label: "모임", icon: IcChat },
  { key: "votes", href: "/votes", label: "투표함", icon: IcBallot },
  { key: "members", href: "/members", label: "모임원", icon: IcPeople },
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
