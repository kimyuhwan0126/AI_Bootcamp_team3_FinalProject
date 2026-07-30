# 모이머(Moimer) v8 — CLAUDE.md (AI 개발 지시서)

> Claude Code가 이 프로젝트를 열 때 가장 먼저 읽는 파일.
> 사람용 문서는 `README.md`(구조·API)와 `팀원_실행안내.md`(설치·키 설정).
> **파일을 바꿨으면 `CHANGELOG.md`에 반드시 기입한다.**
>
> `mds/CLAUDE.md`·`mds/AI-GUIDE.md`는 프로젝트 초기(SyncSpot 시절) 원본 가이드다.
> 스택·폴더 구조 기술이 현재 코드와 다르므로, **충돌 시 이 파일이 기준**이다.
> 팀 운영 원칙(비용 경고·책임 경계·검증 3관점)은 그쪽이 원본이니 함께 읽는다.

---

## 0. 프로젝트 한 줄 요약

각자의 출발지에서 **가장 공평한 중간 지점**을 찾아, **거점 투표 → 가게 투표 → 최종 확정**으로
모임 장소를 정하는 Next.js + Supabase 서비스. 대화는 카카오톡에서 하고, 모이머는 장소만 담당한다.

---

## 1. 기술 스택 (실제 코드 기준)

- **FE**: Next.js 14 App Router + TypeScript + **순수 CSS**(`app/globals.css`)
  - Tailwind·shadcn/ui·Zustand·React Query 는 **쓰지 않는다.** 상태는 `useState` + 1.8초 폴링.
  - 디자인 토큰은 `app/globals.css` 최상단 `:root` CSS 변수. 컴포넌트 클래스는 `v8-*` 접두사.
- **BE**: Next.js API Routes (`app/api/*`) + **Supabase**(PostgreSQL)
- **지도**: 카카오맵 JS SDK (`app/components/KakaoMap.tsx`)
- **이동시간·경로**: ODsay(대중교통) · TMAP(자차)
- **장소·지오코딩**: 카카오 로컬 API
- **AI**: Ollama(OpenAI 호환) 파실리테이터 — **v8에서는 UI 비활성.**
  `AI_CHAT_ENABLED = false` (`app/m/[code]/MeetingClient.tsx`). 코드는 지우지 않는다.
- **배포**: Vercel + Supabase
- **결제**: ❌ 범위 외. 결과 화면의 선입금은 **모의결제**이며 실제 카드·계좌 정보를 받지 않는다.

---

## 2. 폴더 구조

`src/` 를 쓰지 않는다. 루트에 `app/` 과 `lib/` 가 바로 있다.

```
app/            라우트 · 화면 · API 라우트 · 컴포넌트(app/components)
lib/            도메인 로직 · 데이터 계층 · 외부 API 래퍼
supabase/       schema.sql
mds/            초기 가이드 원본 (읽기 전용 참고)
memory/         작업 상태·인계 메모
```

자세한 파일별 역할은 `README.md` §구조 참고.

---

## 3. 핵심 규칙

1. **결제/선입금/환불** — 범위 외. 결과 화면은 모의결제이며 실제 결제 연동을 추가하지 않는다.
2. **Android 네이티브 / 독립 채팅 / OCR / 자동 카톡 동기화** — 범위 외.
3. TypeScript `any` 금지 — `unknown` + 타입 가드를 쓴다.
4. **외부 API는 반드시 mock 폴백을 갖는다.** 키가 없어도 `npm run dev` 만으로 전체 플로우가
   돌아야 한다(팀원이 키 없이 개발·시연할 수 있어야 함). 새 연동도 이 패턴을 지킨다.
5. **실 API 성공값만 캐시한다.** 폴백값을 캐시하면 키를 나중에 넣어도 계속 mock이 나온다.
6. **가짜 데이터를 실제인 것처럼 그리지 않는다.** 경로 폴리라인은 직선 근사일 때
   `real: false` 로 내려보내고 UI가 그렇게 표시한다.
7. 커밋 전 `npx tsc --noEmit` + `npm run build` 통과. 눈/버튼/로그 3관점 스모크.

### 색상 규칙 (중요)

- 참가자 구분색은 `app/components/KakaoMap.tsx` 의 `PIN_COLORS` **하나로만** 관리한다.
  칩과 지도 핀 색이 항상 같아야 하므로 이 배열만 고친다.
- 도착 신호등이 **초록/노랑/빨강**을 쓴다 → `PIN_COLORS` 에 그 계열을 넣지 않는다
  (청록~파랑~보라~마젠타만). 신호등 색은 `lib/geo.ts` 의 `ARRIVAL_COLOR`.
- 중간지점은 빨간 **물방울 핀**이라 참가자(원형)와 모양으로 구분된다.

### 데이터 계층 규칙

- 화면은 `lib/store.ts` 를 직접 부르지 않는다. 항상 `app/api/meeting` 을 경유한다.
- `lib/store.ts` 의 모든 함수는 **async** 다. 새 호출부를 만들면 `await` 를 빠뜨리지 않는다
  (Promise 를 그냥 두면 타입 검사로는 안 잡히고 조용히 동작만 안 한다 — 실제로 겪은 버그).
- 쓰기 단위를 지킨다: 모임 행은 `saveMeeting`, 참가자는 `upsertParticipant`, 표는 `setVote`.
  참가자·투표를 모임 행에 함께 담으면 동시 쓰기에 표가 사라진다.
- Supabase 모드에서는 인메모리 캐시를 두지 않는다 (서버리스 인스턴스 간 불일치).

---

## 4. 비용 경고 규칙 (최우선)

- 유료/한도 있는 외부 API를 **실제로 호출하기 전** 반드시 사전 경고한다.
- **경고 형식**: `[💰 비용 발생 가능] {무엇이} {얼마나}` 명시 후 승인 대기.
- 대상: 카카오 로컬(일 한도), ODsay(무료 1,000콜/일), TMAP, Ollama Cloud(`:cloud` 모델),
  Supabase 유료 플랜 전환.
- 이 규칙은 어떤 상황에서도 생략하지 않는다.

---

## 5. AI vs 팀 책임 경계

- **팀이 판단**: 기획, Scope, 추천 가중치 값, 프롬프트 최종본, UAT 통과 기준, 수동 QA
- **AI가 생성**: 보일러플레이트, API 래퍼, SQL 초안, 테스트 코드, 문서 초안, 리팩터
- AI 생성 코드가 포함된 PR 본문에 `🤖 Generated with Claude Code` 표기

---

## 6. 커밋/브랜치 규칙

- 브랜치: `main` ← `develop` ← `feat/*`, `fix/*`
- 커밋 메시지: `feat: 모임 생성 API 추가` (한글 OK)
- **파일 수정 시 반드시 `CHANGELOG.md` 변경기록 표에 행을 추가한다**
- 비밀키는 절대 커밋하지 않는다 (`.env*.local` 은 `.gitignore` 에 있음)

---

## 7. 관련 문서

| 문서 | 내용 |
|---|---|
| `README.md` | 구조 · 외부 API · 데이터 저장 · 디버깅 도구 |
| `팀원_실행안내.md` | 설치 · 키 설정 · Supabase 준비 · 작업 시 주의점 |
| `CHANGELOG.md` | 모든 변경 기록 (수정 시 필수 기입) |
| `memory/status.md` | 현재 진행 상태와 다음 할 일 |
| `mds/AI-GUIDE.md` | 초기 가이드 원본 (역할별 AI 활용 · 팀 운영 원칙) |
