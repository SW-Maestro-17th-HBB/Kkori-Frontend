/* ReportListPage 테스트 — 실패 리포트 재생성 (HBB1-314).
   정책 원천: Kkori/docs/requirements/report/report.md §1 (FAILED 재생성)
   재생성은 FAILED 리포트의 유일한 복구 수단이고, 상세로 진입할 수 없으니 진입점은 목록뿐이다. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/request";
import type { ReportPage, ReportStats, ReportSummary } from "../api/types";
import { renderWithProviders } from "../test/render";
import { ReportListPage } from "./ReportListPage";

const { fetchReportsMock, fetchReportStatsMock, regenerateReportMock } = vi.hoisted(() => ({
  fetchReportsMock: vi.fn(),
  fetchReportStatsMock: vi.fn(),
  regenerateReportMock: vi.fn(),
}));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchReports: fetchReportsMock,
  fetchReportStats: fetchReportStatsMock,
  regenerateReport: regenerateReportMock,
}));

const report = (overrides: Partial<ReportSummary> = {}): ReportSummary => ({
  id: 7,
  status: "FAILED",
  date: "2026.08.01",
  score: null,
  title: "백엔드_이력서.pdf",
  resumeName: "백엔드_이력서.pdf",
  resumeExt: "PDF",
  type: "실전 30분",
  tags: [],
  ...overrides,
});

const pageOf = (items: ReportSummary[]): ReportPage => ({
  items,
  page: 0,
  size: 20,
  totalElements: items.length,
  hasNext: false,
});

const EMPTY_STATS: ReportStats = {
  avgScore: null,
  avgDelta: "",
  totalCount: 0,
  bestScore: null,
  trend: [],
  axisAverages: [],
  weaknessSegments: [],
};

/** 대상 행의 재생성 버튼 — 이름으로 찾아 다른 실패 행과 섞이지 않게 한다 */
const regenerateButton = (resumeName: string) =>
  screen.findByRole("button", { name: `${resumeName} 리포트 재생성` });

/** 응답을 붙잡아 두는 재생성 목 — 요청 중(pending) 상태의 화면을 관찰하려고 쓴다.
    호출마다 별도 Promise 를 주고, resolveAll() 로 한꺼번에 풀어 테스트를 정리한다. */
const deferredRegenerate = () => {
  const resolvers: (() => void)[] = [];
  regenerateReportMock.mockImplementation(
    (reportId: number) =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ reportId, status: "PENDING" }));
      }),
  );
  return { resolveAll: () => resolvers.forEach((r) => r()) };
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchReportStatsMock.mockResolvedValue(EMPTY_STATS);
  fetchReportsMock.mockResolvedValue(pageOf([report()]));
  regenerateReportMock.mockResolvedValue({ reportId: 7, status: "PENDING" });
});

describe("ReportListPage 재생성", () => {
  it("실패 행에만 재생성 버튼을 둔다 — 완료 행은 상세로, 생성 중 행은 기다릴 뿐이다", async () => {
    fetchReportsMock.mockResolvedValue(
      pageOf([
        report({ id: 1, status: "FAILED", resumeName: "실패.pdf" }),
        report({ id: 2, status: "COMPLETED", score: 82, resumeName: "완료.pdf" }),
        report({ id: 3, status: "PROCESSING", resumeName: "진행중.pdf" }),
      ]),
    );
    renderWithProviders(<ReportListPage />, { route: "/reports" });

    expect(await regenerateButton("실패.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4)); // 헤더 + 3행
    expect(screen.queryByRole("button", { name: "완료.pdf 리포트 재생성" })).toBeNull();
    expect(screen.queryByRole("button", { name: "진행중.pdf 리포트 재생성" })).toBeNull();
  });

  it("재생성 성공 시 목록을 재조회하고 안내를 띄운다 (PENDING 복귀는 SSE로 오지 않는다)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportListPage />, { route: "/reports" });
    await user.click(await regenerateButton("백엔드_이력서.pdf"));

    expect(regenerateReportMock).toHaveBeenCalledWith(7);
    const toast = await screen.findByRole("alert");
    expect(within(toast).getByText("재생성을 요청했어요")).toBeInTheDocument();
    // 최초 조회 + 재생성 후 재조회
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(2));
  });

  it("이미 완료된 리포트였다면(RP005) 에러 문구를 그대로 보여주고 목록을 재동기화한다", async () => {
    regenerateReportMock.mockRejectedValue(
      new ApiError("RP005", "완성된 리포트는 재생성할 수 없습니다.", 409),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReportListPage />, { route: "/reports" });
    await user.click(await regenerateButton("백엔드_이력서.pdf"));

    const toast = await screen.findByRole("alert");
    expect(within(toast).getByText("완성된 리포트는 재생성할 수 없습니다.")).toBeInTheDocument();
    // 실패해도 재조회한다 — 서버 상태가 화면보다 앞서 있다는 신호이므로
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(2));
  });

  it("요청 중인 행의 버튼만 잠근다 — 다른 실패 행은 그대로 누를 수 있다", async () => {
    fetchReportsMock.mockResolvedValue(
      pageOf([
        report({ id: 1, resumeName: "실패A.pdf" }),
        report({ id: 2, resumeName: "실패B.pdf" }),
      ]),
    );
    const pending = deferredRegenerate();
    const user = userEvent.setup();
    renderWithProviders(<ReportListPage />, { route: "/reports" });
    await user.click(await regenerateButton("실패A.pdf"));

    await waitFor(async () => expect(await regenerateButton("실패A.pdf")).toBeDisabled());
    expect(await regenerateButton("실패B.pdf")).toBeEnabled();
    pending.resolveAll();
  });

  it("다른 행을 눌러도 먼저 요청한 행의 잠금이 풀리지 않는다 (중복 제출 방지)", async () => {
    fetchReportsMock.mockResolvedValue(
      pageOf([
        report({ id: 1, resumeName: "실패A.pdf" }),
        report({ id: 2, resumeName: "실패B.pdf" }),
      ]),
    );
    const pending = deferredRegenerate();
    const user = userEvent.setup();
    renderWithProviders(<ReportListPage />, { route: "/reports" });
    await user.click(await regenerateButton("실패A.pdf"));
    await user.click(await regenerateButton("실패B.pdf"));

    // 훅의 isPending·variables 로 판정하면 마지막 호출(B)만 남아 A 가 다시 눌리는 상태가 된다
    expect(await regenerateButton("실패A.pdf")).toBeDisabled();
    expect(await regenerateButton("실패B.pdf")).toBeDisabled();
    expect(regenerateReportMock).toHaveBeenCalledTimes(2);
    pending.resolveAll();
  });
});
