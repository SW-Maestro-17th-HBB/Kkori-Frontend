/* ============================ 리포트 목록 (/reports) ============================ */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useReports, useReportStats } from "../api/hooks";
import { Chip, Tag } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb, ScoreNum, SectionLabel, WeakTag } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { reportDetailPath } from "../routes";
import type { TrendPoint } from "../api/types";

/* 점수 추이 — SVG 라인 + HTML 오버레이 점·숫자
   (preserveAspectRatio="none" 왜곡을 오버레이로 회피) */
function TrendChart({ pts }: { pts: TrendPoint[] }) {
  const H = 96,
    min = 55,
    max = 90,
    padY = 14;
  const xpct = (i: number) => (i / (pts.length - 1)) * 100;
  const ypx = (s: number) => H - ((s - min) / (max - min)) * (H - padY * 2) - padY;
  const line = pts.map((p, i) => `${xpct(i)},${ypx(p.s)}`).join(" ");
  const area = `0,${H} ${line} 100,${H}`;
  return (
    <div style={{ flex: 1, marginTop: 20 }}>
      <div style={{ position: "relative", height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="hbbTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue-800)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--blue-800)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#hbbTrend)" />
          <polyline points={line} fill="none" stroke="var(--blue-800)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {pts.map((p, i) => {
          const last = i === pts.length - 1;
          return (
            <span key={p.d}>
              <span
                style={{
                  position: "absolute",
                  left: `${xpct(i)}%`,
                  top: ypx(p.s),
                  transform: "translate(-50%,-50%)",
                  width: last ? 10 : 7,
                  height: last ? 10 : 7,
                  borderRadius: "50%",
                  background: last ? "var(--blue-800)" : "var(--bg-surface)",
                  border: "2px solid var(--blue-800)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: `${xpct(i)}%`,
                  top: ypx(p.s) - 12,
                  transform: "translate(-50%,-100%)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: last ? "var(--blue-800)" : "var(--fg-tertiary)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {p.s}
              </span>
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {pts.map((p) => (
          <span key={p.d} style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 500, color: "var(--fg-tertiary)" }}>
            {p.d}
          </span>
        ))}
      </div>
    </div>
  );
}

/* 약점 분포 — 도넛 (conic-gradient) + 범례 */
function WeaknessDonut({ segments }: { segments: [string, number][] }) {
  const colors = ["var(--blue-800)", "var(--blue-400)", "oklch(0.86 0.06 258)", "var(--neutral-200)"];
  const segs = segments.map((s, i) => [...s, colors[i % colors.length]] as [string, number, string]);
  const total = segs.reduce((a, s) => a + s[1], 0);
  let acc = 0;
  const grad = segs
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s[1];
      const end = (acc / total) * 360;
      return `${s[2]} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(${grad})`, position: "relative" }}>
        <div style={{ position: "absolute", inset: 22, borderRadius: "50%", background: "var(--bg-surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--fg-strong)", lineHeight: 1 }}>{total}</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--fg-tertiary)", marginTop: 2 }}>건 지적</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
        {segs.map(([n, c, col]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: col, flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-default)" }}>{n}</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {c}회
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportListPage() {
  const navigate = useNavigate();
  const { data: rows = [] } = useReports();
  const { data: stats } = useReportStats();
  const [filter, setFilter] = useState("전체");

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active="report" />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 40px 60px" }}>
        <SectionLabel>리포트</SectionLabel>
        <Display size={32} tracking={-0.025} style={{ marginTop: 8, marginBottom: 22 }}>
          면접 리포트
        </Display>

        {/* 전체 통계 요약 — 1행: KPI + 점수 추이 */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "var(--bg-brand-subtle)", borderRadius: "var(--radius-16)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--blue-800)" }}>평균 점수</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 6 }}>
                <ScoreNum score={stats?.avgScore ?? 0} size={40} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--blue-800)", paddingBottom: 6 }}>
                  {stats?.avgDelta ?? ""}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {(
                [
                  ["총 면접", `${stats?.totalCount ?? 0}회`],
                  ["최고 점수", `${stats?.bestScore ?? 0}점`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} style={{ flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-12)", padding: "14px 16px" }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, color: "var(--fg-tertiary)" }}>{k}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg-strong)", marginTop: 5 }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-16)", padding: "18px 22px", display: "flex", flexDirection: "column" }}>
            <SectionLabel>점수 추이</SectionLabel>
            {stats && <TrendChart pts={stats.trend} />}
          </div>
        </div>

        {/* 2행: 채점 축 평균 + 약점 분포 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-16)", padding: "18px 22px" }}>
            <SectionLabel style={{ marginBottom: 16 }}>채점 축 평균 ({stats?.totalCount ?? 0}회)</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {(stats?.axisAverages ?? []).map(([n, v]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 84, flexShrink: 0, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-default)" }}>{n}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: "var(--radius-full)", background: "var(--neutral-100)", overflow: "hidden" }}>
                    <div style={{ width: `${v}%`, height: "100%", borderRadius: "var(--radius-full)", background: v >= 80 ? "var(--blue-800)" : "var(--blue-400)" }} />
                  </div>
                  <span style={{ width: 26, textAlign: "right", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--fg-strong)", fontVariantNumeric: "tabular-nums" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-16)", padding: "18px 22px" }}>
            <SectionLabel style={{ marginBottom: 14 }}>약점 분포</SectionLabel>
            {stats && <WeaknessDonut segments={stats.weaknessSegments} />}
          </div>
        </div>

        {/* 필터 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {["전체", "이력서별", "기간"].map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
              {f}
              {f !== "전체" && <Icon name="chevron-down" size={14} />}
            </Chip>
          ))}
          <div style={{ flex: 1 }} />
          <Chip>
            정렬: 최신순 <Icon name="chevron-down" size={14} />
          </Chip>
        </div>

        <table className="hbb-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>날짜</th>
              <th>사용 이력서</th>
              <th style={{ width: 110 }}>면접 시간</th>
              <th style={{ width: 92 }}>점수</th>
              <th style={{ width: 220 }}>약점 태그</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hbb-table__row" onClick={() => navigate(reportDetailPath(r.id))}>
                <td style={{ color: "var(--fg-secondary)" }}>{r.date}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <DocThumb ext={r.resumeExt} size={26} />
                    <span style={{ fontWeight: 600, color: "var(--fg-strong)" }}>{r.resumeName}</span>
                  </div>
                </td>
                <td>
                  <Tag style={{ height: 26, fontSize: 12 }}>{r.type}</Tag>
                </td>
                <td>
                  <ScoreNum score={r.score} size={22} suffix="/100" />
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.tags.map((t) => (
                      <WeakTag key={t}>{t}</WeakTag>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: "right", color: "var(--fg-tertiary)" }}>
                  <Icon name="chevron-right" size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
