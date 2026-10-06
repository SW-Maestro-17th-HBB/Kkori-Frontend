import { afterEach, describe, expect, it } from "vitest";
import { initAnalytics, trackPageView } from "./analytics";

const LOADER_SELECTOR = 'script[src^="https://www.googletagmanager.com/gtag/js"]';

/** gtag 큐 항목(arguments 객체)을 배열로 펼친다 */
const queue = () =>
  (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

afterEach(() => {
  delete window.gtag;
  delete window.dataLayer;
  document.head.querySelectorAll(LOADER_SELECTOR).forEach((el) => el.remove());
  window.history.replaceState(null, "", "/");
});

describe("initAnalytics", () => {
  it("측정 ID 가 비어 있으면 아무것도 하지 않는다 (로컬·CI 기본값)", () => {
    initAnalytics("");
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
    expect(document.head.querySelector(LOADER_SELECTOR)).toBeNull();
  });

  it("ID 가 있으면 로더를 삽입하고 page_view 자동 전송을 끈 config 를 큐에 넣는다", () => {
    initAnalytics("G-TEST1234");
    const script = document.head.querySelector<HTMLScriptElement>(LOADER_SELECTOR);
    expect(script?.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TEST1234");
    expect(script?.async).toBe(true);
    expect(queue()).toHaveLength(2);
    expect(queue()[0]).toEqual(["js", expect.any(Date)]);
    expect(queue()[1]).toEqual(["config", "G-TEST1234", { send_page_view: false }]);
  });

  it("큐 항목은 arguments 객체다 (gtag.js 는 배열을 명령으로 해석하지 않음)", () => {
    initAnalytics("G-TEST1234");
    expect(Object.prototype.toString.call(window.dataLayer![0])).toBe("[object Arguments]");
  });

  it("두 번 호출해도 한 번만 초기화한다", () => {
    initAnalytics("G-TEST1234");
    initAnalytics("G-TEST1234");
    expect(document.head.querySelectorAll(LOADER_SELECTOR)).toHaveLength(1);
    expect(queue()).toHaveLength(2);
  });
});

describe("trackPageView", () => {
  it("초기화 전(ID 없음)에는 no-op", () => {
    trackPageView("/dashboard");
    expect(window.dataLayer).toBeUndefined();
  });

  it("pathname 만 page_location 에 싣고 주소창의 쿼리스트링은 버린다 (카카오 콜백 code 차단)", () => {
    window.history.replaceState(null, "", "/auth/kakao/callback?code=secret-code&state=xyz");
    initAnalytics("G-TEST1234");
    trackPageView("/auth/kakao/callback");

    const [command, name, params] = queue()[2];
    expect(command).toBe("event");
    expect(name).toBe("page_view");
    expect(params).toEqual({ page_location: `${window.location.origin}/auth/kakao/callback` });
    expect(JSON.stringify(queue())).not.toContain("secret-code");
  });
});
