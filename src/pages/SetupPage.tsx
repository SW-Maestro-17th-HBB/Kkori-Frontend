/* ============================ 면접 설정 (/setup) ============================ */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Room } from "livekit-client";
import { useSearchParams } from "react-router";
import type { CreateSessionResponse } from "../api/client";
import { ERROR_CODES } from "../api/errorCodes";
import { useCreateInterviewSession, useResumes } from "../api/hooks";
import { ApiError } from "../api/request";
import { getAuthSessionId } from "../api/tokenStore";
import type { CreateSessionRequest, Position } from "../api/types";
import { Button, Card, Modal } from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, DocThumb } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { saveDevicePreferences } from "../hooks/devicePreferences";
import { saveInterviewSession } from "../hooks/interviewSession";
import {
  useDeviceSetup,
  type DeviceCheckError,
  type DeviceNotice,
  type DeviceSetupState,
} from "../hooks/useDeviceSetup";
import { stashConnectedRoom } from "../hooks/useLiveKitRoom";
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

/* ---------- ② 면접 유형 (직무 선택) ---------- */

const POSITION_LABEL: Record<Position, string> = {
  BACKEND: "백엔드",
  FRONTEND: "프론트엔드",
};
const POSITIONS = Object.keys(POSITION_LABEL) as Position[];

/** ① 드롭다운 메뉴 안의 상태 안내(빈 목록·로딩·조회 실패) */
function MenuNotice({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        fontFamily: "var(--font-sans)",
        fontSize: 13.5,
        fontWeight: 500,
        lineHeight: 1.5,
        color: "var(--fg-tertiary)",
      }}
    >
      {children}
    </div>
  );
}

function PositionPicker({
  value,
  onSelect,
}: {
  value: Position;
  onSelect: (position: Position) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        className="linkbtn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="직무 선택"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          height: 48,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-12)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--fg-strong)",
        }}
      >
        {POSITION_LABEL[value]}
        <Icon name="chevron-down" size={18} style={{ color: "var(--fg-tertiary)" }} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="직무 목록"
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
          {POSITIONS.map((position) => (
            <button
              key={position}
              role="option"
              aria-selected={position === value}
              className="linkbtn menu-item"
              onClick={() => {
                onSelect(position);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: "var(--radius-8)",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--fg-default)",
              }}
            >
              {POSITION_LABEL[position]}
              {position === value && (
                <Icon name="check" size={14} style={{ color: "var(--blue-800)" }} />
              )}
            </button>
          ))}
        </div>
      )}
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

/** 정상 확인 3종 — 카메라 / 마이크 / 마이크 권한(필수 권한만 의미).
    카메라는 실제 프레임 도착, 마이크는 실입력 감지 후에만 "정상" (PRD 기능 2) */
