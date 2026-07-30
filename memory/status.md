# 모이머(Moimer) — 프로젝트 상태 (status.md)

_최종 업데이트: 2026-07-30 · 작성: Claude(AI) · 브랜치: `claude/moimer-v8-implementation-plan-rsajlr`_

## 지금 상태

**v8 구현 착수 완료 — 화면 정렬 + Supabase 영속화까지.**
v8 클릭 프로토타입의 원본이 `feat/v7-mockup` 브랜치의 실앱이었으므로, 그 트리를
main 히스토리 위에 커밋 1개로 채택해 베이스로 삼고 v8 네이밍으로 정렬했다.
데이터는 인메모리 → **Supabase(Postgres)** 로 전환했다.

## v8 확정 사항 (CEO)

- 베이스 = `feat/v7-mockup` 트리 (main과 공통 조상이 없어 머지 불가 → 트리 채택)
- 코드 네이밍도 v8로 통일 (`v8-*` 클래스, `app/components/v8/`, package 8.0.0)
- **AI 채팅은 비활성만.** 코드는 지우지 않는다 — 나중에 다시 넣을 수 있어야 함
  (`AI_CHAT_ENABLED = false` in `app/m/[code]/MeetingClient.tsx`)
- 외부 API는 전부 실연동 전제로 구현 (키만 넣으면 동작, 없으면 mock 폴백)
- DB = **Supabase** (Neon 아님). 프로젝트 `dpuyrwlgzqblmwrotcky`

## 구현된 화면

| 탭 | 경로 | 상태 |
|---|---|---|
| 홈 | `/` | 출발지 검색·칩(최대 8)·이동수단 팝업 → 중간지점(거리/시간) → 카카오맵 + 경로선 → 주변 리스트 · 확정 요약(신호등) |
| 모임 | `/meetings` | 목록(진행/지난) + 생성/참여 모달 + **생성 완료 요약**(코드·정원·방장·모임시간 + 초대링크) |
| 투표함 | `/votes` | 거점/가게 투표 — 실제 모임 데이터와 연동. 확정 시 마감 표시 |
| 모임원 | `/members` | 참여자 목록 + 도착 신호등 자가신고(본인만) — 서버 저장됨 |
| 내정보 | `/me` | 저장 위치·기본 이동수단(localStorage), 카카오 전환 |
| 모임 상세 | `/m/[code]` | 출발지 등록 → 거점 투표 → 가게 투표 → 확정. 지난 단계 조회, 참가자 시점 전환, 경로 상세 시트, 방장 확정/다른 후보로 정하기 |

## 데이터 계층

`lib/store.ts`(도메인) → `lib/persistence.ts`(매핑) → `lib/supabase.ts`(클라이언트).
쓰기 경합 기준으로 테이블을 나눴다:

- `meetings` — 방장·AI만 바꾸는 값 + 통째로 읽는 집합(후보·대화·선호·예약)은 jsonb
- `participants` — 각자 자기 행만 쓴다 (출발지·도착 신호등이 서로 안 덮어씀)
- `votes` — PK(code,target,participant_id)로 DB가 1인 1표를 보장 (동시 투표 유실 없음)

**Supabase 모드에서는 인메모리 캐시를 두지 않는다** — 서버리스 인스턴스가 캐시를
들고 있으면 다른 인스턴스가 쓴 표가 1.8초 폴링에 계속 안 보인다.

## 검증

`npx tsc --noEmit` · `next build` 통과. 실서버 기동 후 API 전 구간 왕복 확인:
생성 → 참여 3명 → 모임시간 → 출발지 4명 → 거점후보 → **4명 동시투표(4표 전부 기록)**
→ 투표취소 → 비방장 확정 거부 → **거점 확정(stage=main — 예전 버그 지점)** →
가게 투표·확정 → 자가신고 → 예약 → 최종상태. 후보 변경 시 표 무효화 /
후보 동일 시 표 유지도 각각 확인.

## 다음 할 일

- [ ] **Supabase 키 넣고 실DB 검증** — `supabase/schema.sql` 실행 후 `.env.local` 에
      URL·anon·service_role 채우고 `/api/status` 의 `db.ready: true` 확인.
      현재 코드 검증은 인메모리 모드로만 했다.
- [ ] **카카오/ODsay/TMAP 실 키 넣고 검증** — `/api/diag` 로 실호출.
      ODsay는 서버 공인 IP 화이트리스트 등록 필요(`callerIP` 로 확인)
- [ ] 모임 비밀번호 해시 처리 (현재 평문 — `schema.sql` TODO(BE))
- [ ] Vercel 배포. AI를 되살릴 땐 `void runAiTurn()` 을 `waitUntil()` 로 감싸야 함
- [ ] 폴링(1.8초) → Supabase Realtime 전환 검토
- [ ] 알림(헤더 벨) 실데이터 연결 — 현재 목업

## 한계 (의도된 범위)

결과 화면 선입금은 **모의결제**(실제 카드·계좌 정보 안 받음) · 알림은 목업 데이터 ·
AI 파실리테이터는 UI 비활성(코드 보존) · 구글 캘린더는 내보내기만(가져오기 후순위).
