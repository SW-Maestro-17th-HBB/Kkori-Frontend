/* InterviewPage 테스트 — 진입 게이트(HBB1-18)와 LiveKit 룸 접속(HBB1-262) 검증.
   livekit-client 는 FakeRoom 목, 접속 세션은 setup 핸드오프 저장값으로 주입한다. */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router";
import type { Room } from "livekit-client";
import { saveInterviewSession, type InterviewSessionRecord } from "../hooks/interviewSession";
import { discardConnectedRoom, stashConnectedRoom } from "../hooks/useLiveKitRoom";
import { renderWithProviders } from "../test/render";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import { InterviewPage } from "./InterviewPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

/** StrictMode 이중 마운트로 버려지는 인스턴스가 생긴다 — 접속된 룸 중 가장 최근 것을 쓴다 */
const connectedRoom = () =>
  FakeRoom.instances.filter((room) => vi.mocked(room.connect).mock.calls.length > 0).at(-1);

const SESSION_KEY = "hbb.interview.session";

/** 인증 시드 — App.test 의 seedLogin 과 동일한 동기 직접 기록 */
const seedLogin = (sessionId = "sess-A") => {
  localStorage.setItem(
    "kkori.auth",
    JSON.stringify({ accessToken: "at-1", refreshToken: "rt-1", sessionId }),
  );
};

/** setup 핸드오프 상태 재현 — 인증 + 저장값을 동기로 시드한다 */
const seedSession = (over: Partial<InterviewSessionRecord> = {}) => {
  seedLogin();
  saveInterviewSession({
    url: "wss://test.example",
    token: "jwt-token",
    room: "room-1",
    authSessionId: "sess-A",
    id: 34,
    ...over,
  });
};

/** /setup 리다이렉트를 관찰할 수 있게 라우트 테이블로 렌더한다 */
const renderLive = () =>
  renderWithProviders(
    <Routes>
      <Route path="/live" element={<InterviewPage />} />
      <Route path="/setup" element={<div data-testid="setup-screen" />} />
    </Routes>,
    { route: "/live" },
  );

describe("InterviewPage — 진입 게이트", () => {
  beforeEach(() => {
    discardConnectedRoom();
    FakeRoom.reset();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("저장값 없이 직행하면 /setup 으로 돌려보내고 접속하지 않는다", async () => {
    seedLogin(); // 인증은 있으나 세션 발급 없이 직행
    renderLive();
    expect(await screen.findByTestId("setup-screen")).toBeInTheDocument();
    expect(connectedRoom()).toBeUndefined();
  });

  it("저장값이 손상돼 있으면 제거하고 /setup 으로 돌려보낸다", async () => {
    seedLogin();
    sessionStorage.setItem(SESSION_KEY, "{oops");
    renderLive();
    expect(await screen.findByTestId("setup-screen")).toBeInTheDocument();
    await waitFor(() => {
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  it("필수 필드가 빠진 저장값도 게이트를 통과하지 못한다", async () => {
    seedLogin();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ url: "wss://test.example" }));
    renderLive();
    expect(await screen.findByTestId("setup-screen")).toBeInTheDocument();
    expect(connectedRoom()).toBeUndefined();
  });

  it("발급 당시 계정과 현재 계정이 다르면 저장값을 제거하고 /setup 으로 돌려보낸다", async () => {
    seedSession({ authSessionId: "sess-other" }); // 현재 인증은 sess-A
    renderLive();
    expect(await screen.findByTestId("setup-screen")).toBeInTheDocument();
    expect(connectedRoom()).toBeUndefined();
    await waitFor(() => {
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  it("게이트 실패 시 보관된 연결(핸드오프)도 폐기한다", async () => {
    seedLogin();
    // 이전 시도의 연결이 보관돼 있으나 저장값이 없어 게이트를 통과하지 못하는 상황
    const { Room: MockRoom } = await import("livekit-client");
    const established = new MockRoom() as unknown as InstanceType<typeof FakeRoom>;
    await established.connect("wss://test.example", "jwt-token");
    stashConnectedRoom(established as unknown as Room, {
      url: "wss://test.example",
      token: "jwt-token",
      authSessionId: "sess-A",
    });

    renderLive();
    expect(await screen.findByTestId("setup-screen")).toBeInTheDocument();
    await waitFor(() => {
      expect(vi.mocked(established.disconnect)).toHaveBeenCalled();
    });
  });
});

describe("InterviewPage — LiveKit 룸 접속", () => {
  beforeEach(() => {
    discardConnectedRoom();
    FakeRoom.reset();
    sessionStorage.clear();
    localStorage.clear();
    seedSession();
  });

  it("저장된 세션으로 룸에 접속하고 상태 칩이 '연결됨'으로 바뀐다", async () => {
    renderLive();
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
    expect(connectedRoom()!.connect).toHaveBeenCalledWith("wss://test.example", "jwt-token");
  });

  it("접속이 거부되면 '접속 실패' 상태를 보여준다", async () => {
    FakeRoom.connectBehavior = "fail";
    renderLive();
    expect(await screen.findByText("접속 실패")).toBeInTheDocument();
  });

  it("자동재생이 막히면 '소리 켜기'가 나타나고, 실패 시 유지되다 재클릭 성공 시 사라진다", async () => {
    renderLive();
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

  it("마이크 버튼은 연결 중에만 활성화되고 클릭으로 발행을 토글한다", async () => {
    renderLive();
    await screen.findByText("연결됨");
    const mic = screen.getByRole("button", { name: "마이크" });
    expect(mic).toBeEnabled();
    expect(mic).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(mic);
    await waitFor(() => {
      expect(mic).toHaveAttribute("aria-pressed", "true");
    });

    // 연결이 끊기면 발행 불가 — 비활성으로 잠긴다
    act(() => {
      connectedRoom()!.setState("disconnected");
    });
    expect(mic).toBeDisabled();
  });

  it("마이크 발행이 실패하면 안내 문구를 보여주고, 이후 성공하면 지운다", async () => {
    FakeRoom.micBehavior = "fail";
    renderLive();
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
    renderLive();
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
