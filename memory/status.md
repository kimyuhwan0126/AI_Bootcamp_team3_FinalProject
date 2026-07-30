# 모이머(Moimer) — 프로젝트 상태 (status.md)

_최종 업데이트: 2026-07-30 · 작성: Claude(AI) · 브랜치: `claude/moimer-v8-implementation-plan-rsajlr`_
_기준 커밋: `8e5dfc6` (main 이후 14커밋)_

## 지금 상태

**v8 구현 + 실연동 완료.** v8 클릭 프로토타입의 원본이 `feat/v7-mockup` 브랜치의
실앱이었으므로 그 트리를 main 히스토리 위에 채택해 베이스로 삼고, v8 네이밍으로
정렬한 뒤 프로토타입과 어긋난 부분을 맞췄다. 데이터는 **Supabase**로 옮겼고
카카오·ODsay·TMAP 키까지 CEO 로컬 환경에서 실연동 확인됐다.

```
/api/status → db.ready: true · store: "supabase" · kakao/kakaoJs/odsay/tmap 전부 true
```

## v8 확정 사항 (CEO)

- 베이스 = `feat/v7-mockup` 트리 (main과 공통 조상이 없어 머지 불가 → 트리 채택)
- 코드 네이밍도 v8로 통일 (`v8-*` 클래스, `app/components/v8/`, package 8.0.0)
- **AI 채팅은 비활성만.** 코드는 보존 (`AI_CHAT_ENABLED = false`)
- DB = **Supabase** (Neon 아님). 프로젝트 `dpuyrwlgzqblmwrotcky`
- 외부 API 전부 실연동 전제 (키 없으면 mock 폴백은 유지)

## 구현된 화면

| 탭 | 경로 | 상태 |
|---|---|---|
| 홈 | `/` | 출발지 검색(+표시)·칩(최대 8) → 중간지점(거리/시간) → 카카오맵 실지도 + 경로선 → 주변 리스트 · 확정 요약 |
| 모임 | `/meetings` | 목록 + 생성/참여(이름 선택사항) + 생성 완료 요약 |
| 투표함 | `/votes` | 거점/가게 투표 — 실 모임 데이터 연동 |
| 모임원 | `/members` | 참가자 목록 + 도착 신호등 자가신고 |
| 내정보 | `/me` | 저장 위치·애용 이동수단 (→ 출발지 폼에 반영됨) |
| 모임 상세 | `/m/[code]` | 출발지 등록 → 거점 투표(**후보 직접 등록 가능**) → 가게 투표 → 확정 |

## 데이터 계층

`lib/store.ts`(도메인) → `lib/persistence.ts`(매핑) → `lib/supabase.ts`(클라이언트).
쓰기 경합 기준으로 테이블 3개: `meetings`(jsonb 포함) / `participants` / `votes`.
`votes`는 PK로 1인 1표를 DB가 보장한다. Supabase 모드에서는 인메모리 캐시를 두지 않는다.

---

## ⚠️ 다음 작업 — 여기서부터 이어서

### 1. 추천 알고리즘 (CEO: "백에서 제대로 생각해봐야 할 것 같다")

**현재 상태 — 점수식이 이것뿐이다** (`lib/geo.ts:196`, `lib/routing.ts:87`):

```
score = 최대이동시간 + 편차 × 0.8   → 낮은 순 3개
```

상권·환승·요금·모임 성격 **전부 미반영**.

- **수도권 안**: 후보 풀이 하드코딩 12곳(강남·홍대·잠실·건대…). 결과가 괜찮아 보이는 건
  알고리즘이 아니라 **사람이 미리 골라둔 큐레이션** 덕분이다.
- **수도권 밖**: 중심이 12곳 중 가장 가까운 곳에서도 45km 넘으면(`isOutsideHubCoverage`)
  `geometricCandidates()`로 빠진다 — 가장 먼 두 사람을 잇는 선 위 5개 지점을 순수 기하로
  찍어 역지오코딩할 뿐. 서울↔부산 → `김천시 개령면 신룡리`, `상주시 모동면 덕곡리`.
  **모일 수 있는 곳이 아니다.**

**되살릴 자산이 있다.** `Moimer VER 1.0`(`5ff50ee`)에 알고리즘 8종이 있고
v7이 v3 코드베이스를 채택할 때 딸려오지 않았다. `git show 5ff50ee:src/lib/algo/<파일>`로 꺼낼 수 있다.

| 파일 | 내용 |
|---|---|
| `enhanced-scoring.ts` | `fairTime×0.70 + 환승·도보×0.15 + 요금×0.05 + 상권밀집도×0.10` |
| `meeting-type-scoring.ts` | `commercialDensityScore` · 모임 성격 → 카카오 카테고리 매핑 |
| `fair-scoring.ts` | 공평성 점수 (`origin/develop`에도 있음) |
| `transit-strategy.ts` | ODsay 다중경로 — 최속/최소환승/최소도보 |
| `yield-message-integration.ts`, `car-flexible-logic.ts`, `date-highlight-logic.ts`, `travel-time-display.ts` | 보조 |

