/* ============================ 면접 설정 (/setup) ============================ */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useResumes } from "../api/hooks";
import { Button, Card } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { saveDevicePreferences } from "../hooks/devicePreferences";
import {
  useDeviceSetup,
  type DeviceCheckError,
  type DeviceNotice,
  type DeviceSetupState,
} from "../hooks/useDeviceSetup";
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

/* ---------- ④ 카메라·마이크 점검 (PRD: docs/requirements/session/device-setup.md) ---------- */

const DEVICE_ERROR_GUIDE: Record<DeviceCheckError, string> = {
  "permission-denied":
    "카메라·마이크 권한이 차단되어 있어요. 주소창 옆 권한 설정에서 허용한 뒤 다시 시도해 주세요.",
  "mic-not-found": "사용할 수 있는 마이크를 찾지 못했어요. 마이크를 연결한 뒤 다시 시도해 주세요.",
  "device-in-use":
    "다른 앱에서 장치를 사용 중이거나 장치에 접근할 수 없어요. 확인 후 다시 시도해 주세요.",
  "unsupported":
    "이 환경에서는 장치에 접근할 수 없어요. 주소가 https인지, 지원 브라우저인지 확인해 주세요.",
  "mic-lost": "마이크 연결이 끊겼어요. 마이크를 확인하고 다시 점검해 주세요.",
  "unknown": "장비를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const DEVICE_NOTICE_TEXT: Record<DeviceNotice, string> = {
  "mic-switch-failed": "마이크를 전환하지 못했어요. 사용 가능한 마이크로 계속 진행해요.",
  "camera-switch-failed": "카메라를 전환하지 못했어요. 카메라 없이도 음성으로 진행할 수 있어요.",
  "mic-auto-switched": "마이크 연결이 끊겨 기본 마이크로 자동 전환했어요.",
};

type CheckTone = "pending" | "ok" | "fail";

/** 정상 확인 3종 — 카메라 / 마이크 / 마이크 권한(필수 권한만 의미) */
function checkChips(setup: DeviceSetupState): { label: string; tone: CheckTone }[] {
  const { phase, error, videoTrack } = setup;
  const ready = phase === "ready";
  return [
    ready
      ? videoTrack
        ? { label: "카메라 정상", tone: "ok" }
        : { label: "카메라 사용 불가", tone: "fail" }
      : { label: "카메라 확인 전", tone: "pending" },
    ready
      ? { label: "마이크 정상", tone: "ok" }
      : error === "mic-not-found" || error === "mic-lost"
        ? { label: "마이크 없음", tone: "fail" }
        : { label: "마이크 확인 전", tone: "pending" },
    ready
      ? { label: "마이크 권한 허용됨", tone: "ok" }
      : error === "permission-denied"
        ? { label: "마이크 권한 차단됨", tone: "fail" }
        : { label: "권한 확인 전", tone: "pending" },
  ];
}

function CheckChip({ label, tone }: { label: string; tone: CheckTone }) {
  const bg =
    tone === "ok" ? "var(--green-600)" : tone === "fail" ? "var(--red-600)" : "var(--neutral-300)";
  return (
    <span
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
          background: bg,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={tone === "fail" ? "x" : "check"} size={10} strokeWidth={3} />
      </span>
      {label}
    </span>
  );
}

const LEVEL_BAR_HEIGHTS = [8, 14, 18, 22, 12, 16, 9];

function MicLevelMeter({ volume }: { volume: number }) {
  const level = Math.min(1, volume * 2.5);
  const lit = Math.round(level * LEVEL_BAR_HEIGHTS.length);
  return (
    <div
      role="meter"
      aria-label="마이크 입력 레벨"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22 }}
    >
      {LEVEL_BAR_HEIGHTS.map((h, i) => (
        <i
          key={i}
          style={{
            width: 5,
            height: h,
            borderRadius: 2,
            background: i < lit ? "var(--blue-800)" : "var(--neutral-200)",
          }}
        />
      ))}
    </div>
  );
}

