# 웹앱 → 안드로이드 APK (PWA + TWA)

> 목표: **최종 발표날 팀원 폰에 설치된 앱으로 시연.**
> 플레이스토어 등록이 안 되더라도 APK 파일 직접 설치로 가능하다.

## 왜 Flutter/React Native 로 다시 만들지 않는가

지금 있는 웹앱(`app/`, `globals.css`, 카카오맵 연동)이 **하나도 넘어가지 않는다.**
전부 새 언어로 다시 짜야 하고, 남은 기간에 그건 프로젝트를 버리는 것과 같다.

**TWA(Trusted Web Activity)** 는 안드로이드 껍데기가 우리 웹앱을 브라우저 UI 없이
전체화면으로 여는 방식이다. 사용자 눈에는 그냥 앱이다 — 주소창도 없고 홈 화면
아이콘도 있다. 코드는 지금 것 그대로 쓴다.

| 방식 | 코드 재작성 | 걸리는 시간 |
|---|---|---|
| **PWA + TWA** | 없음 | 하루 |
| Flutter | 프론트 전체 | 3주+ |

## 준비물 체크 (이미 되어 있는 것)

- [x] `app/manifest.ts` — 이름·아이콘·`display: standalone`
- [x] `public/sw.js` — 서비스 워커 (설치 가능 요건)
- [x] `public/icon-512.png`, `icon-maskable-512.png`, `icon-192.png`
- [ ] **HTTPS 로 배포** — Vercel 에 올리면 자동으로 붙는다. TWA 의 필수 조건
- [ ] Node.js + JDK 17 (Bubblewrap 이 요구)

## 1단계 — Vercel 배포 (HTTPS 확보)

1. vercel.com → New Project → GitHub 저장소 선택
2. Environment Variables 에 `.env.local` 값들을 넣는다
   (⚠️ `DATABASE_URL` 은 **Production 만** 체크)
3. 배포되면 `https://<프로젝트>.vercel.app` 이 나온다 — 이게 앱의 주소다

브라우저(안드로이드 크롬)로 그 주소를 열어 **⋮ → 앱 설치**가 뜨면 PWA 요건 통과다.
안 뜨면 개발자도구 → Application → Manifest 에서 무엇이 빠졌는지 나온다.

## 2단계 — Bubblewrap 으로 APK 만들기

```bash
npm i -g @bubblewrap/cli

# 처음 한 번 — 안드로이드 SDK/JDK 를 자동으로 받아온다
bubblewrap init --manifest https://<프로젝트>.vercel.app/manifest.webmanifest
```

물어보는 것들:

| 질문 | 답 |
|---|---|
| Application ID | `com.moimer.app` (한 번 정하면 바꾸지 않는다) |
| Display mode | `standalone` |
| Signing key | 새로 생성 → **비밀번호를 팀 공유 문서에 적어둘 것** |

```bash
bubblewrap build
# → app-release-signed.apk 생성
```

## 3단계 — 팀원 폰에 설치

1. `app-release-signed.apk` 를 카톡·드라이브로 공유
2. 받는 사람: 설정에서 **"출처를 알 수 없는 앱 설치"** 허용
3. 파일을 눌러 설치

> ⚠️ 발표 당일에 처음 하지 말 것. **최소 1주 전에 한 번 끝까지 해보고**,
> 실제로 폰에서 모임 생성 → 참여 → 추천까지 돌려본다.
> 서명 키를 잃어버리면 같은 앱으로 업데이트할 수 없으니 키 파일을 백업해 둔다.

## (선택) 플레이스토어 등록

- 개발자 계정 $25 (1회)
- **Digital Asset Links** 로 도메인 소유 증명이 필요하다:
  `bubblewrap` 이 만들어 준 `assetlinks.json` 을
  `public/.well-known/assetlinks.json` 에 넣고 재배포.
  이게 있어야 주소창이 완전히 사라진다(없으면 상단에 도메인 배너가 뜬다).
- 심사에 며칠 걸린다 — 발표 일정에 넣지 말고, APK 직접 설치를 기본으로 둔다.

## 알려진 제약

- **iOS 는 TWA 가 없다.** 아이폰 팀원은 사파리 → 공유 → "홈 화면에 추가"로
  PWA 설치까지만 된다(그래도 전체화면 앱처럼 뜬다).
- 카카오맵 SDK 는 도메인 화이트리스트를 쓴다 — Vercel 도메인을
  카카오 개발자 콘솔 → 플랫폼 > Web 에 **반드시 추가**해야 지도가 뜬다.
- 카카오 로그인 Redirect URI 도 Vercel 도메인으로 하나 더 등록해야 한다.
