/* useDeviceSetup 훅 테스트 — 장비 점검 획득·전환·복구·상실 조정 검증 (HBB1-145).
   livekit-client 는 FakeMedia/FakeLocalTrack 목으로 대체한다.
   정책 원천: docs/requirements/session/device-setup.md */
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMedia, FakeRoom } from "../test/livekitMock";
import { useDeviceSetup } from "./useDeviceSetup";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

const renderSetup = () => renderHook(() => useDeviceSetup(), { wrapper: StrictMode });

const audioTrack = () => FakeMedia.tracks.find((t) => t.kind === "audio")!;
const videoTrack = () => FakeMedia.tracks.find((t) => t.kind === "video")!;

/** 실입력 감지 통과 — 임계치 이상 볼륨을 잠깐 흘려 "마이크 정상"을 확정시킨다 */
const speak = async (result: { current: ReturnType<typeof useDeviceSetup> }) => {
  FakeMedia.volume = 0.2;
  await waitFor(() => {
    expect(result.current.micInputDetected).toBe(true);
  });
  FakeMedia.volume = 0;
};

/** jsdom 에는 navigator.mediaDevices 가 없다 — devicechange 를 쏠 수 있는 스텁 주입.
    renderSetup() 이전에 호출해야 activate 가 리스너를 등록한다 */
function stubMediaDevices() {
  const listeners = new Set<() => void>();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    },
  });
  return { fireDeviceChange: () => [...listeners].forEach((cb) => cb()) };
}

