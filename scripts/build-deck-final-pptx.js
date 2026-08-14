// ─────────────────────────────────────────────────────────────
// scripts/build-deck-final-pptx.js — 최종발표 PPT 생성기
//
//   npm i -D pptxgenjs        (한 번만 · 프로젝트 의존성이 아니다)
//   node scripts/build-deck-final-pptx.js
//   → docs/발표_최종발표.pptx
//
// 중간발표 v2(scripts/build-deck-v2-pptx.js)와 무엇이 다른가
//   · 시연 구조가 **LAN 로컬 → Vercel 배포**로 바뀌었다. 표지·마무리에 QR을
//     넣어 청중이 자기 폰으로 직접 들어오게 한다.
//   · 07 «실제 화면», 11 «중간발표 이후», 19 «배포 구성» 이 새로 들어갔다.
//   · 부록이 20장 → 3장으로 줄었다 (본편 17 + 부록 4 = 21장).
//
// ⚠️ 파워포인트에서 직접 고치지 말 것 — 여기를 고치고 다시 돌린다.
//    안 그러면 다음 갱신 때 무엇을 바꿨는지 알 수 없다.
// ⚠️ 화면 사진 3장은 **카카오 키가 없는 빌드**에서 찍혀 지도 자리가 대체
//    화면이다. 발표 전 키가 있는 노트북에서 `npm run shots` 로 다시 찍으면
//    이 스크립트를 다시 돌리는 것만으로 슬라이드가 갱신된다.
// ─────────────────────────────────────────────────────────────
const pptxgen = require("pptxgenjs");
const fs = require("node:fs");
const path = require("node:path");

// 배포 URL QR (PNG, base64). 별도 이미지 파일을 두지 않는 이유 —
// 이 스크립트 하나만 있으면 덱이 다시 만들어지게 하기 위해서다.
// 주소가 바뀌면 새 QR 을 만들어 이 문자열만 갈아끼운다.
const QR_PNG =
  "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";

const REPO = path.resolve(__dirname, "..");
const IMG = (n) =>
  "image/png;base64," + fs.readFileSync(path.join(REPO, "docs/img/발표", n)).toString("base64");

const INK = "141A3C";
const INK2 = "222C57";
const BLUE = "2E5BFF";
const BLUE_D = "1B3FCC";
const BLUE_SOFT = "E9EDFF";
const TINT = "F4F6FC";
const CORAL = "FF6B4A";
const CORAL_SOFT = "FFEDE8";
const AMBER = "E8930C";
const AMBER_SOFT = "FFF4DF";
const GREEN = "12A150";
const GREEN_SOFT = "E4F6EC";
const MUTED = "6B7490";
const MUTED_D = "9AA2B8";
const LINE = "E1E6F2";
const W = "FFFFFF";

const F = "Malgun Gothic";
const SW = 13.333;
const SH = 7.5;
const M = 0.72;
const CW = SW - M * 2;

const URL = "ai-bootcamp-team3-final-project.vercel.app";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "브레인 스파크";
pres.title = "모이머 — 최종발표";

const card = () => ({ type: "outer", color: "8A93B2", blur: 10, offset: 2, angle: 90, opacity: 0.13 });

let pageNo = 0;

function footer(s, dark, label) {
  pageNo += 1;
  s.addText(label || "모이머 · 브레인 스파크", {
    x: M, y: 6.97, w: 6, h: 0.3, fontFace: F, fontSize: 9.5,
    color: dark ? "6E77A0" : MUTED_D, align: "left", margin: 0,
  });
  s.addText(String(pageNo).padStart(2, "0"), {
    x: SW - M - 1, y: 6.97, w: 1, h: 0.3, fontFace: F, fontSize: 9.5, bold: true,
    color: dark ? "6E77A0" : MUTED_D, align: "right", margin: 0,
  });
}

/** 밝은 본문 슬라이드 헤더 */
function head(s, kicker, title, sub) {
  s.addText(kicker, {
    x: M, y: 0.44, w: CW, h: 0.26, fontFace: F, fontSize: 12, bold: true,
    color: BLUE, charSpacing: 1.5, margin: 0,
  });
  s.addText(title, {
    x: M, y: 0.74, w: CW, h: 0.62, fontFace: F, fontSize: 33, bold: true,
    color: INK, valign: "top", margin: 0,
  });
  if (sub) {
    s.addText(sub, {
      x: M, y: 1.4, w: CW, h: 0.3, fontFace: F, fontSize: 13.5, color: MUTED, margin: 0,
    });
  }
}

function newLight() {
  const s = pres.addSlide();
  s.background = { color: W };
  return s;
}
function newDark() {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
}

/** 둥근 카드 */
function box(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: o.r || 0.14,
    fill: { color: o.fill || TINT },
    line: o.line ? { color: o.line, width: 1 } : { type: "none" },
    shadow: o.shadow ? card() : undefined,
  });
}

/** 색 원 안의 짧은 글자 */
function badge(s, o) {
  s.addShape(pres.ShapeType.ellipse, {
    x: o.x, y: o.y, w: o.d, h: o.d, fill: { color: o.fill },
    line: { type: "none" },
  });
  s.addText(o.t, {
    x: o.x, y: o.y, w: o.d, h: o.d, fontFace: F, fontSize: o.fs || 14, bold: true,
    color: o.color || W, align: "center", valign: "middle", margin: 0,
  });
}

/** 알약 모양 태그 */
function pill(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h || 0.34, rectRadius: 0.17,
    fill: { color: o.fill }, line: o.line ? { color: o.line, width: 1 } : { type: "none" },
  });
  s.addText(o.t, {
    x: o.x, y: o.y, w: o.w, h: o.h || 0.34, fontFace: F, fontSize: o.fs || 11.5,
    bold: true, color: o.color, align: "center", valign: "middle", margin: 0,
  });
}

// ───────────────────────────────────────────── 01 표지
{
  const s = newDark();
  s.addShape(pres.ShapeType.ellipse, {
    x: 8.6, y: -1.7, w: 6.6, h: 6.6, fill: { color: BLUE, transparency: 82 }, line: { type: "none" },
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.3, y: 3.6, w: 4.4, h: 4.4, fill: { color: CORAL, transparency: 88 }, line: { type: "none" },
  });

  s.addText("브레인 스파크  ·  최종발표  ·  2026. 08. 21 (금)", {
    x: M, y: 0.72, w: 8, h: 0.3, fontFace: F, fontSize: 12.5, bold: true,
    color: "8FA3FF", charSpacing: 1.2, margin: 0,
  });

  s.addText("모이머", {
    x: M, y: 1.25, w: 7, h: 1.15, fontFace: F, fontSize: 66, bold: true, color: W, margin: 0,
  });
  s.addText("M O I M E R", {
    x: M + 0.08, y: 2.38, w: 7, h: 0.3, fontFace: F, fontSize: 13, bold: true,
    color: "8FA3FF", charSpacing: 5, margin: 0,
  });

  s.addText("흩어진 우리, 딱 중간에서.", {
    x: M, y: 2.95, w: 8, h: 0.5, fontFace: F, fontSize: 27, bold: true, color: W, margin: 0,
  });

  s.addText(
    [
      { text: "각자 다른 곳에서 출발하는 사람들이 ", options: { color: "C3CBEA" } },
      { text: "아무도 혼자 크게 손해보지 않는 만남 장소", options: { color: W, bold: true } },
      { text: "를\n", options: { color: "C3CBEA" } },
      { text: "지도를 한 번 누르는 것만으로 함께 정하는 서비스", options: { color: "C3CBEA" } },
    ],
    { x: M, y: 3.55, w: 7.95, h: 0.8, fontFace: F, fontSize: 14.5, lineSpacing: 24, valign: "top", margin: 0 }
  );

  const tags = ["설치 없이 링크 하나", "2~8명", "Next.js · TypeScript · PostgreSQL"];
  let tx = M;
  const tw = [2.25, 1.15, 3.6];
  tags.forEach((t, i) => {
    pill(s, { x: tx, y: 4.55, w: tw[i], h: 0.38, t, fill: "1E2A5A", color: "AFBDF0", fs: 11 });
    tx += tw[i] + 0.16;
  });

  // QR
  box(s, { x: 8.95, y: 2.5, w: 3.65, h: 2.85, r: 0.2, fill: W });
  s.addImage({ data: "image/png;base64," + QR_PNG, x: 9.87, y: 2.7, w: 1.8, h: 1.8 });
  s.addText("지금 바로 열립니다", {
    x: 8.95, y: 4.58, w: 3.65, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: INK,
    align: "center", margin: 0,
  });
  s.addText(URL, {
    x: 8.95, y: 4.92, w: 3.65, h: 0.3, fontFace: F, fontSize: 9.5, bold: true,
    color: BLUE, align: "center", margin: 0,
  });

  s.addShape(pres.ShapeType.line, {
    x: M, y: 5.6, w: 11.9, h: 0, line: { color: "2E3968", width: 1 },
  });
  s.addText("팀장 최병현  ·  팀원 김유환 · 양성은 · 신동원        멘토 최종원", {
    x: M, y: 5.78, w: 9, h: 0.32, fontFace: F, fontSize: 12.5, color: "AFBDF0", margin: 0,
  });
  s.addText("v1.0.0 — 저희 버전 규칙상 최종발표일에 딱 한 번 다는 번호입니다", {
    x: M, y: 6.16, w: 9, h: 0.3, fontFace: F, fontSize: 10.5, color: "6E77A0", margin: 0,
  });
  s.addNotes("표지. 첫 문장: '오늘 이 QR을 찍으면 여러분 폰에서 바로 열립니다. 중간발표 때는 제 노트북에서만 돌던 것이 지금은 배포돼 있습니다.'");
  footer(s, true);
}

