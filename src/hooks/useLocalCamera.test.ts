/* useLocalCamera 테스트 — 로컬 self-view 트랙의 획득·정지·fallback 검증.
   룸에 publish 하지 않으므로 Room 목 없이 createLocalTracks 만 목으로 제어한다. */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDevicePreferences, saveDevicePreferences } from "./devicePreferences";
import { FakeMedia } from "../test/livekitMock";
import { useLocalCamera } from "./useLocalCamera";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

describe("useLocalCamera", () => {
  beforeEach(() => {
    FakeMedia.reset();
    sessionStorage.clear();
  });

  it("토글은 비디오 트랙만 획득하고, 다시 토글하면 정지한다", async () => {
    const { result } = renderHook(() => useLocalCamera());
    expect(result.current.cameraEnabled).toBe(false);

    let on = false;
    await act(async () => {
      on = await result.current.toggleCamera();
    });
    expect(on).toBe(true);
    expect(result.current.cameraEnabled).toBe(true);
    expect(result.current.cameraTrack).not.toBeNull();
    expect(FakeMedia.createLocalTracks).toHaveBeenCalledWith({ video: true });

    const track = FakeMedia.tracks.at(-1)!;
    await act(async () => {
      on = await result.current.toggleCamera();
    });
    expect(on).toBe(false);
    expect(result.current.cameraEnabled).toBe(false);
    expect(track.stop).toHaveBeenCalled();
  });

  it("저장된 카메라를 exact 제약으로 사용한다", async () => {
    saveDevicePreferences({ cameraId: "cam-usb" });
    const { result } = renderHook(() => useLocalCamera());
    await act(() => result.current.enableCamera());
    expect(FakeMedia.createLocalTracks).toHaveBeenCalledWith({
      video: { deviceId: { exact: "cam-usb" } },
    });
    expect(FakeMedia.tracks.at(-1)!.deviceId).toBe("cam-usb");
  });

  it("저장 카메라가 사라졌으면 그 저장값만 지우고 기본 카메라로 1회 재시도한다", async () => {
    saveDevicePreferences({ micId: "mic-usb", cameraId: "cam-gone" });
    FakeMedia.acquireResults = ["no-camera", "ok"];
    const { result } = renderHook(() => useLocalCamera());
    await act(() => result.current.enableCamera());
    expect(result.current.cameraEnabled).toBe(true);
    expect(loadDevicePreferences()).toEqual({ micId: "mic-usb" }); // 마이크 선호는 보존
    expect(FakeMedia.createLocalTracks).toHaveBeenLastCalledWith({ video: true });
  });

  it("권한 거부 등 다른 원인은 재시도 없이 실패시키고 저장값을 보존한다", async () => {
    saveDevicePreferences({ cameraId: "cam-usb" });
    FakeMedia.acquireResults = ["denied"];
    const { result } = renderHook(() => useLocalCamera());
    await act(async () => {
      await expect(result.current.enableCamera()).rejects.toMatchObject({
        name: "NotAllowedError",
      });
    });
    expect(result.current.cameraEnabled).toBe(false);
    expect(loadDevicePreferences()).toEqual({ cameraId: "cam-usb" });
    expect(FakeMedia.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it("켜진 상태의 재켜기는 no-op 이다 (복원 effect 재실행 안전)", async () => {
    const { result } = renderHook(() => useLocalCamera());
    await act(() => result.current.enableCamera());
    await act(() => result.current.enableCamera());
    expect(FakeMedia.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it("언마운트 시 트랙을 정지한다", async () => {
    const { result, unmount } = renderHook(() => useLocalCamera());
    await act(() => result.current.enableCamera());
    const track = FakeMedia.tracks.at(-1)!;
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("획득 완료 전 언마운트는 늦게 도착한 트랙을 정지한다", async () => {
    const { result, unmount } = renderHook(() => useLocalCamera());
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.enableCamera();
    });
    unmount(); // 획득이 끝나기 전 이탈
    await pending;
    expect(FakeMedia.tracks).toHaveLength(1);
    expect(FakeMedia.tracks[0].stop).toHaveBeenCalled();
  });
});
