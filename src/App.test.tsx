import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import type { Room } from "livekit-client";
import { renderWithProviders } from "./test/render";
import * as apiClient from "./api/client";
import { discardConnectedRoom, stashConnectedRoom } from "./hooks/useLiveKitRoom";
import { consumePostLoginRedirect } from "./api/tokenStore";
import { kakaoAuthorizeRedirect } from "./utils/kakaoLogin";
import { ROUTE_ACCESS, ROUTES, type NavKey } from "./routes";
import App from "./App";

/* checking 상태는 현재 동기 판정에서 발생하지 않으므로 훅을 오버라이드해 재현한다.
   vi.mock 은 파일 전체에 hoist 되므로, 오버라이드가 없을 땐 실제 구현을 그대로
   통과시켜 일반 가드 테스트를 오염시키지 않는다. 실제 훅은 항상 호출해 훅 순서를
   보존한다. */
const authStatusOverride = vi.hoisted(() => ({ value: null as null | "checking" }));
vi.mock("./hooks/useAuthStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks/useAuthStatus")>();
  return {
    ...actual,
    useAuthStatus: () => {
      const real = actual.useAuthStatus(); // 훅은 무조건 호출 — 렌더 간 순서 불변
      return authStatusOverride.value ?? real;
    },
  };
});

/** 로그인 상태 시드 — tokenStore 의 저장 레코드 형식과 동일 */
function seedLogin(sessionId = "sess-A") {
  localStorage.setItem(
    "kkori.auth",
    JSON.stringify({ accessToken: "at-1", refreshToken: "rt-1", sessionId }),
  );
}

/** 다른 탭의 저장소 변경 통지 — storage 이벤트는 같은 탭 쓰기에선 발생하지 않으므로
    테스트가 직접 디스패치한다 */
function crossTabAuthChange(mutate: () => void) {
  act(() => {
    mutate();
    window.dispatchEvent(new StorageEvent("storage", { key: "kkori.auth" }));
  });
}

const pathOf = (key: NavKey) => (key === "reportDetail" ? "/reports/1" : ROUTES[key]);

const protectedPaths = (Object.keys(ROUTE_ACCESS) as NavKey[])
  .filter((key) => ROUTE_ACCESS[key] === "protected")
  .map(pathOf);

/* 화면 식별 텍스트 */
const LOGIN_HEADING = "시작하기"; // AuthPage h2
const DASH_TEXT = /이어서 연습해볼까요/; // DashboardPage 서브 카피

