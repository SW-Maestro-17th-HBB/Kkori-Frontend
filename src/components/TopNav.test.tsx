import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../test/render";
import { LOGOUT_TIMEOUT } from "../api/hooks";
import { __resetAuthForTests } from "../api/request";
import {
  getAccessToken,
  getRefreshToken,
  getSignupSession,
  setSignupSession,
  setTokens,
} from "../api/tokenStore";
import { TopNav } from "./TopNav";

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorEnvelope = (code: string, status: number) =>
  new Response(JSON.stringify({ success: false, data: null, error: { code, message: "err" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const tokenPair = (at: string, rt: string) => envelope({ accessToken: at, refreshToken: rt });

/** 내 정보(GET /api/v1/user) 성공 응답 — 아바타 버튼 이름(홍길동) 렌더에 필요 */
const userInfo = () =>
  envelope({ id: 1, email: "hong@example.com", name: "홍길동", createdAt: "2026-05-10T00:00:00Z" });

/** URL 별 순차 응답 스텁 — 알림은 fixture 목이라 fetch 에는 인증·프로필 API 만 잡힌다 */
function stubApi({
  logout = [],
  reissue = [],
}: {
  logout?: (Response | Error)[];
  reissue?: (Response | Error)[];
} = {}) {
  let li = 0;
  let ri = 0;
  const next = (arr: (Response | Error)[], i: number, url: string) => {
    const r = arr[i];
    if (!r) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/user")) return Promise.resolve(userInfo());
      if (url.endsWith("/api/v1/auth/logout")) return next(logout, li++, url);
      if (url.endsWith("/api/v1/auth/reissue")) return next(reissue, ri++, url);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    },
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const callsTo = (mock: ReturnType<typeof stubApi>, suffix: string) =>
  mock.mock.calls.filter(([url]) => String(url).endsWith(suffix)) as [string, RequestInit][];

const bodyOf = (call: [string, RequestInit]) => JSON.parse(call[1].body as string) as unknown;

/** 랜딩 sink 겸 프로브 — 로그아웃 후 쿼리 캐시가 비워졌는지 관찰 */
function LandingProbe() {
  const queryClient = useQueryClient();
  return <div>랜딩-도착:{queryClient.getQueryCache().getAll().length}</div>;
}

function renderTopNav() {
  return renderWithProviders(
    <Routes>
      <Route path="/top" element={<TopNav active={null} />} />
      <Route path="/" element={<LandingProbe />} />
    </Routes>,
    { route: "/top" },
  );
}

/** 프로필 로드(fixture) 후 아바타 메뉴를 열고 로그아웃을 클릭한다 */
async function clickLogout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /홍길동/ }));
  await user.click(screen.getByRole("button", { name: /로그아웃/ }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  __resetAuthForTests();
});

describe("TopNav — 로그아웃", () => {
  it("서버 RT 폐기 후 로컬 토큰·가입 세션·쿼리 캐시를 정리하고 랜딩으로 이동한다", async () => {
    await setTokens("at-1", "rt-1");
    setSignupSession("st-leftover", false); // 이전 가입 흐름의 잔존 임시 인증 정보
    const mock = stubApi({ logout: [envelope(null)] });
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);

    expect(await screen.findByText("랜딩-도착:0")).toBeInTheDocument(); // 캐시도 비워짐
    const [call] = callsTo(mock, "/api/v1/auth/logout");
    expect((call[1].headers as Record<string, string>)["Authorization"]).toBe("Bearer at-1");
    expect(bodyOf(call)).toEqual({ refreshToken: "rt-1" });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getSignupSession()).toBeNull(); // 가입 세션도 함께 폐기
  });

  it("만료 AT: 재발급 후 재시도가 회전된 새 RT 를 전송해 서버측 폐기를 완성한다", async () => {
    await setTokens("at-old", "rt-1");
    const mock = stubApi({
      logout: [errorEnvelope("C005", 401), envelope(null)],
      reissue: [tokenPair("at-2", "rt-2")],
    });
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);
    await screen.findByText(/랜딩-도착/);

    const logoutCalls = callsTo(mock, "/api/v1/auth/logout");
    expect(logoutCalls).toHaveLength(2);
    expect(bodyOf(logoutCalls[0])).toEqual({ refreshToken: "rt-1" }); // 최초 — 구 RT
    expect(bodyOf(logoutCalls[1])).toEqual({ refreshToken: "rt-2" }); // 재시도 — 회전된 새 RT
    expect((logoutCalls[1][1].headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer at-2",
    );
    expect(getRefreshToken()).toBeNull();
  });

  it("재발급 응답 유실: 동일 RT 재시도(Grace)로 복구한 뒤 새 RT 를 폐기한다", async () => {
    await setTokens("at-old", "rt-1");
    const mock = stubApi({
      logout: [errorEnvelope("C005", 401), envelope(null)],
      reissue: [new TypeError("Failed to fetch"), tokenPair("at-2", "rt-2")],
    });
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);
    await screen.findByText(/랜딩-도착/);

    const reissueCalls = callsTo(mock, "/api/v1/auth/reissue");
    expect(reissueCalls).toHaveLength(2);
    expect(bodyOf(reissueCalls[0])).toEqual({ refreshToken: "rt-1" }); // 두 번 모두
    expect(bodyOf(reissueCalls[1])).toEqual({ refreshToken: "rt-1" }); // 같은 RT (Grace 계약)
    const logoutCalls = callsTo(mock, "/api/v1/auth/logout");
    expect(bodyOf(logoutCalls[1])).toEqual({ refreshToken: "rt-2" }); // 최종 폐기는 새 RT
    expect(getAccessToken()).toBeNull();
  });

  it("서버 폐기가 실패(500)해도 로컬 정리 후 랜딩으로 이동한다 (멱등 계약)", async () => {
    await setTokens("at-1", "rt-1");
    stubApi({ logout: [errorEnvelope("C001", 500)] });
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);

    expect(await screen.findByText(/랜딩-도착/)).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("로그아웃 요청 대기 중 다른 계정이 로그인하면 그 세션을 지우지 않는다", async () => {
    await setTokens("at-A", "rt-A");
    let releaseLogout: (() => void) | null = null;
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input) => {
        if (String(input).endsWith("/api/v1/user")) return Promise.resolve(userInfo());
        if (String(input).endsWith("/api/v1/auth/logout")) {
          return new Promise<Response>((resolve) => {
            releaseLogout = () => resolve(envelope(null));
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
      },
    );
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);
    await vi.waitFor(() => expect(releaseLogout).not.toBeNull());
    await setTokens("at-B", "rt-B"); // 다른 탭에서 계정 B 로 로그인
    releaseLogout!();

    await screen.findByText(/랜딩-도착/);
    expect(getAccessToken()).toBe("at-B"); // B 세션 보존 — 조건부 삭제
    expect(getRefreshToken()).toBe("rt-B");
  });

  it("로그아웃 진행 중에는 버튼이 잠기고 진행 문구를 보여준다", async () => {
    await setTokens("at-1", "rt-1");
    // 로그아웃 응답이 오지 않는 상태 유지 — pending UI 관찰 (프로필은 즉시 성공)
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input) =>
        String(input).endsWith("/api/v1/user")
          ? Promise.resolve(userInfo())
          : new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);

    const pending = await screen.findByRole("button", { name: /로그아웃 중/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
  });

  it("서버 응답이 없으면 시간 초과 후 로컬 로그아웃을 완료한다", async () => {
    await setTokens("at-1", "rt-1");
    let aborted = false;
    // 로그아웃만 영원히 응답하지 않되 abort 신호에는 반응하는 fetch — 타임아웃 동작 검증
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input, init) =>
        String(input).endsWith("/api/v1/user")
          ? Promise.resolve(userInfo())
          : new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              });
            }),
    );
    vi.stubGlobal("fetch", mock);
    LOGOUT_TIMEOUT.ms = 30; // seam — 상한을 줄여 실타이머로 검증
    try {
      const user = userEvent.setup();
      renderTopNav();

      await clickLogout(user);

      expect(await screen.findByText(/랜딩-도착/)).toBeInTheDocument();
      expect(aborted).toBe(true); // 상한 경과로 요청이 끊겼고
      expect(getAccessToken()).toBeNull(); // 로컬 로그아웃은 완료됐다
      expect(getRefreshToken()).toBeNull();
    } finally {
      LOGOUT_TIMEOUT.ms = 5000;
    }
  });

  it("RT 가 없으면 인증 API 호출 없이 로컬 정리만 하고 랜딩으로 이동한다", async () => {
    const mock = stubApi();
    const user = userEvent.setup();
    renderTopNav();

    await clickLogout(user);

    expect(await screen.findByText(/랜딩-도착/)).toBeInTheDocument();
    // 프로필 조회(GET /api/v1/user)는 렌더에 필요해 발생한다 — 인증 API 만 없어야 한다
    expect(callsTo(mock, "/api/v1/auth/logout")).toHaveLength(0);
    expect(callsTo(mock, "/api/v1/auth/reissue")).toHaveLength(0);
  });
});
