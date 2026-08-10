/* InterviewPage 테스트 — 진입 게이트(HBB1-18)·LiveKit 룸 접속(HBB1-262)·
   면접 종료(HBB1-294)·재연결(HBB1-308) 검증.
   livekit-client 는 FakeRoom 목, 접속 세션은 setup 핸드오프 저장값으로 주입한다. */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router";
import type { Room } from "livekit-client";
import { reenterInterviewSession } from "../api/client";
import { REENTRY_SESSION_ENDED_CODE } from "../api/reentryContract";
import { ApiError } from "../api/request";
import { saveInterviewSession, type InterviewSessionRecord } from "../hooks/interviewSession";
import { discardConnectedRoom, stashConnectedRoom } from "../hooks/useLiveKitRoom";
import { renderWithProviders } from "../test/render";
import { FakeRoom, makeFakeAudioTrack } from "../test/livekitMock";
import { InterviewPage } from "./InterviewPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

// 재입장 발급만 목으로 제어한다 — 나머지 client 는 실구현(fetch 스텁 경유) 유지
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  reenterInterviewSession: vi.fn(),
}));

// 자동 시도 지연은 상수 목으로 제거 — 스케줄 "값"이 아니라 "동작"(횟수·소진·수동)을 검증한다
vi.mock("../api/reentryContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/reentryContract")>()),
  REENTRY_ATTEMPT_DELAYS_MS: [0, 0, 0],
}));

const reenterMock = vi.mocked(reenterInterviewSession);