// ───────────────────────────────────────────── 02 한 장 요약
{
  const s = newLight();
  head(s, "한 장 요약", "모이머는 이런 서비스입니다");

  const items = [
    { k: "무엇을", fill: BLUE_SOFT, c: BLUE, h: "여럿이 만날 장소를 함께 정하는 웹앱",
      b: "앱 설치도 회원가입도 없습니다.\n초대 링크 하나를 단톡방에 뿌리면 끝입니다." },
    { k: "누구를 위해", fill: CORAL_SOFT, c: CORAL, h: "서로 다른 동네에 흩어져 사는 2~8명",
      b: "친구·동아리·팀 회식처럼\n출발지가 제각각인 모임이 대상입니다." },
    { k: "어떻게", fill: AMBER_SOFT, c: AMBER, h: "출발지 → 지도 한 번 탭 → 가장 공평한 곳",
      b: "누구에게 얼마나 걸리는지를 숫자로 보여주고\n투표로 확정합니다." },
    { k: "지금 상태", fill: GREEN_SOFT, c: GREEN, h: "배포 완료 · 설계 화면 11/11",
      b: "브라우저 자동 테스트 78개 통과.\nQR을 찍으면 청중 폰에서 바로 돕니다." },
  ];

  const bw = (CW - 0.34) / 2;
  const bh = 2.28;
  items.forEach((it, i) => {
    const x = M + (i % 2) * (bw + 0.34);
    const y = 1.72 + Math.floor(i / 2) * (bh + 0.32);
    box(s, { x, y, w: bw, h: bh, fill: W, line: LINE, shadow: true });
    pill(s, { x: x + 0.42, y: y + 0.34, w: 1.3, h: 0.32, t: it.k, fill: it.fill, color: it.c, fs: 11 });
    s.addText(it.h, {
      x: x + 0.42, y: y + 0.82, w: bw - 0.84, h: 0.62, fontFace: F, fontSize: 18.5, bold: true,
      color: INK, lineSpacing: 26, margin: 0,
    });
    s.addText(it.b, {
      x: x + 0.42, y: y + 1.5, w: bw - 0.84, h: 0.62, fontFace: F, fontSize: 12.5,
      color: MUTED, lineSpacing: 19, margin: 0,
    });
  });

  s.addNotes("네 칸을 순서대로 읽지 말고 '무엇을'과 '지금 상태'만 짚는다. 나머지는 뒤 슬라이드에서 다시 나온다.");
  footer(s);
}

// ───────────────────────────────────────────── 03 문제
{
  const s = newLight();
  head(s, "기획 배경", "친구들이 더 이상 같은 동네에 살지 않습니다");

  const lw = 6.15;
  s.addText(
    [
      { text: "학교 때는 다 같은 동네에 있었습니다. 그때는 “어디서 볼까”가 질문이 아니었어요.\n\n", options: { color: MUTED } },
      { text: "지금은 누구는 취업하고, 누구는 이사 가고, 누구는 아직 학교에 있습니다.\n", options: { color: INK } },
      { text: "출발지가 흩어지는 순간 약속 장소 정하기가 매번 협상이 됩니다.\n", options: { color: INK } },
      { text: "그리고 늘 같은 사람이 멀리서 옵니다.\n\n", options: { color: INK } },
      { text: "문제는 그게 숫자로 보이지 않는다", options: { color: CORAL, bold: true } },
      { text: "는 것입니다 — 아무도 “내가 얼마나 더 오는지”를 모르니 말도 못 꺼냅니다.", options: { color: INK } },
    ],
    { x: M, y: 1.78, w: lw, h: 2.5, fontFace: F, fontSize: 14, lineSpacing: 24, margin: 0 }
  );

  box(s, { x: M, y: 4.5, w: lw, h: 1.85, fill: INK, r: 0.16 });
  s.addText("우리가 푸는 것은 “지도 검색”이 아니라 “합의”입니다.", {
    x: M + 0.42, y: 4.78, w: lw - 0.84, h: 0.36, fontFace: F, fontSize: 16, bold: true, color: W, margin: 0,
  });
  s.addText(
    [
      { text: "장소를 찾아 주는 서비스는 이미 많습니다. 없는 것은 ", options: { color: "C3CBEA" } },
      { text: "여러 명이 각자 다른 곳에서 출발할 때 공평한 곳을 함께 고르는 절차", options: { color: W, bold: true } },
      { text: "입니다.", options: { color: "C3CBEA" } },
    ],
    { x: M + 0.42, y: 5.2, w: lw - 0.84, h: 0.9, fontFace: F, fontSize: 12.5, lineSpacing: 20, margin: 0 }
  );

  // 카톡 대화 재현
  const cx = M + lw + 0.5;
  const cwid = CW - lw - 0.5;
  box(s, { x: cx, y: 1.78, w: cwid, h: 4.57, fill: "B2C7D9", r: 0.16 });
  s.addText("우리가 실제로 겪은 일", {
    x: cx + 0.32, y: 2.0, w: cwid - 0.64, h: 0.3, fontFace: F, fontSize: 11.5, bold: true,
    color: "3E5666", margin: 0,
  });

  const chat = [
    { t: "어디서 볼까?", me: false, note: "" },
    { t: "아무데나 ㅋㅋ", me: true, note: "10분 뒤" },
    { t: "그럼 강남?", me: false, note: "" },
    { t: "나 거기 1시간 넘게 걸리는데…", me: true, note: "또 10분 뒤" },
    { t: "그럼 어디로 하지…", me: false, note: "(처음으로)" },
  ];
  let cy = 2.42;
  chat.forEach((m) => {
    const bwid = Math.min(3.05, 0.62 + m.t.length * 0.148);
    const bx = m.me ? cx + cwid - 0.32 - bwid : cx + 0.32;
    s.addShape(pres.ShapeType.roundRect, {
      x: bx, y: cy, w: bwid, h: 0.46, rectRadius: 0.1,
      fill: { color: m.me ? "FCE94F" : W }, line: { type: "none" },
    });
    s.addText(m.t, {
      x: bx, y: cy, w: bwid, h: 0.46, fontFace: F, fontSize: 11.5, color: "2A2A2A",
      align: "center", valign: "middle", margin: 0,
    });
    if (m.note) {
      s.addText(m.note, {
        x: m.me ? bx - 1.15 : bx + bwid + 0.06, y: cy + 0.08, w: 1.08, h: 0.3,
        fontFace: F, fontSize: 9, italic: true, color: "45606F",
        align: m.me ? "right" : "left", margin: 0,
      });
    }
    cy += 0.72;
  });
  s.addText("결국 아무것도 정해지지 않은 채 20분이 지납니다.", {
    x: cx + 0.32, y: 5.95, w: cwid - 0.64, h: 0.3, fontFace: F, fontSize: 10.5, bold: true,
    color: "3E5666", align: "center", margin: 0,
  });

  s.addNotes("오른쪽 대화는 실제 팀 단톡방에서 있었던 흐름이다. 청중 대부분이 겪어 본 장면이라 여기서 고개를 끄덕이게 만든다.");
  footer(s);
}

// ───────────────────────────────────────────── 04 기존 방식
{
  const s = newLight();
  head(s, "왜 아직도 안 되는가", "지금 쓰는 방법 세 가지가, 세 가지 다 안 됩니다");

  const cols = [
    { icon: "💬", t: "단톡방 눈대중", fill: BLUE_SOFT,
      b: "누구도 계산하지 않고 “대충 중간”으로 정합니다.\n결국 말 센 사람 근처나 늘 가던 곳으로 갑니다.",
      v: "공평한지 아무도 모른다" },
    { icon: "🗺️", t: "지도 앱", fill: AMBER_SOFT,
      b: "길찾기는 출발지 하나 → 도착지 하나입니다.\n여러 출발지를 동시에 놓고 물어볼 수가 없습니다.",
      v: "한 사람 기준으로만 본다" },
    { icon: "🗳️", t: "그냥 투표", fill: GREEN_SOFT,
      b: "각자 다른 이름으로 제안하니 “강남”·“강남역”·“역삼”이\n서로 다른 후보가 됩니다. 표가 흩어집니다.",
      v: "투표해도 결론이 안 난다" },
  ];

  const bw = (CW - 0.44) / 3;
  cols.forEach((c, i) => {
    const x = M + i * (bw + 0.22);
    box(s, { x, y: 1.82, w: bw, h: 3.32, fill: W, line: LINE, shadow: true });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.4, y: 2.14, w: 0.72, h: 0.72, fill: { color: c.fill }, line: { type: "none" },
    });
    s.addText(c.icon, {
      x: x + 0.4, y: 2.14, w: 0.72, h: 0.72, fontSize: 22, align: "center", valign: "middle", margin: 0,
    });
    s.addText(c.t, {
      x: x + 0.4, y: 3.02, w: bw - 0.8, h: 0.4, fontFace: F, fontSize: 19, bold: true, color: INK, margin: 0,
    });
    s.addText(c.b, {
      x: x + 0.4, y: 3.5, w: bw - 0.8, h: 1.0, fontFace: F, fontSize: 12.5, color: MUTED,
      lineSpacing: 20, valign: "top", margin: 0,
    });
    pill(s, { x: x + 0.4, y: 4.62, w: bw - 0.8, h: 0.38, t: "✕  " + c.v, fill: CORAL_SOFT, color: "C7391B", fs: 11.5 });
  });

  box(s, { x: M, y: 5.42, w: CW, h: 0.92, fill: BLUE, r: 0.14 });
  s.addText(
    [
      { text: "모이머는 이 셋을 한 화면에서 해결합니다  —  ", options: { bold: true, color: W } },
      { text: "여러 출발지를 동시에 계산하고, 공평함을 숫자로 보여주고, 같은 곳을 누른 사람을 하나로 묶습니다.", options: { color: "D9E1FF" } },
    ],
    { x: M + 0.42, y: 5.42, w: CW - 0.84, h: 0.92, fontFace: F, fontSize: 14, valign: "middle", margin: 0 }
  );

  s.addNotes("빨간 칩 세 줄만 읽어도 슬라이드가 전달된다. 시간이 없으면 칩만 읽는다.");
  footer(s);
}

