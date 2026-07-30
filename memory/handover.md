# 인계 문서 (handover) — v7 목업 작업

_작성: Jarvis(AI, 원격 세션) · 2026-07-24 · 다음 담당: 데스크탑 Claude 세션_

## 지금 넘어가는 작업 (미착수)
**v7 화면 목업 제작** — CEO가 준비한 스크린샷 폴더 기반.

- 스크린샷 폴더(로컬): `C:\Users\user\Downloads\화면 임시 설계`
- 작업 브랜치: `feat/v7-mockup` (develop에서 분기, 푸시됨)
- 산출물: **HTML 목업** (중간 발표 시연용)
- 지도: **OpenStreetMap + Leaflet** (무료·키 불필요) 사용 확정
- **주석 기능 필수**: CEO가 목업 위에 코멘트를 달아 방향을 지시할 수 있어야 함
  (예: 클릭해서 메모 핀 + localStorage 저장 + 내보내기)

## v7 기획 요약 (CEO 설명)
유저 3종: ① 비회원 ② 임시로그인(이름/방코드) ③ 카카오 로그인
- 비회원 홈: 우상단 메뉴 = 모임 생성 / 모임 참여 / 알림 (비회원 사용 여부 미정 → 아마 로그인 유도)
- 프로필 행(종로·사당·잠실…): **비회원도 사용 가능**하게.
  시작 시 "빈 프로필 + [+]" → 프로필 추가로 출발지역들 지정 → **비회원 상태로 중간 추천지역 산출**이 목표
- [+] 아이콘은 알림 밑이 아니라 아래쪽 배치로 이동

## 레포 상태
- `main`: 구 프로토타입 (⚠️ 원격 main이 이 세션 로컬과 다름 — 다른 세션에서 push 있었음. pull 후 확인 필요)
- `develop`: 공통 보일러플레이트 (진입→메인→투표→결과, MOCK 모드, DevBar, Playwright E2E)
  - 원격에서 develop 브랜치가 한 번 사라져 재푸시함 (2a5aa90)
- `feat/v7-mockup`: 이 작업용 새 브랜치 (develop과 동일 지점)

## 미완료/이슈
- [ ] v7 목업 자체 (스크린샷 미수령 상태로 인계)
- [ ] 로컬 Playwright headless shell 설치가 네트워크 타임아웃으로 불안정했음
      → 우회: `set PW_CHROMIUM_PATH=C:\Users\USER\AppData\Local\ms-playwright\chromium-1187\chrome-win\chrome.exe`
- [ ] Figma MCP는 Starter 플랜 호출 한도 초과 상태 (리셋 전까지 사용 불가)

## 다음 AI에게
Constitution/Permissions/Workflow 온보딩 후, 스크린샷 폴더를 읽고
`feat/v7-mockup` 브랜치에서 목업 제작을 이어가면 된다.
