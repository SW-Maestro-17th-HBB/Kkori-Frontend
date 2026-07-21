/* InterviewPage 테스트 — LiveKit 룸 접속(HBB1-262) 동작 검증.
   livekit-client 는 FakeRoom 목, 접속 세션은 vi.stubEnv 로 주입한다. */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import { InterviewPage } from "./InterviewPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

/** StrictMode 이중 마운트로 버려지는 인스턴스가 생긴다 — 실제 접속된 룸을 찾는다 */
const connectedRoom = () =>
  FakeRoom.instances.find((room) => vi.mocked(room.connect).mock.calls.length > 0);

const stubSessionEnv = () => {
  vi.stubEnv("VITE_LIVEKIT_URL", "wss://test.example");
  vi.stubEnv("VITE_LIVEKIT_TOKEN", "jwt-token");
};

describe("InterviewPage — LiveKit 룸 접속", () => {
  beforeEach(() => {
    FakeRoom.reset();
    vi.unstubAllEnvs();
  });

  it("env 세션으로 룸에 접속하고 상태 칩이 '연결됨'으로 바뀐다", async () => {
    stubSessionEnv();
    renderWithProviders(<InterviewPage />, { route: "/live" });
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
    expect(connectedRoom()!.connect).toHaveBeenCalledWith("wss://test.example", "jwt-token");
  });

  it("접속 정보가 없으면 '접속 정보 없음' 상태를 보여준다", async () => {
    renderWithProviders(<InterviewPage />, { route: "/live" });
    expect(await screen.findByText("접속 정보 없음")).toBeInTheDocument();
    expect(connectedRoom()).toBeUndefined();
  });

  it("마이크 버튼이 연결 후 활성화되고 클릭으로 발행을 토글한다", async () => {
    stubSessionEnv();
    renderWithProviders(<InterviewPage />, { route: "/live" });
    const mic = screen.getByRole("button", { name: "마이크" });
    expect(mic).toBeDisabled(); // 연결 전에는 발행 불가

    await screen.findByText("연결됨");
    expect(mic).toBeEnabled();
    expect(mic).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(mic);
    await waitFor(() => {
      expect(mic).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("구독된 원격 오디오 트랙이 숨김 컨테이너에 부착된다", async () => {
    stubSessionEnv();
    renderWithProviders(<InterviewPage />, { route: "/live" });
    await screen.findByText("연결됨");

    const container = screen.getByTestId("remote-audio");
    const track = makeFakeAudioTrack();
    act(() => {
      connectedRoom()!.emit("trackSubscribed", track);
    });
    expect(container.querySelectorAll("audio")).toHaveLength(1);

    act(() => {
      connectedRoom()!.emit("trackUnsubscribed", track);
    });
    expect(container.querySelectorAll("audio")).toHaveLength(0);
  });
});
