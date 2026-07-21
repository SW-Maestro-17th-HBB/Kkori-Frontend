/* InterviewPage 테스트 — LiveKit 룸 접속(HBB1-262) 동작 검증.
   livekit-client 는 FakeRoom 목, 접속 세션은 vi.stubEnv 로 주입한다. */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import { InterviewPage } from "./InterviewPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

/** StrictMode 이중 마운트로 버려지는 인스턴스가 생긴다 — 접속된 룸 중 가장 최근 것을 쓴다 */
const connectedRoom = () =>
  FakeRoom.instances.filter((room) => vi.mocked(room.connect).mock.calls.length > 0).at(-1);

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

  it("세션 조회 중에는 '접속 준비 중…' 상태를 보여준다", async () => {
    stubSessionEnv();
    renderWithProviders(<InterviewPage />, { route: "/live" });
    // 조회가 끝나기 전의 초기 렌더 — '연결 끊김'으로 새어 나가면 안 된다
    expect(screen.getByText("접속 준비 중…")).toBeInTheDocument();
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
  });

  it("접속이 거부되면 '접속 실패' 상태를 보여준다", async () => {
    stubSessionEnv();
    FakeRoom.connectBehavior = "fail";
    renderWithProviders(<InterviewPage />, { route: "/live" });
    expect(await screen.findByText("접속 실패")).toBeInTheDocument();
  });

  it("자동재생이 막히면 '소리 켜기'가 나타나고, 실패 시 유지되다 재클릭 성공 시 사라진다", async () => {
    stubSessionEnv();
    renderWithProviders(<InterviewPage />, { route: "/live" });
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.setCanPlaybackAudio(false);
    });
    const resume = await screen.findByRole("button", { name: /소리 켜기/ });

    // 첫 시도 실패 — 재생 불가 상태가 유지되므로 버튼이 남아 재시도 수단이 된다
    FakeRoom.audioBehavior = "fail";
    await userEvent.click(resume);
    expect(connectedRoom()!.startAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /소리 켜기/ })).toBeInTheDocument();

    // 재클릭 성공 — 재생 가능으로 전환되어 버튼이 사라진다
    FakeRoom.audioBehavior = "ok";
    await userEvent.click(resume);
    expect(connectedRoom()!.startAudio).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /소리 켜기/ })).toBeNull();
    });
  });

  it("접속 정보가 없으면 '접속 정보 없음' 상태를 보여준다", async () => {
    // 명시적 빈 값 stub — Vitest 도 .env.local 을 로드하므로 unstub 만으로는
    // 개발 머신의 실제 LiveKit 설정이 새어 들어와 접속에 성공해 버린다
    vi.stubEnv("VITE_LIVEKIT_URL", "");
    vi.stubEnv("VITE_LIVEKIT_TOKEN", "");
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

  it("마이크 발행이 실패하면 안내 문구를 보여주고, 이후 성공하면 지운다", async () => {
    stubSessionEnv();
    FakeRoom.micBehavior = "fail";
    renderWithProviders(<InterviewPage />, { route: "/live" });
    await screen.findByText("연결됨");

    const mic = screen.getByRole("button", { name: "마이크" });
    await userEvent.click(mic);
    expect(await screen.findByRole("alert")).toHaveTextContent("마이크를 켤 수 없어요");
    expect(mic).toHaveAttribute("aria-pressed", "false"); // 발행 안 된 상태 유지

    FakeRoom.micBehavior = "ok";
    await userEvent.click(mic);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(mic).toHaveAttribute("aria-pressed", "true");
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
