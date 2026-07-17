import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetAuthForTests,
  ApiError,
  FE_ERROR_CODES,
  hardRedirect,
  isApiError,
  request,
} from "./request";
import {
  clearTokens,
  getAccessToken,
  getAuthSessionId,
  getRefreshToken,
  rotateTokens,
  setTokens,
} from "./tokenStore";

/** fetch 를 지정한 Response 로 스텁하고 호출 기록을 돌려준다 */
function stubFetch(response: Response | Promise<Response>) {
  const mock = vi.fn().mockReturnValue(Promise.resolve(response));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** reject 를 기대하고, 던져진 ApiError 를 타입 안전하게 돌려준다 */
async function catchApiError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e;
    throw new Error(`ApiError 가 아닌 에러: ${String(e)}`, { cause: e });
  }
  throw new Error("에러가 발생하지 않음");
}

/** 응답을 순서대로 돌려주는 fetch 스텁 — 재발급·재시도처럼 다단계 흐름 검증용 */
function stubFetchSeq(...responses: (Response | Error)[]) {
  const mock = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) mock.mockRejectedValueOnce(r);
    else mock.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", mock);
  return mock;
}

const errorResponse = (code: string, status: number) =>
  jsonResponse({ success: false, data: null, error: { code, message: "err" } }, status);

const tokenPairResponse = (at = "at-2", rt = "rt-2") =>
  jsonResponse({ success: true, data: { accessToken: at, refreshToken: rt } });

/** jsdom 은 location.assign 미구현 — 강제 이동은 seam 스파이로 관찰한다 */
const spyRedirect = () => vi.spyOn(hardRedirect, "to").mockImplementation(() => {});

const authHeaderOf = (init: RequestInit) =>
  (init.headers as Record<string, string>)["Authorization"];

const callsTo = (mock: ReturnType<typeof vi.fn>, suffix: string) =>
  mock.mock.calls.filter(([url]) => String(url).endsWith(suffix));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  __resetAuthForTests();
});

describe("request — 엔벨로프 언래핑", () => {
  it("성공 엔벨로프에서 data 만 반환한다", async () => {
    stubFetch(jsonResponse({ success: true, data: { id: 1, name: "홍길동" } }));
    const data = await request<{ id: number; name: string }>("GET", "/api/v1/user");
    expect(data).toEqual({ id: 1, name: "홍길동" });
  });

  it("무내용 성공(ApiResponseVoid)은 null 을 반환한다", async () => {
    stubFetch(jsonResponse({ success: true, data: null }));
    await expect(request<null>("POST", "/api/v1/auth/logout")).resolves.toBeNull();
  });

  it("비즈니스 실패 엔벨로프를 ApiError(code·message·fieldErrors·status)로 변환한다", async () => {
    stubFetch(
      jsonResponse(
        {
          success: false,
          data: null,
          error: {
            code: "A004",
            message: "필수 동의 항목에 모두 동의해야 가입할 수 있습니다.",
            fieldErrors: [{ field: "consents", reason: "required" }],
          },
        },
        400,
      ),
    );
    const err = await catchApiError(request("POST", "/api/v1/auth/signup", { body: {} }));
    expect(err.code).toBe("A004");
    expect(err.message).toBe("필수 동의 항목에 모두 동의해야 가입할 수 있습니다.");
    expect(err.status).toBe(400);
    expect(err.fieldErrors).toEqual([{ field: "consents", reason: "required" }]);
  });
});

describe("request — 계약 위반·네트워크", () => {
  it("비 JSON 응답(프록시 오류 페이지)은 FE_INVALID_RESPONSE 로 변환한다", async () => {
    stubFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.INVALID_RESPONSE);
    expect(err.status).toBe(502);
  });

  it("success 필드가 없는 JSON 은 계약 위반으로 처리한다", async () => {
    stubFetch(jsonResponse({ message: "no envelope" }));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.INVALID_RESPONSE);
  });

  it("비-2xx 인데 success: true 인 응답은 성공으로 처리하지 않는다 (상태줄이 유일 원천)", async () => {
    stubFetch(jsonResponse({ success: true, data: { accessToken: "at" } }, 500));
    const err = await catchApiError(request("POST", "/api/v1/auth/kakao", { body: { code: "x" } }));
    expect(err.code).toBe(FE_ERROR_CODES.INVALID_RESPONSE);
    expect(err.status).toBe(500);
  });

  it("네트워크 실패는 FE_NETWORK(status 0)로 변환한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.NETWORK);
    expect(err.status).toBe(0);
  });

  it("호출자가 중단(abort)한 경우는 ApiError 로 감싸지 않고 전파한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    const err: unknown = await request("GET", "/api/v1/user").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });
});