// 기본값: 발급이 영원히 대기 — 재연결을 검증하지 않는 테스트에 개입하지 않게 한다
beforeEach(() => {
  reenterMock.mockReset();
  reenterMock.mockImplementation(() => new Promise<never>(() => {}));
});

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

  it("접속이 거부되면 재연결 오버레이가 상태를 대신 전한다 (상태 필은 숨김)", async () => {
    FakeRoom.connectBehavior = "fail";
    renderLive();
    expect(await screen.findByTestId("reconnect-overlay")).toBeInTheDocument();
    expect(screen.queryByText("접속 실패")).toBeNull();
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

  it("종료 확인 시 /end 를 호출하고, 202 수리 즉시 완료 화면으로 전환한다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => envelope(null));
    vi.stubGlobal("fetch", fetchMock);
    renderLive();
    await screen.findByText("연결됨");

    await clickEndAndConfirm();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sessions/34/end");
    expect(init.method).toBe("POST");

    // 202 = 종료 확정 — 클로징 발화를 기다리지 않는 즉시 종료 UX (ROOM_DELETED 불필요)
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
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

  it("/end 없이 도착한 ROOM_DELETED(시간 만료 자연 종료)도 동일하게 전환한다", async () => {
    renderLive();
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.emitDisconnected(ROOM_DELETED);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("그 외 사유의 해제는 종료로 전환하지 않고 재연결 오버레이를 띄운다", async () => {
    renderLive();
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    expect(await screen.findByTestId("reconnect-overlay")).toBeInTheDocument();
    expect(screen.queryByTestId("ended-screen")).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it("이미 연결이 끊긴 상태의 종료는 202 수리만으로 완료 화면에 수렴한다", async () => {
    // ROOM_DELETED 를 더 받을 수 없는 상태 — 202(서버 terminal 수렴 보장)가 근거다
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => envelope(null)),
    );
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");

    await userEvent.click(within(overlay).getByRole("button", { name: "면접 종료" }));
    await screen.findByText("면접을 종료할까요?");
    await userEvent.click(screen.getByRole("button", { name: "종료하기" }));
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("S008(종료 신호 발신 실패)도 종료 의도가 기록된 상태라 즉시 완료 화면으로 수렴한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          errorEnvelope("S008", "종료 요청 처리에 실패했습니다.", 500),
        ),
    );
    renderLive();
    await screen.findByText("연결됨");

    await clickEndAndConfirm();
    // S008 = 종료 의도 기록 + 서버 fallback 이 최대 180초 내 룸 종료 보장 — 202 와 동일 수렴
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

/* ---------- 재연결·재입장 (HBB1-308) — 정책 원천: docs/requirements/session/interview-reconnect.md ---------- */

const reenterResponse = (token: string) => ({
  url: "wss://re.example",
  token,
  room: "room-1",
});

describe("InterviewPage — 재연결·재입장", () => {
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

  it("ROOM_DELETED 가 아닌 해제는 오버레이를 띄우고 자동 재입장으로 새 토큰 재접속한다", async () => {
    // 발급을 붙잡아 오버레이가 안정 표시된 상태에서 검증한다 (즉시 성공은 순간 복구라 스쳐 간다)
    let resolveIssued!: (value: ReturnType<typeof reenterResponse>) => void;
    reenterMock.mockReturnValue(
      new Promise((resolve) => {
        resolveIssued = resolve;
      }),
    );
    renderLive();
    await screen.findByText("연결됨");

    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    expect(await screen.findByTestId("reconnect-overlay")).toBeInTheDocument();
    expect(screen.getByText("면접 시간은 계속 진행되고 있어요")).toBeInTheDocument();

    await waitFor(() => {
      // useMutation 이 두 번째 인자(context)를 덧붙인다 — 세션 id 전달만 검증
      expect(reenterMock.mock.calls[0]?.[0]).toBe(34);
    });
    act(() => {
      resolveIssued(reenterResponse("jwt-token-2"));
    });
    await waitFor(() => {
      expect(vi.mocked(connectedRoom()!.connect)).toHaveBeenLastCalledWith(
        "wss://re.example",
        "jwt-token-2",
      );
    });
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("reconnect-overlay")).toBeNull();
    });
    // 접속 성공 후에만 저장값 갱신 — id·authSessionId 는 보존된다
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toMatchObject({
      token: "jwt-token-2",
      id: 34,
      authSessionId: "sess-A",
    });
    // 재접속 성공 후 잔존 disconnectReason 이 재발화를 만들지 않는다 — 추가 발급 없음
    expect(reenterMock).toHaveBeenCalledTimes(1);
  });

  it("ROOM_DELETED 해제는 재입장을 시도하지 않는다 (기존 계약 회귀)", async () => {
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(ROOM_DELETED);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(reenterMock).not.toHaveBeenCalled();
  });

  it("발급 진행 중에는 수동 버튼이 비활성화된다 (단일 진행)", async () => {
    // 기본 목 = 영원히 대기 — 첫 발급이 in-flight 로 남는다
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(1);
    });
    expect(within(overlay).getByText("다시 연결하는 중…")).toBeInTheDocument();
    expect(within(overlay).getByRole("button", { name: /다시 연결$/ })).toBeDisabled();
  });

  it("자동 시도 소진 후 수동 '다시 연결'이 새 발급부터 재시도한다", async () => {
    reenterMock.mockRejectedValue(new Error("network down"));
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");

    // 자동 3회 소진 — 수동 전용 안내로 전환된다
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(3);
    });
    expect(
      await within(overlay).findByText(/연결하지 못했어요\. 네트워크를 확인한 뒤/),
    ).toBeInTheDocument();

    reenterMock.mockResolvedValue(reenterResponse("jwt-token-3"));
    await userEvent.click(within(overlay).getByRole("button", { name: /다시 연결$/ }));
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(4);
    });
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("reconnect-overlay")).toBeNull();
    });
  });

  it("재입장이 '이미 종료'로 거부되면 저장값을 정리하고 완료 화면으로 수렴한다", async () => {
    reenterMock.mockRejectedValue(
      new ApiError(REENTRY_SESSION_ENDED_CODE, "이미 종료된 면접입니다.", 409),
    );
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(reenterMock).toHaveBeenCalledTimes(1);
  });

  it("종료 확정(202) 시 재입장을 멈추고 수렴하며, 늦은 발급 응답은 폐기한다", async () => {
    let resolveIssued!: (value: ReturnType<typeof reenterResponse>) => void;
    reenterMock.mockReturnValue(
      new Promise((resolve) => {
        resolveIssued = resolve;
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => envelope(null)),
    );
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(1); // 발급 in-flight 상태에서 종료
    });
    const room = connectedRoom()!;
    const connectCalls = vi.mocked(room.connect).mock.calls.length;

    await userEvent.click(within(overlay).getByRole("button", { name: "면접 종료" }));
    await screen.findByText("면접을 종료할까요?");
    await userEvent.click(screen.getByRole("button", { name: "종료하기" }));
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    // 종료 확정 후 도착한 발급 응답은 폐기 — 새 접속이 생기지 않는다
    act(() => {
      resolveIssued(reenterResponse("jwt-late"));
    });
    await waitFor(() => {
      expect(vi.mocked(room.connect).mock.calls.length).toBe(connectCalls);
    });
  });

  it("연결 없는 상태의 S008 도 202 와 동일하게 완료 화면으로 수렴한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          errorEnvelope("S008", "종료 요청 처리에 실패했습니다.", 500),
        ),
    );
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");

    await userEvent.click(within(overlay).getByRole("button", { name: "면접 종료" }));
    await screen.findByText("면접을 종료할까요?");
    await userEvent.click(screen.getByRole("button", { name: "종료하기" }));
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("종료가 일반 실패면 안내를 보여주고 재입장(수동)이 재개된다", async () => {
    reenterMock.mockRejectedValue(new Error("network down"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          errorEnvelope("C001", "서버 내부 오류가 발생했습니다.", 500),
        ),
    );
    renderLive();
    await screen.findByText("연결됨");
    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN);
    });
    const overlay = await screen.findByTestId("reconnect-overlay");
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(3); // 자동 소진
    });

    await userEvent.click(within(overlay).getByRole("button", { name: "면접 종료" }));
    await screen.findByText("면접을 종료할까요?");
    await userEvent.click(screen.getByRole("button", { name: "종료하기" }));
    // 종료 미성립 — 수렴하지 않고 실패 안내가 남는다
    expect(await within(overlay).findByText(/면접 종료 요청에 실패했어요/)).toBeInTheDocument();
    expect(screen.queryByTestId("ended-screen")).toBeNull();

    // 재입장 재개 — 수동 재시도가 새 발급을 만든다
    reenterMock.mockResolvedValue(reenterResponse("jwt-token-4"));
    await userEvent.click(within(overlay).getByRole("button", { name: /다시 연결$/ }));
    await waitFor(() => {
      expect(reenterMock).toHaveBeenCalledTimes(4);
    });
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
  });

  it("새로고침 스테일 토큰의 접속 실패는 재입장 폴백으로 복구된다", async () => {
    FakeRoom.connectBehavior = "fail";
    let resolveIssued!: (value: ReturnType<typeof reenterResponse>) => void;
    reenterMock.mockReturnValue(
      new Promise((resolve) => {
        resolveIssued = resolve;
      }),
    );
    renderLive();

    expect(await screen.findByTestId("reconnect-overlay")).toBeInTheDocument();
    act(() => {
      FakeRoom.connectBehavior = "ok"; // 새 토큰부터 접속이 성립한다
      resolveIssued(reenterResponse("jwt-token-2"));
    });
    await waitFor(() => {
      expect(vi.mocked(connectedRoom()!.connect)).toHaveBeenLastCalledWith(
        "wss://re.example",
        "jwt-token-2",
      );
    });
    expect(await screen.findByText("연결됨")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("reconnect-overlay")).toBeNull();
    });
  });

  it("재입장 폴백의 '이미 종료' 거부도 완료 화면으로 수렴한다 (새로고침 창 소진)", async () => {
    FakeRoom.connectBehavior = "fail";
    reenterMock.mockRejectedValue(
      new ApiError(REENTRY_SESSION_ENDED_CODE, "이미 종료된 면접입니다.", 409),
    );
    renderLive();
    expect(await screen.findByTestId("ended-screen")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

/* ---------- 마이크 의도 상태(micIntent) 복원 — HBB1-308 ---------- */

describe("InterviewPage — 마이크 복원", () => {
  beforeEach(() => {
    discardConnectedRoom();
    FakeRoom.reset();
    sessionStorage.clear();
    localStorage.clear();
    seedSession();
  });

  it("토글 성공이 micIntent 를 저장값에 반영한다", async () => {
    renderLive();
    await screen.findByText("연결됨");
    const mic = screen.getByRole("button", { name: "마이크" });

    await userEvent.click(mic);
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).micIntent).toBe(true);
    });
    await userEvent.click(mic);
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).micIntent).toBe(false);
    });
  });

  it("연결 해제로 꺼진 발행 상태는 micIntent 에 기록되지 않는다", async () => {
    renderLive();
    await screen.findByText("연결됨");
    await userEvent.click(screen.getByRole("button", { name: "마이크" }));
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).micIntent).toBe(true);
    });

    act(() => {
      connectedRoom()!.emitDisconnected(SERVER_SHUTDOWN); // SDK 발행은 내려가는 국면
    });
    await screen.findByTestId("reconnect-overlay");
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).micIntent).toBe(true);
  });

  it("새로고침 복원 — 폴백 없이 접속해도 저장된 micIntent 가 자동 재발행된다", async () => {
    seedSession({ micIntent: true });
    renderLive();
    await screen.findByText("연결됨");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "마이크" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(reenterMock).not.toHaveBeenCalled();
  });

  it("토큰 A 에서 복원한 뒤 토큰 B 재입장에서도 복원이 다시 실행된다", async () => {
    seedSession({ micIntent: true });
    reenterMock.mockResolvedValue(reenterResponse("jwt-token-B"));
    renderLive();
    await screen.findByText("연결됨");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "마이크" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    const room = connectedRoom()!;
    const enableCalls = () =>
      vi
        .mocked(room.localParticipant.setMicrophoneEnabled)
        .mock.calls.filter(([enabled]) => enabled === true).length;
    const restoredOnA = enableCalls();

    act(() => {
      room.emitDisconnected(SERVER_SHUTDOWN);
    });
    await waitFor(() => {
      expect(vi.mocked(room.connect)).toHaveBeenLastCalledWith("wss://re.example", "jwt-token-B");
    });
    await screen.findByText("연결됨");
    // 토큰 세대가 바뀌었으므로 복원이 1회 더 실행된다
    await waitFor(() => {
      expect(enableCalls()).toBeGreaterThan(restoredOnA);
    });
  });
});