// ───────────────────────────────────────────── 05 해결 3기둥
{
  const s = newLight();
  head(s, "해결", "출발지만 넣으면, 나머지는 지도 한 번으로 끝납니다");

  const cols = [
    { n: "①", t: "공평함을 숫자로",
      b: "후보마다 가장 오래 걸리는 사람의 시간과 사람 간 편차를 계산해 보여줍니다. 평균이 아니라 최악을 봅니다 — 평균이면 3명 만족·1명 지옥인 곳이 1위가 됩니다.",
      k: "점수 = 최대 이동시간 + 편차 × 0.8" },
    { n: "②", t: "지도 한 번 = 한 표",
      b: "“후보를 등록하고 → 다시 투표한다”를 한 단계로 합쳤습니다. 누르면 가까운 지하철역으로 정리되고, 같은 곳을 누른 사람끼리 자동으로 하나로 합쳐집니다.",
      k: "“누른 것이 곧 한 표예요”" },
    { n: "③", t: "카톡을 대체하지 않습니다",
      b: "대화는 원래 쓰던 단톡방에서 합니다. 모이머는 링크 하나로 들어와 장소만 정하고 나갑니다. 새 메신저를 배우게 하지 않습니다.",
      k: "초대 링크 → 지도 탭 → 끝" },
  ];

  const bw = (CW - 0.44) / 3;
  cols.forEach((c, i) => {
    const x = M + i * (bw + 0.22);
    box(s, { x, y: 1.82, w: bw, h: 3.55, fill: TINT });
    badge(s, { x: x + 0.42, y: 2.12, d: 0.6, t: c.n, fill: BLUE, fs: 17 });
    s.addText(c.t, {
      x: x + 0.42, y: 2.86, w: bw - 0.84, h: 0.4, fontFace: F, fontSize: 18.5, bold: true, color: INK, margin: 0,
    });
    s.addText(c.b, {
      x: x + 0.42, y: 3.34, w: bw - 0.84, h: 1.42, fontFace: F, fontSize: 12.5, color: "4B5470",
      lineSpacing: 20, valign: "top", margin: 0,
    });
    pill(s, { x: x + 0.42, y: 4.85, w: bw - 0.84, h: 0.4, t: c.k, fill: W, color: BLUE_D, fs: 11.5, line: "C9D3FF" });
  });

  s.addText(
    [
      { text: "회원가입 없이 홈에서 바로 맛볼 수 있습니다.  ", options: { bold: true, color: INK } },
      { text: "출발지 2곳만 넣어도 중간지점이 나오고, 마음에 들면 그 출발지들을 그대로 들고 모임으로 넘어갑니다 — 가입은 그다음입니다.", options: { color: MUTED } },
    ],
    { x: M, y: 5.62, w: CW, h: 0.5, fontFace: F, fontSize: 12.5, margin: 0 }
  );

  s.addNotes("세 기둥 중 ②가 이 서비스의 정체성이다. ①은 근거, ③은 채택 장벽을 낮추는 결정.");
  footer(s);
}

// ───────────────────────────────────────────── 06 사용 흐름
{
  const s = newLight();
  head(s, "사용 흐름", "초대 링크를 받은 순간부터 모임 당일까지");

  const steps = [
    { n: "1", t: "로그인 없이 맛보기", b: "출발지를 넣으면 즉시 중간지점 1곳. 가입도 모임 생성도 필요 없습니다." },
    { n: "2", t: "모임 만들기", b: "가장 중요한 질문 하나를 먼저 — 동네까지만 정할지, 가게까지 정할지." },
    { n: "3", t: "링크로 들어와 구경", b: "입력 폼이 아니라 지도가 먼저 뜹니다. 정보는 행동할 때 묻습니다." },
    { n: "4", t: "지도 한 번 = 한 표", b: "누른 자리가 가까운 역으로 정리되고 같은 곳끼리 합쳐집니다.", hot: true },
    { n: "5", t: "방장이 지역 확정", b: "전원을 기다리지 않습니다. 후보가 부족하면 AI 추천 버튼." },
    { n: "6", t: "반경 700m 안 가게", b: "걸어갈 수 있는 거리로만. 카테고리 5종 · 후보 상한 5개." },
    { n: "7", t: "투표 → 결과", b: "확정되면 각자 폰에 자기 경로가 그려집니다. 1.8초마다 자동 동기화." },
    { n: "8", t: "당일 · 다음 모임", b: "도착 신호등(갈게요/늦어요/못 가요) → 지난 모임 → 같은 멤버로 재모임." },
  ];

  const bw = (CW - 3 * 0.22) / 4;
  const bh = 2.0;
  steps.forEach((st, i) => {
    const x = M + (i % 4) * (bw + 0.22);
    const y = 1.8 + Math.floor(i / 4) * (bh + 0.24);
    box(s, {
      x, y, w: bw, h: bh, fill: st.hot ? BLUE : W,
      line: st.hot ? null : LINE, shadow: !st.hot,
    });
    badge(s, {
      x: x + 0.3, y: y + 0.24, d: 0.42, t: st.n,
      fill: st.hot ? W : BLUE_SOFT, color: st.hot ? BLUE : BLUE_D, fs: 13,
    });
    s.addText(st.t, {
      x: x + 0.3, y: y + 0.76, w: bw - 0.6, h: 0.34, fontFace: F, fontSize: 14, bold: true,
      color: st.hot ? W : INK, valign: "top", margin: 0,
    });
    s.addText(st.b, {
      x: x + 0.3, y: y + 1.16, w: bw - 0.6, h: 0.72, fontFace: F, fontSize: 11,
      color: st.hot ? "D9E1FF" : MUTED, lineSpacing: 17, valign: "top", margin: 0,
    });
  });

  s.addText(
    [
      { text: "핵심은 STEP 4 입니다.  ", options: { bold: true, color: BLUE } },
      { text: "다른 서비스가 “검색해서 고르기”로 끝난다면, 모이머는 여기서 여러 사람의 의사를 한 화면에 모읍니다.", options: { color: MUTED } },
    ],
    { x: M, y: 6.24, w: CW, h: 0.4, fontFace: F, fontSize: 12.5, valign: "top", margin: 0 }
  );

  s.addNotes("8칸을 다 읽지 않는다. 파란 4번 칸을 짚고 '여기가 이 앱의 전부'라고 말한 뒤 넘어간다.");
  footer(s);
}

// ───────────────────────────────────────────── 07 실제 화면
{
  const s = newLight();
  head(s, "실제 화면", "지금 QR을 찍으면 이 화면이 뜹니다", "설계 화면 11대 전부 구현 · 아래는 그중 핵심 3장");

  const SHOTS = ["01-홈.png", "02-핑.png", "03-결과.png"];
  const caps = ["① 홈", "② 핑 등록", "③ 결과"];
  const iw = 2.0;
  const ih = iw * (1800 / 840);
  const gap = 0.34;
  SHOTS.forEach((_, i) => {
    const x = M + i * (iw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x: x - 0.06, y: 1.85 - 0.06, w: iw + 0.12, h: ih + 0.12, rectRadius: 0.14,
      fill: { color: TINT }, line: { type: "none" }, shadow: card(),
    });
    s.addImage({ data: IMG(SHOTS[i]), x, y: 1.85, w: iw, h: ih });
    s.addText(caps[i], {
      x, y: 1.85 + ih + 0.14, w: iw, h: 0.3, fontFace: F, fontSize: 11, bold: true,
      color: MUTED, align: "center", margin: 0,
    });
  });

  const ax = M + 3 * iw + 2 * gap + 0.55;
  const aw = SW - M - ax;
  const notes = [
    { n: "①", t: "홈 — 로그인 없이 맛보기", b: "출발지 4곳을 넣으면 중간지점 ‘왕십리’와 걸어갈 수 있는 가게가 바로 나옵니다." },
    { n: "②", t: "핑 등록 — 지도 한 번 = 한 표", b: "누른 자리를 확인 시트로 되묻고 등록합니다. 1인 1개라 다른 곳을 누르면 그쪽으로 옮겨갑니다." },
    { n: "③", t: "결과 — 투표로 함께 정했어요", b: "확정된 가게와 각자의 경로. 되돌리기·재투표가 있어 결과 화면에서 끝나지 않습니다." },
  ];
  notes.forEach((nt, i) => {
    const y = 1.85 + i * 1.55;
    box(s, { x: ax, y, w: aw, h: 1.35, fill: W, line: LINE, shadow: true });
    badge(s, { x: ax + 0.3, y: y + 0.26, d: 0.44, t: nt.n, fill: BLUE_SOFT, color: BLUE_D, fs: 13 });
    s.addText(nt.t, {
      x: ax + 0.9, y: y + 0.24, w: aw - 1.2, h: 0.34, fontFace: F, fontSize: 14, bold: true,
      color: INK, valign: "top", margin: 0,
    });
    s.addText(nt.b, {
      x: ax + 0.9, y: y + 0.64, w: aw - 1.2, h: 0.6, fontFace: F, fontSize: 11,
      color: MUTED, lineSpacing: 17, valign: "top", margin: 0,
    });
  });

  s.addNotes("사진은 카카오 지도 키가 없는 빌드에서 찍혀 지도 자리가 대체 화면이다. 발표 전 키가 있는 노트북에서 npm run shots 로 다시 찍어 교체할 것.");
  footer(s);
}

