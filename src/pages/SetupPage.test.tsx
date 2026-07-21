/* SetupPage 테스트 — ④ 카메라·마이크 점검과 면접 시작 게이팅 검증 (HBB1-145).
   정책 원천: docs/requirements/session/device-setup.md
   마이크 정상 = 실입력 감지, 카메라 정상 = 실프레임 도착, 드롭다운도 점검 트리거. */
import { Fragment } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "react-router";
import { renderWithProviders } from "../test/render";
import { FakeMedia, FakeRoom } from "../test/livekitMock";
import { SetupPage } from "./SetupPage";

vi.mock("livekit-client", async () => (await import("../test/livekitMock")).createLiveKitMock());

/** useNav 이동 결과 확인용 — 현재 경로를 노출한다 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

const renderSetupPage = () =>
  renderWithProviders(
    <Fragment>
      <SetupPage />
      <LocationProbe />
    </Fragment>,
    { route: "/setup" },
  );

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

describe("SetupPage — 장비 점검", () => {
  beforeEach(() => {
    FakeRoom.reset();
    FakeMedia.reset();
    sessionStorage.clear();
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

  it("면접 시작 시 선택한 마이크를 저장하고 /live 로 이동한다", async () => {
    renderSetupPage();
    await startCheck();
    await speakIntoMic();
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.devicePrefs")!)).toEqual({
      micId: "mic-default",
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/live");
  });
});
