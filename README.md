# 모이머 (Moimer)

> **흩어진 우리, 딱 중간에서.**
> 각자의 출발지에서 가장 공평한 중간 지점을 찾아, 투표로 함께 모임 장소를 정하는 서비스.

Next.js 14 (App Router) + TypeScript + Neon(Postgres). **키가 하나도 없어도 바로 실행됩니다.**

---

## 🚀 빠른 시작

```bash
git clone <이 저장소>
nvm use                        # .nvmrc 의 Node 버전 (22). nvm 없으면 Node 22 설치
npm install
cp .env.example .env.local     # 값은 비워도 됩니다
npm run dev                    # http://localhost:3000
```

키가 없으면 외부 API는 mock으로, DB는 인메모리로 자동 폴백합니다.
**아무 키 없이도 모임 생성 → 투표 → 확정까지 전부 돌아갑니다.**

설정 상태는 `/api/status`(항상), 실제 API 호출까지 확인하려면 `/api-live`(개발 모드 전용).

---

## 👥 팀원이라면 여기부터

| 순서 | 문서 | 내용 |
|---|---|---|
| 1 | [`docs/팀원_온보딩.md`](docs/팀원_온보딩.md) | **⭐ 처음이면 이것 하나만** — 세팅부터 매일 지킬 규칙까지 |
| 2 | [`docs/팀_개발환경.md`](docs/팀_개발환경.md) | 브랜치·소유권 상세 |
| 3 | [`팀원_실행안내.md`](팀원_실행안내.md) | 실제 API 키 · Neon DB 붙이기 |
| 4 | [`CLAUDE.md`](CLAUDE.md) | AI 개발 규칙 (Claude Code · Ollama 공통) |

> ⚠️ **시작하기 전에 커밋 이메일부터 가리세요.** 이 저장소는 **공개**라 커밋에 박힌
> 이메일을 누구나 수집할 수 있습니다 — 온보딩 문서 **0단계**에 방법이 있습니다.

**핵심 규칙 3줄**

1. **자기 담당 파일만 만진다.** 공용 파일(`lib/types.ts` · `lib/store.ts` · `app/globals.css` …)을
   고쳐야 할 것 같으면 멈추고 PR 설명에 이유를 쓴다 → [`.github/CODEOWNERS`](.github/CODEOWNERS)
2. **만드는 중인 기능은 플래그 뒤에** 둔다 → [`lib/flags.ts`](lib/flags.ts), `.env.local` 의 `NEXT_PUBLIC_FF_*`
3. **PR 전에 `npm run verify`.** 타입 + 빌드 + **브라우저 스모크**까지 돈다

> ⚠️ **빌드 통과 ≠ 화면 렌더.** 이 프로젝트에서 `tsc` 와 `build` 를 **둘 다 통과**하고도
> 모임 상세 화면이 통째로 안 그려진 적이 있습니다(훅을 조건부 `return` 뒤에 둔 경우).
> 그래서 CI 가 실제 크로미움을 띄워 핵심 경로를 클릭합니다.

---

## 🧭 화면 흐름

```
스플래시 → 홈(비회원 탐색) → 로그인 → 모임 생성/참여
                                        ↓
          ① 거점 투표   →   ② 가게 투표   →   ③ 최종 확정
          출발지 모으기      확정된 거점의      예약(모의)·캘린더·공유
          공평한 후보 3곳     실제 가게 후보
```

- **비회원도 홈에서 출발지를 넣어 중간지점을 볼 수 있다** — 로그인은 모임을 만들 때부터
- 확정은 **방장**이 한다. 전원 투표를 마치면 "투표 종료 및 확정"으로 강조되고,
  그 전에도 "지금 확정"으로 마감할 수 있다. 최다득표가 아닌 후보로 정하는
  예외 수단(`✍ 다른 후보로 확정`)도 방장에게만 열려 있다
- **후보가 마음에 안 들면 누구나 `＋ 다른 후보 등록`** — 지도 검색으로 직접 후보를 올린다
  (자동 추천이 수도권 밖에서 엉뚱한 곳을 잡을 때의 탈출구)
- **앱 안 채팅은 플래그로 켜는 선택 기능이다.** 기본은 꺼져 있고 대화는 카카오톡에서
  한다는 전제로 화면이 설계돼 있다. AI 파실리테이터 코드는 보존돼 있으며
  `.env.local` 에 `NEXT_PUBLIC_FF_AI_CHAT=1` 을 넣으면 켜진다

