/* ============================ 면접 진행 (/live) — 다크 풀스크린 ============================ */
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Icon } from "../components/Icon";
import { clearInterviewSession, loadInterviewSession } from "../hooks/interviewSession";
import { useAuthSessionId } from "../hooks/useAuthStatus";
import { useNav } from "../hooks/useNav";
import {
  ConnectionState,
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

export function InterviewPage() {
  const nav = useNav();
  const [showQ, setShowQ] = useState(true);
  const [micFailed, setMicFailed] = useState(false);
  // setup 핸드오프 저장값 — 마운트 시 1회만 로드해 참조를 고정한다
  // (매 렌더 새 객체를 만들면 useLiveKitRoom 의 세션 effect 가 재접속을 반복한다)
  const [stored] = useState(loadInterviewSession);
  const authSessionId = useAuthSessionId();
  // 저장값이 없거나(직행·손상) 발급 당시 계정과 다르면 통과 불가 — 이전 계정의
  // 토큰이 다음 사용자에게 넘어가는 것을 막는다 (PRD 인증 세션 검증)
  const gateOk = stored !== null && stored.authSessionId === authSessionId;
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
    connectError,
    micEnabled,
    toggleMicrophone,
    canPlayAudio,
    startAudio,
  } = useLiveKitRoom(gateOk ? stored : undefined);
  const remoteAudioRef = useRemoteAudio(room);

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
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 14px",
            borderRadius: "var(--radius-full)",
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.18)",
            color: "#e6e8ea",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red-600)" }}
          />{" "}
          04:12 남음
        </span>
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
          <button className="dark-btn" onClick={() => nav("reportDetail")}>
            면접 종료
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
            <Icon name="mic-off" size={13} /> 마이크를 켤 수 없어요 — 브라우저 마이크 권한을 확인해
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
              // 실패 시 발행이 안 된 상태 그대로(mic-off 아이콘 유지) + 안내 문구 노출
              void toggleMicrophone().then(
                () => setMicFailed(false),
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
    </div>
  );
}
