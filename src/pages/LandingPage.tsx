/* ============================ 랜딩 (hbb.kr) ============================
   비로그인 첫 화면. 숫자 대신 제품 화면의 축소판(면접 대화 · 꼬리질문 구조 · 예시 리포트)으로 설명한다.
   예시 리포트 영역은 /sample 과 같은 정적 픽스처(sampleReportDetail · sampleTimeline)를 그대로 써서
   두 화면의 값이 어긋나지 않게 한다. 반응형 레이아웃 규칙은 global.css 의 .landing-* 클래스. */
import type { ReactNode } from "react";
import { sampleReportDetail, sampleTimeline } from "../api/fixtures";
import { Badge, Button, Card, Tag } from "../components/ds";
import { HbbFooter } from "../components/HbbFooter";
import { Icon } from "../components/Icon";
import { AxisBar, Display, ScoreNum, SectionLabel, WeakTag } from "../components/primitives";
import { PublicHeader } from "../components/PublicHeader";
import { useNav } from "../hooks/useNav";

/* ---------- 카피 — 근거: Kkori-Backend README, 세션·꼬리질문·평가 기준 PRD ---------- */
const HERO_FACTS = [
  "카카오 로그인",
  "백엔드 · 프론트엔드 직무",
  "빠른 연습 약 5분 · 실전 모의 약 30분",
];

const STEPS: { icon: string; title: string; desc: string }[] = [
  {
    icon: "file-up",
    title: "이력서 업로드",
    desc: "PDF를 올리면 텍스트 추출과 구조화를 거쳐 기본 정보·보유 기술·프로젝트·경력으로 정리돼요. 분석 단계가 실시간으로 보이고, 결과는 직접 고치거나 다시 분석할 수 있어요.",
  },
  {
    icon: "video",
    title: "면접 설정",
    desc: "이력서와 직무, 면접 시간을 고르고 카메라와 마이크를 점검해요. 실전 모의는 이력서를 바탕으로 질문이 이어져요.",
  },
  {
    icon: "audio-lines",
    title: "음성 면접",
    desc: "브라우저에서 AI 면접관 ‘꼬리’와 실시간으로 대화해요. 연결이 끊겨도 진행 중인 세션에 다시 들어갈 수 있어요.",
  },
  {
    icon: "bar-chart-3",
    title: "리포트 확인",
    desc: "면접이 끝나면 대화 기록을 바탕으로 리포트가 자동 생성되고, 완료되면 알림으로 알려드려요. 회차가 쌓이면 점수 추이도 볼 수 있어요.",
  },
];

const FOLLOW_UP_TYPES: [string, string][] = [
  ["심화", "왜 그렇게 판단했는지, 어떤 원리로 동작하는지 파고들어요."],
  ["구체화", "모호한 부분에 실제 사례·행동·수치를 요구해요."],
  ["검증", "답변에서 언급한 기술이나 개념을 실제로 이해하는지 확인해요."],
  ["경계", "그 선택의 트레이드오프, 대안, 한계나 실패 경험을 물어요."],
  ["일관성", "이전 답변과 상충하는 지점이 있으면 확인형으로 되물어요."],
];

const REPORT_ITEMS: [string, string][] = [
  ["총평", "잘한 점, 반복된 약점 패턴, 다음 면접을 위한 우선순위 조언을 정리해요."],
  ["영역별 점수", "논리성·구체성·기술 정확성은 답변 텍스트로, 전달력은 음성 분석으로 평가해요."],
  [
    "답변별 피드백과 이력서 근거",
    "질문마다 피드백을 달고, 기술 정확성 판정에는 이력서의 관련 경험을 근거로 함께 보여줘요.",
  ],
  [
    "약점 태그와 개선 과제",
    "반복되는 약점을 태그로 묶고, 태그마다 바로 실행할 수 있는 과제를 제안해요.",
  ],
  ["질문·답변 타임라인", "꼬리질문 분기까지 그대로 보여줘서 지적을 원래 답변과 대조할 수 있어요."],
  ["회차별 통계", "점수 추이와 약점 빈도로 연습하면서 달라지는 지점을 확인해요."],
];

