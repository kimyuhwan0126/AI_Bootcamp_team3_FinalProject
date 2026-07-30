# SyncSpot — CLAUDE.md (AI 개발 지시서)

> Claude Code(또는 AGENTS.md 호환 에이전트)가 매 세션 자동 로드하는 프로젝트 지시서.
> 상세 내용은 `mds/AI-GUIDE.md` 참조.
> 📖 **사람이 가장 먼저 읽을 문서**: 이 디렉터리 루트의 `README.md` (사용법·폴더 구조·파일 목록·변경 기록). AI 세션 시작 시에도 `README.md`를 먼저 확인해 사용법과 최근 변경(§5)을 숙지한다.
> ✏️ 규칙 파일(`CLAUDE.md`·`AI-GUIDE.md`)과 config는 **기본값**이라 AI가 사용자 요청으로 수정 가능 — 수정 시 `README.md` §5에 기록(무엇·왜·언제).

---

## 0. 한 줄 요약
SyncSpot은 단톡방 모임 장소를 **AI 파싱 → 중간지점 추천 → 1차 거점 투표 → 2차 가게 투표 → 최종 확정 → 네이버 예약 링크 → 카톡 공유**까지 처리하는 Next.js + Supabase 서비스.

## 1. 핵심 일정

> 일정은 시작 단계에서 확정하기 어려우므로, 킥오프 시 별도 확정 후 이 절에 반영한다.
> 아래는 채울 항목만 둔 틀(일정 미정).

| 구분 | 일자 | 의미 |
|---|---|---|
| 개발 시작 | (미정) | 킥오프 시 확정 |
| 중간점검 데모 | (미정) | 데모 가능 플로우 완성 시점 |
| 최종 UAT/Live | (미정) | MVP + 핵심 관리자 기능 배포 |
| 안정화 버퍼 | (미정) | 장애 알림/차트/튜닝 |

→ 일정 후반부에는 기능 추가보다 **버그 수정/Scope 축소를 우선**.

## 2. 기술 스택 (기본값 — 각자 필요시 조정 가능)
- **FE**: Next.js 14 (App Router) + TypeScript + Tailwind + **shadcn/ui** + Zustand + React Query/SWR
- **BE**: Next.js API Routes + Supabase (PostgreSQL + Realtime + Auth)
- **AI**: Gemini 2.5 Flash (GPT-4o는 유료라 미사용)
- **외부 API**: Kakao Local/Search, ODsay LIVE, Google Calendar, **네이버 예약 링크**(URL 방식)
- **배포**: Vercel(프론트) + Supabase(백엔드)
- **결제**: ❌ Scope 제외 (Toss Payments 미사용, 네이버 링크로 대체)

## 3. 디자인 토큰 (미정 — 디자인 확정 후 추가)
- ⏳ 테마/컬러 토큰은 **아직 결정 전**. 팀 디자인 확정 후 이 절에 반영.
- 그 전까지는 구체적 색상값 고정 보류. Tailwind/shadcn/ui 세팅은 토큰 없이 먼저 진행.

## 4. 규칙 (Scope Freeze — 기본값, 각자 필요시 조정 가능)
1. **결제/선입금/환불** — 범위 외. 네이버 예약 페이지 URL로만 이동 (`window.open(naverUrl, '_blank')`)
2. **안드로이드 네이티브 앱 / 독립 채팅 / OCR / 자동 카톡 동기화** — 범위 외
3. TypeScript `any` 사용 지양 — `unknown` + 타입 가드 선호
4. AI 추천 가중치 합 = 100% (이동시간 40 / 환승 25 / 도보 15 / 요금 10 / 컨디션 10) — **제안값(초안), 튜닝 대상, 팀 최종 확정 전**
5. AI 파싱 결과는 **제안** — 사용자 직접 입력값이 우선, 확신도 낮은 항목은 UI로 재확인
6. 외부 API 장애 시 **mock fallback** 대비 (ODsay/Gemini)
7. 커밋 전 매일 smoke test (눈/버튼/로그 3관점)

## 5. 역할 분담 (5인 · 제안 배정, 확정 전)
> 아래 5역할 세분(QA·데이터 / 디자인·콘텐츠 포함)은 **제안 배정**. 소스 문서는 3~4인 또는 1인 4영역 기준이므로, 최종 역할 배정은 확정 전까지 참고용.
| 담당 | 인원 | 책임 |
|---|---|---|
| FE 리드 | 1 | 라우팅/레이아웃/컴포넌트 마이그레이션 |
| BE/API 리드 | 1 | Supabase 스키마, API Routes, 외부 API |
| AI/알고리즘 | 1 | Gemini 파싱, ODsay 추천, 가중치 |
| QA·데이터 (제안) | 1 | smoke test, seed 데이터, 데모 시나리오, 네이버 링크 검증 |
| 디자인·콘텐츠 (제안) | 1 | UI 폴리싱, 가게 DB/키워드, 카톡 공유 카드, 문서 |

→ **임계경로(FE/BE/AI)는 헤테로지니어스로 담당, 나머지는 구조화된 지원 역할.**

## 6. AI vs 팀 책임 경계 (핵심)
- **팀이 판단/최종 결정**: 기획, Scope, 가중치 값, 프롬프트 최종본, 가게 DB, 카피, UAT 통과 기준, 수동 QA
- **AI가 생성/보조**: 보일러플레이트, API 래퍼, 마이그레이션 SQL 초안, 테스트 코드, 문서 초안, 리뷰/리팩터
- **AI 제안은 최종 커밋 전 팀 리뷰를 거치는 걸 권장**. AI가 만든 코드 PR엔 `🤖 Generated with Claude Code` 표시.

## 7. 검증 (매일 저녁 10분)
1. preview URL 접속 2. 카카오 로그인 3. 모임생성→AI파싱→현황 데이터 유실 없음 4. (초기) 1차 투표 후보 3개 노출 5. (후기) 관리자 접근 제한 정상 6. commit & push
→ 스킬 인덱스: `mds/skills/README.md` (현재 등록된 스킬 없음)

## 8. 커밋/브랜치 규칙
- 브랜치: `main` ← `develop` ← `feat/*`, `fix/*`
- 커밋 메시지: `feat: 모임 생성 API 추가` (한글 OK)
- PR 리뷰 1인 이상 권장, 24시간 내
- AI 생성 코드는 PR 본문에 명시

## 9. 관련 문서
- `mds/AI-GUIDE.md` — 본 문서의 상세판

## 10. 위험 대응 (기본)
| 위험 | 대응 |
|---|---|
| API 키 미발급 | mock fallback 우선 개발 후 교체 |
| ODsay 장애/지연 | 캐싱 + 수동 거점 입력 + mock 후보 3개 |
| Gemini 파싱 불안정 | JSON schema + retry 1회 → 수동 입력 유도 |
| 카톡 웹뷰 OAuth 이슈 | 외부 브라우저 fallback 안내 |
| 동시성(동시 투표) | Realtime + 낙관적 업데이트 + DB unique constraint |