---

## 📁 구조

```
app/
  page.tsx                홈 — 출발지 검색·칩(최대 8) → 중간지점 → 주변 리스트
  meetings/page.tsx       모임 탭 — 목록 + 생성/참여/생성완료 모달
  votes/page.tsx          투표함 — 거점/가게 투표 + 단계 트래커
  members/page.tsx        모임원 — 참여자 목록 + 도착 신호등 자가신고
  me/page.tsx             내정보 — 저장 위치 · 기본 이동수단
  m/[code]/               모임 상세 — 출발지 등록 → 거점 투표 → 가게 투표 → 확정
    MeetingClient.tsx     상태·폴링·액션·조립          🔒 통합 담당자
    sections/             화면 조각 15개 (담당자별 소유) 👤 각자
  manifest.ts             PWA 매니페스트 (→ 안드로이드 APK)
  api-live/page.tsx       외부 API 연결 상태 대시보드 (개발용)
  components/
    KakaoMap.tsx          카카오맵 SDK + 핀 + 경로 폴리라인 (키 없으면 스키매틱)
    RouteSheet.tsx        경로 상세 바텀시트 (대중교통 3안 / 자차 3옵션 + 카풀 정산)
    v8/                   헤더 · 하단 5탭 · 스플래시 · 로그인시트 · 단계 아이콘
  api/
    meeting/              모임 상태(GET 폴링) + 액션 14종(POST)
    geocode/              출발지 자동완성 (카카오 키워드 → HUBS mock)
    midpoint/             중간지점 추천 (mode=dist 거리 | mode=time 실 이동시간)
    places/               중간지점 주변 (카페·음식점·술집·주차장·정류장)
    route-path/           경로 폴리라인 (TMAP LineString / ODsay loadLane)
    route-detail/         경로 상세 (환승·요금·통행료·유류비·카풀 정산)
    auth/kakao/           카카오 로그인 + 콜백
    status/ diag/ debug/  설정 상태 · 외부 API 진단 · 시나리오 시드
lib/
  flags.ts                기능 플래그 (NEXT_PUBLIC_FF_*)   🔒 통합 담당자
  scoring/                추천 점수 스코어러 — 파일 하나 = 관점 하나 = 담당자 한 명
  parse.ts                규칙 기반 한국어 파싱 (LLM 없이 날짜·시간·예산 추출)
  calendar.ts             구글 캘린더 · .ics 내보내기
  format.ts               이동시간·거리·요금 표기 (82분 → 1시간 22분)
  store.ts                데이터 계층 (Neon ↔ 인메모리 폴백)
  persistence.ts          Meeting 객체 ↔ DB 행 매핑 (SQL)
  db.ts                   서버 전용 Neon 클라이언트 (DATABASE_URL)
  routing.ts              실 이동시간 + 캐시 + mock 폴백 통합
  geo.ts                  거점 풀 · 거리 추정 · 도착 신호등 판정
  kakao.ts odsay.ts tmap.ts   외부 API 래퍼 (실패 시 null → 상위에서 폴백)
  ai.ts                   AI 파실리테이터 (v8 UI 비활성, 코드 보존)
  session.ts identity.ts  로그인 3단계 · 기기별 참가자 신원
  types.ts                공용 도메인 타입
db/
  schema.sql              DB 스키마 (Neon SQL Editor 에 붙여 한 번 실행)  🔒 통합 담당자
  migrations/             스키마 변경은 여기에 번호 붙인 파일을 **추가**한다
tests/                    Playwright 스모크 (CI 가 실제 브라우저로 돌린다)
docs/
  팀_개발환경.md          브랜치 · 저장소 설정 · 파일 소유권
  버전관리.md             SemVer 규칙 · 릴리스 절차 (발표일 = v1.0.0)
  APK.md                  PWA → 안드로이드 APK (Bubblewrap)
  legacy-algo/            되살릴 알고리즘 8종 (참고용, 빌드 대상 아님)
```

