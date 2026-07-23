/* ============================ 이력서 관리 (/resumes) ============================ */
import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { toResumePreview } from "../api/client";
import type { StructuredData } from "../api/client";
import {
  useDeleteResume,
  useReanalyzeResume,
  useResumeParsed,
  useResumes,
  useUpdateResumeParsed,
  useUploadResume,
} from "../api/hooks";
import { isApiError } from "../api/request";
import { Badge, Button, Card, Input, Modal, Progress } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb, SectionLabel, StatusBadge } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

const errorMessage = (e: unknown): string =>
  isApiError(e) ? e.message : "요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";

const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function ResumePage() {
  const nav = useNav();
  const [openId, setOpenId] = useState<number | null>(null);
  /** 열린 행 메뉴 — 테이블(overflow: hidden)에 잘리지 않도록 버튼 화면 좌표에 포털로 띄운다 */
  const [menu, setMenu] = useState<{ id: number; top: number; right: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  /** 수정 저장 직후 "재분석 필요" 안내를 보여줄 행 */
  const [savedId, setSavedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: resumes = [], isPending, isError, error } = useResumes();
  const upload = useUploadResume();
  const remove = useDeleteResume();
  const reanalyze = useReanalyzeResume();
  const update = useUpdateResumeParsed();

  const analyzing = resumes.find((r) => r.status === "ing");
  const rows = resumes.filter((r) => r.status !== "ing");

  const openRow = rows.find((r) => r.id === openId);
  // 미리보기는 완료 행을 펼친 시점에만 조회 (PRD §2 — 목록 payload 경량화)
  const parsed = useResumeParsed(openRow?.status === "done" ? openRow.id : null);
  const preview = parsed.data ? toResumePreview(parsed.data) : null;

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

  const onReanalyze = (resumeId: number) => {
    reanalyze.mutate(resumeId, {
      onSuccess: () => setSavedId((prev) => (prev === resumeId ? null : prev)),
    });
  };

  const onEdit = (resumeId: number) => {
    setOpenId(resumeId); // 수정 폼 초기값이 될 파싱 결과를 로드하기 위해 행을 펼친다
    setEditingId(resumeId);
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
                        <span style={{ display: "inline-block" }}>
                          <button
                            type="button"
                            className="linkbtn ib-sm"
                            aria-label="더보기 메뉴"
                            aria-expanded={menu?.id === r.id}
                            style={{ color: "var(--fg-tertiary)" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menu?.id === r.id) {
                                setMenu(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenu({
                                id: r.id,
                                top: rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                              });
                            }}
                          >
                            <Icon name="more-horizontal" size={16} />
                          </button>
                          {menu?.id === r.id && (
                            <RowMenu
                              top={menu.top}
                              right={menu.right}
                              onClose={() => setMenu(null)}
                            >
                              {r.status === "done" && (
                                <RowMenuItem
                                  icon="pencil"
                                  onClick={() => onEdit(r.id)}
                                  disabled={update.isPending}
                                >
                                  수정
                                </RowMenuItem>
                              )}
                              <RowMenuItem
                                icon="rotate-cw"
                                onClick={() => onReanalyze(r.id)}
                                disabled={reanalyze.isPending}
                              >
                                재분석
                              </RowMenuItem>
                              <RowMenuItem
                                icon="trash-2"
                                tone="danger"
                                onClick={() => onDelete(r.id)}
                                disabled={remove.isPending}
                              >
                                삭제
                              </RowMenuItem>
                            </RowMenu>
                          )}
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
                            {savedId === r.id && (
                              <p
                                style={{
                                  fontFamily: "var(--font-sans)",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--blue-800)",
                                  background: "var(--bg-brand-subtle)",
                                  borderRadius: "var(--radius-8, 8px)",
                                  padding: "10px 12px",
                                  margin: "0 0 12px",
                                }}
                              >
                                수정 사항이 저장됐어요. 면접 질문에 반영하려면 메뉴에서 재분석을
                                실행하세요.
                              </p>
                            )}
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
                              ) : parsed.isError || !preview ? (
                                <p className="hbb-table-note" role="alert">
                                  {errorMessage(parsed.error)}
                                </p>
                              ) : (
                                (
                                  [
                                    ["이름", preview.name],
                                    ["경력", preview.career],
                                    ["핵심 스킬", null],
                                    ["주요 프로젝트", preview.projects],
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
                                        {preview.skills.length ? (
                                          preview.skills.map((c) => (
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

      {/* 수정 모달 — key 로 행마다 폼 상태를 새로 초기화한다 */}
      {editingId !== null && openRow?.id === editingId && parsed.data && (
        <ParsedEditModal
          key={editingId}
          resumeName={openRow.name}
          initial={parsed.data.structuredData ?? {}}
          saving={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onClose={() => {
            update.reset();
            setEditingId(null);
          }}
          onSave={(structuredData) => {
            update.mutate(
              { resumeId: editingId, structuredData },
              {
                onSuccess: () => {
                  setEditingId(null);
                  setSavedId(editingId);
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}

/* ---------- 행 메뉴 ---------- */

/** 행 메뉴 — 테이블이 overflow: hidden(둥근 모서리)이라 셀 내부에 붙이면 잘린다.
    body 포털 + 버튼 화면 좌표(fixed)로 띄워 클리핑을 벗어난다. */
function RowMenu({
  top,
  right,
  onClose,
  children,
}: {
  top: number;
  right: number;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <>
      {/* 바깥 클릭으로 닫는 투명 오버레이 */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 10 }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        role="menu"
        style={{
          position: "fixed",
          top,
          right,
          zIndex: 11,
          minWidth: 132,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-12)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
          padding: 6,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose(); // 항목 클릭 시 메뉴 닫기
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

function RowMenuItem({
  icon,
  tone,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  tone?: "danger";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="linkbtn"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        borderRadius: "var(--radius-8, 8px)",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        fontWeight: 500,
        color: tone === "danger" ? "var(--red-600)" : "var(--fg-strong)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={15} />
      {children}
    </button>
  );
}

/* ---------- 분석 결과 수정 모달 ---------- */

const fieldLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--fg-tertiary)",
  marginBottom: 6,
};

const sectionTitle: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--fg-strong)",
  margin: "18px 0 10px",
};

/**
 * structuredData 편집 폼. 저장은 PATCH /parsed 로 전문을 보낸다 —
 * 백엔드 검증은 형태만 엄격(배열 내 null 400, 필드 누락·빈 배열 허용, PRD §4)이라
 * 비어 있는 행만 걷어내고 그대로 전송한다.
 */
function ParsedEditModal({
  resumeName,
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  resumeName: string;
  initial: StructuredData;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (data: StructuredData) => void;
}) {
  const [draft, setDraft] = useState<StructuredData>(() => structuredClone(initial));

  const skills = draft.skills ?? [];
  const projects = draft.projects ?? [];
  const experiences = draft.experiences ?? [];

  const submit = () => {
    if (saving) return;
    onSave({
      profile: draft.profile,
      skills: skills.filter((s) => s.category?.trim() || s.items?.length),
      projects: projects.filter(
        (p) => p.name?.trim() || p.role?.trim() || p.description?.trim() || p.techStacks?.length,
      ),
      experiences: experiences.filter((e) => e.title?.trim() || e.description?.trim()),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`분석 결과 수정 — ${resumeName}`}
      style={{ width: 560, maxHeight: "80vh", overflowY: "auto" }}
      actions={[
        <Button key="cancel" variant="assistive" onClick={onClose} disabled={saving}>
          취소
        </Button>,
        <Button key="save" variant="solid" onClick={submit} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>,
      ]}
    >
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fg-tertiary)",
          margin: "0 0 4px",
        }}
      >
        저장 후 면접 질문에 반영하려면 재분석을 실행해야 해요.
      </p>

      <div style={sectionTitle}>프로필</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={fieldLabel}>이름</div>
          <Input
            value={draft.profile?.name ?? ""}
            placeholder="이름"
            onChange={(e) =>
              setDraft({ ...draft, profile: { ...draft.profile, name: e.target.value } })
            }
          />
        </div>
        <div>
          <div style={fieldLabel}>이메일</div>
          <Input
            value={draft.profile?.email ?? ""}
            placeholder="이메일"
            onChange={(e) =>
              setDraft({ ...draft, profile: { ...draft.profile, email: e.target.value } })
            }
          />
        </div>
      </div>

      <div style={sectionTitle}>스킬</div>
      {skills.map((skill, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr 30px",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Input
            value={skill.category ?? ""}
            placeholder="카테고리"
            onChange={(e) =>
              setDraft({
                ...draft,
                skills: skills.map((s, j) => (j === i ? { ...s, category: e.target.value } : s)),
              })
            }
          />
          <Input
            value={(skill.items ?? []).join(", ")}
            placeholder="항목 (쉼표로 구분)"
            onChange={(e) =>
              setDraft({
                ...draft,
                skills: skills.map((s, j) =>
                  j === i ? { ...s, items: splitCsv(e.target.value) } : s,
                ),
              })
            }
          />
          <button
            type="button"
            className="linkbtn ib-sm"
            aria-label="스킬 삭제"
            onClick={() => setDraft({ ...draft, skills: skills.filter((_, j) => j !== i) })}
          >
            <Icon name="trash-2" size={14} />
          </button>
        </div>
      ))}
      <Button
        variant="assistive"
        size="sm"
        onClick={() => setDraft({ ...draft, skills: [...skills, { category: "", items: [] }] })}
      >
        + 스킬 추가
      </Button>

      <div style={sectionTitle}>프로젝트</div>
      {projects.map((project, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-12)",
            padding: 12,
            marginBottom: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 30px", gap: 8 }}>
            <Input
              value={project.name ?? ""}
              placeholder="프로젝트 이름"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  projects: projects.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)),
                })
              }
            />
            <Input
              value={project.role ?? ""}
              placeholder="역할"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  projects: projects.map((p, j) => (j === i ? { ...p, role: e.target.value } : p)),
                })
              }
            />
            <button
              type="button"
              className="linkbtn ib-sm"
              aria-label="프로젝트 삭제"
              onClick={() => setDraft({ ...draft, projects: projects.filter((_, j) => j !== i) })}
            >
              <Icon name="trash-2" size={14} />
            </button>
          </div>
          <Input
            value={project.description ?? ""}
            placeholder="설명"
            onChange={(e) =>
              setDraft({
                ...draft,
                projects: projects.map((p, j) =>
                  j === i ? { ...p, description: e.target.value } : p,
                ),
              })
            }
          />
          <Input
            value={(project.techStacks ?? []).join(", ")}
            placeholder="기술 스택 (쉼표로 구분)"
            onChange={(e) =>
              setDraft({
                ...draft,
                projects: projects.map((p, j) =>
                  j === i ? { ...p, techStacks: splitCsv(e.target.value) } : p,
                ),
              })
            }
          />
        </div>
      ))}
      <Button
        variant="assistive"
        size="sm"
        onClick={() =>
          setDraft({
            ...draft,
            projects: [...projects, { name: "", role: "", description: "", techStacks: [] }],
          })
        }
      >
        + 프로젝트 추가
      </Button>

      <div style={sectionTitle}>경력</div>
      {experiences.map((exp, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 30px", gap: 8, marginBottom: 8 }}
        >
          <Input
            value={exp.title ?? ""}
            placeholder="제목 (예: 3년 · 백엔드)"
            onChange={(e) =>
              setDraft({
                ...draft,
                experiences: experiences.map((x, j) =>
                  j === i ? { ...x, title: e.target.value } : x,
                ),
              })
            }
          />
          <Input
            value={exp.description ?? ""}
            placeholder="설명"
            onChange={(e) =>
              setDraft({
                ...draft,
                experiences: experiences.map((x, j) =>
                  j === i ? { ...x, description: e.target.value } : x,
                ),
              })
            }
          />
          <button
            type="button"
            className="linkbtn ib-sm"
            aria-label="경력 삭제"
            onClick={() =>
              setDraft({ ...draft, experiences: experiences.filter((_, j) => j !== i) })
            }
          >
            <Icon name="trash-2" size={14} />
          </button>
        </div>
      ))}
      <Button
        variant="assistive"
        size="sm"
        onClick={() =>
          setDraft({ ...draft, experiences: [...experiences, { title: "", description: "" }] })
        }
      >
        + 경력 추가
      </Button>

      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--red-600)",
            marginTop: 14,
          }}
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
