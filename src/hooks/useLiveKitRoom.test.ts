/* useLiveKitRoom 훅 테스트 — livekit-client 는 FakeRoom 목으로 대체.
   실제 앱과 동일하게 StrictMode 로 감싸 이중 마운트의 접속·해제 순서를 검증한다. */
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import {
  ConnectionState,
  discardConnectedRoom,
  stashConnectedRoom,
  useLiveKitRoom,
  useRemoteAudio,
} from "./useLiveKitRoom";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

const SESSION = { url: "wss://test.example", token: "jwt-token" };

/** StrictMode 이중 마운트로 버려지는 인스턴스가 생긴다 — 접속된 룸 중 가장 최근 것을 쓴다 */
const connectedRoom = () =>
  FakeRoom.instances.filter((room) => vi.mocked(room.connect).mock.calls.length > 0).at(-1);

describe("useLiveKitRoom", () => {
  beforeEach(() => {
    discardConnectedRoom(); // 이전 테스트의 핸드오프 보관분 격리
    FakeRoom.reset();
    sessionStorage.clear();
  });

  it("setup 이 보관한 접속 룸을 재접속 없이 인수한다 (StrictMode 포함 connect 총 1회)", async () => {
    // setup 의 접속 확립을 재현 — 연결된 룸을 소유 정보와 함께 보관해 둔다
    const { Room } = await import("livekit-client");
    const established = new Room() as unknown as InstanceType<typeof FakeRoom>;
    await established.connect(SESSION.url, SESSION.token);
    stashConnectedRoom(established as unknown as Room, {
      url: SESSION.url,
      token: SESSION.token,
      authSessionId: "sess-A",
    });

    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    expect(result.current.room).toBe(established); // 새 Room 생성 없이 인수
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    // "재접속 없이 인수" — StrictMode 이중 마운트에서도 setup 의 최초 접속 1회뿐
    expect(vi.mocked(established.connect)).toHaveBeenCalledTimes(1);
  });

  it("인수한 룸도 실제 언마운트에서는 해제된다 (지연 해제가 실행됨)", async () => {
    const { Room } = await import("livekit-client");
    const established = new Room() as unknown as InstanceType<typeof FakeRoom>;
    await established.connect(SESSION.url, SESSION.token);
    stashConnectedRoom(established as unknown as Room, {
      url: SESSION.url,
      token: SESSION.token,
      authSessionId: "sess-A",
    });

    const { result, unmount } = renderHook(() => useLiveKitRoom(SESSION), {
      wrapper: StrictMode,
    });
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    unmount(); // 재마운트 없는 진짜 언마운트 — 마이크로태스크로 미룬 해제가 실행돼야 한다
    await waitFor(() => {
      expect(established.state).toBe("disconnected");
    });
  });

  it("소유 정보가 다른 보관 룸은 인수하지 않고 폐기한다", async () => {
    const { Room } = await import("livekit-client");
    const established = new Room() as unknown as InstanceType<typeof FakeRoom>;
    await established.connect("wss://other.example", "other-token");
    stashConnectedRoom(established as unknown as Room, {
      url: "wss://other.example",
      token: "other-token", // 다른 발급분(예: 이전 사용자)의 연결
      authSessionId: "sess-B",
    });

    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    expect(result.current.room).not.toBe(established); // 인수 거부 — 새 룸으로 접속
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    expect(vi.mocked(established.disconnect)).toHaveBeenCalled(); // 잔여 연결 폐기
  });

  it("세션이 없으면 접속하지 않는다", () => {
    renderHook(() => useLiveKitRoom(undefined), { wrapper: StrictMode });
    expect(connectedRoom()).toBeUndefined();
  });

  it("세션이 주어지면 url·token 으로 접속하고 연결 상태를 노출한다", async () => {
    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    expect(connectedRoom()!.connect).toHaveBeenCalledWith(SESSION.url, SESSION.token);
  });

  it("언마운트하면 룸 접속을 해제한다", async () => {
    const { result, unmount } = renderHook(() => useLiveKitRoom(SESSION), {
      wrapper: StrictMode,
    });
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    const room = connectedRoom()!;
    unmount();
    await waitFor(() => {
      expect(room.state).toBe("disconnected");
    });
  });

  it("접속이 거부되면 connectError 를 노출한다", async () => {
    FakeRoom.connectBehavior = "fail";
    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    await waitFor(() => {
      expect(result.current.connectError).toBe("connect refused");
    });
    expect(result.current.connectionState).toBe(ConnectionState.Disconnected);
  });

  it("접속 실패 후 새 세션으로 성공하면 connectError 가 사라진다", async () => {
    FakeRoom.connectBehavior = "fail";
    const { result, rerender } = renderHook(
      ({ session }: { session: typeof SESSION }) => useLiveKitRoom(session),
      { wrapper: StrictMode, initialProps: { session: SESSION } },
    );
    await waitFor(() => {
      expect(result.current.connectError).toBe("connect refused");
    });

    FakeRoom.connectBehavior = "ok";
    rerender({ session: { ...SESSION, token: "jwt-token-2" } });
    // 세션이 교체되는 즉시 이전 세션의 실패는 무효 — "접속 실패" 잔존 표시 방지
    expect(result.current.connectError).toBeNull();
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    expect(result.current.connectError).toBeNull();
  });

  it("자동재생 차단 상태를 노출하고 startAudio 로 재개를 요청한다", async () => {
    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    expect(result.current.canPlayAudio).toBe(true);

    const room = connectedRoom()!;
    act(() => {
      room.setCanPlaybackAudio(false);
    });
    expect(result.current.canPlayAudio).toBe(false);

    await act(() => result.current.startAudio());
    expect(room.startAudio).toHaveBeenCalled();
  });

  it("toggleMicrophone 이 마이크 발행 상태를 뒤집는다", async () => {
    const { result } = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    await waitFor(() => {
      expect(result.current.connectionState).toBe(ConnectionState.Connected);
    });
    expect(result.current.micEnabled).toBe(false);
    await act(() => result.current.toggleMicrophone());
    expect(result.current.micEnabled).toBe(true);
    await act(() => result.current.toggleMicrophone());
    expect(result.current.micEnabled).toBe(false);
  });
});