function checkChips(
  setup: DeviceSetupState,
  cameraLive: boolean,
): { label: string; tone: CheckTone }[] {
  const { phase, error, videoTrack, micInputDetected } = setup;
  const ready = phase === "ready";
  return [
    ready
      ? videoTrack
        ? cameraLive
          ? { label: "카메라 정상", tone: "ok" }
          : { label: "카메라 확인 중", tone: "pending" }
        : { label: "카메라 사용 불가", tone: "fail" }
      : { label: "카메라 확인 전", tone: "pending" },
    ready
      ? micInputDetected
        ? { label: "마이크 정상", tone: "ok" }
        : { label: "마이크 입력 대기", tone: "pending" }
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

/** 커스텀 장치 드롭다운 — 네이티브 select 는 열린 채로 목록을 못 갈아끼워서,
    "클릭 → 점검 시작 → 같은 메뉴 안에서 연결 중 → 장치 목록" 흐름이 안 된다.
    점검 전에도 활성 상태로 두고 클릭을 점검 트리거로 쓴다 (PRD 기능 1·3) */
function DevicePicker({
  label,
  placeholder,
  devices,
  value,
  disabled,
  phase,
  onTrigger,
  onSelect,
}: {
  label: string;
  placeholder: string;
  devices: MediaDeviceInfo[];
  value: string | null;
  disabled: boolean;
  phase: DeviceSetupState["phase"];
  /** idle·error 상태에서 클릭 시 점검 시작(재시도) */
  onTrigger: () => void;
  onSelect: (deviceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.deviceId === value);
  const menuVisible = open && (phase === "starting" || phase === "ready");

  const handleClick = () => {
    if (phase === "idle" || phase === "error") {
      onTrigger(); // 점검 시작 — 메뉴를 열어 연결 진행을 보여준다
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="linkbtn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={menuVisible}
        disabled={disabled}
        onClick={handleClick}
        style={{
          width: "100%",
          height: 40,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-btn-md)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 12px 0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--fg-strong)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected ? selected.label || placeholder : placeholder}
        </span>
        <Icon name="chevron-down" size={18} style={{ color: "var(--fg-tertiary)" }} />
      </button>
      {menuVisible && (
        <div
          role="listbox"
          aria-label={label}
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
          {phase === "starting" ? (
            <div
              style={{
                padding: "10px 12px",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
              }}
            >
              장비 연결 중…
            </div>
          ) : devices.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
              }}
            >
              장치 목록을 불러올 수 없어요
            </div>
          ) : (
            devices.map((d, i) => (
              <button
                key={d.deviceId}
                type="button"
                role="option"
                aria-selected={d.deviceId === value}
                className="linkbtn menu-item"
                onClick={() => {
                  setOpen(false);
                  if (d.deviceId !== value) onSelect(d.deviceId);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  borderRadius: "var(--radius-8)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--fg-default)",
                  textAlign: "left",
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.label || `${placeholder} ${i + 1}`}
                </span>
                {d.deviceId === value && (
                  <Icon
                    name="check"
                    size={14}
                    strokeWidth={3}
                    style={{ color: "var(--blue-800)" }}
                  />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SelfView({
  setup,
  onLive,
}: {
  setup: DeviceSetupState;
  /** 실제 프레임이 도착하면 그 시점의 **내부 MediaStreamTrack** 을 보고한다 —
      장치 전환은 LocalTrack 객체를 유지한 채 내부 트랙만 바꾸므로, 트랙 객체가
      아니라 내부 트랙 동일성으로 "카메라 정상"을 판정해야 전환 시 리셋된다 */
  onLive: (media: MediaStreamTrack) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { videoTrack, phase } = setup;

  // 트랙 부착은 effect 로만 관리 — 트랙이 바뀌거나 사라지면 detach 로 정리한다
  useEffect(() => {
    const el = videoRef.current;
    if (!videoTrack || !el) return;
    videoTrack.attach(el);
    const handleLive = () => onLive(videoTrack.mediaStreamTrack);
    el.addEventListener("playing", handleLive);
    el.addEventListener("loadeddata", handleLive);
    if (el.readyState >= 2) handleLive(); // 부착 시점에 이미 프레임이 있는 경우
    return () => {
      el.removeEventListener("playing", handleLive);
      el.removeEventListener("loadeddata", handleLive);
      videoTrack.detach(el);
    };
  }, [videoTrack, onLive]);

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
  // 프레임 도착을 보고한 내부 트랙 — 현재 내부 트랙과 일치할 때만 "카메라 정상"
  // (장치 전환·재획득으로 내부 트랙이 바뀌면 자동으로 "확인 중"으로 리셋)
  const [liveMedia, setLiveMedia] = useState<MediaStreamTrack | null>(null);
  const cameraLive = liveMedia !== null && liveMedia === setup.videoTrack?.mediaStreamTrack;
  const waitingForVoice = phase === "ready" && !setup.micBusy && !setup.micInputDetected;

  return (
    <Fragment>
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        <SelfView setup={setup} onLive={setLiveMedia} />
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
            {waitingForVoice && (
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--fg-tertiary)",
                  margin: "8px 0 0",
                }}
              >
                마이크에 대고 말해보세요
              </p>
            )}
          </div>
          <DevicePicker
            label="카메라 선택"
            placeholder="기본 카메라"
            devices={setup.cameras}
            value={setup.cameraId}
            // 카메라 사용 불가여도 활성 유지 — 새 장치 선택 시 트랙을 재획득한다 (PRD 기능 3)
            disabled={setup.cameraBusy}
            phase={phase}
            onTrigger={() => void setup.start()}
            onSelect={(deviceId) => void setup.selectCamera(deviceId)}
          />
          <DevicePicker
            label="마이크 선택"
            placeholder="기본 마이크"
            devices={setup.mics}
            value={setup.micId}
            disabled={setup.micBusy}
            phase={phase}
            onTrigger={() => void setup.start()}
            onSelect={(deviceId) => void setup.selectMic(deviceId)}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
        {checkChips(setup, cameraLive).map(({ label, tone }) => (
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

/* ---------- 시작 실패 안내 ---------- */

const GENERIC_START_FAILURE = "면접 준비에 실패했어요 — 다시 시도해 주세요.";

interface StartFailureNotice {
  message: string;
  /** 전용 문구가 없는 실패의 원인 표시 — 메시지 뒤 괄호로 붙는다 */
  detail: string | null;
}

/** 세션 생성 실패를 사용자 안내로 변환 — 사용자가 스스로 조치할 수 있는 코드
    (S003 진행 중 세션, R010/R011 이력서 분석 상태)만 전용 문구로 분기하고,
    나머지는 공통 재시도 안내에 서버 메시지를 덧붙인다. */
const toStartFailureNotice = (err: unknown): StartFailureNotice => {
  if (err instanceof ApiError) {
    if (err.code === ERROR_CODES.SESSION_ALREADY_IN_PROGRESS) {
      return {
        message: "이미 진행 중인 면접이 있어요. 기존 면접을 종료한 뒤 다시 시작해 주세요.",
        detail: null,
      };
    }
    if (err.code === ERROR_CODES.RESUME_ANALYSIS_IN_PROGRESS) {
      return {
        message: "선택한 이력서의 분석이 아직 끝나지 않았어요. 분석 완료 후 다시 시작해 주세요.",
        detail: null,
      };
    }
    if (err.code === ERROR_CODES.RESUME_ANALYSIS_FAILED) {
      return {
        message: "선택한 이력서의 분석에 실패했어요. 재분석을 마친 뒤 다시 시작해 주세요.",
        detail: null,
      };
    }
  }
  return { message: GENERIC_START_FAILURE, detail: err instanceof Error ? err.message : null };
};

export function SetupPage() {
  const nav = useNav();
  const setup = useDeviceSetup();
  const [dur, setDur] = useState<"quick" | "real">("quick");
  const [searchParams] = useSearchParams();
  // 쿼리 프리셀렉트(?resume=<id>)는 진입 시 1회만 캡처 — 이후 URL과 동기화하지 않는다
  const [queryResumeId] = useState<number | null>(() => {
    const raw = searchParams.get("resume");
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  });
  // undefined = 미조작(쿼리 프리셀렉트 적용) / number = 명시 선택 — 선택 해제는 없다
  // (이력서 없는 시작은 완료 이력서가 없는 유저에게만 허용되는 정책)
  const [resumeOverride, setResumeOverride] = useState<number | undefined>(undefined);
  // 직무는 이 화면에서 직접 선택한다 — 이력서 분석 추천 연동 없음(기본값 백엔드)
  const [position, setPosition] = useState<Position>("BACKEND");
  const [pickOpen, setPickOpen] = useState(false);
  const [startFailure, setStartFailure] = useState<StartFailureNotice | null>(null);
  // 시작 흐름(발급→접속) 진행 중 — 모달이 전 과정을 덮어 ①~④ 입력 변경을 차단한다
  // (클릭 시점 선택값으로 세션이 만들어지므로, 대기 중 변경은 화면·실제 불일치가 된다)
  const [preparing, setPreparing] = useState(false);
  // 시작 시도 세대 — 취소·화면 이탈이 값을 올려 진행 중이던 흐름을 무효화한다
  // (늦게 도착한 응답이 저장·이동을 실행하는 것을 막는다)
  const startAttemptRef = useRef(0);
  const connectingRoomRef = useRef<Room | null>(null);
  const resumesQuery = useResumes();
  const resumeOpts = (resumesQuery.data ?? []).filter((r) => r.status === "done");
  const createSession = useCreateInterviewSession();

  // 프리셀렉트는 무효 판정을 저장하지 않는 순수 파생 — 목록 도착 전에는 "미선택"일
  // 뿐이고(조기 무효 판정 없음), 사용자가 먼저 조작했으면 쿼리는 평가되지 않는다
  const selectedResumeId = resumeOverride !== undefined ? resumeOverride : queryResumeId;
  const selectedResume =
    selectedResumeId !== null ? (resumeOpts.find((r) => r.id === selectedResumeId) ?? null) : null;
  // 이력서 없이는 실전 모의 선택 불가 — 상태 대신 렌더 시점에 파생
  const effectiveDur = !selectedResume && dur === "real" ? "quick" : dur;
  // 이력서 없는 시작은 "완료 이력서가 없다"고 확인된 유저에게만 허용 —
  // 목록 조회 미완·실패 상태에서는 허용하지 않는다 (미선택 우회 차단)
  const resumeRequirementMet =
    selectedResume !== null || (resumesQuery.isSuccess && resumeOpts.length === 0);

  // 화면 이탈 시 진행 중 시작 흐름을 무효화하고 연결을 정리한다 — 늦게 도착한
  // 응답이 언마운트된 화면의 저장·이동을 실행하지 못하게 한다 (언마운트 안전망)
  useEffect(
    () => () => {
      startAttemptRef.current += 1;
      const room = connectingRoomRef.current;
      connectingRoomRef.current = null;
      void room?.disconnect();
    },
    [],
  );

  const cancelStart = () => {
    startAttemptRef.current += 1; // 진행 중인 handleStart 가 취소를 감지하는 신호
    const room = connectingRoomRef.current;
    connectingRoomRef.current = null;
    setPreparing(false);
    void room?.disconnect(); // 접속 단계였다면 진행 중인 connect 를 중단시킨다
  };

  const handleStart = async () => {
    if (preparing) return;
    setStartFailure(null);
    // 요청 시작 직전 인증 세션 캡처 — 응답 후 재대조해 대기 중 계정 교체를 방어한다
    const capturedAuthSessionId = getAuthSessionId();
    if (capturedAuthSessionId === null) {
      setStartFailure({ message: GENERIC_START_FAILURE, detail: null });
      return;
    }
    const attempt = ++startAttemptRef.current;
    const stale = () => startAttemptRef.current !== attempt; // 취소·이탈로 무효화됨
    const fail = (
      notice: StartFailureNotice = { message: GENERIC_START_FAILURE, detail: null },
    ) => {
      setPreparing(false);
      setStartFailure(notice);
    };
    setPreparing(true);
    const body: CreateSessionRequest = {
      ...(selectedResume ? { resumeId: selectedResume.id } : {}),
      interviewType: effectiveDur === "real" ? "THIRTY_MIN" : "FIVE_MIN",
      position,
    };
    let data: CreateSessionResponse;
    try {
      data = await createSession.mutateAsync(body);
    } catch (err) {
      if (stale()) return;
      fail(toStartFailureNotice(err));
      return;
    }
    // 취소·이탈 후 도착한 응답 — 발급된 토큰은 버린다(서버의 PENDING 자동 교체가 회수)
    if (stale()) return;
    // 스키마상 응답 필드가 모두 optional — 저장 전에 실제 값 존재를 확인한다
    const { livekitToken, livekitUrl, livekitRoom, id } = data ?? {};
    const filled = (value: unknown): value is string =>
      typeof value === "string" && value.length > 0;
    if (
      !filled(livekitUrl) ||
      !filled(livekitToken) ||
      !filled(livekitRoom) ||
      typeof id !== "number"
    ) {
      fail();
      return;
    }
    // LiveKit 접속을 이 화면에서 확립한다 — 실패를 /live 진입 후가 아니라
    // 장비 점검 상태가 살아있는 setup 문맥에서 처리하기 위함(재클릭 = 재발급·재접속).
    // 성공한 룸은 보관해 /live 가 재접속 없이 인수한다.
    const room = new Room(
      setup.micId ? { audioCaptureDefaults: { deviceId: { exact: setup.micId } } } : undefined,
    );
    connectingRoomRef.current = room;
    try {
      await room.connect(livekitUrl, livekitToken);
    } catch {
      // SDK 에러 메시지는 영어 기술 문구라 노출하지 않는다 — 고정 안내만
      void room.disconnect();
      if (stale()) return; // 취소·이탈로 인한 중단 — 안내 없음
      connectingRoomRef.current = null;
      fail();
      return;
    }
    if (stale()) {
      void room.disconnect(); // 성공 직전 취소·이탈 — 연결을 남기지 않는다
      return;
    }
    connectingRoomRef.current = null;
    // 대기 중 계정 교체 방어 — 저장 직전(최종 지점)에 재대조한다
    if (getAuthSessionId() !== capturedAuthSessionId) {
      void room.disconnect();
      setPreparing(false);
      return; // 이전 계정의 토큰·연결을 폐기하고 아무것도 남기지 않는다
    }
    // 접속까지 성공한 뒤에만 저장한다 — 취소·접속 실패 경로에 저장값이 남지 않아
    // 실패한 세션으로 /live 직행 재접속하는 경로가 생기지 않는다
    const saved = saveInterviewSession({
      url: livekitUrl,
      token: livekitToken,
      room: livekitRoom,
      authSessionId: capturedAuthSessionId,
      id,
    });
    if (!saved) {
      void room.disconnect();
      fail();
      return;
    }
    setPreparing(false);
    stashConnectedRoom(room, {
      url: livekitUrl,
      token: livekitToken,
      authSessionId: capturedAuthSessionId,
    });
    // 점검에서 고른 마이크를 /live 로 전달 — 실패한 시도가 선호를 덮지 않게 성공 후에만
    saveDevicePreferences({ micId: setup.micId ?? undefined });
    nav("interview");
  };

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
                aria-haspopup="listbox"
                aria-expanded={pickOpen}
                aria-label="이력서 선택"
                onClick={() => setPickOpen((o) => !o)}
                style={{
                  width: "100%",
                  height: 48,
                  border: selectedResume
                    ? "1px solid var(--blue-800)"
                    : "1px solid var(--border-default)",
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
                    fontWeight: selectedResume ? 600 : 500,
                    color: selectedResume ? "var(--fg-strong)" : "var(--fg-tertiary)",
                  }}
                >
                  {selectedResume ? (
                    <Fragment>
                      <DocThumb ext={selectedResume.ext} size={22} />
                      {selectedResume.name}
                    </Fragment>
                  ) : (
                    "이력서를 선택하세요"
                  )}
                </span>
                <Icon name="chevron-down" size={18} style={{ color: "var(--fg-tertiary)" }} />
              </button>
              {pickOpen && (
                <div
                  role="listbox"
                  aria-label="이력서 선택"
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
                  {resumesQuery.isError ? (
                    <MenuNotice>
                      이력서 목록을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요.
                    </MenuNotice>
                  ) : resumesQuery.isPending ? (
                    <MenuNotice>이력서 목록을 불러오는 중…</MenuNotice>
                  ) : resumeOpts.length === 0 ? (
                    <MenuNotice>분석 완료된 이력서가 없어요 — 이력서를 업로드해 주세요.</MenuNotice>
                  ) : (
                    resumeOpts.map((r) => (
                      <button
                        key={r.id}
                        role="option"
                        aria-selected={r.id === selectedResumeId}
                        className="linkbtn menu-item"
                        onClick={() => {
                          setResumeOverride(r.id);
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
                        <DocThumb ext={r.ext} size={22} /> {r.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </StepCard>

          <StepCard no={2} title="면접 유형">
            <PositionPicker value={position} onSelect={setPosition} />
          </StepCard>

          <StepCard no={3} title="면접 시간">
            <div style={{ display: "flex", gap: 12 }}>
              {(
                [
                  ["quick", "빠른 연습", "약 5분 · 핵심 질문 위주", false],
                  ["real", "실전 모의", "약 30분 · 꼬리질문 포함", true],
                ] as ["quick" | "real", string, string, boolean][]
              ).map(([id, t, s, needsResume]) => {
                const off = needsResume && !selectedResume;
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
            {!selectedResume && (
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
            disabled={!setup.canStart || !resumeRequirementMet || preparing}
            onClick={() => void handleStart()}
          >
            {preparing ? "면접 준비 중…" : "면접 시작"}
          </Button>
          {startFailure && (
            <p
              role="alert"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--red-600)",
                textAlign: "center",
                marginTop: 10,
                marginBottom: 0,
              }}
            >
              {startFailure.message}
              {startFailure.detail ? ` (${startFailure.detail})` : ""}
            </p>
          )}
          {(!setup.canStart || !resumeRequirementMet) && (
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
              {!setup.canStart
                ? setup.phase === "ready" && setup.micId !== null && !setup.micBusy
                  ? "마이크에 대고 말해 입력을 확인해 주세요."
                  : "장비 점검을 완료하면 면접을 시작할 수 있어요."
                : "이력서를 선택하면 면접을 시작할 수 있어요."}
            </p>
          )}
        </div>
      </div>

      {/* 시작 흐름(발급→접속) 전 과정을 덮는 모달 — 대기 중 선택 변경(화면·실제 불일치)을
          차단하고, 성공해야만 /live 로 이동하므로 접속 실패가 면접 화면에서 뜨지 않는다 */}
      <Modal
        open={preparing}
        onClose={cancelStart}
        title="면접 준비 중"
        actions={[
          <Button key="cancel" variant="assistive" onClick={cancelStart}>
            취소
          </Button>,
        ]}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.6,
            color: "var(--fg-secondary)",
          }}
        >
          면접실에 연결하고 있어요 — 잠시만 기다려 주세요.
        </p>
      </Modal>
    </div>
  );
}
