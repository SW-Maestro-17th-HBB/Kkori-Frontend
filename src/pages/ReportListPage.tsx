/* ============================ 리포트 목록 (/reports) ============================ */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useReports, useReportStats } from "../api/hooks";
import { useReportStatusStream } from "../api/reportStatusStream";
import { Button, Chip, Tag } from "../components/ds";
import { Icon } from "../components/Icon";
import {
  Display,
  DocThumb,
  PendingScore,
  ScoreNum,
  SectionLabel,
  WeakTag,
} from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { reportDetailPath } from "../routes";
import type { ReportSortKey, ReportSortOrder, ReportStatus, TrendPoint } from "../api/types";

/** 정렬 선택지 — 백엔드 sort·order 조합에 1:1 매핑. */
const SORT_OPTIONS: readonly {
  key: string;
  label: string;
  sort: ReportSortKey;
  order: ReportSortOrder;
}[] = [
  { key: "latest", label: "최신순", sort: "createdAt", order: "desc" },
  { key: "oldest", label: "오래된순", sort: "createdAt", order: "asc" },
  { key: "scoreHigh", label: "점수 높은순", sort: "overallScore", order: "desc" },
  { key: "scoreLow", label: "점수 낮은순", sort: "overallScore", order: "asc" },
];

/** 상태 필터 — 백엔드 목록 API는 단일 status만 받으므로 각 값에 1:1(전체는 미지정). */
const STATUS_FILTERS: readonly { label: string; value?: ReportStatus }[] = [
  { label: "전체" },
  { label: "완료", value: "COMPLETED" },
  { label: "생성 중", value: "PROCESSING" },
  { label: "대기 중", value: "PENDING" },
  { label: "실패", value: "FAILED" },
];

const PAGE_SIZE = 20;

/** 로딩·에러·빈 상태를 보여주는 표 셀 공통 스타일 */
const STATE_CELL = {
  textAlign: "center",
  padding: "48px 0",
  color: "var(--fg-tertiary)",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  fontWeight: 500,
} as const;

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
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <defs>
            <linearGradient id="hbbTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue-800)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--blue-800)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#hbbTrend)" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--blue-800)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
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
          <span
            key={p.d}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--fg-tertiary)",
            }}
          >
            {p.d}
          </span>
        ))}
      </div>
    </div>
  );
}

