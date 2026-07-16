import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 로컬 개발 시 백엔드(8080)로 프록시 — CORS 설정 없이 same-origin 처럼 동작.
    // 프록시를 안 타려면 .env 의 VITE_API_BASE_URL 로 전체 URL 을 지정 (.env.example 참고)
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/sse": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
