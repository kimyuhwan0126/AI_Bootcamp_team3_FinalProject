# 모이머(Moimer) — 프로젝트 상태 (status.md)

_최종 업데이트: 2026-07-30 · 작성: Claude(AI)_
_저장소: `kimyuhwan0126/AI_Bootcamp_team3_FinalProject` (통합 개발) · 버전 `0.1.0`_

> **새 세션은 이 파일을 가장 먼저 읽는다.**
> 여기 적힌 숫자·주장은 전부 실측했다. 확인 안 된 것은 "미검증"이라고 적었다.
> 이 원칙을 깨지 말 것 — v8 에서 `CLAUDE.md` 가 코드와 달라 잘못된 전제로
> 작업한 적이 있다(쓰지도 않는 Tailwind·shadcn 이 적혀 있었다).

> ⚠️ 옛 저장소 `kimyuhwan0126/Moimer` 는 **지우지 말 것.**
> `main` 의 조상이 아닌 갈래는 이관 때 따라오지 않았다(예: 알고리즘 8종이 있던 `5ff50ee`).
> 필요한 건 `docs/legacy-algo/` 로 꺼내 왔지만 원본은 보험으로 남긴다.

---

## 1. 지금 어디까지 왔나

**팀원 4명이 동시에 개발할 수 있는 상태.** 기능 개발은 이제부터다.

```
/api/status → kakao·kakaoJs·odsay·tmap 전부 true · db.ready true · store "supabase"
```

| 구성 | 상태 |
|---|---|
| 브랜치 | `main`(배포) ← `develop`(통합) ← `feat/*` |
| 브랜치 보호 | `protect-main-develop` **Active** — 직접 푸시 거부 확인함 |
| CI | `verify (flags-off)` · `verify (flags-on)` — PR 6건에서 실제 통과 |
| 릴리스 | `v0.1.0` (발표일 `v1.0.0`) |
| 로컬 | 키 없이 `npm run dev` 로 전체 플로우 동작 |

**아직 안 한 것**: 팀원 초대 · `CODEOWNERS` 아이디 채우기 · Vercel 연결 · APK 리허설

---

## 2. 이 저장소의 설계 전제

> **머지 충돌은 git 문제가 아니라 파일 배치 문제다.**
> 두 사람이 같은 파일을 안 만지게 나눠두면 충돌은 애초에 안 난다.

| 장치 | 무엇을 막나 |
|---|---|
| `lib/scoring/` 플러그인 | 관점 = 파일 하나 = 담당자 한 명. 등록은 배열에 한 줄 |
| `app/m/[code]/sections/` (15파일) | 화면 조각을 담당자별로. 전부 400줄 미만(최대 `LeaderBar.tsx` 173줄) |
| `lib/flags.ts` (`NEXT_PUBLIC_FF_*`) | 켜고 끄기를 코드가 아니라 `.env.local` 로 → 브랜치마다 값이 안 달라짐 |
| `supabase/migrations/` | 스키마 변경을 파일 추가로 → 여러 명이 컬럼 추가해도 충돌 0 |
| `.github/CODEOWNERS` | 소유권을 사람 기억이 아니라 GitHub 이 지킴 |
| CI 브라우저 스모크 | **빌드 통과 ≠ 화면 렌더.** 일부러 깨뜨려 잡히는 것 확인함 |

읽을 문서: `docs/팀_개발환경.md` · `docs/버전관리.md` · `docs/APK.md` · `docs/노션_통합개발환경.md`

---

## 3. ⚠️ 다음 작업

### 3-1. 400줄 넘는 파일 — **팀원 붙기 전에 쪼개는 게 좋다**

문서에 "팀원이 만질 파일은 400줄 미만"이라고 적었던 적이 있는데 **사실이 아니다.**
`MeetingClient` 만 쪼갰고 홈 화면은 손도 안 댔다.