describe("request — 요청 직렬화", () => {
  it("객체 body 는 JSON 직렬화 + Content-Type 지정", async () => {
    const mock = stubFetch(jsonResponse({ success: true, data: null }));
    await request("PATCH", "/api/v1/user", { body: { name: "김코리" } });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/user");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ name: "김코리" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("FormData body 는 그대로 전송하고 Content-Type 을 지정하지 않는다", async () => {
    const mock = stubFetch(jsonResponse({ success: true, data: null }));
    const form = new FormData();
    form.append("file", new Blob(["pdf"]), "resume.pdf");
    await request("POST", "/api/v1/resumes", { body: form });
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("body 없는 GET 은 Content-Type 없이 전송한다", async () => {
    const mock = stubFetch(jsonResponse({ success: true, data: [] }));
    await request("GET", "/api/v1/resumes");
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("request — 토큰 부착", () => {
  it("보호 요청에 AT 가 있으면 Bearer 를 부착한다", async () => {
    setTokens("at-1", "rt-1");
    const mock = stubFetch(jsonResponse({ success: true, data: null }));
    await request("GET", "/api/v1/user");
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBe("Bearer at-1");
  });

  it("AT 가 없으면 보호 요청에도 Authorization 을 넣지 않는다", async () => {
    const mock = stubFetch(jsonResponse({ success: true, data: null }));
    await request("GET", "/api/v1/user");
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(authHeaderOf(init)).toBeUndefined();
  });

  it("공개 요청은 AT 가 있어도 부착하지 않는다 (stale 토큰의 가입 흐름 오염 방지)", async () => {
    setTokens("at-stale", "rt-stale");
    // Response body 는 1회용 — 호출마다 새로 생성 (제네릭으로 fetch 시그니처만 지정)
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ success: true, data: null })),
    );
    vi.stubGlobal("fetch", mock);
    await request("POST", "/api/v1/auth/signup", { body: {} });
    await request("GET", "/api/v1/consents");
    for (const [, init] of mock.mock.calls as [string, RequestInit][]) {
      expect(authHeaderOf(init)).toBeUndefined();
    }
  });
});

describe("request — 자동 재발급", () => {
  it("보호 요청 401 → 재발급 성공 → 회전 쌍 저장 + 새 AT 로 1회 재시도", async () => {
    setTokens("at-old", "rt-1");
    const mock = stubFetchSeq(
      errorResponse("C005", 401),
      tokenPairResponse("at-2", "rt-2"),
      jsonResponse({ success: true, data: "ok" }),
    );
    await expect(request("GET", "/api/v1/user")).resolves.toBe("ok");

    expect(mock).toHaveBeenCalledTimes(3);
    const [origUrl, origInit] = mock.mock.calls[0] as [string, RequestInit];
    const [reissueUrl, reissueInit] = mock.mock.calls[1] as [string, RequestInit];
    const [retryUrl, retryInit] = mock.mock.calls[2] as [string, RequestInit];
    expect(origUrl).toBe("/api/v1/user");
    expect(authHeaderOf(origInit)).toBe("Bearer at-old");
    expect(reissueUrl).toBe("/api/v1/auth/reissue");
    expect(authHeaderOf(reissueInit)).toBeUndefined(); // RT 가 곧 자격증명 — Bearer 미부착
    expect(reissueInit.body).toBe(JSON.stringify({ refreshToken: "rt-1" }));
    expect(retryUrl).toBe("/api/v1/user");
    expect(authHeaderOf(retryInit)).toBe("Bearer at-2");
    expect(getAccessToken()).toBe("at-2");
    expect(getRefreshToken()).toBe("rt-2");
  });

  it("동시 다발 401 은 재발급을 1회로 단일화한다 (single-flight)", async () => {
    setTokens("at-old", "rt-1");
    const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/reissue")) {
        return Promise.resolve(tokenPairResponse("at-2", "rt-2"));
      }
      const auth = (init?.headers as Record<string, string>)["Authorization"];
      return Promise.resolve(
        auth === "Bearer at-2"
          ? jsonResponse({ success: true, data: "ok" })
          : errorResponse("C005", 401),
      );
    });
    vi.stubGlobal("fetch", mock);

    const results = await Promise.all([
      request("GET", "/api/v1/user"),
      request("GET", "/api/v1/user/consents"),
    ]);
    expect(results).toEqual(["ok", "ok"]);
    expect(callsTo(mock, "/api/v1/auth/reissue")).toHaveLength(1);
  });

  it("불완전·변조 레코드는 세션 없음으로 취급한다 (부분 상태 불가 불변식)", async () => {
    // 단일 JSON 레코드 저장이라 'AT 만 유실' 같은 부분 상태는 존재할 수 없다 —
    // 필드가 빠진 레코드는 통째로 무효(로그아웃 상태)로 읽힌다
    localStorage.setItem("kkori.auth", JSON.stringify({ accessToken: "at-only" }));
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();

    const redirect = spyRedirect();
    const mock = stubFetchSeq(errorResponse("C005", 401));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.SESSION_EXPIRED); // 토큰 전무와 동일 처리
    expect(mock).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("불확실 실패(네트워크)는 동일 RT 로 1회 재시도해 Grace 응답으로 복구한다", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    const mock = stubFetchSeq(
      errorResponse("C005", 401),
      new TypeError("Failed to fetch"), // reissue#1 응답 유실
      tokenPairResponse("at-2", "rt-2"), // reissue#2 — Grace 가 원래 발급쌍 반환
      jsonResponse({ success: true, data: "ok" }),
    );
    await expect(request("GET", "/api/v1/user")).resolves.toBe("ok");

    const reissues = callsTo(mock, "/api/v1/auth/reissue");
    expect(reissues).toHaveLength(2);
    for (const [, init] of reissues as [string, RequestInit][]) {
      expect(init.body).toBe(JSON.stringify({ refreshToken: "rt-1" })); // 두 번 모두 같은 RT
    }
    expect(getRefreshToken()).toBe("rt-2");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("불확실 실패(5xx) 후 정상 응답이면 복구한다", async () => {
    setTokens("at-old", "rt-1");
    stubFetchSeq(
      errorResponse("C005", 401),
      errorResponse("C001", 500),
      tokenPairResponse("at-2", "rt-2"),
      jsonResponse({ success: true, data: "ok" }),
    );
    await expect(request("GET", "/api/v1/user")).resolves.toBe("ok");
    expect(getAccessToken()).toBe("at-2");
  });

  it("재발급 200 인데 토큰 누락 1회 → 재시도 정상 응답이면 복구한다", async () => {
    setTokens("at-old", "rt-1");
    stubFetchSeq(
      errorResponse("C005", 401),
      jsonResponse({ success: true, data: {} }), // 토큰 쌍 누락 — 불확실 실패
      tokenPairResponse("at-2", "rt-2"),
      jsonResponse({ success: true, data: "ok" }),
    );
    await expect(request("GET", "/api/v1/user")).resolves.toBe("ok");
    expect(getRefreshToken()).toBe("rt-2");
  });

  it("재발급의 명시적 401(A007)은 내부 재시도 없이 즉시 실패한다", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    const mock = stubFetchSeq(errorResponse("C005", 401), errorResponse("A007", 401));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe("A007");
    expect(callsTo(mock, "/api/v1/auth/reissue")).toHaveLength(1); // 재시도 금지
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("늦게 도착한 401: 토큰이 이미 교체됐으면 재발급 없이 새 AT 로 재시도만 한다", async () => {
    setTokens("at-old", "rt-1");
    let release401: (() => void) | null = null;
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/reissue")) {
          return Promise.resolve(tokenPairResponse("at-3", "rt-3"));
        }
        const auth = (init?.headers as Record<string, string>)["Authorization"];
        if (auth === "Bearer at-old") {
          // 구 AT 요청의 401 을 보류 — 회전 완료 이후에 도착하는 상황을 재현
          return new Promise<Response>((resolve) => {
            release401 = () => resolve(errorResponse("C005", 401));
          });
        }
        return Promise.resolve(jsonResponse({ success: true, data: "ok" }));
      },
    );
    vi.stubGlobal("fetch", mock);

    const pending = request("GET", "/api/v1/user"); // at-old 로 발사
    await vi.waitFor(() => expect(release401).not.toBeNull());
    // 같은 세션에서 선행 요청·다른 탭이 회전을 마친 상황
    await rotateTokens("at-2", "rt-2", getAuthSessionId()!);
    release401!();

    await expect(pending).resolves.toBe("ok");
    expect(callsTo(mock, "/api/v1/auth/reissue")).toHaveLength(0); // 중복 회전 없음
    const [, retryInit] = mock.mock.calls.at(-1) as [string, RequestInit];
    expect(authHeaderOf(retryInit)).toBe("Bearer at-2"); // 교체된 토큰으로 재시도만
  });

  it("세션 교체(다른 계정 로그인) 후 도착한 401 은 재시도 없이 중단한다", async () => {
    setTokens("at-A", "rt-A");
    const redirect = spyRedirect();
    let release401: (() => void) | null = null;
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          release401 = () => resolve(errorResponse("C005", 401));
        }),
    );
    vi.stubGlobal("fetch", mock);

    const pending = request("GET", "/api/v1/user"); // A 세션으로 발사
    await vi.waitFor(() => expect(release401).not.toBeNull());
    setTokens("at-B", "rt-B"); // 다른 탭에서 계정 B 로 로그인 (새 세션 ID)
    release401!();

    const err = await catchApiError(pending);
    expect(err.code).toBe("C005"); // 원래 401 그대로 전파
    expect(mock).toHaveBeenCalledTimes(1); // 재발급·재시도 없음 — B 자격증명으로 재실행 금지
    expect(getAccessToken()).toBe("at-B"); // B 세션은 보존 (REAUTH 미발동)
    expect(getRefreshToken()).toBe("rt-B");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("세션 제거(로그아웃) 후 도착한 401 도 재시도 없이 중단한다", async () => {
    setTokens("at-A", "rt-A");
    const redirect = spyRedirect();
    let release401: (() => void) | null = null;
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          release401 = () => resolve(errorResponse("C005", 401));
        }),
    );
    vi.stubGlobal("fetch", mock);

    const pending = request("GET", "/api/v1/user");
    await vi.waitFor(() => expect(release401).not.toBeNull());
    clearTokens(); // 다른 탭에서 로그아웃
    release401!();

    const err = await catchApiError(pending);
    expect(err.code).toBe("C005");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("재발급 대기 중 세션이 교체되면 회전 결과를 폐기한다 (B 세션 클로버링 방지)", async () => {
    setTokens("at-A", "rt-A");
    const redirect = spyRedirect();
    let releaseReissue: (() => void) | null = null;
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input) => {
        if (String(input).endsWith("/api/v1/auth/reissue")) {
          return new Promise<Response>((resolve) => {
            releaseReissue = () => resolve(tokenPairResponse("at-A2", "rt-A2"));
          });
        }
        return Promise.resolve(errorResponse("C005", 401));
      },
    );
    vi.stubGlobal("fetch", mock);

    const pending = request("GET", "/api/v1/user"); // 401 → 재발급 진입
    await vi.waitFor(() => expect(releaseReissue).not.toBeNull());
    setTokens("at-B", "rt-B"); // 재발급 대기 중 계정 B 로 로그인
    releaseReissue!();

    const err = await catchApiError(pending);
    expect(err.code).toBe(FE_ERROR_CODES.SESSION_REPLACED);
    expect(getAccessToken()).toBe("at-B"); // A 의 회전 쌍(at-A2)이 B 저장소를 덮지 않음
    expect(getRefreshToken()).toBe("rt-B");
    expect(redirect).not.toHaveBeenCalled(); // 비 terminal — 새 세션 파괴 금지
  });

  it("bodyFactory 는 매 시도 직전에 재평가된다", async () => {
    setTokens("at-old", "rt-1");
    let n = 0;
    const mock = stubFetchSeq(
      errorResponse("C005", 401),
      tokenPairResponse("at-2", "rt-2"),
      jsonResponse({ success: true, data: null }),
    );
    await request("POST", "/api/v1/auth/logout", { bodyFactory: () => ({ v: n++ }) });
    const [, origInit] = mock.mock.calls[0] as [string, RequestInit];
    const [, retryInit] = mock.mock.calls[2] as [string, RequestInit];
    expect(origInit.body).toBe(JSON.stringify({ v: 0 }));
    expect(retryInit.body).toBe(JSON.stringify({ v: 1 })); // 재시도에서 새로 평가
  });
});

