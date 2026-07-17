import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { consumePostLoginRedirect, peekOauthState, setPostLoginRedirect } from "../api/tokenStore";
import { kakaoAuthorizeRedirect } from "../utils/kakaoLogin";
import { AuthPage } from "./AuthPage";

/* jsdom 은 location.assign 미구현 — 인가 이동은 seam(kakaoAuthorizeRedirect.to)을 스파이 */
const spyAuthorize = () => vi.spyOn(kakaoAuthorizeRedirect, "to").mockImplementation(() => {});

const kakaoButton = () => screen.getByRole("button", { name: /카카오로 계속하기/ });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("AuthPage — 카카오 인가 시작", () => {
  it("클릭 시 state 를 발급하고 인가 URL 로 이동한다", async () => {
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "test-client-id");
    const redirect = spyAuthorize();
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />, { route: "/login" });

    await user.click(kakaoButton());

    expect(redirect).toHaveBeenCalledTimes(1);
    const url = new URL(redirect.mock.calls[0][0]);
    expect(url.origin).toBe("https://kauth.kakao.com");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${window.location.origin}/auth/kakao/callback`,
    );
    expect(url.searchParams.get("state")).toBe(peekOauthState()); // CSRF 대조용 세션 저장값
  });

  it("키 미설정이면 버튼이 비활성화되고 안내가 표시된다 (렌더 시 환경변수 평가)", () => {
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "");
    renderWithProviders(<AuthPage />, { route: "/login" });
    expect(kakaoButton()).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("AuthPage — 원 목적지 저장 (로그인 후 복귀)", () => {
  it("가드가 전달한 state.from 을 클릭 시점에 저장한다", async () => {
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "test-client-id");
    spyAuthorize();
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />, {
      route: { pathname: "/login", state: { from: "/reports?sort=latest" } },
    });

    await user.click(kakaoButton());
    expect(consumePostLoginRedirect()).toBe("/reports?sort=latest");
  });

  it("state.from 이 없으면 기존 저장값을 보존한다 (재인증 경유 목적지 유지)", async () => {
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "test-client-id");
    spyAuthorize();
    setPostLoginRedirect("/resumes"); // request.ts 재인증이 저장해 둔 상황
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />, { route: "/login" });

    await user.click(kakaoButton());
    expect(consumePostLoginRedirect()).toBe("/resumes");
  });

  it("state.from 이 문자열이 아니면 무시한다 (history state 는 임의 값 가능)", async () => {
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "test-client-id");
    spyAuthorize();
    const user = userEvent.setup();
    renderWithProviders(<AuthPage />, {
      route: { pathname: "/login", state: { from: 42 } },
    });

    await user.click(kakaoButton());
    expect(consumePostLoginRedirect()).toBeNull();
  });
});