| 파일 | 줄 | 누가 만지나 | 판단 |
|---|---|---|---|
| `app/page.tsx` | **1,118** | 투표·추천 담당 영역 | 🔴 제일 급함. 중간지점·투표·지도·경로가 한 파일에 |
| `app/m/[code]/MeetingClient.tsx` | 909 | 🔒 통합 담당자 | 🟡 로직 572 + 조립 337. 쪼개도 충돌 방지 효과는 없다 |
| `lib/store.ts` | 657 | 🔒 통합 담당자 | 🟡 같은 이유 |
| `lib/ai.ts` | **592** | 👤 채팅·AI 파싱 담당 | 🔴 팀원 소유인데 400줄 초과 |

`app/page.tsx` 와 `lib/ai.ts` 가 실제 위험이다 — 둘 다 팀원이 만질 파일이다.

### 3-2. 추천 알고리즘 — 구조만 있고 알맹이가 없다

**현재 점수식은 이것뿐이다** (`lib/scoring/fairness.ts`):

```
score = 최대이동시간 + 편차 × 0.8   → 낮은 순 3개
```

상권·환승·요금·모임 성격 **전부 미반영**.

- **수도권 안**: 후보 풀이 하드코딩 12곳(강남·홍대·잠실·건대…). 결과가 괜찮아 보이는 건
  알고리즘이 아니라 **사람이 미리 골라둔 큐레이션** 덕분이다.
- **수도권 밖**: 12곳 중 가장 가까운 곳도 45km 넘으면(`isOutsideHubCoverage`)
  `geometricCandidates()` 로 빠진다 — 가장 먼 두 사람을 잇는 선 위 5개 지점을
  순수 기하로 찍어 역지오코딩할 뿐. 서울↔부산 → `김천시 개령면 신룡리`.
  **모일 수 있는 곳이 아니다.**

**✅ 구조는 준비됐다.** `lib/scoring/` 에 파일 하나 만들고 `index.ts` 배열에 한 줄 추가.
`decayScore()` 가 0~1 정규화를, `worstOf()` 가 "평균이 아니라 최악 기준" 조합을 준다.
방법은 `lib/scoring/CLAUDE.md`.

> 현재 `lib/scoring/` 에 실제로 있는 것: `types.ts` · `index.ts` · `fairness.ts` · `CLAUDE.md`.
> `commercial.ts` · `weather.ts` · `personal.ts` 는 **아직 없다**(앞으로 만들 파일).

**⚠️ 먼저 고쳐야 할 것**: `lib/routing.ts` 가 `ScoreContext` 를 만들 때
`{ participants }` 만 넘긴다. `when`(날짜·시간)과 `weather` 를 안 채우므로
**날씨·개인선호 스코어러를 만들어도 데이터를 못 받는다.** 그 둘을 붙이기 전에
`routing.ts` 의 `scoreCandidates()` 에서 `ScoreContext` 를 채워야 한다.

**되살릴 자산**: `docs/legacy-algo/` 에 알고리즘 8종(빌드 대상 아님).
그대로 복사하지 말고 읽고 `lib/scoring/` 규격에 맞춰 옮긴다 — `docs/legacy-algo/README.md`.
가중치 최종값은 **팀 결정 사항**(`CLAUDE.md` §5).

**제안한 3단계** (CEO 검토 대기):
1. 수도권 밖 후보를 **역·터미널**에서 뽑기 — `searchByCategoryKakao("SW8")` 이미 있음
2. **상권 밀집도** 반영 — `/api/places` 가 이미 주변 상권을 센다
3. `enhanced-scoring.ts` 이식 (단위 스케일 함정 주의 — `decayScore()` 로 흡수)

### 3-3. 수단별 이동시간 (KTX·고속버스) — 미착수

현재 `searchPubTransPathT`(도시 내 대중교통)만 써서 서울→김천 같은 **시외 구간은
근본적으로 답을 못 낸다.** ODsay 시외 전용 엔드포인트 연동 필요.

> 3-2 와 3-3 은 같은 문제의 앞뒤다 — **함께 설계하는 것을 권한다.**

### 3-4. 남은 로직 복제 (감사에서 발견, 미수정)

- `app/votes/page.tsx` 가 `sections/VoteList.tsx` 를 안 쓰고 **같은 투표 UI 를 통째로 재구현**
  (지역·가게 두 벌, 약 90줄). 투표 UI 를 바꾸면 두 곳을 고쳐야 한다
