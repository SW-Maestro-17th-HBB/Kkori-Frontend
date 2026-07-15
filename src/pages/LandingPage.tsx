/* ============================ 랜딩 (hbb.kr) ============================ */
import { Badge, Button, Card } from "../components/ds";
import { HbbFooter } from "../components/HbbFooter";
import { AxisBar, Display, ScoreNum, Wordmark } from "../components/primitives";
import { useNav } from "../hooks/useNav";

export function LandingPage() {
  const nav = useNav();
  const feats = [
    { t: "이력서 기반 맞춤 질문", d: "올린 이력서를 그대로 읽고, 당신의 경력과 프로젝트에서 나올 법한 질문을 만들어요." },
    { t: "실시간 음성 면접", d: "타이핑이 아니라 목소리로. 실제 면접관처럼 답변을 듣고 꼬리질문까지 이어가요." },
    { t: "끝나면 바로 리포트", d: "논리·구체성·전달력을 점수로. 무엇을 고쳐야 할지 다음 연습 과제까지 짚어드려요." },
  ];
  return (
    <div style={{ background: "var(--bg-canvas)" }}>
      {/* 헤더 */}
      <header style={{ height: 60, background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", height: "100%", padding: "0 28px", display: "flex", alignItems: "center", gap: 24 }}>
          <Wordmark />
          <div style={{ flex: 1 }} />
          <Button variant="solid" onClick={() => nav("auth")}>
            로그인
          </Button>
        </div>
      </header>

      {/* 히어로 — 그래디언트 배너 */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 28px 0" }}>
        <div
          style={{
            borderRadius: "var(--radius-16)",
            background: "var(--gradient-hero)",
            padding: "60px 44px 48px",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.01em",
              color: "#fff",
              background: "rgba(255,255,255,.16)",
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} /> AI 음성 모의면접
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.14,
              letterSpacing: "-0.03em",
              color: "#fff",
              margin: "22px 0 0",
            }}
          >
            이력서로 시작하는
            <br />
            진짜 같은 모의 면접
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 500,
              lineHeight: 1.55,
              color: "rgba(255,255,255,.9)",
              maxWidth: 480,
              margin: "20px auto 0",
            }}
          >
            당신의 이력서를 읽고 실제 면접관처럼 꼬리질문까지. 면접이 끝나면 무엇을 고쳐야 할지 리포트로 알려드려요.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 30, justifyContent: "center" }}>
            <Button variant="solid" size="lg" style={{ background: "#fff", color: "var(--blue-800)" }} onClick={() => nav("auth")}>
              무료로 시작하기
            </Button>
          </div>
          <div style={{ display: "inline-flex", gap: 44, marginTop: 40, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,.2)" }}>
            {[
              ["12,000+", "누적 모의 면접"],
              ["4.8/5", "연습 만족도"],
              ["3분", "평균 리포트 생성"],
            ].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1 }}>
                  {n}
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,.72)", marginTop: 7 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 예시 리포트 섹션 */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 8px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Display size={32} tracking={-0.025} as="h2">
            면접이 끝나면, 이런 리포트를 받아요
          </Display>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: "var(--fg-secondary)", marginTop: 12 }}>
            논리·구체성·전달력을 점수로. 무엇을 고쳐야 할지 바로 알 수 있어요.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: 560,
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-16)",
              padding: 28,
              boxShadow: "var(--shadow-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--fg-tertiary)",
                  letterSpacing: "0.02em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red-600)" }} /> 예시 리포트 · REC 04:12
              </span>
              <Badge variant="success" dot>
                완료
              </Badge>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 16 }}>
              <ScoreNum score={82} size={64} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--fg-tertiary)", paddingBottom: 8 }}>/ 100</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-secondary)", paddingBottom: 10, marginLeft: 6 }}>
                상위 18% · 안정적
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 14, marginTop: 20 }}>
              {(
                [
                  ["논리 구성", 85],
                  ["기술 정확도", 88],
                  ["전달력", 74],
                  ["구체성", 72],
                ] as [string, number][]
              ).map(([n, v]) => (
                <AxisBar key={n} label={n} value={v} />
              ))}
            </div>
            <div style={{ marginTop: 22, textAlign: "center" }}>
              <Button variant="assistive" onClick={() => nav("sample")}>
                예시 리포트 전체 보기
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 3블록 */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 28px 8px" }}>
        <Display size={32} tracking={-0.025} as="h2" style={{ textAlign: "center", marginBottom: 40 }}>
          연습이 실전이 되도록
        </Display>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {feats.map((f, i) => (
            <Card key={f.t} style={{ padding: 28 }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: "0.02em",
                  color: "var(--blue-800)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 style={{ margin: "18px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.012em", color: "var(--fg-strong)" }}>{f.t}</h3>
              <p style={{ margin: "10px 0 0", fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, lineHeight: 1.6, color: "var(--fg-secondary)" }}>
                {f.d}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA 밴드 (다크 인버스) */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 28px 72px" }}>
        <div style={{ background: "var(--bg-inverse)", borderRadius: "var(--radius-16)", padding: "64px 40px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, letterSpacing: "-0.025em", color: "#fff", margin: 0 }}>
            지금 이력서를 올리고 면접을 시작하세요
          </h2>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 500, color: "rgba(255,255,255,.72)", marginTop: 14 }}>
            회원가입은 30초, 첫 모의 면접은 무료예요.
          </p>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
            <Button variant="solid" size="lg" onClick={() => nav("auth")}>
              무료로 시작하기
            </Button>
          </div>
        </div>
      </section>

      <HbbFooter />
    </div>
  );
}
