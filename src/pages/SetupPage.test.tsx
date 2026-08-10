/* SetupPage 테스트 — ①②③ 자료 선택·세션 생성 (HBB1-18) + ④ 장비 점검 (HBB1-145).
   정책 원천: docs/requirements/session/interview-start.md · device-setup.md
   마이크 정상 = 실입력 감지, 카메라 정상 = 실프레임 도착, 드롭다운도 점검 트리거. */
import { Fragment } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "react-router";
import * as fixtures from "../test/resumeFixtures";
import type { Resume } from "../api/types";
import { discardConnectedRoom } from "../hooks/useLiveKitRoom";
import { renderWithProviders } from "../test/render";
import { FakeMedia, FakeRoom } from "../test/livekitMock";
import { SetupPage } from "./SetupPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

// 이력서 목록만 케이스별로 제어한다 — 나머지 client 모듈은 원본 유지
const { fetchResumesMock } = vi.hoisted(() => ({ fetchResumesMock: vi.fn() }));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchResumes: fetchResumesMock,
}));

/** useNav 이동 결과 확인용 — 현재 경로를 노출한다 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const renderSetupPage = (route: string | { pathname: string; search?: string } = "/setup") =>
  renderWithProviders(
    <Fragment>
      <SetupPage />
      <LocationProbe />
    </Fragment>,
    { route },
  );

/** 인증 시드 — App.test 의 seedLogin 과 동일한 동기 직접 기록 (setTokens 는 비동기라 배제) */
const seedLogin = (sessionId = "sess-A") => {
  localStorage.setItem(
    "kkori.auth",
    JSON.stringify({ accessToken: "at-1", refreshToken: "rt-1", sessionId }),
  );
};

const envelope = (data: unknown, status = 201) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorEnvelope = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const SESSION_DATA = {
  id: 34,
  livekitToken: "lk-token",
  livekitUrl: "wss://lk.example",
  livekitRoom: "room-1",
};

/** 세션 생성 성공 응답으로 fetch 를 스텁한다 */
const stubSessionFetch = () => {
  const mock = vi.fn().mockImplementation(async () => envelope(SESSION_DATA));
  vi.stubGlobal("fetch", mock);
  return mock;
};

const sessionBodyOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse((mock.mock.calls[call][1] as RequestInit).body as string) as Record<string, unknown>;

const audioTrack = () => FakeMedia.tracks.find((t) => t.kind === "audio")!;
const videoTrack = () => FakeMedia.tracks.find((t) => t.kind === "video")!;

/** 점검 시작 버튼을 눌러 ready(입력 대기) 상태까지 진행 */
const startCheck = async () => {
  await userEvent.click(screen.getByRole("button", { name: "장비 점검 시작" }));
  await screen.findByText("마이크 입력 대기");
};

/** 실입력 감지 통과 — "마이크 정상" 확정 */
const speakIntoMic = async () => {
  FakeMedia.volume = 0.2;
  await screen.findByText("마이크 정상");
  FakeMedia.volume = 0;
};

/** self-view 비디오에 프레임 도착을 흉내 낸다 (jsdom 은 재생 이벤트를 안 쏜다) */
const arriveVideoFrame = () => {
  const video = screen.getByLabelText("내 카메라 미리보기");
  act(() => {
    video.dispatchEvent(new Event("playing"));
  });
};

/** 드롭다운을 열고 장치 옵션을 클릭한다 */
const pickDevice = async (pickerLabel: string, optionName: string) => {
  await userEvent.click(screen.getByLabelText(pickerLabel));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
};

beforeEach(() => {
  FakeRoom.reset();
  FakeMedia.reset();
  sessionStorage.clear();
  localStorage.clear();
  fetchResumesMock.mockReset();
  fetchResumesMock.mockResolvedValue(fixtures.resumes);
});