> 폴더에 `CLAUDE.md` 가 있으면 **그쪽이 더 구체적입니다** — 그 폴더에서 작업할 땐 먼저 읽으세요.
> 현재: [`lib/scoring/CLAUDE.md`](lib/scoring/CLAUDE.md) · [`app/m/[code]/CLAUDE.md`](app/m/%5Bcode%5D/CLAUDE.md)

---

## 🔌 외부 API

| API | 쓰는 곳 | 키 없으면 |
|---|---|---|
| 카카오 로컬 (키워드·주소·좌표→주소·카테고리) | 출발지 검색, 가게/주차장/역 검색 | HUBS mock 목록 |
| 카카오맵 JS SDK | 홈·모임 상세 지도 | 스키매틱 지도로 폴백 |
| 카카오 OAuth | 로그인 시트 | 임시 로그인(이름만) |
| ODsay (`searchPubTransPathT`, `loadLane`) | 대중교통 이동시간·경로선 | 직선거리 추정 |
| TMAP (`/tmap/routes`) | 자차 이동시간·통행료·경로선 | 직선거리 추정 |
| Neon Postgres | 모임·참가자·투표 저장 | 인메모리 (재시작 시 소멸) |
| Google 캘린더 / .ics | 최종 확정 화면 | 키 불필요 |

무료 한도를 아끼기 위해 지오코딩·경로는 **성공한 실 API 응답만** 캐시합니다
(폴백은 캐시하지 않아, 키를 나중에 넣어도 자동으로 실값으로 전환됩니다).

---

## 🗄️ 데이터 저장

| 테이블 | 담는 것 | 왜 이렇게 쪼갰나 |
|---|---|---|
| `meetings` | 단계·확정결과 + 후보·대화·선호·예약(jsonb) | 방장·AI만 바꾸고, 항상 통째로 읽는다 |
| `participants` | 참가자·출발지·도착 신호등 | 각자 자기 행만 써야 서로 덮어쓰지 않는다 |
| `votes` | 표 한 장 (PK로 1인 1표 보장) | 여러 명이 동시에 눌러도 표가 유실되지 않는다 |

`db/schema.sql` 을 Neon SQL Editor 에서 한 번 실행하면 만들어집니다.
DATABASE_URL 은 서버 전용이라 브라우저는 DB에 직접 접근하지 않습니다.

---

## ✅ PR 전 확인

```bash
npm run verify      # tsc --noEmit + build + 브라우저 스모크
```

> 처음 한 번은 크로미움(~100MB)을 자동으로 받습니다(`pretest:smoke`).
> 두 번째부터는 즉시 넘어갑니다.

같은 검사를 CI 가 PR 마다 **플래그 끈 상태 / 켠 상태 두 번** 돌립니다
(꺼둔 기능이 썩지 않게). 실패하면 스크린샷과 트레이스가 Actions 탭에 올라옵니다.

파일을 바꿨으면 [`CHANGELOG.md`](CHANGELOG.md)에 **반드시** 기입합니다.

## 🌿 브랜치 / 커밋 / 버전

- `main`(배포) ← `develop`(통합) ← `feat/*`, `fix/*`
- **매일 `develop` 을 받아옵니다.** 오래 묵힌 브랜치가 진짜 충돌의 원인입니다
- 커밋 접두사가 곧 버전 규칙: `feat:` → MINOR · `fix:` → PATCH
  (`refactor:` `docs:` `test:` `chore:` 는 버전 영향 없음). 본문 한글 OK
- **최종 발표일 = `v1.0.0`.** 그전까지는 전부 `0.y.z` → [`docs/버전관리.md`](docs/버전관리.md)
- AI 생성 코드는 PR 본문에 `🤖 Generated with Claude Code` 표기

## 🧪 디버깅 도구

- **디버그 시드**: 개발 모드에서 `/api/debug` → 시나리오 하나를 골라 그 상태의 모임을 즉시 생성
  (출발지 미등록 / 일부 등록 / 전원 등록 / 정원 초과 / 확정 완료 / 예약 완료 …)
- **`/api/status`**: 키 설정 여부 + DB 접속 상태 (항상 사용 가능)
- **`/api-live`**: 카카오·ODsay·TMAP를 실제로 호출한 결과 (개발 모드 전용)
- **`/api/diag`**: 외부 API를 실제로 호출해 응답 원문과 파싱 결과, 서버 공인 IP까지 반환
  (ODsay 화이트리스트 등록에 필요)
