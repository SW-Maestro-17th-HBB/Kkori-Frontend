/* ============================ 리포트 상세 (/reports/:id · /sample) ============================ */
import { useParams } from "react-router";
import { useReportDetail } from "../api/hooks";
import { Badge, Button, Card, Tag } from "../components/ds";
import { Icon } from "../components/Icon";
import { AxisBar, Display, ScoreNum, SectionLabel } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

export function ReportDetailPage({ sample = false }: { sample?: boolean }) {
  const nav = useNav();
  const params = useParams();
  const id = sample ? 1 : params.id ?? 1;
  const { data: report } = useReportDetail(id);

  if (!report) return <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>{!sample && <TopNav active="report" />}</div>;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {!sample && <TopNav active="report" />}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: sample ? "36px 40px 60px" : "44px 40px 60px" }}>
        {sample ? (
          <Badge variant="brand">
            <Icon name="eye" size={13} /> 예시 리포트
          </Badge>
        ) : (
          <button
            className="linkbtn"
            onClick={() => nav("reportList")}
            style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--fg-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Icon name="arrow-left" size={16} /> 리포트 목록
          </button>
        )}

        {/* 메타 */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16 }}>
          <div>
            <Display size={30} tracking={-0.024} as="h1">
              면접 리포트
            </Display>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <Tag style={{ height: 28, fontSize: 13 }}>{report.date}</Tag>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-secondary)" }}>
                {report.resumeName}
              </span>
              <Tag style={{ height: 28, fontSize: 13 }}>{report.type}</Tag>
            </div>
          </div>
          {!sample && (
            <Button variant="assistive" leadingIcon={<Icon name="download" size={16} />}>
              내보내기
            </Button>
          )}
        </div>

        {/* 종합 + 축 */}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, marginTop: 24 }}>
          <Card
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              background: "var(--bg-brand-subtle)",
              borderColor: "transparent",
            }}
          >
            <SectionLabel style={{ marginBottom: 16, color: "var(--blue-800)" }}>종합 점수</SectionLabel>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <ScoreNum score={report.score} size={88} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "var(--blue-800)", opacity: 0.6, paddingBottom: 12 }}>
                / 100
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--blue-800)", marginTop: 14 }}>{report.rank}</div>
          </Card>
          <Card>
            <SectionLabel style={{ marginBottom: 18 }}>채점 축</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {report.axes.map(([n, v]) => (
                <AxisBar key={n} label={n} value={v} />
              ))}
            </div>
          </Card>
        </div>

        {/* 약점 + 과제 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20, marginTop: 20 }}>
          <Card>
            <SectionLabel style={{ marginBottom: 14 }}>약점 · 지적 빈도</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {report.weaknesses.map(([t, n, total]) => (
                <div key={t}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--fg-strong)" }}>{t}</span>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--fg-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                      {n}회 지적 · 질문 {total}개 중
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--neutral-100)", overflow: "hidden" }}>
                    <div style={{ width: `${(n / total) * 100}%`, height: "100%", borderRadius: "var(--radius-full)", background: "var(--blue-800)" }} />
                  </div>
                </div>
              ))}
            </div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                fontWeight: 500,
                lineHeight: 1.5,
                color: "var(--fg-tertiary)",
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <b style={{ color: "var(--fg-secondary)", fontWeight: 700 }}>{report.weaknessSummary}</b>이 가장 자주 지적됐어요. 아래 개선 과제부터 연습해
              보세요.
            </p>
          </Card>
          <Card>
            <SectionLabel style={{ marginBottom: 14 }}>개선 과제 추천</SectionLabel>
            {report.tasks.map(([t, d], i) => (
              <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: i === 0 ? "1px solid var(--border-subtle)" : "none" }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: "var(--bg-brand-subtle)",
                    color: "var(--blue-800)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--fg-strong)" }}>{t}</div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: "var(--fg-secondary)", marginTop: 4 }}>{d}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* 타임라인 */}
        <div style={{ marginTop: 28 }}>
          <SectionLabel style={{ marginBottom: 6 }}>질문 · 답변 타임라인</SectionLabel>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-tertiary)", margin: "0 0 16px" }}>
            안쪽으로 들여쓰기된 질문은 직전 답변을 파고든 <b style={{ color: "var(--blue-800)", fontWeight: 700 }}>꼬리질문</b>이에요.
          </p>
          <div style={{ position: "relative", paddingLeft: 26 }}>
            <span style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "var(--border-subtle)" }} />
            {report.timeline.map((t, i) => {
              const mainNo = report.timeline.slice(0, i + 1).filter((x) => !x.tail).length;
              return (
                <div key={i} style={{ position: "relative", marginBottom: 16, marginLeft: t.tail ? 34 : 0 }}>
                  {/* 꼬리질문 분기 커넥터 */}
                  {t.tail && (
                    <span
                      style={{
                        position: "absolute",
                        left: -34,
                        top: -8,
                        width: 26,
                        height: 20,
                        borderLeft: "2px solid var(--blue-800)",
                        borderBottom: "2px solid var(--blue-800)",
                        borderBottomLeftRadius: 10,
                      }}
                    />
                  )}
                  {/* 노드 */}
                  {t.tail ? (
                    <span style={{ position: "absolute", left: -15, top: 5, width: 11, height: 11, borderRadius: "50%", background: "var(--blue-800)", boxShadow: "0 0 0 3px var(--bg-brand-subtle)" }} />
                  ) : (
                    <span style={{ position: "absolute", left: -25, top: 4, width: 14, height: 14, borderRadius: "50%", background: "var(--bg-surface)", border: "2px solid var(--blue-800)" }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {t.tail ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "var(--blue-800)" }}>
                        <Icon name="corner-down-right" size={14} /> 꼬리 Q{mainNo}
                      </span>
                    ) : (
                      <Badge variant="solid">Q{mainNo}</Badge>
                    )}
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--fg-strong)" }}>{t.q}</span>
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--blue-800)",
                        background: "var(--bg-brand-subtle)",
                        borderRadius: "var(--radius-8)",
                        padding: "3px 10px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {t.score}
                    </span>
                  </div>
                  <Card style={{ padding: "14px 16px", ...(t.tail ? { borderLeft: "3px solid var(--blue-800)" } : {}) }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.02em", color: "var(--fg-tertiary)", marginBottom: 8 }}>
                      내 답변 (요약)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {Array.from({ length: t.lines }).map((_, j) => (
                        <div key={j} style={{ height: 8, borderRadius: 3, background: "var(--neutral-100)", width: j === t.lines - 1 ? "55%" : "92%" }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-secondary)" }}>
                      <span style={{ fontWeight: 700, color: "var(--fg-default)" }}>평가</span> · {t.note}
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