// ───────────────────────────────────────────── 08 핵심기능 ①
{
  const s = newLight();
  head(s, "핵심 기능 ①", "지도를 누르는 것이 곧 한 표입니다");

  const rowW = CW;
  // 흔한 방식
  box(s, { x: M, y: 1.8, w: rowW, h: 1.02, fill: TINT });
  pill(s, { x: M + 0.3, y: 2.11, w: 1.15, h: 0.4, t: "흔한 방식", fill: "DDE1EC", color: "5A6280", fs: 11 });
  s.addText("후보 등록  →  투표 시작  →  다시 투표  →  확정", {
    x: M + 1.62, y: 1.95, w: 5.0, h: 0.36, fontFace: F, fontSize: 15, bold: true, color: "5A6280", margin: 0,
  });
  s.addText("같은 사람에게 “여기 찍어” 다음에 “이제 투표해”를 또 시킵니다. 두 번째가 무엇을 위한 절차인지 설명하기 어렵습니다.", {
    x: M + 1.62, y: 2.33, w: rowW - 2.0, h: 0.34, fontFace: F, fontSize: 11.5, color: MUTED, margin: 0,
  });

  // 모이머
  box(s, { x: M, y: 2.96, w: rowW, h: 1.02, fill: BLUE });
  pill(s, { x: M + 0.3, y: 3.27, w: 1.15, h: 0.4, t: "모이머", fill: W, color: BLUE, fs: 11 });
  s.addText("지도를 누른다  →  많이 찍힌 곳이 1위  →  방장이 확정", {
    x: M + 1.62, y: 3.11, w: 5.6, h: 0.36, fontFace: F, fontSize: 15, bold: true, color: W, margin: 0,
  });
  s.addText("단계가 하나 줄었습니다. 참여자는 안 찍어도 되고, 방장은 전원을 기다리지 않고 넘어갈 수 있습니다.", {
    x: M + 1.62, y: 3.49, w: rowW - 2.0, h: 0.34, fontFace: F, fontSize: 11.5, color: "D3DCFF", margin: 0,
  });

  // 표 안 갈리게 하는 두 장치
  s.addText("표가 갈리지 않게 하는 두 가지", {
    x: M, y: 4.2, w: 5, h: 0.32, fontFace: F, fontSize: 13.5, bold: true, color: INK, margin: 0,
  });
  const mech = [
    { t: "가까운 지하철역으로 묶습니다", b: "누른 자리에서 1.2km 안에 역이 있으면 그 역 이름이 되고 핀도 역 위로 옮겨갑니다. “강남구에서 만나자”는 약속이 안 되지만 “강남역에서 만나자”는 약속이 됩니다." },
    { t: "같은 곳은 하나로 합칩니다", b: "같은 역을 누른 사람은 한 후보에 모입니다. 내 핑은 1개라 다른 곳을 누르면 그쪽으로 옮겨갑니다." },
  ];
  const mw = (7.3 - 0.24) / 2;
  mech.forEach((m, i) => {
    const x = M + i * (mw + 0.24);
    box(s, { x, y: 4.6, w: mw, h: 1.75, fill: W, line: LINE, shadow: true });
    s.addText(m.t, {
      x: x + 0.3, y: 4.84, w: mw - 0.6, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: BLUE_D, margin: 0,
    });
    s.addText(m.b, {
      x: x + 0.3, y: 5.22, w: mw - 0.6, h: 0.95, fontFace: F, fontSize: 11, color: MUTED, lineSpacing: 17, margin: 0,
    });
  });

  // 검증
  const vx = M + 7.3 + 0.34;
  const vw = CW - 7.3 - 0.34;
  box(s, { x: vx, y: 4.2, w: vw, h: 2.15, fill: INK, r: 0.14 });
  s.addText("실제 검증 · 2026-08-11 (실 카카오 키)", {
    x: vx + 0.3, y: 4.42, w: vw - 0.6, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: "8FA3FF", margin: 0,
  });
  s.addText(
    [
      { text: "두 사람이 사당역 양쪽 200m를 각각 눌렀을 때\n", options: { color: "C3CBEA" } },
      { text: "→ 후보 1개로 합쳐짐 · “사당역” · 2명  ✔\n\n", options: { color: W, bold: true } },
      { text: "역이 없는 동네(봉담)를 눌렀을 때\n", options: { color: "C3CBEA" } },
      { text: "→ “화성시 효행구” · 억지로 역을 붙이지 않음  ✔", options: { color: W, bold: true } },
    ],
    { x: vx + 0.3, y: 4.82, w: vw - 0.6, h: 1.4, fontFace: F, fontSize: 11.5, lineSpacing: 18, margin: 0 }
  );

  s.addNotes("역 스냅은 키가 있어야만 검증되는 계약이라 전용 점검 스크립트(npm run check:station)를 따로 만들었다. 질문 나오면 부록으로.");
  footer(s);
}

// ───────────────────────────────────────────── 09 공평함 (dark)
{
  const s = newDark();
  s.addText("핵심 기능 ②", {
    x: M, y: 0.44, w: CW, h: 0.26, fontFace: F, fontSize: 12, bold: true, color: "8FA3FF", charSpacing: 1.5, margin: 0,
  });
  s.addText("“공평함”을 한 줄로 정의했습니다", {
    x: M, y: 0.74, w: CW, h: 0.62, fontFace: F, fontSize: 33, bold: true, color: W, margin: 0,
  });

  box(s, { x: M, y: 1.62, w: CW, h: 1.18, fill: "1E2A5A", r: 0.16 });
  s.addText("점수  =  최대 이동시간  +  사람 간 편차 × 0.8", {
    x: M, y: 1.72, w: CW, h: 0.62, fontFace: F, fontSize: 27, bold: true, color: W,
    align: "center", margin: 0,
  });
  s.addText("정의는 코드 한 곳에만 있습니다 — 화면마다 다르게 계산되는 일이 없습니다", {
    x: M, y: 2.34, w: CW, h: 0.3, fontFace: F, fontSize: 11.5, color: "8FA3FF", align: "center", margin: 0,
  });

  const hw = (CW - 0.4) / 2;
  // 왼쪽: 왜 최악인가
  s.addText("왜 평균이 아니라 최악인가", {
    x: M, y: 3.06, w: hw, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: W, margin: 0,
  });
  s.addText(
    [
      { text: "평균을 쓰면 3명은 5분, 1명은 90분인 곳이 1위가 됩니다.\n", options: { color: "C3CBEA" } },
      { text: "모임에서 실제로 문제가 되는 건 가장 오래 걸리는 사람입니다.\n\n", options: { color: W, bold: true } },
      { text: "편차를 더한 것은 “다 같이 조금씩”을 “한 명만 많이”보다 낫게 보기 위해서입니다.", options: { color: "C3CBEA" } },
    ],
    { x: M, y: 3.48, w: hw, h: 1.3, fontFace: F, fontSize: 12.5, lineSpacing: 21, margin: 0 }
  );

  // 오른쪽: 후보 목록 문제
  const rx = M + hw + 0.4;
  s.addText("계산식보다 후보 목록이 문제였습니다", {
    x: rx, y: 3.06, w: hw, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: W, margin: 0,
  });
  s.addText(
    [
      { text: "노원+의정부 모임에 종로3가를 추천한 적이 있습니다. 계산은 정확했습니다. ", options: { color: "C3CBEA" } },
      { text: "손으로 고른 후보 28곳에 서울 북부가 통째로 비어 있던 것", options: { color: W, bold: true } },
      { text: "이 원인이었습니다.", options: { color: "C3CBEA" } },
    ],
    { x: rx, y: 3.48, w: hw, h: 0.9, fontFace: F, fontSize: 12.5, lineSpacing: 21, margin: 0 }
  );

  const rows = [
    { a: "종로3가", b: "중심에서 14.8km", c: "98분", bad: true },
    { a: "도봉산역", b: "중심에서 0.9km  ·  실제 정답", c: "32분", bad: false },
  ];
  rows.forEach((r, i) => {
    const y = 4.5 + i * 0.62;
    box(s, { x: rx, y, w: hw, h: 0.52, fill: r.bad ? "3A2233" : "163A2C", r: 0.1 });
    s.addText(r.a, {
      x: rx + 0.24, y, w: 1.5, h: 0.52, fontFace: F, fontSize: 13, bold: true,
      color: r.bad ? "FF9C80" : "58D69A", valign: "middle", margin: 0,
    });
    s.addText(r.b, {
      x: rx + 1.72, y, w: 2.6, h: 0.52, fontFace: F, fontSize: 11,
      color: r.bad ? "AFBDF0" : "58D69A", valign: "middle", margin: 0,
    });
    s.addText("최대 " + r.c, {
      x: rx + hw - 1.7, y, w: 1.46, h: 0.52, fontFace: F, fontSize: 13, bold: true, color: W,
      align: "right", valign: "middle", margin: 0,
    });
  });

  s.addText("목록에 없으면 아무리 좋아도 1위가 될 수 없습니다. 그래서 후보를 지도 API의 실제 지하철역으로 바꿨습니다.", {
    x: M, y: 6.1, w: CW, h: 0.32, fontFace: F, fontSize: 12, bold: true, color: "8FA3FF", margin: 0,
  });

  s.addNotes("이 슬라이드가 '우리가 뭘 배웠나'를 보여준다. 알고리즘을 고친 게 아니라 입력을 고쳤다는 점을 강조.");
  footer(s, true);
}