describe("useDeviceSetup", () => {
  beforeEach(() => {
    FakeRoom.reset();
    FakeMedia.reset();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("시작 전에는 idle 이고 장치를 획득하지 않는다", () => {
    const { result } = renderSetup();
    expect(result.current.phase).toBe("idle");
    expect(result.current.canStart).toBe(false);
    expect(FakeMedia.createLocalTracks).not.toHaveBeenCalled();
  });

  it("start 로 마이크·카메라를 획득하고 장치 목록·선택값을 채운다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.videoTrack).not.toBeNull();
    expect(result.current.micId).toBe("mic-default");
    expect(result.current.cameraId).toBe("cam-default");
    expect(result.current.mics.map((d) => d.deviceId)).toEqual(["mic-default", "mic-usb"]);
    expect(result.current.cameras).toHaveLength(2);
    // 트랙 획득만으로는 시작 불가 — 실입력 감지가 남았다
    expect(result.current.micInputDetected).toBe(false);
    expect(result.current.canStart).toBe(false);
  });

  it("마이크 입력이 임계치를 넘어야 canStart 가 된다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.canStart).toBe(false);
    await speak(result);
    expect(result.current.canStart).toBe(true);
  });

  it("장치 전환 후에는 입력 감지가 리셋되어 다시 확인해야 한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    await speak(result);
    expect(result.current.canStart).toBe(true);
    await act(async () => {
      await result.current.selectMic("mic-usb");
    });
    expect(result.current.micInputDetected).toBe(false); // 새 장치는 미검증
    expect(result.current.canStart).toBe(false);
    await speak(result);
    expect(result.current.canStart).toBe(true);
  });

  it("카메라가 없으면 마이크만으로 점검을 완료한다 (음성 진행)", async () => {
    FakeMedia.trackBehavior = "no-camera";
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.videoTrack).toBeNull();
    await speak(result);
    expect(result.current.canStart).toBe(true); // 카메라 없이도 음성만으로 시작 가능
  });

  it("카메라 문제로 결합 요청이 실패해도 마이크 단독 재확인으로 진행한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"]; // 결합 실패(카메라 점유) → 마이크 단독 성공
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.videoTrack).toBeNull();
    expect(FakeMedia.createLocalTracks).toHaveBeenNthCalledWith(1, { audio: true, video: true });
    expect(FakeMedia.createLocalTracks).toHaveBeenNthCalledWith(2, { audio: true });
  });

  it("권한 거부 시 permission-denied 가 되고 재시도로 복구한다", async () => {
    FakeMedia.trackBehavior = "denied";
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("permission-denied");
    expect(result.current.canStart).toBe(false);

    FakeMedia.trackBehavior = "ok";
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
    await speak(result);
    expect(result.current.canStart).toBe(true);
  });

  it("장치 접근 불가는 device-in-use 로 분류한다", async () => {
    FakeMedia.trackBehavior = "in-use";
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBe("device-in-use");
  });

  it("마이크가 없으면 mic-not-found 로 분류한다", async () => {
    FakeMedia.trackBehavior = "no-mic";
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBe("mic-not-found");
  });

  it("보안 컨텍스트 문제는 unsupported 로 분류한다", async () => {
    const securityError = Object.assign(new Error("insecure context"), {
      name: "SecurityError",
    });
    FakeMedia.createLocalTracks
      .mockRejectedValueOnce(securityError)
      .mockRejectedValueOnce(securityError);
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toBe("unsupported");
  });

  it("selectMic 이 장치를 전환하고 분석기를 다시 만든다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    const analysersBefore = FakeMedia.createAudioAnalyser.mock.calls.length;
    await act(async () => {
      await result.current.selectMic("mic-usb");
    });
    expect(audioTrack().setDeviceId).toHaveBeenCalledWith({ exact: "mic-usb" });
    expect(result.current.micId).toBe("mic-usb");
    expect(FakeMedia.createAudioAnalyser.mock.calls.length).toBe(analysersBefore + 1);
  });

  it("전환이 false 를 반환하면 실제 사용 장치를 유지하고 안내한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.switchQueue = ["false"];
    await act(async () => {
      await result.current.selectMic("mic-usb");
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.micId).toBe("mic-default"); // 요청 장치가 아니라 실제 장치
    expect(result.current.notice).toBe("mic-switch-failed");
  });

  it("전환이 예외로 실패하면 이전 장치를 재획득해 점검을 유지한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.switchResults.set("audio:mic-usb", ["throw"]);
    await act(async () => {
      await result.current.selectMic("mic-usb");
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.micId).toBe("mic-default"); // 이전 장치로 복구
    expect(result.current.notice).toBe("mic-switch-failed");
    expect(result.current.micInputDetected).toBe(false); // 복구된 장치도 재확인 대상
  });

  it("마이크 전환·복구가 모두 실패하면 점검을 무효화한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.switchResults.set("audio:mic-usb", ["throw"]);
    FakeMedia.switchResults.set("audio:mic-default", ["throw"]);
    await act(async () => {
      await result.current.selectMic("mic-usb");
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toBe("mic-lost");
    expect(result.current.micId).toBeNull();
    expect(result.current.canStart).toBe(false);
    expect(audioTrack().stopped).toBe(true);
  });

  it("카메라가 없는 상태에서 카메라를 선택하면 트랙을 재획득한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"]; // 카메라 없이 점검 완료
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.videoTrack).toBeNull();

    await act(async () => {
      await result.current.selectCamera("cam-usb");
    });
    expect(result.current.videoTrack).not.toBeNull();
    expect(result.current.cameraId).toBe("cam-usb");
    expect(FakeMedia.createLocalTracks).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: "cam-usb" } },
    });
  });

  it("카메라 재획득이 실패하면 경고 상태를 유지한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"];
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.trackBehavior = "no-camera"; // 재획득도 실패
    await act(async () => {
      await result.current.selectCamera("cam-usb");
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.videoTrack).toBeNull();
    expect(result.current.notice).toBe("camera-switch-failed");
  });

  it("분석기 생성이 실패하면 획득한 트랙을 정리하고 오류 상태가 된다", async () => {
    FakeMedia.createAudioAnalyser.mockImplementationOnce(() => {
      throw new Error("audio context unavailable");
    });
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("error");
    FakeMedia.tracks.forEach((track) => {
      expect(track.stopped).toBe(true); // 부분 획득 자원 누수 없음
    });

    // 재시도는 새 트랙으로 정상 진행
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
  });

  it("카메라 전환·복구가 모두 실패해도 음성 진행은 유지된다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    await speak(result);
    FakeMedia.switchResults.set("video:cam-usb", ["throw"]);
    FakeMedia.switchResults.set("video:cam-default", ["throw"]);
    await act(async () => {
      await result.current.selectCamera("cam-usb");
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.videoTrack).toBeNull();
    expect(result.current.cameraId).toBeNull();
    expect(result.current.notice).toBe("camera-switch-failed");
    expect(result.current.canStart).toBe(true);
  });

  it("사용 중 마이크가 제거되면 기본 마이크로 자동 전환한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.devices.audioinput = [
      { deviceId: "mic-usb", kind: "audioinput", label: "USB 마이크", groupId: "g2" },
    ];
    act(() => {
      audioTrack().emitEnded();
    });
    await waitFor(() => {
      expect(result.current.micId).toBe("mic-usb");
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.notice).toBe("mic-auto-switched");
    expect(result.current.micInputDetected).toBe(false); // 자동 전환된 장치도 재확인 대상
  });

  it("남은 마이크가 없으면 점검을 무효화한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.devices.audioinput = [];
    act(() => {
      audioTrack().emitEnded();
    });
    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
    expect(result.current.error).toBe("mic-lost");
    expect(result.current.canStart).toBe(false);
  });

  it("사용 중 카메라가 제거되면 경고로 전환하되 점검을 유지한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    await speak(result);
    act(() => {
      videoTrack().emitEnded();
    });
    await waitFor(() => {
      expect(result.current.videoTrack).toBeNull();
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.cameraId).toBeNull();
    expect(result.current.canStart).toBe(true);
  });

  it("devicechange 발생 시 장치 목록을 갱신한다", async () => {
    const { fireDeviceChange } = stubMediaDevices();
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.devices.audioinput = [
      ...FakeMedia.devices.audioinput,
      { deviceId: "mic-bt", kind: "audioinput", label: "블루투스 마이크", groupId: "g3" },
    ];
    act(() => {
      fireDeviceChange();
    });
    await waitFor(() => {
      expect(result.current.mics.map((d) => d.deviceId)).toContain("mic-bt");
    });
    expect(result.current.phase).toBe("ready"); // 현재 마이크는 그대로 — 조정 없음
    expect(result.current.micId).toBe("mic-default");
  });

  it("같은 틱의 이벤트 배치는 하나의 재조정으로 병합된다", async () => {
    const { fireDeviceChange } = stubMediaDevices();
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    const enumerateCallsAfterStart = FakeRoom.getLocalDevices.mock.calls.length;
    act(() => {
      videoTrack().emitEnded(); // 카메라 제거 + 목록 변경이 같은 틱에 도착
      fireDeviceChange();
    });
    await waitFor(() => {
      expect(result.current.videoTrack).toBeNull();
    });
    // 재조정 1회 = 열거 2회(videoinput·audioinput) — 배치가 병합되지 않으면 4회가 된다
    expect(FakeRoom.getLocalDevices.mock.calls.length).toBe(enumerateCallsAfterStart + 2);
    expect(audioTrack().setDeviceId).not.toHaveBeenCalled(); // 불필요한 재호출 없음
  });

  it("전환 진행 중 도착한 제거 이벤트는 전환 완료 후 재조정된다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    const audio = audioTrack();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = audio.setDeviceId.getMockImplementation()!;
    audio.setDeviceId.mockImplementationOnce(async (deviceId) => {
      await gate;
      return original(deviceId);
    });

    let switchPromise!: Promise<void>;
    act(() => {
      switchPromise = result.current.selectMic("mic-usb");
    });
    // 전환이 걸려 있는 동안 장치 목록 변경 + (이전 장치의) ended 도착 — 유실되면 안 된다
    FakeMedia.devices.audioinput = [
      { deviceId: "mic-usb", kind: "audioinput", label: "USB 마이크", groupId: "g2" },
    ];
    act(() => {
      audio.emitEnded();
    });
    await act(async () => {
      release();
      await switchPromise;
    });
    // 전환은 성공(새 트랙 생존), 완료 후 재조정이 목록을 갱신하고 불필요한 전환은 없다
    await waitFor(() => {
      expect(result.current.mics.map((d) => d.deviceId)).toEqual(["mic-usb"]);
    });
    expect(result.current.phase).toBe("ready");
    expect(result.current.micId).toBe("mic-usb");
    expect(audio.setDeviceId).toHaveBeenCalledTimes(1);
  });

  it("장치 열거가 실패해도 점검 완료를 유지한다", async () => {
    FakeMedia.enumerateBehavior = "fail";
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("ready");
    await speak(result);
    expect(result.current.canStart).toBe(true);
    expect(result.current.mics).toEqual([]); // 목록만 비어 드롭다운은 자리 표시
    expect(result.current.cameras).toEqual([]);
  });

  it("마이크 입력 레벨을 주기적으로 갱신한다", async () => {
    const { result } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    FakeMedia.volume = 0.42;
    await waitFor(() => {
      expect(result.current.micVolume).toBeCloseTo(0.42);
    });
  });

  it("언마운트 시 트랙을 정지하고 분석기를 정리한다", async () => {
    const { result, unmount } = renderSetup();
    await act(async () => {
      await result.current.start();
    });
    expect(FakeMedia.tracks.length).toBeGreaterThan(0);
    unmount();
    FakeMedia.tracks.forEach((track) => {
      expect(track.stopped).toBe(true);
    });
    expect(FakeMedia.analyserCleanup).toHaveBeenCalled();
  });
});
