/* ============================ 면접 진행 (/live) — 다크 풀스크린 ============================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router";
import { ERROR_CODES } from "../api/errorCodes";
import { useEndInterviewSession } from "../api/hooks";
import { ApiError } from "../api/request";
import { Button, Modal } from "../components/ds";
import { Icon } from "../components/Icon";
import {
  clearInterviewSession,
  loadInterviewSession,
  saveInterviewSession,
  updateStoredMicIntent,
} from "../hooks/interviewSession";
import { useReentry } from "../hooks/useReentry";
import { useAuthSessionId } from "../hooks/useAuthStatus";
import { useNav } from "../hooks/useNav";
import {
  ConnectionState,
  DisconnectReason,
  discardConnectedRoom,
  useLiveKitRoom,
  useRemoteAudio,
} from "../hooks/useLiveKitRoom";
import { ROUTES } from "../routes";

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: "연결 끊김",
  [ConnectionState.Connecting]: "연결 중…",
  [ConnectionState.Connected]: "연결됨",
  [ConnectionState.Reconnecting]: "재연결 중…",
  [ConnectionState.SignalReconnecting]: "재연결 중…",
};

const CONNECTION_DOT: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: "var(--red-600)",
  [ConnectionState.Connecting]: "var(--blue-400)",
  [ConnectionState.Connected]: "var(--green-600)",
  [ConnectionState.Reconnecting]: "var(--blue-400)",
  [ConnectionState.SignalReconnecting]: "var(--blue-400)",
};

/** 종료 요청 실패 안내 — S008(종료 신호 발신 실패)은 종료 의도가 이미 기록된 상태라
    실패로 다루지 않고 즉시 수렴한다(endConfirmed). 여기 도달하는 것은 그 외 코드뿐 —
    공통 재시도 안내 + 서버 메시지 병기. */
const endFailureNotice = (err: unknown): string => {
  const detail = err instanceof Error ? ` (${err.message})` : "";
  return `면접 종료 요청에 실패했어요. 다시 시도해 주세요.${detail}`;
};

