// ─────────────────────────────────────────────────────────────
// scripts/build-deck-pptx.js — 중간발표 PPT(docs/발표_중간발표.pptx) 생성기
//
//   npm i -D pptxgenjs   (한 번만)
//   node scripts/build-deck-pptx.js
//
// 왜 스크립트로 만드나: 숫자와 문구가 바뀌면 **여기만 고치고 다시 돌린다.**
// 파워포인트에서 직접 고치면 다음에 갱신할 때 어디를 바꿨는지 알 수 없다.
// (HTML 슬라이드 `docs/발표_중간발표.html` 과 내용이 같다 — 둘 다 고칠 것)
// ⚠️ pptxgenjs 는 이 저장소의 의존성이 아니다(발표 자료 전용). 없으면 위 한 줄.
// ─────────────────────────────────────────────────────────────
const pptx = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");   // 저장소 루트 — 어느 기계에서 받아도 돈다
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

const p = new pptx();
p.layout = "LAYOUT_WIDE";              // 13.333 x 7.5
p.author = "AI 부트캠프 3팀";
p.title = "모이머 중간발표";
const W = 13.333, H = 7.5, M = 0.62;   // 여백

const shadow = () => ({ type: "outer", color: "8B98AE", blur: 10, offset: 2, angle: 90, opacity: 0.18 });

/** 제목 영역 — 모든 내용 슬라이드가 같은 자리에서 시작한다 */
function head(s, eyebrow, title) {
  s.addText(eyebrow, { x: M, y: 0.42, w: W - M * 2, h: 0.26, fontFace: F, fontSize: 11.5,
    bold: true, color: C.brand, charSpacing: 1.2 });
  s.addText(title, { x: M, y: 0.70, w: W - M * 2, h: 0.62, fontFace: F, fontSize: 30,
    bold: true, color: C.ink, valign: "top" });
}
/** 하단 쪽번호 */
function foot(s, n) {
  s.addText("모이머 중간발표 · 2026.08.11", { x: M, y: H - 0.52, w: 5, h: 0.26,
    fontFace: F, fontSize: 9.5, color: C.faint });
  s.addText(String(n).padStart(2, "0"), { x: W - M - 1, y: H - 0.52, w: 1, h: 0.26,
    fontFace: F, fontSize: 10, bold: true, color: C.soft, align: "right" });
}
/** 카드 — 이 덱의 모티프. 테두리 줄무늬 대신 은은한 배경 톤으로 구분한다 */
function card(s, o) {
  s.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.1,
    fill: { color: o.fill || C.panel },
    line: { color: o.line || C.hair, width: 1 },
    shadow: o.flat ? undefined : shadow(),
  });
}
/** 알약 라벨 */
function chip(s, o) {
  const w = o.w || (0.13 * o.text.length + 0.34);
  s.addShape(p.ShapeType.roundRect, { x: o.x, y: o.y, w, h: 0.28, rectRadius: 0.14,
    fill: { color: o.bg || C.ice }, line: { color: o.bg || C.ice, width: 0 } });
  s.addText(o.text, { x: o.x, y: o.y, w, h: 0.28, fontFace: F, fontSize: 9.5,
    bold: true, color: o.fg || C.brandDeep, align: "center", valign: "middle", margin: 0 });
  return w;
}
const txt = (s, t, o) => s.addText(t, Object.assign({ fontFace: F, fontSize: 12, color: C.soft,
  valign: "top", margin: 0, lineSpacing: 18 }, o));

// ══════════════ 1. 표지 ══════════════
{
  const s = p.addSlide();
  s.background = { color: C.navy };
  s.addShape(p.ShapeType.roundRect, { x: -2, y: 3.1, w: 11, h: 9, rectRadius: 0.5,
    fill: { color: C.navy2 }, line: { width: 0 }, rotate: -18 });
  s.addShape(p.ShapeType.roundRect, { x: 6.2, y: 4.6, w: 10, h: 8, rectRadius: 0.5,
    fill: { color: C.brand }, line: { width: 0 }, rotate: -18, transparency: 30 });
  s.addText("AI 부트캠프 · 3팀 중간발표", { x: M + 0.15, y: 1.55, w: 8, h: 0.32,
    fontFace: F, fontSize: 13, bold: true, color: "A8C6FF", charSpacing: 1.5 });
  s.addText("모이머", { x: M + 0.1, y: 1.95, w: 8, h: 1.1, fontFace: F, fontSize: 54,
    bold: true, color: C.white });
  s.addText("각자 다른 곳에서 출발하는 사람들이 아무도 혼자 크게 손해보지 않는\n만남 장소를, 지도를 한 번 누르는 것만으로 함께 정하는 서비스",
    { x: M + 0.15, y: 3.15, w: 8.4, h: 1.0, fontFace: F, fontSize: 16, color: "D6E4FF", lineSpacing: 27 });
  let cx = M + 0.15;
  for (const t of ["Next.js 14 · TypeScript", "Neon PostgreSQL", "카카오맵 · ODsay · TMAP"]) {
    const w = 0.135 * t.length + 0.42;
    s.addShape(p.ShapeType.roundRect, { x: cx, y: 4.35, w, h: 0.34, rectRadius: 0.17,
      fill: { color: C.white, transparency: 82 }, line: { width: 0 } });
    s.addText(t, { x: cx, y: 4.35, w, h: 0.34, fontFace: F, fontSize: 10.5, bold: true,
      color: C.white, align: "center", valign: "middle", margin: 0 });
    cx += w + 0.16;
  }
  s.addText("설계 화면 11개 중 9개 완성  ·  브라우저 자동 테스트 78개가 지킨다  ·  v0.2.0",
    { x: M + 0.15, y: 5.35, w: 9, h: 0.3, fontFace: F, fontSize: 12, color: "8FB0E8" });
  s.addNotes("모이머 중간발표입니다. 한 문장으로 하면 — 여럿이 각자 다른 곳에서 출발할 때, 아무도 혼자 크게 손해보지 않는 만남 장소를 함께 정하는 서비스입니다.");
}

