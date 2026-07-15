import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { ConsentPage } from "./ConsentPage";

describe("ConsentPage (약관 동의)", () => {
  it("필수 약관이 모두 체크된 초기 상태에서는 시작 버튼이 활성화된다", () => {
    renderWithProviders(<ConsentPage />);
    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeEnabled();
  });

  it("필수 약관을 해제하면 시작 버튼이 비활성화되고 안내문이 보인다", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentPage />);

    // "이용약관" 행의 체크박스(제목 왼쪽 버튼)를 해제
    const row = screen.getByText("이용약관").closest("div")!;
    await user.click(row.querySelector("button")!);

    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeDisabled();
    expect(screen.getByText("필수 항목에 모두 동의해야 시작할 수 있어요.")).toBeInTheDocument();
  });

  it("전체 동의를 토글하면 선택 항목까지 모두 체크/해제된다", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentPage />);

    const allToggle = screen.getByRole("button", { name: /약관 전체 동의/ });
    await user.click(allToggle); // 전체 on (선택 항목 포함)
    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeEnabled();

    await user.click(allToggle); // 전체 off
    expect(screen.getByRole("button", { name: "동의하고 시작하기" })).toBeDisabled();
  });
});
