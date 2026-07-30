# docs/legacy-algo — 되살릴 알고리즘 자산 (참고용, 빌드 대상 아님)

## 이게 뭔가

옛 저장소의 `Moimer VER 1.0`(커밋 `5ff50ee`)에 있던 추천 알고리즘 8종이다.
v7이 v3 코드베이스를 베이스로 채택할 때 **딸려오지 않아 유실**됐다.

그 커밋은 옛 저장소에서도 `main` 의 조상이 아닌 **별도 갈래**라, 히스토리를
옮겨도 따라오지 않는다. 그래서 파일 자체를 여기 꺼내 두었다.

> ⚠️ **빌드 대상이 아니다.** `tsconfig.json` 의 `exclude` 에 `docs` 가 들어 있어
> 타입 검사·빌드에서 제외된다. 지금 코드와 import 경로·타입이 맞지 않으므로
> **그대로 복사하지 말고, 읽고 `lib/scoring/` 규격에 맞춰 옮겨 쓴다.**

## 목록

| 파일 | 내용 | 우선순위 |
|---|---|---|
| `enhanced-scoring.ts` | `fairTime×0.70 + 환승·도보×0.15 + 요금×0.05 + 상권밀집도×0.10` | ★ 핵심 |
| `meeting-type-scoring.ts` | `commercialDensityScore` · 모임 성격 → 카카오 카테고리 매핑 | ★ 핵심 |
| `fair-scoring.ts` | 공평성 점수 (현재 `lib/scoring/fairness.ts` 의 원형) | 참고 |
| `transit-strategy.ts` | ODsay 다중경로 — 최속 / 최소환승 / 최소도보 | 시외 이동시간 작업 시 |
| `travel-time-display.ts` | 이동시간 표기 (현재 `lib/format.ts` 로 일부 반영됨) | 참고 |
| `car-flexible-logic.ts` | 자차 참가자 유연 처리 | 나중 |
| `date-highlight-logic.ts` | 날짜 후보 강조 | 나중 |
| `yield-message-integration.ts` | 양보 메시지 | 나중 |

## 옮길 때 반드시 지킬 것

`enhanced-scoring.ts` 헤더가 스스로 경고하고 있다:

> *"⚠️ 단위 스케일 주의: fairTimeScore 는 '분' 단위(수십), 나머지 항은 0~1.
> 미션 공식 그대로면 시간 항이 지배적이고 penalty/bonus 는 미세 조정 역할."*

**같은 실수를 반복하지 않는다.** `lib/scoring/types.ts` 의 `decayScore(raw, half)` 가
"작을수록 좋은 값"을 0~1 로 바꿔 주고, 인터페이스가 0~1 을 강제한다.
가중치 최종값은 **팀 결정 사항**이다 (루트 `CLAUDE.md` §5).

작성 방법은 `lib/scoring/CLAUDE.md` 참고.
