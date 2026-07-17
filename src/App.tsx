import { useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { REPORT_DETAIL_PATTERN, ROUTES } from "./routes";
import { useAuthSessionId, useAuthStatus } from "./hooks/useAuthStatus";
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

/** 인증 세션 전이 관찰 — 다른 탭의 로그아웃(A→null)·계정 교체(A→B) 시 이전 계정의
    Query 캐시를 비운다(staleTime 동안 이전 사용자 데이터가 노출되는 것 방지).
    로그인(null→B)은 지우지 않는다 — 이전 인증 캐시가 없고, 이 탭이 카카오 콜백
    처리 중이면 일회용 code 교환 쿼리를 지워 code 재전송을 유발하기 때문.
    최초 마운트도 전이가 아니다. queryClient.clear() 는 React 상태 동기화가 아니라
    effect 에서 호출해도 된다. */
function AuthSessionObserver() {
  const sessionId = useAuthSessionId();
  const queryClient = useQueryClient();
  const prev = useRef(sessionId);
  useEffect(() => {
    const previous = prev.current;
    prev.current = sessionId;
    if (previous !== null && previous !== sessionId) {
      queryClient.clear();
    }
  }, [sessionId, queryClient]);
  return null;
}

/** 판정 대기 화면 — checking 동안 보호·게스트 화면 어느 쪽도 렌더하지 않는다
    (게스트 화면이 노출되면 OAuth 시작·가입 API 가 실행될 수 있음) */
function AuthCheckingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-canvas)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        className="status-spin"
        role="status"
        aria-label="인증 상태 확인 중"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid var(--blue-100)",
          borderTopColor: "var(--blue-800)",
          display: "inline-block",
        }}
      />
    </div>
  );
}

/** 보호 라우트 가드 — 미로그인 접근을 /login 으로 보내고 원 목적지를 state 로 전달
    (AuthPage 가 카카오 클릭 시 저장해 인가 왕복 후 복귀에 쓴다) */
function RequireAuth() {
  const status = useAuthStatus();
  const location = useLocation();
  if (status === "checking") return <AuthCheckingScreen />;
  if (status === "guest") {
    return (
      <Navigate to={ROUTES.auth} replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <Outlet />;
}

/** 게스트 전용 가드 — 로그인 상태의 /login·/signup 접근을 대시보드로 보낸다 */
function RequireGuest() {
  const status = useAuthStatus();
  if (status === "checking") return <AuthCheckingScreen />;
  if (status === "authenticated") return <Navigate to={ROUTES.dash} replace />;
  return <Outlet />;
}

/* 프로토타입 FRAMES(라우트 테이블) → 실제 라우팅 — 경로는 src/routes.ts 가 단일 원천.
   접근 분류는 ROUTE_ACCESS 가 원천이고, 그룹핑과의 드리프트는 App.test 가 잡는다 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <AuthSessionObserver />
      <Routes>
        <Route path={ROUTES.landing} element={<LandingPage />} />
        <Route path={ROUTES.kakaoCallback} element={<KakaoCallbackPage />} />
        <Route path={ROUTES.sample} element={<ReportDetailPage sample />} />
        <Route element={<RequireGuest />}>
          <Route path={ROUTES.auth} element={<AuthPage />} />
          <Route path={ROUTES.consent} element={<ConsentPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path={ROUTES.dash} element={<DashboardPage />} />
          <Route path={ROUTES.resume} element={<ResumePage />} />
          <Route path={ROUTES.setup} element={<SetupPage />} />
          <Route path={ROUTES.interview} element={<InterviewPage />} />
          <Route path={ROUTES.reportList} element={<ReportListPage />} />
          <Route path={REPORT_DETAIL_PATTERN} element={<ReportDetailPage />} />
          <Route path={ROUTES.mypage} element={<MyPage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
      </Routes>
    </>
  );
}
