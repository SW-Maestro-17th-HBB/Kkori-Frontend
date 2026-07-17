import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, FE_ERROR_CODES, isApiError, request } from "./request";

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

afterEach(() => {
  vi.unstubAllGlobals();
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