beforeEach(() => {
  // jsdom 의 scrollTo 는 not-implemented 로그를 남긴다 — ScrollToTop 용 무해 스텁
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  authStatusOverride.value = null;
  discardConnectedRoom(); // 테스트가 보관해 둔 면접 연결 격리
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("라우팅 가드 — 미로그인 (ROUTE_ACCESS 순회로 그룹핑 드리프트 봉쇄)", () => {
  it.each(protectedPaths)("보호 라우트 %s 진입 시 로그인 화면으로 보낸다", async (path) => {
    renderWithProviders(<App />, { route: path });
    expect(await screen.findByText(LOGIN_HEADING)).toBeInTheDocument();
  });

  it("랜딩(/)은 비로그인 접근을 허용한다", async () => {
    renderWithProviders(<App />, { route: ROUTES.landing });
    // h1 은 <br/> 로 나뉘어 접근성 이름에 공백 없이 이어진다 — 앞 구절로만 매칭
    expect(await screen.findByRole("heading", { name: /이력서로 시작하는/ })).toBeInTheDocument();
  });

  it("예시 리포트(/sample)는 비로그인 접근을 허용한다", async () => {
    renderWithProviders(<App />, { route: ROUTES.sample });
    expect(await screen.findByText("예시 리포트")).toBeInTheDocument();
  });
});

describe("라우팅 가드 — 로그인 상태", () => {
  it("/login 접근 시 대시보드로 보낸다", async () => {
    seedLogin();
    renderWithProviders(<App />, { route: ROUTES.auth });
    expect(await screen.findByText(DASH_TEXT)).toBeInTheDocument();
  });

  it("/signup 접근 시 대시보드로 보낸다", async () => {
    seedLogin();
    renderWithProviders(<App />, { route: ROUTES.consent });
    expect(await screen.findByText(DASH_TEXT)).toBeInTheDocument();
  });

  it("보호 라우트는 정상 렌더한다", async () => {
    seedLogin();
    renderWithProviders(<App />, { route: ROUTES.dash });
    expect(await screen.findByText(DASH_TEXT)).toBeInTheDocument();
  });
});

describe("라우팅 가드 — 원 목적지 전달", () => {
  it("보호 라우트에서 튕겨난 뒤 카카오 클릭까지 하면 원 경로(query 포함)가 저장된다", async () => {
    // 가드(state.from 전달) → AuthPage(클릭 시 저장) 전체 연계 —
    // RequireAuth 가 state 전달을 빠뜨리면 이 테스트가 잡는다
    vi.stubEnv("VITE_KAKAO_CLIENT_ID", "test-client-id");
    const redirect = vi.spyOn(kakaoAuthorizeRedirect, "to").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: "/reports/1?tab=score" });
    expect(await screen.findByText(LOGIN_HEADING)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /카카오로 계속하기/ }));

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(consumePostLoginRedirect()).toBe("/reports/1?tab=score");
  });
});