describe("request — 강제 재로그인 (REAUTH)", () => {
  it("재발급 실패(A007) 시 동시 대기자가 있어도 세션 정리 + /login 이동은 1회다", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    const mock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/reissue")) {
        return Promise.resolve(errorResponse("A007", 401));
      }
      return Promise.resolve(errorResponse("C005", 401));
    });
    vi.stubGlobal("fetch", mock);

    const results = await Promise.allSettled([
      request("GET", "/api/v1/user"),
      request("GET", "/api/v1/user/consents"),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("재발급 토큰 누락 2연속 → FE_SESSION_EXPIRED terminal", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    stubFetchSeq(
      errorResponse("C005", 401),
      jsonResponse({ success: true, data: {} }),
      jsonResponse({ success: true, data: {} }),
    );
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.SESSION_EXPIRED);
    expect(getAccessToken()).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("토큰이 전무한 보호 요청의 401 은 재발급 시도 없이 terminal 처리한다", async () => {
    const redirect = spyRedirect();
    const mock = stubFetchSeq(errorResponse("C005", 401));
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.SESSION_EXPIRED);
    expect(mock).toHaveBeenCalledTimes(1); // reissue fetch 없음
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("재시도 후에도 401 이면 2차 재발급 없이 REAUTH 처리한다", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    const mock = stubFetchSeq(
      errorResponse("C005", 401),
      tokenPairResponse("at-2", "rt-2"),
      errorResponse("C005", 401),
    );
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe("C005");
    expect(mock).toHaveBeenCalledTimes(3); // 원요청 + reissue + 재시도 — 2차 reissue 금지
    expect(getAccessToken()).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("공개 요청의 401(A005)은 재발급·이동 없이 그대로 전파한다 (가입 흐름 보호)", async () => {
    setTokens("at-stale", "rt-stale");
    const redirect = spyRedirect();
    const mock = stubFetchSeq(errorResponse("A005", 401));
    const err = await catchApiError(request("POST", "/api/v1/auth/signup", { body: {} }));
    expect(err.code).toBe("A005");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe("rt-stale"); // 토큰도 건드리지 않음
  });

  it("silent 정책은 세션만 정리하고 이동하지 않으며, 이동 가드도 점유하지 않는다", async () => {
    const redirect = spyRedirect();
    const mock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(
        url.endsWith("/api/v1/auth/reissue")
          ? errorResponse("A007", 401)
          : errorResponse("C005", 401),
      );
    });
    vi.stubGlobal("fetch", mock);

    setTokens("at-1", "rt-1");
    await expect(request("POST", "/api/v1/auth/logout", { onReauth: "silent" })).rejects.toThrow();
    expect(getAccessToken()).toBeNull(); // 세션 정리는 수행
    expect(redirect).not.toHaveBeenCalled(); // 이동은 안 함

    setTokens("at-1", "rt-1"); // 직후 redirect 정책 요청은 정상적으로 이동해야 함
    await expect(request("GET", "/api/v1/user")).rejects.toThrow();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("재발급 네트워크 실패 2연속은 non-terminal — 토큰을 유지하고 이동하지 않는다", async () => {
    setTokens("at-old", "rt-1");
    const redirect = spyRedirect();
    stubFetchSeq(
      errorResponse("C005", 401),
      new TypeError("Failed to fetch"),
      new TypeError("Failed to fetch"),
    );
    const err = await catchApiError(request("GET", "/api/v1/user"));
    expect(err.code).toBe(FE_ERROR_CODES.NETWORK);
    expect(getAccessToken()).toBe("at-old"); // 일시 장애 — 세션 파괴 금지
    expect(getRefreshToken()).toBe("rt-1");
    expect(redirect).not.toHaveBeenCalled();
  });
});
