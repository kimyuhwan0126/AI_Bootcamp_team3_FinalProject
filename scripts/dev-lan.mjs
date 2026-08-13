// ─────────────────────────────────────────────────────────────
// scripts/dev-lan.mjs — 팀원 기기에서 접속할 **실제 주소**를 찍고 개발 서버를 띄운다.
//
//   npm run dev:lan
//
// 왜 필요한가
//   `next dev -H 0.0.0.0` 은 `Network: http://0.0.0.0:3000` 이라고 찍는다.
//   0.0.0.0 은 주소가 아니라 "모든 네트워크 카드로 받겠다"는 뜻이라, 그대로
//   폰에 치면 **폰 자기 자신**을 가리켜 아무것도 안 열린다.
//   발표 당일 이 한 줄 때문에 헤매지 않도록, 진짜 IP 를 우리가 계산해 보여준다.
//   (2026-08-10 실제로 막혔다)
//
// 카카오 콘솔에 등록할 값도 같이 찍는다 — 폰 로그인이 안 되는 원인 1위다.
// ─────────────────────────────────────────────────────────────
import os from "node:os";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3000";

const b = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/**
 * 사설망(집·학교 Wi-Fi) 주소인지. 발표에서 쓰는 건 항상 이 셋 중 하나다.
 * 여기 안 걸리는 주소(VPN·도커 가상 어댑터 등)는 뒤로 밀어서 헷갈리지 않게 한다.
 */
function privateRank(ip) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return 2;
  return 9;
}

const found = [];
for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
  for (const a of addrs ?? []) {
    // Node 18+ 는 family 를 문자열("IPv4")로 준다. 옛 버전은 숫자 4다.
    const isV4 = a.family === "IPv4" || a.family === 4;
    if (!isV4 || a.internal) continue;
    found.push({ name, ip: a.address, rank: privateRank(a.address) });
  }
}
found.sort((x, y) => x.rank - y.rank);

const line = "─".repeat(58);
console.log(`\n${line}`);
if (found.length === 0) {
  console.log(yellow("  ⚠ 접속 가능한 네트워크 주소를 찾지 못했습니다."));
  console.log(dim("    Wi-Fi 가 연결돼 있는지 확인하세요. (유선/무선 모두 꺼져 있으면 이렇게 나옵니다)"));
} else {
  const best = found[0];
  console.log(`  ${b("📱 팀원 기기에서 이 주소로 접속하세요")}`);
  console.log(`\n     ${cyan(b(`http://${best.ip}:${PORT}`))}   ${dim(`(${best.name})`)}`);
  console.log(`     ${dim(`연결 점검:  http://${best.ip}:${PORT}/health`)}`);

  if (found.length > 1) {
    console.log(dim(`\n     안 되면 다른 후보:`));
    for (const f of found.slice(1)) console.log(dim(`       http://${f.ip}:${PORT}  (${f.name})`));
  }

  console.log(`\n  ${b("카카오 개발자 콘솔에 등록할 값")} ${dim("— 이거 없으면 폰에서 로그인이 안 됩니다")}`);
  console.log(`     Redirect URI : ${`http://${best.ip}:${PORT}/api/auth/kakao/callback`}`);
  console.log(`     사이트 도메인 : ${`http://${best.ip}:${PORT}`}   ${dim("(지도용)")}`);
  console.log(dim(`\n  ⚠ 방장도 localhost 가 아니라 위 IP 주소로 접속하세요.`));
  console.log(dim(`     localhost 로 열면 초대 링크가 localhost 로 나가 팀원 폰에서 안 열립니다.`));
}
console.log(`${line}\n`);

// `npm run ip` — 주소만 보고 싶을 때(발표 중 IP 가 바뀌었나 확인). 서버는 안 띄운다.
if (process.argv.includes("--print-only")) process.exit(found.length ? 0 : 1);

console.log(dim(`  아래 Next.js 로그의 "Network: http://0.0.0.0:${PORT}" 은 정상입니다 —`));
console.log(dim(`  "모든 네트워크 카드로 받겠다"는 뜻이지 접속 주소가 아닙니다.\n`));

// Windows 에서도 돌아야 하므로 shell 로 띄운다 (.bin/next.cmd 해석)
const child = spawn(`npx next dev -H 0.0.0.0 -p ${PORT}`, {
  shell: true,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
