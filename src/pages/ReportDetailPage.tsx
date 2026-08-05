/* ============================ 리포트 상세 (/reports/:id · /sample) ============================ */
import { useParams } from "react-router";
import { sampleReportDetail, sampleTimeline } from "../api/fixtures";
import { useReportDetail, useReportTimeline } from "../api/hooks";
import { Badge, Button, Card, Tag } from "../components/ds";
import { Icon } from "../components/Icon";
import { AxisBar, Display, ScoreNum, SectionLabel, WeakTag } from "../components/primitives";
import { PublicHeader } from "../components/PublicHeader";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

export function ReportDetailPage({ sample = false }: { sample?: boolean }) {
  const nav = useNav();
  const params = useParams();
  const id = sample ? 1 : (params.id ?? 1);
  // 공개 예시(/sample)는 인증 API를 부르지 않고 정적 목데이터를 쓴다 (enabled=false)
  const { data: fetched } = useReportDetail(id, !sample);
  const report = sample ? sampleReportDetail : fetched;
  // 타임라인은 상세와 독립 조회(병렬) — 실패해도 상세는 그대로 뜨고 타임라인 영역만 빈다
  const { data: fetchedTimeline } = useReportTimeline(id, !sample);
  const timeline = sample ? sampleTimeline : (fetchedTimeline ?? []);

  if (!report)
    return (
      <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
        {sample ? <PublicHeader /> : <TopNav active="report" />}
      </div>
    );

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {sample ? <PublicHeader /> : <TopNav active="report" />}
      <div
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: sample ? "36px 40px 60px" : "44px 40px 60px",
        }}
      >
        {sample ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="linkbtn"
              onClick={() => nav("landing")}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--fg-secondary)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="arrow-left" size={16} /> 돌아가기
            </button>
            <Badge variant="brand">
              <Icon name="eye" size={13} /> 예시 리포트
            </Badge>
          </div>
        ) : (
          <button
            className="linkbtn"
            onClick={() => nav("reportList")}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--fg-secondary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="arrow-left" size={16} /> 리포트 목록
          </button>
        )}

        {/* 메타 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: 16,
          }}
        >
          <div>
            <Display size={30} tracking={-0.024} as="h1">
              면접 리포트
            </Display>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <Tag style={{ height: 28, fontSize: 13 }}>{report.date}</Tag>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--fg-secondary)",
                }}
              >
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
            <SectionLabel style={{ marginBottom: 16, color: "var(--blue-800)" }}>
              종합 점수
            </SectionLabel>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <ScoreNum score={report.score ?? 0} size={88} />
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--blue-800)",
                  opacity: 0.6,
                  paddingBottom: 12,
                }}
              >
                / 100
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--blue-800)",
                marginTop: 14,
              }}
            >
              질문 {report.questionCount}개
            </div>
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

        {/* 총평 */}
        {report.summary && (
          <Card style={{ marginTop: 20 }}>
            <SectionLabel style={{ marginBottom: 12 }}>총평</SectionLabel>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14.5,
                fontWeight: 500,
                lineHeight: 1.7,
                color: "var(--fg-default)",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
              }}
            >
              {report.summary}
            </p>
          </Card>
        )}

        {/* 약점 + 과제 */}
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 20, marginTop: 20 }}
        >
          <Card>
            <SectionLabel style={{ marginBottom: 14 }}>약점 · 지적 빈도</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {report.weaknesses.map(([t, n, total]) => (
                <div key={t}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 7,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--fg-strong)",
                      }}
                    >
                      {t}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--fg-tertiary)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {n}회 지적 · 질문 {total}개 중
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: "var(--radius-full)",
                      background: "var(--neutral-100)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${total ? (n / total) * 100 : 0}%`,
                        height: "100%",
                        borderRadius: "var(--radius-full)",
                        background: "var(--blue-800)",
                      }}
                    />
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
              <b style={{ color: "var(--fg-secondary)", fontWeight: 700 }}>
                {report.weaknessSummary}
              </b>
              이 가장 자주 지적됐어요. 아래 개선 과제부터 연습해 보세요.
            </p>
          </Card>
          <Card>
            <SectionLabel style={{ marginBottom: 14 }}>개선 과제 추천</SectionLabel>
            {report.tasks.map(([t, d], i) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "12px 0",
                  borderBottom: i === 0 ? "1px solid var(--border-subtle)" : "none",
                }}
              >
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
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--fg-strong)",
                    }}
                  >
                    {t}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      color: "var(--fg-secondary)",
                      marginTop: 4,
                    }}
                  >
                    {d}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* 타임라인 */}
        <div style={{ marginTop: 28 }}>
          <SectionLabel style={{ marginBottom: 6 }}>질문 · 답변 타임라인</SectionLabel>
          {timeline.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
                margin: "8px 0 0",
              }}
            >
              질문·답변 기록이 아직 없어요.
            </p>
          ) : (
            <>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--fg-tertiary)",
                  margin: "0 0 16px",
                }}
              >
                안쪽으로 들여쓰기된 질문은 직전 답변을 파고든{" "}
                <b style={{ color: "var(--blue-800)", fontWeight: 700 }}>꼬리질문</b>이에요.
              </p>
              <div style={{ position: "relative", paddingLeft: 26 }}>
                <span
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    background: "var(--border-subtle)",
                  }}
                />
                {timeline.map((t) => {
                  const ev = t.evaluation;
                  const hasAnswer = t.answer.trim().length > 0;
                  return (
                    <div
                      key={t.questionNumber}
                      style={{
                        position: "relative",
                        marginBottom: 16,
                        marginLeft: t.isTail ? 34 : 0,
                      }}
                    >
                      {/* 꼬리질문 분기 커넥터 */}
                      {t.isTail && (
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
                      {t.isTail ? (
                        <span
                          style={{
                            position: "absolute",
                            left: -15,
                            top: 5,
                            width: 11,
                            height: 11,
                            borderRadius: "50%",
                            background: "var(--blue-800)",
                            boxShadow: "0 0 0 3px var(--bg-brand-subtle)",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            position: "absolute",
                            left: -25,
                            top: 4,
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background: "var(--bg-surface)",
                            border: "2px solid var(--blue-800)",
                          }}
                        />
                      )}
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
                      >
                        {t.isTail ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              flexShrink: 0,
                              fontFamily: "var(--font-sans)",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--blue-800)",
                            }}
                          >
                            <Icon name="corner-down-right" size={14} /> 꼬리 Q
                            {t.parentQuestionNumber ?? t.questionNumber}
                          </span>
                        ) : (
                          <Badge variant="solid">Q{t.questionNumber}</Badge>
                        )}
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "var(--fg-strong)",
                            wordBreak: "keep-all",
                          }}
                        >
                          {t.question}
                        </span>
                      </div>
                      <Card
                        style={{
                          padding: "14px 16px",
                          ...(t.isTail ? { borderLeft: "3px solid var(--blue-800)" } : {}),
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                            color: "var(--fg-tertiary)",
                            marginBottom: 8,
                          }}
                        >
                          내 답변
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "var(--font-sans)",
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: 1.6,
                            color: hasAnswer ? "var(--fg-default)" : "var(--fg-tertiary)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "keep-all",
                          }}
                        >
                          {hasAnswer ? t.answer : "답변 없음"}
                        </p>
                        {ev && (
                          <div
                            style={{
                              marginTop: 12,
                              paddingTop: 12,
                              borderTop: "1px solid var(--border-subtle)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 6,
                                fontFamily: "var(--font-sans)",
                                fontSize: 13,
                                fontWeight: 500,
                                lineHeight: 1.5,
                                color: "var(--fg-secondary)",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: "var(--fg-default)",
                                  flexShrink: 0,
                                }}
                              >
                                평가
                              </span>
                              <span style={{ wordBreak: "keep-all" }}>{ev.feedback}</span>
                            </div>
                            {ev.weaknessTags.length > 0 && (
                              <div
                                style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}
                              >
                                {ev.weaknessTags.map((w) => (
                                  <WeakTag key={w}>{w}</WeakTag>
                                ))}
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                gap: 14,
                                marginTop: 10,
                                fontFamily: "var(--font-sans)",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--fg-tertiary)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              <span>논리 {ev.logicScore ?? "-"}</span>
                              <span>구체성 {ev.specificityScore ?? "-"}</span>
                              <span>기술 {ev.technicalAccuracyScore ?? "-"}</span>
                            </div>
                          </div>
                        )}
                      </Card>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* AI 분석 한계 안내 — 백엔드가 내려주는 문구를 그대로 표시(하드코딩 금지) */}
        {report.aiDisclaimer && (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 12.5,
              fontWeight: 500,
              lineHeight: 1.6,
              color: "var(--fg-tertiary)",
              marginTop: 28,
              paddingTop: 16,
              borderTop: "1px solid var(--border-subtle)",
              wordBreak: "keep-all",
            }}
          >
            {report.aiDisclaimer}
          </p>
        )}
      </div>
    </div>
  );
}