/* 약점 분포 — 도넛 (conic-gradient) + 범례 */
function WeaknessDonut({ segments }: { segments: [string, number][] }) {
  const colors = [
    "var(--blue-800)",
    "var(--blue-400)",
    "oklch(0.86 0.06 258)",
    "var(--neutral-200)",
  ];
  const segs = segments.map(
    (s, i) => [...s, colors[i % colors.length]] as [string, number, string],
  );
  const total = segs.reduce((a, s) => a + s[1], 0);
  const grad = segs
    .map((s, i) => {
      const before = segs.slice(0, i).reduce((a, x) => a + x[1], 0);
      const start = (before / total) * 360;
      const end = ((before + s[1]) / total) * 360;
      return `${s[2]} ${start}deg ${end}deg`;
    })
    .join(", ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          flexShrink: 0,
          background: `conic-gradient(${grad})`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 22,
            borderRadius: "50%",
            background: "var(--bg-surface)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--fg-strong)",
              lineHeight: 1,
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10,
              fontWeight: 600,
              color: "var(--fg-tertiary)",
              marginTop: 2,
            }}
          >
            건 지적
          </span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
        {segs.map(([n, c, col]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 3, background: col, flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-default)",
              }}
            >
              {n}
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--fg-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {c}회
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 정렬 드롭다운 — Chip 트리거 + 아래로 열리는 옵션 메뉴 (바깥 클릭·Esc로 닫힘) */
function SortDropdown({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusTrigger = () => ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus(); // 열리면 메뉴로 포커스를 옮긴다(키보드 진입점)
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        focusTrigger(); // Esc 로 닫을 때 트리거로 포커스 복원(포커스 유실 방지)
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Chip
        selected={open}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        정렬: {current.label} <Icon name="chevron-down" size={14} />
      </Chip>
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          aria-label="정렬 기준"
          style={{
            outline: "none",
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 20,
            minWidth: 148,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-12)",
            boxShadow: "var(--shadow-pop)",
            padding: 6,
          }}
        >
          {SORT_OPTIONS.map((o) => {
            const active = o.key === value;
            return (
              <button
                key={o.key}
                className="linkbtn"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                  focusTrigger(); // 선택 후 트리거로 포커스 복원(키보드 사용자)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-8)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--blue-800)" : "var(--fg-default)",
                  background: active ? "var(--bg-brand-subtle)" : "transparent",
                }}
              >
                {o.label}
                {active && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReportListPage() {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState("latest");
  const [status, setStatus] = useState<ReportStatus | undefined>(undefined);
  const [page, setPage] = useState(0);
  const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0];
  const {
    data: pageData,
    isPending,
    isError,
    refetch,
  } = useReports({
    status,
    sort: sortOpt.sort,
    order: sortOpt.order,
    page,
    size: PAGE_SIZE,
  });
  const rows = pageData?.items ?? [];
  const { data: stats } = useReportStats();
  useReportStatusStream();

  // 정렬·필터를 바꾸면 첫 페이지로 돌아간다 (뒤쪽 페이지에 머물러 빈 결과가 뜨지 않게)
  const changeSort = (key: string) => {
    setSortKey(key);
    setPage(0);
  };
  const changeStatus = (value?: ReportStatus) => {
    setStatus(value);
    setPage(0);
  };

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active="report" />
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 40px 60px" }}>
        <SectionLabel>리포트</SectionLabel>
        <Display size={32} tracking={-0.025} style={{ marginTop: 8, marginBottom: 22 }}>
          면접 리포트
        </Display>

        {/* 전체 통계 요약 — 1행: KPI + 점수 추이 */}
        <div
          style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, marginBottom: 28 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                background: "var(--bg-brand-subtle)",
                borderRadius: "var(--radius-16)",
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--blue-800)",
                }}
              >
                평균 점수
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 6 }}>
                <ScoreNum score={stats?.avgScore ?? 0} size={40} />
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--blue-800)",
                    paddingBottom: 6,
                  }}
                >
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
                <div
                  key={k}
                  style={{
                    flex: 1,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-12)",
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--fg-tertiary)",
                    }}
                  >
                    {k}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: "var(--fg-strong)",
                      marginTop: 5,
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-16)",
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SectionLabel>점수 추이</SectionLabel>
            {stats && <TrendChart pts={stats.trend} />}
          </div>
        </div>

        {/* 2행: 채점 축 평균 + 약점 분포 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-16)",
              padding: "18px 22px",
            }}
          >
            <SectionLabel style={{ marginBottom: 16 }}>
              채점 축 평균 ({stats?.totalCount ?? 0}회)
            </SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {(stats?.axisAverages ?? []).map(([n, v]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 84,
                      flexShrink: 0,
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-default)",
                    }}
                  >
                    {n}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: "var(--radius-full)",
                      background: "var(--neutral-100)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: v === null ? "0%" : `${v}%`,
                        height: "100%",
                        borderRadius: "var(--radius-full)",
                        background: v !== null && v >= 80 ? "var(--blue-800)" : "var(--blue-400)",
                      }}
                    />
                  </div>
                  {v === null ? (
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: "var(--font-sans)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "var(--fg-tertiary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      음성 분석 예정
                    </span>
                  ) : (
                    <span
                      style={{
                        width: 26,
                        textAlign: "right",
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--fg-strong)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {v}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-16)",
              padding: "18px 22px",
            }}
          >
            <SectionLabel style={{ marginBottom: 14 }}>약점 분포</SectionLabel>
            {stats && <WeaknessDonut segments={stats.weaknessSegments} />}
          </div>
        </div>

        {/* 상태 필터 + 정렬 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.label} selected={status === f.value} onClick={() => changeStatus(f.value)}>
              {f.label}
            </Chip>
          ))}
          <div style={{ flex: 1 }} />
          <SortDropdown value={sortKey} onChange={changeSort} />
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
            {isPending ? (
              <tr>
                <td colSpan={6} style={STATE_CELL}>
                  불러오는 중…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} style={STATE_CELL}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    리포트를 불러오지 못했어요.
                    <Button variant="assistive" onClick={() => refetch()}>
                      다시 시도
                    </Button>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={STATE_CELL}>
                  {status ? "해당 상태의 리포트가 없어요." : "아직 리포트가 없어요."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="hbb-table__row"
                  // 상세는 완료된 리포트만 조회 가능(RP003/RP004) — 미완성 행은 이동시키지 않는다
                  onClick={() => r.status === "COMPLETED" && navigate(reportDetailPath(r.id))}
                  style={{ cursor: r.status === "COMPLETED" ? "pointer" : "default" }}
                >
                  <td style={{ color: "var(--fg-secondary)" }}>{r.date}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <DocThumb ext={r.resumeExt} size={26} />
                      <span style={{ fontWeight: 600, color: "var(--fg-strong)" }}>
                        {r.resumeName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Tag style={{ height: 26, fontSize: 12 }}>{r.type}</Tag>
                  </td>
                  <td>
                    {r.score === null ? (
                      <PendingScore status={r.status} />
                    ) : (
                      <ScoreNum score={r.score} size={22} suffix="/100" />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.tags.map((t) => (
                        <WeakTag key={t}>{t}</WeakTag>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", color: "var(--fg-tertiary)" }}>
                    {/* 완료 행만 이동 가능 — chevron 을 키보드 접근 버튼으로(행 클릭은 마우스 편의).
                      미완성 행은 chevron 을 숨겨 클릭 가능 오해를 없앤다 */}
                    {r.status === "COMPLETED" && (
                      <button
                        className="linkbtn"
                        aria-label={`${r.resumeName} 리포트 상세 보기`}
                        onClick={(e) => {
                          e.stopPropagation(); // 행 onClick 과 중복 이동 방지
                          navigate(reportDetailPath(r.id));
                        }}
                        style={{ display: "inline-flex", color: "var(--fg-tertiary)" }}
                      >
                        <Icon name="chevron-right" size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 페이지네이션 — 서버 hasNext 기반 이전/다음 (총 개수 표시) */}
        {(page > 0 || pageData?.hasNext) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              marginTop: 24,
            }}
          >
            <Button variant="assistive" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {page + 1} 페이지 · 총 {pageData?.totalElements ?? 0}개
            </span>
            <Button
              variant="assistive"
              disabled={!pageData?.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
