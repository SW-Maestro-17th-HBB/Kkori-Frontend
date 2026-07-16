# 인증 연동 (FE)

> **스토리**: HBB1-248 — 나는 사용자로서 서비스를 이용하기 위해 카카오 계정으로 가입하고 로그인할 수 있다.
>
> **하위 이슈**: HBB1-249 [개발] 카카오 로그인 연동 개발 · HBB1-250 [개발] 약관 동의·회원가입 연동 개발 · HBB1-251 [개발] 토큰 관리·자동 재발급 개발 · HBB1-252 [개발] 라우팅 가드 개발
>
> **백엔드 원천 PRD**: [Kkori-Backend `docs/requirements/user/oauth.md`](https://github.com/SW-Maestro-17th-HBB/Kkori-Backend/blob/develop/docs/requirements/user/oauth.md) · [`user/consent.md`](https://github.com/SW-Maestro-17th-HBB/Kkori-Backend/blob/develop/docs/requirements/user/consent.md) — 도메인 정책·API 계약·에러 코드는 백엔드 PRD가 원천이며, 이 문서는 **FE 화면 동작만** 정의한다 (백엔드 내용 복제 금지).

## Overview

프론트 콜백 방식 카카오 인증의 화면 흐름을 정의한다. 프론트가 카카오 인가 코드(code)를 콜백으로 수신해 `POST /api/v1/auth/kakao`로 전달하고, 응답의 유저 판정(기존/신규/복구)에 따라 라우팅한다. 토큰(AT 30분/RT 14일)은 응답 body로 수신하며, 저장·재발급·폐기는 프론트가 관리한다.

## 화면 플로우

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

- `/auth/kakao/callback`은 디자인 핸드오프에 없는 신규 화면 — 처리 중 로딩 표시와 실패 안내만 갖는 얇은 화면으로 구현한다.
- 복구 대상(`isRestored: true`)의 동의 화면은 "탈퇴 후 3일 이내 재로그인 시 복구" 안내를 함께 노출한다 (기존 약관 화면의 복구 모드 변형).

## FE 검증 기준

완료 조건은 여기서 발췌한다. 백엔드 검증(토큰 발급·판정 로직 등)은 백엔드 PRD 소관이므로 중복하지 않는다.

### 카카오 로그인 (HBB1-249)

- 기존 유저의 code 처리 시 대시보드로 이동하고, 새로고침 후에도 로그인이 유지되는지 확인
- 신규 유저는 동의 화면으로 이동하는지 확인
- 복구 대상(`isRestored`)은 복구 안내가 표시된 동의 화면으로 이동하는지 확인
- 카카오 인증 실패(A002) 시 재시도 안내와 함께 로그인 화면으로 복귀하는지 확인

### 약관 동의·회원가입 (HBB1-250)

- 동의 항목·버전을 서버에서 로드해 표시하는지 확인
- 필수 3종(privacy·audio_usage·resume_usage) 미동의 시 제출이 비활성화되는지 확인
- 필수 미동의(A004)·동의서 버전 불일치(409)·만료 토큰(A005)·중복 가입(A006)이 각각 구분된 안내로 처리되는지 확인
- 가입 완료 시 토큰이 저장되고 대시보드로 이동하는지 확인

### 토큰 관리·자동 재발급 (HBB1-251)

- AT 만료 상태의 API 호출이 사용자 개입 없이 자동 재발급 후 성공하는지 확인
- 재로그인 필요 코드(`REAUTH_REQUIRED_CODES`) 수신 시 세션을 정리하고 로그인 화면으로 이동하는지 확인
- 로그아웃 시 RT 폐기 요청 + 로컬 토큰 제거 후 랜딩으로 이동하는지 확인

### 라우팅 가드 (HBB1-252)

- 미로그인 상태로 보호 라우트(/dashboard 등) 접근 시 /login으로 리다이렉트되는지 확인
- 로그인 후 원래 접근하려던 화면으로 복귀하는지 확인
- 로그인 상태로 /login·/signup 접근 시 대시보드로 보내는지 확인

## FE 결정사항

결정될 때마다 근거와 함께 갱신한다.

- **토큰 저장 전략**: [TBD — HBB1-251에서 결정] 후보: AT 메모리 + RT localStorage / 둘 다 localStorage. XSS 노출 면적과 새로고침 UX의 트레이드오프를 기록할 것
- **가드 구현 방식**: [TBD — HBB1-252에서 결정]
- **카카오 redirect_uri**: [TBD] 로컬 `http://localhost:5173/auth/kakao/callback` — 카카오 개발자 콘솔 등록 필요

## 의존성 · 확인 필요

- ⚠️ 동의 항목·버전 조회 API(`GET /api/v1/consents`, HBB1-12 계약)가 현재 openapi 스냅샷에 없음 — 백엔드 구현 여부 확인 필요 (HBB1-250 선행 조건)
- ⚠️ `CONSENT_VERSION_MISMATCH`(U005)가 `src/api/errorCodes.ts` 스냅샷에 없음 — 백엔드 반영 시 갱신 필요
- 카카오 개발자 콘솔: 프론트 redirect_uri 등록, JavaScript 키 공유 필요

## 참조

- API 타입: `src/api/schema.ts` (`pnpm generate:api`로 생성)
- 에러 코드: `src/api/errorCodes.ts`
- 공통 요청 레이어: `src/api/request.ts`
