import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "./api/queryClient";
import { REPORT_DETAIL_PATTERN, ROUTES } from "./routes";
import { clearInterviewSession } from "./hooks/interviewSession";
import { useAuthSessionId, useAuthStatus } from "./hooks/useAuthStatus";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { KakaoCallbackPage } from "./pages/KakaoCallbackPage";
import { ConsentPage } from "./pages/ConsentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ResumePage } from "./pages/ResumePage";
import { SetupPage } from "./pages/SetupPage";
import { ReportListPage } from "./pages/ReportListPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { MyPage } from "./pages/MyPage";

/* /live 만 지연 로드 — livekit-client(수백 kB)가 면접 화면 밖 번들에 실리지 않게 분리 */
const InterviewPage = lazy(() =>
  import("./pages/InterviewPage").then((m) => ({ default: m.InterviewPage })),
);

/** /live 청크 로딩 화면 — SDK 청크를 받는 동안 면접 화면과 같은 다크 배경 유지 */
function InterviewLoadingScreen() {
  return (
    <div role="status" style={{ minHeight: "100vh", background: "var(--neutral-970)" }}>
      {/* 시각적으로 숨긴 스크린리더 안내 */}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        면접 화면을 불러오는 중…
      </span>
    </div>
  );
}

/** /live 청크 로드 실패 경계 — 배포로 청크 해시가 바뀌었거나 네트워크 오류면
    lazy import 가 거부되어 백지가 되므로, 새로고침 안내로 대체한다 */
class InterviewChunkErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          background: "var(--neutral-970)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          color: "var(--fg-inverse)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
        }}
      >
        면접 화면을 불러오지 못했어요 — 네트워크 확인 후 다시 시도해 주세요
        <button className="dark-btn" onClick={() => window.location.reload()}>
          새로고침
        </button>
      </div>
    );
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** 인증 세션 전이 관찰 — 로그아웃(A→null)·계정 교체(A→B) 시 **루트** 클라이언트를
    비운다. 보호 화면의 데이터 격리는 ProtectedSessionBoundary(세션 전용 클라이언트 +
    remount) 소관이고, 여기는 루트에 남는 게스트 쿼리(카카오 code 교환 응답의 토큰 등)의
    위생 처리다. 로그인(null→B)은 지우지 않는다 — 이전 인증 캐시가 없고, 이 탭이
    카카오 콜백 처리 중이면 일회용 code 교환 쿼리를 지워 code 재전송을 유발하기 때문.
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
      // 면접 세션 토큰도 함께 폐기 — 이전 계정의 유효한 LiveKit 토큰이
      // 같은 탭의 다음 사용자에게 넘어가지 않게 한다 (/live 게이트와 이중 방어)
      clearInterviewSession();
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

/** 보호 구역 세션 경계 — RequireAuth 가 key={sessionId} 로 마운트하므로 세션이 바뀌면
    (다른 탭 계정 교체 포함) 이 subtree 가 통째로 remount 된다. 페이지 로컬 상태(폼·
    모달·savedName 등)가 이전 계정에서 승계되지 않고, Query 캐시도 세션 전용
    클라이언트라 새 계정 화면에 이전 계정 데이터가 한 프레임도 렌더되지 않는다.
    (effect 로 공유 캐시를 지우는 방식은 지우기 전 1회 렌더가 이전 데이터를 노출) */
function ProtectedSessionBoundary() {
  const [client] = useState(makeQueryClient); // remount 마다 새 클라이언트
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}

/** 보호 라우트 가드 — 미로그인 접근을 /login 으로 보내고 원 목적지를 state 로 전달
    (AuthPage 가 카카오 클릭 시 저장해 인가 왕복 후 복귀에 쓴다) */
function RequireAuth() {
  const sessionId = useAuthSessionId();
  const status = useAuthStatus();
  const location = useLocation();
  if (status === "checking") return <AuthCheckingScreen />;
  if (status === "guest" || sessionId === null) {
    return (
      <Navigate to={ROUTES.auth} replace state={{ from: location.pathname + location.search }} />
    );
  }
  return <ProtectedSessionBoundary key={sessionId} />;
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
          <Route
            path={ROUTES.interview}
            element={
              <InterviewChunkErrorBoundary>
                <Suspense fallback={<InterviewLoadingScreen />}>
                  <InterviewPage />
                </Suspense>
              </InterviewChunkErrorBoundary>
            }
          />
          <Route path={ROUTES.reportList} element={<ReportListPage />} />
          <Route path={REPORT_DETAIL_PATTERN} element={<ReportDetailPage />} />
          <Route path={ROUTES.mypage} element={<MyPage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
      </Routes>
    </>
  );
}