// ───────────────────────────────────────────── 10 정직성
{
  const s = newLight();
  head(s, "핵심 기능 ③", "모르는 값을 아는 척하지 않습니다");

  box(s, { x: M, y: 1.78, w: CW, h: 0.78, fill: CORAL_SOFT, r: 0.14 });
  s.addText(
    [
      { text: "외부 API가 “82분 · 0원 · 환승 0회”라는 빈 응답을 줬는데 앱이 그대로 “실시간”이라고 적은 적이 있습니다. ", options: { color: "8C2E12" } },
      { text: "그 뒤로 정직함을 코드가 강제하게 만들었습니다.", options: { color: "8C2E12", bold: true } },
    ],
    { x: M + 0.4, y: 1.78, w: CW - 0.8, h: 0.78, fontFace: F, fontSize: 13, valign: "middle", margin: 0 }
  );

  const rules = [
    { k: "표시", t: "“실시간”을 없앴다", b: "출발 시각을 API에 보내지 않으므로 실제 API 값도 실시간이 아닙니다. “경로 기준” / “거리 추정” 두 단어로 통일." },
    { k: "단위", t: "사람 단위로 밝힌다", b: "실측 3건 + 추정 1건이 섞여 넷 다 “실시간”이던 적이 있습니다. 이제 한 명이라도 추정이 섞이면 배지가 바뀝니다." },
    { k: "별점", t: "가짜 별점을 지웠다", b: "데모용 4.3~4.7을 삭제하고 0 = “정보 없음”이라는 규약을 세웠습니다. 별이 없으면 안 그립니다." },
    { k: "경로", t: "직선은 직선이라 한다", b: "경로선이 직선 근사면 점선으로 그리고 그렇다고 적습니다. 결과 버튼도 “예약하기”가 아니라 “메뉴 보기”입니다." },
  ];
  const bw = (CW - 3 * 0.22) / 4;
  rules.forEach((r, i) => {
    const x = M + i * (bw + 0.22);
    box(s, { x, y: 2.78, w: bw, h: 2.4, fill: W, line: LINE, shadow: true });
    pill(s, { x: x + 0.32, y: 3.04, w: 0.78, h: 0.32, t: r.k, fill: BLUE_SOFT, color: BLUE_D, fs: 10.5 });
    s.addText(r.t, {
      x: x + 0.32, y: 3.5, w: bw - 0.64, h: 0.62, fontFace: F, fontSize: 14.5, bold: true,
      color: INK, lineSpacing: 21, margin: 0,
    });
    s.addText(r.b, {
      x: x + 0.32, y: 4.14, w: bw - 0.64, h: 0.94, fontFace: F, fontSize: 10.5, color: MUTED,
      lineSpacing: 16, valign: "top", margin: 0,
    });
  });

  box(s, { x: M, y: 5.42, w: CW, h: 0.95, fill: INK, r: 0.14 });
  s.addText(
    [
      { text: "API 키가 하나도 없어도 전체 흐름이 끝까지 돕니다. ", options: { color: W, bold: true } },
      { text: "외부 API 4종 모두 대체 동작이 있어 팀원이 키 없이 개발·시연할 수 있습니다. 다만 ", options: { color: "C3CBEA" } },
      { text: "대체 동작으로 나온 값은 절대 실제인 척하지 않습니다", options: { color: "FFB39E", bold: true } },
      { text: " — 이 둘이 같이 지켜져야 의미가 있습니다.", options: { color: "C3CBEA" } },
    ],
    { x: M + 0.4, y: 5.42, w: CW - 0.8, h: 0.95, fontFace: F, fontSize: 12.5, valign: "middle", lineSpacing: 19, margin: 0 }
  );

  s.addNotes("멘토가 가장 높게 평가한 부분. '되는 것처럼 보이는 것'과 '되는 것'의 차이.");
  footer(s);
}

// ───────────────────────────────────────────── 11 중간발표 이후
{
  const s = newLight();
  head(s, "중간발표 이후", "일주일 동안 달라진 것", "8/14 중간발표 → 8/21 최종발표");

  const items = [
    { t: "Vercel 배포", b: "노트북 LAN 시연 → 인터넷 어디서나. 청중이 자기 폰으로 직접 들어옵니다.", tag: "가장 큰 변화", hot: true },
    { t: "홈 첫 화면 지도", b: "출발지를 넣기 전에도 지도가 보입니다. 빈 화면이 첫인상이던 문제를 없앴습니다." },
    { t: "시연 영상 자동 촬영", b: "npm run demo — 발표 시나리오를 브라우저가 대신 눌러 영상으로 남깁니다. 네트워크가 죽어도 보여줄 수 있습니다.", tag: "대비책" },
    { t: "역 스냅 실 키 검증", b: "키가 있어야만 검증되는 계약이라 전용 점검 스크립트를 만들어 사당역·봉담으로 확인했습니다." },
    { t: "CI 두 벌 통과", b: "기능 스위치를 끈 판/켠 판을 각각 돌립니다. 안 돌려보는 기능은 죽은 코드입니다." },
  ];

  const bw = (CW - 0.24) / 2;
  items.forEach((it, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x = M + col * (bw + 0.24);
    const y = 1.95 + row * 1.45;
    box(s, { x, y, w: bw, h: 1.28, fill: it.hot ? BLUE : W, line: it.hot ? null : LINE, shadow: !it.hot });
    badge(s, {
      x: x + 0.3, y: y + 0.42, d: 0.44, t: String(i + 1),
      fill: it.hot ? W : BLUE_SOFT, color: it.hot ? BLUE : BLUE_D, fs: 13,
    });
    s.addText(it.t, {
      x: x + 0.9, y: y + 0.22, w: bw - 2.4, h: 0.36, fontFace: F, fontSize: 15, bold: true,
      color: it.hot ? W : INK, valign: "middle", margin: 0,
    });
    if (it.tag) {
      pill(s, {
        x: x + bw - 1.42, y: y + 0.26, w: 1.12, h: 0.3, t: it.tag,
        fill: it.hot ? "1B3FCC" : AMBER_SOFT, color: it.hot ? "C6D2FF" : AMBER, fs: 9.5,
      });
    }
    s.addText(it.b, {
      x: x + 0.9, y: y + 0.62, w: bw - 1.2, h: 0.6, fontFace: F, fontSize: 11.5,
      color: it.hot ? "D3DCFF" : MUTED, lineSpacing: 17, margin: 0,
    });
  });

  box(s, { x: M + bw + 0.24, y: 1.95 + 2 * 1.45, w: bw, h: 1.28, fill: TINT });
  s.addText("남은 것은 발표 리허설뿐입니다", {
    x: M + bw + 0.54, y: 4.98, w: bw - 0.6, h: 0.34, fontFace: F, fontSize: 14, bold: true, color: INK, margin: 0,
  });
  s.addText("배포본으로 4명이 실제 폰에서 한 번 완주 · 발표장 Wi-Fi 확인 · 영상 대비책 재생 점검", {
    x: M + bw + 0.54, y: 5.36, w: bw - 0.6, h: 0.6, fontFace: F, fontSize: 11.5, color: MUTED, lineSpacing: 17, margin: 0,
  });

  s.addNotes("중간발표를 본 청중에게 '일주일 동안 뭘 했나'를 답하는 슬라이드. 1번(배포)이 오늘 시연 구조를 바꿨다는 점이 핵심.");
  footer(s);
}

// ───────────────────────────────────────────── 12 숫자판 (dark)
{
  const s = newDark();
  s.addText("완성도", {
    x: M, y: 0.44, w: CW, h: 0.26, fontFace: F, fontSize: 12, bold: true, color: "8FA3FF", charSpacing: 1.5, margin: 0,
  });
  s.addText("숫자로 본 지금 상태", {
    x: M, y: 0.74, w: CW, h: 0.62, fontFace: F, fontSize: 33, bold: true, color: W, margin: 0,
  });

  const stats = [
    { v: "11/11", l: "설계 화면 구현", s: "v19 설계서 기준" },
    { v: "78", l: "브라우저 자동 테스트", s: "조건 검사 305개" },
    { v: "4대", l: "기기 동시 리허설", s: "자동 판정 15개 통과" },
    { v: "29", l: "서버 동작 종류", s: "창구 1곳으로 통일" },
    { v: "18,324", l: "코드 줄 수", s: "소스 파일 92개" },
    { v: "120", l: "커밋", s: "팀원 4명 · 3주" },
  ];
  const bw = (CW - 2 * 0.26) / 3;
  const bh = 1.72;
  stats.forEach((st, i) => {
    const x = M + (i % 3) * (bw + 0.26);
    const y = 1.72 + Math.floor(i / 3) * (bh + 0.26);
    box(s, { x, y, w: bw, h: bh, fill: "1E2A5A", r: 0.16 });
    s.addText(st.v, {
      x: x + 0.36, y: y + 0.24, w: bw - 0.72, h: 0.72, fontFace: F, fontSize: 40, bold: true,
      color: W, margin: 0,
    });
    s.addText(st.l, {
      x: x + 0.36, y: y + 1.0, w: bw - 0.72, h: 0.3, fontFace: F, fontSize: 13, bold: true,
      color: "8FA3FF", margin: 0,
    });
    s.addText(st.s, {
      x: x + 0.36, y: y + 1.3, w: bw - 0.72, h: 0.28, fontFace: F, fontSize: 10.5, color: "6E77A0", margin: 0,
    });
  });

  s.addText(
    [
      { text: "되는 것: ", options: { color: "58D69A", bold: true } },
      { text: "모임 생성 → 초대 링크 → 참여 → 지역 투표 → 확정 → 가게 투표 → 결과 전 구간 완주 · 4명이 동시에 눌러도 표가 유실되지 않음 · 지도·경로 API 키가 없어도 전체 흐름 동작", options: { color: "C3CBEA" } },
    ],
    { x: M, y: 5.62, w: CW, h: 0.8, fontFace: F, fontSize: 12.5, lineSpacing: 20, margin: 0 }
  );

  s.addNotes("숫자를 다 읽지 말 것. 11/11 과 78 만 짚고 아래 '되는 것' 한 줄을 읽는다.");
  footer(s, true);
}

