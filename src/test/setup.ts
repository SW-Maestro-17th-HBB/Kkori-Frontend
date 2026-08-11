/* Vitest 공통 셋업 */
// jest-dom 매처(toBeInTheDocument 등)를 vitest expect에 확장
import "@testing-library/jest-dom/vitest";
// globals: false 환경에선 RTL auto-cleanup이 동작하지 않으므로 명시 등록
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// API 베이스를 상대 경로로 고정 — 개발자 로컬 .env.local(VITE_API_BASE_URL)이
// URL 검증 테스트를 흔들지 않게 한다 (CI에는 .env.local이 없어 원래 빈 값).
// request.ts가 모듈 상수로 읽으므로 테스트 모듈 import 전인 셋업에서 고정해야 한다.
vi.stubEnv("VITE_API_BASE_URL", "");

afterEach(cleanup);
