# 모이머 (Moimer) — 공통 보일러플레이트

> **흩어진 우리, 딱 중간에서.** 출발지 → 공평한 중간지점 → 장소 추천.
> 팀 전원이 이 뼈대에서 브랜치를 따 작업합니다. 완성도보다 **큰 그림(척추)** 우선.

---

## 🚀 빠른 시작 (키 없이 바로 실행)

```bash
npm install
npm run dev        # http://localhost:3000
```

키가 하나도 없어도 **MOCK 모드**(기본값)로 전체 플로우가 돕니다.
`.env.example` → `.env.local` 복사는 **실제 외부 API를 붙일 때만** 필요합니다.

데모 시나리오:
1. `/` 에서 **모임방 개설** (이름·비번·내 이름)
2. 메인에서 내 출발지 등록 → **＋예시 참여자 추가(데모용)**
3. **🧭 중간지점 계산** → 후보 3곳 확인 → **투표 시작**
4. 1차(중간지역) 투표 → 방장 확정 → 2차(추천장소) 투표 → 방장 확정
5. **결과** 화면에서 확정 장소 확인

---

## 🧭 화면 흐름 (3-플로우)

```
진입(개설/참여)  →  메인  →  투표  →  결과
                  지도·출발지   1차 중간지역    확정 장소
                  중간지점(AI)  2차 추천장소    참여자·부가기능
                  추천장소
```
- **AI 위치**: 중간지점 계산 ↔ 장소 추천 **사이** (채팅 아님)
- **채팅은 스코프 밖**: 대화는 카카오톡에서, 모이머는 "장소 정하기"만 담당

---

## 📁 구조

```
src/
  app/
    page.tsx                 진입 (모임방 개설/참여 · 이름+비번)
    room/[id]/page.tsx       메인 (지도·출발지·중간지점 계산)
    room/[id]/vote/page.tsx  투표 (1차 중간지역 → 2차 추천장소)
    room/[id]/result/page.tsx 결과 (확정 장소·참여자·부가기능)
    api/{geocode,transit,places,ai-recommend}/  외부 API seam (stub)
  components/
    ui/         shadcn 스타일 (button/input/card/badge)
    common/     Stepper, MapPlaceholder(지도 seam)
  lib/
    env.ts              MOCK 플래그
    geo.ts              좌표 유틸 + mock 지오코딩
    services/           외부 API 래퍼 (전부 mock fallback)
    algo/               fair-scoring, travel-time-display (재사용)
    supabase/client.ts
  stores/roomStore.ts   zustand — MOCK 시 in-memory 전체 플로우
  types/index.ts        데이터 계약 (Room·Participant·Vote·Result)
supabase/schema.sql     최소 스키마 (rooms·participants·votes)
```

## 🔌 담당 seam (여기에 살을 붙이세요)

| 자리 | 파일 | 담당 |
|---|---|---|
| 지도 렌더 | `components/common/MapPlaceholder.tsx` | 병현 (코어 지도) |
| 지오코딩/장소검색 | `lib/services/*`, `app/api/{geocode,places}` | BE |
| 이동시간(ODsay/TMAP) | `lib/services/transit.ts`, `app/api/transit` | AI/BE |
| AI 추천(Gemini) | `lib/services/recommend.ts`, `app/api/ai-recommend` | AI |
| 디자인 토큰/화면 | `app/globals.css`, 각 page | 동원·성은 |

## ⚠️ 스켈레톤 한계 (의도된 것)
- 상태는 MOCK 시 **in-memory** → 새로고침하면 초기화 (실연동 시 Supabase로 대체)
- 비밀번호 **평문** (해시 TODO), RLS 비활성
- 지도·실시간·다중 사용자 동기화 미구현 (seam만 제공)

## 🌿 브랜치 / 커밋
- `main`(구 프로토타입 참조용) → `develop`(이 뼈대) → `feat/*`, `fix/*`
- 커밋: `feat: 모임 생성 API 추가` (한글 OK)
- AI 생성 코드는 PR 본문에 `🤖 Generated with Claude Code` 표기

## ✅ 검증 (3관점)
`npm run build` · `npx tsc --noEmit` · `npm run lint` 통과 + 눈/버튼/로그 확인

## 🧪 디버깅 도구
- **DevBar (🐞)**: 개발 모드 화면 우하단. 원클릭으로 데모 데이터를 채워 메인/투표/결과로 점프.
- **E2E 자동 클릭 (Playwright)**: 실제 브라우저로 전체 플로우를 자동 검증.
  ```bash
  npm run test:e2e       # 헤드리스 실행 (dev 서버 자동 기동, MOCK)
  npm run test:e2e:ui    # UI 모드로 스텝별 확인
  ```
  > Windows에서 브라우저를 처음 쓸 땐 `npx playwright install chromium` 한 번 필요할 수 있어요.