afterEach(() => {
  discardConnectedRoom(); // /live 가 인수하지 않은 핸드오프 보관분 격리
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SetupPage — 장비 점검", () => {
  // 장비 게이팅만 검증하는 그룹 — 완료 이력서가 없는 유저로 두어 이력서 요건을 배제한다
  beforeEach(() => {
    fetchResumesMock.mockResolvedValue([]);
  });

  it("점검 전에는 면접 시작이 비활성화되고 드롭다운은 자리 표시로 활성이다", () => {
    renderSetupPage();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "장비 점검 시작" })).toBeInTheDocument();
    expect(screen.getByText("장비 점검을 완료하면 면접을 시작할 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("카메라 확인 전")).toBeInTheDocument();
    // 드롭다운은 점검 트리거 역할 — 점검 전에도 활성 + 자리 표시
    const micPicker = screen.getByLabelText("마이크 선택");
    expect(micPicker).toBeEnabled();
    expect(micPicker).toHaveTextContent("기본 마이크");
  });

  it("드롭다운 클릭으로도 점검이 시작된다", async () => {
    renderSetupPage();
    await userEvent.click(screen.getByLabelText("마이크 선택"));
    await screen.findByText("마이크 입력 대기"); // 점검 완료 (입력 대기 진입)
    expect(FakeMedia.createLocalTracks).toHaveBeenCalled();
    // 트리거로 열린 메뉴가 장치 목록으로 전환되어 있다
    expect(await screen.findByRole("option", { name: "USB 마이크" })).toBeInTheDocument();
  });

  it("점검 후 말해야 마이크 정상·면접 시작이 활성화된다", async () => {
    renderSetupPage();
    await startCheck();
    // 입력 감지 전 — 대기 상태 + 안내 + 시작 잠금
    expect(screen.getByText("마이크에 대고 말해보세요")).toBeInTheDocument();
    expect(screen.getByText("마이크에 대고 말해 입력을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();

    await speakIntoMic();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    expect(screen.queryByText("마이크에 대고 말해보세요")).toBeNull();
  });

  it("점검을 시작하면 미리보기가 붙고 프레임 도착 후 카메라 정상이 된다", async () => {
    renderSetupPage();
    await startCheck();
    expect(screen.getByLabelText("내 카메라 미리보기")).toBeInTheDocument();
    expect(videoTrack().attach).toHaveBeenCalled();
    // 프레임 도착 전에는 확인 중
    expect(screen.getByText("카메라 확인 중")).toBeInTheDocument();
    arriveVideoFrame();
    expect(await screen.findByText("카메라 정상")).toBeInTheDocument();
    expect(screen.getByText("마이크 권한 허용됨")).toBeInTheDocument();
  });

  it("드롭다운 메뉴에 실제 장치 목록이 표시된다", async () => {
    renderSetupPage();
    await startCheck();
    await userEvent.click(screen.getByLabelText("마이크 선택"));
    const listbox = await screen.findByRole("listbox", { name: "마이크 선택" });
    await waitFor(() => {
      expect(within(listbox).getAllByRole("option")).toHaveLength(2);
    });
    expect(within(listbox).getByRole("option", { name: /내장 마이크/ })).toBeInTheDocument();
  });

  it("레벨 미터가 meter 역할과 값 범위를 노출한다", () => {
    renderSetupPage();
    const meter = screen.getByRole("meter", { name: "마이크 입력 레벨" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
  });

  it("권한 거부 시 안내와 재시도를 제공하고, 허용 후 복구한다", async () => {
    FakeMedia.trackBehavior = "denied";
    renderSetupPage();
    await userEvent.click(screen.getByRole("button", { name: "장비 점검 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("권한이 차단");
    expect(screen.getByText("마이크 권한 차단됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();

    FakeMedia.trackBehavior = "ok";
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("마이크 권한 허용됨")).toBeInTheDocument();
    await speakIntoMic();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("카메라를 쓸 수 없으면 경고를 표시하되 음성 진행을 허용한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"]; // 결합 실패(카메라 점유) → 마이크 단독 성공
    renderSetupPage();
    await startCheck();
    expect(screen.getByText("카메라 사용 불가")).toBeInTheDocument();
    expect(screen.getByText("카메라 없이 음성으로 진행해요")).toBeInTheDocument();
    // 재획득 진입점이므로 드롭다운은 활성 유지 (PRD 기능 3 카메라 재획득)
    expect(screen.getByLabelText("카메라 선택")).toBeEnabled();
    await speakIntoMic();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("카메라 사용 불가 상태에서 장치를 선택하면 미리보기를 복구한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"];
    renderSetupPage();
    await startCheck();
    expect(screen.queryByLabelText("내 카메라 미리보기")).toBeNull();

    await pickDevice("카메라 선택", "외장 웹캠");
    expect(await screen.findByLabelText("내 카메라 미리보기")).toBeInTheDocument();
    expect(screen.getByText("카메라 확인 중")).toBeInTheDocument(); // 새 트랙도 프레임 확인 대상
    arriveVideoFrame();
    expect(await screen.findByText("카메라 정상")).toBeInTheDocument();
  });

  it("카메라 전환 후에는 프레임 도착을 다시 확인한다", async () => {
    renderSetupPage();
    await startCheck();
    arriveVideoFrame();
    expect(await screen.findByText("카메라 정상")).toBeInTheDocument();

    // 전환 — 트랙 객체는 유지되고 내부 트랙만 교체되므로 "확인 중"으로 되돌아가야 한다
    await pickDevice("카메라 선택", "외장 웹캠");
    expect(await screen.findByText("카메라 확인 중")).toBeInTheDocument();
    arriveVideoFrame();
    expect(await screen.findByText("카메라 정상")).toBeInTheDocument();
  });

  it("마이크 드롭다운으로 장치를 전환한다", async () => {
    renderSetupPage();
    await startCheck();
    await pickDevice("마이크 선택", "USB 마이크");
    await waitFor(() => {
      expect(audioTrack().setDeviceId).toHaveBeenCalledWith({ exact: "mic-usb" });
    });
    expect(screen.getByLabelText("마이크 선택")).toHaveTextContent("USB 마이크");
  });

  it("마이크 전환이 진행되는 동안 면접 시작을 잠근다", async () => {
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();

    let release!: (ok: boolean) => void;
    audioTrack().setDeviceId.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    await pickDevice("마이크 선택", "USB 마이크");
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();
    expect(screen.getByLabelText("마이크 선택")).toBeDisabled();

    FakeMedia.volume = 0.2; // 전환 완료 후 재감지가 바로 이뤄지도록
    await act(async () => {
      release(true);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    });
    FakeMedia.volume = 0;
  });

  it("카메라 전환이 진행 중이어도 면접 시작은 활성 상태를 유지한다", async () => {
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    let release!: (ok: boolean) => void;
    videoTrack().setDeviceId.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    await pickDevice("카메라 선택", "외장 웹캠");
    expect(screen.getByLabelText("카메라 선택")).toBeDisabled(); // 전환 중 카메라만 잠김
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    await act(async () => {
      release(true);
    });
    await waitFor(() => {
      expect(screen.getByLabelText("카메라 선택")).toBeEnabled();
    });
  });

  it("점검 후 마이크가 모두 사라지면 시작이 다시 비활성화된다", async () => {
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    FakeMedia.devices.audioinput = [];
    act(() => {
      audioTrack().emitEnded();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("마이크 연결이 끊겼어요");
  });

  it("카메라가 사라지면 미리보기 요소를 정리한다", async () => {
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    expect(videoTrack().attach).toHaveBeenCalled();
    act(() => {
      videoTrack().emitEnded();
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("내 카메라 미리보기")).toBeNull();
    });
    expect(videoTrack().detach).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("면접 시작 시 세션을 발급받아 저장하고, 선택한 마이크와 함께 /live 로 이동한다", async () => {
    seedLogin();
    const fetchMock = stubSessionFetch();
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    // 세션 발급 요청 — 인증 첨부 + 합의 계약 본문
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/sessions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
    // 발급 결과가 /live 핸드오프 저장소에 기록된다
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.session")!)).toEqual({
      url: "wss://lk.example",
      token: "lk-token",
      room: "room-1",
      authSessionId: "sess-A",
      id: 34,
      micIntent: true, // 마이크는 점검 필수 장비 — /live 진입 시 자동 발행으로 시작
      camIntent: true, // 점검에서 카메라를 확보했으므로 /live self-view 는 켜짐으로 시작
    });
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.devicePrefs")!)).toEqual({
      micId: "mic-default",
      cameraId: "cam-default",
    });
    // 이동 전에 이 화면에서 LiveKit 접속을 확립한다 (핸드오프용 룸)
    const room = FakeRoom.instances.at(-1)!;
    expect(room.connect).toHaveBeenCalledWith("wss://lk.example", "lk-token");
  });

  it("카메라 없이(음성 진행) 시작하면 camIntent 꺼짐으로 저장하고 cameraId 를 남기지 않는다", async () => {
    seedLogin();
    stubSessionFetch();
    FakeMedia.acquireResults = ["in-use", "ok"]; // 결합 실패(카메라 점유) → 마이크 단독 성공
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.session")!)).toMatchObject({
      camIntent: false, // /live 가 예상 밖 카메라 점등 없이 placeholder 로 시작한다
    });
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.devicePrefs")!)).toEqual({
      micId: "mic-default",
    });
  });
});

describe("SetupPage — 자료 선택 (①②③)", () => {
  it("① 드롭다운에는 분석 완료 이력서만 노출된다 (선택 해제 옵션 없음)", async () => {
    renderSetupPage();
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    expect(await screen.findByText("백엔드_개발자_이력서.pdf")).toBeInTheDocument();
    expect(screen.getByText("경력기술서_2026.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/이력서 선택 안 함/)).toBeNull(); // 해제 없음 — 미선택 시작은 완료본 없는 유저만
    expect(screen.queryByText("신입_포트폴리오.pdf")).toBeNull(); // 분석 중
    expect(screen.queryByText("이력서_v1.docx")).toBeNull(); // 분석 실패
  });

  it("① 분석 완료 이력서가 없으면 업로드 안내를 표시한다", async () => {
    fetchResumesMock.mockResolvedValue([]);
    renderSetupPage();
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    expect(
      await screen.findByText("분석 완료된 이력서가 없어요 — 이력서를 업로드해 주세요."),
    ).toBeInTheDocument();
  });

  it("① 목록 조회 실패 시 실패 안내를 표시한다", async () => {
    fetchResumesMock.mockRejectedValue(new Error("network"));
    renderSetupPage();
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    expect(
      await screen.findByText("이력서 목록을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
  });

  it("쿼리 프리셀렉트: 유효한 ?resume=<id> 는 목록 도착 후 ①에 적용된다", async () => {
    let resolveList!: (value: Resume[]) => void;
    fetchResumesMock.mockReturnValueOnce(
      new Promise<Resume[]>((resolve) => {
        resolveList = resolve;
      }),
    );
    renderSetupPage({ pathname: "/setup", search: "?resume=1" });
    // 목록 도착 전 — 무효 판정 없이 미선택 유지
    expect(screen.getByLabelText("이력서 선택")).toHaveTextContent("이력서를 선택하세요");
    await act(async () => {
      resolveList(fixtures.resumes);
    });
    await waitFor(() => {
      expect(screen.getByLabelText("이력서 선택")).toHaveTextContent("백엔드_개발자_이력서.pdf");
    });
  });

  it.each([["abc"], ["999"], ["3"]])(
    "쿼리 프리셀렉트: 무효한 ?resume=%s 는 무시된다",
    async (raw) => {
      renderSetupPage({ pathname: "/setup", search: `?resume=${raw}` });
      await waitFor(() => {
        expect(fetchResumesMock).toHaveBeenCalled();
      });
      expect(screen.getByLabelText("이력서 선택")).toHaveTextContent("이력서를 선택하세요");
    },
  );

  it("쿼리 프리셀렉트보다 사용자의 직접 선택이 우선한다", async () => {
    renderSetupPage({ pathname: "/setup", search: "?resume=2" });
    await screen.findByText(/경력기술서_2026\.pdf/);
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    await userEvent.click(await screen.findByText("백엔드_개발자_이력서.pdf"));
    expect(screen.getByLabelText("이력서 선택")).toHaveTextContent("백엔드_개발자_이력서.pdf");
  });

  it("이력서를 선택해야 실전 모의가 열린다", async () => {
    renderSetupPage();
    await waitFor(() => {
      expect(fetchResumesMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: /실전 모의/ })).toBeDisabled();
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    await userEvent.click(await screen.findByText("백엔드_개발자_이력서.pdf"));
    expect(screen.getByRole("button", { name: /실전 모의/ })).toBeEnabled();
  });

  it("② 직무 기본값은 백엔드이고 직접 선택으로 바뀐다 (이력서와 무관)", async () => {
    renderSetupPage();
    expect(screen.getByLabelText("직무 선택")).toHaveTextContent("백엔드");
    await userEvent.click(screen.getByLabelText("직무 선택"));
    await userEvent.click(await screen.findByRole("option", { name: "프론트엔드" }));
    expect(screen.getByLabelText("직무 선택")).toHaveTextContent("프론트엔드");

    // 이력서를 바꿔도 직무 선택은 독립 상태로 유지된다
    await userEvent.click(screen.getByLabelText("이력서 선택"));
    await userEvent.click(await screen.findByText("경력기술서_2026.pdf"));
    expect(screen.getByLabelText("직무 선택")).toHaveTextContent("프론트엔드");
  });
});

describe("SetupPage — 세션 생성", () => {
  /** 장비 점검을 통과해 시작 가능 상태까지 진행 */
  const reachReady = async (route?: string | { pathname: string; search?: string }) => {
    renderSetupPage(route);
    await startCheck();
    await speakIntoMic();
  };

  beforeEach(() => {
    seedLogin();
    // 이력서 없는 시작은 완료 이력서가 없는 유저만 — 기본을 빈 목록으로 두고,
    // 이력서가 필요한 케이스만 픽스처 목록을 명시 주입한다
    fetchResumesMock.mockResolvedValue([]);
  });

  it("완료 이력서가 없는 유저는 resumeId 없이 FIVE_MIN 으로 시작한다", async () => {
    const fetchMock = stubSessionFetch();
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    const body = sessionBodyOf(fetchMock);
    expect(body).toEqual({ interviewType: "FIVE_MIN", position: "BACKEND" });
    expect("resumeId" in body).toBe(false);
  });

  it("이력서 선택 + 실전 모의면 resumeId 와 THIRTY_MIN 을 전송한다", async () => {
    fetchResumesMock.mockResolvedValue(fixtures.resumes);
    const fetchMock = stubSessionFetch();
    await reachReady({ pathname: "/setup", search: "?resume=1" });
    await screen.findByText(/백엔드_개발자_이력서\.pdf/);
    await userEvent.click(screen.getByRole("button", { name: /실전 모의/ }));
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    expect(sessionBodyOf(fetchMock)).toEqual({
      resumeId: 1,
      interviewType: "THIRTY_MIN",
      position: "BACKEND",
    });
  });

  it("이력서 선택 + 빠른 연습이면 resumeId 와 FIVE_MIN 을 전송한다", async () => {
    fetchResumesMock.mockResolvedValue(fixtures.resumes);
    const fetchMock = stubSessionFetch();
    await reachReady({ pathname: "/setup", search: "?resume=1" });
    await screen.findByText(/백엔드_개발자_이력서\.pdf/);
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    expect(sessionBodyOf(fetchMock)).toEqual({
      resumeId: 1,
      interviewType: "FIVE_MIN",
      position: "BACKEND",
    });
  });

  it("② 에서 직접 고른 직무가 position 으로 전송된다", async () => {
    const fetchMock = stubSessionFetch();
    await reachReady();
    await userEvent.click(screen.getByLabelText("직무 선택"));
    await userEvent.click(await screen.findByRole("option", { name: "프론트엔드" }));
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    expect(sessionBodyOf(fetchMock).position).toBe("FRONTEND");
  });

  it("LiveKit 접속이 실패하면 /live 로 이동하지 않고 안내를 표시한다", async () => {
    stubSessionFetch();
    FakeRoom.connectBehavior = "fail";
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("면접 준비에 실패했어요");
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.devicePrefs")).toBeNull(); // 이동 직전 저장이라 미기록
    // 접속 성공 후에만 저장 — 실패한 세션으로 /live 직행 재접속하는 경로가 없다
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();

    // 재클릭 = 재발급 + 재접속으로 복구
    FakeRoom.connectBehavior = "ok";
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
  });

  it("접속 확립 중에는 연결 모달이 뜨고, 취소하면 setup 에 머문다", async () => {
    stubSessionFetch();
    FakeRoom.connectBehavior = "hang";
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(
      await screen.findByText("면접실에 연결하고 있어요 — 잠시만 기다려 주세요."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => {
      expect(screen.queryByText("면접실에 연결하고 있어요 — 잠시만 기다려 주세요.")).toBeNull();
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    // 진행 중이던 접속은 중단된다
    const room = FakeRoom.instances.at(-1)!;
    expect(room.disconnect).toHaveBeenCalled();
  });

  it("발급 대기 중 취소하면 늦게 도착한 응답을 폐기한다", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await screen.findByText("면접실에 연결하고 있어요 — 잠시만 기다려 주세요."); // 발급 단계부터 모달
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    await act(async () => {
      resolveFetch(envelope(SESSION_DATA));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
  });

  it("발급 대기 중 화면을 떠나면 완료 응답이 저장·이동을 유발하지 않는다", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    const view = renderSetupPage();
    await startCheck();
    await speakIntoMic();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    view.unmount(); // TopNav 등으로 화면 이탈
    await act(async () => {
      resolveFetch(envelope(SESSION_DATA));
    });
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
  });

  it("완료 이력서가 있으면 선택 전까지 시작이 잠긴다", async () => {
    fetchResumesMock.mockResolvedValue(fixtures.resumes);
    stubSessionFetch();
    await reachReady();
    await waitFor(() => {
      expect(screen.getByText("이력서를 선택하면 면접을 시작할 수 있어요.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();

    await userEvent.click(screen.getByLabelText("이력서 선택"));
    await userEvent.click(await screen.findByText("백엔드_개발자_이력서.pdf"));
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("요청 중에는 버튼이 잠기고 재클릭해도 요청은 1회다", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    const pendingButton = await screen.findByRole("button", { name: "면접 준비 중…" });
    expect(pendingButton).toBeDisabled();
    await userEvent.click(pendingButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(envelope(SESSION_DATA));
    });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
  });

  it("발급 실패 시 인라인 안내를 표시하고 이동하지 않으며, 재클릭이 재시도다", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        errorEnvelope("S002", "면접 룸 생성에 실패했습니다.", 500),
      )
      .mockImplementation(async () => envelope(SESSION_DATA));
    vi.stubGlobal("fetch", fetchMock);
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("면접 준비에 실패했어요");
    expect(alert).toHaveTextContent("(면접 룸 생성에 실패했습니다.)"); // 전용 문구 없는 코드는 서버 메시지를 덧붙인다
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
  });

  it("필수 응답 필드가 비어 있으면 성공으로 취급하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => envelope({ ...SESSION_DATA, livekitRoom: "" })),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("면접 준비에 실패했어요");
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
  });

  it("응답의 세션 id 를 핸드오프에 저장한다", async () => {
    stubSessionFetch();
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/live");
    });
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.session")!)).toMatchObject({ id: 34 });
  });

  it("응답의 세션 id 가 없거나 숫자가 아니면 성공으로 취급하지 않는다", async () => {
    const withoutId: Record<string, unknown> = { ...SESSION_DATA };
    delete withoutId.id;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(async () => envelope(withoutId))
        .mockImplementation(async () => envelope({ ...SESSION_DATA, id: "34" })),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("면접 준비에 실패했어요");
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();

    // 숫자가 아닌 id(직렬화 이상 등)도 동일하게 거부 — 접속 시도 전에 걸러진다
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("면접 준비에 실패했어요");
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
    expect(FakeRoom.instances).toHaveLength(0); // 응답 검증 실패 시 Room 접속 시도 없음
  });

  it("S003(진행 중 세션)은 전용 안내를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          errorEnvelope("S003", "진행 중인 면접 세션이 있습니다.", 409),
        ),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미 진행 중인 면접이 있어요. 기존 면접을 종료한 뒤 다시 시작해 주세요.",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
  });

  it("R010(분석 진행 중)·R011(분석 실패)은 이력서 상태 안내를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(async () =>
          errorEnvelope("R010", "이력서 분석이 진행 중입니다.", 409),
        )
        .mockImplementation(async () =>
          errorEnvelope("R011", "이력서 분석이 실패한 상태입니다.", 409),
        ),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "선택한 이력서의 분석이 아직 끝나지 않았어요. 분석 완료 후 다시 시작해 주세요.",
    );

    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "선택한 이력서의 분석에 실패했어요. 재분석을 마친 뒤 다시 시작해 주세요.",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
  });

  it("요청 중 계정이 교체되면 이전 계정의 응답을 폐기한다", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    await reachReady();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    await screen.findByRole("button", { name: "면접 준비 중…" });
    seedLogin("sess-B"); // 응답 대기 중 다른 탭에서 계정 교체
    await act(async () => {
      resolveFetch(envelope(SESSION_DATA));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "면접 시작" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.session")).toBeNull();
  });

  it("핸드오프 저장이 실패하면 이동하지 않고 안내를 표시한다", async () => {
    stubSessionFetch();
    await reachReady();
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      // 핸드오프 키만 실패 — 장치 선호 저장은 통과시켜야 오검증이 없다
      if (key === "hbb.interview.session") throw new DOMException("quota", "QuotaExceededError");
      originalSetItem.call(this, key, value);
    });
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("면접 준비에 실패했어요");
    expect(screen.getByTestId("location")).toHaveTextContent("/setup");
    expect(sessionStorage.getItem("hbb.interview.devicePrefs")).toBeNull(); // 저장 실패 시 선호도 안 덮음
  });
});
