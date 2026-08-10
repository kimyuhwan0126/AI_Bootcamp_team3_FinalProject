import { defineConfig, devices } from "@playwright/test";

// 스모크 전용 포트 — **개발 서버(3000)와 부딪히지 않게 따로 쓴다.**
//
// ⚠️ 두 포트를 같게 두지 마라. 아래 `reuseExistingServer` 가 로컬에서 켜져 있어,
//    `npm run dev` 를 띄운 채 `npm run verify` 를 돌리면 **빌드 결과물이 아니라
//    개발 서버를 재사용**한다 — "빌드에서만 나는 오류"를 못 잡게 된다.
//    (한때 dev 가 3100 이라 실제로 겹쳤다. dev=3000 / smoke=3100 이 원래 설계다)
const PORT = Number(process.env.SMOKE_PORT || 3100);
const BASE = `http://127.0.0.1:${PORT}`;

// 컨테이너/CI 에 따라 Playwright 가 찾는 브라우저 경로가 다를 수 있다.
// 미리 설치된 크로미움을 쓰려면 PW_CHROMIUM_PATH 로 알려준다.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // 인메모리 스토어(키 없는 CI)에서는 모임 상태가 프로세스 하나에 있다.
  // 병렬로 돌리면 서로의 시나리오를 밟으므로 직렬로 돈다.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 빌드 결과물을 띄운다 — dev 서버는 빌드에서만 나는 오류를 못 잡는다.
    command: `npx next start -p ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
