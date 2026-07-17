import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../test/render";
import {
  getAccessToken,
  getRefreshToken,
  getSignupSession,
  setSignupSession,
} from "../api/tokenStore";
import { ConsentPage } from "./ConsentPage";

/* 실존 문안 자산은 v1 뿐이라, U005(개정) 플로우 검증용 v2 문안을 테스트에서만 주입.
   나머지는 실제 모듈 그대로 — v1 만 쓰는 테스트에는 영향 없음 */
vi.mock("./consentCopy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./consentCopy")>();
  return {
    ...actual,
    CONSENT_COPY: {
      ...actual.CONSENT_COPY,
      privacy: {
        ...actual.CONSENT_COPY.privacy,
        2: { title: "개인정보 수집·이용 (v2)", body: "개정된 개인정보 v2 본문" },
      },
    },
  };
});

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorEnvelope = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CATALOG_V1 = {
  consents: [
    { type: "privacy", required: true, version: 1 },
    { type: "audio_usage", required: true, version: 1 },
    { type: "resume_usage", required: true, version: 1 },
    { type: "marketing", required: false, version: 1 },
  ],
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

/** URL·메서드로 라우팅하는 fetch 스텁 — Response 는 1회용이라 핸들러가 매번 새로 만든다 */
function stubApi({
  catalog = () => envelope(CATALOG_V1),
  signup = () => errorEnvelope("C001", "서버 내부 오류가 발생했습니다.", 500),
}: { catalog?: Handler; signup?: Handler } = {}) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/v1/consents") && method === "GET") return Promise.resolve(catalog(init));
    if (url.endsWith("/api/v1/auth/signup") && method === "POST") {
      return Promise.resolve(signup(init));
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function signupCalls(mock: ReturnType<typeof stubApi>) {
  return mock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/auth/signup"));
}

function renderConsent() {
  return renderWithProviders(
    <Routes>
      <Route path="/signup" element={<ConsentPage />} />
      <Route path="/dashboard" element={<div>대시보드-도착</div>} />
      <Route path="/login" element={<div>로그인화면-도착</div>} />
    </Routes>,
    { route: "/signup" },
  );
}

const REQUIRED_TITLES = ["개인정보 수집·이용", "음성 데이터 활용", "이력서 자료 활용"];

async function agreeRequired(user: ReturnType<typeof userEvent.setup>) {
  for (const title of REQUIRED_TITLES) {
    await user.click(await screen.findByRole("button", { name: title }));
  }
}

const cta = () => screen.getByRole("button", { name: "동의하고 시작하기" });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("ConsentPage — 진입 가드", () => {
  it("가입 세션이 없으면 카탈로그 조회 없이 로그인으로 보낸다", () => {
    const mock = stubApi();
    renderConsent();
    expect(screen.getByText("로그인화면-도착")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("ConsentPage — 카탈로그 렌더", () => {
  it("서버 카탈로그로 항목을 렌더하고 캐시를 우회해 조회한다", async () => {
    setSignupSession("st-1", false);
    const mock = stubApi();
    renderConsent();

    for (const title of REQUIRED_TITLES) {
      expect(await screen.findByRole("button", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "마케팅 정보 수신" })).toBeInTheDocument();
    expect(screen.getAllByText("필수")).toHaveLength(3);
    expect(screen.getAllByText("선택")).toHaveLength(1);
    const getCall = mock.mock.calls.find(([url]) => String(url).endsWith("/api/v1/consents"));
    expect((getCall![1] as RequestInit).cache).toBe("no-store");
  });

  it("모든 체크는 해제 상태로 시작한다 (사전 체크된 동의 금지)", async () => {
    setSignupSession("st-1", false);
    stubApi();
    renderConsent();
    expect(await screen.findByRole("button", { name: "개인정보 수집·이용" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(cta()).toBeDisabled();
  });
});

describe("ConsentPage — 동의 게이팅", () => {
  it("필수 3종을 모두 체크해야 제출이 활성화된다 (마케팅 제외)", async () => {
    setSignupSession("st-1", false);
    stubApi();
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    expect(cta()).toBeEnabled();
    expect(screen.getByRole("button", { name: "마케팅 정보 수신" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.queryByText("필수 항목에 모두 동의해야 시작할 수 있어요."),
    ).not.toBeInTheDocument();
  });

  it("전체 동의를 토글하면 선택 항목까지 모두 체크/해제된다", async () => {
    setSignupSession("st-1", false);
    stubApi();
    const user = userEvent.setup();
    renderConsent();

    const allToggle = await screen.findByRole("button", { name: /약관 전체 동의/ });
    await user.click(allToggle);
    expect(screen.getByRole("button", { name: "마케팅 정보 수신" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(cta()).toBeEnabled();

    await user.click(allToggle);
    expect(cta()).toBeDisabled();
  });
});

describe("ConsentPage — 가입 제출", () => {
  it("성공: 카탈로그 버전을 반향해 제출하고 토큰 저장 후 대시보드로 이동한다", async () => {
    setSignupSession("st-1", false);
    const mock = stubApi({
      signup: () => envelope({ accessToken: "at-1", refreshToken: "rt-1" }, 201),
    });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(await screen.findByText("대시보드-도착")).toBeInTheDocument();
    const body = JSON.parse((signupCalls(mock)[0][1] as RequestInit).body as string);
    expect(body).toStrictEqual({
      signupToken: "st-1",
      consents: [
        { type: "privacy", agreed: true, version: 1 },
        { type: "audio_usage", agreed: true, version: 1 },
        { type: "resume_usage", agreed: true, version: 1 },
        { type: "marketing", agreed: false }, // 거부 항목은 version 없이 명시적 false
      ],
    });
    expect(getAccessToken()).toBe("at-1");
    expect(getRefreshToken()).toBe("rt-1");
    expect(getSignupSession()).toBeNull();
  });

  it("마케팅까지 전체 동의하면 마케팅도 version 과 함께 제출된다", async () => {
    setSignupSession("st-1", false);
    const mock = stubApi({
      signup: () => envelope({ accessToken: "at-1", refreshToken: "rt-1" }, 201),
    });
    const user = userEvent.setup();
    renderConsent();

    await user.click(await screen.findByRole("button", { name: /약관 전체 동의/ }));
    await user.click(cta());

    await screen.findByText("대시보드-도착");
    const body = JSON.parse((signupCalls(mock)[0][1] as RequestInit).body as string);
    expect(body.consents).toContainEqual({ type: "marketing", agreed: true, version: 1 });
  });

  it("이중 제출 가드: 응답 대기 중에는 버튼이 잠기고 요청은 1회만 나간다", async () => {
    setSignupSession("st-1", false);
    const mock = stubApi({ signup: () => new Promise<Response>(() => {}) });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    const pending = await screen.findByRole("button", { name: "가입하는 중…" });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(signupCalls(mock)).toHaveLength(1);
  });

  it("계약 위반(토큰 누락 201): 세션을 비우고 로그인으로 보낸다", async () => {
    setSignupSession("st-1", false);
    stubApi({ signup: () => envelope({ accessToken: "at-only" }, 201) });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(await screen.findByText("로그인화면-도착")).toBeInTheDocument();
    expect(getSignupSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});

describe("ConsentPage — 제출 에러 분기", () => {
  it("A005(만료 토큰): 세션을 비우고 재로그인 안내로 교체한다", async () => {
    setSignupSession("st-1", false);
    stubApi({
      signup: () => errorEnvelope("A005", "가입 토큰이 유효하지 않습니다.", 401),
    });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(await screen.findByText("가입을 진행할 수 없어요")).toBeInTheDocument();
    expect(
      screen.getByText("가입 유효 시간이 지났어요. 처음부터 다시 로그인해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 로그인하기" })).toBeInTheDocument();
    expect(getSignupSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("A006(중복 가입): 세션을 비우고 로그인 유도로 교체한다", async () => {
    setSignupSession("st-1", false);
    stubApi({ signup: () => errorEnvelope("A006", "이미 가입된 계정입니다.", 409) });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(
      await screen.findByText("이미 가입된 계정이에요. 로그인해서 이용해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 로그인하기" })).toBeInTheDocument();
    expect(getSignupSession()).toBeNull();
  });

  it("A004(필수 미동의): 세션·체크를 유지한 채 안내만 표시하고 재제출할 수 있다", async () => {
    setSignupSession("st-1", false);
    stubApi({
      signup: () => errorEnvelope("A004", "필수 동의 항목에 모두 동의해야 합니다.", 400),
    });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(
      await screen.findByText("필수 항목에 모두 동의해야 가입할 수 있어요."),
    ).toBeInTheDocument();
    expect(getSignupSession()).toEqual({ signupToken: "st-1", isRestored: false });
    expect(getAccessToken()).toBeNull();
    expect(cta()).toBeEnabled(); // 체크 유지 — 바로 재제출 가능
  });

  it("네트워크 실패: 일반 안내를 표시하고 재제출할 수 있다", async () => {
    setSignupSession("st-1", false);
    stubApi({ signup: () => Promise.reject(new TypeError("Failed to fetch")) });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(
      await screen.findByText("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(cta()).toBeEnabled();
  });
});

describe("ConsentPage — U005 동의서 개정", () => {
  it("체크를 리셋하고 재조회가 끝날 때까지 잠근 뒤, 개정 문안으로 재동의·재제출한다", async () => {
    setSignupSession("st-1", false);
    let revised = false;
    let releaseCatalog: (() => void) | null = null;
    const CATALOG_PRIVACY_V2 = {
      consents: [
        { type: "privacy", required: true, version: 2 },
        { type: "audio_usage", required: true, version: 1 },
        { type: "resume_usage", required: true, version: 1 },
        { type: "marketing", required: false, version: 1 },
      ],
    };
    const mock = stubApi({
      catalog: () => {
        if (!revised) return envelope(CATALOG_V1);
        // U005 이후의 재조회 — 수동 해제로 잠금 상태를 결정적으로 검증
        return new Promise<Response>((resolve) => {
          releaseCatalog = () => resolve(envelope(CATALOG_PRIVACY_V2));
        });
      },
      signup: () => {
        if (!revised) {
          revised = true;
          return errorEnvelope("U005", "동의서 버전이 현재 버전과 일치하지 않습니다.", 409);
        }
        return envelope({ accessToken: "at-2", refreshToken: "rt-2" }, 201);
      },
    });
    const user = userEvent.setup();
    renderConsent();

    await agreeRequired(user);
    await user.click(cta());

    expect(
      await screen.findByText("약관이 개정되었어요. 변경된 약관을 다시 확인한 뒤 동의해 주세요."),
    ).toBeInTheDocument();
    // 재조회 완료 전 — 구버전 재제출 차단 (입력·제출 전부 잠금)
    expect(screen.getByRole("button", { name: "개인정보 수집·이용" })).toBeDisabled();
    expect(cta()).toBeDisabled();

    releaseCatalog!();
    // 개정 문안(v2)이 표시되고 체크는 리셋되어 처음부터 재동의
    expect(await screen.findByText("개정된 개인정보 v2 본문")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "개인정보 수집·이용 (v2)" }));
    await user.click(screen.getByRole("button", { name: "음성 데이터 활용" }));
    await user.click(screen.getByRole("button", { name: "이력서 자료 활용" }));
    await user.click(cta());

    expect(await screen.findByText("대시보드-도착")).toBeInTheDocument();
    const calls = signupCalls(mock);
    expect(calls).toHaveLength(2);
    const body = JSON.parse((calls[1][1] as RequestInit).body as string);
    expect(body.consents).toContainEqual({ type: "privacy", agreed: true, version: 2 });
  });
});

describe("ConsentPage — 카탈로그 오류", () => {
  it("조회 실패 시 오류 블록을 보여주고 다시 시도로 복구한다", async () => {
    setSignupSession("st-1", false);
    let fail = true;
    stubApi({
      catalog: () =>
        fail ? errorEnvelope("C001", "서버 내부 오류가 발생했습니다.", 500) : envelope(CATALOG_V1),
    });
    const user = userEvent.setup();
    renderConsent();

    expect(await screen.findByText("약관을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByText("서버 내부 오류가 발생했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).not.toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: "개인정보 수집·이용" })).toBeInTheDocument();
  });

  it("문안 자산이 없는 버전이면 가입을 차단하고 새로고침을 안내한다", async () => {
    setSignupSession("st-1", false);
    stubApi({
      catalog: () =>
        envelope({
          consents: [
            { type: "privacy", required: true, version: 99 },
            { type: "audio_usage", required: true, version: 1 },
            { type: "resume_usage", required: true, version: 1 },
            { type: "marketing", required: false, version: 1 },
          ],
        }),
    });
    renderConsent();

    expect(await screen.findByText("지원하지 않는 약관 버전이에요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).not.toBeInTheDocument();
  });

  it("타입이 누락된 카탈로그는 부분 렌더 없이 전체를 오류 처리한다 (필수 0개 CTA 활성화 방지)", async () => {
    setSignupSession("st-1", false);
    stubApi({
      catalog: () => envelope({ consents: [{ type: "marketing", required: false, version: 1 }] }),
    });
    renderConsent();

    expect(await screen.findByText("약관을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "마케팅 정보 수신" })).not.toBeInTheDocument();
  });

  it("중복 타입 카탈로그도 전체를 오류 처리한다", async () => {
    setSignupSession("st-1", false);
    stubApi({
      catalog: () =>
        envelope({
          consents: [
            { type: "privacy", required: true, version: 1 },
            { type: "privacy", required: true, version: 1 },
            { type: "audio_usage", required: true, version: 1 },
            { type: "resume_usage", required: true, version: 1 },
            { type: "marketing", required: false, version: 1 },
          ],
        }),
    });
    renderConsent();

    expect(await screen.findByText("약관을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "동의하고 시작하기" })).not.toBeInTheDocument();
  });
});

describe("ConsentPage — 복구(isRestored) 변형", () => {
  it("복구 세션이면 복구 카피와 CTA 를 보여준다", async () => {
    setSignupSession("st-r", true);
    stubApi();
    renderConsent();

    expect(await screen.findByText("다시 만나서 반가워요")).toBeInTheDocument();
    expect(screen.getByText("계정 복구 · 2 / 2 단계")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "동의하고 계정 복구하기" })).toBeInTheDocument();
  });
});
