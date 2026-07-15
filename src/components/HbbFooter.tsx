/* ---------- 랜딩 푸터 — 다크(--neutral-970) ---------- */
import { Wordmark } from "./primitives";

export function HbbFooter() {
  const cols: [string, string[]][] = [
    ["제품", ["기능 소개", "예시 리포트", "요금"]],
    ["회사", ["소개", "블로그", "채용"]],
    ["지원", ["도움말", "문의하기", "상태"]],
  ];
  return (
    <footer style={{ background: "var(--neutral-970)", color: "#fff", padding: "56px 28px" }}>
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          gap: 40,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 300 }}>
          <Wordmark color="#fff" size={19} />
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.6,
              color: "rgba(255,255,255,.6)",
              marginTop: 14,
            }}
          >
            이력서로 시작하는 AI 음성 모의면접. 개발자를 위한 면접 연습 인프라.
          </p>
        </div>
        <div style={{ display: "flex", gap: 56 }}>
          {cols.map(([h, items]) => (
            <div key={h}>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "rgba(255,255,255,.5)",
                  marginBottom: 14,
                }}
              >
                {h}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {items.map((it) => (
                  <span
                    key={it}
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "rgba(255,255,255,.82)",
                    }}
                  >
                    {it}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          maxWidth: 1120,
          margin: "44px auto 0",
          paddingTop: 22,
          borderTop: "1px solid rgba(255,255,255,.12)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 500,
          color: "rgba(255,255,255,.45)",
        }}
      >
        © 2026 꼬리 잡힌 개발자
      </div>
    </footer>
  );
}
