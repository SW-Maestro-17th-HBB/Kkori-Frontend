/* ============================ 이력서 관리 (/resumes) ============================ */
import { Fragment, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  useDeleteResume,
  useReanalyzeResume,
  useResumeParsed,
  useResumes,
  useUploadResume,
} from "../api/hooks";
import { isApiError } from "../api/request";
import { Badge, Button, Card, Progress } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb, SectionLabel, StatusBadge } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

const errorMessage = (e: unknown): string =>
  isApiError(e) ? e.message : "요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";

export function ResumePage() {
  const nav = useNav();
  const [openId, setOpenId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: resumes = [], isPending, isError, error } = useResumes();
  const upload = useUploadResume();
  const remove = useDeleteResume();
  const reanalyze = useReanalyzeResume();

  const analyzing = resumes.find((r) => r.status === "ing");
  const rows = resumes.filter((r) => r.status !== "ing");

  const openRow = rows.find((r) => r.id === openId);
  // 미리보기는 완료 행을 펼친 시점에만 조회 (PRD §2 — 목록 payload 경량화)
  const parsed = useResumeParsed(openRow?.status === "done" ? openRow.id : null);

  const pickFile = () => fileInputRef.current?.click();

  const submitFile = (file: File | undefined) => {
    if (!file || upload.isPending) return;
    upload.mutate({ file });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    submitFile(e.dataTransfer.files[0]);
  };

  const onDelete = (resumeId: number) => {
    if (window.confirm("이 이력서를 삭제할까요? 분석 결과도 함께 사라집니다.")) {
      remove.mutate(resumeId);
    }
  };

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active="resume" />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 40px 60px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <SectionLabel>이력서</SectionLabel>
            <Display size={32} tracking={-0.025} style={{ marginTop: 8 }}>
              이력서 관리
            </Display>
          </div>
          <Button
            variant="assistive"
            leadingIcon={<Icon name="upload" size={16} />}
            onClick={pickFile}
            disabled={upload.isPending}
          >
            파일 선택
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            submitFile(e.target.files?.[0]);
            e.target.value = ""; // 같은 파일 재선택도 change 가 발생하도록 초기화
          }}
        />

        {/* 드롭존 */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: "1.5px dashed var(--border-default)",
            borderRadius: "var(--radius-16)",
            background: "var(--bg-subtle)",
            padding: 40,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "var(--radius-full)",
              background: "var(--bg-brand-subtle)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--blue-800)",
            }}
          >
            <Icon name="file-up" size={24} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 700,
              color: "var(--fg-strong)",
              marginTop: 16,
            }}
          >
            {upload.isPending ? "업로드하는 중…" : "여기로 이력서를 끌어다 놓으세요"}
          </div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--fg-tertiary)",
              marginTop: 8,
            }}
          >
            또는 파일 선택 · PDF · 최대 10MB / 10페이지
          </p>
          {upload.isError && (
            <p
              role="alert"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--red-600)",
                marginTop: 12,
              }}
            >
              {errorMessage(upload.error)}
            </p>
          )}
          {upload.data?.duplicated && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--fg-secondary)",
                marginTop: 12,
              }}
            >
              이미 업로드된 이력서예요 — 기존 항목을 그대로 사용합니다.
            </p>
          )}
        </div>

        {/* 분석 중 알림 */}
        {analyzing && (
          <Card style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <DocThumb ext={analyzing.ext} size={30} />
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--fg-strong)",
                  }}
                >
                  {analyzing.name}
                </span>
              </div>
              <StatusBadge kind="ing">분석 중 · {analyzing.progress ?? 0}%</StatusBadge>
            </div>
            <Progress value={analyzing.progress ?? 0} />
          </Card>
        )}

        {/* 테이블 */}
        <div style={{ marginTop: 28 }}>
          {isPending ? (
            <p className="hbb-table-note">이력서를 불러오는 중…</p>
          ) : isError ? (
            <p className="hbb-table-note" role="alert">
              {errorMessage(error)}
            </p>
          ) : resumes.length === 0 ? (
            <p className="hbb-table-note">
              아직 업로드한 이력서가 없어요. 위에서 PDF를 올리면 분석이 시작됩니다.
            </p>
          ) : (
            <table className="hbb-table">
              <thead>
                <tr>
                  <th>이력서 이름</th>
                  <th style={{ width: 140 }}>업로드 날짜</th>
                  <th style={{ width: 130 }}>분석 상태</th>
                  <th style={{ width: 90, textAlign: "right" }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="hbb-table__row"
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      style={openId === r.id ? { background: "var(--bg-subtle)" } : undefined}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Icon
                            name={openId === r.id ? "chevron-down" : "chevron-right"}
                            size={16}
                            style={{ color: "var(--fg-tertiary)" }}
                          />
                          <DocThumb ext={r.ext} size={28} />
                          <span style={{ fontWeight: 600, color: "var(--fg-strong)" }}>
                            {r.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ color: "var(--fg-secondary)" }}>{r.uploadedAt}</td>
                      <td>
                        <StatusBadge kind={r.status}>
                          {r.status === "done" ? "분석 완료" : "분석 실패"}
                        </StatusBadge>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            gap: 2,
                            justifyContent: "flex-end",
                            color: "var(--fg-tertiary)",
                          }}
                        >
                          {r.status === "fail" && (
                            <button
                              type="button"
                              className="linkbtn ib-sm"
                              aria-label="재분석"
                              disabled={reanalyze.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                reanalyze.mutate(r.id);
                              }}
                            >
                              <Icon name="rotate-cw" size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="linkbtn ib-sm"
                            aria-label="삭제"
                            disabled={remove.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(r.id);
                            }}
                          >
                            <Icon name="trash-2" size={16} />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {openId === r.id && r.status === "done" && (
                      <tr>
                        <td colSpan={4} style={{ padding: 0, background: "var(--bg-subtle)" }}>
                          <div style={{ padding: "18px 18px 20px 44px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 14,
                              }}
                            >
                              <SectionLabel>분석 결과 미리보기</SectionLabel>
                              <Button
                                variant="solid"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  nav("setup");
                                }}
                              >
                                이 이력서로 면접 시작 →
                              </Button>
                            </div>
                            <div
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "var(--radius-12)",
                                padding: "6px 16px",
                              }}
                            >
                              {parsed.isPending ? (
                                <p className="hbb-table-note">미리보기를 불러오는 중…</p>
                              ) : parsed.isError ? (
                                <p className="hbb-table-note" role="alert">
                                  {errorMessage(parsed.error)}
                                </p>
                              ) : (
                                (
                                  [
                                    ["이름", parsed.data.name],
                                    ["경력", parsed.data.career],
                                    ["핵심 스킬", null],
                                    ["주요 프로젝트", parsed.data.projects],
                                  ] as [string, string | null][]
                                ).map(([k, v], j) => (
                                  <div
                                    key={k}
                                    style={{
                                      display: "flex",
                                      gap: 12,
                                      padding: "12px 0",
                                      borderBottom:
                                        j < 3 ? "1px solid var(--border-subtle)" : "none",
                                      fontFamily: "var(--font-sans)",
                                      fontSize: 14,
                                      fontWeight: 500,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 96,
                                        flexShrink: 0,
                                        color: "var(--fg-tertiary)",
                                      }}
                                    >
                                      {k}
                                    </span>
                                    {v ? (
                                      <span style={{ color: "var(--fg-strong)", fontWeight: 600 }}>
                                        {v}
                                      </span>
                                    ) : (
                                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {parsed.data.skills.length ? (
                                          parsed.data.skills.map((c) => (
                                            <Badge key={c} variant="brand">
                                              {c}
                                            </Badge>
                                          ))
                                        ) : (
                                          <span style={{ color: "var(--fg-tertiary)" }}>-</span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