// ══════════════ 2. 문제 ══════════════
{
  const s = p.addSlide(); head(s, "문제", "“어디서 만날까?” 가 제일 오래 걸린다");
  const items = [
    ["💬", "대화가 결론이 안 난다", "단톡방에서 “아무데나”와 “거기 멀지 않아?”가 반복된다. 정하는 사람만 피곤하고, 결국 늘 같은 곳으로 간다."],
    ["⚖️", "누군가는 항상 손해본다", "“중간”을 눈대중으로 잡으면 제일 멀리 사는 한 명이 매번 1시간을 더 쓴다. 그 사실이 숫자로 보이지 않는다."],
    ["🗳️", "투표해도 표가 흩어진다", "각자 다른 이름으로 제안하니 “강남”과 “강남역”과 “역삼”이 서로 다른 후보가 된다."],
  ];
  const cw = (W - M * 2 - 0.44) / 3;
  items.forEach(([ic, t, d], i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 1.62, w: cw, h: 2.35 });
    s.addText(ic, { x: x + 0.26, y: 1.82, w: 0.7, h: 0.5, fontSize: 24, margin: 0 });
    txt(s, t, { x: x + 0.26, y: 2.36, w: cw - 0.52, h: 0.34, fontSize: 14.5, bold: true, color: C.ink });
    txt(s, d, { x: x + 0.26, y: 2.76, w: cw - 0.52, h: 1.1, fontSize: 11.5, lineSpacing: 17 });
  });
  card(s, { x: M, y: 4.24, w: W - M * 2, h: 1.35, fill: C.ice, line: "C7DBFF" });
  txt(s, [{ text: "우리가 푸는 것은 “지도 검색”이 아니라 “합의”다. ", options: { bold: true, color: C.brandDeep } },
          { text: "장소를 찾아 주는 서비스는 이미 많다. 모이머는 여러 명이 각자 다른 곳에서 출발할 때 공평한 곳을 함께 고르는 절차를 만든다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 4.52, w: W - M * 2 - 0.6, h: 0.85, fontSize: 13.5, lineSpacing: 21 });
  foot(s, 2);
  s.addNotes("문제는 장소를 못 찾는 게 아니라, 여럿이 합의를 못 한다는 것입니다.");
}

// ══════════════ 3. 해결 ══════════════
{
  const s = p.addSlide(); head(s, "해결", "출발지만 넣으면, 나머지는 지도를 누르는 것으로 끝난다");
  const items = [
    ["① 공평함을 숫자로", "모든 후보에 대해 가장 오래 걸리는 사람의 시간과 사람 간 편차를 계산해 보여준다. 평균이 아니라 최악을 본다 — 평균이면 3명 만족·1명 지옥인 곳이 1위가 된다.", "점수 = 최대 이동시간 + 편차 × 0.8"],
    ["② 지도 한 번 = 한 표", "“후보 등록 → 다시 투표”를 한 단계로 합쳤다. 누르면 가까운 지하철역으로 정리되고, 같은 곳을 누른 사람끼리 자동으로 하나로 합쳐진다. 1인 1개.", "“누른 것이 곧 한 표예요”"],
    ["③ 카톡을 대체하지 않는다", "대화는 원래 쓰던 단톡방에서 한다. 모이머는 링크 하나로 들어와 장소만 정하고 나간다. 앱 안 채팅은 만들어 두고 꺼 뒀다.", "초대 링크 → 지도 탭 → 끝"],
  ];
  const cw = (W - M * 2 - 0.44) / 3;
  items.forEach(([t, d, q], i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 1.62, w: cw, h: 3.35 });
    chip(s, { x: x + 0.26, y: 1.86, text: t });
    txt(s, d, { x: x + 0.26, y: 2.36, w: cw - 0.52, h: 1.6, fontSize: 11.5, lineSpacing: 17 });
    s.addShape(p.ShapeType.roundRect, { x: x + 0.26, y: 4.16, w: cw - 0.52, h: 0.6, rectRadius: 0.09,
      fill: { color: C.ice }, line: { width: 0 } });
    txt(s, q, { x: x + 0.36, y: 4.24, w: cw - 0.72, h: 0.46, fontSize: 10.5, color: C.brandDeep,
      align: "center", valign: "middle", lineSpacing: 14 });
  });
  card(s, { x: M, y: 5.22, w: W - M * 2, h: 0.86, fill: C.white, flat: true });
  txt(s, [{ text: "회원가입 없이 홈에서 바로 맛볼 수 있다. ", options: { bold: true, color: C.ink } },
          { text: "출발지 2곳만 넣어도 중간지점이 나오고, 마음에 들면 그 출발지들을 그대로 들고 모임으로 넘어간다.", options: {} }],
      { x: M + 0.3, y: 5.46, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  foot(s, 3);
}

// ══════════════ 4. 전체 흐름 ══════════════
{
  const s = p.addSlide(); head(s, "전체 흐름", "사용자가 밟는 8단계");
  const steps = [
    ["STEP 1", "로그인 없이 맛보기", "출발지를 넣으면 즉시 중간지점 1곳. 회원가입도 모임 생성도 필요 없다."],
    ["STEP 2", "모임 만들기", "가장 중요한 질문 하나를 먼저 — 동네까지만 정할지, 가게까지 정할지."],
    ["STEP 3", "링크로 들어와 구경", "입력 폼이 아니라 지도가 먼저 뜬다. 정보는 행동할 때 묻는다."],
    ["STEP 4", "지도 한 번 = 한 표", "누른 자리가 가까운 역으로 정리되고 같은 곳끼리 합쳐진다."],
    ["STEP 5", "방장이 지역 확정", "전원을 기다리지 않는다. 후보가 부족하면 AI 추천 버튼."],
    ["STEP 6", "반경 700m 안 가게", "걸어갈 수 있는 거리로만. 카테고리 5종 · 후보 상한 5개."],
    ["STEP 7", "투표 → 결과", "확정되면 각자 폰에 자기 경로. 1.8초마다 자동 동기화."],
    ["STEP 8", "당일 · 다음 모임", "도착 신호등 → 지난 모임 → 같은 멤버로 재모임."],
  ];
  const cw = (W - M * 2 - 0.36 * 3) / 4, ch = 1.72;
  steps.forEach(([n, t, d], i) => {
    const x = M + (i % 4) * (cw + 0.36), y = 1.66 + Math.floor(i / 4) * (ch + 0.34);
    card(s, { x, y, w: cw, h: ch, fill: i < 4 ? C.panel : C.white });
    txt(s, n, { x: x + 0.22, y: y + 0.2, w: cw - 0.44, h: 0.22, fontSize: 9.5, bold: true,
      color: C.brand, charSpacing: 0.8 });
    txt(s, t, { x: x + 0.22, y: y + 0.46, w: cw - 0.44, h: 0.32, fontSize: 13, bold: true, color: C.ink });
    txt(s, d, { x: x + 0.22, y: y + 0.84, w: cw - 0.44, h: 0.76, fontSize: 10.5, lineSpacing: 15 });
    if (i % 4 !== 3) s.addText("›", { x: x + cw + 0.02, y: y + ch / 2 - 0.2, w: 0.32, h: 0.4,
      fontFace: F, fontSize: 18, bold: true, color: C.hair, align: "center", margin: 0 });
  });
  card(s, { x: M, y: 5.78, w: W - M * 2, h: 0.72, fill: C.ice, line: "C7DBFF", flat: true });
  txt(s, "화면 문구 그대로 —  “어디쯤에서 볼까요?”  ·  “누른 것이 곧 한 표예요”  ·  “구경 중이에요 — 누르면 참여까지 한 번에 끝나요”",
    { x: M + 0.28, y: 5.98, w: W - M * 2 - 0.56, h: 0.4, fontSize: 11.5, color: C.brandDeep });
  foot(s, 4);
}

// ══════════════ 5. 화면 ══════════════
{
  const s = p.addSlide(); head(s, "화면", "실제로 도는 화면");
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
    s.addImage({ data: IMG(f), x, y: y0, w: iw, h: ih, sizing: { type: "crop", w: iw, h: ih } });
    txt(s, cap, { x: x - 0.06, y: y0 + ih + 0.14, w: iw + 0.12, h: 0.4, fontSize: 10, color: C.faint,
      align: "center", lineSpacing: 14 });
  });
  const rx = M + 3 * (iw + 0.34) + 0.1, rw = W - M - rx;
  card(s, { x: rx, y: y0, w: rw, h: 2.0 });
  chip(s, { x: rx + 0.24, y: y0 + 0.22, text: "설계 11개 중 9개 완성", bg: C.okSoft, fg: C.okInk });
  txt(s, "홈 · 모임 탭 · 모임 생성 · 참여 · 지역(핑) · 지역 확정 · 지점 등록 · 지점 투표 · 결과 · 지난 모임 · 내정보 — 미구현은 0개이고, 2개가 부분 구현이다.",
    { x: rx + 0.24, y: y0 + 0.72, w: rw - 0.48, h: 1.1, fontSize: 11.5, lineSpacing: 17 });
  card(s, { x: rx, y: y0 + 2.2, w: rw, h: 2.16, fill: C.ice, line: "C7DBFF" });
  txt(s, "발표에서는 노트북 1대 + 팀원 폰 3대로 실제 시연합니다.",
    { x: rx + 0.24, y: y0 + 2.42, w: rw - 0.48, h: 0.5, fontSize: 12.5, bold: true, color: C.brandDeep, lineSpacing: 18 });
  txt(s, "한 사람이 지도를 누르면 나머지 3대 화면에 새로고침 없이 바로 뜹니다 — 그 장면이 이 서비스의 핵심입니다.",
    { x: rx + 0.24, y: y0 + 2.98, w: rw - 0.48, h: 1.1, fontSize: 11.5, color: C.brandDeep, lineSpacing: 17 });
  foot(s, 5);
  s.addNotes("이 사진은 지도 키가 없는 환경에서 찍은 것이라 지도 자리가 대체 화면입니다. 실 시연에서는 카카오 지도가 그대로 뜹니다 — 키 없이도 전체 흐름이 도는 것이 우리 규칙이고, 그 규칙 덕분에 팀원이 키 없이 개발할 수 있습니다. 발표 노트북에서 npm run shots 를 돌리면 실제 지도가 담긴 사진으로 바뀝니다.");
}

