# 모이머(Moimer) — 변경 기록

> 이 파일의 파일을 바꾼 경우 아래에 **반드시** 기입한다.
> 형식: `날짜 | 작업자 | 대상 파일 | 변경 내용 | 사유`
> 기록 없는 변경 금지.

---

## v0.1.0 — 2026-07-30 · 새 저장소 시작

### 통합 개발 저장소로 이관 (`AI_Bootcamp_team3_FinalProject`)

팀원 4명이 각자 브랜치로 동시에 개발하고 통합 담당자가 머지를 전담하는 체제로
전환하면서 저장소를 새로 팠다. **코드는 옛 저장소의 `v8.1.0` 과 동일**하고,
히스토리도 그대로 옮겼다(31커밋).

> ⚠️ **버전 번호가 내려간 게 아니라 체계가 바뀐 것이다.**
> 옛 `v8` = "8번째로 다시 만든 시제품"(내부 반복 횟수)
> 새 `0.1.0` = "아직 정식 출시 전인 개발 버전"(SemVer 표준 의미)
> **최종 발표일에 `1.0.0`** 을 낸다. 규칙은 `docs/버전관리.md`.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-08-05 | Claude(AI) | `db/migrations/001_api_cache.sql`(신규) · `lib/cache-store.ts`(신규) · `lib/routing.ts` | 외부 API 응답 캐시를 **DB 계층(L2)** 으로 확장 — `geo_cache`(TTL 30일) · `route_cache`(TTL 6시간). 조회 순서는 **L1 메모리 → L2 DB → L3 API** | 캐시가 메모리 Map 뿐이라 **서버를 재시작하면 전부 사라졌다** — 실측으로 재시작 직후 첫 조회 2,597ms(외부 14콜), 재조회 190ms. 오늘만 서버가 3번 내려갔고 그때마다 유료 호출을 처음부터 다시 했다. ⚠️ **TTL 은 필수다**: ① ODsay 약관 4.5.10 이 "사전 동의 없이 결과 데이터 저장"을 금하는데 무기한 축적은 명백한 "저장"이고 만료되는 임시 캐시는 성격이 다르다(영구 보관이 필요하면 사전 동의를 받는다) ② 대중교통 소요시간은 시간대·요일에 따라 달라져 낡은 값이 계속 나오면 안 된다. ⚠️ 개인정보는 담지 않는다 — "검색어→좌표", "좌표쌍→분" 같은 공개 지리 정보뿐이고 참가자 실제 출발지는 기존대로 `participants` 가 갖는다(모임 삭제 시 함께 삭제). DB 가 없으면(팀원 로컬) 전부 조용히 무시되고 L1 만 쓴다 |
| 2026-08-05 | Claude(AI) | `lib/odsay.ts` | `odsayError()` 가 `error` 를 **배열·객체 둘 다** 인식하도록 수정 (+ `msg` 키·숫자 code 대응) | ODsay 는 인증 실패는 `error: [ {...} ]` **배열**로, **429·-98 은 `error: { ... }` 객체**로 보낸다. 기존 코드는 `!Array.isArray(err) → return false` 라 **객체형을 통째로 놓쳤고**, 뒤에서 `result.path` 가 없다는 이유로 `warnEmpty` 가 찍혀 **"구간을 못 푸는 것으로 보인다"** 는 사실과 다른 진단이 남았다. 실제 사유는 `429 Too Many Requests` 였다 — 이 오진 때문에 원인 추적이 좌표 쪽으로 한참 샜다 |
| 2026-08-05 | Claude(AI) | `lib/routing.ts` | `travelMinutesEx` 의 실제 API 호출 직전에 **속도 게이트**(요청 시작을 250ms 간격으로 배분) 추가 | **동시 14건 발사 시 9건이 429 로 거절**되고 추정 폴백으로 떨어져 `live:false` 가 됐다. 실측(동일 14구간): 동시 → OK 4·429 9 / 순차 250ms → **OK 14·429 0**. 구간 문제가 아니라 속도 문제였다. 팬아웃이 🔒 `lib/scoring/index.ts`(거점 N개 동시) + `routing.ts`(참가자 M명 동시) **두 겹**이라 바깥을 못 건드리므로, **호출 지점 자체를 막아** 모든 호출부가 자동 보호되게 했다. 캐시 히트·근거리 단락은 게이트 앞에서 끝나 영향 없음. 응답을 기다리지 않고 시작만 벌려 14건 ≈ 3.5초(완전 순차는 9.4초) |
| 2026-08-04 | Claude(AI) | `lib/routing.ts` | 폴백 지점(추정값 반환 직전)에 좌표 포함 `console.warn` 추가 | `#29` 의 odsay warn 은 "왜"(HTTP·빈 경로)만 남기고 좌표를 안 남긴다 — 시간순 재실행에서 **"200 인데 경로 비어 있음" 9건**이 찍혔지만 어느 구간인지 알 수 없었다. 앱의 모든 추정값이 이 한 줄을 지나므로 여기서 "어디"를 남기면 두 로그를 짝지어 문제 구간이 로그만으로 확정된다. 좌표는 비밀이 아니고 URL·키는 찍지 않는다 |
| 2026-08-04 | Claude(AI) | `lib/routing.ts` | `travelMinutesEx` 에 근거리(≤700m) 단락 추가 — 대중교통이면 ODsay 를 부르지 않고 도보 시간(시속 4km, 최소 1분)으로 환산해 `real: true` 로 반환 | ODsay 는 출발-도착 700m 이내를 **`-98 "출, 도착지가 700m이내입니다."`** 로 거부한다(홍대입구역→홍대입구 거점 70m 실측). 참가자가 후보 거점의 700m 안에 있으면(역 이름 검색 UX 상 역세권 참가자는 거의 항상 해당) 그 구간만 추정 폴백 → live 정의("한 구간이라도 추정이면 false")에 걸려 **전체 목록이 "거리 추정으로 계산" 배지**를 달았다(강남·홍대 2인 실측). 도보 환산을 실값으로 치는 근거: ODsay 스스로 "경로 없음(걸어가라)" 판정하는 구간이므로 추측이 아니라 그 판정을 따르는 것. 실패 확정 콜도 절약된다. `estMinutes` 는 환승·대기 6분을 깔아 70m 에 6분이 나오므로 쓰지 않았다. 자차는 -98 대상이 아니라 기존대로 TMAP 호출 |
| 2026-08-04 | Claude(AI) | `.claude/launch.json` | 미리보기 포트를 `3000` → **`3100`** | `package.json` 과 짝을 맞춘다. 이 브랜치의 개발 서버가 3100 이므로 도구 설정도 같아야 미리보기가 붙는다 |
| 2026-08-04 | Claude(AI) | `package.json` | `dev` · `start` 의 포트를 `3000` → **`3100`** (develop-selfhost 계열 전용) | **팀원이 3000 을 쓰므로 자체 서버 개발은 3100 으로 갈라둔다** — 같은 기기에서 둘이 부딪히지 않게. 카카오 API 는 3000·3100 둘 다 등록돼 있어 어느 쪽이든 동작한다. ⚠️ 충돌 회피를 위해 `-p` 를 떼는 안도 검토했으나, 기본값 3000 으로 떨어지면 `.env.local` 의 `KAKAO_REDIRECT_URI`(3100)와 어긋나 **로그인이 조용히 깨진다.** ⚠️ `PORT` 를 `.env.local` 에 넣는 우회는 **안 먹는다**: 포트는 CLI 가 `.env.local` 로딩 전에 정한다(3005 로 넣고 3000 으로 뜨는 것 실측). 🔒 공용 파일이라 통합 담당자 확인 후 진행. develop 과 이 줄에서 충돌하며, 해결은 항상 **selfhost = 3100 유지** |
| 2026-08-04 | Claude(AI) | `next.config.mjs` | `SELF_HOST_URL` 이 있을 때만 `/api/*` 를 그 주소로 넘기는 `rewrites`(`beforeFiles`) 추가 | 백엔드를 자체 서버로 옮기면서 Vercel 은 화면 + 전달만 맡는다. **변수가 비면 빈 배열이라 기존과 100% 동일** — 자체 서버 본체와 팀원 로컬은 안 깨진다. `beforeFiles` 가 아니면 `app/api/*` 파일 라우트가 먼저 잡혀 rewrite 가 영영 안 걸린다(실측 확인). GET·POST·쿼리스트링 전부 전달되는 것과, 대상이 죽으면 화면은 200 이지만 API 는 전부 실패하는 것까지 확인 |
| 2026-08-04 | Claude(AI) | `.gitignore` | 루트 로그 파일(`dev-*.log` · `*.log`)을 무시 목록에 추가 | 기존 규칙은 `/logs/` 와 `npm/yarn-debug.log*` 뿐이라 **루트에 떨어지는 `dev-3000.log` 가 안 걸렸다.** 개발 서버를 파일로 돌리면 요청 경로·좌표·오류가 그대로 쌓이는데, 공개 저장소라 커밋되면 그 내용이 공개된다. 실제로 추적되지 않은 채 작업 트리에 있었다 |
| 2026-08-04 | Claude(AI) | `lib/ai.ts` · `.env.example` | `chatCompletion` 에 `apiKey` 파라미터 추가 · 하드코딩된 `Authorization: "Bearer ollama"` 를 `OLLAMA_{PRIMARY,FALLBACK}_API_KEY` 로 · 기본값 `"ollama"` 유지 | **Ollama Cloud 를 쓸 통로가 아예 없었다.** 로컬 Ollama 는 토큰을 검사하지 않아 더미 문자열로 충분했지만, `ollama.com` 은 진짜 키를 요구해 401 이 난다. 기본값을 `"ollama"` 로 둬서 키를 안 넣은 팀원의 로컬 동작은 그대로다. ⚠️ 클라우드 모델 ID 에 `:cloud` 를 붙이면 안 된다 — 그건 로컬 ollama 의 중계 표기이고 클라우드엔 `glm-5.2` 로 존재한다(실측). ⚠️ `glm-5.2` 는 추론 모델이라 `max_tokens` 를 낮게 걸면 사고 토큰만 쓰고 `content` 가 빈 문자열로 온다(64 로 실측) — 현재 `lib/ai.ts` 는 `max_tokens` 를 안 보내므로 무해하지만 넣을 때 주의 |
| 2026-08-03 | Claude(AI) | `lib/env.ts`, `lib/odsay.ts`, `.env.example` | ODsay 호출 주소를 `ODSAY_BASE_URL` 로 빼고, `ODSAY_PROXY_SECRET` 이 있으면 `x-proxy-secret` 헤더로 보낸다 (fetch 4곳). 끝 슬래시·공백 자동 제거 | ODsay 서버 키는 **호출 IP 화이트리스트**가 필요한데 Vercel 서버리스는 나가는 IP 가 유동이라 등록이 불가능하다. 고정 IP 프록시를 거칠 수 있게 한다. **환경변수가 비면 기본값이 `api.odsay.com` + 헤더 없음이라 기존과 100% 동일** — 팀원 로컬이 안 깨진다 |
| 2026-08-03 | Claude(AI) | `lib/odsay.ts` | ODsay 의 **"HTTP 200 + `error` 본문"** 을 명시적으로 잡고 `console.warn` 으로 사유를 남긴다 | ODsay 는 인증 실패에도 200 을 준다(`[ApiKeyAuthFailed]`). `if (!r.ok)` 로는 못 잡고 뒤에서 우연히 걸러질 뿐이었다. 로그가 있어야 Vercel 에서 **"터널 장애"와 "키 문제"를 구분**할 수 있다 |
| 2026-08-03 | Claude(AI) | `lib/routing.ts` | `travelMinutesEx`(`{min, real}`) · `recommendRegionsWithMeta`(`{items, live}`) **신설**. 기존 `travelMinutes` · `recommendRegions` 는 값만 꺼내는 **래퍼로 유지** | `live` 를 알려면 이동시간이 실 API 값인지 알아야 하는데, 시그니처를 바꾸면 🔒 `app/api/meeting/route.ts`(3곳)와 👤 `lib/ai.ts` 까지 번진다. **순수 추가 방식**이라 두 파일 diff 가 0줄이다 |
| 2026-08-03 | Claude(AI) | `app/api/midpoint/route.ts` | `live: has.odsay \|\| has.tmap` → **실제 결과의 `live`** | 예전 판정은 **키가 있는지**만 봐서, 키를 넣는 순간 무조건 `true` 였다. 프로덕션에서 **실측 40분과 추정 894분이 한 목록에 섞였는데 전부 "실 이동시간 기준"** 으로 표시됐다(2026-08-03). 프록시가 죽어도 화면으로는 알 수가 없다 |
| 2026-08-03 | Claude(AI) | `app/page.tsx` | `"경로 API 키 없음 — 거리 추정으로 계산"` → `"거리 추정으로 계산"` | 키가 있어도 프록시·터널 장애면 폴백이므로 **"키 없음"은 원인 중 하나일 뿐**이다. 원인을 단정하지 않고 무엇을 보고 있는지만 밝힌다 |
| 2026-08-03 | Claude(AI) | `lib/geo.ts` | **전국 거점 16곳 추가** (`HUBS` + `CANDIDATE_HUBS` 12곳 → 28곳) — 수도권 2 · 충청 3 · 경북경남 5 · 전라 4 · 강원 2 | 후보 풀이 서울 12곳뿐이라 지방 모임이 `geometricCandidates`(순수 기하 폴백)로 빠져 **`옥천군 안남면 도덕리` 같은 모일 수 없는 좌표가 확정**되고, 거기서 존재하지 않는 mock 가게가 떴다(CEO 실측). 로직이 아니라 **데이터가 비어 있던 문제**다 |
| 2026-08-03 | Claude(AI) | `lib/geo.ts` | `HUB_COVER_KM` **45 → 55** | 거점을 넣어도 **서울+부산이 여전히 폴백**이었다 — 중심(경북 내륙 공백지대)에서 최근접 대전역이 55km 라 45km 임계를 한 걸음 차이로 넘겼다. 실측: 45km 는 장거리 7조합 중 4개만 정상, **55km 는 7/7 정상**. 45 는 후보가 수도권 12곳뿐이던 시절의 값이라 전국 풀에서는 의미가 달라졌다 (팀 결정) |
| 2026-08-03 | Claude(AI) | `lib/geo.ts` | `nearCentroidHubs` 의 "가까운 순 4곳 강제 확보" 폴백에 **절대거리 상한 `FALLBACK_MAX_KM = 60`** 추가 (상한 밖이면 최근접 1곳 보장) | 전국 거점이 생기면서 **대구 2인 모임 후보 2·3위에 창원(72km)·울산(72km)이 떴다.** 스코어러가 순위는 밀어내지만 후보 목록에는 남고 💰 이동시간 API 를 후보 수만큼 때린다(추천 1회 = 후보수 × 참가자수). 대구 2인 기준 호출 4 → 1 (팀 결정) |
| 2026-08-03 | Claude(AI) | `lib/geo.ts` | `geometricCandidates` 주석 갱신 — **최후수단**임과 "여기로 빠졌다면 거점 풀이 비었다는 신호"임을 명시 | 값(HUB_COVER_KM)을 조정하기 전에 거점 추가를 먼저 검토하도록 다음 세션에 남긴다 |
| 2026-08-03 | Claude(AI) | `memory/status.md` §3-2 | 전국 거점 확장 결과 반영 (수도권 밖 서술 · before/after) | 인계 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다 |
| 2026-08-03 | Claude(AI) | `lib/format.ts` | `formatWon` 이 **음수를 "무료"로** 표시하던 것을 `"—"` 로 · 요금 전용 `formatFare()` 신설(0 이하 → "요금 정보 없음") | 🔴 **프로덕션에서 발생 중이던 버그.** ODsay 는 철도에 `payment: 0`, 시외버스에 `payment: -1`(정보 없음)을 준다 — **4시간짜리 3회 환승 경로가 "무료"로 표시**됐다. 통행료 0원은 진짜 무료라 `formatWon` 의 0 처리는 유지하고, 뜻이 다른 대중교통 요금만 새 함수로 분리 |
| 2026-08-03 | Claude(AI) | `lib/odsay.ts` | `TRAFFIC_KIND` 에 `4: "train"` 추가 · **미지 타입을 `"walk"` 가 아니라 `"other"` 로** · `kind` 타입 확장 · `pathType` 을 `1\|2\|3` → `number`(시외는 11) · 수단명 폴백(`laneName`) · 진단 모드에서 `rawLane` 노출 | 철도(`trafficType: 4`)가 "도보"로 뭉개져 **탑승 구간 없는 응답처럼 보였고 껍데기 가드에 걸려 KTX·SRT 경로가 통째로 버려졌다.** 미지 타입을 `other` 로 두면 같은 유형의 버그가 재발하지 않는다 — 수단명만 모를 뿐 탑승으로는 남는다 |
| 2026-08-03 | Claude(AI) | `lib/odsay.ts` | 탑승 판정을 `isRideType()` 하나로 통일 (두 함수가 각자 `trafficType !== 3` / `kind !== "walk"` 로 갈려 있던 것) | **같은 응답을 추천 계산은 쓰고 화면은 버렸다.** 실제로 부산 경로에서 추천 이동시간은 130분(KTX)인데 상세는 "추정값"으로 떴다 — 판정이 한 곳에 있어야 다시 갈라지지 않는다 |
| 2026-08-03 | Claude(AI) | `app/components/RouteSheet.tsx` | 열차 아이콘·색·라벨(🚄) · `other` 중립 표시 · 요금에 `formatFare` 적용 · 정거장 0이면 표기 생략 · **"시외는 API 커버리지 밖" 안내문 삭제** | 안내문이 **사실과 달랐다** — ODsay 는 시외를 제대로 답하고 있었고 원인은 우리 매핑이었다. 틀린 설명을 남기면 다음 세션이 또 API 교체를 검토한다 |
| 2026-08-03 | Claude(AI) | `memory/status.md` §3-3 | 수정 결과 반영 · "추천에 KTX 시간이 이미 들어가는가(미검증)" → **확인 완료**로 갱신 | 인계 문서의 미검증 항목을 실행 결과로 닫는다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | PR #28 머지 반영 + 검토 판단 3건을 근거와 함께 기록 (`RegionsWithMeta` 를 `routing.ts` 에 두는 이유 · `live` 정의 · `routeCache` TTL 미도입 근거). §1 릴리스 순서를 갱신 — `live` 판정이 끝나 **#26 을 빼지 말고 함께 낸다**로 정정하고, 종단 확인은 **Preview 에서 · 새 좌표로** 하라는 절차를 명시. §3-3 실키 검증 완료 반영 | 판단 근거를 안 적으면 다음 세션이 같은 것을 다시 논의한다. 특히 **반증 테스트를 캐시된 좌표로 하면 터널을 꺼도 `live:true` 가 나와 오판**하는데, 이건 #28 이 스스로 밝힌 한계라 절차에 못 박아야 한다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | PR #26 머지 반영 + 통합 세션 검토 결과 기록 — **지방 거점 밀도 문제**(부산 2인에 창원·울산, 광주 2인에 목포가 끌려온다. 대구 1곳과 같은 원인), 후보 1곳일 때 투표 UX 미성립(미검증), 수도권 API 호출 12% 증가, `순천역` 좌표 1.2km 의심. §1 에 **릴리스 순서**(live 판정 → 릴리스 → ODsay 키) 명시 | PR #26 본문은 대구만 짚었는데 시뮬레이션에서 같은 문제가 부산·광주에도 나왔다. `FALLBACK_MAX_KM` 값을 조정해도 해결되지 않는다(올리면 먼 도시, 내리면 1곳) — **근본 원인이 거점 밀도**임을 남겨야 다음 사람이 상수만 만지다 끝내지 않는다. 릴리스 순서는 어기면 화면이 오히려 나빠진다(#26 단독 릴리스 시 "대전역 · 949분") |
| 2026-08-04 | Claude(AI) | `memory/status.md` | 🔴🔴 **재정정 2건 (CEO 지적 → 외부 교차검증).** ① **"ODsay 가 시외 열차에 노선 정보를 아예 안 준다"는 틀렸다** — 열차 정보는 `lane` 이 아니라 **`subPath.trainType`·`trainSpSeatYn`** 에 실린다(외부 구현체 + ODsay 릴리스 노트로 확인). 우리가 `lane[0].name`·`busNo` 만 봤을 뿐이다. ② **"시외버스 = `trafficType 2` 확정"도 틀렸다** — 외부 구현체 3곳이 **`5`·`6`(고속·시외) · `7`(항공)** 의 존재를 확인해 준다. 대전 `8326` 은 시내버스로 분류된 광역노선일 가능성이 크다. 진단 플래그는 **제거 후보에서 존치로** 변경 | **같은 항목을 두 번 틀리게 적었다.** ①은 *"응답에 없다"가 아니라 "내가 본 필드에 없다"* 였고, ②는 **실측 1건을 규칙으로 일반화**한 것이다. 둘 다 "실측한 것만 적는다"는 원칙을 형식적으로만 지킨 사례라, **결론 대신 경위와 교훈**을 남겨 다음 세션이 같은 방식으로 틀리지 않게 했다. ⚠️ `5`/`6` 순서와 `trainType` 값 목록은 **여전히 미검증** — 외부 자료끼리도 엇갈려 우리 실측이 필요하다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | 🔴 **후속 항목 4 정정** — "시외/고속버스 `trafficType` 미확정 · ODsay 가 시외버스를 주는지 자체가 미검증"은 **틀렸다.** §3-3 에 **시외버스 = `trafficType 2` 실측 기록이 이미 있었다**(강남→대전 `시외버스 8326`, 3회 환승 237분, `verified: true`). 남은 미검증은 **고속버스뿐**으로 좁혔다 | **같은 문서 안에서 §3-3 과 후속 항목이 어긋나 있었다.** 그대로 두면 다음 세션이 **이미 끝난 실측을 다시 한다**(💰 낭비 + 시간). 후속 항목을 적을 때 상세 섹션을 먼저 확인하지 않은 것이 원인이라, 재발 방지 문구도 함께 남겼다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | **태그 `v0.2.0` 부착 확인** — `5862751`(CEO가 GitHub 웹에서 생성, 실측). 위 행의 "태그 미부착"을 대체한다. 릴리스 머지(`b92ac70`)가 아니라 문서 릴리스까지 포함한 main 최신을 가리키지만 **두 커밋의 코드 차이는 0줄**이라 문제 없다 | ⚠️ **태그는 이 컨테이너에서 만들 수 없다** — git 프록시가 태그 푸시를 `HTTP 403` 으로 거부한다(브랜치 푸시는 같은 경로로 정상, 5회 시도 확인). **릴리스 태그는 사람이 웹에서 만들어야 한다**는 것을 절차로 남긴다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | **ODsay 환경변수 정리 완료를 실측으로 기록.** `odsay/odsayProxy/odsayProxyAuth` 전부 `false` 확인. ⚠️ **"Production 체크만 해제"는 3회 시도 모두 실패**했고 **삭제 후 재배포**로 해결됐다(왜 안 먹었는지는 미확인 — `Shared` 탭 가능성). ⚠️ **재배포 여부는 `deploy.commit` 으로 알 수 없다**(Redeploy 는 같은 커밋). Cloudflare 재개 시 환경변수 투입 순서 4단계 추가. 프로덕션 화면 실측 4항목 기록 | 확인이 한참 늦어진 이유가 **"커밋이 그대로면 정상"이라는 내 안내가 불완전**해서였다 — 재배포 확인 방법을 못 알려줘 같은 값을 세 번 확인했다. 다음 세션이 같은 함정에 빠지지 않게 남긴다. **"가짜 mock 가게"의 진짜 원인**(mock 이 기본이 아니라 **시골 좌표라 카카오 검색이 0건**)도 함께 밝혀 적었다 — 원인을 잘못 알면 엉뚱한 곳을 고친다 |
| 2026-08-04 | Claude(AI) | `memory/status.md` | **릴리스 `v0.2.0` 결과 기록 + 정정 1건.** 🔴 정정: `ODSAY_*` 환경변수가 **Production 스코프에도 들어가 있었다** — 릴리스 전에는 프로덕션이 7/31 빌드라 안 보였을 뿐이다. 그 외: 프로덕션 `/api/status` 실측값 · 태그 미부착(컨테이너가 태그 푸시를 막음) · **외부 API 호출에 타임아웃이 한 곳도 없음**(`AbortSignal` 0곳) · 카카오 지도는 프로덕션 정상/Preview 만 실패 | **"환경변수는 넣는 시점이 아니라 배포 시점에 적용된다"** — 이걸 몰라 "프로덕션엔 없다"고 기록해뒀는데 릴리스가 새 빌드를 만들자 드러났다. 다음 세션이 같은 착각을 하지 않게 원인까지 적었다. 실측한 것만 적고 미검증은 미검증으로 남긴다는 원칙대로, 재배포 후 복귀 확인은 "미검증"으로 표기 |
| 2026-08-04 | Claude(AI) | `package.json`, `package-lock.json` | 버전 **`0.1.0` → `0.2.0`** (`npm version minor --no-git-tag-version`) | 이번 릴리스에 `feat:` 3건(#21 진단 플래그 · #26 전국 거점 · #28 `live` 판정)이 들어 있어 `docs/버전관리.md` 의 MINOR 규칙에 해당한다. ⚠️ 태그는 `npm version` 이 만들지 않고 **릴리스 머지 후 `main` 커밋에 붙인다** — `main` 이 보호 브랜치라 직접 푸시가 막혀 있어 버전 커밋도 PR 을 거친다 |
| 2026-08-04 | Claude(AI) | `lib/odsay.ts` | **조용히 사라지던 실패 8곳에 `console.warn` 추가** — `if (!r.ok) return null` 5곳 → `warnHttp(라벨, 상태코드)`, `catch { return null }` 3곳 → `warnThrown(라벨, 오류)`, 빈 결과 2곳 → `warnEmpty(라벨)`. 로그에는 **호스트만** 싣는다 | #28 이 "Vercel 로그에서 터널 장애와 키 문제를 구분한다"고 했지만 **실제로는 구분이 안 됐다.** `console.warn` 이 "ODsay 가 HTTP 200 으로 에러 본문을 준 경우"에만 찍혀서, **프록시 403·Cloudflare 502·터널 다운이 전부 로그 없이 사라졌다.** 2026-08-04 종단 확인에서 `live:false` 가 났는데 Vercel 로그가 `Warning 0` 이라 원인을 못 좁혀 드러났다(실측). ⚠️ 전체 URL 에는 `apiKey` 가 들어 있어 **호스트만** 로그에 싣는다 — 그대로 찍으면 키가 평문으로 남는다 |
| 2026-08-04 | Claude(AI) | `app/api/status/route.ts` | 응답에 **배포 신원**(`deploy.env`·`branch`·`commit`)과 **ODsay 프록시 설정 여부**(`odsayProxy`·`odsayProxyAuth`) 추가. 값은 안 싣고 불리언·공개정보만 | ODsay 종단 확인 중 실제로 막혔다 — Preview 와 Production 의 `/api/status` 응답이 **글자 하나 다르지 않아** 어느 배포를 보고 있는지 확정할 수 없었다(`kakaoRedirect` 는 두 스코프가 같은 값이라 단서가 못 된다). `odsay: true` 인데 실패할 때 **"키 문제"인지 "프록시 미설정"인지**도 밖에서 구분이 안 됐다. ⚠️ 터널 주소(`ODSAY_BASE_URL`)와 공유 비밀은 **일부러 싣지 않는다** — 켜졌는지만 밝힌다 |
| 2026-08-03 | Claude(AI) | `memory/status.md` | §3-3 을 PR #24 머지 결과로 갱신 — "PR 대기" → 머지 완료(`12cc335`), 남은 일 2건(CEO 실키 확인 · 프로덕션 ODsay 키 재투입), 통합 세션 검토에서 나온 🟡 2건(판정 통일이 완전하지 않음 · `any` 1개 증가) 기록, 진단 플래그를 CI 매트릭스에 넣지 않는 판단과 근거 명시. §1 진행 현황에 #23·#24 추가 | "isRideType 하나로 통일"이라고만 적어두면 다음 사람이 엣지 케이스를 놓친다. 실측한 것만 적고 미완은 미완으로 남긴다는 원칙대로 검토 결과를 그대로 남겼다 |
| 2026-08-03 | Claude(AI) | `memory/status.md` | §3-3 을 **실측 결과로 전면 교체** — "시외는 근본적으로 답을 못 낸다 · ODsay 시외 전용 엔드포인트 필요"는 **틀린 주장이었다**. `rawTrafficType 4 = 철도` 확정(부산·김천 실측), 대전은 이미 정상, 고칠 것 4가지(매핑 추가 · `fare -1/0` 이 "무료"로 표시되는 버그 · 이동시간/상세 판정 비대칭 · 열차명 누락) 정리. §1 진행 현황과 `odsay:false` 설명도 갱신 | PR #21 진단 플래그로 CEO 로컬에서 4콜 실측한 결과 전제가 뒤집혔다. 낡은 주장을 그대로 두면 다음 세션이 **불필요한 API 교체 작업**을 시작한다 — 실측한 것만 적는다는 원칙대로 교체했다 |
| 2026-08-03 | Claude(AI) | `app/api/debug/route.ts`, `app/api/diag/route.ts`, `app/api/ai-trace/route.ts`, `app/api/auth/kakao/route.ts` | 디버그 잠금 판정을 `!process.env.ENABLE_DEBUG` → `process.env.ENABLE_DEBUG !== "1"` 로 (4곳 동일) | **`ENABLE_DEBUG=0` 이 잠금을 푸는 버그.** 값이 아니라 존재만 봐서 문자열 `"0"`(truthy)에도 잠금이 풀렸다 — 끈 줄 알고 넣은 값이 운영에서 `/api/diag`(외부 API 상태·서버 공인 IP)와 `/api/debug`(모임 생성)를 외부에 열어준다. CEO 가 실제로 `0` 을 넣어 발견 |
| 2026-08-03 | Claude(AI) | `.env.example` | `ENABLE_DEBUG` 안내 보강 — "끄려면 0 이 아니라 줄을 지우거나 주석 처리" · Vercel 에 넣지 말 것 · 로컬 dev 는 이 값과 무관 | 값으로 끄려는 시도가 반복될 자리다. 문서가 먼저 막는다 |
| 2026-08-03 | Claude(AI) | `lib/flags.ts` 🔒 | `odsayProbe` 플래그 1개 추가 (`NEXT_PUBLIC_FF_ODSAY_PROBE`) | ODsay 시외 응답을 **로컬에서 실측**하려면 껍데기 가드와 경로 캐시를 우회해야 한다. 상수로 껐다 켜면 브랜치마다 값이 달라져 충돌나므로(CLAUDE.md §3) 플래그가 유일한 방법이다 |
| 2026-08-03 | Claude(AI) | `lib/odsay.ts` | 진단 모드에서 껍데기 가드 우회(`verified: false` 부착) · `TransitLeg.rawTrafficType` 추가 · `TransitPathDetail.hasMapObj` 추가 · 0분 도보 구간 보존 | **시외에 ODsay 가 무엇을 주는지 관찰**하기 위함. 원시 `trafficType` 을 남기면 우리가 "도보"로 뭉개는 미매핑 수단(시외버스·열차 가능성)의 정체가 드러난다. ⚠️ `min <= 0` 은 진단 모드에서도 차단 — 이동시간 0 은 그 후보를 추천 1위로 만들어 결과를 통째로 왜곡한다 |
| 2026-08-03 | Claude(AI) | `lib/routing.ts`, `app/api/route-path/route.ts`, `app/api/route-detail/route.ts` | 진단 모드에서 경로 캐시 3종 우회 (읽기·쓰기 모두) | `routeCache`·`pathCache` 는 **TTL 이 없어** 한 번 성공하면 서버 재시작 전까지 같은 값만 돌아온다. 실측 중 "코드를 고쳐도 값이 안 바뀌는" 착시의 원인이라 우회가 필요하다 |
| 2026-08-03 | Claude(AI) | `app/components/RouteSheet.tsx` | 검증 안 된 응답에 `⚠ 검증 안 된 원시 응답` 칩 + 안내문 (기존 "ODsay 실시간" 칩 대체) | 가드를 풀면 **"ODsay 실시간 82분 · 0원 · 환승 0회"가 사실처럼 보이던 그 사고가 그대로 재현된다.** 가짜를 실제처럼 그리지 않는다(CLAUDE.md §6)를 지키려면 표시부도 함께 고쳐야 한다 |
| 2026-08-03 | Claude(AI) | `.env.example` | `NEXT_PUBLIC_FF_ODSAY_PROBE=0` + 배포 금지·비용 경고 명시 | 켠 채로 배포하면 검증 안 된 값이 사용자에게 보이고 무료 한도(1,000콜/일)를 태운다 |
| 2026-07-30 | Claude(AI) | `package.json` | `8.0.0` → **`0.1.0`** | 발표일 `1.0.0` 을 향한 SemVer 체계로 전환 |
| 2026-07-30 | Claude(AI) | `schema.sql` (루트) | 삭제 | v7 시절 **Neon용** 잔재. 아무 코드도 참조하지 않는데 팀원이 `supabase/schema.sql` 대신 잘못 실행할 위험이 있었다 |
| 2026-07-30 | Claude(AI) | `docs/legacy-algo/` (신규 8파일 + README) | 유실됐던 추천 알고리즘 8종 복원 | `memory/status.md` 가 `git show 5ff50ee:...` 로 꺼내라고 안내했는데, 그 커밋이 `main` 의 조상이 아닌 **별도 갈래**라 히스토리를 옮겨도 따라오지 않는다 |
| 2026-07-30 | Claude(AI) | `tsconfig.json` | `exclude` 에 `docs` 추가 | 위 참고용 파일들이 지금 코드와 타입이 맞지 않아 타입검사를 깨뜨린다 |
| 2026-07-30 | Claude(AI) | `package-lock.json` | `package.json` 과 동기화 (버전 `8.0.0`→`0.1.0`, `@playwright/test` 루트 devDependency 등록) | lock 이 어긋나면 CI 의 `npm ci` 가 죽는다. 팀원이 받자마자 빨간 CI 를 보게 될 자리였다 |
| 2026-07-30 | Claude(AI) | `package.json` | `next` `14.2.15` → **`^14.2.35`** | `npm audit` 에서 **critical** 취약점. 공개 저장소 + Vercel 배포 예정이라 방치할 수 없다. 14.2 안의 패치 업그레이드만 했다(16 으로 올리면 breaking change) |
| 2026-07-30 | Claude(AI) | `.nvmrc` (신규), `.github/workflows/ci.yml` | Node 버전을 `22` 로 고정하고 CI 가 `node-version-file` 로 같은 파일을 읽게 | 팀원 4명이 각자 다른 Node 로 개발하면 "내 컴에선 되는데"가 생긴다. 버전을 올릴 때 고칠 곳도 한 군데가 된다 |
| 2026-07-30 | Claude(AI) | `README.md`, `팀원_실행안내.md`, `docs/팀_개발환경.md` | 팀원 진입점 정비 — 무엇부터 읽고 무엇을 만지는지. v8 시절 서술 정정(채팅 위상·버튼 이름·구조도) | 저장소를 처음 여는 사람이 5분 안에 시작할 수 있어야 한다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 머지 방식 정정 — "Squash 만 허용" ❌ → `feat/*→develop` 은 Squash, `develop→main` 은 merge commit. 실제로 만든 룰셋 내용으로 설정표 갱신 | Squash 로만 잠그면 `develop→main` 에서 develop 커밋이 한 덩어리로 뭉개지고 두 브랜치 히스토리가 갈라져 이후 머지마다 충돌한다 |
| 2026-07-30 | Claude(AI) | `lib/supabase.ts`, `app/api/status/route.ts` | DB 접속 실패 시 **앱이 실제로 접속한 Supabase URL 과 원인 힌트**를 함께 노출 (끝 슬래시·스킴 누락·앞뒤 공백 자동 판정) | `TypeError: fetch failed` 는 원인을 전혀 말해주지 않아 `.env.local` 을 열어봐야만 오타를 찾을 수 있었다(CEO 가 실제로 겪음). 팀원 4명이 각자 키를 넣으므로 똑같이 겪을 자리다. URL 은 `NEXT_PUBLIC_` 값이라 비밀이 아니며, 키는 노출하지 않는다 |
| 2026-07-30 | Claude(AI) | `package.json` | `pretest:smoke` 추가 (`playwright install chromium`) | **`npm run verify` 가 방금 clone 한 환경에서 스모크 3/4 실패**했다(`Executable doesn't exist`). 문서가 "PR 전에 npm run verify"라고 시키는데 팀원 전원이 첫 PR 에서 이걸 만났을 것이다 |
| 2026-07-30 | Claude(AI) | `.gitignore` | `.env*.local` → `.env` · `.env.*` (+ `!.env.example`) | **공개 저장소인데 `.env` 와 `.env.production` 이 열려 있었다.** Next.js 는 그 둘도 읽으므로 키를 그 이름으로 만들면 그대로 커밋된다 |
| 2026-07-30 | Claude(AI) | `.gitignore` | `/logs/` 차단 추가 | `lib/ai.ts` 가 **참가자들의 실제 대화**를 `logs/ai-trace.jsonl` 에 기록한다. AI 채팅 플래그를 켜고 개발하면 파일이 생기는데, 공개 저장소라 실수로 커밋되면 대화가 그대로 공개된다. 지금은 채팅이 꺼져 있어 파일이 없을 뿐이다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md`, `README.md` | **커밋 이메일 가리기** 안내 추가 (GitHub Emails 설정 2개 + `git config user.email` noreply) | 공개 저장소라 커밋에 박힌 이메일을 누구나 API 로 수집할 수 있다. 초기 커밋 9건에 개인 지메일이 남았고, **팀원 4명이 붙으면 4명 분이 더 노출된다.** 이미 올라간 것은 못 바꾸므로 앞으로를 막는다 |
| 2026-07-30 | Claude(AI) | `docs/팀원_온보딩.md` (신규) | 팀원이 **처음부터 끝까지 한 번에 읽는** 단일 온보딩 문서 — 이메일 가리기 → 세팅 → 소유권 → 첫 PR → 매일 지킬 것 → 절대 규칙 → 실제로 겪은 함정 5건 → 막혔을 때 | 문서가 README·팀원_실행안내·팀_개발환경 셋으로 흩어져 있어 팀원이 뭘 먼저 읽을지 몰랐다. 카톡·노션에 통째로 배포할 수 있는 형태 |
| 2026-07-30 | Claude(AI) | `lib/CLAUDE.md` (신규) | 데이터 계층 5규칙(store async · 쓰기 단위 · 캐시 금지) + 외부 API 래퍼 4규칙(mock 폴백 · 성공값만 캐시 · 가짜 표시 금지 · 비용 경고) + 소유권 표 | 채팅·AI 파싱 담당은 `lib/ai.ts`·`lib/parse.ts` 에서 일하는데 그 폴더에 지시서가 없었다. **`CLAUDE.md` 는 세션 시작 시 자동 로드**되므로 규칙을 프롬프트에 매번 붙이는 것보다 확실하고 드리프트가 없다 |
| 2026-07-30 | Claude(AI) | `.github/workflows/ci.yml` | **CHANGELOG 기입 확인 잡** 추가 — 코드·설정을 바꿨는데 `CHANGELOG.md` 를 안 건드린 PR 은 CI 실패. 문서만 고친 PR 은 통과 | "파일을 바꿨으면 기입"(CLAUDE.md §6)이 **기억에 의존하는 규칙**이었다. 바쁠 때 빠지고, 빠진 채로 3주가 지나면 무엇을 왜 바꿨는지 복원할 수 없다. **400줄 제한은 넣지 않았다** — `app/page.tsx`(1,118줄)·`lib/ai.ts`(592줄)가 이미 넘어서, 넣으면 담당자가 자기 파일을 아예 못 고치게 된다 |
| 2026-07-30 | Claude(AI) | `docs/팀원_온보딩.md` | `CHANGELOG.md` 충돌 해결법 추가 (양쪽 줄 다 남기기) + CI 가 기입을 막는다는 사실 명시 | 모든 PR 이 이 파일에 한 줄씩 더하므로 **구조상 자주 겹친다.** 오늘 PR 3건이 연속으로 이 충돌을 만났다. 팀원이 당황하지 않게 미리 알려둔다 |
| 2026-07-30 | Claude(AI) | `.env.example`, `lib/ai.ts` | Ollama 1순위 기본값에서 **팀 내부망 사설 IP 제거** (빈 값 → 2순위 localhost 로 폴백) | 공개 저장소에 내부망 주소가 남고, `/api/status` 의 `ai.url` 로 응답에 실려 나갔다 |
| 2026-07-30 | Claude(AI) | `app/api/diag/route.ts` | ODSAY 키의 앞 2자·뒤 2자 노출 제거 | 바로 위 주석이 "값 노출 X"라고 적어놓고 실제로는 키 조각 4자를 응답에 실었다 |
| 2026-07-30 | Claude(AI) | `package.json`, `.eslintrc.json` | `eslint` + `eslint-config-next` 설치, extends 를 `next/core-web-vitals` 로 (에러 2건 수정) | `npm run lint` 스크립트가 있는데 eslint 가 없어 실행하면 죽었다. `next/typescript` 는 기존 `any` 46곳을 전부 에러로 띄워 제외 — **React 훅 규칙이 목적**이다(조건부 return 뒤 훅 배치 사고를 lint 가 잡는다) |
| 2026-07-30 | Claude(AI) | `팀원_실행안내.md` | "Node.js 18 이상" → **Node 22** (`.nvmrc` 기준) | `.nvmrc`·README·CI 는 22 인데 이 문서만 18 이라 팀원이 18 로 맞출 수 있었다 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `.github/CODEOWNERS` | 존재하지 않는 `sections/ChatSection.tsx` → 실제 파일 `ChatPanel.tsx` | @TODO 자리에 아이디를 채워 주석을 풀면 **없는 경로라 GitHub 이 그 줄을 조용히 무시**해 채팅 담당 소유권이 안 걸렸을 것이다 |
| 2026-07-30 | Claude(AI) | `.github/CODEOWNERS`, `docs/팀_개발환경.md` | 경로의 `[code]` → `*` (`/app/m/*/sections/ChatPanel.tsx`) + 함정 경고 | **CODEOWNERS 는 gitignore 문법이라 대괄호가 문자 클래스로 해석된다.** `[code]` 는 `c`·`o`·`d`·`e` 중 한 글자에 매칭되고 실제 폴더 `app/m/[code]/` 에는 절대 매칭되지 않는다 — 파일명을 고쳐도 그 줄은 여전히 무효였다. `git check-ignore` 로 재현 확인 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/CLAUDE.md` | "팀원이 만질 파일은 모두 400줄 미만" 주장 정정 — 실제로 `app/page.tsx` 1,118줄 · `lib/ai.ts` 590줄이 팀원 소유다 | 인계 문서의 거짓 주장은 다음 세션이 잘못된 전제로 작업하게 만든다(v8 에서 실제로 겪은 실패) |
| 2026-07-30 | Claude(AI) | `docs/노션_통합개발환경.md` | 줄 수 `1,352` → `905` 최신화 · 아직 없는 스코어러 3종에 "앞으로 만들 파일" 표시 · Code Owners 설정이 `docs/팀_개발환경.md` 와 정반대이던 모순 제거 | 멘토님께 공유하는 문서라 사실관계가 어긋나면 안 된다 |
| 2026-07-31 | Claude(AI) | `package.json`, `package-lock.json` | `@supabase/supabase-js` 제거 → `@neondatabase/serverless` 추가 (`npm install` 로 lock 동기화) | **팀 결정: DB 를 Neon 으로 이관** (멘토님 추천 수용). lock 이 어긋나면 CI 의 `npm ci` 가 죽는다 |
| 2026-07-31 | Claude(AI) | `lib/db.ts` (신규), `lib/supabase.ts` (삭제) | 서버 전용 Neon 클라이언트 — `DATABASE_URL` 하나(서버 전용, `NEXT_PUBLIC_` 금지). 접속 실패 진단(스킴·끝 슬래시·공백 감지)은 postgres:// 형식에 맞게 이식, **URL 은 비밀번호를 *** 로 가린 masked 만 노출** | Supabase URL 은 공개값이었지만 `DATABASE_URL` 에는 비밀번호가 들어 있다 — 원문 노출은 사고다 |
| 2026-07-31 | Claude(AI) | `lib/persistence.ts` | Supabase 클라이언트 호출 7종(loadMeeting·meetingExists·saveMeeting·upsertParticipant/s·setVote·clearVotes)을 Neon SQL(`insert … on conflict`)로 재작성. 쓰기 단위 3분리와 votes PK(code,target,participant_id)=1인 1표 upsert 의미 유지. timestamptz 가 Date 로 오는 차이는 `isoOf()` 로 흡수 | 저장 계층만 교체하고 도메인(store.ts 인터페이스)은 그대로 두기 위함 |
| 2026-07-31 | Claude(AI) | `lib/store.ts` | `hasSupabase` → `hasDb` (import 를 `lib/db` 로), `storeInfo.backend` `"supabase"` → `"neon"`. 로직 변경 없음 | `lib/supabase.ts` 가 사라져 import 가 깨진다 — 이관에 필연적인 최소 수정 |
| 2026-07-31 | Claude(AI) | `app/api/status/route.ts`, `app/api/diag/route.ts` | `store: "neon"` 표기, 실패 시에만 `db.url`(masked)+`urlHint` 노출 유지. diag 는 테이블 3종 개별 점검을 Neon 쿼리로, keyKind/RLS 안내 제거 | Neon 엔 anon/service_role 구분과 RLS 가 없다 |
| 2026-07-31 | Claude(AI) | `supabase/` → `db/` (폴더명 변경), `db/schema.sql`, `db/migrations/README.md` | RLS 정책·role 참조 제거 — Neon SQL Editor 에 그대로 붙여 실행 가능. migrations `NNN_*.sql` 패턴 유지, 안내 문구 Neon 콘솔 기준으로 | Neon 은 서버만 접속하므로 RLS 가 무의미하고, 남겨두면 실행은 되지만 팀원이 잘못된 전제를 갖는다 |
| 2026-07-31 | Claude(AI) | `.github/workflows/ci.yml` | changelog 잡 경로 패턴 `supabase/` → `db/` | 폴더명 변경 후에도 스키마 변경 PR 이 CHANGELOG 기입 검사를 받게 |
| 2026-07-31 | Claude(AI) | `.env.example` | Supabase 3키 → `DATABASE_URL` 하나(서버 전용) | 환경변수 통일. 키 없으면 인메모리 폴백은 그대로 |
| 2026-07-31 | Claude(AI) | `README.md`, `팀원_실행안내.md`, `docs/팀원_온보딩.md`, `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md`, `docs/APK.md`, `CLAUDE.md`, `lib/CLAUDE.md`, `memory/status.md` | 스택·데이터 규칙·세팅 절차·소유권 표의 Supabase 서술을 Neon/`db/` 기준으로 정비. status.md §6 "멘토 확인 대기" → "팀 결정: Neon 확정", Neon 실접속은 **미검증** 으로 명기 | 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다(§4 에 기록된 실제 사고) |
| 2026-07-31 | Claude(AI) | `lib/db.ts`, `app/api/status/route.ts` | `maskPassword` 를 정규식 매칭 → `lastIndexOf("@")` 경계 방식으로 재작성 + status 에 "마스킹 흔적 없으면 원문 대신 안내문" 안전벨트 | **PR #15 리뷰 지적(🔴)** — 스킴 없는 `DATABASE_URL`(psql 명령 통째 복사 등)은 정규식이 매칭 실패해 **비밀번호 원문이 `/api/status` 에 노출**됐다. 하필 그 경우가 진단이 잡으라던 상황이다. `@` 포함 비밀번호의 부분 노출(🟡)도 함께 해결 |
| 2026-07-31 | Claude(AI) | `docs/팀원_온보딩.md` | 🆘 표에 "모임이 안 보이면 먼저 `/api/status` 의 `db.ready`" 행 추가 | PR #15 리뷰 지적(🟡) — 접속 실패가 "모임 없음"처럼 보여 코드 탓으로 오인하기 쉽다 |
| 2026-07-31 | Claude(AI) | `app/api/status/route.ts` | 안전벨트 판정 반전 — "@ 가 있는가" → "스킴 뗀 나머지에 콜론/@ 가 있는데 마스킹 흔적(`:***@`)이 없는가" | **PR #15 재검토 지적(🔴 잔여 엣지)** — `@` 앞에서 잘린 값(개행으로 `postgresql://user:비밀번호` 까지만 읽힌 경우)이 기존 판정을 통과해 평문 노출됐다. 의심스러우면 안 싣는 쪽으로 넘어진다 |
| 2026-07-31 | Claude(AI) | `.github/CODEOWNERS` | `/lib/supabase.ts` → `/lib/db.ts`, `/supabase/` → `/db/` 경로 갱신 | PR #15(Neon 이관) 머지로 두 줄이 없는 경로가 됐다 — CODEOWNERS 는 없는 경로를 **조용히 무시**하므로 그대로 두면 공용 파일 소유권이 안 걸린다(`ChatSection.tsx` 건과 같은 유형) |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 진행 중 현황(PR #15 머지 완료 · #14 승인 대기 · #17 열림 · Neon 검증 대기) · §3-2 를 PR #14 이후 사실로 갱신(weather.ts 는 머지 대기, routing.ts `ScoreContext` 채우기는 통합 세션 몫) · 날씨 weight 0.3 을 팀 결정 안건으로 기록 | 문서가 코드와 어긋나면 다음 세션이 잘못된 전제로 시작한다(§4 사고 기록). 리뷰(🟡1)에서 지적된 낡은 주장 정리 |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 에 카카오 로그인 프로덕션 동작 확인 + 도메인 바뀔 때 고칠 두 곳(Vercel `KAKAO_REDIRECT_URI` · 카카오 콘솔 Redirect URI) 표로 기록 | 한쪽만 고치면 조용히 실패한다 — 환경변수를 빠뜨리면 localhost 로 튕기고, 콘솔 등록을 빠뜨리면 KOE006 이 뜬다. 둘 다 실제로 겪었다 |
| 2026-07-31 | Claude(AI) | `memory/status.md` | §1 을 릴리스 `f0a4235` 후 실측으로 교체 — "Neon 실접속 미검증" → **로컬·프로덕션 양쪽 `db.ready:true` 실측**, Vercel 배포 완료(Production←main / Preview←그 외), `odsay:false`·`ai.ok:false` 가 의도된 상태임을 명시, Preview 가 실 DB 를 공유하는 점 경고, 릴리스 리뷰 후속 2건(500 빈 본문 · postcss) 기록. §3-5 Vercel 항목 체크 | 릴리스 전 문서에는 미검증으로 적혀 있었다. 실측한 것만 적고 확인 안 된 건 미검증으로 남긴다는 원칙대로 교체 — 다음 세션이 낡은 전제로 시작하는 것을 막는다 |
| 2026-07-31 | Claude(AI) | `app/api/meeting/route.ts` | GET·POST 를 try/catch 로 감싸 예외를 `{ error, detail, hint }` 500 으로 바꾼다 | **릴리스 리뷰 후속 1번** — `lib/persistence.ts` 는 쓰기 실패 시 throw 하는데 여기서 안 잡아 Next.js 기본 500 이 **빈 본문**으로 나갔다. `DATABASE_URL` 이 있으면 인메모리 폴백을 타지 않는 설계라(의도됨) DB 가 끊기면 이 경로로 죽는데, 화면에도 로그에도 원인이 안 남았다 |
| 2026-07-31 | Claude(AI) | `lib/db.ts` | `sanitizeDbError()` 추가 — 오류 메시지에 섞인 접속 주소의 비밀번호를 `***` 로 가린다 | 위 `detail` 을 응답에 실으려면 자격증명 노출부터 막아야 한다. 드라이버가 접속 실패 메시지에 주소를 통째로 넣는 경우가 있다. 비밀번호 쪽 패턴은 greedy 로 잡는다 — `[^\s@]*` 는 첫 `@` 에서 멈춰 `u:p@ssSECRET@host` 뒷부분이 남는다(PR #15 🟡2 와 같은 실수를 만들 뻔했고 실측에서 잡았다) |

**아래 `v8.x` 기록은 옛 저장소(`kimyuhwan0126/Moimer`)에서 이어진 것이다.**
저장소는 그대로 남아 있으니 그 이전 이력이 필요하면 거기서 본다.

---

## v8.0.0 — 2026-07-30

### v8 — 클릭 프로토타입 구현 + Supabase 영속화 (claude/moimer-v8-implementation-plan)

CEO 결정: v8 클릭 프로토타입의 방향을 채택. 프로토타입의 원본이 `feat/v7-mockup`
브랜치의 실앱이므로 그 트리를 베이스로 가져오고, 코드 네이밍을 v8로 정렬한 뒤
프로토타입과 어긋난 화면을 맞췄다. AI 채팅은 **비활성만** 하고 코드는 보존한다
(나중에 다시 넣을 수 있도록). 데이터는 인메모리 → **Supabase**로 전환.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | 전체 | `feat/v7-mockup` 트리를 main 히스토리 위에 커밋 1개로 채택 | main과 v7은 공통 조상이 없어 머지 불가. v7이 main의 lib/ai.ts·prefs·AI trace를 이미 포함 |
| 2026-07-30 | Claude(AI) | `capture-feature.mjs`, `capture-prefs.mjs` | 제거 | 데모 GIF 캡처용(puppeteer 의존) — v8 범위 외 |
| 2026-07-30 | Claude(AI) | `package.json` | 7.0.0 → 8.0.0, `@neondatabase/serverless` → `@supabase/supabase-js` | 버전 정렬 · DB를 Supabase로 결정 |
| 2026-07-30 | Claude(AI) | `app/components/v7/` → `app/components/v8/` | 폴더·`V7Header`→`V8Header`·`V7Tab`→`V8Tab` 이름 변경 | 프로토타입이 v8이므로 코드 네이밍도 v8로 통일 |
| 2026-07-30 | Claude(AI) | `app/globals.css` + 화면 6곳 | CSS 클래스 접두사 `v7-*` → `v8-*` (107곳), localStorage 키 `moimer:v7:*` → `moimer:v8:*` | 같은 사유. 미배포 상태라 키 마이그레이션 불필요 |
| 2026-07-30 | Claude(AI) | `app/components/v8/Splash.tsx` | 자동 전환 3슬라이드 → 한 화면 + 차별점 키워드 칩 3개, 하단 "시작하기" CTA | 1.8초마다 넘어가 읽기 전에 사라졌다. "공평한 중간지점"만으로는 기존 서비스와 구분 안 됨 |
| 2026-07-30 | Claude(AI) | `app/meetings/page.tsx` | 생성 완료 화면을 요약 카드로 교체 (이름·코드·정원·방장·모임 시간 + 초대 링크) | 초대 URL만 주면 입력값이 제대로 들어갔는지 확인할 데가 없었다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `✍ 다른 후보로 정하기` 게이트를 `stage==="chat"` → `stage!=="result"` 로 수정 | 거점 투표 단계(stage=main)에서 모달이 아예 열리지 않던 버그 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 수동 확정 모달을 라디오 선택 + "이 후보로 확정" 방식으로 교체 | 후보 버튼을 바로 누르면 오클릭으로 확정됐다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx`, `app/globals.css` | 방장 바 문구를 투표 진행률 기반으로 변경 (전원 투표 시 "투표 종료 및 확정" 강조) | "강제 확정(방장 권한)"이 정상 마감도 월권처럼 읽혔다 |
| 2026-07-30 | Claude(AI) | `supabase/schema.sql` (신규) | meetings(+jsonb) / participants / votes 3테이블 + RLS + updated_at 트리거 | 쓰기 경합 기준으로 분리 — 참가자·투표를 모임 행에 담으면 동시 쓰기에 표가 사라진다 |
| 2026-07-30 | Claude(AI) | `lib/supabase.ts`, `lib/persistence.ts` (신규) | 서버 전용 클라이언트 + Meeting ↔ 행 매핑 | 도메인 로직을 건드리지 않고 저장 계층만 교체하기 위함 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` | 전 함수 async 화 + 읽기/쓰기 경계 추가. Supabase 모드에선 인메모리 캐시 없음 | 서버리스는 인스턴스가 여러 개라 캐시를 들면 다른 인스턴스가 쓴 표가 폴링에 안 보인다 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` | `setRegionCandidates` 의 후보 변경 감지를 id → **지역 이름** 비교로 수정 | id는 순위(r1·r2·r3)라 후보가 바뀌어도 그대로 → 엉뚱한 지역의 표가 남았다 |
| 2026-07-30 | Claude(AI) | `app/api/debug/route.ts` | `seedScenario` 에 빠진 `await` 추가 | Promise 가 되었는데 await 이 없어 시드가 적용되지 않았다 (타입 검사로 안 잡히는 자리) |
| 2026-07-30 | Claude(AI) | `lib/ai.ts` | 호출부 await 추가 + `search_more_places`/`evaluate_region` 결과를 `saveCandidates` 로 명시 저장 | DB 모드에선 객체를 그 자리에서 고쳐도 저장되지 않는다 |
| 2026-07-30 | Claude(AI) | `app/api/status/route.ts`, `app/api/diag/route.ts`, `lib/env.ts` | DB 연결 상태 노출 (`configured`/`keyKind`/`ready`) + 테이블별 조회 진단 | 키만 있고 스키마 미적용·RLS 차단인 경우를 구분해야 원인을 안다 |
| 2026-07-30 | Claude(AI) | `.env.example` | Neon → Supabase 전면 갱신, 키 발급 위치·주의사항 명시 | DB 전환 반영 |
| 2026-07-30 | Claude(AI) | `README.md` | v8 기준으로 재작성 | 옛 `develop` 보일러플레이트(src/·zustand·room/[id])를 설명해 실제 코드와 달랐다 |
| 2026-07-30 | Claude(AI) | `CLAUDE.md` | v8 실제 스택 기준으로 재작성 (Tailwind·shadcn·Gemini·src/ 기술 제거), 색상·데이터 계층 규칙 추가 | AI가 매 세션 처음 읽는 파일이 코드와 달라 잘못된 전제를 갖게 됐다 |
| 2026-07-30 | Claude(AI) | `팀원_실행안내.md` | v8 기준 + Supabase 준비 절차(스키마 실행·키 3종·확인 방법) 추가 | 팀원이 DB 없이 시작해 데이터가 사라지는 혼란 방지 |
| 2026-07-30 | Claude(AI) | `memory/status.md` | v8 상태로 갱신 → 이후 추천 알고리즘 현황·미착수 항목·이식 유실 버그 목록까지 인계 문서로 재작성 | 진행 상황 인계. 특히 "프로토타입이 고쳐둔 것이 실앱으로 이식되지 않은" 패턴이 반복돼 재발 방지 기록을 남김 |
| 2026-07-30 | Claude(AI) | `app/globals.css`, `app/m/[code]/MeetingClient.tsx` | `.leaderbar` 를 sticky → **fixed** 로 변경 + 하단 여백 136→148px | 브라우저 검증에서 발견: sticky+bottom:64px 는 문서 끝까지 스크롤하면 바가 흐름 위치보다 64px 위로 올라앉아 마지막 카드를 덮었다(`✍ 다른 후보로 정하기` 가 31px 가려져 클릭 불가). 하단 5탭과 같은 fixed 방식으로 통일 |
| 2026-07-30 | Claude(AI) | `lib/persistence.ts` | 참가자 조회 정렬을 `is_leader desc, joined_at asc, id asc` 로 완전 결정화 | joined_at 단독 정렬은 동순위가 가능하고(Postgres now()는 트랜잭션 시작 시각), 참가자 순서가 PIN_COLORS 색인이라 폴링마다 순서가 흔들리면 사람별 칩·핀 색이 계속 바뀐다 |
| 2026-07-30 | Claude(AI) | `app/components/v8/LoginSheet.tsx` | 오버레이를 `createPortal(document.body)` 로 이동 | `.v8-header` 의 `backdrop-filter` 가 fixed 자손의 기준 박스를 헤더(높이 56px)로 바꿔, 로그인 모달 위쪽(제목·이름칸)이 화면 밖으로 잘렸다. `+` 버튼 → 로그인 시트에서 실제로 발생 |
| 2026-07-30 | Claude(AI) | `app/globals.css` | `.v8-modal`·`.modal` 에 `max-height:calc(100dvh - 여백)` + `overflow-y:auto` 추가 | 프로토타입 html 에서 이미 고쳐뒀던 수정인데(`.proto-screen .v7-modal{max-height:100%;overflow-y:auto}`), 그게 "프로토타입 전용(실제 앱엔 없음)" 블록 안에 있어 실앱으로 이식되지 않았다. 창이 짧으면 모달이 잘리고 스크롤도 안 됐다 |
| 2026-07-30 | Claude(AI) | `app/page.tsx`, `app/globals.css` | 검색 결과 줄에 (+) 표시 이식 + `+` 칩을 "검색창으로 데려다주기"(스크롤·포커스·1.2초 강조)로 개선 | 프로토타입에서 확정한 (+) 표시("누르면 출발지로 추가된다")가 실앱 이식 때 빠졌고, `+` 칩은 포커스만 줘서 아무 일도 안 일어난 것처럼 보였다 (CEO 보고) |
| 2026-07-30 | Claude(AI) | `app/api/status/route.ts` | `kakaoRedirect`(앱이 실제로 보내는 Redirect URI) 노출 | KOE006 진단용 — 콘솔 등록값과 글자 단위 대조가 가능해진다. URL이라 비밀 아님 |
| 2026-07-30 | Claude(AI) | `app/components/v8/Icons.tsx` | 모임 참여 아이콘 화살표를 문 "안으로" 향하게 교체 | 밖으로 나가는 방향이면 탈퇴/로그아웃처럼 읽힌다 — 프로토타입·회의록에서 확정했던 방향인데 실앱만 반대로 남아 있었다 (CEO 지적) |
| 2026-07-30 | Claude(AI) | `app/api/auth/kakao/route.ts` | `?debug=1` 진단 모드 추가 (dev 전용) — 카카오에 보내는 REST키 마스킹·redirectUri·인가 URL을 JSON으로 반환 | KOE006은 카카오 페이지에서 막혀 앱이 사유를 못 보여준다. "보낸 값"을 보여주면 콘솔 등록값과 대조해 원인을 찾을 수 있다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 내정보 프로필을 출발지 폼에 연결 — 저장 위치를 원터치 칩으로, 애용 이동수단을 기본값으로 | 내정보 탭이 "모임을 만들 때 바로 불러와요"·"새 모임에 기본 적용"이라 약속하는데 이 폼이 프로필을 읽지 않아 반영되지 않았다 (CEO 보고). 이미 등록된 출발지의 이동수단은 서버 값이 우선 |
| 2026-07-30 | Claude(AI) | `app/meetings/page.tsx` | 모임 생성·참여의 이름 입력을 선택사항으로 (비우면 로그인 이름 사용) | 이미 로그인해 이름을 준 사용자에게 매번 다시 입력하게 했고, 비우면 버튼이 비활성이었다 (CEO 요청) |
| 2026-07-30 | Claude(AI) | `lib/format.ts` (신규) + 화면 4곳 | 이동시간 표기를 `82분` → `1시간 22분` 으로. 거리·요금 포맷도 함께 통일 | 60분 넘는 값을 분으로만 쓰면 얼마나 먼지 감이 안 온다 (CEO 지적) |
| 2026-07-30 | Claude(AI) | `lib/odsay.ts` | 탑승 구간이 없거나 시간이 0인 응답을 버리고 null 반환(→ 추정값 폴백). 경로 라벨을 pathType 대신 **실제 파싱된 구간**으로 생성 | 시외 장거리(서울→김천)에서 ODsay가 빈 껍데기를 주는데 앱이 "ODsay 실시간 82분 · 0원 · 환승 0회"로 사실처럼 표시했다. CLAUDE.md §3-6(가짜 데이터를 실제인 것처럼 그리지 않는다) 위반 |
| 2026-07-30 | Claude(AI) | `app/components/RouteSheet.tsx` | 추정값일 때 경고 박스 추가 — 대중교통 API가 수도권 중심이라 KTX·고속버스가 반영되지 않음을 명시 | 값이 실제와 크게 어긋날 수 있음을 숨기지 않는다 |
| 2026-07-30 | Claude(AI) | `lib/types.ts`·`lib/routing.ts`·`lib/store.ts`·`app/api/meeting`·`app/m/[code]/MeetingClient.tsx` | **거점 후보 직접 등록** — 방장 포함 누구나 지도 검색으로 원하는 지역을 후보에 추가 (`addRegion` 액션 + `＋ 다른 후보 등록` 모달) | 자동 추천이 수도권 밖에서 기하 중간점(시골)으로 잡히는 문제의 현실적 탈출구. 추천 알고리즘 개선 전까지 사람이 후보를 낼 수 있어야 투표가 의미를 가진다 (CEO 지시) |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `✍ 다른 후보로 정하기` → `✍ 다른 후보로 확정`(방장 전용)으로 개명하고, 그 옆에 `＋ 다른 후보 등록`(전원) 배치 | 두 기능은 성격이 다르다(후보를 늘리는 것 vs 마감하는 것) — 같은 이름이면 헷갈린다 |
| 2026-07-30 | Claude(AI) | `lib/store.ts` `setRegionCandidates` | 사용자 등록 후보(`rc_*`)를 자동 재계산에서 보존 | 출발지가 바뀌어 후보가 재계산될 때 사람이 낸 후보가 사라지면 안 된다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 검색 0건일 때 "이름 그대로 등록" 폴백 (좌표는 서버가 지오코딩) | 검색이 못 찾는 지명에서 막다른 길이 되는 것을 막는다 — 프로토타입이 뒀던 안전망과 동일 |
| 2026-07-30 | Claude(AI) | `app/api-live/page.tsx` | 진단 차단 시 안내를 실행 가능하게 보강 (`npm run dev` / `ENABLE_DEBUG=1` / `/api/status` 대안 제시) | 운영 빌드에서 `/api/diag` 가 403 인데 "개발 모드 전용"만 떠 다음 행동을 알 수 없었다 |

검증: `npx tsc --noEmit` 통과 · `next build` 통과 · **실제 브라우저(Chromium)로 화면 구동 확인**
(스플래시 문구·키워드 칩 / 출발지 3개 추가 → 중간지점 "건대입구 최대 40분 편차 15분" /
시간순 전환 시 "경로 API 키 없음 — 거리 추정" 정직 표기 / 생성완료 요약 5필드 + 초대링크 /
거점 단계에서 `✍ 다른 후보로 정하기` 모달 열림·라디오 3개 / 방장 바 문구가
"0/1명 투표 중 · 지금 확정" → "1/1명 투표 완료 · 투표 종료 및 확정" 으로 전환) ·
실서버 API 전 구간 왕복
(생성 → 참여 3명 → 모임시간 → 출발지 4명 → 거점후보 → 4명 동시투표 4표 전부 기록 →
투표취소 → 비방장 확정 거부 → 거점 확정(stage=main) → 가게 투표·확정 → 자가신고 →
예약 → 최종상태). 후보 변경 시 표 무효화 / 후보 동일 시 표 유지 각각 확인.

---

## v8.1.0 — 2026-07-30

### 팀 동시 개발 기반 — 머지 충돌이 안 나는 구조로 재배치

CEO 결정: 새 저장소에서 팀원들과 각자 브랜치로 **동시에** 개발하고, 통합 담당자가
머지를 전담한다. 팀원 중 일부는 Ollama+GLM 으로 Claude Code 를 쓴다.
그래서 (1) 파일을 소유자 단위로 쪼개고 (2) 켜고 끄는 걸 코드가 아니라 환경변수로
옮기고 (3) 사람 리뷰 전에 기계가 먼저 잡도록 CI 를 세웠다.
안드로이드 배포는 **Flutter 재작성이 아니라 PWA + TWA** 로 확정.

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | `lib/flags.ts` (신규) | `NEXT_PUBLIC_FF_*` 환경변수 기반 기능 플래그 4종 | 상수(`AI_CHAT_ENABLED=false`)는 켜려면 코드를 고쳐야 해 브랜치마다 값이 달라지고, 머지할 때마다 같은 줄에서 충돌난다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | `AI_CHAT_ENABLED` 를 `FLAGS.aiChat` 에서 읽도록 변경 (14곳 사용부는 그대로) | 위와 동일. 개발하려고 켠 걸 실수로 커밋하면 남의 화면까지 켜졌다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/{types,index,fairness}.ts` (신규) | 점수 계산을 **스코어러 플러그인** 구조로. 파일 = 관점 하나 = 담당자 한 명 | 상권·날씨·개인선호를 여러 명이 붙이는데, 점수식이 한 줄에 있으면 전원이 그 줄에서 충돌한다 |
| 2026-07-30 | Claude(AI) | `lib/geo.ts`, `lib/routing.ts` | 복제돼 있던 점수식(`maxMin + devMin*0.8`) 2곳을 `fairnessRaw()` 한 곳으로 통합 | 같은 식이 두 파일에 있어 한쪽만 고치는 사고가 나는 자리였다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/types.ts` | `decayScore()`(0~1 정규화) · `worstOf()`(평균 대신 최솟값) 제공 | 구버전 `enhanced-scoring.ts` 경고 반영 — 분 단위 점수 하나가 0~1 점수 전부를 압도했다. 공평성은 평균이 아니라 최악 기준이어야 한다 |
| 2026-07-30 | Claude(AI) | `lib/parse.ts` (신규) | 규칙 기반 한국어 파싱 — 날짜·시간·예산·목적·분위기·음주·식이 | 팀원 PC 의 Ollama 는 배포 환경·발표날 스마트폰에서 닿지 않는다. LLM 없이 항상 도는 경로가 필요 (§4 의 mock 폴백 원칙을 파싱에 적용) |
| 2026-07-30 | Claude(AI) | `tests/smoke.spec.ts`, `playwright.config.ts` (신규) | 핵심 경로(생성→출발지→거점투표→확정)를 실제 브라우저로 검증 | `tsc`·`build` 를 **둘 다 통과**하고도 화면이 통째로 안 그려진 적이 있다. 일부러 깨뜨려 이 테스트가 잡는 것을 확인함 |
| 2026-07-30 | Claude(AI) | `.github/workflows/ci.yml` (신규) | `tsc` + `build` + 스모크를 flags-off / flags-on **두 번** 실행 | 안 돌려보는 플래그는 "언제든 켤 수 있는 코드"가 아니라 "켤 수 있어 보이는 죽은 코드"다 |
| 2026-07-30 | Claude(AI) | `.github/CODEOWNERS` (신규) | 공용 파일에 통합 담당자 리뷰 강제, 기능별 담당 자리 표시 | 여러 명이 같은 파일을 고치는 것을 사람 기억이 아니라 GitHub 이 막게 |
| 2026-07-30 | Claude(AI) | `supabase/migrations/` (신규) | 스키마 변경은 `schema.sql` 수정이 아니라 번호 붙은 파일 추가로 | 세 사람이 컬럼을 추가할 때마다 같은 파일에서 충돌난다 |
| 2026-07-30 | Claude(AI) | `app/manifest.ts`, `public/sw.js`, `public/offline.html`, `public/icon-*.png` (신규) | PWA — 매니페스트 · 서비스 워커 · 아이콘 4종 | 안드로이드 APK(TWA)의 전제 조건. Flutter 재작성 없이 지금 웹앱이 그대로 앱이 된다 |
| 2026-07-30 | Claude(AI) | `public/sw.js` | `/api/*`·비GET·타 출처를 **캐시하지 않음**. 하는 일은 오프라인 안내뿐 | 1.8초 폴링으로 남의 투표를 받아오는 앱이라, 서비스 워커가 캐시하면 "투표가 반영 안 되는" 재현 어려운 버그가 난다 |
| 2026-07-30 | Claude(AI) | `app/components/ServiceWorkerRegistrar.tsx` (신규), `app/layout.tsx` | 운영 빌드에서만 SW 등록 + PWA 메타데이터 | 개발 중 SW 가 살아있으면 코드를 고쳐도 옛 화면이 나온다 |
| 2026-07-30 | Claude(AI) | `docs/APK.md` (신규) | PWA → Bubblewrap → APK 절차, Flutter 를 쓰지 않는 이유 | 발표날 팀원 폰 설치가 목표. 당일에 처음 시도하면 안 되는 작업 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md` (신규) | 브랜치 모델 · 저장소 보호 설정 · 파일 소유권 · Vercel Preview · AI 개발 규칙 | 팀원이 읽고 그대로 따라 할 수 있는 한 장 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 저장소 보호 절차를 최신 GitHub UI 기준으로 정정 — `Settings → Branches` → **`Settings → Rules → Rulesets`**, Secret scanning 위치(`Advanced Security` 하단) 명시 | 사이드바에 `Branches` 항목이 없어 팀원이 문서대로 따라갈 수 없었다(CEO 확인). Ruleset 은 `Enforcement: Active` 로 바꿔야 적용된다는 함정도 함께 기록 |
| 2026-07-30 | Claude(AI) | `docs/팀_개발환경.md`, `docs/노션_통합개발환경.md` | 항목 이름을 `Secret scanning` → **`Secret Protection`** 으로 정정. "버튼 글씨는 상태가 아니라 행동"(`Disable` = 이미 켜짐) 경고 추가. Dependabot·CodeQL 은 켜지 않는다고 명시 | GitHub 이 이름을 바꿔 팀원이 못 찾았다(CEO 확인). 켜져 있는 항목의 `Disable` 버튼을 "켜는 버튼"으로 오해하면 보호가 꺼진다 |
| 2026-07-30 | Claude(AI) | `lib/scoring/CLAUDE.md` (신규) | 스코어러 추가 방법 + 절대 규칙 4개 (복붙 템플릿 포함) | 컨텍스트가 짧은 모델(GLM)은 긴 루트 지시의 뒷부분을 흘린다 — 폴더별 짧은 지시가 더 잘 지켜진다 |
| 2026-07-30 | Claude(AI) | `CLAUDE.md` | 채팅=플래그 기능으로 위상 정정 · 팀 동시 개발 규칙 · 400줄 상한 · 하위 CLAUDE.md 안내 | §0 이 "대화는 카카오톡에서"라 채팅 코드를 범위 외로 오해할 수 있었다 |
| 2026-07-30 | Claude(AI) | `.env.example`, `package.json` | 플래그 4종 문서화 · `test:smoke`/`verify` 스크립트 · `@playwright/test` | — |

### 모임 상세 화면 분할 (팀원 합류 전 필수 작업)

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-30 | Claude(AI) | `app/m/[code]/sections/` (신규 **15파일**) | `MeetingClient.tsx` 1,802줄 → **906줄** (-50%). 화면 조각을 전부 분리: VoteList · ChatPanel(+PrefChips) · AddRegionModal · ManualPickModal · LeaderBar · MeetingHeader · MapPanel · OriginForm · ParticipantList · ResultSection · ReserveModal · TravelTimes · PastStepView · AddParticipant · DebugWidget | 한 파일을 두 사람이 만지면 매일 충돌난다. 담당자가 만질 파일이 전부 400줄 미만이 되는 것이 목적 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/MeetingClient.tsx` | 거점 투표 행이 STAGE MAIN 과 STAGE CHAT 에 **복제**돼 있던 것을 `VoteList` 하나로 통합 | 한쪽만 고치면 같은 투표가 화면마다 다르게 보이는 사고가 날 자리였다 |
| 2026-07-30 | Claude(AI) | `lib/calendar.ts` (신규) | 구글 캘린더·.ics 내보내기 함수 3종을 화면에서 분리 | 순수 함수라 화면에 있을 이유가 없다 |
| 2026-07-30 | Claude(AI) | `app/m/[code]/CLAUDE.md` (신규) | 파일별 소유자 · 이 화면에서 났던 사고 4건 · 데이터 흐름 | 이 화면이 프로젝트에서 제일 충돌이 잦다. 폴더별 짧은 지시가 전역 지시보다 잘 지켜진다 |
| 2026-07-30 | Claude(AI) | `tests/modals.spec.ts` (신규) | 후보 등록·수동 확정 모달을 실제로 열고 눌러 확인 | 모달은 조건부 렌더라 prop 하나만 어긋나도 빌드·타입검사를 통과한 채 조용히 안 열린다 |

**남은 일**: `MeetingClient.tsx` 906줄 = 로직 572 + 조립 334. 화면 조각은 전부
나왔으므로 **소유권 분리는 끝났다**(팀원이 만질 파일은 모두 400줄 미만).
더 줄이려면 로직을 `useMeeting()` 훅으로 빼면 되지만, 그 코드는 어차피 통합
세션 소유라 충돌 방지 효과가 없다 — 급하지 않다.

**검증**: `npx tsc --noEmit` · `npm run build` · 스모크 4/4 통과
(플래그 off/on 양쪽 확인 — on 에서는 투표 UI 가 채팅으로 대체되므로 모달 테스트는 skip).
스모크를 **결과 화면까지** 확장했고, 출발지 등록은 API 가 아니라 **UI 를 직접 조작**한다.
지도·방장 바는 리팩터 영향이 커서 스크린샷으로 눈 검사까지 했다.
추천 결과가 리팩터 전과 **동일**함을 실서버로 확인
(강남역+홍대입구 → `종로3가(48/13)` → `시청(48/19)` → `사당(55/26)`, 순서·문구 그대로).
스모크의 실효성은 `MeetingClient` 를 일부러 깨뜨려 확인 — 빌드는 통과하고 스모크만 실패했다.

---

## v7.0.0 — 2026-07-28

### v7 — v3 인프라 재사용 + 피그마/목업 IA 재구성 (feat/v7-mockup)

CEO 결정: 처음부터 재구축하지 않고 v3(main)의 구현(카카오맵 SDK,
지오코딩, 모임 API, 스토어)을 베이스로 가져와 v7 피그마/목업
(jarvis-brain의 moimer_mockup_v7.html) 디자인으로 UI를 재구성.
v7에서는 투표 실로직·AI 채팅 모두 비활성(화면 플로우만).

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-28 | Jarvis(AI) | 전체 | develop 스켈레톤(src/) 제거, main(v3)의 app/·lib/·설정 이식 | v3 재사용 결정 |
| 2026-07-28 | Jarvis(AI) | `app/globals.css` | v7 컴포넌트 스타일 추가 (하단 5탭·헤더 3버튼·검색/자동완성·출발지 칩·스플래시·투표 UI·모달·내정보 카드) | 목업 v7 디자인 반영 |
| 2026-07-28 | Jarvis(AI) | `app/components/v7/` | Icons·BottomNav·V7Header·Splash 신규 | 목업의 탭/메뉴 구조 그대로 구현 |
| 2026-07-28 | Jarvis(AI) | `app/page.tsx` | v7 홈으로 재작성 — 검색 자동완성 → 출발지 칩(최대 8) → 공평 중간지점(recommendRegions 재사용) → 카카오맵 → 주변 카테고리 리스트 | 목업 비회원 화면 |
| 2026-07-28 | Jarvis(AI) | `app/api/geocode/route.ts` | 자동완성 API 신규 (카카오 키워드 검색, 키 없으면 HUBS mock) | 출발지 입력 채택안(회의록 1차) |
| 2026-07-28 | Jarvis(AI) | `app/api/places/route.ts` | 중간지점 주변 정보 API 신규 (카페/음식점/술집/교통, mock 폴백) | 중간지점 하단 카테고리(회의록 1차) |
| 2026-07-28 | Jarvis(AI) | `app/meetings/page.tsx` | 모임 탭 신규 — 목록(최근/이전) + 생성/참여 모달, 초대 URL 자동 생성·클립보드 복사 (v3 /api/meeting 재사용) | 회의록 3차 모임 생성/참여 플로우 |
| 2026-07-28 | Jarvis(AI) | `app/votes/page.tsx` | 투표함 탭 신규 — 지역/가게 투표 탭 + 스텝 트래커 + 투표 pill (로컬 상태만, 실로직 비활성) | v7 시각 플로우 (CEO 결정) |
| 2026-07-28 | Jarvis(AI) | `app/members/page.tsx` | 모임원 탭 신규 — 참여 중 모임의 참가자 목록 | 목업 하단 탭 구조 |
| 2026-07-28 | Jarvis(AI) | `app/me/page.tsx` | 내정보 탭 신규 — 저장 위치·이동수단 프리셋(localStorage), 스케줄 가져오기(후순위 안내) | 목업 마이페이지 |
| 2026-07-28 | Jarvis(AI) | `package.json` | name moimer·v7.0.0, 미사용 캡처 의존성(puppeteer/pngjs/gifenc) 제거 | 설치 경량화 |

검증: `npx tsc --noEmit` 통과 · `next build` 통과 · 프로덕션 서버 기동 후
홈(출발지 3개→중간지점 강남역 mock)·투표함·모임 생성(실제 코드 발급)·내정보
플로우 스크린샷 확인. 카카오 JS/REST 키 미설정 시 전부 mock으로 동작.

## v1.0.0 — 2026-07-21

### 프로젝트 초기화 (SyncSpot v4 → 모이머 v1.0)

| 날짜 | 작업자 | 대상 파일/폴더 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-21 | Jarvis(AI) | 전체 | SyncSpot v4 복사 → moimer 프로젝트 생성 | 프로젝트 분리 및 리네임 |
| 2026-07-21 | Jarvis(AI) | `src/` 폴더 전체 | `app/` → `src/app/`, `lib/` → `src/lib/` 가이드 스펙 폴더 구조 적용 | mds/CLAUDE.md §2 폴더 구조 규칙 준수 |
| 2026-07-21 | Jarvis(AI) | `package.json` | name: moimer, version: 1.0.0 | 프로젝트 식별 |
| 2026-07-21 | Jarvis(AI) | `package.json` | zustand, @tanstack/react-query, react-hook-form, @hookform/resolvers, zod, clsx, tailwind-merge, class-variance-authority, lucide-react, tailwindcss-animate 추가 | 가이드 스펙 패키지 맞춤 |
| 2026-07-21 | Jarvis(AI) | `src/app/globals.css` | shadcn/ui CSS 변수 토큰 (light/dark 모드) 적용 | 가이드 §3 디자인 토큰 |
| 2026-07-21 | Jarvis(AI) | `tailwind.config.ts` | shadcn 컬러 토큰 + tailwindcss-animate 플러그인 | shadcn/ui 연동 |
| 2026-07-21 | Jarvis(AI) | `tsconfig.json` | `@/*` alias → `./src/*` | src/ 기반 절대경로 |
| 2026-07-21 | Jarvis(AI) | `src/lib/utils.ts` | cn() 유틸 추가 | shadcn/ui 컴포넌트 클래스 병합 |
| 2026-07-21 | Jarvis(AI) | `src/components/ui/button.tsx` | shadcn/ui 스타일 Button 컴포넌트 | UI 컴포넌트 표준화 |
| 2026-07-21 | Jarvis(AI) | `src/components/ui/input.tsx` | shadcn/ui 스타일 Input 컴포넌트 | UI 컴포넌트 표준화 |
| 2026-07-21 | Jarvis(AI) | 앱 전체 UI 텍스트 | SyncSpot → 모이머(Moimer) 리네임 | 프로젝트명 확정 |
| 2026-07-21 | Jarvis(AI) | `mds/` | 가이드 문서(CLAUDE.md, AI-GUIDE.md, skills/) 포함 | 가이드 self-contained 구조 |
| 2026-07-21 | Jarvis(AI) | `CLAUDE.md` | 모이머 전용 AI 지시서 생성 | 이 프로젝트의 규칙 기준 문서 |
| 2026-07-21 | Jarvis(AI) | `CHANGELOG.md` | 변경 기록 파일 생성 | 가이드 §5 변경기록 규칙 준수 |
| 2026-07-23 | Jarvis(AI) | `src/app/api/transit-time/route.ts` | ODsay 응답 타입 명시(`any` 제거), transfers 음수 방지, walkMinutes/fare 반환 추가 | TypeScript 규칙 준수 및 데이터 품질 개선 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | TravelTime에 transfers/walkMinutes/fare 필드 추가 | 대중교통 세부 정보 표시 준비 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | getTransitMinutes → getTransitResult 교체, calcTravelTimes에서 환승/도보/요금 필드 수집 | TravelTime 세부 정보 반영 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | estimateFallback 자차 로직 개선 — 도로 보정(×1.4) + 거리별 속도 적용 (5km미만 20/15km미만 30/30km미만 50/이상 70) | 자차 이동시간 추정 현실화 |
| 2026-07-23 | Jarvis(AI) | `src/app/api/car-time/route.ts` | TMAP 자동차 경로 API 라우트 생성 — 이동시간/거리/통행료 반환, TMAP 실패 시 isEstimated:true | 자차 실제 이동시간 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | getCarResult 함수 추가, calcTravelTimes에서 자차도 TMAP API 우선 사용 (실패 시 Haversine fallback) | 자차 실제 경로 기반 이동시간 적용 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | TravelTime에 distanceKm 필드 추가 | 자차 경로 거리 표시 준비 |
| 2026-07-23 | Jarvis(AI) | `.env.local` | TMAP_API_KEY 추가 | TMAP API 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/travel-time-display.ts` | 이동시간 표시 유틸 — formatTravelTime, getTravelSummary, confidenceBadge, calcDepartureClock | 슬로건3 통합 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/date-highlight-logic.ts` | 날짜 겹침 하이라이트 — computeDateHighlights, toHighlightMap | 날짜 투표 UI 고도화 준비 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/meeting-type-scoring.ts` | 모임 성격별 카테고리 매핑 + 밀집도 점수 — commercialDensityScore, PURPOSE_TO_MEETING_TYPE | 슬로건4 통합 |
| 2026-07-23 | Jarvis(AI) | `src/app/meeting/[id]/page.tsx` | TravelBar 개선 — 실시간/추정 배지, getTravelSummary 세부 경로 요약(환승·도보·요금), formatTravelTime 포맷 | 슬로건3 UI 반영 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/enhanced-scoring.ts` | 스코어링 고도화 — fairTime×0.70 + transitPenalty×0.15 + farePenalty×0.05 + densityBonus×0.10, normalizeTimeBy:120 | 미션A 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/transit-strategy.ts` | ODsay 다중 경로 전략 — fastest/fewest_transfers/least_walk | 미션B 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/yield-message-integration.ts` | 자차 양보 기여 메시지 — buildYieldMessages, createCarMinutesProvider | 미션C 통합 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/app/api/transit-time/route.ts` | 미션B 적용 — parseStrategy + pickTransit 으로 경로 선택 교체 | 다중 경로 전략 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/recommend-engine.ts` | 미션A/C 적용 — scoreCandidateEnhanced(밀집도+세부지표), buildYieldMessages, purposeType 인자 추가 | 스코어링+양보메시지 통합 |
| 2026-07-23 | Jarvis(AI) | `src/lib/algo/car-flexible-logic.ts` | calcYieldContributions, MinutesProvider 추가 (yield-message-integration 의존성) | 미션C 완성 |
| 2026-07-23 | Jarvis(AI) | `src/types/index.ts` | RegionRecommendation에 yieldMessages?: string[] 추가 | 미션C 타입 확장 |
| 2026-07-23 | Jarvis(AI) | `src/stores/meetingStore.tsx` | buildRegionRecommendation 호출에 purposeType 전달 | 미션A 모임 성격 연동 |
| 2026-07-23 | Jarvis(AI) | `src/lib/joinCode.ts` | parseJoinTarget() 참가 파싱 유틸 추출 (BottomNav 시트 + participate 공용) | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/components/common/CreateActionSheet.tsx` | 통합 진입 바텀시트 신규 — 새 모임 / 모임 참가(인라인 코드 입력) | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/components/common/BottomNav.tsx` | 탭 5개→4개 (참가 탭 제거), 중앙 [+]를 버튼+CreateActionSheet 트리거로 전환 | UX 재설계 미션2 |
| 2026-07-23 | Jarvis(AI) | `src/lib/homeState.ts` | getHomeState() — S1신규/S2다음약속/S3액션/S4유휴 상태 판정 순수 함수 | UX 재설계 미션1 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 화면 상태 기반 혼합형(E+F) 개편 — 상태별 히어로 카드 + INSPIRATION_CARDS 영감 카드 8개 | UX 재설계 미션1 |
| 2026-07-23 | Jarvis(AI) | `src/app/meeting/new/page.tsx` | ?purpose= 쿼리파라미터 읽어 purposeType 초기값 프리필 | UX 재설계 영감 카드 연동 |
| 2026-07-23 | Jarvis(AI) | `src/stores/meetingStore.tsx`, `src/app/meeting/[id]/page.tsx` | 채팅 실시간 반영 수정 — postgres_changes → Supabase Broadcast 전환, sendMessage 낙관적 업데이트(보낸 사람도 즉시 반영) | 새로고침 없이 실시간 채팅 |
| 2026-07-23 | Jarvis(AI) | `src/app/globals.css` | 맵 히어로 CSS 변수 토큰 추가 — 라이트/다크 + data-theme 오버라이드 (home-map-mockup.html 기준) | MapHero 컴포넌트 테마 지원 |
| 2026-07-23 | Jarvis(AI) | `src/lib/homeData.ts` | INSPIRATION_CARDS 상수 + getNextConfirmed() 유틸 신규 | 홈 데이터 로직 분리 |
| 2026-07-23 | Jarvis(AI) | `src/components/home/MapHero.tsx` | 지도 히어로 컴포넌트 신규 — CSS/SVG 정적 지도, 핀 수렴 pulse 애니, nextConfirmed 상태 분기, reduced-motion 지원 | home-screen-FINAL.md §2-1 구현 |
| 2026-07-23 | Jarvis(AI) | `src/components/home/InspirationRail.tsx` | 영감 카드 가로 스크롤 레일 신규 — INSPIRATION_CARDS, purpose 프리필 라우팅 | home-screen-FINAL.md §2-2 구현 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 MapHero 기반 재작성 — 지도히어로+오버랩시트(CTA/참가/InspirationRail), CreateActionSheet 직접 포함 | home-screen-FINAL.md 후보2 최종 구현 🤖 Generated with Claude Code |
| 2026-07-23 | Jarvis(AI) | `src/app/my-meetings/page.tsx` | 내 모임 전용 페이지 신규 — 진행중/완료 탭, MeetingCard/SeriesGroup/StatusBadge 컴포넌트 | 홈에서 모임 목록 분리 (내 모임 탭 신설) |
| 2026-07-23 | Jarvis(AI) | `src/components/common/BottomNav.tsx` | 내 모임 탭 추가 → 5탭 (홈·일정·[+]·내모임·내정보), ListIcon 추가 | 내 모임/내 정보 탭 분리 |
| 2026-07-23 | Jarvis(AI) | `src/app/dashboard/page.tsx` | 홈 화면 정리 — 모임 목록 제거, 중복 CTA 제거, 영감 카드 4열 그리드로 재디자인 | 홈 UX 간소화 |

---

## v1.1.0 — 2026-07-21

### 채팅 AI 파싱 기능 추가

| 날짜 | 작업자 | 대상 파일 | 변경 내용 | 사유 |
|---|---|---|---|---|
| 2026-07-21 | Jarvis(AI) | `src/lib/ai/chatParser.ts` | Gemini 2.0 Flash 채팅 파싱 클라이언트 | 내부 채팅 → 모임 정보 자동 추출 |
| 2026-07-21 | Jarvis(AI) | `src/app/api/parse-chat/route.ts` | 서버 사이드 Gemini API Route, 일일 200회 제한 | API 키 보호 + 무료 티어 초과 방지 |
| 2026-07-21 | Jarvis(AI) | `src/app/meeting/[id]/page.tsx` | AI 파싱 버튼 + 제안 카드 UI 추가 | 채팅 기반 모임 정보 자동 업데이트 UX |
| 2026-07-21 | Jarvis(AI) | `.gitignore` (루트) | `src/lib/` 경로 허용 패턴 추가 | lib/ 무시 규칙 충돌 해결 |

---

## 앞으로 변경 기록 작성 방법

새 행을 아래 형식으로 추가:

```
| YYYY-MM-DD | 작업자 | 파일명 또는 폴더 | 무엇을 바꿨는지 | 왜 바꿨는지 |
```

예시:
```
| 2026-07-22 | 유환 | src/app/meeting/new/page.tsx | 모임 생성 폼 Zod 검증 추가 | 빈 폼 제출 버그 수정 |
| 2026-07-22 | Jarvis(AI) | src/lib/ai/gemini.ts | Gemini 파싱 래퍼 초안 | feat/ai-parsing 브랜치 |
```
