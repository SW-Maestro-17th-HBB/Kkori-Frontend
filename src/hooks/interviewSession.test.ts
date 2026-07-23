import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInterviewSession,
  loadInterviewSession,
  saveInterviewSession,
} from "./interviewSession";

const KEY = "hbb.interview.session";

const record = {
  url: "wss://lk.example",
  token: "jwt-token",
  room: "room-1",
  authSessionId: "sess-A",
};

describe("interviewSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("저장·로드 라운드트립 (id 없음)", () => {
    expect(saveInterviewSession(record)).toBe(true);
    expect(loadInterviewSession()).toEqual(record);
  });

  it("id가 있으면 함께 저장·로드된다", () => {
    saveInterviewSession({ ...record, id: 34 });
    expect(loadInterviewSession()).toEqual({ ...record, id: 34 });
  });

  it("저장 실패(쿼터 등) 시 false를 반환한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveInterviewSession(record)).toBe(false);
  });

  it("저장값이 없으면 null", () => {
    expect(loadInterviewSession()).toBeNull();
  });

  it("깨진 JSON이면 null", () => {
    sessionStorage.setItem(KEY, "{oops");
    expect(loadInterviewSession()).toBeNull();
  });

  it("필수 필드가 없거나 빈 문자열이면 null", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...record, token: "" }));
    expect(loadInterviewSession()).toBeNull();
    sessionStorage.setItem(KEY, JSON.stringify({ url: record.url, token: record.token }));
    expect(loadInterviewSession()).toBeNull();
  });

  it("id가 숫자가 아니면 제외하고 로드한다", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...record, id: "34" }));
    expect(loadInterviewSession()).toEqual(record);
  });

  it("clear로 저장값이 제거된다", () => {
    saveInterviewSession(record);
    clearInterviewSession();
    expect(loadInterviewSession()).toBeNull();
  });
});
