/* 랜딩 — 근거 없는 수치가 없고, 예시 리포트 영역이 /sample 과 같은 픽스처 값을 보여주는지 검증 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { sampleReportDetail } from "../api/fixtures";
import { ROUTES } from "../routes";
import { renderWithProviders } from "../test/render";
import { LandingPage } from "./LandingPage";

function renderLanding() {
  return renderWithProviders(
    <Routes>
      <Route path={ROUTES.landing} element={<LandingPage />} />
      <Route path={ROUTES.sample} element={<h1>SAMPLE_PAGE</h1>} />
      <Route path={ROUTES.auth} element={<h1>AUTH_PAGE</h1>} />
    </Routes>,
    { route: ROUTES.landing },
  );
}

describe("LandingPage", () => {
  it("허구 통계·백분위·녹음 시간처럼 근거 없는 수치를 표시하지 않는다", () => {
    renderLanding();
    expect(screen.queryByText(/12,000/)).toBeNull();
    expect(screen.queryByText(/4\.8\s*\/\s*5/)).toBeNull();
    expect(screen.queryByText(/상위 \d+%/)).toBeNull();
    expect(screen.queryByText(/REC \d/)).toBeNull();
    expect(screen.queryByText(/30초/)).toBeNull();
  });

  it("예시 리포트 영역은 /sample 과 같은 픽스처 값을 그대로 보여준다", () => {
    renderLanding();
    expect(screen.getByText(String(sampleReportDetail.score))).toBeInTheDocument();
    expect(screen.getByText(sampleReportDetail.summary)).toBeInTheDocument();
    for (const [axis] of sampleReportDetail.axes) {
      expect(screen.getByText(axis)).toBeInTheDocument();
    }
    // 전달력은 음성 분석 전이라 점수 대신 안내 문구 — 제품 화면과 같은 상태를 그대로 노출한다
    expect(screen.getByText("음성 분석 예정")).toBeInTheDocument();
  });

  it("예시 리포트 전체 보기는 /sample 로, 시작하기 버튼은 /login 으로 이동한다", async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(screen.getByRole("button", { name: "예시 리포트 전체 보기" }));
    expect(await screen.findByText("SAMPLE_PAGE")).toBeInTheDocument();

    renderLanding();
    await user.click(screen.getAllByRole("button", { name: "무료로 시작하기" })[0]);
    expect(await screen.findByText("AUTH_PAGE")).toBeInTheDocument();
  });

  it("푸터에는 실제 존재하는 화면 링크만 둔다", () => {
    renderLanding();
    const footer = screen.getByRole("navigation", { name: "바로가기" });
    expect(footer).toHaveTextContent("예시 리포트");
    expect(footer).toHaveTextContent("로그인");
    for (const fake of ["요금", "블로그", "채용", "상태", "도움말"]) {
      expect(screen.queryByText(fake)).toBeNull();
    }
  });
});
