/* ============================================================
   공유 프리미티브 — 프로토타입 lib.jsx 이식
   단일 브랜드 블루(--blue-800) 액센트 · 쿨 뉴트럴 · 헤어라인 · 플랫.
   ============================================================ */
import type { CSSProperties, ElementType, ReactNode } from "react";
import { Badge, Progress, Tag } from "./ds";
import { Icon } from "./Icon";

/* ---------- 워드마크 (로고 파일 없음 → 디스플레이 타입, 브랜드 블루) ---------- */
export function Wordmark({
  size = 20,
  color = "var(--blue-800)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.03em",
        color,
        whiteSpace: "nowrap",
      }}
    >
      꼬리 잡힌 개발자
    </span>
  );
}

/* ---------- 디스플레이 헤딩 (Wanted Sans) ---------- */
export function Display({
  size = 36,
  tracking = -0.027,
  weight = 700,
  children,
  as = "h1",
  style,
}: {
  size?: number;
  tracking?: number;
  weight?: number;
  children: ReactNode;
  as?: ElementType;
  style?: CSSProperties;
}) {
  const TagEl = as;
  return (
    <TagEl
      style={{
        margin: 0,
        fontFamily: "var(--font-display)",
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.2,
        letterSpacing: `${tracking}em`,
        color: "var(--fg-strong)",
        ...style,
      }}
    >
      {children}
    </TagEl>
  );
}

/* ---------- 섹션 라벨 (caption, secondary) ---------- */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        color: "var(--fg-secondary)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- 상태 배지 (시맨틱 세미컬러 washed) ---------- */
export function StatusBadge({
  kind,
  children,
}: {
  kind: "done" | "fail" | "ing" | string;
  children: ReactNode;
}) {
  if (kind === "done")
    return (
      <Badge variant="success" dot>
        {children}
      </Badge>
    );
  if (kind === "fail")
    return (
      <Badge variant="danger" dot>
        {children}
      </Badge>
    );
  if (kind === "ing")
    return (
      <Badge variant="brand">
        <span
          className="status-spin"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: "1.5px solid var(--blue-100)",
            borderTopColor: "var(--blue-800)",
            display: "inline-block",
          }}
        />
        {children}
      </Badge>
    );
  return <Badge variant="neutral">{children}</Badge>;
}

/* ---------- 약점 태그 (중립 Tag) ---------- */
export function WeakTag({ children }: { children: ReactNode }) {
  return <Tag style={{ height: 26, fontSize: 12 }}>{children}</Tag>;
}

/* ---------- 점수 (대형 브랜드 블루 숫자) ---------- */
export function ScoreNum({
  score,
  size = 52,
  suffix,
  color = "var(--blue-800)",
}: {
  score: number;
  size?: number;
  suffix?: string;
  color?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", flexShrink: 0 }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: size,
          lineHeight: 0.9,
          letterSpacing: "-0.03em",
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </span>
      {suffix && (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: size * 0.28,
            fontWeight: 600,
            color: "var(--fg-tertiary)",
            marginLeft: 3,
          }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

/* ---------- 채점 축 바 (Progress, 브랜드 블루 fill) ----------
   value 가 null 이면 아직 평가되지 않은 축(전달력 — 음성 분석 도입 전)으로 보고
   점수 대신 안내 문구를 표시한다. */
export function AxisBar({ label, value }: { label: string; value: number | null }) {
  const pending = value === null;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        <span style={{ color: "var(--fg-default)" }}>{label}</span>
        <span
          style={{
            color: pending ? "var(--fg-tertiary)" : "var(--fg-secondary)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
            fontSize: pending ? 12.5 : 14,
          }}
        >
          {pending ? "음성 분석 예정" : value}
        </span>
      </div>
      <Progress value={pending ? 0 : value} />
    </div>
  );
}

/* ---------- 파일 썸네일 (뉴트럴 서브틀 타일 + ext) ---------- */
export function DocThumb({ ext = "PDF", size = 40 }: { ext?: string; size?: number }) {
  const h = Math.round(size * 1.28);
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: h,
        flexShrink: 0,
        borderRadius: "var(--radius-8)",
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        name="file-text"
        size={Math.round(size * 0.46)}
        strokeWidth={1.75}
        style={{ color: "var(--fg-tertiary)" }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(size * 0.34),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--blue-800)",
          color: "#fff",
          fontFamily: "var(--font-sans)",
          fontSize: Math.max(7, Math.round(size * 0.2)),
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {ext}
      </span>
    </div>
  );
}

/* ---------- 커스텀 체크박스 (on일 때 blue-800 + 흰 체크) ---------- */
export function Checkbox({ on, big }: { on: boolean; big?: boolean }) {
  const s = big ? 22 : 20;
  return (
    <span
      style={{
        width: s,
        height: s,
        borderRadius: "var(--radius-4)",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: on ? "var(--blue-800)" : "var(--bg-surface)",
        border: on ? "none" : "1.5px solid var(--border-strong)",
        color: "#fff",
        transition: "background 120ms ease",
      }}
    >
      {on && <Icon name="check" size={big ? 15 : 13} strokeWidth={3} />}
    </span>
  );
}

/* ---------- 섹션 헤더 (제목 + 카운트 + 액션) ---------- */
export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.019em",
              color: "var(--fg-strong)",
            }}
          >
            {title}
          </h2>
          {count != null && (
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--fg-tertiary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
