/* MyPage 테스트 — 프로필 실데이터 표시와 이름 수정(PATCH /api/v1/user) 연동 검증.
   알림·구독은 fixture 목이라 fetch 에는 사용자 API 만 잡힌다. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { MyPage } from "./MyPage";

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

const userInfo = (name: string) => ({
  id: 1,
  email: "dev@kkori.ai",
  name,
  createdAt: "2026-05-10T09:00:00Z",
});

/** GET /api/v1/user 는 항상 성공, PATCH 는 호출별 결과 큐로 제어한다 */
function stubUserApi(patchResults: (Response | Error)[] = []) {
  let pi = 0;
  const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    (input, init) => {
      const url = String(input);
      if (!url.endsWith("/api/v1/user")) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      if ((init?.method ?? "GET") === "GET") return Promise.resolve(envelope(userInfo("김개발")));
      const result = patchResults[pi++];
      if (!result) return Promise.reject(new Error("unexpected PATCH"));
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const patchCalls = (mock: ReturnType<typeof stubUserApi>) =>
  mock.mock.calls.filter(([, init]) => init?.method === "PATCH") as [string, RequestInit][];

/** 편집 폼 진입 — 프로필 로드 후 수정 버튼 클릭 */
async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await screen.findAllByText("김개발");
  await user.click(screen.getByRole("button", { name: /프로필 수정/ }));
  return screen.getByPlaceholderText("이름을 입력하세요");
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("MyPage — 프로필 실데이터", () => {
  it("내 정보 조회 결과(이름·이메일·가입일)를 표시한다", async () => {
    stubUserApi();
    renderWithProviders(<MyPage />, { route: "/account" });
    expect(await screen.findAllByText("김개발")).not.toHaveLength(0);
    expect(screen.getAllByText("dev@kkori.ai").length).toBeGreaterThan(0);
    expect(screen.getByText("2026.05.10")).toBeInTheDocument();
  });

  it("이름 저장이 PATCH 로 전송되고(공백 제거) 화면이 응답 결과로 갱신된다", async () => {
    const mock = stubUserApi([envelope(userInfo("김수정"))]);
    const user = userEvent.setup();
    renderWithProviders(<MyPage />, { route: "/account" });

    const input = await openEdit(user);
    await user.clear(input);
    await user.type(input, "  김수정  ");
    await user.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findAllByText("김수정")).not.toHaveLength(0);
    expect(await screen.findByText("프로필을 저장했어요")).toBeInTheDocument();
    const [patch] = patchCalls(mock);
    expect(JSON.parse(patch[1].body as string)).toEqual({ name: "김수정" }); // 앞뒤 공백 제거
    // 편집 폼이 닫히고 조회 화면으로 돌아간다
    expect(screen.queryByPlaceholderText("이름을 입력하세요")).toBeNull();
  });

  it("빈 이름(공백만 포함)은 저장 버튼을 비활성화한다", async () => {
    stubUserApi();
    const user = userEvent.setup();
    renderWithProviders(<MyPage />, { route: "/account" });

    const input = await openEdit(user);
    await user.clear(input);
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
  });

  it("저장 실패 시 안내를 보여주고 편집 상태를 유지한다", async () => {
    const mock = stubUserApi([errorEnvelope("C001", 500)]);
    const user = userEvent.setup();
    renderWithProviders(<MyPage />, { route: "/account" });

    const input = await openEdit(user);
    await user.clear(input);
    await user.type(input, "김실패");
    await user.click(screen.getByRole("button", { name: "저장하기" }));

    expect(await screen.findByText(/이름을 저장하지 못했어요/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("이름을 입력하세요")).toBeInTheDocument(); // 폼 유지
    expect(patchCalls(mock)).toHaveLength(1);
    // 표시 이름은 서버 값 그대로 — 실패한 수정이 반영되지 않는다
    expect(screen.getAllByText("김개발").length).toBeGreaterThan(0);
  });
});