// ══════════════ 6. 핵심 ① ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ①", "지도를 누르는 것이 곧 한 표다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.62, w: cw, h: 1.42, fill: C.badSoft, line: "FBC9D5" });
  chip(s, { x: M + 0.24, y: 1.8, text: "이전", bg: C.white, fg: C.badInk });
  txt(s, "후보 등록 → 방장이 투표 시작 → 다시 투표 → 확정", { x: M + 0.24, y: 2.18, w: cw - 0.48, h: 0.3, fontSize: 12.5, bold: true, color: C.badInk });
  txt(s, "같은 사람에게 “여기 찍어” 다음에 “이제 투표해”를 또 시킨다. 두 번째가 무엇을 위한 절차인지 설명하기 어렵다.",
    { x: M + 0.24, y: 2.5, w: cw - 0.48, h: 0.5, fontSize: 11, color: C.badInk, lineSpacing: 16 });

  card(s, { x: M, y: 3.2, w: cw, h: 1.42, fill: C.okSoft, line: "BBF7D0" });
  chip(s, { x: M + 0.24, y: 3.38, text: "지금", bg: C.white, fg: C.okInk });
  txt(s, "지도를 누른다 → 많이 찍힌 곳이 1위 → 방장이 확정", { x: M + 0.24, y: 3.76, w: cw - 0.48, h: 0.3, fontSize: 12.5, bold: true, color: C.okInk });
  txt(s, "화면이 하나 줄었다. 참여자는 안 찍어도 되고, 방장은 전원을 기다리지 않고 넘어갈 수 있다.",
    { x: M + 0.24, y: 4.08, w: cw - 0.48, h: 0.5, fontSize: 11, color: C.okInk, lineSpacing: 16 });

  card(s, { x: M, y: 4.78, w: cw, h: 1.02, fill: C.ice, line: "C7DBFF", flat: true });
  txt(s, "멘토링 2026-08-06 §2 — “지역 투표 단계를 별도로 두지 않고 핑 등록 = 투표로 통합 가능. 많이 찍힌 곳이 자동으로 지역으로 선정되는 방식.”",
    { x: M + 0.24, y: 4.96, w: cw - 0.48, h: 0.7, fontSize: 10.5, color: C.brandDeep, lineSpacing: 15 });

  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.62, w: cw, h: 1.92 });
  txt(s, "표가 갈리지 않게 하는 두 가지", { x: rx + 0.24, y: 1.82, w: cw - 0.48, h: 0.3, fontSize: 14, bold: true, color: C.ink });
  s.addText([
    { text: "가까운 지하철역으로 묶는다 ", options: { bold: true, color: C.ink } },
    { text: "— 1.2km 안에 역이 있으면 그 역 이름이 되고 핀도 역 위로 옮겨간다. “강남구에서 만나자”는 약속이 안 되지만 “강남역에서 만나자”는 약속이 된다.", options: {} },
  ], { x: rx + 0.24, y: 2.2, w: cw - 0.48, h: 0.66, fontFace: F, fontSize: 11, color: C.soft, bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });
  s.addText([
    { text: "같은 곳은 하나로 합친다 ", options: { bold: true, color: C.ink } },
    { text: "— 같은 역을 누른 사람은 한 후보에 모인다. 내 핑은 1개라 다른 곳을 누르면 그쪽으로 옮겨간다.", options: {} },
  ], { x: rx + 0.24, y: 2.9, w: cw - 0.48, h: 0.54, fontFace: F, fontSize: 11, color: C.soft, bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });

  card(s, { x: rx, y: 3.7, w: cw, h: 2.1, fill: C.okSoft, line: "BBF7D0" });
  chip(s, { x: rx + 0.24, y: 3.9, text: "실 키 검증 통과 · 2026-08-11", bg: C.white, fg: C.okInk });
  s.addText([
    { text: "서쪽 37.477,126.979 → “사당역”\n동쪽 37.476,126.984 → “사당역”\n", options: {} },
    { text: "✔ 두 사람이 한 후보로 합쳐짐 — “사당역” · 2명\n", options: { bold: true } },
    { text: "봉담 37.212,126.970 → “화성시 효행구”\n", options: {} },
    { text: "✔ 역 없는 동네는 억지로 역을 붙이지 않음", options: { bold: true } },
  ], { x: rx + 0.24, y: 4.34, w: cw - 0.48, h: 1.3, fontFace: MONO, fontSize: 10.5,
       color: C.okInk, lineSpacing: 17, margin: 0 });
  foot(s, 6);
}

