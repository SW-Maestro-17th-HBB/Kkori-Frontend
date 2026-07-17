import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { makeQueryClient } from "./api/queryClient";
import "./styles/global.css";

/* 루트 클라이언트 — 공개·게스트 화면(랜딩·로그인·가입·콜백)의 쿼리가 산다.
   보호 화면의 쿼리는 세션 전용 클라이언트(App.tsx ProtectedSessionBoundary) 소관. */
const queryClient = makeQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