`enhanced-scoring.ts` 헤더에 이미 이렇게 적혀 있다:
> *"현재 scoreCandidate는 대중교통 이동시간(분)만 반영 → 환승/도보/요금/상권밀도 0점"*
> *"⚠️ 단위 스케일 주의: fairTimeScore는 '분'(수십), 나머지는 0~1. `normalizeTimeBy(120)` 옵션 제공(팀 결정용)"*

**제안한 3단계** (CEO 검토 대기):
1. 수도권 밖 후보를 **역·터미널**에서 뽑기 — `searchByCategoryKakao("SW8")` 이미 있음.
   김천 개령면 → 김천구미역. 하드코딩 12곳 의존도도 낮아진다.
2. **상권 밀집도** 반영 — `/api/places`가 이미 주변 상권을 센다. `commercialDensityScore` 부활.
3. `enhanced-scoring.ts` **전체 이식**. 가중치·`normalizeTimeBy` 최종값은 **팀 결정 사항**(CLAUDE.md §5).

### 2. 수단별 이동시간 (KTX·고속버스) — 미착수

CEO 보고: *"ktx만 하면 82분이 뜨더라. 김천역까지만 1시간 22분이었어. 수단별로 보여줘야 할 듯."*

- ✅ 한 것: 표기 단위 `82분` → `1시간 22분` (`lib/format.ts`), 그리고 ODsay가 빈 껍데기를
  줄 때 "실시간"으로 위장하던 문제 수정 → 추정값 폴백 + 경고 박스 (`7f342ea`)
- ❌ 남은 것: **KTX/고속버스 실제 반영.** 현재 `searchPubTransPathT`(도시 내 대중교통)만 써서
  서울→김천 같은 시외 구간은 근본적으로 답을 못 낸다. ODsay 시외 전용 엔드포인트 연동 필요.

> 이 둘(수도권 밖 후보 선정 · 시외 이동시간)은 같은 문제의 앞뒤다 — **함께 설계하는 것을 권한다.**

### 3. 그 외

- [ ] 모임 비밀번호 **평문** — 해시 필요 (`supabase/schema.sql` TODO(BE))
- [ ] Vercel 배포. AI를 되살릴 땐 `void runAiTurn()`을 `waitUntil()`로 감싸야 함
- [ ] 폴링(1.8초) → Supabase Realtime 검토
- [ ] 알림(헤더 벨) 실데이터 연결 — 현재 빈 상태 표시
- [ ] 구글 캘린더 **가져오기** (현재 내보내기만)

---

## 이 세션에서 잡은 버그 (재발 방지용 기록)

프로토타입 → 실앱 이식 과정에서 **프로토타입이 이미 고쳐둔 것이 유실된 사례**가 반복됐다.
원인은 프로토타입 html의 수정이 `.proto-screen` 접두사가 붙은
`/* 프로토타입 전용(실제 앱엔 없음) */` 블록 안에 있어서, 공통 블록만 이식됐기 때문.

| 증상 | 원인 |
|---|---|
| 모달이 짧은 창에서 잘리고 스크롤 불가 | `.v8-modal`에 `max-height`/`overflow` 없음 — 프로토타입엔 있었음 |
| 로그인 모달 위쪽이 화면 밖으로 | `.v8-header`의 `backdrop-filter`가 fixed 자손의 기준 박스를 헤더로 바꿈 → `createPortal(document.body)` |
| 방장 바가 마지막 버튼을 덮음 | `position:sticky; bottom:64px`는 문서 끝에서 흐름 위치보다 64px 위로 올라앉음 → `fixed`로 통일 |
| 검색 결과에 (+) 표시 없음 | 프로토타입 확정안이 이식 누락 |
| 참여 아이콘이 탈퇴처럼 보임 | 화살표가 문 밖으로 — 프로토타입은 안으로 |

**교훈**: `.appbar` · `.leaderbar` · `.v8-bottomnav` · `.v8-header`는 모두 `backdrop-filter`를
쓴다. 그 안에서 `position:fixed` 오버레이를 띄우면 갇힌다 — 반드시 포털을 거칠 것.

**타입검사·빌드로 안 잡히는 것들**도 있었다:
- `seedScenario`에 `await` 누락 → 시드가 조용히 무동작
- `useEffect`를 조건부 `return` 뒤에 배치 → 화면이 통째로 미렌더 (빌드는 통과)
→ **브라우저로 실제로 열어봐야 잡힌다.**

## 한계 (의도된 범위)

결과 화면 선입금은 **모의결제** · AI 파실리테이터는 UI 비활성(코드 보존) ·
구글 캘린더는 내보내기만 · 알림은 미연동.