// ══════════════ 7. 핵심 ② ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ②", "“공평함”을 한 줄로 정의했다");
  card(s, { x: M, y: 1.6, w: W - M * 2, h: 1.05, fill: C.ice, line: "C7DBFF" });
  s.addText("점수 = 최대 이동시간  +  사람 간 편차 × 0.8",
    { x: M, y: 1.72, w: W - M * 2, h: 0.44, fontFace: MONO, fontSize: 20, bold: true,
      color: C.brandDeep, align: "center", margin: 0 });
  txt(s, "정의는 파일 한 곳에만 있다 — 화면마다 다르게 계산되는 일이 없다",
    { x: M, y: 2.2, w: W - M * 2, h: 0.3, fontSize: 11, color: C.brandDeep, align: "center" });

  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 2.86, w: cw, h: 1.42 });
  txt(s, "왜 평균이 아니라 최악인가", { x: M + 0.24, y: 3.04, w: cw - 0.48, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  txt(s, "평균을 쓰면 3명은 5분, 1명은 90분인 곳이 1위가 된다. 모임에서 실제로 문제가 되는 건 가장 오래 걸리는 사람이다. 편차를 더한 것은 “다 같이 조금씩”을 “한 명만 많이”보다 낫게 보기 위해서다.",
    { x: M + 0.24, y: 3.4, w: cw - 0.48, h: 0.8, fontSize: 11, lineSpacing: 16 });

  card(s, { x: M, y: 4.44, w: cw, h: 1.62 });
  txt(s, "한 명이 멀면 중심이 산속으로 간다", { x: M + 0.24, y: 4.62, w: cw - 0.48, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  txt(s, "좌표를 평균 내면 멀리 있는 한 명이 전체를 끌고 간다. 서울 7명 + 부산 1명에서 평균은 서울 41km 남쪽 충북 산속. 거리의 합을 최소화하는 기하 중앙값으로 바꾸니 서울 2km 지점.",
    { x: M + 0.24, y: 4.98, w: cw - 0.48, h: 0.98, fontSize: 11, lineSpacing: 16 });

  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 2.86, w: cw, h: 3.2, fill: C.white });
  txt(s, "계산식보다 “후보 목록”이 문제였다", { x: rx + 0.24, y: 3.04, w: cw - 0.48, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  txt(s, "노원+의정부 모임에 “종로3가”를 추천한 적이 있다. 계산은 정확했다. 손으로 고른 후보 28곳에 서울 북부가 통째로 비어 있었던 것이 원인이다.",
    { x: rx + 0.24, y: 3.4, w: cw - 0.48, h: 0.72, fontSize: 11, lineSpacing: 16 });
  card(s, { x: rx + 0.24, y: 4.2, w: cw - 0.48, h: 0.86, fill: C.panel, line: C.hair, flat: true });
  s.addText([
    { text: "종로3가   중심에서 14.8km · 최대 ", options: {} },
    { text: "98분\n", options: { color: C.bad, bold: true } },
    { text: "도봉산역  중심에서  0.9km · 최대 ", options: {} },
    { text: "32분", options: { color: C.ok, bold: true } },
    { text: "  ← 실제 정답", options: { color: C.faint } },
  ], { x: rx + 0.4, y: 4.34, w: cw - 0.8, h: 0.6, fontFace: MONO, fontSize: 10.5, color: C.soft, lineSpacing: 16, margin: 0 });
  txt(s, [{ text: "목록에 없으면 아무리 좋아도 1위가 될 수 없다. ", options: { bold: true, color: C.ink } },
          { text: "그래서 후보를 카카오 지하철역 검색으로 실시간 확보하고, 손으로 고른 28곳은 지우지 않고 폴백으로 강등했다.", options: {} }],
      { x: rx + 0.24, y: 5.18, w: cw - 0.48, h: 0.72, fontSize: 11, lineSpacing: 16 });
  foot(s, 7);
}

// ══════════════ 8. 핵심 ③ ══════════════
{
  const s = p.addSlide(); head(s, "핵심 기능 ③", "모르는 값을 아는 척하지 않는다");
  txt(s, [{ text: "외부 API가 “82분 · 0원 · 환승 0회”라는 빈 껍데기를 줬는데 앱이 그대로 “실시간”이라고 적은 적이 있다. ", options: {} },
          { text: "그 뒤로 정직함을 코드가 강제하게 만들었다.", options: { bold: true, color: C.ink } }],
      { x: M, y: 1.44, w: W - M * 2, h: 0.42, fontSize: 12.5 });
  const items = [
    ["표시", "“실시간”을 없앴다", "출발 시각을 API에 보내지 않으므로 실제 API 값도 실시간이 아니다. “경로 기준” / “거리 추정” 두 단어로 통일."],
    ["단위", "사람 단위로 밝힌다", "실측 3건 + 추정 1건이 섞여 넷 다 “실시간”이던 적이 있다. 이제 한 명이라도 추정이 섞이면 배지가 바뀐다."],
    ["별점", "가짜 별점을 지웠다", "데모용 4.3~4.7을 삭제하고 0 = “정보 없음”이라는 규약을 세웠다. 별이 없으면 안 그린다."],
    ["경로", "직선은 직선이라 한다", "지도의 경로선이 직선 근사면 점선으로 그리고 그렇다고 적는다. 결과 버튼도 “예약하기”가 아니라 “메뉴 보기”다."],
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
  txt(s, [{ text: "키가 하나도 없어도 전체 흐름이 끝까지 돈다. ", options: { bold: true, color: C.okInk } },
          { text: "외부 API 4종 모두 대체 동작을 갖고 있어 팀원은 키 없이 개발·시연할 수 있다. 다만 대체 동작으로 나온 값은 절대 실제인 척하지 않는다 — 이 두 가지가 같이 지켜져야 의미가 있다.", options: { color: C.okInk } }],
      { x: M + 0.3, y: 5.02, w: W - M * 2 - 0.6, h: 0.8, fontSize: 12.5, lineSpacing: 19 });
  foot(s, 8);
}

// ══════════════ 9. 기술 구조 ══════════════
{
  const s = p.addSlide(); head(s, "기술 구조", "단순하게 — 대신 규칙을 지킨다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.62, w: cw, h: 3.0 });
  txt(s, "스택", { x: M + 0.26, y: 1.8, w: 2, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  const rows = [
    ["화면", "Next.js 14 App Router · TypeScript · 순수 CSS"],
    ["상태", "useState + 1.8초 폴링 (상태관리 라이브러리 없음)"],
    ["서버", "Next API Routes · 창구 1곳으로 동작 29종"],
    ["DB", "Neon PostgreSQL · 키 없으면 인메모리로 자동 전환"],
    ["외부", "카카오맵/로컬 · ODsay(대중교통) · TMAP(자차)"],
    ["배포", "PWA → 안드로이드 APK (웹앱이 그대로 앱이 된다)"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 2.2 + i * 0.4;
    txt(s, k, { x: M + 0.26, y, w: 0.72, h: 0.3, fontSize: 11, bold: true, color: C.ink });
    txt(s, v, { x: M + 1.04, y, w: cw - 1.3, h: 0.3, fontSize: 11 });
    if (i < rows.length - 1) s.addShape(p.ShapeType.line, { x: M + 0.26, y: y + 0.33, w: cw - 0.52, h: 0,
      line: { color: C.hair, width: 0.75 } });
  });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.62, w: cw, h: 3.0 });
  txt(s, "지켜야 살아남는 규칙", { x: rx + 0.26, y: 1.8, w: 3, h: 0.3, fontSize: 13.5, bold: true, color: C.ink });
  const rules = [
    ["화면은 DB를 직접 부르지 않는다", "항상 서버 창구를 거친다"],
    ["저장 단위를 쪼갠다", "모임 / 참가자 / 표 한 장 — 한 행에 담으면 동시 투표에 표가 사라진다"],
    ["실제 성공값만 캐시한다", "폴백을 캐시하면 나중에 키를 넣어도 계속 가짜가 나온다"],
    ["만드는 중인 기능은 스위치 뒤에", "절반만 된 상태로 합쳐도 남의 화면이 안 깨진다"],
  ];
  rules.forEach(([t, d], i) => {
    const y = 2.24 + i * 0.62;
    s.addText([{ text: t + " ", options: { bold: true, color: C.ink } }, { text: "— " + d, options: {} }],
      { x: rx + 0.26, y, w: cw - 0.52, h: 0.56, fontFace: F, fontSize: 11, color: C.soft,
        bullet: { code: "2022" }, lineSpacing: 16, margin: 0 });
  });
  card(s, { x: M, y: 4.8, w: W - M * 2, h: 1.24, fill: C.white, flat: true });
  txt(s, [{ text: "팀 협업 — ", options: { bold: true, color: C.ink } },
          { text: "공용 파일 10개는 통합 담당자 소유(GitHub이 리뷰를 강제). 한 파일 400줄 상한. 기능 스위치는 상수가 아니라 환경변수로 — 브랜치마다 값이 달라지면 합칠 때마다 그 줄에서 충돌난다.", options: {} }],
      { x: M + 0.3, y: 5.04, w: W - M * 2 - 0.6, h: 0.8, fontSize: 12, lineSpacing: 18 });
  foot(s, 9);
}

// ══════════════ 10. 검증 ══════════════
{
  const s = p.addSlide(); head(s, "검증", "“빌드가 통과했다”를 믿지 않는다");
  card(s, { x: M, y: 1.5, w: W - M * 2, h: 0.86, fill: C.badSoft, line: "FBC9D5", flat: true });
  txt(s, [{ text: "타입검사도 빌드도 통과했는데 모임 화면이 통째로 하얗게 뜬 적이 있다. ", options: { bold: true, color: C.badInk } },
          { text: "그 사고 하나가 이 프로젝트의 검증 원칙 “눈 · 버튼 · 로그 3관점”을 만들었다.", options: { color: C.badInk } }],
      { x: M + 0.3, y: 1.7, w: W - M * 2 - 0.6, h: 0.5, fontSize: 12.5 });
  const layers = [
    ["1층", "npm run verify", "타입검사 → 빌드 → 실제 브라우저로 클릭. 커밋 전 관문. 개발 서버가 아니라 빌드 결과물을 띄운다.", "테스트 78개 · 조건 검사 305개"],
    ["2층", "GitHub CI", "PR마다 스위치 끈 판 / 켠 판 2벌. 안 돌려보는 기능은 “켤 수 있어 보이는 죽은 코드”다. 키를 일부러 안 넣는다.", "PR 1건당 테스트 156회 실행"],
    ["3층", "check:devices", "브라우저 4개를 독립된 기기로 띄워 발표 시나리오를 통째로 리허설. “4명이 각자 등록됐는가”를 센다.", "자동 판정 15개 · 스크린샷 16장"],
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
  txt(s, [{ text: "그 검증이 정말 잡는지도 확인했다. ", options: { bold: true, color: C.okInk } },
          { text: "일부러 화면을 깨뜨리고 돌린 출력이 문서에 남아 있다 — “빌드 통과 / 브라우저 테스트만 실패”", options: { color: C.okInk } }],
      { x: M + 0.26, y: 5.34, w: hw - 0.52, h: 0.6, fontSize: 10.5, lineSpacing: 15 });
  card(s, { x: M + hw + 0.34, y: 5.18, w: hw, h: 0.92, flat: true });
  txt(s, [{ text: "설계서가 곧 테스트 목록이다. ", options: { bold: true, color: C.ink } },
          { text: "설계 문서의 조항 번호를 테스트 이름에 그대로 달았다 — “§4-⑤ 정원 8명, 9번째는 입장 거부”", options: {} }],
      { x: M + hw + 0.6, y: 5.34, w: hw - 0.52, h: 0.6, fontSize: 10.5, lineSpacing: 15 });
  foot(s, 10);
}

// ══════════════ 11~12. 사건 ══════════════
const incidents = [
  [["4명이 동시에 투표하면 표가 조용히 사라졌다",
    "두 사람이 같은 순간에 투표하면 나중에 저장된 쪽이 앞선 쪽을 통째로 덮어썼다.",
    "모임 정보를 DB 한 행에 통째로 담았다.",
    "저장 단위를 모임 / 참가자 / 표 한 장 셋으로 쪼개고 “1인 1표”를 DB 기본키가 강제하게 했다. 테스트가 전부 “한 명이 순서대로”만 봤다는 것도 드러나 4명이 동시에 쏘는 테스트를 따로 만들었다."],
   ["지도가 안 뜨는 팀원 폰에서는 참여 자체가 막다른 길",
    "지도 SDK 로드가 실패한 기기에서는 “지도를 탭해 핑 찍기”가 불가능해 참여할 방법이 아예 없었다.",
    "서버가 후보를 자동으로 깔아 줘서 그 사실이 가려져 있었다.",
    "대체 지도에서 누른 자리를 좌표로 되돌리는 역함수를 만들어 SDK 없이도 핑을 찍게 했다."],
   ["늦게 들어온 사람만 계속 “이동시간 없음”",
    "리허설에서 4대로 돌리니 늦게 합류한 사람의 계산이 끝나지 않았다.",
    "유료 API를 아끼려 250ms 간격 대기열을 뒀는데 기기마다 재계산을 요청했다 (후보3 × 인원4 × 기기4 = 48건 → 12초 이상).",
    "같은 구간은 한 번만 계산해 결과를 같이 쓰고, 재계산 요청은 방장 화면만 보낸다. 이 버그는 브라우저 4개를 동시에 띄워야만 재현됐다."]],
  [["빌드도 타입검사도 통과했는데 화면이 안 그려졌다",
    "모임 상세 화면이 하얗게 떴다. 자동 검사는 둘 다 “이상 없음”이었다.",
    "React 훅을 조건부 return 아래에 뒀다. 문법도 타입도 맞지만 화면이 안 나온다.",
    "규칙을 문서 3곳에 못 박고 도구가 잡게 했다. 실제 브라우저 테스트를 커밋 관문에 넣고, 일부러 깨뜨려 그 테스트가 잡는 것까지 확인했다."],
   ["후보 상한에 걸려 거절당하면 내 핑이 사라졌다",
    "이번 주에 찾은 버그다. 거절당했는데 내 표만 증발했다.",
    "거절 경로는 저장을 하지 않는데, 인메모리 모드에서는 이미 손댄 데이터가 그대로 남았다.",
    "상한 검사를 데이터를 건드리기 전으로 옮겼다. 역 스냅을 켜면 후보가 잘게 갈려 이 경로를 실제로 밟기 때문에 지금 고쳐야 했다."],
   ["같은 역인데 후보가 둘로 갈릴 뻔했다",
    "카카오는 같은 역을 노선마다 따로 준다 — “사당역 2호선” / “사당역 4호선”.",
    "후보 병합은 이름 일치로 판정하므로 그대로 두면 표를 모으려던 기능이 표를 쪼갠다.",
    "노선 꼬리를 떼는 정리를 넣고, 키가 있는 기계에서만 검증되는 계약이라 전용 점검 스크립트를 따로 만들어 확인했다."]],
];
incidents.forEach((set, k) => {
  const s = p.addSlide();
  head(s, `겪은 문제 → 해결 (${k + 1}/2)`,
    k === 0 ? "버그가 규칙을 만들었다" : "“기능이 되는가”와 “여럿이 써도 되는가”는 다른 질문");
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
  foot(s, 11 + k);
});

// ══════════════ 13. 멘토링 반영 ══════════════
{
  const s = p.addSlide(); head(s, "멘토링 반영 · 2026-08-06", "지적받은 것을 되돌릴 수 있게 반영했다");
  const rows = [
    ["방장/참여자 화면이 섞여 있다", "“누가 무엇을 할 수 있는가”를 표 한 곳으로 모았다(그전엔 8개 파일 39군데). 참여자에게 방장 버튼은 비활성이 아니라 아예 없다.", "완료"],
    ["핑 등록 = 투표로 통합", "지역이 한 칸으로 줄었다. 표의 출처가 투표 행에서 핑 그 자체로 바뀌었다.", "완료"],
    ["핑을 시·군·구로 묶기 (또는 지하철역)", "기본은 시·군·구, 지하철역 묶기는 스위치로 제공. 실 키로 병합까지 확인 완료(2026-08-11).", "완료"],
    ["링크 진입 때 정보를 먼저 묻지 말 것", "링크를 열면 지도가 먼저 뜬다. 지도를 누르는 순간 참여와 핑이 한 번에 끝난다.", "완료"],
    ["결과 화면에서 끝나지 않게", "결과에서 되돌리기 / 재투표가 가능하다. 되돌리기는 표를 지키고, 재투표는 표만 지운다.", "완료"],
    ["AI는 버튼으로, 자동이 아니라", "서버가 후보를 자동으로 깔던 것을 철거했다. 후보는 사람이 찍은 핑과 방장 버튼으로만 생긴다.", "완료"],
    ["카카오톡 알리기", "지금은 결과 화면 한 곳에만 있다. 이벤트마다 상시화가 남았다.", "남음"],
  ];
  const y0 = 1.56, rh = 0.6;
  ["멘토 지적", "어떻게 반영했나", "상태"].forEach((h, i) => {
    const x = [M, M + 3.5, W - M - 1.0][i];
    txt(s, h, { x, y: y0, w: [3.3, 8.0, 1.0][i], h: 0.24, fontSize: 10, bold: true, color: C.faint, charSpacing: 0.6 });
  });
  rows.forEach(([a, b, st], i) => {
    const y = y0 + 0.34 + i * rh;
    if (i % 2 === 0) s.addShape(p.ShapeType.rect, { x: M - 0.14, y: y - 0.06, w: W - M * 2 + 0.28, h: rh - 0.02,
      fill: { color: C.panel }, line: { width: 0 } });
    txt(s, a, { x: M, y: y + 0.02, w: 3.3, h: 0.5, fontSize: 11, bold: true, color: C.ink, lineSpacing: 15 });
    txt(s, b, { x: M + 3.5, y: y + 0.02, w: 7.7, h: 0.5, fontSize: 10.5, lineSpacing: 15 });
    const on = st === "완료";
    chip(s, { x: W - M - 0.72, y: y + 0.08, w: 0.72, text: st,
      bg: on ? C.okSoft : C.warnSoft, fg: on ? C.okInk : C.warnInk });
  });
  txt(s, "바꾼 동작은 전부 기능 스위치 뒤에 뒀다 — 발표 중 문제가 생기면 환경변수 한 줄로 옛 동작으로 되돌아간다.",
    { x: M, y: 6.1, w: W - M * 2, h: 0.3, fontSize: 11, color: C.faint });
  foot(s, 13);
}

// ══════════════ 14. 숫자 ══════════════
{
  const s = p.addSlide(); head(s, "숫자로 보는 현황", "2026.08.11 기준");
  const stats = [
    ["9 / 11", "설계 화면 중 완성", "부분 2 · 미구현 0"],
    ["78", "브라우저 자동 테스트", "조건 검사 305개"],
    ["156회", "PR 1건당 테스트 실행", "78개 × 스위치 2벌"],
    ["18,289", "코드 줄 수", "소스 파일 92개"],
    ["29종", "서버 동작", "전부 창구 1곳으로"],
    ["4종", "외부 API", "키 0개로도 완주"],
    ["15개", "4대 기기 리허설 판정", "+ 스크린샷 16장"],
    ["126", "총 커밋", "변경기록 333행"],
  ];
  const cw = (W - M * 2 - 0.3 * 3) / 4, ch = 1.5;
  stats.forEach(([n, l, sub], i) => {
    const x = M + (i % 4) * (cw + 0.3), y = 1.64 + Math.floor(i / 4) * (ch + 0.3);
    card(s, { x, y, w: cw, h: ch, fill: i < 4 ? C.ice : C.panel, line: i < 4 ? "C7DBFF" : C.hair });
    s.addText(n, { x: x + 0.24, y: y + 0.22, w: cw - 0.48, h: 0.56, fontFace: F, fontSize: 28,
      bold: true, color: C.brandDeep, margin: 0 });
    txt(s, l, { x: x + 0.24, y: y + 0.84, w: cw - 0.48, h: 0.26, fontSize: 11, bold: true, color: C.ink });
    txt(s, sub, { x: x + 0.24, y: y + 1.1, w: cw - 0.48, h: 0.26, fontSize: 9.5, color: C.faint });
  });
  card(s, { x: M, y: 5.28, w: W - M * 2, h: 0.8, fill: C.white, flat: true });
  s.addText([
    { text: "공평함 점수 ", options: { bold: true, color: C.ink } },
    { text: "최대 이동시간 + 편차 × 0.8", options: { fontFace: MONO } },
    { text: "     ·     ", options: { color: C.hair } },
    { text: "가게 후보 ", options: { bold: true, color: C.ink } },
    { text: "반경 700m · 상한 5개", options: { fontFace: MONO } },
    { text: "     ·     ", options: { color: C.hair } },
    { text: "화면 동기화 ", options: { bold: true, color: C.ink } },
    { text: "1.8초", options: { fontFace: MONO } },
    { text: "     ·     ", options: { color: C.hair } },
    { text: "버전 ", options: { bold: true, color: C.ink } },
    { text: "0.2.0 → 발표일 1.0.0", options: { fontFace: MONO } },
  ], { x: M + 0.3, y: 5.46, w: W - M * 2 - 0.6, h: 0.44, fontFace: F, fontSize: 11,
       color: C.soft, align: "center", valign: "middle", margin: 0 });
  foot(s, 14);
}

// ══════════════ 15. 남은 일 ══════════════
{
  const s = p.addSlide(); head(s, "남은 일", "발표까지 · 발표 후");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.62, w: cw, h: 2.36, fill: C.badSoft, line: "FBC9D5" });
  chip(s, { x: M + 0.24, y: 1.82, text: "발표를 막을 수 있는 것", bg: C.white, fg: C.badInk });
  [["발표장 Wi-Fi에서 노트북 IP 확정 후 카카오 콘솔 2곳에 등록", "지도용 사이트 도메인 · 로그인용 Redirect 주소. IP가 바뀌면 둘 다 무효가 된다"],
   ["실기기 4대로 사람 손으로 한 번 완주", "자동 리허설은 통과했지만 실제 폰의 터치·네트워크는 다르다"]].forEach(([t, d], i) => {
    s.addText([{ text: t + "\n", options: { bold: true, color: C.badInk } }, { text: d, options: { color: C.badInk, fontSize: 9.5 } }],
      { x: M + 0.24, y: 2.28 + i * 0.78, w: cw - 0.48, h: 0.74, fontFace: F, fontSize: 11,
        bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  card(s, { x: M, y: 4.12, w: cw, h: 1.5, fill: C.warnSoft, line: "FDE68A" });
  chip(s, { x: M + 0.24, y: 4.32, text: "설계 대비 남은 것", bg: C.white, fg: C.warnInk });
  [["카카오톡 알리기 상시화", "지금은 결과 화면 한 곳에만"],
   ["모임 생성 시 카카오 로그인 필수화", "지금은 이름만 있으면 생성 가능"]].forEach(([t, d], i) => {
    s.addText([{ text: t + " ", options: { bold: true, color: C.warnInk } }, { text: "— " + d, options: { color: C.warnInk } }],
      { x: M + 0.24, y: 4.78 + i * 0.42, w: cw - 0.48, h: 0.38, fontFace: F, fontSize: 11,
        bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.62, w: cw, h: 3.24 });
  chip(s, { x: rx + 0.24, y: 1.82, text: "발표 후로 미룬 것" });
  [["AI 추천을 “팔레트”에 담아 사람이 고르게", "추천은 제안이지 결정이 아니고, 다섯 자리를 AI가 먼저 차지해서도 안 된다"],
   ["이동수단 2종 → 4종", "지하철·버스·자차·도보. 타입·DB·계산·UI가 전부 바뀌어 이틀 이상, 발표 전엔 위험"],
   ["한 파일 400줄 규칙 위반 8개 파일 분할", "가장 큰 것 1,799줄"],
   ["안드로이드 앱 포장(PWA → APK) 리허설", ""]].forEach(([t, d], i) => {
    s.addText([{ text: t + (d ? " " : ""), options: { bold: true, color: C.ink } }, { text: d ? "— " + d : "", options: {} }],
      { x: rx + 0.24, y: 2.28 + i * 0.62, w: cw - 0.48, h: 0.56, fontFace: F, fontSize: 11,
        color: C.soft, bullet: { code: "2022" }, lineSpacing: 15, margin: 0 });
  });
  card(s, { x: rx, y: 5.02, w: cw, h: 1.06, fill: C.okSoft, line: "BBF7D0" });
  txt(s, [{ text: "이번 주에 닫은 것 — ", options: { bold: true, color: C.okInk } },
          { text: "지하철역 묶기 실 키 검증, 후보 상한 롤백 버그, 홈/핑 후보 이름 불일치. 마지막 미확인 위험이 사라졌다.", options: { color: C.okInk } }],
      { x: rx + 0.26, y: 5.22, w: cw - 0.52, h: 0.7, fontSize: 11, lineSpacing: 16 });
  foot(s, 15);
}

// ══════════════ 16. 한계 ══════════════
{
  const s = p.addSlide(); head(s, "솔직하게", "아직 못 한 것도 말씀드립니다");
  const cw = (W - M * 2 - 0.34) / 2;
  card(s, { x: M, y: 1.62, w: cw, h: 3.3 });
  chip(s, { x: M + 0.26, y: 1.84, text: "① 실환경 검증이 덜 끝났다", bg: C.warnSoft, fg: C.warnInk });
  txt(s, "개발 환경에는 외부 API 키가 없어 이동시간이 전부 “거리 추정”으로 나온다. 지하철역 이름 형식처럼 키가 있는 기계에서만 확인되는 계약도 있다 — 자동 검사에서는 대체 경로만 밟기 때문에 틀려도 전부 초록불이 된다.\n\n그래서 그것만 확인하는 스크립트를 따로 만들어 학교 노트북에서 실행해 통과를 확인했다. 다만 “CI가 자동으로 지켜 주는 것”은 아니라는 점을 분명히 해 둔다.\n\n도시간 장거리의 “역까지 가는 시간” 보정식이 실측 대비 약 1.7배 과대하다는 것도 주석에 적어 뒀다 — 정확하진 않지만 0분보다는 진실에 가깝다는 판단이다.",
    { x: M + 0.26, y: 2.3, w: cw - 0.52, h: 2.5, fontSize: 10.5, lineSpacing: 15.5 });
  const rx = M + cw + 0.34;
  card(s, { x: rx, y: 1.62, w: cw, h: 3.3 });
  chip(s, { x: rx + 0.26, y: 1.84, text: "② 스스로 정한 규칙을 못 지킨 곳", bg: C.warnSoft, fg: C.warnInk });
  txt(s, "“AI가 엉뚱한 곳을 고치고 두 사람이 동시에 만지면 충돌난다”는 이유로 한 파일 400줄 상한을 정했는데 8개 파일이 이를 넘었다(가장 큰 것 1,799줄).\n\n설계가 요구한 “모임 생성 시 카카오 로그인 필수”도 아직 적용되지 않아 이름만 있으면 만들 수 있다. 작업 메모의 “남은 일” 목록도 낡아서 이미 끝난 항목이 아직 “안 함”으로 적혀 있는 것을 이번에 발견했다.\n\n기록을 남기는 규칙은 지켰지만, 기록을 갱신하는 규칙은 놓쳤다. 이건 사람이 아니라 절차로 막아야 한다고 보고 있다.",
    { x: rx + 0.26, y: 2.3, w: cw - 0.52, h: 2.5, fontSize: 10.5, lineSpacing: 15.5 });
  card(s, { x: M, y: 5.08, w: W - M * 2, h: 1.0, fill: C.ice, line: "C7DBFF" });
  txt(s, [{ text: "이 슬라이드를 넣은 이유 — ", options: { bold: true, color: C.brandDeep } },
          { text: "이 프로젝트에서 배운 가장 큰 것이 “되는 것처럼 보이는 것”과 “되는 것”은 다르다는 점이라서, 발표 자료에서도 같은 기준을 지키는 것이 맞다고 판단했습니다.", options: { color: C.brandDeep } }],
      { x: M + 0.3, y: 5.3, w: W - M * 2 - 0.6, h: 0.62, fontSize: 12, lineSpacing: 18 });
  foot(s, 16);
}

// ══════════════ 17. 마무리 ══════════════
{
  const s = p.addSlide();
  s.background = { color: C.navy };
  s.addShape(p.ShapeType.roundRect, { x: -3, y: 3.6, w: 12, h: 9, rectRadius: 0.5,
    fill: { color: C.navy2 }, line: { width: 0 }, rotate: -18 });
  s.addShape(p.ShapeType.roundRect, { x: 7.4, y: 4.2, w: 10, h: 8, rectRadius: 0.5,
    fill: { color: C.brand }, line: { width: 0 }, rotate: -18, transparency: 30 });
  s.addText("감사합니다", { x: 0, y: 2.0, w: W, h: 0.4, fontFace: F, fontSize: 13, bold: true,
    color: "A8C6FF", align: "center", charSpacing: 1.5 });
  s.addText("“어디서 만날까?”에 답을 내는 데 3분", { x: 0, y: 2.55, w: W, h: 0.9,
    fontFace: F, fontSize: 38, bold: true, color: C.white, align: "center" });
  s.addText("출발지를 넣고 · 지도를 한 번 누르고 · 방장이 확정한다.\n그 사이의 모든 계산과 합의 절차를 모이머가 맡습니다.",
    { x: 0, y: 3.62, w: W, h: 0.9, fontFace: F, fontSize: 15, color: "D6E4FF", align: "center", lineSpacing: 26 });
  s.addText("AI 부트캠프 3팀  ·  moimer v0.2.0  ·  2026.08.11",
    { x: 0, y: 5.5, w: W, h: 0.3, fontFace: F, fontSize: 11, color: "7A9AD8", align: "center" });
  s.addNotes("시연으로 넘어갑니다 — 노트북 1대와 폰 3대로 실제 모임을 만들어 보겠습니다.");
}

const OUT = path.join(REPO, "docs/발표_중간발표.pptx");
p.writeFile({ fileName: OUT }).then(() => console.log("생성 완료:", OUT));
