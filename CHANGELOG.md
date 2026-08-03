# 모이머(Moimer) — 변경 기록

> 이 파일의 파일을 바꾼 경우 아래에 **반드시** 기입한다.
> 형식: `날짜 | 작업자 | 대상 파일 | 변경 내용 | 사유`
> 기록 없는 변경 금지.

---

## v0.1.0 — 2026-07-30 · 새 저장소 시작

### 통합 개발 저장소로 이관 (`AI_Bootcamp_team3_FinalProject`)

팀원 4명이 각자 브랜치로 동시에 개발하고 통합 담당자가 머지를 전담하는 체제로
전환하면서 저장소를 새로 팠다. **코드는 옛 저장소의 `v8.1.0` 과 동일**하고,
히스토리도 그대로 옮겼다(31커밋).

> ⚠️ **버전 번호가 내려간 게 아니라 체계가 바뀐 것이다.**
> 옛 `v8` = "8번째로 다시 만든 시제품"(내부 반복 횟수)
> 새 `0.1.0` = "아직 정식 출시 전인 개발 버전"(SemVer 표준 의미)
> **최종 발표일에 `1.0.0`** 을 낸다. 규칙은 `docs/버전관리.md`.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | `package.json` | `8.0.0` → **`0.1.0`** | 발표일 `1.0.0` 을 향한 SemVer 체계로 전환 |
| 2026-07-30 | Claude(AI) | `schema.sql` (루트) | 삭제 | v7 시절 **Neon용** 잔재. 아무 코드도 참조하지 않는데 팀원이 `supabase/schema.sql` 대신 잘못 실행할 위험이 있었다 |
| 2026-07-30 | Claude(AI) | `docs/legacy-algo/` (신규 8파일 + README) | 유실됐던 추천 알고리즘 8종 복원 | `memory/status.md` 가 `git show 5ff50ee:...` 로 꺼내라고 안내했는데, 그 커밋이 `main` 의 조상이 아닌 **별도 갈래**라 히스토리를 옮겨도 따라오지 않는다 |
| 2026-07-30 | Claude(AI) | `tsconfig.json` | `exclude` 에 `docs` 추가 | 위 참고용 파일들이 지금 코드와 타입이 맞지 않아 타입검사를 깨뜨린다 |
| 2026-07-30 | Claude(AI) | `package-lock.json` | `package.json` 과 동기화 (버전 `8.0.0`→`0.1.0`, `@playwright/test` 루트 devDependency 등록) | lock 이 어긋나면 CI 의 `npm ci` 가 죽는다. 팀원이 받자마자 빨간 CI 를 보게 될 자리였다 |
| 2026-07-30 | Claude(AI) | `package.json` | `next` `14.2.15` → **`^14.2.35`** | `npm audit` 에서 **critical** 취약점. 공개 저장소 + Vercel 배포 예정이라 방치할 수 없다. 14.2 안의 패치 업그레이드만 했다(16 으로 올리면 breaking change) |
| 2026-07-30 | Claude(AI) | `.nvmrc` (신규), `.github/workflows/ci.yml` | Node 버전을 `22` 로 고정하고 CI 가 `node-version-file` 로 같은 파일을 읽게 | 팀원 4명이 각자 다른 Node 로 개발하면 "내 컴에선 되는데"가 생긴다. 버전을 올릴 때 고칠 곳도 한 군데가 된다 |
| 2026-07-30 | Claude(AI) | `README.md`, `팀원_실행안내.md`, `docs/팀_개발환경.md` | 팀원 진입점 정비 — 무엇부터 읽고 무엇을 만지는지. v8 시절 서술 정정(채팅 위상·버튼 이름·구조도) | 저장소를 처음 여는 사람이 5분 안에 시작할 수 있어야 한다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 머지 방식 정정 — "Squash 만 허용" ❌ → `feat/*→develop` 은 Squash, `develop→main` 은 merge commit. 실제로 만든 룰셋 내용으로 설정표 갱신 | Squash 로만 잠그면 `develop→main` 에서 develop 커밋이 한 덩어리로 뭉개지고 두 브랜치 히스토리가 갈라져 이후 머지마다 충돌한다 |
| 2026-07-30 | Claude(AI) | `lib/supabase.ts`, `app/api/status/route.ts` | DB 접속 실패 시 **앱이 실제로 접속한 Supabase URL 과 원인 힌트**를 함께 노출 (끝 슬래시·스킴 누락·앞뒤 공백 자동 판정) | `TypeError: fetch failed` 는 원인을 전혀 말해주지 않아 `.env.local` 을 열어봐야만 오타를 찾을 수 있었다(CEO 가 실제로 겪음). 팀원 4명이 각자 키를 넣으므로 똑같이 겪을 자리다. URL 은 `NEXT_PUBLIC_` 값이라 비밀이 아니며, 키는 노출하지 않는다 |
| 2026-07-30 | Claude(AI) | `package.json` | `pretest:smoke` 추가 (`playwright install chromium`) | **`npm run verify` 가 방금 clone 한 환경에서 스모크 3/4 실패**했다(`Executable doesn't exist`). 문서가 "PR 전에 npm run verify"라고 시키는데 팀원 전원이 첫 PR 에서 이걸 만났을 것이다 |
| 2026-07-30 | Claude(AI) | `.gitignore` | `.env*.local` → `.env` · `.env.*` (+ `!.env.example`) | **공개 저장소인데 `.env` 와 `.env.production` 이 열려 있었다.** Next.js 는 그 둘도 읽으므로 키를 그 이름으로 만들면 그대로 커밋된다 |
| 2026-07-30 | Claude(AI) | `.gitignore` | `/logs/` 차단 추가 | `lib/ai.ts` 가 **참가자들의 실제 대화**를 `logs/ai-trace.jsonl` 에 기록한다. AI 채팅 플래그를 켜고 개발하면 파일이 생기는데, 공개 저장소라 실수로 커밋되면 대화가 그대로 공개된다. 지금은 채팅이 꺼져 있어 파일이 없을 뿐이다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md`, `README.md` | **커밋 이메일 가리기** 안내 추가 (GitHub Emails 설정 2개 + `git config user.email` noreply) | 공개 저장소라 커밋에 박힌 이메일을 누구나 API 로 수집할 수 있다. 초기 커밋 9건에 개인 지메일이 남았고, **팀원 4명이 붙으면 4명 분이 더 노출된다.** 이미 올라간 것은 못 바꾸므로 앞으로를 막는다 |
| 2026-07-30 | Claude(AI) | `docs/팀원_온보딩.md` (신규) | 팀원이 **처음부터 끝까지 한 번에 읽는** 단일 온보딩 문서 — 이메일 가리기 → 세팅 → 소유권 → 첫 PR → 매일 지킬 것 → 절대 규칙 → 실제로 겪은 함정 5건 → 막혔을 때 | 문서가 README·팀원_실행안내·팀_개발환경 셋으로 흩어져 있어 팀원이 뭘 먼저 읽을지 몰랐다. 카톡·노션에 통째로 배포할 수 있는 형태 |
| 2026-07-30 | Claude(AI) | `lib/CLAUDE.md` (신규) | 데이터 계층 5규칙(store async · 쓰기 단위 · 캐시 금지) + 외부 API 래퍼 4규칙(mock 폴백 · 성공값만 캐시 · 가짜 표시 금지 · 비용 경고) + 소유권 표 | 채팅·AI 파싱 담당은 `lib/ai.ts`·`lib/parse.ts` 에서 일하는데 그 폴더에 지시서가 없었다. **`CLAUDE.md` 는 세션 시작 시 자동 로드**되므로 규칙을 프롬프트에 매번 붙이는 것보다 확실하고 드리프트가 없다 |
| 2026-07-30 | Claude(AI) | `.github/workflows/ci.yml` | **CHANGELOG 기입 확인 잡** 추가 — 코드·설정을 바꿨는데 `CHANGELOG.md` 를 안 건드린 PR 은 CI 실패. 문서만 고친 PR 은 통과 | "파일을 바꿨으면 기입"(CLAUDE.md §6)이 **기억에 의존하는 규칙**이었다. 바쁠 때 빠지고, 빠진 채로 3주가 지나면 무엇을 왜 바꿨는지 복원할 수 없다. **400줄 제한은 넣지 않았다** — `app/page.tsx`(1,118줄)·`lib/ai.ts`(592줄)가 이미 넘어서, 넣으면 담당자가 자기 파일을 아예 못 고치게 된다 |
| 2026-07-30 | Claude(AI) | `docs/팀원_온보딩.md` | `CHANGELOG.md` 충돌 해결법 추가 (양쪽 줄 다 남기기) + CI 가 기입을 막는다는 사실 명시 | 모든 PR 이 이 파일에 한 줄씩 더하므로 **구조상 자주 겹친다.** 오늘 PR 3건이 연속으로 이 충돌을 만났다. 팀원이 당황하지 않게 미리 알려둔다 |
| 2026-07-30 | Claude(AI) | `.env.example`, `lib/ai.ts` | Ollama 1순위 기본값에서 **팀 내부망 사설 IP 제거** (빈 값 → 2순위 localhost 로 폴백) | 공개 저장소에 내부망 주소가 남고, `/api/status` 의 `ai.url` 로 응답에 실려 나갔다 |
| 2026-07-30 | Claude(AI) | `app/api/diag/route.ts` | ODSAY 키의 앞 2자·뒤 2자 노출 제거 | 바로 위 주석이 "값 노출 X"라고 적어놓고 실제로는 키 조각 4자를 응답에 실었다 |
| 2026-07-30 | Claude(AI) | `package.json`, `.eslintrc.json` | `eslint` + `eslint-config-next` 설치, extends 를 `next/core-web-vitals` 로 (에러 2건 수정) | `npm run lint` 스크립트가 있는데 eslint 가 없어 실행하면 죽었다. `next/typescript` 는 기존 `any` 46곳을 전부 에러로 띄워 제외 — **React 훅 규칙이 목적**이다(조건부 return 뒤 훅 배치 사고를 lint 가 잡는다) |
| 2026-07-30 | Claude(AI) | `팀원_실행안내.md` | "Node.js 18 이상" → **Node 22** (`.nvmrc` 기준) | `.nvmrc`·README·CI 는 22 인데 이 문서만 18 이라 팀원이 18 로 맞출 수 있었다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `.github/CODEOWNERS` | 존재하지 않는 `sections/ChatSection.tsx` → 실제 파일 `ChatPanel.tsx` | @TODO 자리에 아이디를 채워 주석을 풀면 **없는 경로라 GitHub 이 그 줄을 조용히 무시**해 채팅 담당 소유권이 안 걸렸을 것이다 |
| 2026-07-30 | Claude(AI) | `.github/CODEOWNERS`, `docs/팀_개발환경.md` | 경로의 `[code]` → `*` (`/app/m/*/sections/ChatPanel.tsx`) + 함정 경고 | **CODEOWNERS 는 gitignore 문법이라 대괄호가 문자 클래스로 해석된다.** `[code]` 는 `c`·`o`·`d`·`e` 중 한 글자에 매칭되고 실제 폴더 `app/m/[code]/` 에는 절대 매칭되지 않는다 — 파일명을 고쳐도 그 줄은 여전히 무효였다. `git check-ignore` 로 재현 확인 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/CLAUDE.md` | "팀원이 만질 파일은 모두 400줄 미만" 주장 정정 — 실제로 `app/page.tsx` 1,118줄 · `lib/ai.ts` 590줄이 팀원 소유다 | 인계 문서의 거짓 주장은 다음 세션이 잘못된 전제로 작업하게 만든다(v8 에서 실제로 겪은 실패) |
| 2026-07-30 | Claude(AI) | `docs/노션_통합개발환경.md` | 줄 수 `1,352` → `905` 최신화 · 아직 없는 스코어러 3종에 "앞으로 만들 파일" 표시 · Code Owners 설정이 `docs/팀_개발환경.md` 와 정반대이던 모순 제거 | 멘토님께 공유하는 문서라 사실관계가 어긋나면 안 된다 |
| 2026-07-31 | Claude(AI) | `package.json`, `package-lock.json` | `@supabase/supabase-js` 제거 → `@neondatabase/serverless` 추가 (`npm install` 로 lock 동기화) | **팀 결정: DB 를 Neon 으로 이관** (멘토님 추천 수용). lock 이 어긋나면 CI 의 `npm ci` 가 죽는다 |
| 2026-07-31 | Claude(AI) | `lib/db.ts` (신규), `lib/supabase.ts` (삭제) | 서버 전용 Neon 클라이언트 — `DATABASE_URL` 하나(서버 전용, `NEXT_PUBLIC_` 금지). 접속 실패 진단(스킴·끝 슬래시·공백 감지)은 postgres:// 형식에 맞게 이식, **URL 은 비밀번호를 *** 로 가린 masked 만 노출** | Supabase URL 은 공개값이었지만 `DATABASE_URL` 에는 비밀번호가 들어 있다 — 원문 노출은 사고다 |
| 2026-07-31 | Claude(AI) | `lib/persistence.ts` | Supabase 클라이언트 호출 7종(loadMeeting·meetingExists·saveMeeting·upsertParticipant/s·setVote·clearVotes)을 Neon SQL(`insert … on conflict`)로 재작성. 쓰기 단위 3분리와 votes PK(code,target,participant_id)=1인 1표 upsert 의미 유지. timestamptz 가 Date 로 오는 차이는 `isoOf()` 로 흡수 | 저장 계층만 교체하고 도메인(store.ts 인터페이스)은 그대로 두기 위함 |
| 2026-07-31 | Claude(AI) | `lib/store.ts` | `hasSupabase` → `hasDb` (import 를 `lib/db` 로), `storeInfo.backend` `"supabase"` → `"neon"`. 로직 변경 없음 | `lib/supabase.ts` 가 사라져 import 가 깨진다 — 이관에 필연적인 최소 수정 |
| 2026-07-31 | Claude(AI) | `app/api/status/route.ts`, `app/api/diag/route.ts` | `store: "neon"` 표기, 실패 시에만 `db.url`(masked)+`urlHint` 노출 유지. diag 는 테이블 3종 개별 점검을 Neon 쿼리로, keyKind/RLS 안내 제거 | Neon 엔 anon/service_role 구분과 RLS 가 없다 |
| 2026-07-31 | Claude(AI) | `supabase/` → `db/` (폴더명 변경), `db/schema.sql`, `db/migrations/README.md` | RLS 정책·role 참조 제거 — Neon SQL Editor 에 그대로 붙여 실행 가능. migrations `NNN_*.sql` 패턴 유지, 안내 문구 Neon 콘솔 기준으로 | Neon 은 서버만 접속하므로 RLS 가 무의미하고, 남겨두면 실행은 되지만 팀원이 잘못된 전제를 갖는다 |
| 2026-07-31 | Claude(AI) | `.github/workflows/ci.yml` | changelog 잡 경로 패턴 `supabase/` → `db/` | 폴더명 변경 후에도 스키마 변경 PR 이 CHANGELOG 기입 검사를 받게 |
| 2026-07-31 | Claude(AI) | `.env.example` | Supabase 3키 → `DATABASE_URL` 하나(서버 전용) | 환경변수 통일. 키 없으면 인메모리 폴백은 그대로 |
| 2026-07-31 | Claude(AI) | `README.md`, `팀원_실행안내.md`, `docs/팀원_온보딩.md`, `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md`, `docs/APK.md`, `CLAUDE.md`, `lib/CLAUDE.md`, `memory/status.md` | 스택·데이터 규칙·세팅 절차·소유권 표의 Supabase 서술을 Neon/`db/` 기준으로 정비. status.md §6 "멘토 확인 대기" → "팀 결정: Neon 확정", Neon 실접속은 **미검증** 으로 명기 | 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다(§4 에 기록된 실제 사고) |
| 2026-07-31 | Claude(AI) | `lib/db.ts`, `app/api/status/route.ts` | `maskPassword` 를 정규식 매칭 → `lastIndexOf("@")` 경계 방식으로 재작성 + status 에 "마스킹 흔적 없으면 원문 대신 안내문" 안전벨트 | **PR #15 리뷰 지적(🔴)** — 스킴 없는 `DATABASE_URL`(psql 명령 통째 복사 등)은 정규식이 매칭 실패해 **비밀번호 원문이 `/api/status` 에 노출**됐다. 하필 그 경우가 진단이 잡으라던 상황이다. `@` 포함 비밀번호의 부분 노출(🟡)도 함께 해결 |
| 2026-07-31 | Claude(AI) | `docs/팀원_온보딩.md` | 🆘 표에 "모임이 안 보이면 먼저 `/api/status` 의 `db.ready`" 행 추가 | PR #15 리뷰 지적(🟡) — 접속 실패가 "모임 없음"처럼 보여 코드 탓으로 오인하기 쉽다 |
| 2026-07-31 | Claude(AI) | `app/api/status/route.ts` | 안전벨트 판정 반전 — "@ 가 있는가" → "스킴 뗀 나머지에 콜론/@ 가 있는데 마스킹 흔적(`:***@`)이 없는가" | **PR #15 재검토 지적(🔴 잔여 엣지)** — `@` 앞에서 잘린 값(개행으로 `postgresql://user:비밀번호` 까지만 읽힌 경우)이 기존 판정을 통과해 평문 노출됐다. 의심스러우면 안 싣는 쪽으로 넘어진다 |
| 2026-07-31 | Claude(AI) | `.github/CODEOWNERS` | `/lib/supabase.ts` → `/lib/db.ts`, `/supabase/` → `/db/` 경로 갱신 | PR #15(Neon 이관) 머지로 두 줄이 없는 경로가 됐다 — CODEOWNERS 는 없는 경로를 **조용히 무시**하므로 그대로 두면 공용 파일 소유권이 안 걸린다(`ChatSection.tsx` 건과 같은 유형) |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 진행 중 현황(PR #15 머지 완료 · #14 승인 대기 · #17 열림 · Neon 검증 대기) · §3-2 를 PR #14 이후 사실로 갱신(weather.ts 는 머지 대기, routing.ts `ScoreContext` 채우기는 통합 세션 몫) · 날씨 weight 0.3 을 팀 결정 안건으로 기록 | 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다(§4 사고 기록). 리뷰(🟡1)에서 지적된 낡은 주장 정리 |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 에 카카오 로그인 프로덕션 동작 확인 + 도메인 바뀔 때 고칠 두 곳(Vercel `KAKAO_REDIRECT_URI` · 카카오 콘솔 Redirect URI) 표로 기록 | 한쪽만 고치면 조용히 실패한다 — 환경변수를 빠뜨리면 localhost 로 튕기고, 콘솔 등록을 빠뜨리면 KOE006 이 뜬다. 둘 다 실제로 겪었다 |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 을 릴리스 `f0a4235` 후 실측으로 교체 — "Neon 실접속 미검증" → **로컬·프로덕션 양쪽 `db.ready:true` 실측**, Vercel 배포 완료(Production←main / Preview←그 외), `odsay:false`·`ai.ok:false` 가 의도된 상태임을 명시, Preview 가 실 DB 를 공유하는 점 경고, 릴리스 리뷰 후속 2건(500 빈 본문 · postcss) 기록. §3-5 Vercel 항목 체크 | 릴리스 전 문서에는 미검증으로 적혀 있었다. 실측한 것만 적고 확인 안 된 건 미검증으로 남긴다는 원칙대로 교체 — 다음 세션이 낡은 전제로 시작하는 것을 막는다 |
| 2026-07-31 | Claude(AI) | `app/api/meeting/route.ts` | GET·POST 를 try/catch 로 감싸 예외를 `{ error, detail, hint }` 500 으로 바꾼다 | **릴리스 리뷰 후속 1번** — `lib/persistence.ts` 는 쓰기 실패 시 throw 하는데 여기서 안 잡아 Next.js 기본 500 이 **빈 본문**으로 나갔다. `DATABASE_URL` 이 있으면 인메모리 폴백을 타지 않는 설계라(의도됨) DB 가 끊기면 이 경로로 죽는데, 화면에도 로그에도 원인이 안 남았다 |
| 2026-07-31 | Claude(AI) | `lib/db.ts` | `sanitizeDbError()` 추가 — 오류 메시지에 섞인 접속 주소의 비밀번호를 `***` 로 가린다 | 위 `detail` 을 응답에 실으려면 자격증명 노출부터 막아야 한다. 드라이버가 접속 실패 메시지에 주소를 통째로 넣는 경우가 있다. 비밀번호 쪽 패턴은 greedy 로 잡는다 — `[^\s@]*` 는 첫 `@` 에서 멈춰 `u:p@ssSECRET@host` 뒷부분이 남는다(PR #15 🟡2 와 같은 실수를 만들 뻔했고 실측에서 잡았다) |

**아래 `v8.x` 기록은 옛 저장소(`kimyuhwan0126/Moimer`)에서 이어진 것이다.**
저장소는 그대로 남아 있으니 그 이전 이력이 필요하면 거기서 본다.

---

## v8.0.0 — 2026-07-30

### v8 — 클릭 프로토타입 구현 + Supabase 영속화 (claude/moimer-v8-implementation-plan)

CEO 결정: v8 클릭 프로토타입의 방향을 채택. 프로토타입의 원본이 `feat/v7-mockup`
브랜치의 실앱이므로 그 트리를 베이스로 가져오고, 코드 네이밍을 v8로 정렬한 뒤
프로토타입과 어긋난 화면을 맞췄다. AI 채팅은 **비활성만** 하고 코드는 보존한다
(나중에 다시 넣을 수 있도록). 데이터는 인메모리 → **Supabase**로 전환.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | 전체 | `feat/v7-mockup` 트리를 main 히스토리 위에 커밋 1개로 채택 | main과 v7은 공통 조상이 없어 머지 불가. v7이 main의 lib/ai.ts·prefs·AI trace를 이미 포함 |
| 2026-07-30 | Claude(AI) | `capture-feature.mjs`, `capture-prefs.mjs` | 제거 | 데모 GIF 캡처용(puppeteer 의존) — v8 범위 외 |
| 2026-07-30 | Claude(AI) | `package.json` | 7.0.0 → 8.0.0, `@neondatabase/serverless` → `@supabase/supabase-js` | 버전 정렬 · DB를 Supabase로 결정 |
| 2026-07-30 | Claude(AI) | `app/components/v7/` → `app/components/v8/` | 폴더·`V7Header`→`V8Header`·`V7Tab`→`V8Tab` 이름 변경 | 프로토타입이 v8이므로 코드 네이밍도 v8로 통일 |
| 2026-07-30 | Claude(AI) | `app/globals.css` + 화면 6곳 | CSS 클래스 접두사 `v7-*` → `v8-*` (107곳), localStorage 키 `moimer:v7:*` → `moimer:v8:*` | 같은 사유. 미배포 상태라 키 마이그레이션 불필요 |
| 2026-07-30 | Claude(AI) | `app/components/v8/Splash.tsx` | 자동 전환 3슬라이드 → 한 화면 + 차별점 키워드 칩 3개, 하단 "시작하기" CTA | 1.8초마다 넘어가 읽기 전에 사라졌다. "공평한 중간지점"만으로는 기존 서비스와 구분 안 됨 |
| 2026-07-30 | Claude(AI) | `app/meetings/page.tsx` | 생성 완료 화면을 요약 카드로 교체 (이름·코드·정원·방장·모임 시간 + 초대 링크) | 초대 URL만 주면 입력값이 제대로 들어갔는지 확인할 데가 없었다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `✍ 다른 후보로 정하기` 게이트를 `stage==="chat"` → `stage!=="result"` 로 수정 | 거점 투표 단계(stage=main)에서 모달이 아예 열리지 않던 버그 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 수동 확정 모달을 라디오 선택 + "이 후보로 확정" 방식으로 교체 | 후보 버튼을 바로 누르면 오클릭으로 확정됐다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx`, `app/globals.css` | 방장 바 문구를 투표 진행률 기반으로 변경 (전원 투표 시 "투표 종료 및 확정" 강조) | "강제 확정(방장 권한)"이 정상 마감도 월권처럼 읽혔다 |
| 2026-07-30 | Claude(AI) | `supabase/schema.sql` (신규) | meetings(+jsonb) / participants / votes 3테이블 + RLS + updated_at 트리거 | 쓰기 경합 기준으로 분리 — 참가자·투표를 모임 행에 담으면 동시 쓰기에 표가 사라진다 |
| 2026-07-30 | Claude(AI) | `lib/supabase.ts`, `lib/persistence.ts` (신규) | 서버 전용 클라이언트 + Meeting ↔ 행 매핑 | 도메인 로직을 건드리지 않고 저장 계층만 교체하기 위함 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` | 전 함수 async 화 + 읽기/쓰기 경계 추가. Supabase 모드에선 인메모리 캐시 없음 | 서버리스는 인스턴스가 여러 개라 캐시를 들면 다른 인스턴스가 쓴 표가 폴링에 안 보인다 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` | `setRegionCandidates` 의 후보 변경 감지를 id → **지역 이름** 비교로 수정 | id는 순위(r1·r2·r3)라 후보가 바뀌어도 그대로 → 엉뚱한 지역의 표가 남았다 |
| 2026-07-30 | Claude(AI) | `app/api/debug/route.ts` | `seedScenario` 에 빠진 `await` 추가 | Promise 가 되었는데 await 이 없어 시드가 적용되지 않았다 (타입 검사로 안 잡히는 자리) |
| 2026-07-30 | Claude(AI) | `lib/ai.ts` | 호출부 await 추가 + `search_more_places`/`evaluate_region` 결과를 `saveCandidates` 로 명시 저장 | DB 모드에선 객체를 그 자리에서 고쳐도 저장되지 않는다 |
| 2026-07-30 | Claude(AI) | `app/api/status/route.ts`, `app/api/diag/route.ts`, `lib/env.ts` | DB 연결 상태 노출 (`configured`/`keyKind`/`ready`) + 테이블별 조회 진단 | 키만 있고 스키마 미적용·RLS 차단인 경우를 구분해야 원인을 안다 |
| 2026-07-30 | Claude(AI) | `.env.example` | Neon → Supabase 전면 갱신, 키 발급 위치·주의사항 명시 | DB 전환 반영 |
| 2026-07-30 | Claude(AI) | `README.md` | v8 기준으로 재작성 | 옛 `develop` 보일러플레이트(src/·zustand·room/[id])를 설명해 실제 코드와 달랐다 |
| 2026-07-30 | Claude(AI) | `CLAUDE.md` | v8 실제 스택 기준으로 재작성 (Tailwind·shadcn·Gemini·src/ 기술 제거), 색상·데이터 계층 규칙 추가 | AI가 매 세션 처음 읽는 파일이 코드와 달라 잘못된 전제를 갖게 됐다 |
| 2026-07-30 | Claude(AI) | `팀원_실행안내.md` | v8 기준 + Supabase 준비 절차(스키마 실행·키 3종·확인 방법) 추가 | 팀원이 DB 없이 시작해 데이터가 사라지는 혼란 방지 |
| 2026-07-30 | Claude(AI) | `memory/status.md` | v8 상태로 갱신 → 이후 추천 알고리즘 현황·미착수 항목·이식 유실 버그 목록까지 인계 문서로 재작성 | 진행 상황 인계. 특히 "프로토타입이 고쳐둔 것이 실앱으로 이식되지 않은" 패턴이 반복돼 재발 방지 기록을 남김 |
| 2026-07-30 | Claude(AI) | `app/globals.css`, `app/m/[code]/MeetingClient.tsx` | `.leaderbar` 를 sticky → **fixed** 로 변경 + 하단 여백 136→148px | 브라우저 검증에서 발견: sticky+bottom:64px 는 문서 끝까지 스크롤하면 바가 흐름 위치보다 64px 위로 올라앉아 마지막 카드를 덮었다(`✍ 다른 후보로 정하기` 가 31px 가려져 클릭 불가). 하단 5탭과 같은 fixed 방식으로 통일 |
| 2026-07-30 | Claude(AI) | `lib/persistence.ts` | 참가자 조회 정렬을 `is_leader desc, joined_at asc, id asc` 로 완전 결정화 | joined_at 단독 정렬은 동순위가 가능하고(Postgres now()는 트랜잭션 시작 시각), 참가자 순서가 PIN_COLORS 색인이라 폴링마다 순서가 흔들리면 사람별 칩·핀 색이 계속 바뀐다 |
| 2026-07-30 | Claude(AI) | `app/components/v8/LoginSheet.tsx` | 오버레이를 `createPortal(document.body)` 로 이동 | `.v8-header` 의 `backdrop-filter` 가 fixed 자손의 기준 박스를 헤더(높이 56px)로 바꿔, 로그인 모달 위쪽(제목·이름칸)이 화면 밖으로 잘렸다. `+` 버튼 → 로그인 시트에서 실제로 발생 |
| 2026-07-30 | Claude(AI) | `app/globals.css` | `.v8-modal`·`.modal` 에 `max-height:calc(100dvh - 여백)` + `overflow-y:auto` 추가 | 프로토타입 html 에서 이미 고쳐뒀던 수정인데(`.proto-screen .v7-modal{max-height:100%;overflow-y:auto}`), 그게 "프로토타입 전용(실제 앱엔 없음)" 블록 안에 있어 실앱으로 이식되지 않았다. 창이 짧으면 모달이 잘리고 스크롤도 안 됐다 |
| 2026-07-30 | Claude(AI) | `app/page.tsx`, `app/globals.css` | 검색 결과 줄에 (+) 표시 이식 + `+` 칩을 "검색창으로 데려다주기"(스크롤·포커스·1.2초 강조)로 개선 | 프로토타입에서 확정한 (+) 표시("누르면 출발지로 추가된다")가 실앱 이식 때 빠졌고, `+` 칩은 포커스만 줘서 아무 일도 안 일어난 것처럼 보였다 (CEO 보고) |
| 2026-07-30 | Claude(AI) | `app/api/status/route.ts` | `kakaoRedirect`(앱이 실제로 보내는 Redirect URI) 노출 | KOE006 진단용 — 콘솔 등록값과 글자 단위 대조가 가능해진다. URL이라 비밀 아님 |
| 2026-07-30 | Claude(AI) | `app/components/v8/Icons.tsx` | 모임 참여 아이콘 화살표를 문 "안으로" 향하게 교체 | 밖으로 나가는 방향이면 탈퇴/로그아웃처럼 읽힌다 — 프로토타입·회의록에서 확정했던 방향인데 실앱만 반대로 남아 있었다 (CEO 지적) |
| 2026-07-30 | Claude(AI) | `app/api/auth/kakao/route.ts` | `?debug=1` 진단 모드 추가 (dev 전용) — 카카오에 보내는 REST키 마스킹·redirectUri·인가 URL을 JSON으로 반환 | KOE006은 카카오 페이지에서 막혀 앱이 사유를 못 보여준다. "보낸 값"을 보여주면 콘솔 등록값과 대조해 원인을 찾을 수 있다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 내정보 프로필을 출발지 폼에 연결 — 저장 위치를 원터치 칩으로, 애용 이동수단을 기본값으로 | 내정보 탭이 "모임을 만들 때 바로 불러와요"·"새 모임에 기본 적용"이라 약속하는데 이 폼이 프로필을 읽지 않아 반영되지 않았다 (CEO 보고). 이미 등록된 출발지의 이동수단은 서버 값이 우선 |
| 2026-07-30 | Claude(AI) | `app/meetings/page.tsx` | 모임 생성·참여의 이름 입력을 선택사항으로 (비우면 로그인 이름 사용) | 이미 로그인해 이름을 준 사용자에게 매번 다시 입력하게 했고, 비우면 버튼이 비활성이었다 (CEO 요청) |
| 2026-07-30 | Claude(AI) | `lib/format.ts` (신규) + 화면 4곳 | 이동시간 표기를 `82분` → `1시간 22분` 으로. 거리·요금 포맷도 함께 통일 | 60분 넘는 값을 분으로만 쓰면 얼마나 먼지 감이 안 온다 (CEO 지적) |
| 2026-07-30 | Claude(AI) | `lib/odsay.ts` | 탑승 구간이 없거나 시간이 0인 응답을 버리고 null 반환(→ 추정값 폴백). 경로 라벨을 pathType 대신 **실제 파싱된 구간**으로 생성 | 시외 장거리(서울→김천)에서 ODsay가 빈 껍데기를 주는데 앱이 "ODsay 실시간 82분 · 0원 · 환승 0회"로 사실처럼 표시했다. CLAUDE.md §3-6(가짜 데이터를 실제인 것처럼 그리지 않는다) 위반 |
| 2026-07-30 | Claude(AI) | `app/components/RouteSheet.tsx` | 추정값일 때 경고 박스 추가 — 대중교통 API가 수도권 중심이라 KTX·고속버스가 반영되지 않음을 명시 | 값이 실제와 크게 어긋날 수 있음을 숨기지 않는다 |
| 2026-07-30 | Claude(AI) | `lib/types.ts`·`lib/routing.ts`·`lib/store.ts`·`app/api/meeting`·`app/m/[code]/MeetingClient.tsx` | **거점 후보 직접 등록** — 방장 포함 누구나 지도 검색으로 원하는 지역을 후보에 추가 (`addRegion` 액션 + `＋ 다른 후보 등록` 모달) | 자동 추천이 수도권 밖에서 기하 중간점(시골)으로 잡히는 문제의 현실적 탈출구. 추천 알고리즘 개선 전까지 사람이 후보를 낼 수 있어야 투표가 의미를 가진다 (CEO 지시) |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `✍ 다른 후보로 정하기` → `✍ 다른 후보로 확정`(방장 전용)으로 개명하고, 그 옆에 `＋ 다른 후보 등록`(전원) 배치 | 두 기능은 성격이 다르다(후보를 늘리는 것 vs 마감하는 것) — 같은 이름이면 헷갈린다 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` `setRegionCandidates` | 사용자 등록 후보(`rc_*`)를 자동 재계산에서 보존 | 출발지가 바뀌어 후보가 재계산될 때 사람이 낸 후보가 사라지면 안 된다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 검색 0건일 때 "이름 그대로 등록" 폴백 (좌표는 서버가 지오코딩) | 검색이 못 찾는 지명에서 막다른 길이 되는 것을 막는다 — 프로토타입이 뒀던 안전망과 동일 |
| 2026-07-30 | Claude(AI) | `app/api-live/page.tsx` | 진단 차단 시 안내를 실행 가능하게 보강 (`npm run dev` / `ENABLE_DEBUG=1` / `/api/status` 대안 제시) | 운영 빌드에서 `/api/diag` 가 403 인데 "개발 모드 전용"만 떠 다음 행동을 알 수 없었다 |

검증: `npx tsc --noEmit` 통과 · `next build` 통과 · **실제 브라우저(Chromium)로 화면 구동 확인**
(스플래시 문구·키워드 칩 / 출발지 3개 추가 → 중간지점 "건대입구 최대 40분 편차 15분" /
시간순 전환 시 "경로 API 키 없음 — 거리 추정" 정직 표기 / 생성완료 요약 5필드 + 초대링크 /
거점 단계에서 `✍ 다른 후보로 정하기` 모달 열림·라디오 3개 / 방장 바 문구가
"0/1명 투표 중 · 지금 확정" → "1/1명 투표 완료 · 투표 종료 및 확정" 으로 전환) ·
실서버 API 전 구간 왕복
(생성 → 참여 3명 → 모임시간 → 출발지 4명 → 거점후보 → 4명 동시투표 4표 전부 기록 →
투표취소 → 비방장 확정 거부 → 거점 확정(stage=main) → 가게 투표·확정 → 자가신고 →
예약 → 최종상태). 후보 변경 시 표 무효화 / 후보 동일 시 표 유지 각각 확인.

---

## v8.1.0 — 2026-07-30

### 팀 동시 개발 기반 — 머지 충돌이 안 나는 구조로 재배치

CEO 결정: 새 저장소에서 팀원들과 각자 브랜치로 **동시에** 개발하고, 통합 담당자가
머지를 전담한다. 팀원 중 일부는 Ollama+GLM 으로 Claude Code 를 쓴다.
그래서 (1) 파일을 소유자 단위로 쪼개고 (2) 켜고 끄는 걸 코드가 아니라 환경변수로
옮기고 (3) 사람 리뷰 전에 기계가 먼저 잡도록 CI 를 세웠다.
안드로이드 배포는 **Flutter 재작성이 아니라 PWA + TWA** 로 확정.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | `lib/flags.ts` (신규) | `NEXT_PUBLIC_FF_*` 환경변수 기반 기능 플래그 4종 | 상수(`AI_CHAT_ENABLED=false`)는 켜려면 코드를 고쳐야 해 브랜치마다 값이 달라지고, 머지할 때마다 같은 줄에서 충돌난다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `AI_CHAT_ENABLED` 를 `FLAGS.aiChat` 에서 읽도록 변경 (14곳 사용부는 그대로) | 위와 동일. 개발하려고 켠 걸 실수로 커밋하면 남의 화면까지 켜졌다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/{types,index,fairness}.ts` (신규) | 점수 계산을 **스코어러 플러그인** 구조로. 파일 = 관점 하나 = 담당자 한 명 | 상권·날씨·개인선호를 여러 명이 붙이는데, 점수식이 한 줄에 있으면 전원이 그 줄에서 충돌한다 |
| 2026-07-30 | Claude(AI) | `lib/geo.ts`, `lib/routing.ts` | 복제돼 있던 점수식(`maxMin + devMin*0.8`) 2곳을 `fairnessRaw()` 한 곳으로 통합 | 같은 식이 두 파일에 있어 한쪽만 고치는 사고가 나는 자리였다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/types.ts` | `decayScore()`(0~1 정규화) · `worstOf()`(평균 대신 최솟값) 제공 | 구버전 `enhanced-scoring.ts` 경고 반영 — 분 단위 점수 하나가 0~1 점수 전부를 압도했다. 공평성은 평균이 아니라 최악 기준이어야 한다 |
| 2026-07-30 | Claude(AI) | `lib/parse.ts` (신규) | 규칙 기반 한국어 파싱 — 날짜·시간·예산·목적·분위기·음주·식이 | 팀원 PC 의 Ollama 는 배포 환경·발표날 스마트폰에서 닿지 않는다. LLM 없이 항상 도는 경로가 필요 (§4 의 mock 폴백 원칙을 파싱에 적용) |
| 2026-07-30 | Claude(AI) | `tests/smoke.spec.ts`, `playwright.config.ts` (신규) | 핵심 경로(생성→출발지→거점투표→확정)를 실제 브라우저로 검증 | `tsc`·`build` 를 **둘 다 통과**하고도 화면이 통째로 안 그려진 적이 있다. 일부러 깨뜨려 이 테스트가 잡는 것을 확인함 |
| 2026-07-30 | Claude(AI) | `.github/workflows/ci.yml` (신규) | `tsc` + `build` + 스모크를 flags-off / flags-on **두 번** 실행 | 안 돌려보는 플래그는 "언제든 켤 수 있는 코드"가 아니라 "켤 수 있어 보이는 죽은 코드"다 |
| 2026-07-30 | Claude(AI) | `.github/CODEOWNERS` (신규) | 공용 파일에 통합 담당자 리뷰 강제, 기능별 담당 자리 표시 | 여러 명이 같은 파일을 고치는 것을 사람 기억이 아니라 GitHub 이 막게 |
| 2026-07-30 | Claude(AI) | `supabase/migrations/` (신규) | 스키마 변경은 `schema.sql` 수정이 아니라 번호 붙은 파일 추가로 | 세 사람이 컬럼을 추가할 때마다 같은 파일에서 충돌난다 |
| 2026-07-30 | Claude(AI) | `app/manifest.ts`, `public/sw.js`, `public/offline.html`, `public/icon-*.png` (신규) | PWA — 매니페스트 · 서비스 워커 · 아이콘 4종 | 안드로이드 APK(TWA)의 전제 조건. Flutter 재작성 없이 지금 웹앱이 그대로 앱이 된다 |
| 2026-07-30 | Claude(AI) | `public/sw.js` | `/api/*`·비GET·타 출처를 **캐시하지 않음**. 하는 일은 오프라인 안내뿐 | 1.8초 폴링으로 남의 투표를 받아오는 앱이라, 서비스 워커가 캐시하면 "투표가 반영 안 되는" 재현 어려운 버그가 난다 |
| 2026-07-30 | Claude(AI) | `app/components/ServiceWorkerRegistrar.tsx` (신규), `app/layout.tsx` | 운영 빌드에서만 SW 등록 + PWA 메타데이터 | 개발 중 SW 가 살아있으면 코드를 고쳐도 옛 화면이 나온다 |
| 2026-07-30 | Claude(AI) | `docs/APK.md` (신규) | PWA → Bubblewrap → APK 절차, Flutter 를 쓰지 않는 이유 | 발표날 팀원 폰 설치가 목표. 당일에 처음 시도하면 안 되는 작업 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md` (신규) | 브랜치 모델 · 저장소 보호 설정 · 파일 소유권 · Vercel Preview · AI 개발 규칙 | 팀원이 읽고 그대로 따라 할 수 있는 한 장 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 저장소 보호 절차를 최신 GitHub UI 기준으로 정정 — `Settings → Branches` → **`Settings → Rules → Rulesets`**, Secret scanning 위치(`Advanced Security` 하단) 명시 | 사이드바에 `Branches` 항목이 없어 팀원이 문서대로 따라갈 수 없었다(CEO 확인). Ruleset 은 `Enforcement: Active` 로 바꿔야 적용된다는 함정도 함께 기록 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 항목 이름을 `Secret scanning` → **`Secret Protection`** 으로 정정. "버튼 글씨는 상태가 아니라 행동"(`Disable` = 이미 켜짐) 경고 추가. Dependabot·CodeQL 은 켜지 않는다고 명시 | GitHub 이 이름을 바꿔 팀원이 못 찾았다(CEO 확인). 켜져 있는 항목의 `Disable` 버튼을 "켜는 버튼"으로 오해하면 보호가 꺼진다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/CLAUDE.md` (신규) | 스코어러 추가 방법 + 절대 규칙 4개 (복붙 템플릿 포함) | 컨텍스트가 짧은 모델(GLM)은 긴 루트 지시의 뒷부분을 흘린다 — 폴더별 짧은 지시가 더 잘 지켜진다 |
| 2026-07-30 | Claude(AI) | `CLAUDE.md` | 채팅=플래그 기능으로 위상 정정 · 팀 동시 개발 규칙 · 400줄 상한 · 하위 CLAUDE.md 안내 | §0 이 "대화는 카카오톡에서"라 채팅 코드를 범위 외로 오해할 수 있었다 |
| 2026-07-30 | Claude(AI) | `.env.example`, `package.json` | 플래그 4종 문서화 · `test:smoke`/`verify` 스크립트 · `@playwright/test` | — |

### 모임 상세 화면 분할 (팀원 합류 전 필수 작업)

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | `app/m/[code]/sections/` (신규 **15파일**) | `MeetingClient.tsx` 1,802줄 → **906줄** (-50%). 화면 조각을 전부 분리: VoteList · ChatPanel(+PrefChips) · AddRegionModal · ManualPickModal · LeaderBar · MeetingHeader · MapPanel · OriginForm · ParticipantList · ResultSection · ReserveModal · TravelTimes · PastStepView · AddParticipant · DebugWidget | 한 파일을 두 사람이 만지면 매일 충돌난다. 담당자가 만질 파일이 전부 400줄 미만이 되는 것이 목적 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 거점 투표 행이 STAGE MAIN 과 STAGE CHAT 에 **복제**돼 있던 것을 `VoteList` 하나로 통합 | 한쪽만 고치면 같은 투표가 화면마다 다르게 보이는 사고가 날 자리였다 |
| 2026-07-30 | Claude(AI) | `lib/calendar.ts` (신규) | 구글 캘린더·.ics 내보내기 함수 3종을 화면에서 분리 | 순수 함수라 화면에 있을 이유가 없다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/CLAUDE.md` (신규) | 파일별 소유자 · 이 화면에서 났던 사고 4건 · 데이터 흐름 | 이 화면이 프로젝트에서 제일 충돌이 잦다. 폴더별 짧은 지시가 전역 지시보다 잘 지켜진다 |
| 2026-07-30 | Claude(AI) | `tests/modals.spec.ts` (신규) | 후보 등록·수동 확정 모달을 실제로 열고 눌러 확인 | 모달은 조건부 렌더라 prop 하나만 어긋나도 빌드·타입검사를 통과한 채 조용히 안 열린다 |

**남은 일**: `MeetingClient.tsx` 906줄 = 로직 572 + 조립 334. 화면 조각은 전부
나왔으므로 **소유권 분리는 끝났다**(팀원이 만질 파일은 모두 400줄 미만).
더 줄이려면 로직을 `useMeeting()` 훅으로 빼면 되지만, 그 코드는 어차피 통합
세션 소유라 충돌 방지 효과가 없다 — 급하지 않다.

**검증**: `npx tsc --noEmit` · `npm run build` · 스모크 4/4 통과
(플래그 off/on 양쪽 확인 — on 에서는 투표 UI 가 채팅으로 대체되므로 모달 테스트는 skip).
스모크를 **결과 화면까지** 확장했고, 출발지 등록은 API 가 아니라 **UI 를 직접 조작**한다.
지도·방장 바는 리팩터 영향이 커서 스크린샷으로 눈 검사까지 했다.
추천 결과가 리팩터 전과 **동일**함을 실서버로 확인
(강남역+홍대입구 → `종로3가(48/13)` → `시청(48/19)` → `사당(55/26)`, 순서·문구 그대로).
스모크의 실효성은 `MeetingClient` 를 일부러 깨뜨려 확인 — 빌드는 통과하고 스모크만 실패했다.

---

## v7.0.0 — 2026-07-28

### v7 — v3 인프라 재사용 + 피그마/목업 IA 재구성 (feat/v7-mockup)

CEO 결정: 처음부터 재구축하지 않고 v3(main)의 구현(카카오맵 SDK,
지오코딩, 모임 API, 스토어)을 베이스로 가져와 v7 피그마/목업
(jarvis-brain의 moimer_mockup_v7.html) 디자인으로 UI를 재구성.
v7에서는 투표 실로직·AI 채팅 모두 비활성(화면 플로우만).

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-28 | Jarvis(AI) | 전체 | develop 스켈레톤(src/) 제거, main(v3)의 app/·lib/·설정 이식 | v3 재사용 결정 |
| 2026-07-28 | Jarvis(AI) | `app/globals.css` | v7 컴포넌트 스타일 추가 (하단 5탭·헤더 3버튼·검색/자동완성·출발지 칩·스플래시·투표 UI·모달·내정보 카드) | 목업 v7 디자인 반영 |
| 2026-07-28 | Jarvis(AI) | `app/components/v7/` | Icons·BottomNav·V7Header·Splash 신규 | 목업의 탭/메뉴 구조 그대로 구현 |
| 2026-07-28 | Jarvis(AI) | `app/page.tsx` | v7 홈으로 재작성 — 검색 자동완성 → 출발지 칩(최대 8) → 공평 중간지점(recommendRegions 재사용) → 카카오맵 → 주변 카테고리 리스트 | 목업 비회원 화면 |
| 2026-07-28 | Jarvis(AI) | `app/api/geocode/route.ts` | 자동완성 API 신규 (카카오 키워드 검색, 키 없으면 HUBS mock) | 출발지 입력 채택안(회의록 1차) |
| 2026-07-28 | Jarvis(AI) | `app/api/places/route.ts` | 중간지점 주변 정보 API 신규 (카페/음식점/술집/교통, mock 폴백) | 중간지점 하단 카테고리(회의록 1차) |
| 2026-07-28 | Jarvis(AI) | `app/meetings/page.tsx` | 모임 탭 신규 — 목록(최근/이전) + 생성/참여 모달, 초대 URL 자동 생성·클립보드 복사 (v3 /api/meeting 재사용) | 회의록 3차 모임 생성/참여 플로우 |
| 2026-07-28 | Jarvis(AI) | `app/votes/page.tsx` | 투표함 탭 신규 — 지역/가게 투표 탭 + 스텝 트래커 + 투표 pill (로컬 상태만, 실로직 비활성) | v7 시각 플로우 (CEO 결정) |
| 2026-07-28 | Jarvis(AI) | `app/members/page.tsx` | 모임원 탭 신규 — 참여 중 모임의 참가자 목록 | 목업 하단 탭 구조 |
| 2026-07-28 | Jarvis(AI) | `app/me/page.tsx` | 내정보 탭 신규 — 저장 위치·이동수단 프리셋(localStorage), 스케줄 가져오기(후순위 안내) | 목업 마이페이지 |
| 2026-07-28 | Jarvis(AI) | `package.json` | name moimer·v7.0.0, 미사용 캡처 의존성(puppeteer/pngjs/gifenc) 제거 | 설치 경량화 |

검증: `npx tsc --noEmit` 통과 · `next build` 통과 · 프로덕션 서버 기동 후
홈(출발지 3개→중간지점 강남역 mock)·투표함·모임 생성(실제 코드 발급)·내정보
플로우 스크린샷 확인. 카카오 JS/REST 키 미설정 시 전부 mock으로 동작.

## v1.0.0 — 2026-07-21

### 프로젝트 초기화 (SyncSpot v4 → 모이머 v1.0)

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-21 | Jarvis(AI) | 전체 | SyncSpot v4 복사 → moimer 프로젝트 생성 | 프로젝트 분리 및 리네임 |
| 2026-07-21 | Jarvis(AI) | `src/` 폴더 전체 | `app/` → `src/app/`, `lib/` → `src/lib/` 가이드 스펙 폴더 구조 적용 | mds/CLAUDE.md §2 폴더 구조 규칙 준수 |
| 2026-07-21 | Jarvis(AI) | `package.json` | name: moimer, version: 1.0.0 | 프로젝트 식별 |
| 2026-07-21 | Jarvis(AI) | `package.json` | zustand, @tanstack/react-query, react-hook-form, @hookform/resolvers, zod, clsx, tailwind-merge, class-variance-authority, lucide-react, tailwindcss-animate 추가 | 가이드 스펙 패키지 맞춤 |
| 2026-07-21 | Jarvis(AI) | `src/app/globals.css` | shadcn/ui CSS 변수 토큰 (light/dark 모드) 적용 | 가이드 §3 디자인 토큰 |
| 2026-07-21 | Jarvis(AI) | `tailwind.config.ts` | shadcn 컬러 토큰 + tailwindcss-animate 플러그인 | shadcn/ui 연동 |
| 2026-07-21 | Jarvis(AI) | `tsconfig.json` | `@/*` alias → `./src/*` | src/ 기반 절대경로 |
| 2026-07-21 | Jarvis(AI) | `src/lib/utils.ts` | cn() 유틸 추가 | shadcn/ui 컴포넌트 클래스 병합 |
| 2026-07-21 | Jarvis(AI) | `src/components/ui/button.tsx` | shadcn/ui 스타일 Button 컴포넌트 | UI 컴포넌트 표준화 |
| 2026-07-21 | Jarvis(AI) | `src/components/ui/input.tsx` | shadcn/ui 스타일 Input 컴포넌트 | UI 컴포넌트 표준화 |
| 2026-07-21 | Jarvis(AI) | 앱 전체 UI 텍스트 | SyncSpot → 모이머(Moimer) 리네임 | 프로젝트명 확정 |
| 2026-07-21 | Jarvis(AI) | `mds/` | 가이드 문서(CLAUDE.md, AI-GUIDE.md, skills/) 포함 | 가이드 self-contained 구조 |
| 2026-07-21 | Jarvis(AI) | `CLAUDE.md` | 모이머 전용 AI 지시서 생성 | 이 프로젝트의 규칙 기준 문서 |
| 2026-07-21 | Jarvis(AI) | `CHANGELOG.md` | 변경 기록 파일 생성 | 가이드 §5 변경기록 규칙 준수 |
| 2026-07-23 | Jarvis(AI) | `src/app/api/transit-time/route.ts` | ODsay 응답 타입 명시(`any` 제거), transfers 음수 방지, walkMinutes/fare 반환 추가 | TypeScript 규칙 준수 및 데이터 품질 개선 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | TravelTime에 transfers/walkMinutes/fare 필드 추가 | 대중교통 세부 정보 표시 준비 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | getTransitMinutes → getTransitResult 교체, calcTravelTimes에서 환승/도보/요금 필드 수집 | TravelTime 세부 정보 반영 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | estimateFallback 자차 로직 개선 — 도로 보정(×1.4) + 거리별 속도 적용 (5km미만 20/15km미만 30/30km미만 50/이상 70) | 자차 이동시간 추정 현실화 |
| 2026-07-23 | Jarvis(AI) | `src/app/api/car-time/route.ts` | TMAP 자동차 경로 API 라우트 생성 — 이동시간/거리/통행료 반환, TMAP 실패 시 isEstimated:true | 자차 실제 이동시간 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | getCarResult 함수 추가, calcTravelTimes에서 자차도 TMAP API 우선 사용 (실패 시 Haversine fallback) | 자차 실제 경로 기반 이동시간 적용 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | TravelTime에 distanceKm 필드 추가 | 자차 경로 거리 표시 준비 |
| 2026-07-23 | Jarvis(AI) | `.env.local` | TMAP_API_KEY 추가 | TMAP API 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/travel-time-display.ts` | 이동시간 표시 유틸 — formatTravelTime, getTravelSummary, confidenceBadge, calcDepartureClock | 슬로건3 통합 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/date-highlight-logic.ts` | 날짜 겹침 하이라이트 — computeDateHighlights, toHighlightMap | 날짜 투표 UI 고도화 준비 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/meeting-type-scoring.ts` | 모임 성격별 카테고리 매핑 + 밀집도 점수 — commercialDensityScore, PURPOSE_TO_MEETING_TYPE | 슬로건4 통합 |
| 2026-07-23 | Jarvis(AI) | `src/app/meeting/[id]/page.tsx` | TravelBar 개선 — 실시간/추정 배지, getTravelSummary 세부 경로 요약(환승·도보·요금), formatTravelTime 포맷 | 슬로건3 UI 반영 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/enhanced-scoring.ts` | 스코어링 고도화 — fairTime×0.70 + transitPenalty×0.15 + farePenalty×0.05 + densityBonus×0.10, normalizeTimeBy:120 | 미션A 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/transit-strategy.ts` | ODsay 다중 경로 전략 — fastest/fewest_transfers/least_walk | 미션B 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/yield-message-integration.ts` | 자차 양보 기여 메시지 — buildYieldMessages, createCarMinutesProvider | 미션C 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/app/api/transit-time/route.ts` | 미션B 적용 — parseStrategy + pickTransit 으로 경로 선택 교체 | 다중 경로 전략 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | 미션A/C 적용 — scoreCandidateEnhanced(밀집도+세부지표), buildYieldMessages, purposeType 인자 추가 | 스코어링+양보메시지 통합 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/car-flexible-logic.ts` | calcYieldContributions, MinutesProvider 추가 (yield-message-integration 의존성) | 미션C 완성 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | RegionRecommendation에 yieldMessages?: string[] 추가 | 미션C 타입 확장 |
| 2026-07-23 | Jarvis(AI) | `src/stores/meetingStore.tsx` | buildRegionRecommendation 호출에 purposeType 전달 | 미션A 모임 성격 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/joinCode.ts` | parseJoinTarget() 참가 파싱 유틸 추출 (BottomNav 시트 + participate 공용) | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/components/common/CreateActionSheet.tsx` | 통합 진입 바텀시트 신규 — 새 모임 / 모임 참가(인라인 코드 입력) | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/components/common/BottomNav.tsx` | 탭 5개→4개 (참가 탭 제거), 중앙 [+]를 버튼+CreateActionSheet 트리거로 전환 | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/lib/homeState.ts` | getHomeState() — S1신규/S2다음약속/S3액션/S4유휴 상태 판정 순수 함수 | UX 재설계 미션1 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 화면 상태 기반 혼합형(E+F) 개편 — 상태별 히어로 카드 + INSPIRATION_CARDS 영감 카드 8개 | UX 재설계 미션1 |
| 2026-07-23 | Jarvis(AI) | `src/app/meeting/new/page.tsx` | ?purpose= 쿼리파라미터 읽어 purposeType 초기값 프리필 | UX 재설계 영감 카드 연동 |
| 2026-07-23 | Jarvis(AI) | `src/stores/meetingStore.tsx`, `src/app/meeting/[id]/page.tsx` | 채팅 실시간 반영 수정 — postgres_changes → Supabase Broadcast 전환, sendMessage 낙관적 업데이트(보낸 사람도 즉시 반영) | 새로고침 없이 실시간 채팅 |
| 2026-07-23 | Jarvis(AI) | `src/app/globals.css` | 맵 히어로 CSS 변수 토큰 추가 — 라이트/다크 + data-theme 오버라이드 (home-map-mockup.html 기준) | MapHero 컴포넌트 테마 지원 |
| 2026-07-23 | Jarvis(AI) | `src/lib/homeData.ts` | INSPIRATION_CARDS 상수 + getNextConfirmed() 유틸 신규 | 홈 데이터 로직 분리 |
| 2026-07-23 | Jarvis(AI) | `src/components/home/MapHero.tsx` | 지도 히어로 컴포넌트 신규 — CSS/SVG 정적 지도, 핀 수렴 pulse 애니, nextConfirmed 상태 분기, reduced-motion 지원 | home-screen-FINAL.md §2-1 구현 |
| 2026-07-23 | Jarvis(AI) | `src/components/home/InspirationRail.tsx` | 영감 카드 가로 스크롤 레일 신규 — INSPIRATION_CARDS, purpose 프리필 라우팅 | home-screen-FINAL.md §2-2 구현 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 MapHero 기반 재작성 — 지도히어로+오버랩시트(CTA/참가/InspirationRail), CreateActionSheet 직접 포함 | home-screen-FINAL.md 후보2 최종 구현 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/app/my-meetings/page.tsx` | 내 모임 전용 페이지 신규 — 진행중/완료 탭, MeetingCard/SeriesGroup/StatusBadge 컴포넌트 | 홈에서 모임 목록 분리 (내 모임 탭 신설) |
| 2026-07-23 | Jarvis(AI) | `src/components/common/BottomNav.tsx` | 내 모임 탭 추가 → 5탭 (홈·일정·[+]·내모임·내정보), ListIcon 추가 | 내 모임/내 정보 탭 분리 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 화면 정리 — 모임 목록 제거, 중복 CTA 제거, 영감 카드 4열 그리드로 재디자인 | 홈 UX 간소화 |

---

## v1.1.0 — 2026-07-21

### 채팅 AI 파싱 기능 추가

| 날짜 | 작업자 | 대상 파일 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-21 | Jarvis(AI) | `src/lib/ai/chatParser.ts` | Gemini 2.0 Flash 채팅 파싱 클라이언트 | 내부 채팅 → 모임 정보 자동 추출 |
| 2026-07-21 | Jarvis(AI) | `src/app/api/parse-chat/route.ts` | 서버 사이드 Gemini API Route, 일일 200회 제한 | API 키 보호 + 무료 티어 초과 방지 |
| 2026-07-21 | Jarvis(AI) | `src/app/meeting/[id]/page.tsx` | AI 파싱 버튼 + 제안 카드 UI 추가 | 채팅 기반 모임 정보 자동 업데이트 UX |
| 2026-07-21 | Jarvis(AI) | `.gitignore` (루트) | `src/lib/` 경로 허용 패턴 추가 | lib/ 무시 규칙 충돌 해결 |

---

## 앞으로 변경 기록 작성 방법

새 행을 아래 형식으로 추가:

```
| YYYY-MM-DD | 작업자 | 파일명 또는 폴더 | 무엇을 바꿨는지 | 왜 바꿨는지 |
```

예시:
```
| 2026-07-22 | 유환 | src/app/meeting/new/page.tsx | 모임 생성 폼 Zod 검증 추가 | 빈 폼 제출 버그 수정 |
| 2026-07-22 | Jarvis(AI) | src/lib/ai/gemini.ts | Gemini 파싱 래퍼 초안 | feat/ai-parsing 브랜치 |
```
