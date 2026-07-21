/* useLiveKitRoom 훅 테스트 — livekit-client 는 FakeRoom 목으로 대체.
   실제 앱과 동일하게 StrictMode 로 감싸 이중 마운트의 접속·해제 순서를 검증한다. */
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import { ConnectionState, useLiveKitRoom, useRemoteAudio } from "./useLiveKitRoom";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

const SESSION = { url: "wss://test.example", token: "jwt-token" };

/** StrictMode 이중 마운트로 버려지는 인스턴스가 생긴다 — 접속된 룸 중 가장 최근 것을 쓴다 */
const connectedRoom = () =>
  FakeRoom.instances.filter((room) => vi.mocked(room.connect).mock.calls.length > 0).at(-1);

describe("useLiveKitRoom", () => {
  beforeEach(() => {
    FakeRoom.reset();
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