- `myCodes()` 가 `app/page.tsx` · `meetings/page.tsx` · `members/page.tsx` · `votes/page.tsx`
  **네 곳에 한 글자도 다르지 않게 복제**돼 있다

### 3-5. 그 외

- [ ] 모임 비밀번호 **평문** — `supabase/schema.sql:20` `TODO(BE)`
- [ ] Vercel 배포. AI 를 되살릴 땐 `void runAiTurn()` 을 `waitUntil()` 로 감쌀 것
- [ ] 폴링(`MeetingClient.tsx:118` `setInterval(load, 1800)`) → Realtime 검토
- [ ] 알림(헤더 벨, `V8Header.tsx:52`) 실데이터 연결 — 현재 빈 상태
- [ ] 구글 캘린더 **가져오기** (`lib/calendar.ts` 는 내보내기만)
- [ ] `any` 46곳 — `CLAUDE.md` §3-3 이 금지하는데 남아 있다.
      정리하면 `.eslintrc.json` 에 `next/typescript` 를 다시 켤 수 있다

---

## 4. 겪은 사고 (반복 금지)

### 타입검사·빌드로 안 잡히는 것

| 사고 | 왜 안 잡히나 |
|---|---|
| `useEffect` 를 조건부 `return` 뒤에 배치 | 화면이 통째로 미렌더. `tsc`·`build` 둘 다 통과 |
| `lib/store.ts` 호출에 `await` 누락 | Promise 를 그냥 둬도 타입이 맞다 — 조용히 무동작 |
| 모달 prop 어긋남 | 조건부 렌더라 열어보기 전엔 모른다 |

→ **브라우저로 실제로 열어야 잡힌다.** 그래서 CI 가 크로미움을 띄운다.
→ 훅 배치 사고는 이제 `npm run lint` 가 잡는다(`react-hooks/rules-of-hooks`).

### `backdrop-filter` 안에서는 `position: fixed` 가 갇힌다

`.appbar` · `.leaderbar` · `.v8-bottomnav` · `.v8-header` 가 전부 쓴다.
그 안에서 전체화면 오버레이를 띄우면 헤더 안에 갇혀 잘린다 —
**반드시 `createPortal(…, document.body)`** (`components/v8/LoginSheet.tsx` 참고).

### 내 환경에서만 되는 것

`npm run verify` 가 **방금 clone 한 환경에서 스모크 3/4 실패**했다
(`Executable doesn't exist` — Playwright 브라우저 없음). 개발 컨테이너엔
`PW_CHROMIUM_PATH` 가 있어서 안 보였다. **팀원 환경을 재현해서야 드러났다.**
→ `pretest:smoke` 로 자동 설치. **"내 환경에서 되는지"가 아니라 "빈 환경에서 되는지"를 본다.**

### 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다

v8 에서 `CLAUDE.md` 에 쓰지도 않는 Tailwind·shadcn 이 적혀 있었다.
이번 감사에서도 나왔다 — 없는 파일(`ChatSection.tsx`)을 `CODEOWNERS` 가 가리켰고,
그대로 뒀으면 **GitHub 이 그 줄을 조용히 무시**해 소유권이 안 걸렸을 것이다.

---

## 5. 한계 (의도된 범위)

결과 화면 선입금은 **모의결제** · AI 파실리테이터는 기본 비활성(`NEXT_PUBLIC_FF_AI_CHAT=1` 로 켬) ·
구글 캘린더는 내보내기만 · 알림은 미연동.

**범위 외**: 실 결제 연동 · 네이티브 재작성(Flutter·RN — PWA+TWA 로 간다) · OCR · 자동 카톡 동기화.

---

## 6. 멘토님 확인 대기

**DB — Supabase 유지 vs Neon.** 채팅을 실제로 만들 거라면 Neon 은 Realtime 이 없어
**자체 WebSocket 서버가 필수**가 된다. `lib/persistence.ts` 가 격리돼 있어
어느 쪽이든 저장 계층만 갈아끼우면 된다 — 다만 **팀원이 브랜치를 따기 전에** 정해야 한다.
