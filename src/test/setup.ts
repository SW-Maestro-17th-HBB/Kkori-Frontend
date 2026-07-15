/* Vitest 공통 셋업 */
// jest-dom 매처(toBeInTheDocument 등)를 vitest expect에 확장
import "@testing-library/jest-dom/vitest";
// globals: false 환경에선 RTL auto-cleanup이 동작하지 않으므로 명시 등록
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
