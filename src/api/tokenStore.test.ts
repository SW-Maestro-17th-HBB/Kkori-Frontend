import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumePostLoginRedirect,
  POST_LOGIN_REDIRECT_TTL_MS,
  setPostLoginRedirect,
} from "./tokenStore";

const REDIRECT_KEY = "kkori.postLoginRedirect";

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("postLoginRedirect — 저장·소비", () => {
  it("저장한 내부 경로를 query string 까지 보존해 반환하고, 소비는 1회용이다", () => {
    setPostLoginRedirect("/reports?sort=latest");
    expect(consumePostLoginRedirect()).toBe("/reports?sort=latest");
    expect(consumePostLoginRedirect()).toBeNull(); // 이미 소비됨
  });

  it("저장값이 없으면 null 을 반환한다", () => {
    expect(consumePostLoginRedirect()).toBeNull();
  });

  it("재저장은 이전 값을 덮어쓴다 (로그인 시도당 목적지는 하나)", () => {
    setPostLoginRedirect("/dashboard");
    setPostLoginRedirect("/resumes");
    expect(consumePostLoginRedirect()).toBe("/resumes");
  });
});

describe("postLoginRedirect — TTL (묵은 목적지 폐기)", () => {
  it("TTL 경계까지는 유효하다 (재인증·OAuth 재시도 흐름 보존)", () => {
    vi.useFakeTimers();
    setPostLoginRedirect("/dashboard");
    vi.advanceTimersByTime(POST_LOGIN_REDIRECT_TTL_MS);
    expect(consumePostLoginRedirect()).toBe("/dashboard");
  });

  it("TTL 을 넘기면 null — 한참 뒤의 평범한 로그인을 과거 화면으로 보내지 않는다", () => {
    vi.useFakeTimers();
    setPostLoginRedirect("/dashboard");
    vi.advanceTimersByTime(POST_LOGIN_REDIRECT_TTL_MS + 1);
    expect(consumePostLoginRedirect()).toBeNull();
  });

  it("미래 시각 레코드는 null (시계 조작·손상 방어)", () => {
    sessionStorage.setItem(
      REDIRECT_KEY,
      JSON.stringify({ path: "/dashboard", ts: Date.now() + 60_000 }),
    );
    expect(consumePostLoginRedirect()).toBeNull();
  });
});

describe("postLoginRedirect — 손상 레코드 (null + 키 제거로 반복 소비 차단)", () => {
  it.each([
    ["malformed JSON", "{not-json"],
    ["객체가 아님", JSON.stringify("문자열")],
    ["path 비문자열", JSON.stringify({ path: 123, ts: 1 })],
    ["ts 비숫자", JSON.stringify({ path: "/dashboard", ts: "now" })],
    ["ts null (NaN·Infinity 는 JSON 직렬화 시 null)", '{"path":"/dashboard","ts":null}'],
    ["ts 누락", JSON.stringify({ path: "/dashboard" })],
  ])("%s → null, 키도 제거된다", (_label, raw) => {
    sessionStorage.setItem(REDIRECT_KEY, raw);
    expect(consumePostLoginRedirect()).toBeNull();
    expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
  });
});

describe("postLoginRedirect — 내부 경로 검증 (open redirect 차단)", () => {
  it.each([
    ["프로토콜 상대 URL", "//evil.com/x"],
    ["백슬래시 우회", "/\\evil"],
    ["외부 절대 URL", "https://evil.com/x"],
    ["빈 문자열", ""],
    ["상대 경로", "reports"],
  ])("%s (%s) → null", (_label, path) => {
    setPostLoginRedirect(path);
    expect(consumePostLoginRedirect()).toBeNull();
  });

  it("origin 이 일치하는 정상 내부 경로만 통과한다", () => {
    setPostLoginRedirect("/reports/3?tab=score");
    expect(consumePostLoginRedirect()).toBe("/reports/3?tab=score");
  });
});
