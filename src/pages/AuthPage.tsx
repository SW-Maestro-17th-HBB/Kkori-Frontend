/* ============================ 로그인 (/login) ============================ */
import { Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, Wordmark } from "../components/primitives";
import { useNav } from "../hooks/useNav";

export function AuthPage() {
  const nav = useNav();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }}>
      <div style={{ height: 60, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: "1px solid var(--border-subtle)" }}>
        <Wordmark />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "72px 0" }}>
        <div
          style={{
            width: 380,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-16)",
            boxShadow: "var(--shadow-2)",
            padding: "44px 36px",
            textAlign: "center",
          }}
        >
          <Display size={26} tracking={-0.024} as="h2">
            시작하기
          </Display>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-secondary)", marginTop: 10 }}>
            카카오 계정으로 3초 만에 시작해요.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            <Button
              variant="solid"
              size="lg"
              fullWidth
              leadingIcon={<Icon name="message-circle" size={18} />}
              onClick={() => nav("consent")}
              style={{ background: "#FEE500", color: "#191600" }}
            >
              카카오로 계속하기
            </Button>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              marginTop: 28,
              paddingTop: 22,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {(
              [
                ["file-text", "이력서 분석"],
                ["mic", "음성 면접"],
                ["bar-chart-3", "점수 리포트"],
              ] as [string, string][]
            ).map(([ic, t]) => (
              <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-brand-subtle)",
                    color: "var(--blue-800)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={ic} size={17} />
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--fg-tertiary)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
