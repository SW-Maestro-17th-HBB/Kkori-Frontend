import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { REPORT_DETAIL_PATTERN, ROUTES } from "./routes";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { KakaoCallbackPage } from "./pages/KakaoCallbackPage";
import { ConsentPage } from "./pages/ConsentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ResumePage } from "./pages/ResumePage";
import { SetupPage } from "./pages/SetupPage";
import { InterviewPage } from "./pages/InterviewPage";
import { ReportListPage } from "./pages/ReportListPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { MyPage } from "./pages/MyPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/* 프로토타입 FRAMES(라우트 테이블) → 실제 라우팅 — 경로는 src/routes.ts 가 단일 원천 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path={ROUTES.landing} element={<LandingPage />} />
        <Route path={ROUTES.auth} element={<AuthPage />} />
        <Route path={ROUTES.kakaoCallback} element={<KakaoCallbackPage />} />
        <Route path={ROUTES.consent} element={<ConsentPage />} />
        <Route path={ROUTES.dash} element={<DashboardPage />} />
        <Route path={ROUTES.resume} element={<ResumePage />} />
        <Route path={ROUTES.setup} element={<SetupPage />} />
        <Route path={ROUTES.interview} element={<InterviewPage />} />
        <Route path={ROUTES.reportList} element={<ReportListPage />} />
        <Route path={REPORT_DETAIL_PATTERN} element={<ReportDetailPage />} />
        <Route path={ROUTES.mypage} element={<MyPage />} />
        <Route path={ROUTES.sample} element={<ReportDetailPage sample />} />
        <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
      </Routes>
    </>
  );
}
