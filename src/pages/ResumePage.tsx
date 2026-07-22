/* ============================ 이력서 관리 (/resumes) ============================ */
import { Fragment, useState } from "react";
import { useResumes } from "../api/hooks";
import { Badge, Button, Card, Progress } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb, SectionLabel, StatusBadge } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

export function ResumePage() {
  const nav = useNav();
  const [open, setOpen] = useState(0);
  const { data: resumes = [] } = useResumes();

  const analyzing = resumes.find((r) => r.status === "ing");
  const rows = resumes.filter((r) => r.status !== "ing");

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
          <Button variant="assistive" leadingIcon={<Icon name="upload" size={16} />}>
            파일 선택
          </Button>
        </div>

        {/* 드롭존 */}
        <div
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
            여기로 이력서를 끌어다 놓으세요
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
            또는 파일 선택 · PDF / DOCX · 최대 10MB
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
              {rows.map((r, i) => (
                <Fragment key={r.id}>
                  <tr
                    className="hbb-table__row"
                    onClick={() => setOpen(open === i ? -1 : i)}
                    style={open === i ? { background: "var(--bg-subtle)" } : undefined}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Icon
                          name={open === i ? "chevron-down" : "chevron-right"}
                          size={16}
                          style={{ color: "var(--fg-tertiary)" }}
                        />
                        <DocThumb ext={r.ext} size={28} />
                        <span style={{ fontWeight: 600, color: "var(--fg-strong)" }}>{r.name}</span>
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
                        <span className="ib-sm">
                          <Icon
                            name={r.status === "fail" ? "rotate-cw" : "more-horizontal"}
                            size={16}
                          />
                        </span>
                        <span className="ib-sm">
                          <Icon name="trash-2" size={16} />
                        </span>
                      </span>
                    </td>
                  </tr>
                  {open === i && r.status === "done" && r.preview && (
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
                            <div style={{ display: "flex", gap: 8 }}>
                              <Button variant="assistive" size="sm">
                                원본 보기
                              </Button>
                              <Button
                                variant="solid"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  nav("setup", { query: { resume: String(r.id) } });
                                }}
                              >
                                이 이력서로 면접 시작 →
                              </Button>
                            </div>
                          </div>
                          <div
                            style={{
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "var(--radius-12)",
                              padding: "6px 16px",
                            }}
                          >
                            {(
                              [
                                ["이름", r.preview.name],
                                ["경력", r.preview.career],
                                ["핵심 스킬", null],
                                ["주요 프로젝트", r.preview.projects],
                              ] as [string, string | null][]
                            ).map(([k, v], j) => (
                              <div
                                key={k}
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  padding: "12px 0",
                                  borderBottom: j < 3 ? "1px solid var(--border-subtle)" : "none",
                                  fontFamily: "var(--font-sans)",
                                  fontSize: 14,
                                  fontWeight: 500,
                                }}
                              >
                                <span
                                  style={{ width: 96, flexShrink: 0, color: "var(--fg-tertiary)" }}
                                >
                                  {k}
                                </span>
                                {v ? (
                                  <span style={{ color: "var(--fg-strong)", fontWeight: 600 }}>
                                    {v}
                                  </span>
                                ) : (
                                  <span style={{ display: "flex", gap: 6 }}>
                                    {r.preview!.skills.map((c) => (
                                      <Badge key={c} variant="brand">
                                        {c}
                                      </Badge>
                                    ))}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
