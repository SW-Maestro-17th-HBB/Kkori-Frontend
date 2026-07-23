/* ============================ 이력서 관리 (/resumes) ============================ */
import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, DragEvent, ReactNode } from "react";
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
import { Badge, Button, Card, Input, Progress } from "../components/ds";
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
  /** 오류·안내 토스트 — 자동으로 사라지지 않고 사용자가 닫기 버튼으로 직접 닫는다 */
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => setToast(message);

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

  const pickFile = () => fileInputRef.current?.click();

  const submitFile = (file: File | undefined) => {
    if (!file || upload.isPending) return;
    upload.mutate(
      { file },
      {
        onError: (e) => showToast(errorMessage(e)),
        onSuccess: (data) => {
          if (data?.duplicated)
            showToast("이미 업로드된 이력서예요 — 기존 항목을 그대로 사용합니다.");
        },
      },
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    submitFile(e.dataTransfer.files[0]);
  };

  const onDelete = (resumeId: number) => {
    if (window.confirm("이 이력서를 삭제할까요? 분석 결과도 함께 사라집니다.")) {
      remove.mutate(resumeId, { onError: (e) => showToast(errorMessage(e)) });
    }
  };

  const onReanalyze = (resumeId: number) => {
    reanalyze.mutate(resumeId, { onError: (e) => showToast(errorMessage(e)) });
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
                          {editingId === r.id && parsed.data ? (
                            <ParsedEditPanel
                              key={r.id}
                              initial={parsed.data.structuredData ?? {}}
                              saving={update.isPending}
                              onCancel={() => {
                                update.reset();
                                setEditingId(null);
                              }}
                              onSave={(structuredData) => {
                                update.mutate(
                                  { resumeId: r.id, structuredData },
                                  {
                                    onSuccess: () => {
                                      setEditingId(null);
                                      showToast(
                                        "수정 사항이 저장됐어요 — 면접 질문에 반영하려면 메뉴에서 재분석을 실행하세요.",
                                      );
                                    },
                                    onError: (e) => showToast(errorMessage(e)),
                                  },
                                );
                              }}
                            />
                          ) : (
                            <div style={{ padding: "18px 18px 20px 44px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: 14,
                                }}
                              >
                                <SectionLabel>분석 결과</SectionLabel>
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
                                  padding: "6px 20px",
                                }}
                              >
                                {parsed.isPending ? (
                                  <p className="hbb-table-note">분석 결과를 불러오는 중…</p>
                                ) : parsed.isError || !parsed.data ? (
                                  <p className="hbb-table-note" role="alert">
                                    {errorMessage(parsed.error)}
                                  </p>
                                ) : (
                                  <ParsedDetail data={parsed.data.structuredData ?? {}} />
                                )}
                              </div>
                            </div>
                          )}
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

      {toast &&
        createPortal(
          <div
            role="alert"
            style={{
              position: "fixed",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
            }}
          >
            <NoticeToast onClose={() => setToast(null)}>{toast}</NoticeToast>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ---------- 알림 토스트 — 화면 톤(흰 서피스 + 상태색 아이콘 배지)에 맞춘 스타일 ---------- */

function NoticeToast({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="notice-toast"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 480,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-12)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
        padding: "12px 16px",
        fontFamily: "var(--font-sans)",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--fg-strong)",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-full)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "var(--bg-danger-subtle)",
          color: "var(--red-600)",
        }}
      >
        <Icon name="x" size={15} />
      </span>
      {children}
      <button
        type="button"
        className="linkbtn ib-sm"
        aria-label="알림 닫기"
        onClick={onClose}
        style={{ color: "var(--fg-tertiary)", marginLeft: 2, flexShrink: 0 }}
      >
        <Icon name="x" size={15} />
      </button>
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

/* ---------- 분석 결과 인라인 수정 패널 ---------- */

const fieldLabel: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--fg-tertiary)",
  marginBottom: 6,
};

function EditSection({
  title,
  onAdd,
  addLabel,
  first,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "18px 0",
        borderTop: first ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--fg-strong)",
          }}
        >
          {title}
        </span>
        {onAdd && (
          <button
            type="button"
            className="linkbtn"
            onClick={onAdd}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--blue-700)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="plus" size={14} />
            {addLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="linkbtn ib-sm"
      aria-label={label}
      onClick={onClick}
      style={{ color: "var(--fg-tertiary)", alignSelf: "center" }}
    >
      <Icon name="trash-2" size={15} />
    </button>
  );
}

/**
 * structuredData 편집 폼. 쉼표 구분 입력(스킬 항목·기술 스택)은 타이핑 중 파싱하면
 * 쉼표·공백이 즉시 지워지므로, 폼 상태는 **문자열 그대로** 두고 저장 시점에만 배열로 변환한다.
 * 저장은 PATCH /parsed 로 전문을 보낸다 — 백엔드 검증은 형태만 엄격(배열 내 null 400,
 * 필드 누락·빈 배열 허용, PRD §4)이라 빈 행만 걷어내고 전송한다.
 */
