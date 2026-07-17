/* ============================================================
   라우트 테이블 — 프로토타입 app.jsx의 FRAMES 배열을 라우팅으로 전환
   (key · URL 매핑, README "구현 시 가장 중요한 전환점")
   ============================================================ */
import { matchPath } from "react-router";

export const ROUTES = {
  landing: "/",
  auth: "/login",
  kakaoCallback: "/auth/kakao/callback",
  consent: "/signup",
  dash: "/dashboard",
  resume: "/resumes",
  setup: "/setup",
  interview: "/live",
  reportList: "/reports",
  reportDetail: "/reports/1",
  mypage: "/account",
  sample: "/sample",
} as const;

export type NavKey = keyof typeof ROUTES;

export const reportDetailPath = (id: number | string) => `/reports/${id}`;

/** 라우트 등록용 패턴 — ROUTES.reportDetail 은 이동용 대표 경로, 등록은 이 패턴을 쓴다 */
export const REPORT_DETAIL_PATTERN = "/reports/:id";

/* ============================================================
   라우트 접근 분류 (명세: docs/requirements/user/auth.md §라우팅 가드)
   가드(App.tsx)와 재인증 저장 판별(request.ts)의 단일 원천.
   exhaustive Record 라 새 라우트 추가 시 분류 선언이 타입으로 강제된다.
   ============================================================ */
export type RouteAccess = "public" | "protected" | "guestOnly";

export const ROUTE_ACCESS: Record<NavKey, RouteAccess> = {
  landing: "public",
  auth: "guestOnly",
  // 로그인 플로우의 기반 화면 — 가드로 묶으면 페이지 자체 라우팅과 경합한다
  kakaoCallback: "public",
  consent: "guestOnly",
  dash: "protected",
  resume: "protected",
  setup: "protected",
  interview: "protected",
  reportList: "protected",
  reportDetail: "protected",
  mypage: "protected",
  sample: "public",
};

/* 보호 라우트 매칭 패턴 — reportDetail 은 대표 경로가 아닌 등록 패턴으로 대조 */
const PROTECTED_PATTERNS = (Object.keys(ROUTE_ACCESS) as NavKey[])
  .filter((key) => ROUTE_ACCESS[key] === "protected")
  .map((key) => (key === "reportDetail" ? REPORT_DETAIL_PATTERN : ROUTES[key]));

/** 라우터 밖(request.ts 재인증 처리)에서 현재 경로의 보호 여부를 판별한다 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATTERNS.some((pattern) => matchPath(pattern, pathname) !== null);
}
