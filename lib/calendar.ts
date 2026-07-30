// ─────────────────────────────────────────────────────────────
// calendar.ts — 모임 일정 → 구글 캘린더 / .ics
//
// AI 가 대화에서 수집한 날짜·시간(prefs)을 쓰고, 없으면 다음 토요일 19시로 본다.
// ⚠️ 지금은 **내보내기만** 있다. 가져오기는 미구현 (memory/status.md 참고).
// ─────────────────────────────────────────────────────────────
import type { MeetingState } from "@/lib/types";

// ── AI가 수집한 모임 정보 칩 ──
// ── 모임 일정 계산 (AI가 대화에서 수집한 날짜·시간 사용, 없으면 다음 토요일 19시) ──
export function meetingSchedule(state: MeetingState): { start: Date; end: Date; fmt: (d: Date) => string } {
  let start: Date;
  if (state.prefs.dateIso) {
    const [h, m] = (state.prefs.timeHhmm || "19:00").split(":").map(Number);
    start = new Date(`${state.prefs.dateIso}T00:00:00`);
    start.setHours(h || 19, m || 0, 0, 0);
  } else {
    start = new Date();
    start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7)); // 다음 토요일
    start.setHours(19, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` +
    `T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  return { start, end, fmt };
}

// ── Google 캘린더에 추가 (원클릭, 파일 다운로드 없음) ──
export function openGoogleCalendar(state: MeetingState) {
  const { start, end, fmt } = meetingSchedule(state);
  const place = state.winnerPlace ? `${state.winnerPlace.name} (${state.winnerRegion?.name})` : state.name;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: state.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: place,
    details:
      `모이머로 정한 모임 · 참여자 ${state.totalParticipants}명` +
      (state.winnerPlace?.url ? `\n카카오맵: ${state.winnerPlace.url}` : "") +
      `\n모임 페이지: ${location.origin}/m/${state.code}`,
  });
  window.open(`https://calendar.google.com/calendar/render?${p.toString()}`, "_blank", "noopener");
}

// ── .ics 캘린더 파일 생성 (Apple/Outlook용 보조) ──
export function downloadIcs(state: MeetingState) {
  const { start, end, fmt } = meetingSchedule(state);
  const place = state.winnerPlace ? `${state.winnerPlace.name} (${state.winnerRegion?.name})` : state.name;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moimer//KO",
    "BEGIN:VEVENT",
    `UID:${state.code}@moimer`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${state.name}`,
    `LOCATION:${place}`,
    `DESCRIPTION:모이머로 정한 모임 · 참여자 ${state.totalParticipants}명`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moimer-${state.code}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}