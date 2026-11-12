/* 랜딩 — 근거 없는 수치가 없고, 예시 리포트 영역이 /sample 과 같은 픽스처 값을 보여주며,
   화면 이동 요소가 링크(href)로 올바른 목적지를 가리키는지 검증 */
import { screen, within } from "@testing-library/react";
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

  it("본문은 main 랜드마크 안에 있고 헤더·푸터는 밖에 있다", () => {
    renderLanding();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { name: /이력서로 시작하는/ })).toBeInTheDocument();
    expect(within(main).queryByRole("navigation", { name: "바로가기" })).toBeNull();
  });

  /* 화면 이동 요소는 <a href> — 새 탭 열기·주소 복사가 되어야 하므로 목적지를 href 로 검증한다.
     같은 이름의 링크가 여러 개면(무료로 시작하기: 히어로·CTA) 전부 같은 곳을 가리켜야 한다. */
  it.each([
    ["무료로 시작하기", ROUTES.auth],
    ["예시 리포트 보기", ROUTES.sample],
    ["예시 리포트 전체 보기", ROUTES.sample],
  ])("본문 링크 %s 는 %s 를 가리킨다", (name, to) => {
    renderLanding();
    const links = screen.getAllByRole("link", { name });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", to);
  });

  it.each([
    ["예시 리포트 전체 보기", "SAMPLE_PAGE"],
    ["무료로 시작하기", "AUTH_PAGE"],
  ])("본문 링크 %s 클릭 시 해당 화면으로 이동한다", async (name, heading) => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(screen.getAllByRole("link", { name })[0]);
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it("푸터에는 실제 존재하는 화면 링크만 둔다", () => {
    renderLanding();
    const footer = screen.getByRole("navigation", { name: "바로가기" });
    expect(within(footer).getByRole("link", { name: "예시 리포트" })).toHaveAttribute(
      "href",
      ROUTES.sample,
    );
    expect(within(footer).getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      ROUTES.auth,
    );
    expect(within(footer).getAllByRole("link")).toHaveLength(2);
    for (const fake of ["요금", "블로그", "채용", "상태", "도움말"]) {
      expect(screen.queryByText(fake)).toBeNull();
    }
  });

  it.each([
    ["예시 리포트", "SAMPLE_PAGE"],
    ["로그인", "AUTH_PAGE"],
  ])("푸터 링크 %s 클릭 시 해당 화면으로 이동한다", async (name, heading) => {
    const user = userEvent.setup();
    renderLanding();
    const footer = screen.getByRole("navigation", { name: "바로가기" });
    await user.click(within(footer).getByRole("link", { name }));
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });
});