export function InterviewPage() {
  const nav = useNav();
  const [showQ, setShowQ] = useState(true);
  const [micFailed, setMicFailed] = useState(false);
  // 세션 레코드 — 마운트 시 로드하되, 재입장 토큰 재발급이 교체할 수 있어 상태로 둔다
  const [activeSession, setActiveSession] = useState(loadInterviewSession);
  // 마이크 의도 상태 — 성공한 토글·복원 때만 갱신 (연결 해제로 꺼진 SDK 상태는 미기록)
  const [micIntent, setMicIntent] = useState(activeSession?.micIntent === true);
  const authSessionId = useAuthSessionId();
  // 저장값이 없거나(직행·손상) 발급 당시 계정과 다르면 통과 불가 — 이전 계정의
  // 토큰이 다음 사용자에게 넘어가는 것을 막는다 (PRD 인증 세션 검증)
  const gateOk = activeSession !== null && activeSession.authSessionId === authSessionId;
  // 접속용 세션은 url·token 기준 파생으로 고정 — micIntent 등 다른 필드 갱신이
  // useLiveKitRoom 의 세션 effect(재접속)를 건드리지 않게 한다
  const sessionUrl = activeSession?.url;
  const sessionToken = activeSession?.token;
  const liveSession = useMemo(
    () => (sessionUrl && sessionToken ? { url: sessionUrl, token: sessionToken } : undefined),
    [sessionUrl, sessionToken],
  );
  useEffect(() => {
    // 상태가 아니라 storage·핸드오프 정리 — 손상 원문·타 계정 잔존물(저장값과
    // 보관된 연결 모두)을 남기지 않는다 (멱등)
    if (!gateOk) {
      clearInterviewSession();
      discardConnectedRoom();
    }
  }, [gateOk]);
  const {
    room,
    connectionState,
    disconnectReason,
    connectError,
    micEnabled,
    toggleMicrophone,
    enableMicrophone,
    canPlayAudio,
    startAudio,
  } = useLiveKitRoom(gateOk ? liveSession : undefined);
  const remoteAudioRef = useRemoteAudio(room);

  const endSession = useEndInterviewSession();
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  // 요청 수리까지 재클릭을 막는다 — 확정되면 아래 effect 가 즉시 완료 화면으로 보낸다
  const wrappingUp = endSession.isPending || endSession.isSuccess;

  // 종료 확정 — 202(수리)와 S008(종료 의도 기록됨)은 서버의 terminal 수렴(fallback 이
  // 최대 180초 내 룸 종료 보장)이 확정된 상태다. 즉시 종료 전환과 재입장 중단의 공통 근거
  const endConfirmed =
    endSession.isSuccess ||
    (endSession.error instanceof ApiError &&
      endSession.error.code === ERROR_CODES.SESSION_END_SIGNAL_FAILED);

  // 완료 화면 전환 — 버튼 종료는 종료 확정(202·S008) 즉시 전환한다 (클로징 발화를
  // 기다리지 않는 즉시 종료 UX — 2026-08-10 제품 결정, 연결 유무 무관). ROOM_DELETED 는
  // 시간 만료 자연 종료·서버 fallback 삭제 경로의 수렴점으로 유지된다.
  useEffect(() => {
    const roomDeleted = disconnectReason === DisconnectReason.ROOM_DELETED;
    if (!roomDeleted && !endConfirmed) return;
    clearInterviewSession(); // 죽은 룸의 토큰 — /live 재진입이 setup 으로 가게 정리
    nav("interviewEnded", { replace: true, state: { ended: true } });
  }, [disconnectReason, endConfirmed, nav]);

  const requestEnd = () => {
    if (activeSession) endSession.mutate(activeSession.id);
  };

  // 재입장 트리거 — PRD 조건식. connectionState 가 현재값이라 재접속 성공 후 잔존
  // disconnectReason 이 재발화를 만들지 않고, 최초 마운트(사유 null·접속 전)도 제외된다
  const reentryTriggered =
    gateOk &&
    connectionState === ConnectionState.Disconnected &&
    (connectError !== null ||
      (disconnectReason !== null && disconnectReason !== DisconnectReason.ROOM_DELETED));

  const reentry = useReentry({
    room,
    sessionId: activeSession?.id ?? null,
    triggered: reentryTriggered,
    suspended: endSession.isPending,
    halted: endConfirmed || disconnectReason === DisconnectReason.ROOM_DELETED,
    onIssued: (issued) => {
      // 인증 세션 재대조 — 발급 사이 계정이 바뀌었으면 폐기 (게이트가 정리를 맡는다).
      // 저장은 여기서 하지 않는다 — 접속 성공 후 복원 effect 가 갱신한다 (실패 토큰 미저장)
      setActiveSession((prev) =>
        prev && prev.authSessionId === authSessionId
          ? { ...prev, url: issued.url, token: issued.token, room: issued.room }
          : prev,
      );
    },
    onDenied: () => {
      // 이미 종료된 세션 — 창 소진·정상 종료 등 어떤 terminal 사유든 중립 안내로 수렴
      clearInterviewSession();
      nav("interviewEnded", { replace: true, state: { ended: true, reason: "reentry-denied" } });
    },
  });

  // 접속 성공 시 토큰 세대당 1회 — 저장값 갱신(접속 성공 후에만 — 실패 토큰 미저장,
  // 저장 실패는 무시하고 면접 계속) + micIntent 복원(완전 해제가 unpublish 한 발행 재생)
  const restoredTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSession || connectionState !== ConnectionState.Connected) return;
    if (restoredTokenRef.current === activeSession.token) return;
    restoredTokenRef.current = activeSession.token;
    saveInterviewSession({ ...activeSession, micIntent });
    if (micIntent) {
      void enableMicrophone().then(
        () => setMicFailed(false),
        () => setMicFailed(true),
      );
    }
  }, [activeSession, connectionState, micIntent, enableMicrophone]);

  // 재입장발 재접속 중(Connecting)에도 오버레이를 유지한다 — attemptsUsed 는
  // 재접속 성공 시 0 으로 복귀하므로 최초 입장·핸드오프의 Connecting 은 제외된다
  const reentryConnecting =
    connectionState === ConnectionState.Connecting && reentry.attemptsUsed > 0;
  const overlayActive = reentryTriggered || reentry.requesting || reentryConnecting;
  const reentryBusy = reentry.requesting || reentryConnecting || endSession.isPending;

  const statusLabel = connectError ? "접속 실패" : CONNECTION_LABEL[connectionState];
  const statusDot = connectError ? "var(--red-600)" : CONNECTION_DOT[connectionState];

  // 세션 없이는 면접 화면이 성립하지 않는다 — 설정 화면으로 돌려보낸다 (히스토리 미기록)
  if (!gateOk) return <Navigate to={ROUTES.setup} replace />;

  return (
    <div
      style={{
        background: "var(--neutral-970)",
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* 상단 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          zIndex: 6,
        }}
      >
        {/* 좌측 자리 유지용 — 타이머 표시는 제거됨(남은 시간의 원천이 서버에 없어
            어림값 표기가 오정보였다). 자연 만료는 ROOM_DELETED 수렴으로 처리된다 */}
        <span aria-hidden style={{ width: 1 }} />
        {/* 재입장 오버레이가 연결 상태를 대신 전한다 — 뒤에 비치는 상태 필은 중복이라 숨긴다 */}
        {!overlayActive && (
          <span
            role="status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 14px",
              borderRadius: "var(--radius-full)",
              background: "var(--bg-inverse-subtle)",
              border: "1px solid var(--border-inverse-strong)",
              color: "var(--fg-inverse)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot }} />{" "}
            {statusLabel}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* 자동재생 정책으로 원격 오디오가 막힌 경우 — 사용자 제스처로 재개 */}
          {connectionState === ConnectionState.Connected && !canPlayAudio && (
            <button
              className="dark-btn"
              onClick={() =>
                // 실패해도 canPlayAudio 가 false 로 남아 버튼이 유지된다 — 재클릭이 곧 재시도
                void startAudio().catch(() => {})
              }
            >
              <Icon name="audio-lines" size={16} /> 소리 켜기
            </button>
          )}
          <button
            className="dark-btn"
            disabled={wrappingUp}
            onClick={() => setConfirmEndOpen(true)}
          >
            {wrappingUp ? "종료 중…" : "면접 종료"}
          </button>
        </div>
      </div>

      {/* 원격 오디오 부착 지점 — 화면에는 보이지 않고 <audio> 요소만 담는다 */}
      <div ref={remoteAudioRef} style={{ display: "none" }} data-testid="remote-audio" />

      {/* self-view PiP */}
      <div
        style={{
          position: "absolute",
          top: 76,
          left: 22,
          width: 168,
          height: 108,
          borderRadius: "var(--radius-12)",
          border: "1px solid rgba(255,255,255,.18)",
          background: "var(--neutral-925)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,.5)",
          zIndex: 6,
        }}
      >
        <Icon name="user-round" size={30} strokeWidth={1.75} />
        <span
          style={{
            position: "absolute",
            bottom: 7,
            left: 8,
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: "#c9cdd2",
            background: "rgba(0,0,0,.4)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          self-view · 나
        </span>
      </div>

      {/* 중앙 무대 (듣는 중 펄스) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <div className="listen-ring" />
          <div
            style={{
              width: 480,
              height: 300,
              borderRadius: "var(--radius-16)",
              background: "var(--neutral-950)",
              border: "1px solid rgba(255,255,255,.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--blue-400)",
            }}
          >
            <Icon name="audio-lines" size={64} strokeWidth={1.75} />
          </div>
        </div>
        <div
          style={{
            marginTop: 24,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,.7)",
          }}
        >
          <Icon name="mic" size={22} strokeWidth={1.75} />
        </div>
      </div>

      {/* 질문 패널 */}
      {showQ && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 92,
            width: "min(560px,80%)",
            background: "var(--neutral-925)",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: "var(--radius-16)",
            padding: "18px 20px",
            zIndex: 6,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--blue-400)",
            }}
          >
            현재 질문 · Q3 <span style={{ color: "rgba(255,255,255,.4)" }}>·</span>{" "}
            <span style={{ color: "rgba(255,255,255,.55)" }}>꼬리질문</span>
          </div>
          <div
            style={{
              color: "#f2f3f4",
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.5,
              marginTop: 9,
            }}
          >
            최근 프로젝트에서 가장 어려웠던 기술적 의사결정은 무엇이었나요?
          </div>
        </div>
      )}

      {/* 하단 컨트롤 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "18px 20px 26px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          zIndex: 6,
        }}
      >
        {/* 종료 요청 실패 안내 — 명시 재시도 버튼(멱등 재호출이 설계된 복구 경로) */}
        {endSession.isError && !wrappingUp && (
          <span
            role="alert"
            style={{
              color: "var(--fg-inverse)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {endFailureNotice(endSession.error)}
            <button className="dark-btn" style={{ height: 28 }} onClick={requestEnd}>
              다시 시도
            </button>
          </span>
        )}
        {/* 권한 거부 등 발행 실패의 최소 피드백 — 차단 오버레이는 후속 과제(PR #25 논의) */}
        {micFailed && (
          <span
            role="alert"
            style={{
              color: "var(--fg-inverse)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="mic-off" size={13} /> 마이크를 켤 수 없어요. 브라우저 마이크 권한을 확인해
            주세요
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button
            className="dark-btn dark-btn--round"
            aria-label="마이크"
            aria-pressed={micEnabled}
            disabled={connectionState !== ConnectionState.Connected}
            onClick={() =>
              // 실패 시 발행이 안 된 상태 그대로(mic-off 아이콘 유지) + 안내 문구 노출.
              // 성공한 토글만 의도 상태(micIntent)에 반영한다
              void toggleMicrophone().then(
                () => {
                  setMicFailed(false);
                  const enabled = room.localParticipant.isMicrophoneEnabled;
                  setMicIntent(enabled);
                  updateStoredMicIntent(enabled);
                },
                () => setMicFailed(true),
              )
            }
          >
            <Icon name={micEnabled ? "mic" : "mic-off"} size={18} />
          </button>
          <button className="dark-btn" onClick={() => setShowQ((s) => !s)}>
            <Icon name={showQ ? "eye-off" : "eye"} size={16} />{" "}
            {showQ ? "질문 숨기기" : "질문 보기"}
          </button>
          <button className="dark-btn dark-btn--round" aria-label="카메라 끄기">
            <Icon name="video-off" size={18} />
          </button>
        </div>
      </div>

      {/* 재연결 오버레이 — livekit 자동 재연결이 포기한 뒤(비 ROOM_DELETED 해제)와
          새로고침 스테일 토큰 접속 실패를 받는 재입장 국면. 자동 시도 사이·소진 후에도
          유지되고, 재접속 성공(Connected)이나 종료 수렴 시 파생값이 꺼져 사라진다 */}
      {overlayActive && (
        <div
          data-testid="reconnect-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 7,
            background: "rgba(0,0,0,.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              maxWidth: 440,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--bg-inverse-subtle)",
                border: "1px solid var(--border-inverse-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--fg-inverse)",
              }}
            >
              <Icon name="wifi-off" size={26} strokeWidth={1.75} />
            </div>
            <h2
              style={{
                margin: "18px 0 0",
                fontFamily: "var(--font-sans)",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "var(--fg-inverse)",
              }}
            >
              연결이 끊겼어요
            </h2>
            <p
              role="status"
              style={{
                margin: "8px 0 0",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.6,
                color: "var(--fg-inverse)",
                opacity: 0.85,
              }}
            >
              {reentry.requesting || reentryConnecting
                ? "다시 연결하는 중…"
                : reentry.exhausted
                  ? "연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요"
                  : "다시 연결하는 중…"}
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--fg-inverse)",
                opacity: 0.6,
              }}
            >
              면접 시간은 계속 진행되고 있어요
            </p>
            {/* 종료 요청 실패 안내 — 오버레이가 하단 컨트롤을 가리므로 여기서도 보여준다.
                S008 + 연결 없음은 종료 수렴이 먼저 받아 이 분기에 도달하지 않는다 */}
            {endSession.isError && !wrappingUp && !endConfirmed && (
              <span
                role="alert"
                style={{
                  marginTop: 14,
                  color: "var(--fg-inverse)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {endFailureNotice(endSession.error)}
                <button className="dark-btn" style={{ height: 28 }} onClick={requestEnd}>
                  다시 시도
                </button>
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
              <button className="dark-btn" disabled={reentryBusy} onClick={reentry.retry}>
                <Icon name="rotate-cw" size={16} /> 다시 연결
              </button>
              <button
                className="dark-btn"
                disabled={wrappingUp}
                onClick={() => setConfirmEndOpen(true)}
              >
                {wrappingUp ? "종료 중…" : "면접 종료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 종료 확인 — 확정 시 /end 를 보내고, 수리(202·S008)되면 즉시 완료 화면으로 전환한다 */}
      <Modal
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        title="면접을 종료할까요?"
        actions={[
          <Button
            key="continue"
            variant="assistive"
            fullWidth
            onClick={() => setConfirmEndOpen(false)}
          >
            계속하기
          </Button>,
          <Button
            key="end"
            variant="solid"
            fullWidth
            onClick={() => {
              setConfirmEndOpen(false);
              requestEnd();
            }}
          >
            종료하기
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
          종료한 면접은 다시 이어서 진행할 수 없어요.
        </p>
      </Modal>
    </div>
  );
}
