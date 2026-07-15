import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
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

/* 프로토타입 FRAMES(라우트 테이블) → 실제 라우팅 (src/routes.ts 참조) */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/signup" element={<ConsentPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/resumes" element={<ResumePage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/live" element={<InterviewPage />} />
        <Route path="/reports" element={<ReportListPage />} />
        <Route path="/reports/:id" element={<ReportDetailPage />} />
        <Route path="/account" element={<MyPage />} />
        <Route path="/sample" element={<ReportDetailPage sample />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
