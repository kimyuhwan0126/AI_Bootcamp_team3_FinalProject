# 모이머(Moimer) — CLAUDE.md (AI 개발 지시서)

> Claude Code가 이 프로젝트를 열 때 가장 먼저 읽는 파일.
> 상세 규칙은 `mds/AI-GUIDE.md` 참조.
> 변경 기록은 `CHANGELOG.md`에 반드시 기입한다.

---

## 0. 프로젝트 한 줄 요약

모이머(Moimer)는 단톡방 모임 장소를 **AI 파싱 → 중간지점 추천 → 1차 거점 투표 → 2차 가게 투표 → 최종 확정 → 네이버 예약 링크 → 카톡 공유**까지 처리하는 Next.js + Supabase 서비스.

---

## 1. 기술 스택

- **FE**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Zustand + React Query
- **BE**: Next.js API Routes + Supabase (PostgreSQL + Realtime + Auth)
- **AI**: Gemini 2.5 Flash
- **외부 API**: Kakao Local/Search, ODsay LIVE, Google Calendar, 네이버 예약 링크(URL 방식)
- **배포**: Vercel(프론트) + Supabase(백엔드)
- **결제**: ❌ Scope 제외 (네이버 링크로 대체)

---

## 2. 폴더 구조 규칙

```
projects/moimer/
├── src/
│   ├── app/                  # Next.js App Router (라우트 파일만)
│   │   ├── (auth)/           # 카카오 로그인, callback
│   │   ├── (main)/           # 사용자 화면
│   │   ├── (admin)/          # 관리자 화면
│   │   └── api/              # Route Handlers
│   ├── components/
│   │   ├── ui/               # shadcn/ui 원시 컴포넌트 (수동 수정 금지)
│   │   ├── common/           # Header, BottomNav, 공통 UI
│   │   ├── meeting/          # 모임 생성/현황
│   │   ├── vote/             # 1차/2차 투표
│   │   ├── shop/             # 가게 추천
│   │   ├── recommend/        # 거점 추천/경로
│   │   ├── share/            # 공유/예약 링크
│   │   ├── admin/            # 관리자 화면
│   │   └── splash/           # 인트로
│   ├── hooks/                # 커스텀 훅
│   ├── stores/               # Zustand stores
│   ├── lib/
│   │   ├── supabase/         # client.ts · server.ts · admin.ts
│   │   ├── ai/               # Gemini 파싱 래퍼
│   │   ├── external/         # odsay · kakao · naver · calendar
│   │   └── utils.ts          # cn() 등
│   ├── types/                # 공유 TS 타입
│   └── config/               # 상수·가중치
├── mds/                      # AI 규칙/가이드 (원본)
│   ├── CLAUDE.md             # 원본 규칙 (읽기 전용 참고)
│   ├── AI-GUIDE.md           # 상세 가이드
│   └── skills/
├── supabase/
│   ├── migrations/
│   └── seed/
├── CLAUDE.md                 # 이 파일 (프로젝트 AI 지시서)
├── CHANGELOG.md              # 변경 기록 (수정 시 반드시 기입)
└── package.json
```

---

## 3. 핵심 규칙 (Scope Freeze)

1. **결제/선입금/환불** — 범위 외. 네이버 예약 URL로만 이동
2. **Android 네이티브 / 독립 채팅 / OCR / 자동 카톡 동기화** — 범위 외
3. TypeScript `any` 사용 금지 — `unknown` + 타입 가드 사용
4. AI 추천 가중치: 이동시간 40 / 환승 25 / 도보 15 / 요금 10 / 컨디션 10 (제안값, 튜닝 대상)
5. AI 파싱 결과는 **제안** — 사용자 직접 입력이 우선
6. 외부 API 장애 시 **mock fallback** 대비 (ODsay/Gemini)
7. 커밋 전 smoke test (눈/버튼/로그 3관점)

---

## 4. 비용 경고 규칙 (최우선)

- 실제 Claude/Gemini API 호출 전 반드시 CEO에게 사전 경고
- 외부 유료 서비스 연동 전 반드시 CEO에게 사전 경고
- **경고 형식**: [💰 비용 발생 가능] {무엇이} {얼마나} 발생하는지 명시 후 승인 대기
- 이 규칙은 어떤 상황에서도 생략하지 않는다

---

## 5. AI vs 팀 책임 경계

- **팀이 판단**: 기획, Scope, 가중치 값, 프롬프트 최종본, 가게 DB, UAT 통과 기준
- **AI가 생성**: 보일러플레이트, API 래퍼, SQL 초안, 테스트 코드, 문서 초안
- AI 생성 코드 PR엔 `🤖 Generated with Claude Code` 표시

---

## 6. 커밋/브랜치 규칙

- 브랜치: `main` ← `develop` ← `feat/*`, `fix/*`
- 커밋 메시지: `feat: 모임 생성 API 추가` (한글 OK)
- **파일 수정 시 반드시 CHANGELOG.md §변경기록에 기입**

---

## 7. 관련 문서

- `mds/AI-GUIDE.md` — 역할별 AI 활용 가이드 상세
- `mds/CLAUDE.md` — 원본 가이드 규칙
- `CHANGELOG.md` — 모든 변경 기록
