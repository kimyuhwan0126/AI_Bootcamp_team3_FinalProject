# API·권한 전수 조사 (에이전트 1) — 2026-08-11

테스트 후보 **166개** 중 이미 커버 30 · 부분 10 · **미커버 126**.

## 즉시 고칠 것 (코드 근거 확실)

| # | 결함 | 근거 |
|---|---|---|
| ① | **강퇴자 재참여에 PIN 검사가 없다 — 신원 탈취** | route.ts 57-63 이 PIN 검사(:68)보다 위. 이름만 알면 그 사람 쿠키를 받는다 |
| ② | **PIN 이 어디에도 안 쓰인다** | `pinMatches` import 만 되고 호출 0회. 쿠키 잃으면 영구 퇴출, 방장이면 모임이 벽돌 |
| ③ | **kick/approve 에 모임 소속 검사 없음 (IDOR)** | `setState`는 `where id=?` 뿐. 남의 모임 사람을 강퇴 가능 |
| ④ | **approve(ok:false) 가 cannot_kick_host 우회** | 방장을 kicked 로 만들면 모든 액션 403 → 모임 잠김 |
| ⑤ | **이미 멤버가 다시 join 하면 참가자가 늘어난다** | 멤버 검사가 `action !== 'join'` 일 때만. 표 부풀리기 |
| ⑥ | **남이 찍어 준 내 후보를 두고 leave 하면 500** | `created_by` FK 에 ON DELETE 없음(NO ACTION) |
| ⑦ | **confirm 이 candidateId 를 검증하지 않는다** | 존재·종류·소속 무검사, winner_* 에 FK 도 없음 |
| ⑧ | 닫힌 모임은 삭제도 되돌리기도 불가 | `closed` 가드가 remove/reopen 까지 막음 |
| ⑨ | unping 에만 단계 가드가 없다 | result 에서 승자 표를 깎고 후보를 지울 수 있음 |
| ⑩ | ai 가 단계 가드를 우회 | result 에서도 place 후보를 밀어 넣음. `by_ai` 도 안 붙음 |
| ⑪ | **GET 응답에 pin_hash 가 섞여 나간다** | `select *` → 스프레드 → json 직송. 좌표·participantId 도 함께 |
| ⑫ | remove 만 bump 를 안 부른다 | 보던 사람은 모임이 사라진 걸 모름 |
| ⑬ | refId 없는 ping 이 후보를 무한 증식 | unique 에서 NULL 은 서로 다른 값 |
| ⑭ | 잘못된 입력이 DB 제약까지 가서 500 | transport/scope/kind/lat 누락, 깨진 JSON |

## 추측 (의도일 수 있음)
- reopen 이 winner 를 남긴다 → 되돌린 직후 region 에서 close 가 통과
- voters 배열 전체 공개 (누가 어디 찍었는지)
- 비멤버도 SSE 구독 가능, 없는 코드로도 스트림이 열려 타이머가 돔

## 미검증 영역
scope='region' 경로 전체 · 단계 가드 6종 · 행위자 5종 × HOST_ONLY 9종 · 동시성 9종 · 쿠키 위조 · expirePending 24시간
