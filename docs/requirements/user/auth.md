# 인증 연동 (FE)

> **스토리**: HBB1-248 — 나는 사용자로서 서비스를 이용하기 위해 카카오 계정으로 가입하고 로그인할 수 있다.
>
> **하위 이슈**: HBB1-249 [개발] 카카오 로그인 연동 개발 · HBB1-250 [개발] 약관 동의·회원가입 연동 개발 · HBB1-251 [개발] 토큰 관리·자동 재발급 개발 · HBB1-252 [개발] 라우팅 가드 개발
>
> **백엔드 원천 PRD**: [Kkori-Backend `docs/requirements/user/oauth.md`](https://github.com/SW-Maestro-17th-HBB/Kkori-Backend/blob/develop/docs/requirements/user/oauth.md) · [`user/consent.md`](https://github.com/SW-Maestro-17th-HBB/Kkori-Backend/blob/develop/docs/requirements/user/consent.md) — 도메인 정책·API 계약·에러 코드는 백엔드 PRD가 원천이며, 이 문서는 **FE 화면 동작만** 정의한다.

## Overview

프론트 콜백 방식 카카오 인증의 화면 흐름을 정의한다. 모든 기능은 React SPA(브라우저)에서 실행되며, 프론트가 카카오 인가 코드(code)를 콜백으로 수신해 백엔드 인증 API로 전달하고, 응답의 유저 판정(기존/신규/복구)에 따라 라우팅한다. 토큰(AT 30분/RT 14일)은 응답 body로 수신하며, 저장·부착·재발급·폐기는 프론트가 관리한다.

```
/login ──"카카오로 계속하기"──▶ 카카오 인가 페이지
                                     │ (redirect_uri)
                                     ▼
/auth/kakao/callback (신규 화면) ── code → POST /auth/kakao ──┬─ 기존 유저: 토큰 저장 → /dashboard
                                                              ├─ 신규(isNewUser): signupToken 보관 → /signup
                                                              ├─ 복구(isRestored): /signup (복구 안내 모드)
                                                              └─ 실패(A001·A002·A003): 안내 후 /login
/signup ── 동의 항목·버전 로드 → 체크 → POST /auth/signup ──▶ 토큰 저장 → /dashboard
로그아웃 ── POST /auth/logout (멱등) → 로컬 토큰 폐기 → / (랜딩)
```

### 기능 요구사항

| No. | Function             | Description                                                                                           |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | 카카오 로그인        | /login에서 카카오 인가로 이동하고, 콜백에서 code를 `POST /auth/kakao`로 교환해 기존/신규/복구를 분기 라우팅한다. |
| 2   | 약관 동의·회원가입   | 동의 항목·버전을 로드해 표시하고, signup token과 동의 내역을 `POST /auth/signup`으로 제출해 로그인을 완료한다.    |
| 3   | 토큰 관리·자동 재발급 | 토큰을 저장·부착하고, AT 만료 시 `POST /auth/reissue`로 자동 재발급 후 원 요청을 재시도하며, 로그아웃을 처리한다.  |
| 4   | 라우팅 가드          | 인증 상태에 따라 보호 라우트 접근을 제어하고 리다이렉트한다.                                              |

---

## 카카오 로그인

### 설명

`/login`의 "카카오로 계속하기"가 카카오 인가 페이지로 이동시키고, 카카오가 redirect_uri(`/auth/kakao/callback`)로 되돌려준 code를 백엔드로 교환해 판정 결과에 따라 라우팅한다.

- `/auth/kakao/callback`은 디자인 핸드오프에 없는 신규 화면 — 처리 중 로딩 표시와 실패 안내만 갖는 얇은 화면으로 구현한다.
- 기존 유저: 토큰 저장 후 `/dashboard`로 이동한다.
- 신규 유저(`isNewUser`): signupToken을 보관하고 `/signup`으로 이동한다.
- 복구 대상(`isRestored`): `/signup`으로 이동하되 "탈퇴 후 유예 기간 내 재로그인 시 복구" 안내를 함께 노출한다 (기존 약관 화면의 복구 모드 변형).
- 실패(A001·A002·A003): 안내 문구와 함께 `/login`으로 복귀시킨다.

### 실행 조건

- 카카오 개발자 콘솔에 프론트 redirect_uri가 등록되어 있어야 한다.
- `POST /api/v1/auth/kakao`가 openapi 스냅샷(`src/api/schema.ts`)에 반영되어 있어야 한다.

### 검증 기준

- 기존 유저의 code 처리 시 대시보드로 이동하고, 새로고침 후에도 로그인이 유지되는지 확인
- 신규 유저는 동의 화면으로 이동하는지 확인
- 복구 대상(`isRestored`)은 복구 안내가 표시된 동의 화면으로 이동하는지 확인
- 카카오 인증 실패(A002) 시 재시도 안내와 함께 로그인 화면으로 복귀하는지 확인

### 성능 요구사항

- 없음 (콜백 화면은 code 교환 동안 로딩 상태를 표시한다)

### 인터페이스 요구사항

- 라우트: `/login`, `/auth/kakao/callback` (`src/routes.ts`)
- API: `POST /api/v1/auth/kakao` — 요청/응답 타입은 `src/api/schema.ts`
- 환경 변수: 카카오 JavaScript 키·redirect_uri (변수명은 구현 시 확정, `.env.example`에 문서화)

### 제약사항

- 카카오 인가 코드는 프론트 콜백으로만 수신한다 (백엔드 PRD 계약).
- code는 저장하지 않고 수신 즉시 교환한다.

### 기타 요구사항

- code·토큰을 콘솔 로그·URL 쿼리(교환 후)에 남기지 않는다.

---

## 약관 동의·회원가입

### 설명

`/signup`이 서버에서 동의 항목·버전을 로드해 표시하고, 사용자가 동의를 마치면 signupToken과 동의 내역을 제출해 가입(또는 복구)을 완료한다.

- 필수 3종(privacy·audio_usage·resume_usage)과 선택(marketing)을 구분해 표시하고, 필수 미완료 시 제출을 비활성화한다.
- 제출 성공 시 토큰을 저장하고 `/dashboard`로 이동한다.
- 에러 분기: 필수 미동의(A004) · 동의서 버전 불일치(409 — 항목 갱신 후 재동의 안내) · 만료·무효 토큰(A005 — 재로그인 유도) · 중복 가입(A006 — 로그인 유도)을 각각 구분해 안내한다.

### 실행 조건

- 동의 항목·버전 조회 API(`GET /api/v1/consents`, HBB1-12 계약)가 백엔드에 구현되어 있어야 한다.
- `POST /api/v1/auth/signup`이 openapi 스냅샷에 반영되어 있어야 한다.

### 검증 기준

- 동의 항목·버전을 서버에서 로드해 표시하는지 확인
- 필수 3종 미동의 시 제출이 비활성화되는지 확인
- A004·409(버전 불일치)·A005·A006이 각각 구분된 안내로 처리되는지 확인
- 가입 완료 시 토큰이 저장되고 대시보드로 이동하는지 확인

### 성능 요구사항

- 없음

### 인터페이스 요구사항

- 라우트: `/signup` (복구 모드는 동일 라우트의 상태 변형)
- API: `GET /api/v1/consents`, `POST /api/v1/auth/signup`
- 에러 코드: `src/api/errorCodes.ts` (`CONSENT_VERSION_MISMATCH`(U005)는 백엔드 반영 시 스냅샷 갱신 필요)

### 제약사항

- 동의 항목의 정의·버전 정책은 백엔드 PRD(consent.md)를 따르며 프론트에 하드코딩하지 않는다.

### 기타 요구사항

- 없음

---

## 토큰 관리·자동 재발급

### 설명

발급받은 토큰 쌍을 저장하고, 인증 필요 API 호출에 AT를 부착하며, 만료 시 사용자 모르게 재발급한다.

- `src/api/request.ts` 공통 레이어가 `Authorization: Bearer {AT}`를 부착한다.
- AT 만료(401/A008 등) 감지 시 `POST /auth/reissue`로 재발급 후 원 요청을 1회 재시도한다. 동시 다발 요청의 중복 재발급은 단일화한다.
- 재로그인 필요 코드(`REAUTH_REQUIRED_CODES`) 수신 시 로컬 세션을 정리하고 `/login`으로 보낸다.
- 로그아웃은 `POST /auth/logout`(멱등) 호출 후 로컬 토큰을 제거하고 랜딩으로 이동한다.

### 실행 조건

- `POST /api/v1/auth/reissue`·`POST /api/v1/auth/logout`이 openapi 스냅샷에 반영되어 있어야 한다.

### 검증 기준

- AT 만료 상태의 API 호출이 사용자 개입 없이 자동 재발급 후 성공하는지 확인
- 재로그인 필요 코드 수신 시 세션을 정리하고 로그인 화면으로 이동하는지 확인
- 로그아웃 시 RT 폐기 요청 + 로컬 토큰 제거 후 랜딩으로 이동하는지 확인

### 성능 요구사항

- 없음

### 인터페이스 요구사항

- API: `POST /api/v1/auth/reissue`, `POST /api/v1/auth/logout`
- 공통 레이어: `src/api/request.ts` (토큰 부착·재발급 재시도가 이 파일에 추가됨)
- 재로그인 코드 목록: `src/api/errorCodes.ts`의 `REAUTH_REQUIRED_CODES`

### 제약사항

- 토큰은 응답 body로만 수신한다 — 쿠키·URL 전달 없음 (백엔드 PRD 계약).

### 기타 요구사항

- 토큰을 콘솔 로그·에러 리포트에 남기지 않는다.

---

## 라우팅 가드

### 설명

인증 상태를 기준으로 라우트 접근을 제어한다.

- 보호 라우트(대시보드·이력서·면접·리포트·마이페이지)에 미로그인 접근 시 `/login`으로 리다이렉트하고, 원래 목적지를 기억해 로그인 후 복귀시킨다.
- 로그인 상태로 `/login`·`/signup` 접근 시 `/dashboard`로 보낸다.
- 랜딩(`/`)·예시 리포트(`/sample`)는 비로그인 접근을 허용한다.

### 실행 조건

- 토큰 관리 기능(로그인 상태 판별)이 선행되어야 한다.

### 검증 기준

- 미로그인 상태로 보호 라우트 접근 시 /login으로 리다이렉트되는지 확인
- 로그인 후 원래 접근하려던 화면으로 복귀하는지 확인
- 로그인 상태로 /login·/signup 접근 시 대시보드로 보내는지 확인

### 성능 요구사항

- 없음

### 인터페이스 요구사항

- 라우트 테이블: `src/routes.ts` (보호/공개 라우트 구분이 여기에 추가됨)

### 제약사항

### 기타 요구사항

- 없음
