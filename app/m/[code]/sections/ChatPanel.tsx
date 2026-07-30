"use client";

// ─────────────────────────────────────────────────────────────
// 모임 채팅 패널 — AI 파실리테이터
//
// 👤 담당: 채팅·AI 파싱 (`.github/CODEOWNERS`)
//    이 파일과 `lib/ai.ts` · `lib/parse.ts` 만 만지면 다른 사람과 안 부딪힌다.
//
// 기본은 꺼져 있다 (`NEXT_PUBLIC_FF_AI_CHAT=1` 로 켠다 — `lib/flags.ts`).
// 부모(MeetingClient)는 `FLAGS.aiChat` 이 켜져 있을 때만 이 컴포넌트를 그린다.
// ─────────────────────────────────────────────────────────────
import { type RefObject } from "react";
import type { ChatMsg, MeetingState } from "@/lib/types";

/** AI 가 대화에서 수집한 모임 정보 — 폼 없이 채워지는 칩들. */
export function PrefChips({ prefs }: { prefs: MeetingState["prefs"] }) {
  const items: [string, string | undefined][] = [
    ["🎯", prefs.purpose],
    ["✨", prefs.mood],
    ["📅", [prefs.dateText, prefs.timeText].filter(Boolean).join(" ") || undefined],
    ["💰", prefs.budget],
    ["🍺", prefs.alcohol],
    ["🥗", prefs.dietary],
  ];
  const filled = items.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {filled.map(([icon, v]) => (
        <span key={icon} className="chip line" style={{ fontSize: 10.5 }}>
          {icon} {v}
        </span>
      ))}
    </div>
  );
}

export interface ChatPanelProps {
  state: MeetingState;
  /** 내 이름 — 내 말풍선을 오른쪽에 붙이는 판단에 쓴다 (아직 참가 전이면 undefined) */
  myName: string | undefined;
  /** 새 메시지가 오면 맨 아래로 스크롤하기 위한 앵커 */
  chatEndRef: RefObject<HTMLDivElement>;
  /** 타이핑 없이 탭 1번으로 보내는 문구들 */
  quickChips: string[];
  text: string;
  onTextChange: (v: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
}

export default function ChatPanel({
  state,
  myName,
  chatEndRef,
  quickChips,
  text,
  onTextChange,
  onSend,
  busy,
}: ChatPanelProps) {
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <span className="eyebrow">모임 채팅</span>
        {state.aiBusy && (
          <span className="aithink">
            🤖 AI 생각 중{" "}
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          </span>
        )}
      </div>

      <PrefChips prefs={state.prefs} />

      <div className="chatlog">
        {state.chat.map((c: ChatMsg) => {
          const cls =
            c.role === "system" ? "sys" : c.role === "ai" ? "ai" : c.name === myName ? "me" : "other";
          return (
            <div key={c.id} className={"cmsg " + cls}>
              {(cls === "other" || cls === "ai") && (
                <span className="who">{cls === "ai" ? "🤖 AI 도우미" : c.name}</span>
              )}
              <div className="bub">{c.text}</div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* 빠른답변 칩 — 타이핑 없이 탭 1번으로 의견 전달 */}
      <div className="chips">
        {quickChips.map((q) => (
          <button key={q} disabled={busy} onClick={() => onSend(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <input
          className="input grow"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend(text);
          }}
          placeholder="편하게 의견을 말해보세요…"
        />
        <button className="btn sm" disabled={busy || !text.trim()} onClick={() => onSend(text)}>
          전송
        </button>
      </div>
    </div>
  );
}