function DeviceSelect({
  label,
  placeholder,
  devices,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  disabled: boolean;
  onChange: (deviceId: string) => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled || devices.length === 0}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 40,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-btn-md)",
          background: "var(--bg-surface)",
          padding: "0 36px 0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--fg-strong)",
          appearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {(devices.length === 0 || value === null) && <option value="">{placeholder}</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${placeholder} ${i + 1}`}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={18}
        style={{
          position: "absolute",
          right: 12,
          top: 11,
          color: "var(--fg-tertiary)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function SelfView({ setup }: { setup: DeviceSetupState }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { videoTrack, phase } = setup;

  // 트랙 부착은 effect 로만 관리 — 트랙이 바뀌거나 사라지면 detach 로 정리한다
  useEffect(() => {
    const el = videoRef.current;
    if (!videoTrack || !el) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  return (
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
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1,
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
      {videoTrack ? (
        // 자기 모습 미리보기 — 에코 방지를 위해 항상 음소거, 거울 반전
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          aria-label="내 카메라 미리보기"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
      ) : phase === "ready" ? (
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <Icon name="mic" size={28} strokeWidth={1.75} />
          카메라 없이 음성으로 진행해요
        </span>
      ) : phase === "starting" ? (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}>
          장비 연결 중…
        </span>
      ) : (
        <Icon name="user-round" size={36} strokeWidth={1.75} />
      )}
    </div>
  );
}

function DeviceCheck({ setup }: { setup: DeviceSetupState }) {
  const { phase, error, notice } = setup;
  return (
    <Fragment>
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        <SelfView setup={setup} />
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
            <MicLevelMeter volume={setup.micVolume} />
          </div>
          <DeviceSelect
            label="카메라 선택"
            placeholder="기본 카메라"
            devices={setup.cameras}
            value={setup.cameraId}
            disabled={phase !== "ready" || setup.cameraBusy || setup.videoTrack === null}
            onChange={(deviceId) => void setup.selectCamera(deviceId)}
          />
          <DeviceSelect
            label="마이크 선택"
            placeholder="기본 마이크"
            devices={setup.mics}
            value={setup.micId}
            disabled={phase !== "ready" || setup.micBusy}
            onChange={(deviceId) => void setup.selectMic(deviceId)}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
        {checkChips(setup).map(({ label, tone }) => (
          <CheckChip key={label} label={label} tone={tone} />
        ))}
      </div>
      {notice && (
        <p
          role="status"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--fg-secondary)",
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {DEVICE_NOTICE_TEXT[notice]}
        </p>
      )}
      {phase === "error" && error !== null && (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-12)",
            padding: "12px 14px",
            marginTop: 14,
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.5,
            color: "var(--fg-default)",
          }}
        >
          {DEVICE_ERROR_GUIDE[error]}
          <Button variant="assistive" size="sm" onClick={() => void setup.start()}>
            다시 시도
          </Button>
        </div>
      )}
      {(phase === "idle" || phase === "starting") && (
        <div style={{ marginTop: 14 }}>
          <Button
            variant="assistive"
            fullWidth
            disabled={phase === "starting"}
            leadingIcon={<Icon name="mic" size={16} />}
            onClick={() => void setup.start()}
          >
            {phase === "starting" ? "장비 연결 중…" : "장비 점검 시작"}
          </Button>
        </div>
      )}
    </Fragment>
  );
}

export function SetupPage() {
  const nav = useNav();
  const setup = useDeviceSetup();
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
            <DeviceCheck setup={setup} />
          </StepCard>
        </div>

        <div style={{ marginTop: 20 }}>
          <Button
            variant="solid"
            size="lg"
            fullWidth
            disabled={!setup.canStart}
            onClick={() => {
              // 점검에서 고른 마이크를 /live 로 전달 — Room 캡처 기본값에 적용된다
              saveDevicePreferences({ micId: setup.micId ?? undefined });
              nav("interview");
            }}
          >
            면접 시작
          </Button>
          {!setup.canStart && (
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
                textAlign: "center",
                marginTop: 10,
                marginBottom: 0,
              }}
            >
              장비 점검을 완료하면 면접을 시작할 수 있어요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