// ───────────────────────────────────────────── 13 기술 구조
{
  const s = newLight();
  head(s, "기술 구조", "단순하게 — 대신 규칙을 지킵니다");

  const lw = 5.9;
  const stack = [
    ["화면", "Next.js 14 App Router · TypeScript · 순수 CSS"],
    ["상태", "useState + 1.8초 폴링 (상태관리 라이브러리 없음)"],
    ["서버", "Next.js API Routes · 창구 1곳으로 동작 29종"],
    ["DB", "Neon PostgreSQL · 키 없으면 인메모리로 자동 전환"],
    ["외부", "카카오맵·로컬 · ODsay(대중교통) · TMAP(자차)"],
    ["배포", "Vercel · PWA → 안드로이드 APK 포장 가능"],
  ];
  s.addText("스택", {
    x: M, y: 1.8, w: lw, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: BLUE, margin: 0,
  });
  box(s, { x: M, y: 2.18, w: lw, h: 3.02, fill: TINT });
  stack.forEach((r, i) => {
    const y = 2.36 + i * 0.47;
    s.addText(r[0], {
      x: M + 0.32, y, w: 0.85, h: 0.36, fontFace: F, fontSize: 12, bold: true, color: BLUE_D, valign: "middle", margin: 0,
    });
    s.addText(r[1], {
      x: M + 1.2, y, w: lw - 1.5, h: 0.36, fontFace: F, fontSize: 12, color: "3C4460", valign: "middle", margin: 0,
    });
  });

  const rx = M + lw + 0.42;
  const rw = CW - lw - 0.42;
  s.addText("지켜야 살아남는 규칙", {
    x: rx, y: 1.8, w: rw, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: BLUE, margin: 0,
  });
  const rules = [
    ["화면은 DB를 직접 부르지 않는다", "항상 서버 창구를 거친다"],
    ["저장 단위를 쪼갠다", "모임 / 참가자 / 표 한 장. 한 행에 담으면 동시 투표에 표가 사라진다"],
    ["실제 성공값만 캐시한다", "폴백을 캐시하면 나중에 키를 넣어도 계속 가짜가 나온다"],
    ["만드는 중인 기능은 스위치 뒤에", "절반만 된 상태로 합쳐도 남의 화면이 안 깨진다"],
  ];
  rules.forEach((r, i) => {
    const y = 2.18 + i * 0.78;
    box(s, { x: rx, y, w: rw, h: 0.68, fill: W, line: LINE, shadow: true });
    badge(s, { x: rx + 0.24, y: y + 0.16, d: 0.36, t: String(i + 1), fill: BLUE_SOFT, color: BLUE_D, fs: 11 });
    s.addText(r[0], {
      x: rx + 0.72, y: y + 0.08, w: rw - 1.0, h: 0.28, fontFace: F, fontSize: 12.5, bold: true, color: INK, margin: 0,
    });
    s.addText(r[1], {
      x: rx + 0.72, y: y + 0.35, w: rw - 1.0, h: 0.26, fontFace: F, fontSize: 10.5, color: MUTED, margin: 0,
    });
  });

  box(s, { x: M, y: 5.48, w: CW, h: 0.88, fill: INK, r: 0.14 });
  s.addText(
    [
      { text: "팀 협업 — ", options: { color: W, bold: true } },
      { text: "공용 파일 10개는 통합 담당자 소유(GitHub이 리뷰를 강제) · 한 파일 400줄 상한 · 기능 스위치는 상수가 아니라 환경변수로", options: { color: "C3CBEA" } },
    ],
    { x: M + 0.4, y: 5.48, w: CW - 0.8, h: 0.88, fontFace: F, fontSize: 12.5, valign: "middle", margin: 0 }
  );

  s.addNotes("라이브러리를 적게 쓴 것이 자랑이 아니라, 적게 쓴 대신 규칙을 문서화했다는 것이 요점.");
  footer(s);
}

// ───────────────────────────────────────────── 14 검증
{
  const s = newLight();
  head(s, "검증 체계", "“빌드가 통과했다”를 믿지 않습니다");

  s.addText(
    [
      { text: "타입검사도 빌드도 통과했는데 모임 화면이 통째로 하얗게 뜬 적이 있습니다. ", options: { color: MUTED } },
      { text: "그 사고 하나가 저희 검증 원칙 “눈 · 버튼 · 로그 3관점”을 만들었습니다.", options: { color: INK, bold: true } },
    ],
    { x: M, y: 1.72, w: CW, h: 0.4, fontFace: F, fontSize: 13, margin: 0 }
  );

  const layers = [
    { n: "1층", t: "커밋 전 관문", b: "타입검사 → 빌드 → 실제 브라우저로 클릭. 개발 서버가 아니라 빌드 결과물을 띄웁니다.", k: "테스트 78개 · 조건 검사 305개" },
    { n: "2층", t: "GitHub CI", b: "PR마다 스위치 끈 판 / 켠 판 2벌. 안 돌려보는 기능은 “켤 수 있어 보이는 죽은 코드”입니다. 키를 일부러 안 넣습니다.", k: "PR 1건당 테스트 156회 실행" },
    { n: "3층", t: "4대 기기 리허설", b: "브라우저 4개를 독립된 기기로 띄워 발표 시나리오를 통째로 리허설. “4명이 각자 등록됐는가”를 셉니다.", k: "자동 판정 15개 · 스크린샷 16장" },
  ];
  const bw = (CW - 0.44) / 3;
  layers.forEach((l, i) => {
    const x = M + i * (bw + 0.22);
    box(s, { x, y: 2.3, w: bw, h: 2.72, fill: W, line: LINE, shadow: true });
    pill(s, { x: x + 0.34, y: 2.58, w: 0.78, h: 0.34, t: l.n, fill: BLUE, color: W, fs: 11.5 });
    s.addText(l.t, {
      x: x + 0.34, y: 3.06, w: bw - 0.68, h: 0.36, fontFace: F, fontSize: 17, bold: true, color: INK, margin: 0,
    });
    s.addText(l.b, {
      x: x + 0.34, y: 3.5, w: bw - 0.68, h: 1.1, fontFace: F, fontSize: 11.5, color: MUTED, lineSpacing: 18, margin: 0,
    });
    pill(s, { x: x + 0.34, y: 4.58, w: bw - 0.68, h: 0.34, t: l.k, fill: TINT, color: BLUE_D, fs: 10.5 });
  });

  const notes = [
    ["그 검증이 정말 잡는지도 확인했습니다.", "일부러 화면을 깨뜨리고 돌린 출력이 문서에 남아 있습니다 — “빌드 통과 / 브라우저 테스트만 실패”"],
    ["설계서가 곧 테스트 목록입니다.", "설계 문서의 조항 번호를 테스트 이름에 그대로 달았습니다 — “§4-⑤ 정원 8명, 9번째는 입장 거부”"],
  ];
  const nw = (CW - 0.24) / 2;
  notes.forEach((n, i) => {
    const x = M + i * (nw + 0.24);
    box(s, { x, y: 5.28, w: nw, h: 1.08, fill: TINT });
    s.addText(n[0], {
      x: x + 0.32, y: 5.44, w: nw - 0.64, h: 0.3, fontFace: F, fontSize: 12.5, bold: true, color: INK, margin: 0,
    });
    s.addText(n[1], {
      x: x + 0.32, y: 5.74, w: nw - 0.64, h: 0.52, fontFace: F, fontSize: 11, color: MUTED, lineSpacing: 16, margin: 0,
    });
  });

  s.addNotes("심사위원이 가장 물어볼 만한 슬라이드. '테스트를 몇 개 짰나'가 아니라 '테스트가 진짜 잡는지 확인했나'로 답한다.");
  footer(s);
}

// ───────────────────────────────────────────── 15 겪은 문제
{
  const s = newLight();
  head(s, "겪은 문제 → 해결", "버그가 규칙을 만들었습니다");

  const cases = [
    {
      t: "4명이 동시에 투표하면 표가 조용히 사라졌다",
      c: "모임 정보를 DB 한 행에 통째로 담았습니다. 나중에 저장된 쪽이 앞선 쪽을 덮어썼습니다.",
      f: "저장 단위를 모임 / 참가자 / 표 셋으로 쪼개고, “1인 1표”를 DB 기본키가 강제하게 했습니다.",
    },
    {
      t: "한 명이 멀면 중간지점이 충북 산속으로 갔다",
      c: "좌표를 평균 낸 무게중심을 썼습니다. 평균은 거리의 제곱합을 줄여 멀리 있는 한 명의 영향이 과도해집니다.",
      f: "거리의 합을 최소화하는 기하 중앙값으로 바꿔 서울 2km 지점으로 잡혔습니다.",
    },
    {
      t: "늦게 들어온 사람만 계속 “이동시간 없음”",
      c: "유료 API를 아끼려 250ms 간격 대기열을 뒀는데 기기마다 재계산을 요청했습니다 (후보3 × 인원4 × 기기4 = 48건).",
      f: "같은 구간은 한 번만 계산해 결과를 같이 쓰고, 재계산 요청은 방장 화면만 보냅니다.",
    },
    {
      t: "빌드도 타입검사도 통과했는데 화면이 안 그려졌다",
      c: "React 훅을 조건부 return 아래에 뒀습니다. 문법도 타입도 맞지만 특정 조건에서 화면이 안 나옵니다.",
      f: "실제 브라우저 테스트를 커밋 관문에 넣고, 일부러 깨뜨려 그 테스트가 잡는 것까지 확인했습니다.",
    },
  ];

  const rh = 1.12;
  cases.forEach((c, i) => {
    const y = 1.78 + i * (rh + 0.16);
    box(s, { x: M, y, w: CW, h: rh, fill: W, line: LINE, shadow: true });
    badge(s, { x: M + 0.3, y: y + 0.34, d: 0.44, t: "!", fill: CORAL, fs: 16 });
    s.addText(c.t, {
      x: M + 0.94, y: y + 0.16, w: CW - 1.3, h: 0.34, fontFace: F, fontSize: 14, bold: true, color: INK, valign: "middle", margin: 0,
    });
    s.addText(
      [
        { text: "원인  ", options: { color: CORAL, bold: true } },
        { text: c.c, options: { color: MUTED } },
      ],
      { x: M + 0.94, y: y + 0.52, w: (CW - 1.3) / 2 - 0.1, h: 0.5, fontFace: F, fontSize: 10.5, lineSpacing: 15, margin: 0 }
    );
    s.addText(
      [
        { text: "해결  ", options: { color: GREEN, bold: true } },
        { text: c.f, options: { color: MUTED } },
      ],
      { x: M + 0.94 + (CW - 1.3) / 2 + 0.1, y: y + 0.52, w: (CW - 1.3) / 2 - 0.1, h: 0.5, fontFace: F, fontSize: 10.5, lineSpacing: 15, margin: 0 }
    );
  });

  s.addNotes("네 건 다 읽지 말고 1번(동시 투표)과 4번(빌드 통과)만 말한다. 나머지는 질문 오면.");
  footer(s);
}

