import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router";
import { renderWithProviders } from "../test/render";
import * as tokenStore from "../api/tokenStore";
import {
  createOauthState,
  getAccessToken,
  getRefreshToken,
  getSignupSession,
  peekOauthState,
  POST_LOGIN_REDIRECT_TTL_MS,
  setPostLoginRedirect,
} from "../api/tokenStore";
import { KakaoCallbackPage } from "./KakaoCallbackPage";

const envelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errorEnvelope = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** 현재 라우터 search 를 노출하는 프로브 (URL 정리 검증용) */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc-search">{loc.search}</div>;
}

function renderCallback(route: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/auth/kakao/callback"
        element={
          <>
            <KakaoCallbackPage />
            <LocationProbe />
          </>
        }
      />
      <Route path="/dashboard" element={<div>대시보드-도착</div>} />
      <Route path="/signup" element={<div>동의화면-도착</div>} />
      <Route path="/login" element={<div>로그인화면-도착</div>} />
      <Route
        path="/reports"
        element={
          <>
            <div>리포트-도착</div>
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

/** 정상 플로우 세팅 — 인가 시작 시점처럼 state 를 세션에 만들고 콜백 URL 을 돌려준다 */
function validCallbackRoute(code: string) {
  const state = createOauthState();
  return `/auth/kakao/callback?code=${code}&state=${state}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("KakaoCallbackPage — 판정 분기", () => {
  it("기존 유저: 토큰을 저장하고 대시보드로 이동한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-123",
          refreshToken: "rt-456",
        }),
      ),
    );
    renderCallback(validCallbackRoute("valid-code"));
    expect(await screen.findByText("대시보드-도착")).toBeInTheDocument();
    expect(getAccessToken()).toBe("at-123");
    expect(getRefreshToken()).toBe("rt-456");
  });

  it("토큰 저장이 실패하면 무한 로딩 대신 로그인 화면으로 복귀한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-123",
          refreshToken: "rt-456",
        }),
      ),
    );
    vi.spyOn(tokenStore, "setTokens").mockRejectedValueOnce(new Error("quota exceeded"));
    renderCallback(validCallbackRoute("valid-code"));
    expect(await screen.findByText("로그인화면-도착")).toBeInTheDocument();
  });

  it("신규 유저: signupToken 을 보관하고 동의 화면으로 이동한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(envelope({ isNewUser: true, signupToken: "st-789" })),
    );
    renderCallback(validCallbackRoute("valid-code"));
    expect(await screen.findByText("동의화면-도착")).toBeInTheDocument();
    expect(getSignupSession()).toEqual({ signupToken: "st-789", isRestored: false });
    expect(getAccessToken()).toBeNull();
  });

  it("복구 대상: isRestored 플래그와 함께 동의 화면으로 이동한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          envelope({ isNewUser: false, isRestored: true, signupToken: "st-restore" }),
        ),
    );
    renderCallback(validCallbackRoute("valid-code"));
    expect(await screen.findByText("동의화면-도착")).toBeInTheDocument();
    expect(getSignupSession()).toEqual({ signupToken: "st-restore", isRestored: true });
  });

  it("code 는 한 번만 교환한다 (StrictMode 이중 마운트 방어)", async () => {
    const mock = vi.fn().mockResolvedValue(envelope({ isNewUser: true, signupToken: "st-once" }));
    vi.stubGlobal("fetch", mock);
    renderCallback(validCallbackRoute("valid-code"));
    await screen.findByText("동의화면-도착");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("로그인 성공 처리도 1회만 수행한다 (setTokens 중복 호출 방지)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-once",
          refreshToken: "rt-once",
        }),
      ),
    );
    const setTokensSpy = vi.spyOn(tokenStore, "setTokens");
    renderCallback(validCallbackRoute("valid-code"));
    await screen.findByText("대시보드-도착");
    expect(setTokensSpy).toHaveBeenCalledTimes(1); // 재호출은 세션 ID 를 갈아치운다
  });
});

describe("KakaoCallbackPage — 원 목적지 복귀", () => {
  it("저장된 원 목적지가 있으면 대시보드 대신 그 경로로 복귀한다 (query 보존, 1회 소비)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-123",
          refreshToken: "rt-456",
        }),
      ),
    );
    setPostLoginRedirect("/reports?sort=latest");
    renderCallback(validCallbackRoute("valid-code"));

    expect(await screen.findByText("리포트-도착")).toBeInTheDocument();
    expect(screen.getByTestId("loc-search")).toHaveTextContent("?sort=latest");
    expect(sessionStorage.getItem("kkori.postLoginRedirect")).toBeNull(); // 소비됨
  });

  it("만료된 원 목적지(TTL 초과)는 폐기하고 대시보드로 폴백한다", async () => {
    setPostLoginRedirect("/reports?sort=latest"); // 실제 시각으로 저장
    // 소비 시점만 TTL 초과 이후로 이동 — 경계 자체는 tokenStore.test 가 고정
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + POST_LOGIN_REDIRECT_TTL_MS + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-late",
          refreshToken: "rt-late",
        }),
      ),
    );
    renderCallback(validCallbackRoute("valid-code"));

    expect(await screen.findByText("대시보드-도착")).toBeInTheDocument(); // 묵은 목적지 미사용
    expect(sessionStorage.getItem("kkori.postLoginRedirect")).toBeNull(); // 폐기됨
  });

  it("교환 실패 시 저장값을 유지한다 — TTL 내 재시도가 성공하면 복귀된다", async () => {
    setPostLoginRedirect("/reports?sort=latest");
    // 1차 시도: 교환 실패 — 저장값은 소비되지 않는다
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorEnvelope("A002", "카카오 인증에 실패했습니다.", 401)),
    );
    const first = renderCallback(validCallbackRoute("expired-code"));
    await screen.findByText("로그인에 실패했어요");
    expect(sessionStorage.getItem("kkori.postLoginRedirect")).not.toBeNull();
    first.unmount();

    // 재시도: 새 state·code 로 성공 — 유지된 원 목적지로 복귀하고 1회 소비된다
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        envelope({
          isNewUser: false,
          isRestored: false,
          accessToken: "at-retry",
          refreshToken: "rt-retry",
        }),
      ),
    );
    renderCallback(validCallbackRoute("fresh-code"));
    expect(await screen.findByText("리포트-도착")).toBeInTheDocument();
    expect(sessionStorage.getItem("kkori.postLoginRedirect")).toBeNull();
  });
});

describe("KakaoCallbackPage — state 검증 (Login CSRF 방어)", () => {
  it("state 가 세션 저장값과 다르면 교환 없이 실패 처리한다", () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    createOauthState(); // 피해자 세션의 state
    renderCallback("/auth/kakao/callback?code=attacker-code&state=attacker-state");
    expect(screen.getByText("로그인에 실패했어요")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("세션에 state 가 없으면(공격자 URL 직접 진입) 교환 없이 실패 처리한다", () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    renderCallback("/auth/kakao/callback?code=attacker-code&state=whatever");
    expect(screen.getByText("로그인에 실패했어요")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("검증 후 state 는 즉시 폐기된다 (1회용)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(envelope({ isNewUser: true, signupToken: "st-1" })),
    );
    renderCallback(validCallbackRoute("valid-code"));
    await screen.findByText("동의화면-도착");
    expect(peekOauthState()).toBeNull();
  });
});

describe("KakaoCallbackPage — code 잔류 방지", () => {
  it("실패해도 code·state 를 URL 에서 즉시 제거한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorEnvelope("A002", "카카오 인증에 실패했습니다.", 401)),
    );
    renderCallback(validCallbackRoute("one-time-code"));
    await screen.findByText("로그인에 실패했어요");
    expect(screen.getByTestId("loc-search")).toHaveTextContent(/^$/);
  });
});

describe("KakaoCallbackPage — 실패 처리", () => {
  it("카카오 인증 실패(A002) 시 서버 메시지와 재시도 버튼을 보여준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          errorEnvelope("A002", "카카오 인증에 실패했습니다. 다시 로그인해 주세요.", 401),
        ),
    );
    renderCallback(validCallbackRoute("expired-code"));
    expect(await screen.findByText("로그인에 실패했어요")).toBeInTheDocument();
    expect(
      screen.getByText("카카오 인증에 실패했습니다. 다시 로그인해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 로그인하기" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("code 없이 접근하면 교환 시도 없이 실패 안내를 보여준다", () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    renderCallback("/auth/kakao/callback");
    expect(screen.getByText("로그인에 실패했어요")).toBeInTheDocument();
    expect(screen.getByText("잘못된 접근이에요. 다시 로그인해 주세요.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("카카오에서 취소(error 파라미터)하고 돌아오면 취소 안내를 보여준다", () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    renderCallback("/auth/kakao/callback?error=access_denied");
    expect(screen.getByText("카카오 로그인이 취소되었어요.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });
});
