# app/m/[code] — 모임 상세 화면 (AI 작업 지시)

> 이 폴더에서 작업할 때는 **이 파일을 먼저 읽는다.**
> 루트 `CLAUDE.md` 의 일반 규칙은 그대로 적용된다.

## 구조

```
page.tsx              서버 컴포넌트 (code 만 넘긴다)
MeetingClient.tsx     상태 + 폴링 + 액션 + 조립           🔒 통합 세션
sections/
  VoteList.tsx        거점/가게 투표 목록                 👤 투표·추천 담당
  AddRegionModal.tsx  ＋ 다른 후보 등록 (지도 검색)        👤 투표·추천 담당
  ManualPickModal.tsx ✍ 다른 후보로 정하기 (방장)         👤 투표·추천 담당
  LeaderBar.tsx       방장 컨트롤 바 (확정·되돌리기)       👤 투표·추천 담당
  ChatPanel.tsx       AI 채팅 패널 (+ PrefChips)          👤 채팅·AI 파싱 담당
  MeetingHeader.tsx   헤더 · 신원 전환 · 스텝
  MapPanel.tsx        지도 (+ SDK 실패 시 폴백)
  OriginForm.tsx      출발지 등록 폼
  ParticipantList.tsx 참여자 현황
  ResultSection.tsx   최종 결과 화면
  ReserveModal.tsx    예약·선입금(모의)
  TravelTimes.tsx     참가자별 이동시간 목록
  PastStepView.tsx    지난 단계 조회(읽기전용)
  AddParticipant.tsx  참가자 추가 모달(테스트용)
  DebugWidget.tsx     개발 빌드 전용 빠른 채우기
```

**자기 담당 파일만 만진다.** `MeetingClient.tsx` 를 고쳐야 할 것 같으면
멈추고 PR 설명에 이유를 쓴다 — 여기가 이 프로젝트에서 제일 충돌이 잦은 파일이다.

> 화면 조각은 전부 `sections/` 로 나왔고, `MeetingClient.tsx` 에 남은 것은
> **상태·폴링·액션(로직 572줄) + 조립(334줄)** 이다. 새 UI 를 만들 때는
> `sections/` 에 파일을 만들고 여기서 한 줄로 꽂는다.

## 이 화면에서 실제로 났던 사고 (반복 금지)

### 1. 훅을 조건부 `return` 뒤에 두면 화면이 통째로 안 그려진다

`npx tsc --noEmit` 도 `npm run build` 도 **둘 다 통과하는데** 아무것도 안 나온다.
`useState`·`useEffect`·`useMemo`·`useCallback` 은 **전부 `if (notFound) return ...` 위에** 둔다.

### 2. `backdrop-filter` 안에서는 `position: fixed` 가 갇힌다

`.appbar` · `.leaderbar` · `.v8-bottomnav` · `.v8-header` 가 모두 `backdrop-filter` 를 쓴다.
`transform` 과 마찬가지로 fixed 자손의 기준 박스를 그 요소로 바꾼다 —
그 안에서 전체화면 오버레이를 띄우면 헤더 안에 갇혀 잘린다.
**반드시 `createPortal(…, document.body)` 를 거친다** (`components/v8/LoginSheet.tsx` 참고).

### 3. `lib/store.ts` 함수는 전부 async 다

`await` 를 빠뜨리면 타입 검사로 안 잡히고 조용히 동작만 안 한다.

### 4. 모달은 조건부 렌더라 빌드로 안 잡힌다

prop 하나만 어긋나도 조용히 안 열린다. 모달을 건드렸으면
`tests/modals.spec.ts` 를 돌리거나 브라우저로 직접 열어본다.

## 데이터 흐름

```
1.8초 폴링 → GET /api/meeting?code=  → MeetingState
액션        → POST /api/meeting { action, ... } → 성공하면 즉시 재로드
```

- 화면은 `lib/store.ts` 를 직접 부르지 않는다. 항상 `app/api/meeting` 을 경유한다.
- 참가자 신원은 localStorage 다 (`lib/identity.ts`). 한 기기에서 여러 명으로
  전환하며 전체 플로우를 테스트할 수 있다.

## 플래그

```ts
const AI_CHAT_ENABLED = FLAGS.aiChat;   // NEXT_PUBLIC_FF_AI_CHAT=1 로 켠다
```

이 값을 코드에서 직접 `true` 로 바꾸지 않는다 — 브랜치마다 값이 달라져
머지할 때마다 충돌난다. 켜면 투표 UI 가 채팅 UI 로 **대체**된다(둘이 같이 뜨지 않는다).

## 검증

```bash
npm run verify        # tsc + build + 브라우저 스모크
```

⚠️ **빌드 통과 ≠ 화면 렌더.** 위 사고 1번이 정확히 그 경우였다.

## 남은 일

`MeetingClient.tsx` 906줄. 화면 조각은 전부 `sections/` 로 나왔으므로
**담당자별 소유권 분리는 끝났다** — 팀원이 만질 파일은 모두 400줄 미만이다.

더 줄이려면 상태·폴링·액션(로직 572줄)을 `useMeeting()` 커스텀 훅으로 빼면 된다.
다만 그 코드는 어차피 통합 세션 소유라 **충돌 방지 효과는 없다** — 순수하게
읽기 편해지는 작업이라 급하지 않다. (팀원 합류 후에 해도 무방)