// ───────────────────────────────────────────── 16 한계 · 앞으로
{
  const s = newLight();
  head(s, "솔직한 한계 · 앞으로", "못 한 것을 먼저 말씀드립니다");

  const lw = (CW - 0.3) / 2;
  box(s, { x: M, y: 1.8, w: lw, h: 3.6, fill: CORAL_SOFT, r: 0.14 });
  s.addText("아직 못 한 것", {
    x: M + 0.36, y: 2.06, w: lw - 0.72, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: "8C2E12", margin: 0,
  });
  const gaps = [
    ["실환경 검증이 덜 끝났습니다", "개발 환경에는 키가 없어 이동시간이 전부 “거리 추정”으로 나옵니다. 키가 있는 기계에서만 확인되는 계약이 남아 있습니다."],
    ["스스로 정한 규칙을 못 지킨 곳이 있습니다", "한 파일 400줄 상한을 정했는데 8개 파일이 이를 넘었습니다 (가장 큰 것 1,799줄)."],
    ["범위 밖으로 둔 것", "결제는 모의결제이고, 이동수단은 대중교통·자차 2종입니다. 캘린더는 내보내기만 됩니다."],
  ];
  let gy = 2.56;
  gaps.forEach((g) => {
    s.addText(g[0], {
      x: M + 0.36, y: gy, w: lw - 0.72, h: 0.28, fontFace: F, fontSize: 12.5, bold: true,
      color: "8C2E12", valign: "top", margin: 0,
    });
    s.addText(g[1], {
      x: M + 0.36, y: gy + 0.3, w: lw - 0.72, h: 0.6, fontFace: F, fontSize: 11, color: "9C5540",
      lineSpacing: 16, valign: "top", margin: 0,
    });
    gy += 0.94;
  });

  const rx = M + lw + 0.3;
  box(s, { x: rx, y: 1.8, w: lw, h: 3.6, fill: TINT });
  s.addText("다음에 할 것", {
    x: rx + 0.36, y: 2.06, w: lw - 0.72, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: BLUE_D, margin: 0,
  });
  const nexts = [
    ["카카오톡 알리기 상시화", "지금은 결과 화면 한 곳뿐 — 지역 확정·투표 시작 때도 단톡방으로"],
    ["이동수단 4종 확장", "지금은 대중교통·자차 2종 (도보·자전거 추가)"],
    ["안드로이드 APK 포장", "PWA → TWA. 지금 웹앱이 그대로 앱이 됩니다"],
    ["폴링 → 실시간 연결", "1.8초 폴링을 WebSocket/SSE 로. Neon 은 Realtime 이 없어 자체 서버가 필요합니다"],
  ];
  let ny = 2.5;
  nexts.forEach((n, i) => {
    badge(s, { x: rx + 0.36, y: ny + 0.02, d: 0.34, t: String(i + 1), fill: BLUE, fs: 11 });
    s.addText(n[0], {
      x: rx + 0.82, y: ny, w: lw - 1.2, h: 0.28, fontFace: F, fontSize: 12.5, bold: true, color: INK, margin: 0,
    });
    s.addText(n[1], {
      x: rx + 0.82, y: ny + 0.3, w: lw - 1.2, h: 0.36, fontFace: F, fontSize: 10.5, color: MUTED, margin: 0,
    });
    ny += 0.74;
  });

  box(s, { x: M, y: 5.6, w: CW, h: 0.78, fill: INK, r: 0.14 });
  s.addText(
    [
      { text: "이 슬라이드를 넣은 이유 — ", options: { color: "8FA3FF", bold: true } },
      { text: "저희가 이 프로젝트에서 배운 가장 큰 것이 ", options: { color: "C3CBEA" } },
      { text: "“되는 것처럼 보이는 것”과 “되는 것”은 다르다", options: { color: W, bold: true } },
      { text: "는 점이라, 발표 자료에서도 같은 기준을 지키는 것이 맞다고 판단했습니다.", options: { color: "C3CBEA" } },
    ],
    { x: M + 0.4, y: 5.6, w: CW - 0.8, h: 0.78, fontFace: F, fontSize: 12, valign: "middle", margin: 0 }
  );

  s.addNotes("한계를 먼저 말하는 것이 이 팀의 브랜드다. 심사위원이 찾아낼 것을 우리가 먼저 말한다.");
  footer(s);
}

// ───────────────────────────────────────────── 17 마무리 (dark)
{
  const s = newDark();
  s.addShape(pres.ShapeType.ellipse, {
    x: -2.2, y: 4.2, w: 6.4, h: 6.4, fill: { color: BLUE, transparency: 86 }, line: { type: "none" },
  });

  s.addText("감사합니다", {
    x: M, y: 1.3, w: 7.5, h: 0.8, fontFace: F, fontSize: 44, bold: true, color: W, margin: 0,
  });
  s.addText(
    [
      { text: "“어디서 만날까?”에 답을 내는 데 ", options: { color: "C3CBEA" } },
      { text: "3분", options: { color: W, bold: true } },
    ],
    { x: M, y: 2.24, w: 7.5, h: 0.44, fontFace: F, fontSize: 21, margin: 0 }
  );
  s.addText("출발지를 넣고 · 지도를 한 번 누르고 · 방장이 확정한다.\n그 사이의 모든 계산과 합의 절차를 모이머가 맡습니다.", {
    x: M, y: 2.82, w: 7.2, h: 0.8, fontFace: F, fontSize: 14, color: "AFBDF0", lineSpacing: 24, margin: 0,
  });

  pill(s, { x: M, y: 3.9, w: 2.6, h: 0.44, t: "지금 시연합니다", fill: BLUE, color: W, fs: 13 });
  pill(s, { x: M + 2.76, y: 3.9, w: 1.7, h: 0.44, t: "질문 환영", fill: "1E2A5A", color: "AFBDF0", fs: 13 });

  s.addShape(pres.ShapeType.line, { x: M, y: 5.0, w: 7.5, h: 0, line: { color: "2E3968", width: 1 } });
  s.addText("브레인 스파크  ·  최병현 · 김유환 · 양성은 · 신동원        멘토 최종원", {
    x: M, y: 5.2, w: 7.6, h: 0.32, fontFace: F, fontSize: 12.5, color: "AFBDF0", margin: 0,
  });
  s.addText("기술 상세는 뒤에 부록으로 준비했습니다 — 질문 주시면 그쪽을 보여드리겠습니다.", {
    x: M, y: 5.58, w: 7.6, h: 0.3, fontFace: F, fontSize: 11, color: "6E77A0", margin: 0,
  });

  box(s, { x: 8.75, y: 1.55, w: 3.85, h: 4.35, r: 0.2, fill: W });
  s.addImage({ data: "image/png;base64," + QR_PNG, x: 9.63, y: 1.95, w: 2.1, h: 2.1 });
  s.addText("여러분 폰에서 바로 열립니다", {
    x: 8.95, y: 4.2, w: 3.45, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: INK,
    align: "center", margin: 0,
  });
  s.addText(URL, {
    x: 8.95, y: 4.58, w: 3.45, h: 0.3, fontFace: F, fontSize: 9.5, bold: true, color: BLUE,
    align: "center", margin: 0,
  });
  s.addText("설치 없이 · 회원가입 없이\n링크를 연 사람은 바로 참여자가 됩니다", {
    x: 8.95, y: 4.98, w: 3.45, h: 0.6, fontFace: F, fontSize: 10.5, color: MUTED,
    align: "center", lineSpacing: 15, margin: 0,
  });

  s.addNotes("QR을 띄운 채로 질의응답을 받는다. 청중이 직접 만지는 동안 질문이 나온다.");
  footer(s, true);
}

// ───────────────────────────────────────────── 18 부록 표지
{
  const s = newDark();
  s.addText("부록 · Appendix", {
    x: M, y: 2.5, w: CW, h: 0.36, fontFace: F, fontSize: 13, bold: true, color: "8FA3FF", charSpacing: 1.5, margin: 0,
  });
  s.addText("기술 상세", {
    x: M, y: 2.9, w: CW, h: 0.9, fontFace: F, fontSize: 46, bold: true, color: W, margin: 0,
  });
  s.addText(
    [
      { text: "본편에서는 ", options: { color: "C3CBEA" } },
      { text: "무엇을 왜 만들었는지", options: { color: W, bold: true } },
      { text: "를 말씀드렸습니다. 여기서부터는 ", options: { color: "C3CBEA" } },
      { text: "어떻게 만들었고 어떻게 검증했는지", options: { color: W, bold: true } },
      { text: "입니다.", options: { color: "C3CBEA" } },
    ],
    { x: M, y: 3.95, w: 8.5, h: 0.5, fontFace: F, fontSize: 14, margin: 0 }
  );

  const toc = ["19. 배포 구성 — Vercel · Neon · 외부 API", "20. 팀 협업 체계 — 4명이 같은 코드를 만질 때", "21. AI 활용 — 무엇을 맡기고 무엇을 맡기지 않았나"];
  toc.forEach((t, i) => {
    s.addText(t, {
      x: M, y: 4.75 + i * 0.42, w: 8.5, h: 0.34, fontFace: F, fontSize: 12.5, color: "8FA3FF", margin: 0,
    });
  });
  s.addNotes("질문이 나오면 여기서부터 펼친다. 시간이 없으면 건너뛴다.");
  footer(s, true, "부록 · 모이머");
}

