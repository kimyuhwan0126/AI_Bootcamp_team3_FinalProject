// ─────────────────────────────────────────────────────────────
// scripts/build-deck-v2-pptx.js — 중간발표 v2 PPT 생성기 (외부 청중용)
//
//   npm i -D pptxgenjs        (한 번만)
//   node scripts/build-deck-v2-pptx.js
//   → docs/발표_중간발표_v2.pptx
//
// v1(scripts/build-deck-pptx.js)과 무엇이 다른가
//   · 대상이 우리 멘토 → **다른 팀 멘토 · 기업 현직자 · 타팀 팀원**으로 넓어졌다.
//     처음 듣는 사람이 있다는 전제로 **팀 · 기획 배경 · 서비스 소개**를 앞에 넣었다.
//   · 엔지니어링 상세는 **부록(15~20장)으로 뺐다.** 10분 발표에서 본편이 늘어지지
//     않게 하고, 질문이 나오면 그때 펼친다.
//
// ⚠️ 파워포인트에서 직접 고치지 말 것 — 여기를 고치고 다시 돌린다.
//    안 그러면 다음 갱신 때 무엇을 바꿨는지 알 수 없다.
//    (HTML 슬라이드 `docs/발표_중간발표_v2.html` 과 내용이 같다 — 둘 다 고칠 것)
// ⚠️ 팀·일정 정보는 팀에게 확인받은 값이다. 추측으로 채운 항목은 없다.
// ─────────────────────────────────────────────────────────────
const pptx = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const IMG = (n) => "image/png;base64," + fs.readFileSync(path.join(REPO, "docs/img/발표", n)).toString("base64");

const C = {
  navy: "12203C", navy2: "1B3A7A",
  brand: "2F6FED", brandDeep: "1F5AE0", ice: "E8F0FF",
  ink: "111A2B", soft: "54617A", faint: "8B98AE",
  panel: "F6F8FC", hair: "DBE2EE", white: "FFFFFF",
  ok: "16A34A", okSoft: "DCFCE7", okInk: "14532D",
  warn: "D97706", warnSoft: "FEF3C7", warnInk: "7C4A0A",
  bad: "E11D48", badSoft: "FFE4E9", badInk: "9F1239",
};
const F = "Malgun Gothic";
const MONO = "Consolas";
const TEAM = "브레인 스파크";
const DATE = "2026.08.14 (금)";

const p = new pptx();
p.layout = "LAYOUT_WIDE";               // 13.333 x 7.5
p.author = TEAM;
p.title = "모이머 — 중간발표";
const W = 13.333, H = 7.5, M = 0.62;

const shadow = () => ({ type: "outer", color: "8B98AE", blur: 10, offset: 2, angle: 90, opacity: 0.18 });

function head(s, eyebrow, title) {
  s.addText(eyebrow, { x: M, y: 0.42, w: W - M * 2, h: 0.26, fontFace: F, fontSize: 11.5,
    bold: true, color: C.brand, charSpacing: 1.2 });
  s.addText(title, { x: M, y: 0.70, w: W - M * 2, h: 0.62, fontFace: F, fontSize: 30,
    bold: true, color: C.ink, valign: "top" });
}
function foot(s, n, appendix) {
  s.addText(appendix ? "부록 · 모이머" : `모이머 · ${TEAM}`, { x: M, y: H - 0.52, w: 5, h: 0.26,
    fontFace: F, fontSize: 9.5, color: C.faint });
  s.addText(String(n).padStart(2, "0"), { x: W - M - 1, y: H - 0.52, w: 1, h: 0.26,
    fontFace: F, fontSize: 10, bold: true, color: C.soft, align: "right" });
}
function card(s, o) {
  s.addShape(p.ShapeType.roundRect, { x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.1,
    fill: { color: o.fill || C.panel }, line: { color: o.line || C.hair, width: 1 },
    shadow: o.flat ? undefined : shadow() });
}
function chip(s, o) {
  const w = o.w || (0.13 * o.text.length + 0.34);
  s.addShape(p.ShapeType.roundRect, { x: o.x, y: o.y, w, h: 0.28, rectRadius: 0.14,
    fill: { color: o.bg || C.ice }, line: { color: o.bg || C.ice, width: 0 } });
  s.addText(o.text, { x: o.x, y: o.y, w, h: 0.28, fontFace: F, fontSize: 9.5, bold: true,
    color: o.fg || C.brandDeep, align: "center", valign: "middle", margin: 0 });
  return w;
}
const txt = (s, t, o) => s.addText(t, Object.assign({ fontFace: F, fontSize: 12, color: C.soft,
  valign: "top", margin: 0, lineSpacing: 18 }, o));
/** 표지·마무리 배경 (기울인 둥근 판 두 장) */
function coverBg(s) {
  s.background = { color: C.navy };
  s.addShape(p.ShapeType.roundRect, { x: -2, y: 3.1, w: 11, h: 9, rectRadius: 0.5,
    fill: { color: C.navy2 }, line: { width: 0 }, rotate: -18 });
  s.addShape(p.ShapeType.roundRect, { x: 6.2, y: 4.6, w: 10, h: 8, rectRadius: 0.5,
    fill: { color: C.brand }, line: { width: 0 }, rotate: -18, transparency: 30 });
}

// ══════════════ 1. 표지 ══════════════
{
  const s = p.addSlide(); coverBg(s);
  s.addText(`${TEAM} · 중간발표 · ${DATE}`, { x: M + 0.15, y: 1.35, w: 9, h: 0.32,
    fontFace: F, fontSize: 13, bold: true, color: "A8C6FF", charSpacing: 1.5 });
  s.addText("모이머", { x: M + 0.1, y: 1.72, w: 8, h: 1.05, fontFace: F, fontSize: 52, bold: true, color: C.white });
  s.addText("흩어진 우리, 딱 중간에서.", { x: M + 0.15, y: 2.82, w: 9, h: 0.45,
    fontFace: F, fontSize: 22, bold: true, color: C.white });
  s.addText("각자 다른 곳에서 출발하는 사람들이 아무도 혼자 크게 손해보지 않는 만남 장소를,\n지도를 한 번 누르는 것만으로 함께 정하는 서비스",
    { x: M + 0.15, y: 3.36, w: 9.2, h: 0.9, fontFace: F, fontSize: 15, color: "D6E4FF", lineSpacing: 26 });
  let cx = M + 0.15;
  for (const t of ["설치 없이 링크 하나", "2~8명", "Next.js · TypeScript · PostgreSQL"]) {
    const w = 0.135 * t.length + 0.42;
    s.addShape(p.ShapeType.roundRect, { x: cx, y: 4.42, w, h: 0.34, rectRadius: 0.17,
      fill: { color: C.white, transparency: 82 }, line: { width: 0 } });
    s.addText(t, { x: cx, y: 4.42, w, h: 0.34, fontFace: F, fontSize: 10.5, bold: true,
      color: C.white, align: "center", valign: "middle", margin: 0 });
    cx += w + 0.16;
  }
  s.addText("팀장 최병현  ·  팀원 김유환 · 양성은 · 신동원        |        멘토 최종원",
    { x: M + 0.15, y: 5.35, w: 10, h: 0.3, fontFace: F, fontSize: 12, color: "8FB0E8" });
  s.addNotes("안녕하세요, 브레인 스파크입니다. 저희가 만든 모이머는 — 여럿이 각자 다른 곳에서 출발할 때, 아무도 혼자 크게 손해보지 않는 만남 장소를 함께 정하는 서비스입니다.");
}

