/* SetupPage 테스트 — ④ 카메라·마이크 점검과 면접 시작 게이팅 검증 (HBB1-145).
   정책 원천: docs/requirements/session/device-setup.md */
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

/** 점검 시작 버튼을 눌러 ready 상태까지 진행 */
const startCheck = async () => {
  await userEvent.click(screen.getByRole("button", { name: "장비 점검 시작" }));
  await screen.findByText("마이크 정상");
};

describe("SetupPage — 장비 점검", () => {
  beforeEach(() => {
    FakeRoom.reset();
    FakeMedia.reset();
    sessionStorage.clear();
  });

  it("점검 전에는 면접 시작이 비활성화되고 안내가 보인다", () => {
    renderSetupPage();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "장비 점검 시작" })).toBeInTheDocument();
    expect(screen.getByText("장비 점검을 완료하면 면접을 시작할 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText("카메라 확인 전")).toBeInTheDocument();
    expect(screen.getByLabelText("마이크 선택")).toBeDisabled();
  });

  it("점검을 시작하면 미리보기·장치 목록·정상 확인이 채워진다", async () => {
    renderSetupPage();
    await startCheck();
    expect(screen.getByLabelText("내 카메라 미리보기")).toBeInTheDocument();
    expect(videoTrack().attach).toHaveBeenCalled();
    expect(screen.getByText("카메라 정상")).toBeInTheDocument();
    expect(screen.getByText("마이크 권한 허용됨")).toBeInTheDocument();
    const micSelect = screen.getByLabelText("마이크 선택");
    await waitFor(() => {
      expect(within(micSelect).getAllByRole("option")).toHaveLength(2);
    });
    expect(micSelect).toBeEnabled();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("카메라를 쓸 수 없으면 경고를 표시하되 음성 진행을 허용한다", async () => {
    FakeMedia.acquireResults = ["in-use", "ok"]; // 결합 실패(카메라 점유) → 마이크 단독 성공
    renderSetupPage();
    await startCheck();
    expect(screen.getByText("카메라 사용 불가")).toBeInTheDocument();
    expect(screen.getByText("카메라 없이 음성으로 진행해요")).toBeInTheDocument();
    expect(screen.getByLabelText("카메라 선택")).toBeDisabled();
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
  });

  it("마이크 select 로 장치를 전환한다", async () => {
    renderSetupPage();
    await startCheck();
    const micSelect = screen.getByLabelText("마이크 선택");
    await waitFor(() => {
      expect(within(micSelect).getAllByRole("option")).toHaveLength(2);
    });
    await userEvent.selectOptions(micSelect, "mic-usb");
    await waitFor(() => {
      expect(audioTrack().setDeviceId).toHaveBeenCalledWith({ exact: "mic-usb" });
    });
  });

  it("마이크 전환이 진행되는 동안 면접 시작을 잠근다", async () => {
    renderSetupPage();
    await startCheck();
    const micSelect = screen.getByLabelText("마이크 선택");
    await waitFor(() => {
      expect(within(micSelect).getAllByRole("option")).toHaveLength(2);
    });
    let release!: (ok: boolean) => void;
    audioTrack().setDeviceId.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    await userEvent.selectOptions(micSelect, "mic-usb");
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeDisabled();
    expect(micSelect).toBeDisabled();
    await act(async () => {
      release(true);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    });
  });

  it("카메라 전환이 진행 중이어도 면접 시작은 활성 상태를 유지한다", async () => {
    renderSetupPage();
    await startCheck();
    const cameraSelect = screen.getByLabelText("카메라 선택");
    await waitFor(() => {
      expect(within(cameraSelect).getAllByRole("option")).toHaveLength(2);
    });
    let release!: (ok: boolean) => void;
    videoTrack().setDeviceId.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    await userEvent.selectOptions(cameraSelect, "cam-usb");
    expect(cameraSelect).toBeDisabled(); // 전환 중 카메라 select 만 잠긴다
    expect(screen.getByRole("button", { name: "면접 시작" })).toBeEnabled();
    await act(async () => {
      release(true);
    });
    await waitFor(() => {
      expect(cameraSelect).toBeEnabled();
    });
  });

  it("점검 후 마이크가 모두 사라지면 시작이 다시 비활성화된다", async () => {
    renderSetupPage();
    await startCheck();
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
    await userEvent.click(screen.getByRole("button", { name: "면접 시작" }));
    expect(JSON.parse(sessionStorage.getItem("hbb.interview.devicePrefs")!)).toEqual({
      micId: "mic-default",
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/live");
  });
});