// ───────────────────────────────────────────── 19 배포 구성
{
  const s = newLight();
  head(s, "부록 · 배포 구성", "노트북에서만 돌던 것을 인터넷에 올렸습니다");

  const nodes = [
    { t: "청중 폰 / 노트북", b: "브라우저만 있으면 됩니다.\nPWA 라 홈 화면에 추가도 됩니다.", fill: TINT, c: INK },
    { t: "Vercel", b: "Next.js 서버리스.\nGitHub main 에 머지하면 자동 배포.", fill: BLUE, c: W },
    { t: "Neon PostgreSQL", b: "모임 / 참가자 / 표 3개 테이블.\n키가 없으면 인메모리로 자동 전환.", fill: TINT, c: INK },
  ];
  const bw = 3.4;
  const gap = (CW - bw * 3) / 2;
  nodes.forEach((n, i) => {
    const x = M + i * (bw + gap);
    box(s, { x, y: 1.9, w: bw, h: 1.5, fill: n.fill, line: n.fill === TINT ? null : null, shadow: false });
    s.addText(n.t, {
      x: x + 0.3, y: 2.12, w: bw - 0.6, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: n.c, margin: 0,
    });
    s.addText(n.b, {
      x: x + 0.3, y: 2.52, w: bw - 0.6, h: 0.7, fontFace: F, fontSize: 11, color: n.fill === BLUE ? "D3DCFF" : MUTED,
      lineSpacing: 17, margin: 0,
    });
    if (i < 2) {
      s.addText("→", {
        x: x + bw, y: 2.4, w: gap, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: MUTED_D,
        align: "center", valign: "middle", margin: 0,
      });
    }
  });

  s.addText("외부 API 4종 — 전부 대체 동작이 있습니다", {
    x: M, y: 3.68, w: CW, h: 0.32, fontFace: F, fontSize: 13.5, bold: true, color: BLUE, margin: 0,
  });
  const apis = [
    ["카카오맵 SDK", "지도 표시", "키 없으면 대체 지도 — 누른 자리를 좌표로 되돌립니다"],
    ["카카오 로컬", "장소 검색 · 지오코딩 · 역 스냅", "키 없으면 mock 목록"],
    ["ODsay", "대중교통 이동시간", "키 없으면 직선거리 추정 (배지가 “거리 추정”으로 바뀝니다)"],
    ["TMAP", "자차 이동시간", "키 없으면 직선거리 추정"],
  ];
  apis.forEach((a, i) => {
    const y = 4.06 + i * 0.55;
    box(s, { x: M, y, w: CW, h: 0.46, fill: i % 2 === 0 ? TINT : W, r: 0.08 });
    s.addText(a[0], {
      x: M + 0.28, y, w: 1.8, h: 0.46, fontFace: F, fontSize: 11.5, bold: true, color: INK, valign: "middle", margin: 0,
    });
    s.addText(a[1], {
      x: M + 2.15, y, w: 2.6, h: 0.46, fontFace: F, fontSize: 11, color: "3C4460", valign: "middle", margin: 0,
    });
    s.addText(a[2], {
      x: M + 4.85, y, w: CW - 5.1, h: 0.46, fontFace: F, fontSize: 11, color: MUTED, valign: "middle", margin: 0,
    });
  });

  s.addText("⚠ 배포에서 유의할 점 — Vercel 은 나가는 IP 가 유동이라 IP 화이트리스트를 요구하는 ODsay 서버 키를 직접 쓸 수 없습니다. 고정 IP 프록시를 경유하도록 우회로를 만들어 뒀습니다.", {
    x: M, y: 6.34, w: CW, h: 0.32, fontFace: F, fontSize: 10.5, color: AMBER, margin: 0,
  });

  footer(s, false, "부록 · 모이머");
}

// ───────────────────────────────────────────── 20 팀 협업
{
  const s = newLight();
  head(s, "부록 · 팀 협업 체계", "4명이 같은 코드를 동시에 만질 때");

  const items = [
    { t: "공용 파일은 통합 담당자 소유", b: "lib/types.ts · lib/store.ts · app/globals.css 등 10개 파일은 GitHub CODEOWNERS 가 리뷰를 강제합니다. 고쳐야 하면 멈추고 PR 설명에 이유를 씁니다." },
    { t: "한 파일 400줄 상한", b: "넘으면 쪼갭니다. 큰 파일은 AI 가 엉뚱한 곳을 고치고, 두 사람이 동시에 만지면 매일 충돌납니다. (지키지 못한 파일 8개 — 본편 한계 참고)" },
    { t: "만드는 중인 기능은 스위치 뒤에", b: "절반만 된 상태로 통합 브랜치에 들어가도 남의 화면이 안 깨집니다. 스위치는 상수가 아니라 환경변수로 — 브랜치마다 값이 달라지면 합칠 때마다 그 줄에서 충돌납니다." },
    { t: "브랜치 · 버전", b: "main(배포) ← develop(통합) ← feat/* · fix/*. 커밋 접두사가 곧 버전 규칙입니다 (feat: → MINOR, fix: → PATCH). 최종발표일에 1.0.0 을 답니다." },
    { t: "변경 기록은 예외 없이", b: "파일을 바꾸면 CHANGELOG.md 에 “날짜 · 작업자 · 파일 · 내용 · 사유” 한 줄을 남깁니다. 기록 없는 변경은 금지입니다." },
  ];

  const bw = (CW - 0.28) / 2;
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (bw + 0.28);
    const y = 1.85 + row * 1.55;
    const wide = i === 4;
    box(s, { x, y, w: wide ? CW : bw, h: 1.38, fill: W, line: LINE, shadow: true });
    badge(s, { x: x + 0.3, y: y + 0.28, d: 0.44, t: String(i + 1), fill: BLUE_SOFT, color: BLUE_D, fs: 13 });
    s.addText(it.t, {
      x: x + 0.9, y: y + 0.24, w: (wide ? CW : bw) - 1.2, h: 0.34, fontFace: F, fontSize: 14, bold: true, color: INK, margin: 0,
    });
    s.addText(it.b, {
      x: x + 0.9, y: y + 0.62, w: (wide ? CW : bw) - 1.2, h: 0.66, fontFace: F, fontSize: 11,
      color: MUTED, lineSpacing: 17, valign: "top", margin: 0,
    });
  });

  footer(s, false, "부록 · 모이머");
}

// ───────────────────────────────────────────── 21 AI 활용
{
  const s = newLight();
  head(s, "부록 · AI 활용", "무엇을 맡기고 무엇을 맡기지 않았나");

  const lw = (CW - 0.3) / 2;
  box(s, { x: M, y: 1.85, w: lw, h: 2.15, fill: BLUE_SOFT, r: 0.14 });
  s.addText("AI 가 생성한 것", {
    x: M + 0.36, y: 2.08, w: lw - 0.72, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: BLUE_D, margin: 0,
  });
  s.addText("보일러플레이트 · 외부 API 래퍼 · SQL 초안 · 테스트 코드 · 문서 초안 · 리팩터", {
    x: M + 0.36, y: 2.5, w: lw - 0.72, h: 0.62, fontFace: F, fontSize: 12.5, color: "2A3C86",
    lineSpacing: 20, valign: "top", margin: 0,
  });
  s.addText("AI 생성 코드가 포함된 PR 본문에는 그 사실을 표기합니다.", {
    x: M + 0.36, y: 3.34, w: lw - 0.72, h: 0.32, fontFace: F, fontSize: 11, color: "4A5AA0", margin: 0,
  });

  const rx = M + lw + 0.3;
  box(s, { x: rx, y: 1.85, w: lw, h: 2.15, fill: CORAL_SOFT, r: 0.14 });
  s.addText("사람이 판단한 것", {
    x: rx + 0.36, y: 2.08, w: lw - 0.72, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: "8C2E12", margin: 0,
  });
  s.addText("기획 · 범위 결정 · 추천 가중치 값 · 프롬프트 최종본 · 통과 기준 · 수동 QA", {
    x: rx + 0.36, y: 2.5, w: lw - 0.72, h: 0.62, fontFace: F, fontSize: 12.5, color: "8C2E12",
    lineSpacing: 20, valign: "top", margin: 0,
  });
  s.addText("점수식의 0.8 이라는 숫자도, 그 숫자를 쓸지도 팀이 정했습니다.", {
    x: rx + 0.36, y: 3.34, w: lw - 0.72, h: 0.32, fontFace: F, fontSize: 11, color: "9C5540", margin: 0,
  });

  s.addText("AI 에게 규칙을 문서로 줍니다", {
    x: M, y: 4.3, w: CW, h: 0.32, fontFace: F, fontSize: 13.5, bold: true, color: BLUE, margin: 0,
  });
  box(s, { x: M, y: 4.68, w: CW, h: 1.28, fill: TINT });
  s.addText(
    [
      { text: "저장소 최상단의 CLAUDE.md 가 “어떻게 만드는가”를, docs/설계_v19.md 가 “무엇을 만드는가”를 정합니다.\n", options: { color: INK, bold: true } },
      { text: "폴더마다 더 구체적인 규칙 파일을 두어, AI 가 그 폴더에서 작업할 때 먼저 읽게 했습니다. 비용이 드는 외부 API 를 실제로 호출하기 전에는 반드시 사전 경고하고 승인을 받도록 규칙에 못 박아 두었습니다.\n", options: { color: MUTED } },
      { text: "AI 를 잘 쓰는 것은 프롬프트를 잘 쓰는 것이 아니라, 판단 기준을 코드 옆에 문서로 남겨 두는 것이었습니다.", options: { color: BLUE_D, bold: true } },
    ],
    { x: M + 0.4, y: 4.88, w: CW - 0.8, h: 1.15, fontFace: F, fontSize: 11.5, lineSpacing: 19, valign: "top", margin: 0 }
  );

  footer(s, false, "부록 · 모이머");
}

const OUT = path.join(REPO, "docs/발표_최종발표.pptx");
pres.writeFile({ fileName: OUT }).then(() => console.log("생성:", path.relative(REPO, OUT)));