interface ParsedEditForm {
  name: string;
  email: string;
  skills: { category: string; itemsText: string }[];
  projects: { name: string; role: string; description: string; techStacksText: string }[];
  experiences: { title: string; description: string }[];
}

function toEditForm(initial: StructuredData): ParsedEditForm {
  return {
    name: initial.profile?.name ?? "",
    email: initial.profile?.email ?? "",
    skills: (initial.skills ?? []).map((s) => ({
      category: s.category ?? "",
      itemsText: (s.items ?? []).join(", "),
    })),
    projects: (initial.projects ?? []).map((p) => ({
      name: p.name ?? "",
      role: p.role ?? "",
      description: p.description ?? "",
      techStacksText: (p.techStacks ?? []).join(", "),
    })),
    experiences: (initial.experiences ?? []).map((e) => ({
      title: e.title ?? "",
      description: e.description ?? "",
    })),
  };
}

function fromEditForm(form: ParsedEditForm): StructuredData {
  return {
    profile: { name: form.name, email: form.email },
    skills: form.skills
      .filter((s) => s.category.trim() || s.itemsText.trim())
      .map((s) => ({ category: s.category, items: splitCsv(s.itemsText) })),
    projects: form.projects
      .filter(
        (p) => p.name.trim() || p.role.trim() || p.description.trim() || p.techStacksText.trim(),
      )
      .map((p) => ({
        name: p.name,
        role: p.role,
        description: p.description,
        techStacks: splitCsv(p.techStacksText),
      })),
    experiences: form.experiences.filter((e) => e.title.trim() || e.description.trim()),
  };
}

