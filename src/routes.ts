/* ============================================================
   라우트 테이블 — 프로토타입 app.jsx의 FRAMES 배열을 라우팅으로 전환
   (key · URL 매핑, README "구현 시 가장 중요한 전환점")
   ============================================================ */
export const ROUTES = {
  landing: "/",
  auth: "/login",
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
