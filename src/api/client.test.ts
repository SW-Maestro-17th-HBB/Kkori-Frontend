import { describe, expect, it } from "vitest";
import { toUiResume, toUiStatus } from "./client";
import type { ResumeSummary } from "./client";

const NOW = new Date("2026-06-03T12:00:00Z");

const summary = (overrides: Partial<ResumeSummary> = {}): ResumeSummary => ({
  resumeId: 1,
  title: "백엔드_이력서.pdf",
  analysisStatus: "EMBEDDED",
  createdAt: "2026-06-01T12:00:00Z",
  fileSize: 2_516_582, // 2.4MB
  ...overrides,
});

describe("toUiStatus", () => {
  it("EMBEDDED만 done — PARSED는 색인 전이라 아직 진행 중이다", () => {
    expect(toUiStatus("EMBEDDED")).toBe("done");
    expect(toUiStatus("PARSED")).toBe("ing");
  });

  it("FAILED는 fail, 나머지 중간 단계는 전부 ing", () => {
    expect(toUiStatus("FAILED")).toBe("fail");
    for (const s of ["UPLOADED", "PARSING", "TEXT_EXTRACTING", "STRUCTURING", "EMBEDDING"] as const)
      expect(toUiStatus(s)).toBe("ing");
  });
});

describe("toUiResume", () => {
  it("목록 항목을 UI 모델로 매핑한다 (크기·상대시각·업로드 날짜 포맷)", () => {
    expect(toUiResume(summary(), NOW)).toEqual({
      id: 1,
      name: "백엔드_이력서.pdf",
      ext: "PDF",
      meta: "2.4MB · 2일 전",
      uploadedAt: "2026.06.01",
      status: "done",
    });
  });

  it("분석 중 상태는 status 기반 진행률을 함께 담는다 (서버는 progress 미제공 — PRD §3)", () => {
    const ing = toUiResume(summary({ analysisStatus: "EMBEDDING" }), NOW);
    expect(ing.status).toBe("ing");
    expect(ing.progress).toBe(90);
  });

  it("완료·실패 상태에는 progress를 넣지 않는다", () => {
    expect(toUiResume(summary(), NOW)).not.toHaveProperty("progress");
    expect(toUiResume(summary({ analysisStatus: "FAILED" }), NOW)).not.toHaveProperty("progress");
  });

  it("1주일 이상 지난 업로드는 상대시각 대신 날짜를 보여준다", () => {
    const old = toUiResume(summary({ createdAt: "2026-05-01T12:00:00Z" }), NOW);
    expect(old.meta).toBe("2.4MB · 2026.05.01");
  });
});