function ParsedEditPanel({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: StructuredData;
  saving: boolean;
  onCancel: () => void;
  onSave: (data: StructuredData) => void;
}) {
  const [form, setForm] = useState<ParsedEditForm>(() => toEditForm(initial));

  const submit = () => {
    if (saving) return;
    onSave(fromEditForm(form));
  };

  return (
    <div style={{ padding: "18px 18px 22px 44px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <SectionLabel>분석 결과 수정</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="assistive" size="sm" onClick={onCancel} disabled={saving}>
            취소
          </Button>
          <Button variant="solid" size="sm" onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fg-tertiary)",
          margin: "0 0 14px",
        }}
      >
        저장 후 면접 질문에 반영하려면 메뉴에서 재분석을 실행해야 해요.
      </p>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-12)",
          padding: "6px 20px",
        }}
      >
        <EditSection title="프로필" first>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={fieldLabel}>이름</div>
              <Input
                value={form.name}
                placeholder="이름"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <div style={fieldLabel}>이메일</div>
              <Input
                value={form.email}
                placeholder="이메일"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
        </EditSection>

        <EditSection
          title="스킬"
          addLabel="스킬 추가"
          onAdd={() =>
            setForm({ ...form, skills: [...form.skills, { category: "", itemsText: "" }] })
          }
        >
          {form.skills.length === 0 && (
            <p className="hbb-table-note" style={{ padding: "2px 0" }}>
              아직 스킬이 없어요. 오른쪽 위 버튼으로 추가하세요.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {form.skills.map((skill, i) => (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "200px 1fr 32px", gap: 10 }}
              >
                <div>
                  {i === 0 && <div style={fieldLabel}>카테고리</div>}
                  <Input
                    value={skill.category}
                    placeholder="예: 백엔드"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        skills: form.skills.map((s, j) =>
                          j === i ? { ...s, category: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </div>
                <div>
                  {i === 0 && <div style={fieldLabel}>항목 (쉼표로 구분)</div>}
                  <Input
                    value={skill.itemsText}
                    placeholder="예: Java, Spring Boot, Redis"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        skills: form.skills.map((s, j) =>
                          j === i ? { ...s, itemsText: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                  <RemoveRowButton
                    label="스킬 삭제"
                    onClick={() =>
                      setForm({ ...form, skills: form.skills.filter((_, j) => j !== i) })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </EditSection>

        <EditSection
          title="프로젝트"
          addLabel="프로젝트 추가"
          onAdd={() =>
            setForm({
              ...form,
              projects: [
                ...form.projects,
                { name: "", role: "", description: "", techStacksText: "" },
              ],
            })
          }
        >
          {form.projects.length === 0 && (
            <p className="hbb-table-note" style={{ padding: "2px 0" }}>
              아직 프로젝트가 없어요. 오른쪽 위 버튼으로 추가하세요.
            </p>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            {form.projects.map((project, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-12)",
                  background: "var(--bg-subtle)",
                  padding: 14,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 32px", gap: 10 }}>
                  <div>
                    <div style={fieldLabel}>프로젝트 이름</div>
                    <Input
                      value={project.name}
                      placeholder="예: Kkori"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          projects: form.projects.map((p, j) =>
                            j === i ? { ...p, name: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </div>
                  <div>
                    <div style={fieldLabel}>역할</div>
                    <Input
                      value={project.role}
                      placeholder="예: 백엔드"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          projects: form.projects.map((p, j) =>
                            j === i ? { ...p, role: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                    <RemoveRowButton
                      label="프로젝트 삭제"
                      onClick={() =>
                        setForm({ ...form, projects: form.projects.filter((_, j) => j !== i) })
                      }
                    />
                  </div>
                </div>
                <div>
                  <div style={fieldLabel}>설명</div>
                  <Input
                    value={project.description}
                    placeholder="어떤 프로젝트였는지 간단히"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        projects: form.projects.map((p, j) =>
                          j === i ? { ...p, description: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </div>
                <div>
                  <div style={fieldLabel}>기술 스택 (쉼표로 구분)</div>
                  <Input
                    value={project.techStacksText}
                    placeholder="예: Spring Boot, PostgreSQL"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        projects: form.projects.map((p, j) =>
                          j === i ? { ...p, techStacksText: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </EditSection>

        <EditSection
          title="경력"
          addLabel="경력 추가"
          onAdd={() =>
            setForm({
              ...form,
              experiences: [...form.experiences, { title: "", description: "" }],
            })
          }
        >
          {form.experiences.length === 0 && (
            <p className="hbb-table-note" style={{ padding: "2px 0" }}>
              아직 경력이 없어요. 오른쪽 위 버튼으로 추가하세요.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {form.experiences.map((exp, i) => (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 32px", gap: 10 }}
              >
                <div>
                  {i === 0 && <div style={fieldLabel}>제목</div>}
                  <Input
                    value={exp.title}
                    placeholder="예: 3년 · 백엔드"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        experiences: form.experiences.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
                <div>
                  {i === 0 && <div style={fieldLabel}>설명</div>}
                  <Input
                    value={exp.description}
                    placeholder="무엇을 했는지 간단히"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        experiences: form.experiences.map((x, j) =>
                          j === i ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                  <RemoveRowButton
                    label="경력 삭제"
                    onClick={() =>
                      setForm({
                        ...form,
                        experiences: form.experiences.filter((_, j) => j !== i),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </EditSection>
      </div>
    </div>
  );
}

/* ---------- 분석 결과 상세(읽기) — 수정 패널과 같은 섹션 구조로 정보 격차를 없앤다 ---------- */

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 600,
          color: value ? "var(--fg-strong)" : "var(--fg-tertiary)",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="hbb-table-note" style={{ padding: "2px 0" }}>
      {children}
    </p>
  );
}

function ParsedDetail({ data }: { data: StructuredData }) {
  const skills = data.skills ?? [];
  const projects = data.projects ?? [];
  const experiences = data.experiences ?? [];

  return (
    <>
      <EditSection title="프로필" first>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DetailField label="이름" value={data.profile?.name} />
          <DetailField label="이메일" value={data.profile?.email} />
        </div>
      </EditSection>

      <EditSection title="스킬">
        {skills.length === 0 ? (
          <EmptyNote>분석된 스킬이 없어요.</EmptyNote>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {skills.map((skill, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--fg-secondary)",
                  }}
                >
                  {skill.category || "-"}
                </span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(skill.items ?? []).length ? (
                    (skill.items ?? []).map((item) => (
                      <Badge key={item} variant="brand">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span style={{ color: "var(--fg-tertiary)", fontSize: 13 }}>-</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </EditSection>

      <EditSection title="프로젝트">
        {projects.length === 0 ? (
          <EmptyNote>분석된 프로젝트가 없어요.</EmptyNote>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {projects.map((project, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-12)",
                  background: "var(--bg-subtle)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                  fontFamily: "var(--font-sans)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-strong)" }}>
                    {project.name || "-"}
                  </span>
                  {project.role && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-tertiary)" }}>
                      · {project.role}
                    </span>
                  )}
                </div>
                {project.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    {project.description}
                  </p>
                )}
                {(project.techStacks ?? []).length > 0 && (
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(project.techStacks ?? []).map((t) => (
                      <Badge key={t} variant="brand">
                        {t}
                      </Badge>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </EditSection>

      <EditSection title="경력">
        {experiences.length === 0 ? (
          <EmptyNote>분석된 경력이 없어요.</EmptyNote>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {experiences.map((exp, i) => (
              <div key={i} style={{ fontFamily: "var(--font-sans)" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-strong)" }}>
                  {exp.title || "-"}
                </span>
                {exp.description && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-tertiary)" }}>
                    {" "}
                    — {exp.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </EditSection>
    </>
  );
}
