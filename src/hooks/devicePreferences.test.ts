/* devicePreferences 테스트 — sessionStorage 저장·로드의 방어 동작 검증 (HBB1-145) */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevicePreferences,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./devicePreferences";

const STORAGE_KEY = "hbb.interview.devicePrefs";

describe("devicePreferences", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("micId 를 저장하고 다시 불러온다", () => {
    saveDevicePreferences({ micId: "mic-usb" });
    expect(loadDevicePreferences()).toEqual({ micId: "mic-usb" });
  });

  it("micId 외 필드는 저장하지 않는다", () => {
    const withExtra = { micId: "mic-usb", cameraId: "cam-1" };
    saveDevicePreferences(withExtra);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({ micId: "mic-usb" });
  });

  it("잘못된 JSON 은 빈 값으로 처리한다", () => {
    sessionStorage.setItem(STORAGE_KEY, "{broken");
    expect(loadDevicePreferences()).toEqual({});
  });

  it("micId 타입이 잘못되면 무시한다", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: 42 }));
    expect(loadDevicePreferences()).toEqual({});
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify("mic-usb"));
    expect(loadDevicePreferences()).toEqual({});
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: "" }));
    expect(loadDevicePreferences()).toEqual({});
  });

  it("스토리지 예외에도 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(() => saveDevicePreferences({ micId: "mic-usb" })).not.toThrow();
    expect(loadDevicePreferences()).toEqual({});
    expect(() => clearDevicePreferences()).not.toThrow();
  });

  it("clear 로 저장값을 제거한다", () => {
    saveDevicePreferences({ micId: "mic-usb" });
    clearDevicePreferences();
    expect(loadDevicePreferences()).toEqual({});
  });
});
