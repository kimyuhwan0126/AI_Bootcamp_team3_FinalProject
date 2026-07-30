# 모이머 (Moimer) v8

> **흩어진 우리, 딱 중간에서.**
> 각자의 출발지에서 가장 공평한 중간 지점을 찾아, 투표로 함께 모임 장소를 정하는 서비스.

Next.js 14 (App Router) + TypeScript + Supabase. **키가 하나도 없어도 바로 실행됩니다.**

---

## 🚀 빠른 시작

```bash
npm install
npm run dev        # http://localhost:3000
```

키가 없으면 외부 API는 mock으로, DB는 인메모리로 자동 폴백합니다.
설정 상태는 `/api/status`, 실제 API 호출까지 확인하려면 `/api-live` 를 여세요.

**실제 API·DB를 붙이려면** → [`팀원_실행안내.md`](팀원_실행안내.md)

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
  예외 수단(`✍ 다른 후보로 정하기`)도 방장에게만 열려 있다
- 채팅은 스코프 밖 — 대화는 카카오톡에서, 모이머는 "장소 정하기"만 담당
  (AI 파실리테이터 코드는 보존돼 있지만 v8 UI에서는 비활성)

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
  store.ts                데이터 계층 (Supabase ↔ 인메모리 폴백)
  persistence.ts          Meeting 객체 ↔ Supabase 행 매핑
  supabase.ts             서버 전용 Supabase 클라이언트
  routing.ts              실 이동시간 + 캐시 + mock 폴백 통합
  geo.ts                  거점 풀 · 거리 추정 · 도착 신호등 판정
  kakao.ts odsay.ts tmap.ts   외부 API 래퍼 (실패 시 null → 상위에서 폴백)
  ai.ts                   AI 파실리테이터 (v8 UI 비활성, 코드 보존)
  session.ts identity.ts  로그인 3단계 · 기기별 참가자 신원
  types.ts                공용 도메인 타입
supabase/schema.sql       DB 스키마 (SQL Editor 에 붙여 한 번 실행)
```

---

## 🔌 외부 API

| API | 쓰는 곳 | 키 없으면 |
|---|---|---|
| 카카오 로컬 (키워드·주소·좌표→주소·카테고리) | 출발지 검색, 가게/주차장/역 검색 | HUBS mock 목록 |
| 카카오맵 JS SDK | 홈·모임 상세 지도 | 스키매틱 지도로 폴백 |
| 카카오 OAuth | 로그인 시트 | 임시 로그인(이름만) |
| ODsay (`searchPubTransPathT`, `loadLane`) | 대중교통 이동시간·경로선 | 직선거리 추정 |
| TMAP (`/tmap/routes`) | 자차 이동시간·통행료·경로선 | 직선거리 추정 |
| Supabase | 모임·참가자·투표 저장 | 인메모리 (재시작 시 소멸) |
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

`supabase/schema.sql` 을 SQL Editor 에서 한 번 실행하면 만들어집니다.
RLS는 켜 둔 채 서버가 `service_role` 로 우회합니다 — 브라우저는 DB에 직접 접근하지 않습니다.

---

## ✅ 커밋 전 확인

```bash
npx tsc --noEmit    # 타입 오류 없어야 함
npm run build       # 빌드 통과해야 함
```

파일을 바꿨으면 [`CHANGELOG.md`](CHANGELOG.md)에 **반드시** 기입합니다.
AI 개발 규칙은 [`CLAUDE.md`](CLAUDE.md), 팀 온보딩은 [`팀원_실행안내.md`](팀원_실행안내.md).

## 🌿 브랜치 / 커밋

- `main` ← `develop` ← `feat/*`, `fix/*`
- 커밋 메시지 한글 OK: `feat: 모임 생성 API 추가`
- AI 생성 코드는 PR 본문에 `🤖 Generated with Claude Code` 표기

## 🧪 디버깅 도구

- **디버그 시드**: 개발 모드에서 `/api/debug` → 시나리오 하나를 골라 그 상태의 모임을 즉시 생성
  (출발지 미등록 / 일부 등록 / 전원 등록 / 정원 초과 / 확정 완료 / 예약 완료 …)
- **`/api-live`**: 카카오·ODsay·TMAP·DB 연결 상태를 한 화면에서 확인
- **`/api/diag`**: 외부 API를 실제로 호출해 응답 원문과 파싱 결과, 서버 공인 IP까지 반환
  (ODsay 화이트리스트 등록에 필요)
