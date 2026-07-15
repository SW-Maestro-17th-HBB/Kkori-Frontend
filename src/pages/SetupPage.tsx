/* ============================ 면접 설정 (/setup) ============================ */
import { Fragment, useState, type ReactNode } from "react";
import { useResumes } from "../api/hooks";
import { Button, Card } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

function StepCard({
  no,
  title,
  children,
  disabled = false,
}: {
  no: number;
  title: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div style={{ position: "relative" }}>
      <Card style={disabled ? { opacity: 0.5 } : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: disabled ? "var(--neutral-300)" : "var(--blue-800)",
              color: "#fff",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {no}
          </span>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--fg-strong)",
            }}
          >
            {title}
          </h3>
        </div>
        {children}
      </Card>
      {disabled && <div style={{ position: "absolute", inset: 0, cursor: "not-allowed" }} />}
    </div>
  );
}

function SelectRow({ value, small }: { value: string; small?: boolean }) {
  return (
    <div
      style={{
        height: small ? 40 : 48,
        border: "1px solid var(--border-default)",
        borderRadius: small ? "var(--radius-btn-md)" : "var(--radius-12)",
        background: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        fontFamily: "var(--font-sans)",
        fontSize: small ? 14 : 15,
        fontWeight: 500,
        color: "var(--fg-strong)",
        cursor: "pointer",
      }}
    >
      <span>{value}</span>
      <Icon name="chevron-down" size={18} style={{ color: "var(--fg-tertiary)" }} />
    </div>
  );
}

export function SetupPage() {
  const nav = useNav();
  const [dur, setDur] = useState<"quick" | "real">("quick");
  const { data: resumes = [] } = useResumes();
  const resumeOpts = resumes.filter((r) => r.status === "done");
  const [resume, setResume] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  // 이력서 없이는 실전 모의 선택 불가 — 상태 대신 렌더 시점에 파생
  const effectiveDur = !resume && dur === "real" ? "quick" : dur;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active="home" />
      <div style={{ maxWidth: 580, margin: "0 auto", padding: "48px 24px 72px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Display size={32} tracking={-0.025} as="h1">
            면접 준비
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
            아래 단계를 확인하면 면접을 시작할 수 있어요.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <StepCard no={1} title="이력서 선택">
            <div style={{ position: "relative" }}>
              <button
                className="linkbtn"
                onClick={() => setPickOpen((o) => !o)}
                style={{
                  width: "100%",
                  height: 48,
                  border: resume ? "1px solid var(--blue-800)" : "1px solid var(--border-default)",
                  borderRadius: "var(--radius-12)",
                  background: "var(--bg-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    fontFamily: "var(--font-sans)",
                    fontSize: 15,
                    fontWeight: resume ? 600 : 500,
                    color: resume ? "var(--fg-strong)" : "var(--fg-tertiary)",
                  }}
                >
                  {resume ? (
                    <Fragment>
                      <DocThumb ext="PDF" size={22} />
                      {resume} · 분석 완료
                    </Fragment>
                  ) : (
                    "이력서를 선택하세요"
                  )}
                </span>
                <Icon name="chevron-down" size={18} style={{ color: "var(--fg-tertiary)" }} />
              </button>
              {pickOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-12)",
                    boxShadow: "var(--shadow-pop)",
                    overflow: "hidden",
                    padding: 6,
                  }}
                >
                  {resumeOpts.map((r) => (
                    <button
                      key={r.id}
                      className="linkbtn menu-item"
                      onClick={() => {
                        setResume(r.name);
                        setPickOpen(false);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-8)",
                        fontFamily: "var(--font-sans)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--fg-default)",
                      }}
                    >
                      <DocThumb ext={r.ext} size={22} /> {r.name}{" "}
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--fg-tertiary)",
                        }}
                      >
                        분석 완료
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </StepCard>

          <StepCard no={2} title="면접 유형">
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.5,
                color: "var(--fg-secondary)",
                marginBottom: 10,
              }}
            >
              이력서를 분석해 <b style={{ color: "var(--blue-800)", fontWeight: 700 }}>백엔드</b>로
              추천했어요. 직무를 바꾸면 질문 방향이 달라져요.
            </p>
            <SelectRow value="백엔드" />
          </StepCard>

          <StepCard no={3} title="면접 시간">
            <div style={{ display: "flex", gap: 12 }}>
              {(
                [
                  ["quick", "빠른 연습", "약 5분 · 핵심 질문 위주", false],
                  ["real", "실전 모의", "약 30분 · 꼬리질문 포함", true],
                ] as ["quick" | "real", string, string, boolean][]
              ).map(([id, t, s, needsResume]) => {
                const off = needsResume && !resume;
                return (
                  <button
                    key={id}
                    disabled={off}
                    className={
                      "time-opt" +
                      (effectiveDur === id ? " time-opt--on" : "") +
                      (off ? " time-opt--locked" : "")
                    }
                    onClick={() => !off && setDur(id)}
                  >
                    {effectiveDur === id && !off && (
                      <span className="time-opt__badge">
                        <Icon name="check" size={12} strokeWidth={3} />
                      </span>
                    )}
                    <div
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 15,
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
                        lineHeight: 1.3,
                        color: "var(--fg-secondary)",
                        marginTop: 6,
                      }}
                    >
                      {s}
                    </div>
                  </button>
                );
              })}
            </div>
            {!resume && (
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--fg-tertiary)",
                  marginTop: 10,
                }}
              >
                실전 모의(30분)는 이력서를 기반으로 꼬리질문을 만들어요. 먼저{" "}
                <b style={{ color: "var(--fg-secondary)", fontWeight: 700 }}>이력서를 선택</b>해
                주세요.
              </p>
            )}
          </StepCard>

          <StepCard no={4} title="카메라 · 마이크 점검">
            <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              <div
                style={{
                  flex: 1.3,
                  background: "var(--neutral-960)",
                  borderRadius: "var(--radius-12)",
                  aspectRatio: "16/10",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,.45)",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: "rgba(255,255,255,.85)",
                    background: "rgba(255,255,255,.14)",
                    padding: "3px 7px",
                    borderRadius: 4,
                  }}
                >
                  self-view
                </span>
                <Icon name="user-round" size={36} strokeWidth={1.75} />
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    마이크 입력 레벨
                  </div>
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22 }}>
                    {[8, 14, 18, 22, 12, 16, 9].map((h, i) => (
                      <i
                        key={i}
                        style={{
                          width: 5,
                          height: h,
                          borderRadius: 2,
                          background: i < 5 ? "var(--blue-800)" : "var(--neutral-200)",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <SelectRow value="기본 카메라" small />
                <SelectRow value="기본 마이크" small />
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
              {["카메라 정상", "마이크 정상", "권한 허용됨"].map((c) => (
                <span
                  key={c}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--fg-default)",
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "var(--green-600)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="check" size={10} strokeWidth={3} />
                  </span>
                  {c}
                </span>
              ))}
            </div>
          </StepCard>
        </div>

        <div style={{ marginTop: 20 }}>
          <Button variant="solid" size="lg" fullWidth onClick={() => nav("interview")}>
            면접 시작
          </Button>
        </div>
      </div>
    </div>
  );
}
