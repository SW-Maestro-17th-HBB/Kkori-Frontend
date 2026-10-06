import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { makeQueryClient } from "./api/queryClient";
import { initAnalytics } from "./utils/analytics";
import "./styles/global.css";

/* 루트 클라이언트 — 공개·게스트 화면(랜딩·로그인·가입·콜백)의 쿼리가 산다.
   보호 화면의 쿼리는 세션 전용 클라이언트(App.tsx ProtectedSessionBoundary) 소관. */
const queryClient = makeQueryClient();

// GA4 — VITE_GA_MEASUREMENT_ID 가 있을 때만(prod 빌드) gtag 를 로드한다. page_view 는 App.tsx 가 수동 전송.
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
