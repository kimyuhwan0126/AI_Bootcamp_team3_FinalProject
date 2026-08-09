# 인계 문서 (handover)

_최종: 2026-08-09 · 작성: Claude(AI, v19 구현 세션) · 다음 담당: **학교 노트북 세션**_

---

## 🔷 지금 상태 — v19 구현 완료, 발표 준비만 남음

| | |
|---|---|
| 작업 브랜치 | **`claude/moimer-app-foundation-design-ac8zwj`** |
| 최신 커밋 | **`41e772a`** (origin 과 동기화됨 · 워킹트리 깨끗) |
| 기준 문서 | ⭐ [`docs/설계_v19.md`](../docs/설계_v19.md) — 순서도 원본 [`docs/설계도/`](../docs/설계도/) |
| 발표 목표 | 로컬 실행 + 팀원 기기가 **IP 로 접속** → [`docs/발표_로컬시연.md`](../docs/발표_로컬시연.md) |
| 검증 | `npm run verify` → **33 passed** |

**v19 스펙과의 기능 차이는 없다.** 커밋 13개로 11개 항목을 전부 옮겼다
(진행표는 `status.md` 최상단).

---

## 새 기기에서 시작하기 (학교 노트북)

```bash
git clone https://github.com/kimyuhwan0126/AI_Bootcamp_team3_FinalProject.git
cd AI_Bootcamp_team3_FinalProject
git checkout claude/moimer-app-foundation-design-ac8zwj

node -v          # v22 여야 한다 (.nvmrc)
npm install
npm run verify   # tsc + build + 테스트 33개 (인터넷 필요 — 크롬 자동 설치)
npm run dev      # http://localhost:3100
```

> **`.env.local` 은 만들지 않아도 된다.** 키가 하나도 없으면 지도·장소·경로가
> 전부 mock 으로 떨어지고 DB 는 인메모리로 돈다 — 첫 확인에는 이 편이 낫다
> (`CLAUDE.md` §3-4). 단 **지도가 도식으로 나오고 지도 핑을 못 누른다.**

이미 클론돼 있으면 `git pull` 만 하면 된다. `package-lock.json` 이 수정됐다고 나오면
`git restore package-lock.json` 후 진행한다 (npm install 이 자동 생성하는 파일이라 버려도 안전).

---

## 🔴 발표 전 반드시 — 코드가 아니라 준비

1. **카카오 개발자 콘솔 등록 2곳** (`docs/발표_로컬시연.md` §3)
   - 플랫폼 > Web > 사이트 도메인 → `http://<노트북IP>:3100` (지도 SDK)
   - 카카오 로그인 > Redirect URI → `http://<노트북IP>:3100/api/auth/kakao/callback`
   - ⚠️ **IP 가 바뀌면 둘 다 무효다.** 발표장 Wi-Fi(또는 폰 핫스팟) IP 로 당일 확정한다
2. **DB** — 새 Neon 프로젝트를 판다면 `db/schema.sql` **하나만** Run
   (기존 DB 를 이어 쓰면 `db/migrations/001_v19_설계정렬.sql` 을 먼저 Run —
   안 돌리면 모임 생성이 SQL 오류로 실패한다)
3. **리허설** — 4인(방장1+참여3) 전체 플로우 1회, AI 사전 워밍업 (v13)

---

## 플래그 — `.env.local`

| 플래그 | 기본 | 켜면 |
|---|---|---|
| `NEXT_PUBLIC_FF_AI_VOTE=1` | 꺼짐 | **AI 추천 버튼** (방장 전용). 💰 Ollama Cloud(GLM 5.2) 호출 — 안 누르면 0원 |
| `NEXT_PUBLIC_FF_PLACE_RATING=1` | 꺼짐 | 지점 **별점** (카카오맵 웹). ⚠️ 지점 조회가 느려진다 — 리허설에서 실측할 것 |
| `NEXT_PUBLIC_FF_AI_CHAT=1` | 꺼짐 | 앱 안 채팅. v19 는 채팅을 쓰지 않는다 — 켜면 투표 UI 가 채팅으로 **대체**된다 |
| `NEXT_PUBLIC_FF_MOCK_PAY=1` | 꺼짐 | 옛 모의 선입금 UI (v17 에서 폐기). 옛 데이터 열람용 |

---

## 다음에 할 수 있는 일 (우선순위 순)

1. **발표 준비 점검** — 리허설 시나리오 정리, 플래그 조합 확정, 대비책(폰 핫스팟) 확인
2. **방장 카카오 로그인 필수화** (v19 §4-④) — 지금은 강제하지 않는다.
   지금 막으면 키 없이 시연·개발이 불가능해지므로(`CLAUDE.md` §3-4 위반),
   **카카오 키를 넣고 LAN 등록까지 끝난 뒤** 플래그로 켜는 것이 맞다
3. `app/page.tsx`(1,200줄) 분할 — 400줄 규칙 위반이 이 파일에 남아 있다

---

## 이 세션에서 판단한 것들 (되풀이 방지)

- **흐름이 두 번 바뀌었다.** ① 등록 화면에서 바로 투표 → **'투표 시작'을 거쳐야** 함
  ② 지역 확정 시 지점 후보 자동 생성 → **사람이 POI 를 탭해 등록**
  둘 다 v19 규칙이고, 기존 스모크가 옛 흐름을 담고 있어 깨졌다 —
  **가드를 되돌리지 않고 테스트를 새 흐름으로 고쳤다**
- **별점 스크래핑 복원은 팀 결정**이다 (설계_v19.md §13-A).
  playwright 를 `next.config.mjs` 의 `serverComponentsExternalPackages` 로 빼지 않으면
  **빌드가 깨진다** — PR #54 가 스크래핑을 걷어낸 진짜 이유가 이것이었다
- **AI 강등 결과를 후보로 넣지 않는다.** 스코어러 폴백은 AI 가 고른 게 아닌데
  'AI 추천' 태그가 붙으면 거짓말이 된다 (v9)
- **지도 핑은 동 스냅이 먼저다.** 좌표 그대로 두면 3m 옆 핑이 다른 후보가 돼 표가 갈라진다

---
---

## (이전 인계 — 기록 보존)

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
