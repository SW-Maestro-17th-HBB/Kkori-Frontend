/* ============================ 약관 동의 (/signup) ============================ */
import { useState } from "react";
import { Badge, Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { Checkbox, Display, Wordmark } from "../components/primitives";
import { useNav } from "../hooks/useNav";

type TermId = "tos" | "privacy" | "media" | "mkt";

const TERMS: { id: TermId; t: string; req: boolean; body: string }[] = [
  {
    id: "tos",
    t: "이용약관",
    req: true,
    body: "본 약관은 꼬리 잡힌 개발자(이하 “서비스”)의 이용 조건과 절차, 이용자와 회사의 권리·의무를 규정해요. 이용자는 서비스가 제공하는 모의 면접 및 리포트 기능을 본 약관에 따라 이용할 수 있어요.",
  },
  {
    id: "privacy",
    t: "개인정보 수집·이용",
    req: true,
    body: "회사는 회원 식별과 서비스 제공을 위해 이메일, 프로필 정보를 수집해요. 수집한 정보는 목적 달성 후 지체 없이 파기해요.",
  },
  {
    id: "media",
    t: "음성·영상 등 콘텐츠 수집·이용",
    req: true,
    body: "모의 면접 진행 중 녹음된 음성과 영상은 답변 분석 및 리포트 생성에만 사용되며, 별도 동의 없이 제3자에게 제공되지 않아요.",
  },
  {
    id: "mkt",
    t: "마케팅 정보 수신",
    req: false,
    body: "신규 기능, 이벤트 등 마케팅 정보를 이메일로 받아봐요. 언제든 수신 거부할 수 있어요.",
  },
];

export function ConsentPage() {
  const nav = useNav();
  const [checks, setChecks] = useState<Record<TermId, boolean>>({ tos: true, privacy: true, media: true, mkt: false });
  const [open, setOpen] = useState<TermId | null>("tos");

  const allOn = TERMS.every((t) => checks[t.id]);
  const reqOn = TERMS.filter((t) => t.req).every((t) => checks[t.id]);
  const toggle = (id: TermId) => setChecks((c) => ({ ...c, [id]: !c[id] }));
  const toggleAll = () => {
    const v = !allOn;
    setChecks({ tos: v, privacy: v, media: v, mkt: v });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }}>
      <div style={{ height: 60, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: "1px solid var(--border-subtle)" }}>
        <Wordmark />
      </div>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 24px 72px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge variant="brand">
            <Icon name="check" size={13} strokeWidth={2.5} /> Kakao 계정 연결됨
          </Badge>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-tertiary)" }}>회원가입 · 2 / 2 단계</span>
        </div>
        <Display size={30} tracking={-0.024} as="h1" style={{ marginTop: 20 }}>
          약관에 동의하고 시작하세요
        </Display>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, lineHeight: 1.55, color: "var(--fg-secondary)", marginTop: 10 }}>
          처음 오셨네요. 안전한 이용을 위해 아래 약관을 확인하고 동의해 주세요.
        </p>

        <button onClick={toggleAll} className="linkbtn consent-all">
          <Checkbox on={allOn} big />
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--fg-strong)" }}>약관 전체 동의</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-secondary)", marginTop: 4 }}>
              필수 및 선택 항목을 모두 포함해요
            </div>
          </div>
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {TERMS.map((t) => (
            <div key={t.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-12)", background: "var(--bg-surface)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <button className="linkbtn" onClick={() => toggle(t.id)}>
                  <Checkbox on={checks[t.id]} />
                </button>
                <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--fg-strong)" }}>{t.t}</span>
                <Badge variant={t.req ? "brand" : "neutral"}>{t.req ? "필수" : "선택"}</Badge>
                <button className="linkbtn" onClick={() => setOpen(open === t.id ? null : t.id)} style={{ color: "var(--fg-tertiary)" }}>
                  <Icon name={open === t.id ? "chevron-up" : "chevron-down"} size={18} />
                </button>
              </div>
              {open === t.id && (
                <div
                  style={{
                    borderTop: "1px solid var(--border-subtle)",
                    background: "var(--bg-subtle)",
                    padding: "14px 16px",
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: 1.65,
                    color: "var(--fg-secondary)",
                    maxHeight: 140,
                    overflow: "auto",
                  }}
                >
                  {t.body}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 26 }}>
          <Button variant="solid" size="lg" fullWidth disabled={!reqOn} onClick={() => reqOn && nav("dash")}>
            동의하고 시작하기
          </Button>
          {!reqOn && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-tertiary)", textAlign: "center", marginTop: 10 }}>
              필수 항목에 모두 동의해야 시작할 수 있어요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