/* ---------- 섹션 머리 (아이브로우 + 헤딩 + 리드) ---------- */
function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <div className="landing-head">
      <SectionLabel style={{ color: "var(--blue-800)", marginBottom: 12 }}>{eyebrow}</SectionLabel>
      <Display size={32} tracking={-0.025} as="h2" style={{ wordBreak: "keep-all" }}>
        {title}
      </Display>
      {lead && <p className="landing-lead">{lead}</p>}
    </div>
  );
}

/* ---------- 히어로 우측: 면접 대화 미리보기 ----------
   /sample 타임라인의 주제 질문(Q2) → 답변 → 꼬리질문(Q3)을 그대로 보여준다.
   첫 질문(자기소개) 뒤에는 꼬리질문이 붙지 않으므로(PRD: 첫 답변은 주제 전환 강제) Q2 부터 쓴다. */
function InterviewPreview() {
  const main = sampleTimeline[1];
  const tail = sampleTimeline[2];
  return (
    <div className="landing-preview">
      <div className="landing-preview__bar">
        <span className="landing-pulse" aria-hidden="true" />
        면접 진행 중<span className="landing-preview__meta">{sampleReportDetail.type}</span>
      </div>
      <div className="landing-thread">
        <div className="landing-turn landing-turn--q">
          <span className="landing-turn__who">
            <Badge variant="solid">Q{main.questionNumber}</Badge> 면접관
          </span>
          <p className="landing-turn__text">{main.question}</p>
        </div>
        <div className="landing-turn landing-turn--me">
          <span className="landing-turn__who">지원자</span>
          <p className="landing-turn__text">{main.answer}</p>
        </div>
        <div className="landing-turn landing-turn--tail">
          <span className="landing-turn__who">
            <Icon name="corner-down-right" size={14} /> 꼬리 Q{main.questionNumber}
          </span>
          <p className="landing-turn__text">{tail.question}</p>
        </div>
      </div>
      <div className="landing-preview__foot">
        <Icon name="mic" size={14} /> 답변을 듣고 있어요
      </div>
    </div>
  );
}

/* ---------- 꼬리질문 구조 다이어그램 ----------
   리포트 타임라인과 같은 시각 언어(레일 · 노드 · 분기 커넥터)로 질문 줄기가 자라는 방식을 보여준다. */
function FollowUpTree() {
  return (
    <div
      className="landing-tree"
      role="img"
      aria-label="주제 질문에서 꼬리질문이 이어지고 주제가 전환되는 흐름"
    >
      <span className="landing-tree__rail" />
      <div className="landing-tree__node landing-tree__node--root">
        <div className="landing-tree__label">
          <Badge variant="solid">주제 질문</Badge>
        </div>
        <div className="landing-tree__text">
          이력서 요약을 참고해 검수된 목록에서 고른 질문으로 시작해요.
        </div>
      </div>
      <div className="landing-tree__node landing-tree__node--answer">
        <div className="landing-tree__text landing-tree__text--answer">지원자 답변</div>
      </div>
      <div className="landing-tree__node landing-tree__node--tail">
        <div className="landing-tree__label">
          <span className="landing-tree__tail">
            <Icon name="corner-down-right" size={14} /> 꼬리 Q
          </span>
          <Tag style={{ height: 24, fontSize: 12 }}>심화</Tag>
        </div>
        <div className="landing-tree__text">답변에서 판단의 이유와 원리를 더 묻어요.</div>
      </div>
      <div className="landing-tree__node landing-tree__node--tail landing-tree__node--deep">
        <div className="landing-tree__label">
          <span className="landing-tree__tail">
            <Icon name="corner-down-right" size={14} /> 꼬리 Q
          </span>
          <Tag style={{ height: 24, fontSize: 12 }}>구체화</Tag>
        </div>
        <div className="landing-tree__text">모호한 부분에 실제 사례와 수치를 요구해요.</div>
      </div>
      <div className="landing-tree__node landing-tree__node--next">
        <div className="landing-tree__label">
          <span className="landing-tree__next">
            <Icon name="repeat-2" size={14} /> 주제 전환
          </span>
        </div>
        <div className="landing-tree__text landing-tree__text--next">
          더 파낼 것이 없거나 줄기당 상한에 닿으면 다음 주제로 넘어가요.
        </div>
      </div>
    </div>
  );
}