/* setup(장비 점검)에서 저장한 마이크의 핸드오프 — PRD session/device-setup.md 기능 4 */
describe("useLiveKitRoom — 장치 핸드오프", () => {
  const STORAGE_KEY = "hbb.interview.devicePrefs";

  beforeEach(() => {
    FakeRoom.reset();
    sessionStorage.clear();
  });

  const renderConnected = async () => {
    const rendered = renderHook(() => useLiveKitRoom(SESSION), { wrapper: StrictMode });
    await waitFor(() => {
      expect(rendered.result.current.connectionState).toBe(ConnectionState.Connected);
    });
    return rendered;
  };

  it("저장된 마이크가 있으면 Room 캡처 기본값에 exact 제약으로 전달한다", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: "mic-usb" }));
    await renderConnected();
    // bare string(ideal)이면 장치가 없어도 조용히 기본 장치로 대체돼 fallback 이 죽는다
    expect(connectedRoom()!.options).toEqual({
      audioCaptureDefaults: { deviceId: { exact: "mic-usb" } },
    });
  });

  it("저장값이 없으면 옵션 없이 Room 을 만든다", async () => {
    await renderConnected();
    expect(connectedRoom()!.options).toBeUndefined();
  });

  it("손상된 저장값은 무시하고 기본 동작한다", async () => {
    sessionStorage.setItem(STORAGE_KEY, "{broken");
    await renderConnected();
    expect(connectedRoom()!.options).toBeUndefined();
  });

  it("저장된 마이크가 제거된 경우 저장값을 지우고 기본 장치로 1회 재시도한다", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: "mic-gone", cameraId: "cam-usb" }));
    FakeRoom.micResults = ["notfound"]; // 첫 켜기만 실패 — 재시도는 성공
    const { result } = await renderConnected();

    await act(() => result.current.toggleMicrophone());

    const setMic = vi.mocked(connectedRoom()!.localParticipant.setMicrophoneEnabled);
    expect(setMic).toHaveBeenCalledTimes(2);
    // 재시도는 스테일 캡처 기본값 대신 기본 장치를 명시적으로 전달해야 한다
    expect(setMic.mock.calls[1]).toEqual([true, { deviceId: "default" }]);
    expect(result.current.micEnabled).toBe(true);
    // micId 만 제거된다 — 카메라 선호(self-view)는 마이크 fallback 과 무관하게 보존
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({ cameraId: "cam-usb" });
  });

  it("기본 장치 재시도까지 실패하면 오류를 그대로 던진다", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: "mic-gone" }));
    FakeRoom.micResults = ["notfound", "notfound"];
    const { result } = await renderConnected();

    await expect(result.current.toggleMicrophone()).rejects.toMatchObject({
      name: "NotFoundError",
    });
    const setMic = vi.mocked(connectedRoom()!.localParticipant.setMicrophoneEnabled);
    expect(setMic).toHaveBeenCalledTimes(2);
    expect(result.current.micEnabled).toBe(false);
  });

  it("권한 거부는 장치 소멸이 아니므로 재시도하지 않는다", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: "mic-usb" }));
    FakeRoom.micResults = ["denied"];
    const { result } = await renderConnected();

    await expect(result.current.toggleMicrophone()).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(vi.mocked(connectedRoom()!.localParticipant.setMicrophoneEnabled)).toHaveBeenCalledTimes(
      1,
    );
    // 저장값은 유효할 수 있으므로 유지한다
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe("useRemoteAudio", () => {
  beforeEach(() => {
    FakeRoom.reset();
  });

  it("구독된 오디오 트랙을 컨테이너에 부착하고 해지 시 제거한다", () => {
    const fakeRoom = new FakeRoom();
    const { result } = renderHook(() => useRemoteAudio(fakeRoom as unknown as Room), {
      wrapper: StrictMode,
    });
    const container = document.createElement("div");
    result.current.current = container;

    const track = makeFakeAudioTrack();
    act(() => {
      fakeRoom.emit("trackSubscribed", track);
    });
    expect(container.querySelectorAll("audio")).toHaveLength(1);

    act(() => {
      fakeRoom.emit("trackUnsubscribed", track);
    });
    expect(container.querySelectorAll("audio")).toHaveLength(0);
  });

  it("오디오가 아닌 트랙은 부착하지 않는다", () => {
    const fakeRoom = new FakeRoom();
    const { result } = renderHook(() => useRemoteAudio(fakeRoom as unknown as Room), {
      wrapper: StrictMode,
    });
    const container = document.createElement("div");
    result.current.current = container;

    act(() => {
      fakeRoom.emit("trackSubscribed", { ...makeFakeAudioTrack(), kind: "video" });
    });
    expect(container.children).toHaveLength(0);
  });
});