// ══════════════ 2. 팀 ══════════════
{
  const s = p.addSlide(); head(s, "팀 소개", TEAM);
  const members = [["최", "최병현", "팀장"], ["김", "김유환", "팀원"], ["양", "양성은", "팀원"], ["신", "신동원", "팀원"]];
  const cw = (W - M * 2 - 0.42) / 4;
  members.forEach(([ini, nm, role], i) => {
    const x = M + i * (cw + 0.14);
    card(s, { x, y: 1.78, w: cw, h: 1.9 });
    s.addShape(p.ShapeType.ellipse, { x: x + cw / 2 - 0.36, y: 2.02, w: 0.72, h: 0.72,
      fill: { color: C.ice }, line: { width: 0 } });
    s.addText(ini, { x: x + cw / 2 - 0.36, y: 2.02, w: 0.72, h: 0.72, fontFace: F, fontSize: 20,
      bold: true, color: C.brandDeep, align: "center", valign: "middle", margin: 0 });
    txt(s, nm, { x, y: 2.9, w: cw, h: 0.34, fontSize: 17, bold: true, color: C.ink, align: "center" });
    txt(s, role, { x, y: 3.26, w: cw, h: 0.26, fontSize: 11, color: C.faint, align: "center" });
  });
  card(s, { x: M, y: 3.94, w: W - M * 2, h: 0.86, fill: C.white, flat: true });
  chip(s, { x: M + 0.28, y: 4.2, text: "멘토", bg: C.panel, fg: C.soft });
  txt(s, "최종원", { x: M + 1.0, y: 4.2, w: 1.2, h: 0.3, fontSize: 15, bold: true, color: C.ink, valign: "middle" });
  txt(s, "— 8/6 멘토링에서 받은 지적을 이번 발표까지 전부 반영했습니다 (부록 20장)",
    { x: M + 2.1, y: 4.2, w: W - M * 2 - 2.4, h: 0.3, fontSize: 11.5, color: C.faint, valign: "middle" });
  card(s, { x: M, y: 4.98, w: W - M * 2, h: 1.0, fill: C.ice, line: "C7DBFF" });
  txt(s, [{ text: "일정 — ", options: { bold: true, color: C.brandDeep } },
          { text: "오늘 ", options: { color: C.brandDeep } },
          { text: "중간발표 8/14(금)", options: { bold: true, color: C.brandDeep } },
          { text: " · ", options: { color: C.brandDeep } },
          { text: "최종발표 8/21(금)", options: { bold: true, color: C.brandDeep } },
          { text: ". 저희 버전 규칙상 최종발표일에 1.0.0 을 답니다. 지금은 0.2.0 입니다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 5.24, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  foot(s, 2);
}

// ══════════════ 3. 한 장 요약 ══════════════
{
  const s = p.addSlide(); head(s, "한 장 요약", "모이머는 이런 서비스입니다");
  const items = [
    ["무엇을", "여럿이 만날 장소를\n함께 정하는 웹앱", "앱 설치도 회원가입도 없습니다. 초대 링크 하나를 단톡방에 뿌리면 끝입니다."],
    ["누구를 위해", "서로 다른 동네에\n흩어져 사는 2~8명", "친구·동아리·팀 회식처럼 출발지가 제각각인 모임이 대상입니다."],
    ["어떻게", "출발지 → 지도 한 번 탭\n→ 가장 공평한 곳", "누구에게 얼마나 걸리는지를 숫자로 보여주고 투표로 확정합니다."],
  ];
  const cw = (W - M * 2 - 0.44) / 3;
  items.forEach(([tag, t, d], i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 1.7, w: cw, h: 2.9 });
    chip(s, { x: x + 0.26, y: 1.94, text: tag });
    txt(s, t, { x: x + 0.26, y: 2.42, w: cw - 0.52, h: 0.9, fontSize: 16, bold: true, color: C.ink, lineSpacing: 24 });
    txt(s, d, { x: x + 0.26, y: 3.42, w: cw - 0.52, h: 1.0, fontSize: 11.5, lineSpacing: 17 });
  });
  card(s, { x: M, y: 4.88, w: W - M * 2, h: 1.1, fill: C.okSoft, line: "BBF7D0" });
  chip(s, { x: M + 0.3, y: 5.12, text: "지금 상태", bg: C.white, fg: C.okInk });
  txt(s, "설계 화면 11개 중 9개 완성  ·  실기기 4대 리허설 통과  ·  브라우저 자동 테스트 78개  ·  오늘 시연 가능한 상태입니다",
    { x: M + 1.5, y: 5.12, w: W - M * 2 - 1.8, h: 0.4, fontSize: 12.5, bold: true, color: C.okInk, valign: "middle" });
  foot(s, 3);
  s.addNotes("처음 들으시는 분들을 위해 한 장으로 요약하면 이렇습니다. 설치도 가입도 없이 링크 하나로 들어와 장소만 정하고 나가는 서비스입니다.");
}

// ══════════════ 4. 기획 배경 ══════════════
{
  const s = p.addSlide(); head(s, "기획 배경", "친구들이 더 이상 같은 동네에 살지 않습니다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.66, w: cw, h: 2.04 });
  txt(s, "학교 때는 다 같은 동네에 있었습니다. 그때는 “어디서 볼까”가 질문이 아니었어요.\n\n지금은 누구는 취업하고, 누구는 이사 가고, 누구는 아직 학교에 있습니다. 출발지가 흩어지는 순간 약속 장소 정하기가 매번 협상이 됩니다.",
    { x: M + 0.26, y: 1.88, w: cw - 0.52, h: 1.7, fontSize: 12.5, lineSpacing: 19 });
  card(s, { x: M, y: 3.86, w: cw, h: 1.28, fill: C.warnSoft, line: "FDE68A" });
  txt(s, [{ text: "그리고 늘 같은 사람이 멀리서 옵니다. ", options: { bold: true, color: C.warnInk } },
          { text: "문제는 그게 숫자로 보이지 않는다는 것입니다 — 아무도 “내가 얼마나 더 오는지”를 모르니 말도 못 꺼냅니다.", options: { color: C.warnInk } }],
      { x: M + 0.26, y: 4.1, w: cw - 0.52, h: 0.86, fontSize: 12, lineSpacing: 18 });

  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.66, w: cw, h: 3.48 });
  chip(s, { x: rx + 0.26, y: 1.88, text: "우리가 실제로 겪은 일" });
  const chat = [
    ["“어디서 볼까?”   — 10분 뒤", 0, C.panel, C.soft],
    ["“아무데나 ㅋㅋ”", 1, C.panel, C.soft],
    ["“그럼 강남?”   — 또 10분 뒤", 0, C.panel, C.soft],
    ["“나 거기 1시간 넘게 걸리는데…”", 1, C.badSoft, C.badInk],
    ["“그럼 어디로 하지…”  (처음으로)", 0, C.panel, C.soft],
  ];
  chat.forEach(([t, indent, bg, fg], i) => {
    const bw = cw - 0.52 - (indent ? 0.7 : 0);
    const bx = rx + 0.26 + (indent ? 0.7 : 0);
    const y = 2.42 + i * 0.56;
    s.addShape(p.ShapeType.roundRect, { x: bx, y, w: bw, h: 0.4, rectRadius: 0.1,
      fill: { color: bg }, line: { width: 0 } });
    txt(s, t, { x: bx + 0.16, y, w: bw - 0.32, h: 0.4, fontSize: 11, color: fg, valign: "middle" });
  });

  card(s, { x: M, y: 5.3, w: W - M * 2, h: 0.98, fill: C.ice, line: "C7DBFF" });
  txt(s, [{ text: "우리가 푸는 것은 “지도 검색”이 아니라 “합의”입니다. ", options: { bold: true, color: C.brandDeep } },
          { text: "장소를 찾아 주는 서비스는 이미 많습니다. 없는 것은 여러 명이 각자 다른 곳에서 출발할 때 공평한 곳을 함께 고르는 절차입니다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 5.5, w: W - M * 2 - 0.6, h: 0.62, fontSize: 12.5, lineSpacing: 19 });
  foot(s, 4);
  s.addNotes("이 주제를 고른 계기입니다. 저희도 실제로 겪었고, 지금도 겪고 있습니다.");
}

// ══════════════ 5. 기존 방식의 한계 ══════════════
{
  const s = p.addSlide(); head(s, "지금은 이렇게 정합니다", "세 가지가 다 안 되고 있습니다");
  const items = [
    ["💬", "단톡방 눈대중", "누구도 계산하지 않고 “대충 중간”으로 정합니다. 결국 말 센 사람 근처나 늘 가던 곳으로 갑니다.", "공평한지 아무도 모른다"],
    ["🗺️", "지도 앱", "길찾기는 출발지 하나 → 도착지 하나입니다. 여러 출발지를 동시에 놓고 “어디가 제일 공평한가”를 물어볼 수가 없습니다.", "한 사람 기준으로만 본다"],
    ["🗳️", "그냥 투표", "각자 다른 이름으로 제안하니 “강남”·“강남역”·“역삼”이 서로 다른 후보가 됩니다. 표가 흩어져 1위가 안 나옵니다.", "투표해도 결론이 안 난다"],
  ];
  const cw = (W - M * 2 - 0.44) / 3;
  items.forEach(([ic, t, d, q], i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 1.7, w: cw, h: 3.0 });
    s.addText(ic, { x: x + 0.26, y: 1.9, w: 0.7, h: 0.5, fontSize: 24, margin: 0 });
    txt(s, t, { x: x + 0.26, y: 2.44, w: cw - 0.52, h: 0.32, fontSize: 14.5, bold: true, color: C.ink });
    txt(s, d, { x: x + 0.26, y: 2.82, w: cw - 0.52, h: 1.16, fontSize: 11.5, lineSpacing: 17 });
    s.addShape(p.ShapeType.roundRect, { x: x + 0.26, y: 4.06, w: cw - 0.52, h: 0.42, rectRadius: 0.09,
      fill: { color: C.badSoft }, line: { width: 0 } });
    txt(s, q, { x: x + 0.26, y: 4.06, w: cw - 0.52, h: 0.42, fontSize: 11, bold: true,
      color: C.badInk, align: "center", valign: "middle" });
  });
  card(s, { x: M, y: 4.94, w: W - M * 2, h: 1.0, fill: C.ice, line: "C7DBFF" });
  txt(s, [{ text: "모이머는 이 셋을 한 화면에서 해결합니다 — ", options: { bold: true, color: C.brandDeep } },
          { text: "여러 출발지를 동시에 계산하고, 공평함을 숫자로 보여주고, 같은 곳을 누른 사람을 하나로 묶습니다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 5.18, w: W - M * 2 - 0.6, h: 0.56, fontSize: 12.5, lineSpacing: 19 });
  foot(s, 5);
}

// ══════════════ 6. 해결 ══════════════
{
  const s = p.addSlide(); head(s, "해결", "출발지만 넣으면, 나머지는 지도를 누르는 것으로 끝납니다");
  const items = [
    ["① 공평함을 숫자로", "후보마다 가장 오래 걸리는 사람의 시간과 사람 간 편차를 계산해 보여줍니다. 평균이 아니라 최악을 봅니다 — 평균이면 3명 만족·1명 지옥인 곳이 1위가 됩니다.", "점수 = 최대 이동시간 + 편차 × 0.8"],
    ["② 지도 한 번 = 한 표", "“후보 등록 → 다시 투표”를 한 단계로 합쳤습니다. 누르면 가까운 지하철역으로 정리되고, 같은 곳을 누른 사람끼리 자동으로 하나로 합쳐집니다.", "“누른 것이 곧 한 표예요”"],
    ["③ 카톡을 대체하지 않습니다", "대화는 원래 쓰던 단톡방에서 합니다. 모이머는 링크 하나로 들어와 장소만 정하고 나갑니다. 새 메신저를 배우게 하지 않습니다.", "초대 링크 → 지도 탭 → 끝"],
  ];
  const cw = (W - M * 2 - 0.44) / 3;
  items.forEach(([t, d, q], i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 1.66, w: cw, h: 3.3 });
    chip(s, { x: x + 0.26, y: 1.9, text: t });
    txt(s, d, { x: x + 0.26, y: 2.4, w: cw - 0.52, h: 1.6, fontSize: 11.5, lineSpacing: 17 });
    s.addShape(p.ShapeType.roundRect, { x: x + 0.26, y: 4.16, w: cw - 0.52, h: 0.56, rectRadius: 0.09,
      fill: { color: C.ice }, line: { width: 0 } });
    txt(s, q, { x: x + 0.34, y: 4.16, w: cw - 0.68, h: 0.56, fontSize: 10.5, color: C.brandDeep,
      align: "center", valign: "middle", lineSpacing: 14 });
  });
  card(s, { x: M, y: 5.18, w: W - M * 2, h: 0.84, fill: C.white, flat: true });
  txt(s, [{ text: "회원가입 없이 홈에서 바로 맛볼 수 있습니다. ", options: { bold: true, color: C.ink } },
          { text: "출발지 2곳만 넣어도 중간지점이 나오고, 마음에 들면 그 출발지들을 그대로 들고 모임으로 넘어갑니다 — 가입은 그다음입니다.", options: {} }],
      { x: M + 0.3, y: 5.4, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  foot(s, 6);
}

// ══════════════ 7. 흐름 ══════════════
{
  const s = p.addSlide(); head(s, "사용 흐름", "초대 링크를 받은 순간부터 모임 당일까지");
  const steps = [
    ["STEP 1", "로그인 없이 맛보기", "출발지를 넣으면 즉시 중간지점 1곳. 회원가입도 모임 생성도 필요 없습니다."],
    ["STEP 2", "모임 만들기", "가장 중요한 질문 하나를 먼저 — 동네까지만 정할지, 가게까지 정할지."],
    ["STEP 3", "링크로 들어와 구경", "입력 폼이 아니라 지도가 먼저 뜹니다. 정보는 행동할 때 묻습니다."],
    ["STEP 4", "지도 한 번 = 한 표", "누른 자리가 가까운 역으로 정리되고 같은 곳끼리 합쳐집니다."],
    ["STEP 5", "방장이 지역 확정", "전원을 기다리지 않습니다. 후보가 부족하면 AI 추천 버튼."],
    ["STEP 6", "반경 700m 안 가게", "걸어갈 수 있는 거리로만. 카테고리 5종 · 후보 상한 5개."],
    ["STEP 7", "투표 → 결과", "확정되면 각자 폰에 자기 경로. 1.8초마다 자동 동기화."],
    ["STEP 8", "당일 · 다음 모임", "도착 신호등 → 지난 모임 → 같은 멤버로 재모임."],
  ];
  const cw = (W - M * 2 - 0.36 * 3) / 4, ch = 1.66;
  steps.forEach(([n, t, d], i) => {
    const x = M + (i % 4) * (cw + 0.36), y = 1.62 + Math.floor(i / 4) * (ch + 0.3);
    card(s, { x, y, w: cw, h: ch, fill: i < 4 ? C.panel : C.white });
    txt(s, n, { x: x + 0.22, y: y + 0.18, w: cw - 0.44, h: 0.22, fontSize: 9.5, bold: true, color: C.brand, charSpacing: 0.8 });
    txt(s, t, { x: x + 0.22, y: y + 0.44, w: cw - 0.44, h: 0.3, fontSize: 13, bold: true, color: C.ink });
    txt(s, d, { x: x + 0.22, y: y + 0.8, w: cw - 0.44, h: 0.74, fontSize: 10.5, lineSpacing: 15 });
    if (i % 4 !== 3) s.addText("›", { x: x + cw + 0.02, y: y + ch / 2 - 0.2, w: 0.32, h: 0.4,
      fontFace: F, fontSize: 18, bold: true, color: C.hair, align: "center", margin: 0 });
  });
  card(s, { x: M, y: 5.42, w: W - M * 2, h: 0.86, fill: C.ice, line: "C7DBFF", flat: true });
  txt(s, [{ text: "핵심은 STEP 4 입니다. ", options: { bold: true, color: C.brandDeep } },
          { text: "다른 서비스가 “검색해서 고르기”로 끝난다면, 모이머는 여기서 여러 사람의 의사를 한 화면에 모읍니다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 5.64, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  foot(s, 7);
}

// ══════════════ 8. 화면 ══════════════
{
  const s = p.addSlide(); head(s, "실제 화면", "지금 도는 화면");
  const iw = 1.98, ih = 4.24, y0 = 1.66;
  const shots = [
    ["01-홈.png", "① 홈 — 출발지 4곳 → 중간지점 ‘왕십리’"],
    ["02-핑.png", "② 지도를 누르면 확인 후 등록 (1인 1개)"],
    ["03-결과.png", "③ 결과 — 투표로 함께 정했어요"],
  ];
  shots.forEach(([f, cap], i) => {
    const x = M + i * (iw + 0.34);
    s.addShape(p.ShapeType.roundRect, { x: x - 0.06, y: y0 - 0.06, w: iw + 0.12, h: ih + 0.12,
      rectRadius: 0.12, fill: { color: C.white }, line: { color: C.hair, width: 1 }, shadow: shadow() });
    s.addImage({ data: IMG(f), x, y: y0, w: iw, h: ih });
    txt(s, cap, { x: x - 0.06, y: y0 + ih + 0.14, w: iw + 0.12, h: 0.4, fontSize: 10,
      color: C.faint, align: "center", lineSpacing: 14 });
  });
  const rx = M + 3 * (iw + 0.34) + 0.1, rw = W - M - rx;
  card(s, { x: rx, y: y0, w: rw, h: 2.0 });
  chip(s, { x: rx + 0.24, y: y0 + 0.22, text: "설계 11개 중 9개 완성", bg: C.okSoft, fg: C.okInk });
  txt(s, "홈 · 모임 탭 · 모임 생성 · 참여 · 지역(핑) · 지역 확정 · 지점 등록 · 지점 투표 · 결과 · 지난 모임 · 내정보 — 미구현은 0개이고, 2개가 부분 구현입니다.",
    { x: rx + 0.24, y: y0 + 0.72, w: rw - 0.48, h: 1.1, fontSize: 11.5, lineSpacing: 17 });
  card(s, { x: rx, y: y0 + 2.2, w: rw, h: 2.16, fill: C.ice, line: "C7DBFF" });
  txt(s, "발표 뒤 노트북 1대 + 폰 3대로 실제 시연합니다.",
    { x: rx + 0.24, y: y0 + 2.42, w: rw - 0.48, h: 0.5, fontSize: 12.5, bold: true, color: C.brandDeep, lineSpacing: 18 });
  txt(s, "한 사람이 지도를 누르면 나머지 3대 화면에 새로고침 없이 바로 뜹니다 — 그 장면이 이 서비스의 핵심입니다.",
    { x: rx + 0.24, y: y0 + 2.98, w: rw - 0.48, h: 1.1, fontSize: 11.5, color: C.brandDeep, lineSpacing: 17 });
  foot(s, 8);
  s.addNotes("사진의 지도 자리는 키가 없는 개발 환경이라 대체 화면입니다. 실 시연에서는 카카오 지도가 그대로 뜹니다 — 키 없이도 전체 흐름이 도는 것이 저희 규칙입니다.");
}

// ══════════════ 9. 핵심 ① ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ①", "지도를 누르는 것이 곧 한 표입니다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.64, w: cw, h: 1.48, fill: C.badSoft, line: "FBC9D5" });
  chip(s, { x: M + 0.24, y: 1.82, text: "흔한 방식", bg: C.white, fg: C.badInk });
  txt(s, "후보 등록 → 투표 시작 → 다시 투표 → 확정", { x: M + 0.24, y: 2.2, w: cw - 0.48, h: 0.3, fontSize: 12.5, bold: true, color: C.badInk });
  txt(s, "같은 사람에게 “여기 찍어” 다음에 “이제 투표해”를 또 시킵니다. 두 번째가 무엇을 위한 절차인지 설명하기 어렵습니다.",
    { x: M + 0.24, y: 2.52, w: cw - 0.48, h: 0.54, fontSize: 11, color: C.badInk, lineSpacing: 16 });
  card(s, { x: M, y: 3.28, w: cw, h: 1.48, fill: C.okSoft, line: "BBF7D0" });
  chip(s, { x: M + 0.24, y: 3.46, text: "모이머", bg: C.white, fg: C.okInk });
  txt(s, "지도를 누른다 → 많이 찍힌 곳이 1위 → 방장이 확정", { x: M + 0.24, y: 3.84, w: cw - 0.48, h: 0.3, fontSize: 12.5, bold: true, color: C.okInk });
  txt(s, "단계가 하나 줄었습니다. 참여자는 안 찍어도 되고, 방장은 전원을 기다리지 않고 넘어갈 수 있습니다.",
    { x: M + 0.24, y: 4.16, w: cw - 0.48, h: 0.54, fontSize: 11, color: C.okInk, lineSpacing: 16 });

  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.64, w: cw, h: 1.96 });
  txt(s, "표가 갈리지 않게 하는 두 가지", { x: rx + 0.24, y: 1.84, w: cw - 0.48, h: 0.3, fontSize: 14, bold: true, color: C.ink });
  s.addText([{ text: "가까운 지하철역으로 묶습니다 ", options: { bold: true, color: C.ink } },
             { text: "— 1.2km 안에 역이 있으면 그 역 이름이 되고 핀도 역 위로 옮겨갑니다. “강남구에서 만나자”는 약속이 안 되지만 “강남역에서 만나자”는 약속이 됩니다.", options: {} }],
    { x: rx + 0.24, y: 2.22, w: cw - 0.48, h: 0.7, fontFace: F, fontSize: 11, color: C.soft,
      bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });
  s.addText([{ text: "같은 곳은 하나로 합칩니다 ", options: { bold: true, color: C.ink } },
             { text: "— 같은 역을 누른 사람은 한 후보에 모입니다. 내 핑은 1개라 다른 곳을 누르면 그쪽으로 옮겨갑니다.", options: {} }],
    { x: rx + 0.24, y: 2.96, w: cw - 0.48, h: 0.56, fontFace: F, fontSize: 11, color: C.soft,
      bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });

  card(s, { x: rx, y: 3.76, w: cw, h: 2.0, fill: C.okSoft, line: "BBF7D0" });
  chip(s, { x: rx + 0.24, y: 3.96, text: "실제 검증 · 2026-08-11", bg: C.white, fg: C.okInk });
  s.addText([
    { text: "두 사람이 사당역 양쪽 200m 를 각각 눌렀을 때\n", options: {} },
    { text: "→ 후보 1개로 합쳐짐 · “사당역” · 2명 ✔\n", options: { bold: true } },
    { text: "역이 없는 동네(봉담)를 눌렀을 때\n", options: {} },
    { text: "→ “화성시 효행구” · 억지로 역을 붙이지 않음 ✔", options: { bold: true } },
  ], { x: rx + 0.24, y: 4.38, w: cw - 0.48, h: 1.2, fontFace: F, fontSize: 11, color: C.okInk, lineSpacing: 18, margin: 0 });
  foot(s, 9);
}

// ══════════════ 10. 핵심 ② ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ②", "“공평함”을 한 줄로 정의했습니다");
  card(s, { x: M, y: 1.6, w: W - M * 2, h: 1.05, fill: C.ice, line: "C7DBFF" });
  s.addText("점수 = 최대 이동시간  +  사람 간 편차 × 0.8",
    { x: M, y: 1.72, w: W - M * 2, h: 0.44, fontFace: MONO, fontSize: 20, bold: true,
      color: C.brandDeep, align: "center", margin: 0 });
  txt(s, "정의는 코드 한 곳에만 있습니다 — 화면마다 다르게 계산되는 일이 없습니다",
    { x: M, y: 2.2, w: W - M * 2, h: 0.3, fontSize: 11, color: C.brandDeep, align: "center" });
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 2.9, w: cw, h: 2.9 });
  txt(s, "왜 평균이 아니라 최악인가", { x: M + 0.24, y: 3.1, w: cw - 0.48, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  txt(s, "평균을 쓰면 3명은 5분, 1명은 90분인 곳이 1위가 됩니다. 모임에서 실제로 문제가 되는 건 가장 오래 걸리는 사람입니다.\n\n편차를 더한 것은 “다 같이 조금씩”을 “한 명만 많이”보다 낫게 보기 위해서입니다. 가중치 0.8 은 팀이 정한 값입니다.",
    { x: M + 0.24, y: 3.48, w: cw - 0.48, h: 2.1, fontSize: 11.5, lineSpacing: 17 });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 2.9, w: cw, h: 2.9, fill: C.white });
  txt(s, "계산식보다 “후보 목록”이 문제였습니다", { x: rx + 0.24, y: 3.1, w: cw - 0.48, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  txt(s, "노원+의정부 모임에 “종로3가”를 추천한 적이 있습니다. 계산은 정확했습니다. 손으로 고른 후보 28곳에 서울 북부가 통째로 비어 있던 것이 원인이었습니다.",
    { x: rx + 0.24, y: 3.48, w: cw - 0.48, h: 0.76, fontSize: 11.5, lineSpacing: 17 });
  card(s, { x: rx + 0.24, y: 4.32, w: cw - 0.48, h: 0.82, fill: C.panel, line: C.hair, flat: true });
  s.addText([
    { text: "종로3가   중심에서 14.8km · 최대 ", options: {} },
    { text: "98분\n", options: { color: C.bad, bold: true } },
    { text: "도봉산역  중심에서  0.9km · 최대 ", options: {} },
    { text: "32분", options: { color: C.ok, bold: true } },
    { text: "  ← 실제 정답", options: { color: C.faint } },
  ], { x: rx + 0.4, y: 4.44, w: cw - 0.8, h: 0.6, fontFace: MONO, fontSize: 10.5, color: C.soft, lineSpacing: 16, margin: 0 });
  txt(s, [{ text: "목록에 없으면 아무리 좋아도 1위가 될 수 없습니다. ", options: { bold: true, color: C.ink } },
          { text: "그래서 후보를 지도 API의 실제 지하철역으로 바꿨습니다.", options: {} }],
      { x: rx + 0.24, y: 5.24, w: cw - 0.48, h: 0.44, fontSize: 11.5, lineSpacing: 16 });
  foot(s, 10);
}

// ══════════════ 11. 핵심 ③ ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ③", "모르는 값을 아는 척하지 않습니다");
  txt(s, [{ text: "외부 API가 “82분 · 0원 · 환승 0회”라는 빈 응답을 줬는데 앱이 그대로 “실시간”이라고 적은 적이 있습니다. ", options: {} },
          { text: "그 뒤로 정직함을 코드가 강제하게 만들었습니다.", options: { bold: true, color: C.ink } }],
      { x: M, y: 1.42, w: W - M * 2, h: 0.6, fontSize: 12.5, lineSpacing: 19 });
  const items = [
    ["표시", "“실시간”을 없앴다", "출발 시각을 API에 보내지 않으므로 실제 API 값도 실시간이 아닙니다. “경로 기준” / “거리 추정” 두 단어로 통일."],
    ["단위", "사람 단위로 밝힌다", "실측 3건 + 추정 1건이 섞여 넷 다 “실시간”이던 적이 있습니다. 이제 한 명이라도 추정이 섞이면 배지가 바뀝니다."],
    ["별점", "가짜 별점을 지웠다", "데모용 4.3~4.7을 삭제하고 0 = “정보 없음”이라는 규약을 세웠습니다. 별이 없으면 안 그립니다."],
    ["경로", "직선은 직선이라 한다", "경로선이 직선 근사면 점선으로 그리고 그렇다고 적습니다. 결과 버튼도 “예약하기”가 아니라 “메뉴 보기”입니다."],
  ];
  const cw = (W - M * 2 - 0.3 * 3) / 4;
  items.forEach(([tag, t, d], i) => {
    const x = M + i * (cw + 0.3);
    card(s, { x, y: 2.02, w: cw, h: 2.5 });
    chip(s, { x: x + 0.22, y: 2.24, text: tag, bg: C.warnSoft, fg: C.warnInk });
    txt(s, t, { x: x + 0.22, y: 2.7, w: cw - 0.44, h: 0.6, fontSize: 13, bold: true, color: C.ink, lineSpacing: 18 });
    txt(s, d, { x: x + 0.22, y: 3.34, w: cw - 0.44, h: 1.06, fontSize: 10.5, lineSpacing: 15 });
  });
  card(s, { x: M, y: 4.76, w: W - M * 2, h: 1.28, fill: C.okSoft, line: "BBF7D0" });
  txt(s, [{ text: "API 키가 하나도 없어도 전체 흐름이 끝까지 돕니다. ", options: { bold: true, color: C.okInk } },
          { text: "외부 API 4종 모두 대체 동작이 있어 팀원이 키 없이 개발·시연할 수 있습니다. 다만 대체 동작으로 나온 값은 절대 실제인 척하지 않습니다 — 이 둘이 같이 지켜져야 의미가 있습니다.", options: { color: C.okInk } }],
      { x: M + 0.3, y: 5.02, w: W - M * 2 - 0.6, h: 0.8, fontSize: 12.5, lineSpacing: 19 });
  foot(s, 11);
}

// ══════════════ 12. 현황 ══════════════
{
  const s = p.addSlide(); head(s, "지금까지 만든 것", "중간발표 시점 현황");
  const stats = [
    ["9 / 11", "설계 화면 중 완성", "부분 2 · 미구현 0"],
    ["78", "브라우저 자동 테스트", "조건 검사 305개"],
    ["4대", "기기 동시 리허설", "자동 판정 15개 통과"],
    ["18,289", "코드 줄 수", "소스 파일 92개"],
  ];
  const sw = (W - M * 2 - 0.3 * 3) / 4;
  stats.forEach(([n, l, sub], i) => {
    const x = M + i * (sw + 0.3);
    card(s, { x, y: 1.62, w: sw, h: 1.4, fill: C.ice, line: "C7DBFF" });
    s.addText(n, { x: x + 0.24, y: 1.8, w: sw - 0.48, h: 0.54, fontFace: F, fontSize: 26,
      bold: true, color: C.brandDeep, margin: 0 });
    txt(s, l, { x: x + 0.24, y: 2.38, w: sw - 0.48, h: 0.26, fontSize: 11, bold: true, color: C.ink });
    txt(s, sub, { x: x + 0.24, y: 2.64, w: sw - 0.48, h: 0.26, fontSize: 9.5, color: C.faint });
  });
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 3.22, w: cw, h: 2.6, fill: C.okSoft, line: "BBF7D0" });
  txt(s, "되는 것", { x: M + 0.26, y: 3.42, w: 2, h: 0.3, fontSize: 14, bold: true, color: C.okInk });
  [["모임 생성 → 초대 링크 → 참여 → 지역 투표 → 확정 → 가게 투표 → 결과 ", "전 구간 완주"],
   ["4명이 ", "동시에 눌러도 표가 유실되지 않음 (실기기 4대 검증)"],
   ["지도·경로 API 키가 ", "없어도 전체 흐름 동작"],
   ["모임 당일 도착 신호등 · 지난 모임 · ", "같은 멤버로 재모임"]].forEach(([a, b], i) => {
    s.addText([{ text: a, options: {} }, { text: b, options: { bold: true } }],
      { x: M + 0.26, y: 3.82 + i * 0.48, w: cw - 0.52, h: 0.44, fontFace: F, fontSize: 11,
        color: C.okInk, bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 3.22, w: cw, h: 2.6, fill: C.warnSoft, line: "FDE68A" });
  txt(s, "아직인 것", { x: rx + 0.26, y: 3.42, w: 2, h: 0.3, fontSize: 14, bold: true, color: C.warnInk });
  [["‘카카오톡 알리기’가 ", "결과 화면 한 곳에만 (이벤트마다 상시화 필요)"],
   ["모임 생성 시 ", "카카오 로그인 필수화 미적용 — 지금은 이름만 있으면 생성"],
   ["이동수단 2종 → ", "4종 확장은 최종발표 이후"],
   ["안드로이드 앱 포장", "(PWA → APK) 리허설"]].forEach(([a, b], i) => {
    s.addText([{ text: a, options: {} }, { text: b, options: { bold: true } }],
      { x: rx + 0.26, y: 3.82 + i * 0.48, w: cw - 0.52, h: 0.44, fontFace: F, fontSize: 11,
        color: C.warnInk, bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  foot(s, 12);
}

// ══════════════ 13. 앞으로 ══════════════
{
  const s = p.addSlide(); head(s, "앞으로", "최종발표 8/21(금) 까지 일주일");
  const cw = (W - M * 2 - 0.34 * 2) / 3;
  const cols = [
    ["이번 주 · 반드시", C.badSoft, "FBC9D5", C.badInk,
      [["발표장 환경에서 지도·로그인 키 등록", "노트북 IP가 바뀌면 둘 다 무효가 됩니다"],
       ["실기기 4대로 사람 손으로 완주", "자동 리허설은 통과 — 실제 터치·네트워크는 다릅니다"]]],
    ["기능 마무리", C.warnSoft, "FDE68A", C.warnInk,
      [["카카오톡 알리기 상시화", "지역 확정·투표 시작 때도 단톡방에 알림"],
       ["모임 생성 시 로그인 필수화", ""],
       ["AI 추천을 ‘팔레트’로", "추천은 제안이지 결정이 아니므로"]]],
    ["최종발표 목표", C.panel, C.hair, C.soft,
      [["설계 화면 11/11 완성", ""],
       ["안드로이드 APK 로 포장해 시연", "폰에 설치된 상태로"],
       ["버전 규칙상 그날 1.0.0", "지금은 0.2.0 — 발표일에 딱 한 번 올립니다"]]],
  ];
  cols.forEach(([title, bg, ln, fg, rows], i) => {
    const x = M + i * (cw + 0.34);
    card(s, { x, y: 1.7, w: cw, h: 3.4, fill: bg, line: ln });
    chip(s, { x: x + 0.24, y: 1.92, text: title, bg: C.white, fg });
    rows.forEach(([a, b], k) => {
      s.addText([{ text: a + (b ? "\n" : ""), options: { bold: true, color: fg } },
                 { text: b, options: { color: fg, fontSize: 9.5 } }],
        { x: x + 0.24, y: 2.44 + k * 0.86, w: cw - 0.48, h: 0.8, fontFace: F, fontSize: 11,
          bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
    });
  });
  card(s, { x: M, y: 5.3, w: W - M * 2, h: 0.78, fill: C.white, flat: true });
  s.addText([
    { text: "오늘  중간발표 8/14 (금)", options: { bold: true, color: C.ink } },
    { text: "     ──────────  일주일  ──────────     ", options: { color: C.faint } },
    { text: "최종발표 8/21 (금) · v1.0.0", options: { bold: true, color: C.ok } },
  ], { x: M + 0.3, y: 5.5, w: W - M * 2 - 0.6, h: 0.4, fontFace: F, fontSize: 12.5,
       align: "center", valign: "middle", margin: 0 });
  foot(s, 13);
}

// ══════════════ 14. 마무리 ══════════════
{
  const s = p.addSlide(); coverBg(s);
  s.addText("감사합니다", { x: 0, y: 1.9, w: W, h: 0.4, fontFace: F, fontSize: 13, bold: true,
    color: "A8C6FF", align: "center", charSpacing: 1.5 });
  s.addText("“어디서 만날까?”에 답을 내는 데 3분", { x: 0, y: 2.45, w: W, h: 0.9,
    fontFace: F, fontSize: 36, bold: true, color: C.white, align: "center" });
  s.addText("출발지를 넣고 · 지도를 한 번 누르고 · 방장이 확정한다.\n그 사이의 모든 계산과 합의 절차를 모이머가 맡습니다.",
    { x: 0, y: 3.5, w: W, h: 0.9, fontFace: F, fontSize: 15, color: "D6E4FF", align: "center", lineSpacing: 26 });
  let cx = W / 2 - 2.1;
  for (const t of ["지금 바로 시연 가능합니다", "질문 환영"]) {
    const w = 0.135 * t.length + 0.5;
    s.addShape(p.ShapeType.roundRect, { x: cx, y: 4.5, w, h: 0.36, rectRadius: 0.18,
      fill: { color: C.white, transparency: 82 }, line: { width: 0 } });
    s.addText(t, { x: cx, y: 4.5, w, h: 0.36, fontFace: F, fontSize: 10.5, bold: true,
      color: C.white, align: "center", valign: "middle", margin: 0 });
    cx += w + 0.18;
  }
  s.addText("브레인 스파크 · 최병현 · 김유환 · 양성은 · 신동원   |   멘토 최종원\n기술 상세는 뒤에 부록으로 준비했습니다 — 질문 주시면 그쪽을 보여드리겠습니다",
    { x: 0, y: 5.3, w: W, h: 0.7, fontFace: F, fontSize: 11, color: "7A9AD8", align: "center", lineSpacing: 19 });
  s.addNotes("여기까지가 본편입니다. 질문 주시면 뒤의 부록에서 기술 구조·검증 방식·겪은 문제들을 보여드리겠습니다.");
}

// ══════════════ 15. 부록 표지 ══════════════
{
  const s = p.addSlide();
  s.addText("부록 · Appendix", { x: 0, y: 2.3, w: W, h: 0.36, fontFace: F, fontSize: 13,
    bold: true, color: C.brand, align: "center", charSpacing: 1.5 });
  s.addText("기술 상세", { x: 0, y: 2.76, w: W, h: 0.72, fontFace: F, fontSize: 36,
    bold: true, color: C.ink, align: "center" });
  s.addText("본편에서는 무엇을 왜 만들었는지를 말씀드렸습니다.\n여기서부터는 어떻게 만들었고 어떻게 검증했는지입니다 — 질문 주시면 펼치겠습니다.",
    { x: 0, y: 3.6, w: W, h: 0.8, fontFace: F, fontSize: 14, color: C.soft, align: "center", lineSpacing: 24 });
  let cx = M + 1.3;
  for (const t of ["16. 기술 구조", "17. 검증 체계", "18·19. 겪은 문제와 해결", "20. 피드백 반영 · 한계"]) {
    const w = 0.135 * t.length + 0.5;
    s.addShape(p.ShapeType.roundRect, { x: cx, y: 4.66, w, h: 0.36, rectRadius: 0.18,
      fill: { color: C.white }, line: { color: C.hair2, width: 1 } });
    s.addText(t, { x: cx, y: 4.66, w, h: 0.36, fontFace: F, fontSize: 10.5, bold: true,
      color: C.soft, align: "center", valign: "middle", margin: 0 });
    cx += w + 0.2;
  }
  foot(s, 15, true);
}

// ══════════════ 16. 기술 구조 ══════════════
{
  const s = p.addSlide(); head(s, "부록 · 기술 구조", "단순하게 — 대신 규칙을 지킵니다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.62, w: cw, h: 3.0 });
  txt(s, "스택", { x: M + 0.26, y: 1.8, w: 2, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  [["화면", "Next.js 14 App Router · TypeScript · 순수 CSS"],
   ["상태", "useState + 1.8초 폴링 (상태관리 라이브러리 없음)"],
   ["서버", "Next API Routes · 창구 1곳으로 동작 29종"],
   ["DB", "Neon PostgreSQL · 키 없으면 인메모리로 자동 전환"],
   ["외부", "카카오맵/로컬 · ODsay(대중교통) · TMAP(자차)"],
   ["배포", "PWA → 안드로이드 APK (웹앱이 그대로 앱이 됩니다)"]].forEach(([k, v], i) => {
    const y = 2.2 + i * 0.4;
    txt(s, k, { x: M + 0.26, y, w: 0.72, h: 0.3, fontSize: 11, bold: true, color: C.ink });
    txt(s, v, { x: M + 1.04, y, w: cw - 1.3, h: 0.3, fontSize: 11 });
    if (i < 5) s.addShape(p.ShapeType.line, { x: M + 0.26, y: y + 0.33, w: cw - 0.52, h: 0,
      line: { color: C.hair, width: 0.75 } });
  });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.62, w: cw, h: 3.0 });
  txt(s, "지켜야 살아남는 규칙", { x: rx + 0.26, y: 1.8, w: 3, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  [["화면은 DB를 직접 부르지 않는다", "항상 서버 창구를 거친다"],
   ["저장 단위를 쪼갠다", "모임 / 참가자 / 표 한 장 — 한 행에 담으면 동시 투표에 표가 사라진다"],
   ["실제 성공값만 캐시한다", "폴백을 캐시하면 나중에 키를 넣어도 계속 가짜가 나온다"],
   ["만드는 중인 기능은 스위치 뒤에", "절반만 된 상태로 합쳐도 남의 화면이 안 깨진다"]].forEach(([t, d], i) => {
    s.addText([{ text: t + " ", options: { bold: true, color: C.ink } }, { text: "— " + d, options: {} }],
      { x: rx + 0.26, y: 2.24 + i * 0.62, w: cw - 0.52, h: 0.56, fontFace: F, fontSize: 11,
        color: C.soft, bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });
  });
  card(s, { x: M, y: 4.8, w: W - M * 2, h: 1.24, fill: C.white, flat: true });
  txt(s, [{ text: "팀 협업 — ", options: { bold: true, color: C.ink } },
          { text: "공용 파일 10개는 통합 담당자 소유(GitHub이 리뷰를 강제). 한 파일 400줄 상한. 기능 스위치는 상수가 아니라 환경변수로 — 브랜치마다 값이 달라지면 합칠 때마다 그 줄에서 충돌납니다.", options: {} }],
      { x: M + 0.3, y: 5.04, w: W - M * 2 - 0.6, h: 0.8, fontSize: 12, lineSpacing: 18 });
  foot(s, 16, true);
}

// ══════════════ 17. 검증 ══════════════
{
  const s = p.addSlide(); head(s, "부록 · 검증", "“빌드가 통과했다”를 믿지 않습니다");
  card(s, { x: M, y: 1.5, w: W - M * 2, h: 0.86, fill: C.badSoft, line: "FBC9D5", flat: true });
  txt(s, [{ text: "타입검사도 빌드도 통과했는데 모임 화면이 통째로 하얗게 뜬 적이 있습니다. ", options: { bold: true, color: C.badInk } },
          { text: "그 사고 하나가 저희 검증 원칙 “눈 · 버튼 · 로그 3관점”을 만들었습니다.", options: { color: C.badInk } }],
      { x: M + 0.3, y: 1.7, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  const layers = [
    ["1층", "커밋 전 관문", "타입검사 → 빌드 → 실제 브라우저로 클릭. 개발 서버가 아니라 빌드 결과물을 띄웁니다.", "테스트 78개 · 조건 검사 305개"],
    ["2층", "GitHub CI", "PR마다 스위치 끈 판 / 켠 판 2벌. 안 돌려보는 기능은 “켤 수 있어 보이는 죽은 코드”입니다. 키를 일부러 안 넣습니다.", "PR 1건당 테스트 156회 실행"],
    ["3층", "4대 기기 리허설", "브라우저 4개를 독립된 기기로 띄워 발표 시나리오를 통째로 리허설. “4명이 각자 등록됐는가”를 셉니다.", "자동 판정 15개 · 스크린샷 16장"],
  ];
  const cw = (W - M * 2 - 0.34 * 2) / 3;
  layers.forEach(([n, t, d, q], i) => {
    const x = M + i * (cw + 0.34);
    card(s, { x, y: 2.52, w: cw, h: 2.42 });
    chip(s, { x: x + 0.24, y: 2.72, text: n });
    txt(s, t, { x: x + 0.24, y: 3.14, w: cw - 0.48, h: 0.32, fontSize: 14, bold: true, color: C.ink });
    txt(s, d, { x: x + 0.24, y: 3.5, w: cw - 0.48, h: 0.9, fontSize: 11, lineSpacing: 16 });
    s.addShape(p.ShapeType.roundRect, { x: x + 0.24, y: 4.42, w: cw - 0.48, h: 0.36, rectRadius: 0.08,
      fill: { color: C.ice }, line: { width: 0 } });
    txt(s, q, { x: x + 0.24, y: 4.42, w: cw - 0.48, h: 0.36, fontSize: 10, bold: true,
      color: C.brandDeep, align: "center", valign: "middle" });
  });
  const hw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 5.18, w: hw, h: 0.92, fill: C.okSoft, line: "BBF7D0", flat: true });
  txt(s, [{ text: "그 검증이 정말 잡는지도 확인했습니다. ", options: { bold: true, color: C.okInk } },
          { text: "일부러 화면을 깨뜨리고 돌린 출력이 문서에 남아 있습니다 — “빌드 통과 / 브라우저 테스트만 실패”", options: { color: C.okInk } }],
      { x: M + 0.26, y: 5.34, w: hw - 0.52, h: 0.6, fontSize: 10.5, lineSpacing: 15 });
  card(s, { x: M + hw + 0.34, y: 5.18, w: hw, h: 0.92, flat: true });
  txt(s, [{ text: "설계서가 곧 테스트 목록입니다. ", options: { bold: true, color: C.ink } },
          { text: "설계 문서의 조항 번호를 테스트 이름에 그대로 달았습니다 — “§4-⑤ 정원 8명, 9번째는 입장 거부”", options: {} }],
      { x: M + hw + 0.6, y: 5.34, w: hw - 0.52, h: 0.6, fontSize: 10.5, lineSpacing: 15 });
  foot(s, 17, true);
}

// ══════════════ 18~19. 사건 ══════════════
const incidents = [
  [["4명이 동시에 투표하면 표가 조용히 사라졌다",
    "두 사람이 같은 순간에 투표하면 나중에 저장된 쪽이 앞선 쪽을 통째로 덮어썼습니다.",
    "모임 정보를 DB 한 행에 통째로 담았습니다.",
    "저장 단위를 모임 / 참가자 / 표 한 장 셋으로 쪼개고 “1인 1표”를 DB 기본키가 강제하게 했습니다. 테스트가 전부 “한 명이 순서대로”만 봤다는 것도 드러나 4명이 동시에 쏘는 테스트를 따로 만들었습니다."],
   ["지도가 안 뜨는 팀원 폰에서는 참여 자체가 막다른 길",
    "지도 SDK 로드가 실패한 기기에서는 “지도를 탭해 핑 찍기”가 불가능해 참여할 방법이 아예 없었습니다.",
    "서버가 후보를 자동으로 깔아 줘서 그 사실이 가려져 있었습니다.",
    "대체 지도에서 누른 자리를 좌표로 되돌리는 역함수를 만들어 SDK 없이도 핑을 찍게 했습니다."],
   ["늦게 들어온 사람만 계속 “이동시간 없음”",
    "리허설에서 4대로 돌리니 늦게 합류한 사람의 계산이 끝나지 않았습니다.",
    "유료 API를 아끼려 250ms 간격 대기열을 뒀는데 기기마다 재계산을 요청했습니다 (후보3 × 인원4 × 기기4 = 48건 → 12초 이상).",
    "같은 구간은 한 번만 계산해 결과를 같이 쓰고, 재계산 요청은 방장 화면만 보냅니다. 이 버그는 브라우저 4개를 동시에 띄워야만 재현됐습니다."]],
  [["빌드도 타입검사도 통과했는데 화면이 안 그려졌다",
    "모임 상세 화면이 하얗게 떴습니다. 자동 검사는 둘 다 “이상 없음”이었습니다.",
    "React 훅을 조건부 return 아래에 뒀습니다. 문법도 타입도 맞지만 화면이 안 나옵니다.",
    "규칙을 문서 3곳에 못 박고 도구가 잡게 했습니다. 실제 브라우저 테스트를 커밋 관문에 넣고, 일부러 깨뜨려 그 테스트가 잡는 것까지 확인했습니다."],
   ["한 명이 멀면 중간지점이 충북 산속으로 갔다",
    "서울 7명 + 부산 1명으로 계산하니 중간지점이 서울에서 41km 남쪽 충북 산속으로 잡혔습니다.",
    "좌표를 평균 낸 무게중심을 썼습니다. 평균은 거리의 제곱 합을 줄여 멀리 있는 한 명의 영향이 과도해집니다.",
    "거리의 합을 최소화하는 기하 중앙값으로 바꿔 서울 2km 지점. 중간지점은 답이 아니라 “이 근처 역을 찾아 달라”는 검색 중심이라 더 치명적이었습니다."],
   ["같은 역인데 후보가 둘로 갈릴 뻔했다",
    "지도 API는 같은 역을 노선마다 따로 줍니다 — “사당역 2호선” / “사당역 4호선”.",
    "후보 병합은 이름 일치로 판정하므로 그대로 두면 표를 모으려던 기능이 표를 쪼갭니다.",
    "노선 꼬리를 떼는 정리를 넣고, 키가 있는 기계에서만 검증되는 계약이라 전용 점검 스크립트를 따로 만들어 확인했습니다."]],
];
incidents.forEach((set, k) => {
  const s = p.addSlide();
  head(s, `부록 · 겪은 문제 → 해결 (${k + 1}/2)`,
    k === 0 ? "버그가 규칙을 만들었습니다" : "“기능이 되는가”와 “여럿이 써도 되는가”는 다른 질문");
  set.forEach(([t, what, cause, fix], i) => {
    const y = 1.62 + i * 1.55;
    card(s, { x: M, y, w: W - M * 2, h: 1.36 });
    s.addShape(p.ShapeType.roundRect, { x: M + 0.26, y: y + 0.22, w: 0.34, h: 0.34, rectRadius: 0.1,
      fill: { color: C.badSoft }, line: { width: 0 } });
    s.addText("!", { x: M + 0.26, y: y + 0.22, w: 0.34, h: 0.34, fontFace: F, fontSize: 13,
      bold: true, color: C.bad, align: "center", valign: "middle", margin: 0 });
    txt(s, t, { x: M + 0.74, y: y + 0.2, w: W - M * 2 - 1.0, h: 0.32, fontSize: 14, bold: true, color: C.ink });
    s.addText([
      { text: what + "  ", options: {} },
      { text: "원인 — ", options: { bold: true, color: C.ink } },
      { text: cause + "  ", options: {} },
      { text: "해결 — ", options: { bold: true, color: C.ok } },
      { text: fix, options: {} },
    ], { x: M + 0.74, y: y + 0.58, w: W - M * 2 - 1.0, h: 0.68, fontFace: F, fontSize: 11,
         color: C.soft, lineSpacing: 16, margin: 0 });
  });
  foot(s, 18 + k, true);
});

// ══════════════ 20. 피드백 · 한계 ══════════════
{
  const s = p.addSlide(); head(s, "부록 · 피드백 반영과 한계", "지적받은 것 · 아직 못 한 것");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.64, w: cw, h: 3.7 });
  chip(s, { x: M + 0.26, y: 1.86, text: "멘토링 8/6 반영", bg: C.okSoft, fg: C.okInk });
  [["화면 역할 분리", "“누가 무엇을 할 수 있는가”를 표 한 곳으로 (8개 파일 39군데 → 1곳)"],
   ["핑 = 투표 통합", "지역이 한 칸으로 줄었습니다"],
   ["지하철역 묶기", "스위치로 제공 · 실 키 검증 완료(8/11)"],
   ["참여 순서", "링크를 열면 지도가 먼저 · 누를 때 정보 수집"],
   ["결과에서 안 끝나게", "되돌리기 / 재투표"],
   ["AI는 버튼으로", "자동 채움 철거 — 사람이 찍은 핑과 방장 버튼으로만"]].forEach(([k2, v], i) => {
    const y = 2.34 + i * 0.48;
    txt(s, k2, { x: M + 0.26, y, w: 1.9, h: 0.4, fontSize: 11, bold: true, color: C.ink, lineSpacing: 15 });
    txt(s, v, { x: M + 2.2, y, w: cw - 2.46, h: 0.4, fontSize: 10.5, lineSpacing: 15 });
    if (i < 5) s.addShape(p.ShapeType.line, { x: M + 0.26, y: y + 0.42, w: cw - 0.52, h: 0,
      line: { color: C.hair, width: 0.75 } });
  });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.64, w: cw, h: 3.7, fill: C.warnSoft, line: "FDE68A" });
  chip(s, { x: rx + 0.26, y: 1.86, text: "솔직한 한계", bg: C.white, fg: C.warnInk });
  [["실환경 검증이 덜 끝났습니다.", " 개발 환경에는 키가 없어 이동시간이 전부 “거리 추정”으로 나옵니다. 키가 있는 기계에서만 확인되는 계약도 있어 자동 검사가 대신 지켜 주지 못하는 부분이 남아 있습니다."],
   ["스스로 정한 규칙을 못 지킨 곳이 있습니다.", " 한 파일 400줄 상한을 정했는데 8개 파일이 이를 넘었습니다(가장 큰 것 1,799줄)."],
   ["기록을 남기는 규칙은 지켰지만 갱신하는 규칙은 놓쳤습니다.", " 작업 메모에 이미 끝난 항목이 아직 “안 함”으로 적혀 있는 것을 이번에 발견했습니다."]].forEach(([a, b], i) => {
    s.addText([{ text: a, options: { bold: true, color: C.warnInk } }, { text: b, options: { color: C.warnInk } }],
      { x: rx + 0.26, y: 2.34 + i * 0.92, w: cw - 0.52, h: 0.86, fontFace: F, fontSize: 10.5,
        bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  card(s, { x: M, y: 5.5, w: W - M * 2, h: 0.72, fill: C.white, flat: true });
  txt(s, [{ text: "이 슬라이드를 넣은 이유 — ", options: { bold: true, color: C.ink } },
          { text: "저희가 이 프로젝트에서 배운 가장 큰 것이 “되는 것처럼 보이는 것”과 “되는 것”은 다르다는 점이라, 발표 자료에서도 같은 기준을 지키는 것이 맞다고 판단했습니다.", options: {} }],
      { x: M + 0.3, y: 5.66, w: W - M * 2 - 0.6, h: 0.44, fontSize: 11.5 });
  foot(s, 20, true);
}

const OUT = path.join(REPO, "docs/발표_중간발표_v2.pptx");
p.writeFile({ fileName: OUT }).then(() => console.log("생성 완료:", OUT));
