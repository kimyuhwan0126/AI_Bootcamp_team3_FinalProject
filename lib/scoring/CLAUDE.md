# lib/scoring — 추천 점수 (AI 작업 지시)

> 이 폴더에서 작업할 때는 **이 파일만 읽으면 된다.** 루트 `CLAUDE.md` 의 일반 규칙은
> 그대로 적용되지만, 여기서는 아래 규칙이 우선한다.

## 소유권 — 어떤 파일을 고쳐도 되는가

| 파일 | 소유 | 수정 |
|---|---|---|
| `types.ts` | 통합 세션 | ❌ 건드리지 않는다 |
| `index.ts` | 통합 세션 | ⚠️ **REGISTRY 배열에 한 줄 + import 한 줄만** |
| `fairness.ts` · `commercial.ts` · `weather.ts` · `personal.ts` … | 각 담당자 1명 | ✅ 자기 파일만 |

**자기 담당이 아닌 파일을 고쳐야 할 것 같으면 멈추고 PR 설명에 이유를 쓴다.**
대개는 안 고쳐도 되게 `ScoreContext` 에 이미 정보가 들어있다.

## 새 스코어러 만드는 법 — 이대로 복사해서 쓴다

`lib/scoring/<내이름>.ts` 파일 하나를 만든다:

```ts
import { decayScore, worstOf } from "./types";
import type { Scorer } from "./types";
import { FLAGS } from "@/lib/flags";

export const commercial: Scorer = {
  key: "commercial",
  label: "상권",
  weight: 0.4,                          // TODO(팀): 최종값은 팀이 정한다
  enabled: () => FLAGS.weather,         // 플래그로 껐다 켤 거면. 아니면 이 줄 삭제
  score(ctx) {
    // ctx.hub          후보 좌표
    // ctx.name         후보 지명
    // ctx.participants 출발지 등록한 참가자 (lat/lng 보장)
    // ctx.travel       참가자별 이동시간(분) — 이미 계산돼 있다
    // ctx.when         { dateIso, timeHhmm }
    // ctx.weather      FLAGS.weather 꺼져 있으면 undefined
    const shops = 0; // ← 실제 계산
    return decayScore(1 / Math.max(shops, 1), 1); // 반드시 0~1
  },
  explain(ctx) {
    return `주변 상권 N곳`;             // 발표에서 "왜 이 장소인가"로 쓰인다
  },
};
```

그리고 `index.ts` 의 `REGISTRY` 에 **한 줄만** 추가한다:

```ts
const REGISTRY: Scorer[] = [
  fairness,
  commercial,   // ← 이 한 줄
];
```

배열 끝에 한 줄씩 더하는 방식이라, 두 사람이 동시에 추가해도 충돌은
"양쪽 줄 다 남기기"로 끝난다.

## 절대 규칙 4개

1. **`score()` 는 0~1 을 돌려준다. 높을수록 좋다.**
   분·미터·원처럼 "작을수록 좋은" 값은 `decayScore(raw, half)` 로 바꾼다.
   `half` 는 0.5점이 되는 지점이다. 이걸 어기면 그 스코어러 하나가 나머지 전부를
   덮어쓴다 — 구버전에서 실제로 났던 사고다(`fairTimeScore` 는 분 단위였는데
   나머지는 0~1이라 시간이 사실상 100% 가중치였다).

2. **여러 사람의 만족도를 합칠 땐 평균이 아니라 `worstOf()`(최솟값).**
   이 앱의 공평성 정의가 "아무도 혼자 크게 손해보지 않는 것"이다. 평균을 쓰면
   3명 만족 + 1명 지옥인 후보가 1위로 올라온다.

3. **외부 API 를 부르면 mock 폴백을 반드시 만든다** (루트 `CLAUDE.md` §4).
   키가 없어도 `npm run dev` 만으로 전체 플로우가 돌아야 한다. 그리고
   **폴백값은 캐시하지 않는다** — 나중에 키를 넣어도 계속 mock 이 나온다.

4. **이동시간을 다시 계산하지 않는다.** `ctx.travel` 에 이미 있다.
   스코어러마다 다시 부르면 유료 API 를 (후보 수 × 스코어러 수)만큼 때린다.
   유료 API 를 새로 붙일 땐 루트 `CLAUDE.md` §4 의 비용 경고를 먼저 한다.

## 검증

```bash
npx tsc --noEmit && npm run build
```

⚠️ **빌드 통과 = 동작 아님.** 이 프로젝트에서 타입검사·빌드를 다 통과하고도
화면이 통째로 안 그려진 적이 있다. 점수를 바꿨으면 반드시 브라우저로 열어
추천 결과가 실제로 바뀌는지 본다.

## 지금 상태

- 등록된 스코어러: `fairness` 하나 (v8 까지의 유일한 점수식)
- `geo.ts` 는 브라우저에서도 도는 즉시 추정 경로라 **공평성만** 본다
  (`fairnessRaw()` 를 직접 가져다 씀). 전체 스코어러는 서버의 `routing.ts` 에서만 돈다.
- 되살릴 자산: **`docs/legacy-algo/`** 에 알고리즘 8종이 들어 있다 (빌드 대상 아님).
  그대로 복사하지 말고 읽고 위 규격에 맞춰 옮겨 쓴다 — `docs/legacy-algo/README.md`