describe("탭 간 세션 반응 (storage 이벤트)", () => {
  it("다른 탭 로그아웃(A→null): 즉시 로그인 화면으로 전환하고 Query 캐시를 1회 비운다", async () => {
    seedLogin("sess-A");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(queryClient, "clear");
    renderWithProviders(<App />, { route: ROUTES.dash, queryClient });
    await screen.findByText(DASH_TEXT);

    queryClient.setQueryData(["seed"], "previous-account-data");
    expect(clearSpy).not.toHaveBeenCalled(); // 최초 마운트는 전이가 아니다

    crossTabAuthChange(() => localStorage.removeItem("kkori.auth"));

    expect(await screen.findByText(LOGIN_HEADING)).toBeInTheDocument();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["seed"])).toBeUndefined(); // 이전 계정 데이터 제거
  });

  it("A→null→B: 로그아웃에서만 1회 비우고, 로그인(null→B)은 콜백 쿼리를 보존한다", async () => {
    seedLogin("sess-A");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(queryClient, "clear");
    renderWithProviders(<App />, { route: ROUTES.dash, queryClient });
    await screen.findByText(DASH_TEXT);

    crossTabAuthChange(() => localStorage.removeItem("kkori.auth")); // A → null
    await screen.findByText(LOGIN_HEADING);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // 이 탭이 카카오 콜백 처리 중이라고 가정 — 일회용 code 교환 쿼리가 살아 있다
    queryClient.setQueryData(["auth", "kakaoLogin", "code-1"], { isNewUser: true });

    crossTabAuthChange(() => seedLogin("sess-B")); // null → B (다른 탭 로그인)

    expect(await screen.findByText(DASH_TEXT)).toBeInTheDocument(); // 게스트 가드가 대시보드로
    expect(clearSpy).toHaveBeenCalledTimes(1); // 로그인 전이는 비우지 않는다
    expect(queryClient.getQueryData(["auth", "kakaoLogin", "code-1"])).toEqual({
      isNewUser: true,
    }); // code 재전송 위험 차단
  });

  it("계정 교체(A→B): 보호 화면이 이전 계정 캐시를 재사용하지 않는다 (세션 전용 클라이언트)", async () => {
    const profileSpy = vi.spyOn(apiClient, "fetchProfile");
    seedLogin("sess-A");
    renderWithProviders(<App />, { route: ROUTES.dash });
    await screen.findByText(DASH_TEXT);
    await waitFor(() => expect(profileSpy).toHaveBeenCalledTimes(1));

    crossTabAuthChange(() => seedLogin("sess-B"));

    await screen.findByText(DASH_TEXT);
    // 세션 경계 remount → 새 클라이언트가 다시 조회 — A 캐시가 B 화면에 렌더될 수 없다
    await waitFor(() => expect(profileSpy).toHaveBeenCalledTimes(2));
  });

  it("계정 교체(A→B): 페이지 로컬 상태(모달 등)가 초기화된다 (세션 경계 remount)", async () => {
    seedLogin("sess-A");
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: ROUTES.dash });
    await screen.findByText(DASH_TEXT);

    await user.click(await screen.findByRole("button", { name: /이력서 변경/ }));
    expect(
      await screen.findByRole("dialog", { name: "바로 시작에 사용할 이력서" }),
    ).toBeInTheDocument();

    crossTabAuthChange(() => seedLogin("sess-B"));

    await screen.findByText(DASH_TEXT);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // A 가 열어둔 모달 미승계
  });

  it("로그아웃·계정 교체 전이에서 면접 세션 저장값을 제거한다", async () => {
    seedLogin("sess-A");
    sessionStorage.setItem(
      "hbb.interview.session",
      JSON.stringify({
        url: "wss://test.example",
        token: "jwt-token",
        room: "room-1",
        authSessionId: "sess-A",
      }),
    );
    renderWithProviders(<App />, { route: ROUTES.dash });
    await screen.findByText(DASH_TEXT);

    // 이전 계정의 유효한 LiveKit 토큰이 다음 사용자에게 남으면 안 된다
    crossTabAuthChange(() => seedLogin("sess-B"));
    await screen.findByText(DASH_TEXT);
    await waitFor(() => {
      expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
    });
  });

  it("계정 교체 전이에서 보관된 면접 연결(핸드오프)도 폐기한다", async () => {
    seedLogin("sess-A");
    const stashedRoom = { disconnect: vi.fn() } as unknown as Room;
    stashConnectedRoom(stashedRoom, {
      url: "wss://test.example",
      token: "jwt-token",
      authSessionId: "sess-A",
    });
    renderWithProviders(<App />, { route: ROUTES.dash });
    await screen.findByText(DASH_TEXT);

    crossTabAuthChange(() => seedLogin("sess-B"));
    await screen.findByText(DASH_TEXT);
    await waitFor(() => {
      expect(stashedRoom.disconnect).toHaveBeenCalled();
    });
  });

  it("다른 탭 계정 교체(A→B): 루트 클라이언트도 비운다 (게스트 쿼리 위생)", async () => {
    seedLogin("sess-A");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(queryClient, "clear");
    renderWithProviders(<App />, { route: ROUTES.dash, queryClient });
    await screen.findByText(DASH_TEXT);
    queryClient.setQueryData(["seed"], "account-A-data");

    crossTabAuthChange(() => seedLogin("sess-B"));

    await screen.findByText(DASH_TEXT); // 보호 화면은 유지 (새 세션으로)
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["seed"])).toBeUndefined();
  });
});

describe("checking 차단 (비동기 판정 대비)", () => {
  it.each([
    ["보호", ROUTES.dash],
    ["게스트(로그인)", ROUTES.auth],
    ["게스트(가입)", ROUTES.consent],
  ])("%s 라우트는 checking 동안 로더만 표시한다", (_label, route) => {
    authStatusOverride.value = "checking";
    renderWithProviders(<App />, { route });
    expect(screen.getByRole("status", { name: "인증 상태 확인 중" })).toBeInTheDocument();
    expect(screen.queryByText(LOGIN_HEADING)).not.toBeInTheDocument(); // OAuth 시작 차단
    expect(screen.queryByText(DASH_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(/약관/)).not.toBeInTheDocument(); // 가입 화면 차단
  });
});
