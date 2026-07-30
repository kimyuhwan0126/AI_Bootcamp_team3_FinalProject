# 모이머(Moimer) — 변경 기록

> 이 파일의 파일을 바꾼 경우 아래에 **반드시** 기입한다.
> 형식: `날짜 | 작업자 | 대상 파일 | 변경 내용 | 사유`
> 기록 없는 변경 금지.

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
| 2026-07-30 | Claude(AI) | `memory/status.md` | v8 상태로 갱신 | 진행 상황 인계 |
| 2026-07-30 | Claude(AI) | `app/globals.css`, `app/m/[code]/MeetingClient.tsx` | `.leaderbar` 를 sticky → **fixed** 로 변경 + 하단 여백 136→148px | 브라우저 검증에서 발견: sticky+bottom:64px 는 문서 끝까지 스크롤하면 바가 흐름 위치보다 64px 위로 올라앉아 마지막 카드를 덮었다(`✍ 다른 후보로 정하기` 가 31px 가려져 클릭 불가). 하단 5탭과 같은 fixed 방식으로 통일 |
| 2026-07-30 | Claude(AI) | `lib/persistence.ts` | 참가자 조회 정렬을 `is_leader desc, joined_at asc, id asc` 로 완전 결정화 | joined_at 단독 정렬은 동순위가 가능하고(Postgres now()는 트랜잭션 시작 시각), 참가자 순서가 PIN_COLORS 색인이라 폴링마다 순서가 흔들리면 사람별 칩·핀 색이 계속 바뀐다 |
| 2026-07-30 | Claude(AI) | `app/components/v8/LoginSheet.tsx` | 오버레이를 `createPortal(document.body)` 로 이동 | `.v8-header` 의 `backdrop-filter` 가 fixed 자손의 기준 박스를 헤더(높이 56px)로 바꿔, 로그인 모달 위쪽(제목·이름칸)이 화면 밖으로 잘렸다. `+` 버튼 → 로그인 시트에서 실제로 발생 |
| 2026-07-30 | Claude(AI) | `app/globals.css` | `.v8-modal`·`.modal` 에 `max-height:calc(100dvh - 여백)` + `overflow-y:auto` 추가 | 프로토타입 html 에서 이미 고쳐뒀던 수정인데(`.proto-screen .v7-modal{max-height:100%;overflow-y:auto}`), 그게 "프로토타입 전용(실제 앱엔 없음)" 블록 안에 있어 실앱으로 이식되지 않았다. 창이 짧으면 모달이 잘리고 스크롤도 안 됐다 |
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
