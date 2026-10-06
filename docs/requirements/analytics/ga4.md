# GA4 사용 분석 도입 (FE)

> **스토리**: HBB1-351 GA 설정 — 나는 운영자로서 사용자가 어떤 화면을 얼마나 이용하는지 알기 위해 서비스 이용 현황을 Google Analytics 4로 집계할 수 있다.
>
> **범위**: 프론트 SPA(https://kkori.ai.kr)의 page_view 수집만. 커스텀 이벤트·사용자 식별·백엔드 연동은 이번 범위 밖(후속 과제 참고).

## Overview

GA4 웹 데이터 스트림의 gtag 를 prod 빌드에만 로드하고, React Router 경로 전환마다 page_view 를 **수동으로** 1건 보낸다. 로컬·CI·테스트 빌드는 측정 ID 가 비어 있어 분석 코드가 전혀 동작하지 않는다.

```text
deploy.yml ── vars.VITE_GA_MEASUREMENT_ID ──▶ pnpm build (prod 번들에 ID 포함)
main.tsx ── initAnalytics() ── ID 있음 → gtag 로더 삽입 + config(send_page_view: false, page_location = origin + pathname)
                             └─ ID 없음 → no-op
App.tsx ── PageViewTracker ── pathname 변경마다 trackPageView(pathname) → set(page_location) + page_view(page_location = origin + pathname)
```

### 결정 사항

| # | 항목 | 결정 | 근거 |
| --- | --- | --- | --- |
| A | page_view 방식 | 수동 전송(pathname 만). GA 콘솔의 "향상된 측정 > 브라우저 기록 이벤트" 는 **끔** | 자동 전송은 첫 page_view 를 React 보다 먼저 전체 URL 로 쏘므로 카카오 콜백 `?code=…&state=…` 가 제3자로 나간다. 둘을 함께 켜면 중복 집계 |
| B | 라이브러리 | gtag 직접 로드 (`src/utils/analytics.ts`) | 의존성 0, 테스트 용이. react-ga4 는 같은 일을 감싼 래퍼 |
| C | 적용 환경 | prod 만. 로컬은 `.env.local` 에 ID 를 넣으면 DebugView 로 확인 가능 | dev 트래픽이 실데이터를 오염시키지 않게 |
| D | 1차 수집 범위 | page_view 만 | 퍼널(면접 시작·종료 등) 이벤트는 지표 정의 후 후속 |
| E | 사용자 식별 | user_id·사용자 속성 전송 안 함. Google 신호 **끔** | 행태정보와 계정 식별자 결합 회피 |
| F | 개인정보 반영 | 개인정보처리방침에 행태정보 수집·Google 국외 이전 명시(아래 초안, 팀 검토 후 반영). 동의서 `privacy` 버전은 올리지 않음 | 버전 인상은 서버 설정 변경 + 전원 재동의가 따라와 비용이 큼 |

### 기능 요구사항

| No. | Function | Description |
| --- | --- | --- |
| 1 | 초기화 가드 | `VITE_GA_MEASUREMENT_ID` 가 비어 있으면 gtag 로더 삽입·dataLayer 생성·이벤트 전송을 전부 생략한다. |
| 2 | page_view 수동 전송 | 경로(pathname)가 바뀔 때마다 page_view 1건을 보내고, `page_location` 은 origin + pathname 으로 명시해 쿼리스트링·해시를 싣지 않는다. 같은 값을 `set` 으로 고정해 자동 이벤트(user_engagement·scroll 등)도 쿼리를 싣지 않는다. |
| 3 | 배포 주입 | prod 배포 워크플로가 GitHub Actions Variables 의 `VITE_GA_MEASUREMENT_ID` 를 빌드 env 로 넘긴다. 변수가 없으면 분석이 꺼진 빌드가 나온다. |

---

## 초기화 가드

### 설명

`initAnalytics()` 는 측정 ID 가 빈 문자열이거나 `window.gtag` 가 이미 있으면 바로 반환한다. ID 가 있으면 공식 스니펫과 같은 순서로 `dataLayer` 큐와 `gtag` 함수를 만들고(`js`, `config` 명령), `https://www.googletagmanager.com/gtag/js?id=<ID>` 로더를 `<head>` 에 async 삽입한다.

- `config` 는 `send_page_view: false` 와 정제한 `page_location`(origin + pathname)을 함께 보낸다. send_page_view 는 자동 page_view 만 끄고, user_engagement·scroll 같은 자동 이벤트는 document.location(쿼리 포함)을 기본값으로 쓰므로 config 단계에서 기본값을 바꿔 둔다.
- 큐 항목은 `arguments` 객체여야 한다. gtag.js 는 배열을 명령으로 해석하지 않는다.
- 테스트 셋업(`src/test/setup.ts`)은 ID 를 빈 값으로 고정해 개발자 로컬 `.env.local` 이 테스트를 흔들지 않게 한다.

### 검증 기준

- ID 가 비어 있으면 `window.gtag`·`window.dataLayer`·로더 `<script>` 가 전부 없는지 확인
- ID 가 있으면 로더 1개가 삽입되고 큐에 `["js", Date]`, `["config", ID, { send_page_view: false, page_location }]` 가 순서대로 있는지 확인
- 주소창에 `?code=…` 가 있어도 config 의 page_location 에 쿼리가 없는지 확인
- 두 번 호출해도 로더·큐가 중복되지 않는지 확인

## page_view 수동 전송

### 설명

`App.tsx` 의 `PageViewTracker` 가 `useLocation().pathname` 변경을 effect 로 감지해 `trackPageView(pathname)` 을 호출한다. StrictMode(개발·테스트)의 effect 이중 실행에서 중복 전송되지 않게 마지막 전송 경로를 기억한다.

- `trackPageView` 는 `page_location: window.location.origin + pathname` 을 명시한다. 명시하지 않으면 gtag 가 `document.location`(쿼리 포함)으로 채운다. 같은 값을 `gtag('set', { page_location })` 으로도 고정해 이후 자동 이벤트의 기본값을 새 경로로 갱신한다.
- 카카오 콜백 `/auth/kakao/callback?code=…&state=…` 에서도 `code`·`state` 가 전송되지 않는다.
- 가드 리다이렉트(예: 미로그인 `/dashboard` → `/login`)는 두 경로 모두 page_view 가 남는다. 분석 시 `/login` 유입의 일부는 리다이렉트임을 감안한다.

### 검증 기준

- 랜딩 진입 시 page_view 1건(`/`), CTA 로 `/login` 이동 시 1건 추가되는지 확인(StrictMode 에서도 각 1건)
- 주소창에 `?code=secret` 이 있어도 큐 어디에도 `secret` 이 없는지 확인
- prod 빌드를 실제 ID 로 띄웠을 때 GA DebugView(또는 Network 의 `/g/collect` 요청)에 경로 전환마다 page_view 1건이 보이고 `dl` 파라미터에 쿼리스트링이 없는지 확인

## 배포 주입

### 설명

`.github/workflows/deploy.yml` 의 `env` 에 `VITE_GA_MEASUREMENT_ID: ${{ vars.VITE_GA_MEASUREMENT_ID }}` 를 추가한다. 값은 리포 Settings → Secrets and variables → Actions → Variables 에서 관리한다(측정 ID 는 비밀이 아니라 Variables 가 맞다).

### 실행 조건 (GA 콘솔, 코드 외)

1. GA4 속성 생성 → 웹 데이터 스트림에 `https://kkori.ai.kr` 등록 → 측정 ID(`G-…`) 확보
2. 데이터 스트림 → 향상된 측정 → **"브라우저 기록 이벤트를 기반으로 하는 페이지 변경" 끔** (수동 전송과 중복 방지)
3. 관리 → 데이터 설정 → 데이터 수집 → **Google 신호 끔**
4. 데이터 스트림 → 태그 설정 구성 → 데이터 수정 → URL 쿼리 매개변수 `code`, `state` 삭제 (코드가 이미 싣지 않지만 이중 방어)
5. 데이터 보관 기간 14개월(기본 2개월)로 조정
6. 리포 Variables 에 `VITE_GA_MEASUREMENT_ID` 등록 → 다음 main 배포부터 반영

### 검증 기준

- Variables 미등록 상태의 배포 산출물에 `googletagmanager` 문자열은 있어도 gtag 로더가 삽입되지 않는지(ID 빈 값 가드) 확인
- Variables 등록 후 배포 산출물에서 `/g/collect` 요청이 발생하는지 확인

---

## 개인정보처리방침 반영 초안 (팀 검토 필요)

GA 는 첫 번째 도메인에 `_ga` 쿠키를 심고 행태정보(방문 화면·이용 시간·브라우저·기기·대략적 위치)를 Google LLC(미국) 서버로 전송한다. 개인정보 보호법상 개인정보처리방침에 **행태정보 수집·이용**과 **국외 이전**(이전받는 자, 국가, 항목, 목적·보유 기간, 거부 방법)을 적어야 한다. 아래는 사용자 노출 문안 초안이며 법적 항목 충족 여부는 팀이 확정한다.

> 서비스 이용 현황을 분석하기 위해 Google LLC의 Google Analytics를 사용해요. Google Analytics는 쿠키(_ga)를 통해 방문한 화면, 이용 시간, 브라우저와 기기 정보를 수집하고, 이 정보는 Google LLC(미국)의 서버로 전송돼요. 이름, 이메일 등 계정 정보와 이력서, 음성 데이터는 Google에 전송하지 않아요. 수집을 원하지 않으면 브라우저에서 쿠키를 차단하거나 Google Analytics 차단 브라우저 부가기능을 사용할 수 있어요.

- 반영 위치: 개인정보처리방침 문서(현재 서비스에 별도 페이지 없음 → 게시 위치 결정 필요). 동의서 `privacy` 문안(`src/pages/consentCopy.ts`)은 이번에 바꾸지 않는다.
- GA4 는 IP 주소를 저장하지 않으며 이 구현은 user_id·사용자 속성을 보내지 않는다.

## 후속 과제

- 퍼널 이벤트(면접 시작·종료, 이력서 업로드, 리포트 열람): 지표 정의가 확정되면 `trackEvent` 를 추가하고 각 페이지 핸들러에서 호출
- 개인정보처리방침 게시 위치(랜딩 푸터 링크 또는 외부 문서)와 문안 확정
- 분석 거부 토글(쿠키 동의 배너): 해외 사용자가 생기거나 법무 요구가 있을 때 `gtag('consent', …)` 로 확장