/* ---------- 예시 리포트 카드 (리포트 상세의 축소판, 값은 /sample 픽스처) ---------- */
function ReportPreview({ onOpen }: { onOpen: () => void }) {
  const r = sampleReportDetail;
  const [taskTitle, taskDesc] = r.tasks[0];
  return (
    <Card style={{ padding: 24, boxShadow: "var(--shadow-4)" }}>
      <div className="landing-report__head">
        <Badge variant="brand">
          <Icon name="eye" size={13} /> 예시 리포트
        </Badge>
        <div style={{ display: "flex", gap: 6 }}>
          <Tag style={{ height: 26, fontSize: 12.5 }}>{r.date}</Tag>
          <Tag style={{ height: 26, fontSize: 12.5 }}>{r.type}</Tag>
        </div>
      </div>

      <div className="landing-report__score">
        {r.score !== null && <ScoreNum score={r.score} size={60} />}
        <span className="landing-report__denom">/ 100</span>
        <span className="landing-report__count">질문 {r.questionCount}개</span>
      </div>

      <p className="landing-report__summary">{r.summary}</p>

      <div className="landing-report__axes">
        {r.axes.map(([n, v]) => (
          <AxisBar key={n} label={n} value={v} />
        ))}
      </div>

      <div className="landing-report__row">
        <SectionLabel style={{ marginRight: 4 }}>약점</SectionLabel>
        {r.weaknesses.map(([t]) => (
          <WeakTag key={t}>{t}</WeakTag>
        ))}
      </div>

      <div className="landing-report__task">
        <span className="landing-check">
          <Icon name="check-circle-2" size={14} />
        </span>
        <div>
          <div className="landing-report__task-title">{taskTitle}</div>
          <div className="landing-report__task-desc">{taskDesc}</div>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Button variant="assistive" fullWidth onClick={onOpen}>
          예시 리포트 전체 보기
        </Button>
      </div>
    </Card>
  );
}

