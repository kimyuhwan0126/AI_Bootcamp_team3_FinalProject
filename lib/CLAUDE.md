# lib/ — 도메인 로직 · 데이터 계층 (AI 작업 지시)

> 이 폴더에서 작업할 때는 **이 파일을 먼저 읽는다.** 루트 `CLAUDE.md` 규칙은 그대로 적용된다.
> 하위 폴더에 더 구체적인 지시서가 있으면 그쪽이 우선: [`scoring/CLAUDE.md`](scoring/CLAUDE.md)

## 소유권

| 파일 | 소유 | 수정 |
|---|---|---|
| `types.ts` · `store.ts` · `persistence.ts` · `supabase.ts` · `flags.ts` | 🔒 통합 담당자 | ❌ 멈추고 PR 설명에 이유를 쓴다 |
| `scoring/types.ts` · `scoring/index.ts` | 🔒 통합 담당자 | ⚠️ 등록 배열에 한 줄만 |
| `ai.ts` · `parse.ts` | 👤 채팅·AI 파싱 담당 | ✅ |
| `scoring/<이름>.ts` · `weather.ts` | 👤 각 담당자 | ✅ |
| `kakao.ts` · `odsay.ts` · `tmap.ts` · `routing.ts` · `geo.ts` | 상황에 따라 | ⚠️ PR 설명에 밝힌다 |

## 데이터 계층 — 어기면 표가 사라진다

```
화면  →  app/api/meeting  →  lib/store.ts  →  lib/persistence.ts  →  lib/supabase.ts
                              (도메인)          (행 매핑)             (클라이언트)
```

1. **화면은 `store.ts` 를 직접 부르지 않는다.** 항상 `app/api/meeting` 을 경유한다.

2. **`store.ts` 의 모든 함수는 `async` 다.** `await` 를 빠뜨리면
   **타입 검사로 안 잡히고 조용히 동작만 안 한다** — 실제로 겪은 버그다.
   ```ts
   const r = saveMeeting(m);      // ❌ Promise 를 그냥 둠. tsc 는 통과한다
   const r = await saveMeeting(m); // ✅
   ```

3. **쓰기 단위를 지킨다.** 모임 행은 `saveMeeting`, 참가자는 `upsertParticipant`,
   표는 `setVote`. 참가자·투표를 모임 행에 함께 담으면 **동시 쓰기에 표가 사라진다**
   (4명이 동시에 투표하는 화면이라 실제로 발생한다).

4. **Supabase 모드에서는 인메모리 캐시를 두지 않는다.** 서버리스는 인스턴스가
   여러 개라, 캐시를 들면 다른 인스턴스가 쓴 표가 폴링에 안 보인다.

5. **DB 객체를 그 자리에서 고쳐도 저장되지 않는다.** 배열을 수정했으면
   `saveCandidates()` 같은 저장 함수를 명시적으로 부른다.

## 외부 API 래퍼 (`kakao.ts` · `odsay.ts` · `tmap.ts`)

1. **반드시 mock 폴백을 갖는다.** 키가 없어도 `npm run dev` 만으로 전체 플로우가
   돌아야 한다 — 팀원이 키 없이 개발·시연할 수 있어야 하기 때문이다.
   실패하면 `null` 을 돌려주고 상위(`routing.ts`)가 추정값으로 떨어진다.

2. **실 API 성공값만 캐시한다.** 폴백을 캐시하면 나중에 키를 넣어도 계속 mock 이 나온다.
   ```ts
   const real = await geocodeKakao(text);
   if (real) { cache.set(key, real); return real; }  // ✅ 성공값만
   return mockGeocode(text);                          // 폴백은 캐시 안 함
   ```

3. **가짜를 실제처럼 그리지 않는다.** 경로가 직선 근사면 `real: false` 로 내려보내고
   UI 가 그렇게 표시한다. ODsay 가 빈 껍데기를 줄 때 "실시간 82분"으로 위장하던
   버그가 실제로 있었다.

4. **💰 유료/한도 API 를 새로 붙이거나 호출 수를 늘릴 땐 먼저 팀에 알린다.**
   카카오 로컬(일 한도) · ODsay(무료 1,000콜/일) · TMAP · Ollama Cloud(`:cloud`).

## 타입

- **`any` 금지.** `unknown` + 타입 가드를 쓴다.
- 도메인 타입은 `types.ts` 에만 둔다 — 🔒 통합 담당자 소유라 추가가 필요하면 PR 에 밝힌다.

## 플래그

만드는 중인 기능은 `flags.ts` 의 `FLAGS.*` 뒤에 둔다.
**상수를 직접 고치지 않는다** — `.env.local` 의 `NEXT_PUBLIC_FF_*` 로 켠다.
브랜치마다 값이 달라지면 머지할 때마다 그 줄에서 충돌난다.

## 로그

`ai.ts` 는 대화를 `logs/ai-trace.jsonl` 에 기록한다.
**이 폴더는 gitignore 대상이다** — 공개 저장소라 커밋되면 참가자 대화가 그대로 공개된다.
새 로그 파일을 만들 땐 `/logs/` 아래에 둔다.

## 검증

```bash
npm run verify     # tsc + build + 브라우저 스모크
```

⚠️ **빌드 통과 ≠ 동작.** `store.ts` 의 `await` 누락은 타입 검사로 안 잡힌다.
데이터 계층을 건드렸으면 **브라우저로 열어 실제로 저장·반영되는지** 본다.
