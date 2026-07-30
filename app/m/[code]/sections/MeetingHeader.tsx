"use client";

// ─────────────────────────────────────────────────────────────
// 상단 헤더 — 모임 이름/코드 · 신원 전환 · 정원 경고 · 스텝 인디케이터
//
// 👤 담당: 모임 상세 화면 (`.github/CODEOWNERS`)
//
// ⚠️ `.appbar` 는 `backdrop-filter` 를 쓴다. `transform` 과 마찬가지로 이 안의
//    `position: fixed` 자손은 기준 박스가 헤더로 바뀌어 화면 밖으로 잘린다.
//    여기 안에서 전체화면 오버레이를 띄우려면 반드시 포털을 거칠 것.
//
// 신원 전환 <select> 는 한 기기에서 여러 참가자로 전체 플로우를 테스트하기 위한
// 것이다(lib/identity.ts). 실서비스라면 로그인으로 대체된다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import type { MeetingState } from "@/lib/types";
import type { Identity } from "@/lib/identity";
import StepIcons from "@/app/components/v8/StepIcons";

export interface MeetingHeaderProps {
  state: MeetingState;
  isLeader: boolean;
  identities: Identity[];
  activeId: string | undefined;
  onSwitch: (id: string) => void;
  onAddParticipant: () => void;
  aiChatEnabled: boolean;
  /** 실제로 진행 중인 단계 */
  stepIndex: number;
  /** 화면에 보여줄 단계 (지난 단계 조회 중이면 다르다) */
  displayStep: number;
  viewingPast: boolean;
  onStepClick: (i: 0 | 1 | 2) => void;
  onBackToCurrent: () => void;
}

export default function MeetingHeader({
  state,
  isLeader,
  identities,
  activeId,
  onSwitch,
  onAddParticipant,
  aiChatEnabled,
  stepIndex,
  displayStep,
  viewingPast,
  onStepClick,
  onBackToCurrent,
}: MeetingHeaderProps) {
  return (
    <>
      {/* App bar */}
      <div className="appbar">
        <div className="between">
          <div className="row" style={{ gap: 9 }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--ink-faint)", fontSize: 20 }}>←</Link>
            <div>
              <h1>{state.name}</h1>
              <div className="faint" style={{ fontSize: 11 }}>
                코드 <b className="tnum">{state.code}</b> · 정원 {state.headcount}명 · {state.totalParticipants}명 참여
              </div>
            </div>
          </div>
          {isLeader ? <span className="chip leader">👑 방장</span> : <span className="chip line">🙋 참가자</span>}
        </div>

        {/* participant switcher (테스트용 다중 참가자) */}
        <div className="switcher" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800 }} className="faint">현재</span>
          <select value={activeId || ""} onChange={(e) => onSwitch(e.target.value)}>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} {i.isLeader ? "(방장)" : ""}
              </option>
            ))}
          </select>
          <button className="btn ghost sm" onClick={onAddParticipant}>+ 참가자</button>
        </div>
      </div>

      {/* 정원 초과 경고 배너 */}
      {state.overCapacity && (
        <div style={{ margin: "10px 16px 0", padding: "10px 13px", borderRadius: 12, background: "var(--warn-soft)", border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)", display: "flex", gap: 9, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div className="grow">
            <b style={{ fontSize: 12.5, color: "var(--warn)" }}>정원 초과 · {state.totalParticipants}/{state.headcount}명</b>
            <div className="faint" style={{ fontSize: 11 }}>정원({state.headcount}명)을 넘겼어요. 신규 참여는 자동으로 차단됩니다.</div>
          </div>
        </div>
      )}

      {/* stepper — 피그마: 원형 아이콘 + 연결선 */}
      <div className="pad" style={{ paddingBottom: 0 }}>
        {aiChatEnabled ? (
          <div className="stepper">
            {["① 메인 · 출발지", "② AI 대화", "③ 결과"].map((s, i) => (
              <div key={i} className={"s " + (i === stepIndex ? "on" : i < stepIndex ? "done" : "")}>
                {s}
                <div className="bar" />
              </div>
            ))}
          </div>
        ) : (
          <StepIcons
            step={displayStep as 0 | 1 | 2}
            onStepClick={onStepClick}
            maxClickable={stepIndex as 0 | 1 | 2}
          />
        )}
      </div>

      {viewingPast && (
        <div className="pad" style={{ paddingBottom: 0 }}>
          <div
            className="row"
            style={{
              gap: 8, background: "var(--ac-soft)", color: "var(--ac-deep)", borderRadius: 12,
              padding: "9px 12px", fontSize: 11.5, fontWeight: 800,
            }}
          >
            <span className="grow">🕐 지난 단계를 보고 있어요 — 실제로 진행 중인 단계는 아니에요</span>
            <button
              className="btn sm"
              style={{ background: "var(--ac)", flexShrink: 0 }}
              onClick={onBackToCurrent}
            >
              현재 단계로
            </button>
          </div>
        </div>
      )}
    </>
  );
}