export function LandingPage() {
  const nav = useNav();
  return (
    <div className="landing">
      <PublicHeader />

      {/* 히어로 — 그래디언트 배너, 좌 카피 / 우 면접 대화 미리보기 */}
      <section className="landing-wrap landing-hero-wrap">
        <div className="landing-hero">
          <div className="landing-hero__grid">
            <div>
              <div className="landing-pill">
                <span className="landing-pill__dot" aria-hidden="true" /> AI 음성 모의면접
              </div>
              <h1 className="landing-hero__title">
                이력서로 시작하는
                <br />
                진짜 같은 모의 면접
              </h1>
              <p className="landing-hero__lead">
                이력서 PDF를 분석해 질문을 만들고, AI 면접관과 실시간 음성으로 면접을 진행해요.
                답변을 듣고 꼬리질문으로 파고들고, 끝나면 답변별 피드백이 담긴 리포트를 드려요.
              </p>
              <div className="landing-hero__actions">
                <Button
                  variant="solid"
                  size="lg"
                  style={{ background: "#fff", color: "var(--blue-800)" }}
                  onClick={() => nav("auth")}
                >
                  무료로 시작하기
                </Button>
                <span className="landing-ghost">
                  <Button variant="outlined" size="lg" onClick={() => nav("sample")}>
                    예시 리포트 보기
                  </Button>
                </span>
              </div>
              <ul className="landing-hero__facts" aria-label="서비스 구성">
                {HERO_FACTS.map((f) => (
                  <li key={f} className="landing-fact">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <InterviewPreview />
          </div>
        </div>
      </section>

      {/* 진행 4단계 */}
      <section className="landing-section">
        <div className="landing-wrap">
          <SectionHead
            eyebrow="진행 순서"
            title="이력서 업로드부터 리포트까지, 네 단계로 진행돼요"
          />
          <ol className="landing-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="landing-step">
                <div className="landing-step__top">
                  <span className="landing-step__icon">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="landing-step__num">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="landing-step__title">{s.title}</h3>
                <p className="landing-step__desc">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 꼬리질문 — subtle 띠 */}
      <section className="landing-section landing-band">
        <div className="landing-wrap landing-split">
          <div>
            <SectionHead
              eyebrow="꼬리질문"
              title={
                <>
                  답변을 듣고, 그 자리에서
                  <br />
                  다음 질문을 만들어요
                </>
              }
              lead="첫 질문은 검수된 질문 목록에서 이력서 요약을 참고해 골라요. 그 뒤로는 답변마다 구체성·깊이·완결성을 가볍게 평가해, 더 파고들 가치가 있으면 꼬리질문을, 충분하면 다음 주제로 넘어가요."
            />
            <ul className="landing-list">
              {FOLLOW_UP_TYPES.map(([name, desc]) => (
                <li key={name} className="landing-list__item">
                  <span className="landing-type">{name}</span>
                  <span className="landing-list__desc">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="landing-note">
              <Icon name="info" size={15} style={{ marginTop: 1, color: "var(--fg-tertiary)" }} />한
              주제에 매몰되지 않도록 줄기당 꼬리질문 수에 상한을 두고, 상한에 닿으면 주제를
              전환해요.
            </p>
          </div>
          <div className="landing-split__visual">
            <FollowUpTree />
          </div>
        </div>
      </section>

      {/* 리포트 — 좌 예시 카드 / 우 구성 항목 */}
      <section className="landing-section">
        <div className="landing-wrap landing-split landing-split--reverse">
          <div>
            <SectionHead
              eyebrow="리포트"
              title="면접이 끝나면, 이런 리포트를 받아요"
              lead="답변별 판정은 AI가 맡고, 영역 점수와 총점 집계는 정해진 규칙으로 계산해요."
            />
            <ul className="landing-list">
              {REPORT_ITEMS.map(([name, desc]) => (
                <li key={name} className="landing-list__item">
                  <span className="landing-check">
                    <Icon name="check-circle-2" size={14} />
                  </span>
                  <span>
                    <span className="landing-list__title">{name}</span>
                    <span className="landing-list__desc landing-list__desc--block">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-split__visual">
            <ReportPreview onOpen={() => nav("sample")} />
          </div>
        </div>
      </section>

      {/* CTA — 밝은 브랜드 서브틀 (어두운 블록은 푸터 한 번만) */}
      <section className="landing-section landing-section--cta">
        <div className="landing-wrap">
          <div className="landing-cta">
            <h2 className="landing-cta__title">지금 이력서를 올리고 면접을 시작하세요</h2>
            <p className="landing-cta__lead">
              카카오 계정으로 로그인하고 이력서 PDF를 올리면 바로 시작할 수 있어요.
            </p>
            <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
              <Button variant="solid" size="lg" onClick={() => nav("auth")}>
                무료로 시작하기
              </Button>
            </div>
          </div>
          <p className="landing-footnote">
            <Icon name="info" size={14} style={{ marginTop: 2 }} />
            리포트는 AI가 자동 생성한 분석 결과로, 실제 면접 평가와 다를 수 있어요. 참고용으로
            활용해 주세요.
          </p>
        </div>
      </section>

      <HbbFooter />
    </div>
  );
}
