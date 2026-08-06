/* InterviewPage 테스트 — 진입 게이트(HBB1-18)와 LiveKit 룸 접속(HBB1-262) 검증.
   livekit-client 는 FakeRoom 목, 접속 세션은 setup 핸드오프 저장값으로 주입한다. */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** /setup 리다이렉트·/live/ended 전환을 관찰할 수 있게 라우트 테이블로 렌더한다 */
const renderLive = () =>
  renderWithProviders(
    <Routes>
      <Route path="/live" element={<InterviewPage />} />
      <Route path="/live/ended" element={<div data-testid="ended-screen" />} />
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

/* ---------- 면접 종료 (HBB1-294) — 정책 원천: docs/requirements/session/interview-end.md ---------- */

const envelope = (data: unknown, status = 202) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorEnvelope = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ROOM_DELETED = 5;
const SERVER_SHUTDOWN = 3;

/** 종료 확인 모달을 거쳐 /end 요청까지 진행한다 */
const clickEndAndConfirm = async () => {
  await userEvent.click(screen.getByRole("button", { name: "면접 종료" }));
  await screen.findByText("면접을 종료할까요?");
  await userEvent.click(screen.getByRole("button", { name: "종료하기" }));
};

describe("InterviewPage — 면접 종료", () => {
  beforeEach(() => {
    discardConnectedRoom();
    FakeRoom.reset();
    sessionStorage.clear();
    localStorage.clear();
    seedSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("종료 확인 시 /end 를 호출하고, 즉시 disconnect 하지 않은 채 마무리 중 상태가 된다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => envelope(null));
    vi.stubGlobal("fetch", fetchMock);
    renderLive();
    await screen.findByText("연결됨");

    // StrictMode 이중 마운트의 cleanup disconnect 는 접속 확립 과정의 잡음 —
    // "종료 요청이 disconnect 를 유발하지 않는다"는 이후의 증가분으로 판정한다
    const disconnectsBeforeEnd = vi.mocked(connectedRoom()!.disconnect).mock.calls.length;
    await clickEndAndConfirm();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sessions/34/end");
    expect(init.method).toBe("POST");

    // 202 는 수리일 뿐 — 클로징 발화가 이어지므로 연결을 끊지 않고 대기한다
    expect(await screen.findByRole("button", { name: "면접 마무리 중…" })).toBeDisabled();
    expect(vi.mocked(connectedRoom()!.disconnect).mock.calls.length).toBe(disconnectsBeforeEnd);
    expect(screen.queryByTestId("ended-screen")).toBeNull();
    expect(screen.getByText("연결됨")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("계속하기로 닫으면 /end 를 호출하지 않는다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => envelope(null));
    vi.stubGlobal("fetch", fetchMock);
    renderLive();
    await screen.findByText("연결됨");

    await userEvent.click(screen.getByRole("button", { name: "면접 종료" }));
    await screen.findByText("면접을 종료할까요?");
    await userEvent.click(screen.getByRole("button", { name: "계속하기" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "면접 종료" })).toBeEnabled();
  });

  it("ROOM_DELETED 해제는 저장값을 지우고 완료 화면으로 전환한다 (버튼 종료 경로)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => envelope(null)),
    );
    renderLive();
    await screen.findByText("연결됨");
    await clickEndAndConfirm();
    await screen.findByRole("button", { name: "면접 마무리 중…" });

    act(() => {
      connectedRoom()!.emitDisconnected(ROOM_DELETED);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("/end 없이 도착한 ROOM_DELETED(시간 만료 자연 종료)도 동일하게 전환한다", async () => {
    renderLive();
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.emitDisconnected(ROOM_DELETED);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("그 외 사유의 해제는 전환하지 않고 기존 '연결 끊김' 표시를 유지한다", async () => {
    renderLive();
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    expect(await screen.findByText("연결 끊김")).toBeInTheDocument();
    expect(screen.queryByTestId("ended-screen")).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("S008 실패는 지연 안내 + 재시도를 제공하고, 재시도의 202(멱등)로 마무리 중에 복귀한다", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        errorEnvelope("S008", "종료 요청 처리에 실패했습니다.", 500),
      )
      .mockImplementation(async () => envelope(null));
    vi.stubGlobal("fetch", fetchMock);
    renderLive();
    await screen.findByText("연결됨");

    const disconnectsBeforeEnd = vi.mocked(connectedRoom()!.disconnect).mock.calls.length;
    await clickEndAndConfirm();
    // 종료 의도는 이미 기록됨 — 기다려도 안전하다는 지연 안내 + 명시 재시도
    expect(await screen.findByRole("alert")).toHaveTextContent("종료 처리가 지연되고 있어요");
    expect(screen.getByRole("button", { name: "면접 종료" })).toBeEnabled();

    // 재호출은 잔존 룸 삭제를 재시도하는 설계된 복구 경로 — 202 no-op 로 수리된다
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: "면접 마무리 중…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vi.mocked(connectedRoom()!.disconnect).mock.calls.length).toBe(disconnectsBeforeEnd);

    act(() => {
      connectedRoom()!.emitDisconnected(ROOM_DELETED);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
  });
});
