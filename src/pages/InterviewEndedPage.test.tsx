/* InterviewEndedPage 테스트 — 종료 흐름 표식(state.ended)이 있어야만 성립하는 화면.
   정책 원천: docs/requirements/session/interview-end.md */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../test/render";
import { InterviewEndedPage } from "./InterviewEndedPage";

const renderEnded = (route: string | { pathname: string; state?: unknown }) =>
  renderWithProviders(
    <Routes>
      <Route path="/live/ended" element={<InterviewEndedPage />} />
      <Route path="/dashboard" element={<div data-testid="dash-screen" />} />
    </Routes>,
    { route },
  );

describe("InterviewEndedPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("종료 흐름으로 진입하면 완료 안내와 대시보드 버튼을 보여준다", async () => {
    renderEnded({ pathname: "/live/ended", state: { ended: true } });
    expect(screen.getByText("면접이 끝났어요")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "대시보드로 이동" }));
    expect(await screen.findByTestId("dash-screen")).toBeInTheDocument();
  });

  it("종료 표식 없는 직행은 대시보드로 돌려보낸다", async () => {
    renderEnded("/live/ended");
    expect(await screen.findByTestId("dash-screen")).toBeInTheDocument();
    expect(screen.queryByText("면접이 끝났어요")).toBeNull();
  });

  it("재입장 거부 수렴은 중립 부제를 보여준다 — 리포트 언급 없음", () => {
    renderEnded({ pathname: "/live/ended", state: { ended: true, reason: "reentry-denied" } });
    expect(screen.getByText("면접이 끝났어요")).toBeInTheDocument();
    expect(screen.getByText("면접이 이미 종료되어 다시 입장할 수 없어요.")).toBeInTheDocument();
    expect(screen.queryByText(/리포트에서 결과/)).toBeNull();
  });

  it("정상 종료 수렴의 기존 부제는 변하지 않는다", () => {
    renderEnded({ pathname: "/live/ended", state: { ended: true } });
    expect(screen.getByText(/답변 분석이 끝나면/)).toBeInTheDocument();
    expect(screen.queryByText(/다시 입장할 수 없어요/)).toBeNull();
  });
});
