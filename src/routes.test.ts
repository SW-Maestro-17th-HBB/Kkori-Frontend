import { describe, expect, it } from "vitest";
import { isProtectedPath, ROUTES } from "./routes";

/* request.ts 재인증 처리의 저장 대상 판별 — 동적 패턴(/reports/:id) 경계까지 고정한다 */
describe("isProtectedPath", () => {
  it.each([
    ROUTES.dash,
    ROUTES.resume,
    ROUTES.setup,
    ROUTES.interview,
    ROUTES.reportList,
    ROUTES.mypage,
    "/reports/123", // 동적 패턴 매칭
    "/reports/abc", // :id 는 세그먼트 형태만 보고 매칭한다 (값 검증은 화면 몫)
  ])("보호 경로 %s → true", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each([
    "/reports/123/extra", // 패턴 초과 세그먼트 — end 매칭이라 불일치
    ROUTES.landing,
    ROUTES.sample,
    ROUTES.auth,
    ROUTES.consent,
    ROUTES.kakaoCallback, // 인증 플로우 경로는 복귀 저장 대상이 아니다
    "/unknown-path",
  ])("공개·인증 플로우·미지의 경로 %s → false", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(false);
  });
});
