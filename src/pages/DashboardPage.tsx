/* ============================ 대시보드 (app.hbb.kr) ============================ */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useProfile, useReports, useReportStats, useResumes } from "../api/hooks";
import { Button, Card, Modal, Tag } from "../components/ds";
import { Icon } from "../components/Icon";
import {
  Display,
  DocThumb,
  ScoreNum,
  Section,
  SectionLabel,
  StatusBadge,
  WeakTag,
} from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";
import { reportDetailPath } from "../routes";

export function DashboardPage() {
  const nav = useNav();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: resumes = [] } = useResumes();
  const { data: reports = [] } = useReports();
  const { data: stats } = useReportStats();

  const analyzed = resumes.filter((r) => r.status === "done");
  const [pickOpen, setPickOpen] = useState(false);
  const [activeResume, setActiveResume] = useState(0);
  const active = analyzed[activeResume] ?? analyzed[0];
  const recentReports = reports.slice(0, 3);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active="home" />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 40px 60px" }}>
        <div style={{ marginBottom: 32 }}>
          <Display size={32} tracking={-0.025}>
            안녕하세요, {profile?.name ?? ""}님
          </Display>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 17,
              fontWeight: 500,
              color: "var(--fg-secondary)",
              marginTop: 10,
            }}
          >
            이어서 연습해볼까요? 준비된 이력서로 바로 면접을 시작할 수 있어요.
          </p>
        </div>

        {/* 바로 시작 */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-16)",
            padding: 0,
            marginBottom: 40,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "22px 24px" }}>
            <SectionLabel>바로 시작</SectionLabel>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 15,
                marginTop: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                <DocThumb ext={active?.ext ?? "PDF"} size={46} />
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--fg-strong)",
                    }}
                  >
                    {active?.name ?? ""}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <StatusBadge kind="done">분석 완료</StatusBadge>
                    {active?.tag && <Tag style={{ height: 26, fontSize: 12 }}>{active.tag}</Tag>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <Button
                  variant="solid"
                  leadingIcon={<Icon name="play" size={16} />}
                  onClick={() => nav("setup")}
                >
                  면접 시작
                </Button>
                <Button
                  variant="assistive"
                  leadingIcon={<Icon name="repeat-2" size={16} />}
                  onClick={() => setPickOpen(true)}
                >
                  이력서 변경
                </Button>
              </div>
            </div>
          </div>
          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-subtle)",
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <SectionLabel>최근 3회 흐름</SectionLabel>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--fg-secondary)",
                }}
              >
                평균{" "}
                <b style={{ color: "var(--fg-strong)", fontWeight: 700 }}>
                  {stats?.recentAvg ?? "-"}점
                </b>{" "}
                · 지난주 대비{" "}
                <b style={{ color: "var(--blue-800)", fontWeight: 700 }}>
                  +{stats?.recentDelta ?? "-"}
                </b>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 76 }}>
              {(stats?.recentTrend ?? []).map((x, i, arr) => {
                const last = i === arr.length - 1;
                return (
                  <div
                    key={x.d}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: last ? "var(--blue-800)" : "var(--fg-tertiary)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {x.s}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        height: (x.s - 60) * 1.8 + 12,
                        borderRadius: 4,
                        background: last ? "var(--blue-800)" : "var(--neutral-200)",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--fg-tertiary)",
                      }}
                    >
                      {x.d}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 내 이력서 */}
        <Section title="내 이력서" count={resumes.length}>
          <div>
            {resumes.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "18px 4px",
                  borderTop: i ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <DocThumb ext={r.ext} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--fg-strong)",
                    }}
                  >
                    {r.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-tertiary)",
                      marginTop: 5,
                    }}
                  >
                    {r.meta}
                  </div>
                </div>
                <StatusBadge kind={r.status}>
                  {r.status === "done" ? "분석 완료" : r.status === "ing" ? "분석 중" : "분석 실패"}
                </StatusBadge>
                <div style={{ width: 168, display: "flex", justifyContent: "flex-end" }}>
                  {r.status === "ing" ? (
                    <Button variant="assistive" disabled>
                      면접 시작
                    </Button>
                  ) : r.status === "fail" ? (
                    <Button variant="outlined" onClick={() => nav("resume")}>
                      다시 시도
                    </Button>
                  ) : (
                    <Button variant="solid" onClick={() => nav("setup")}>
                      이 이력서로 면접
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 최근 리포트 */}
        <Section
          title="최근 리포트"
          action={
            <Button variant="text" onClick={() => nav("reportList")}>
              전체 보기 →
            </Button>
          }
        >
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {recentReports.map((r, i) => (
              <button
                key={r.id}
                className="linkbtn report-row"
                onClick={() => navigate(reportDetailPath(r.id))}
                style={{ borderTop: i ? "1px solid var(--border-subtle)" : "none" }}
              >
                <ScoreNum score={r.score} size={38} />
                <div
                  style={{
                    width: 96,
                    flexShrink: 0,
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--fg-default)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {r.date}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--fg-default)",
                      marginBottom: 8,
                    }}
                  >
                    {r.title}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {r.tags.map((t) => (
                      <WeakTag key={t}>{t}</WeakTag>
                    ))}
                  </div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: "var(--fg-tertiary)" }} />
              </button>
            ))}
          </Card>
        </Section>
      </div>

      {/* 이력서 변경 모달 */}
      <Modal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="바로 시작에 사용할 이력서"
        style={{ maxWidth: 460, textAlign: "left" }}
        actions={[
          <Button variant="assistive" fullWidth onClick={() => setPickOpen(false)}>
            취소
          </Button>,
          <Button variant="solid" fullWidth onClick={() => setPickOpen(false)}>
            이 이력서로 설정
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {analyzed.map((r, i) => (
            <button
              key={r.id}
              className="linkbtn"
              onClick={() => setActiveResume(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: "var(--radius-12)",
                border:
                  i === activeResume
                    ? "1px solid var(--blue-800)"
                    : "1px solid var(--border-subtle)",
                background: i === activeResume ? "var(--bg-brand-subtle)" : "var(--bg-surface)",
              }}
            >
              <DocThumb ext={r.ext} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--fg-strong)",
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--fg-tertiary)",
                    marginTop: 4,
                  }}
                >
                  {r.meta} · 분석 완료
                </div>
              </div>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: i === activeResume ? "var(--blue-800)" : "transparent",
                  border: i === activeResume ? "none" : "1.5px solid var(--border-strong)",
                  color: "#fff",
                }}
              >
                {i === activeResume && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--fg-tertiary)",
            marginTop: 14,
          }}
        >
          분석이 완료된 이력서만 선택할 수 있어요.
        </p>
      </Modal>
    </div>
  );
}
