/* ============================================================
   LiveKit 룸 연결 훅 — Room 생명주기(접속·해제)와 상태를 React 로 노출.
   화면은 이 훅만 쓰고 livekit-client API 를 직접 만지지 않는다.
   상태는 effect 동기화 대신 useSyncExternalStore 로 Room 이벤트를 구독한다.
   ============================================================ */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import type { LiveKitSession } from "../api/types";
import { clearDevicePreferences, loadDevicePreferences } from "./devicePreferences";

export { ConnectionState };

/* ---------- setup → /live 접속 핸드오프 ---------- */
// setup 이 접속을 확립한 Room 을 /live 의 훅이 인수한다. 라우트 전환을 넘어
// 살아있는 객체를 전달하는 유일한 통로 — 보관·인수 외의 용도로 쓰지 않는다.
// 소유 정보를 함께 보관하고 세션(url·token)이 정확히 일치할 때만 인수한다 —
// 토큰은 발급마다 유일하고 /live 게이트가 저장값↔현재 계정을 검증하므로,
// 다른 인증 세션이 이전 사용자의 연결을 넘겨받는 경로가 닫힌다.
interface HandoffRecord {
  room: Room;
  url: string;
  token: string;
  authSessionId: string;
}
let handoff: HandoffRecord | null = null;

/** 접속 확립된 룸을 소유 정보와 함께 보관 — 이전 보관분은 폐기(연결 누수 방지) */
export function stashConnectedRoom(
  room: Room,
  owner: { url: string; token: string; authSessionId: string },
) {
  if (handoff && handoff.room !== room) void handoff.room.disconnect();
  handoff = { room, ...owner };
}

/** 세션이 소유 정보와 일치할 때만 인수 후보를 반환 — 소비하지 않는다
    (StrictMode 이중 초기화에 안전. 소비는 claim, 불일치 폐기는 effect 에서) */
function adoptConnectedRoom(session: LiveKitSession | undefined): Room | null {
  if (!handoff || !session) return null;
  return handoff.url === session.url && handoff.token === session.token ? handoff.room : null;
}

/** 보관 해제 — 인수한 훅이 마운트 효과에서 호출한다(멱등) */
function claimConnectedRoom(room: Room) {
  if (handoff?.room === room) handoff = null;
}

/** 보관분 폐기 — 게이트 실패·인증 전이·취소 경로와 테스트 격리용 */
export function discardConnectedRoom() {
  if (handoff) {
    void handoff.room.disconnect();
    handoff = null;
  }
}

export interface LiveKitRoomState {
  room: Room;
  /** 연결 상태 (livekit ConnectionState — disconnected/connecting/connected/reconnecting…) */
  connectionState: ConnectionState;
  /** 접속 실패 사유 — 연결 시도 자체가 거부됐을 때만 (재연결 실패는 connectionState 로 관찰) */
  connectError: string | null;
  /** 내 마이크 발행 여부 */
  micEnabled: boolean;
  /** 마이크 토글 — 첫 호출 시 브라우저 권한 프롬프트가 뜬다 */
  toggleMicrophone: () => Promise<void>;
  /** 브라우저 자동재생 정책으로 원격 오디오가 막혔는지 — false 면 startAudio 버튼 노출 */
  canPlayAudio: boolean;
  /** 사용자 제스처 안에서 호출해 원격 오디오 재생을 재개한다 */
  startAudio: () => Promise<void>;
}

export function useLiveKitRoom(session: LiveKitSession | undefined): LiveKitRoomState {
  // Room 인스턴스는 마운트 수명 동안 고정 — 접속/해제 사이클을 반복해도 재사용한다.
  // setup 이 접속을 확립해 보관한 룸이 있으면 인수하고, 없으면(직행·새로고침) 새로
  // 만든다. 장비 점검(/setup)에서 고른 마이크가 있으면 캡처 기본값으로 적용한다.
  const [{ room, appliedMicId }] = useState(() => {
    const { micId } = loadDevicePreferences();
    return {
      // exact 제약 필수 — bare string(ideal)은 장치가 제거돼도 브라우저가 조용히
      // 기본 장치로 대체해 아래 fallback(저장값 정리·명시 재시도)이 실행되지 않는다
      room:
        adoptConnectedRoom(session) ??
        new Room(micId ? { audioCaptureDefaults: { deviceId: { exact: micId } } } : undefined),
      appliedMicId: micId ?? null,
    };
  });
  // StrictMode 의 시뮬레이션 언마운트가 인수한 연결을 끊고 재접속하지 않도록,
  // 인수 연결의 해제를 마이크로태스크로 미루고 동일 (room, session) 재마운트면 취소한다
  const pendingDisconnectRef = useRef<{
    room: Room;
    session: LiveKitSession;
    cancelled: boolean;
  } | null>(null);
  // setup→live 사이 저장 마이크가 제거된 경우의 기본 장치 대체 — 세션당 1회만
  const micFallbackRef = useRef(false);
  // 실패를 세션과 묶어 저장 — 세션이 교체되면 파생값이 자동 무효화되므로
  // effect 에서 상태를 리셋할 필요가 없다 (set-state-in-effect 규칙 대응)
  const [connectFailure, setConnectFailure] = useState<{
    session: LiveKitSession;
    message: string;
  } | null>(null);

  // 접속·해제 — 세션이 준비되면 접속, 언마운트(또는 세션 교체) 시 해제.
  // StrictMode 이중 마운트: cleanup 의 disconnect 가 진행 중인 connect 를 중단시키고
  // 두 번째 마운트에서 새로 접속한다 (SDK 가 순서를 보장).
  useEffect(() => {
    if (!session) return;
    claimConnectedRoom(room); // 인수 확정 — 보관분을 비워 다른 마운트가 집어가지 않게 한다
    discardConnectedRoom(); // 인수하지 않은(소유 불일치 등) 잔여 보관분은 연결을 남기지 않는다
    // 직전 cleanup 이 미뤄둔 해제 처리 — 같은 (room, session) 재마운트(StrictMode)면
    // 취소하고, 다르면(세션 교체) 지금 끊어 아래 재접속 판정이 올바르게 동작하게 한다
    const pending = pendingDisconnectRef.current;
    if (pending) {
      pending.cancelled = true;
      pendingDisconnectRef.current = null;
      if (pending.room !== room || pending.session !== session) void pending.room.disconnect();
    }
    let active = true;
    // setup 에서 이미 접속을 확립한 룸이면 재접속하지 않는다 (핸드오프 인수)
    const adopted = room.state !== ConnectionState.Disconnected;
    if (!adopted) {
      room.connect(session.url, session.token).then(
        // 이중 마운트에서 1차 시도만 실패했을 때 성공이 잔존 실패를 지우도록
        () => {
          if (active) setConnectFailure(null);
        },
        (err: unknown) => {
          if (active)
            setConnectFailure({
              session,
              message: err instanceof Error ? err.message : String(err),
            });
        },
      );
    }
    return () => {
      active = false;
      if (adopted) {
        // 인수한 연결은 즉시 끊지 않는다 — StrictMode 재마운트가 곧바로 취소할 수 있게
        const entry = { room, session, cancelled: false };
        pendingDisconnectRef.current = entry;
        queueMicrotask(() => {
          if (!entry.cancelled) void room.disconnect();
        });
      } else {
        void room.disconnect();
      }
    };
  }, [room, session]);

  const connectError =
    connectFailure !== null && connectFailure.session === session ? connectFailure.message : null;

  const connectionState = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        room.on(RoomEvent.ConnectionStateChanged, onChange);
        return () => {
          room.off(RoomEvent.ConnectionStateChanged, onChange);
        };
      },
      [room],
    ),
    () => room.state,
  );

  // 마이크 상태 — 로컬 트랙 발행/해제·음소거 이벤트가 모두 스냅숏(isMicrophoneEnabled)에 반영됨
  const micEnabled = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const events = [
          RoomEvent.LocalTrackPublished,
          RoomEvent.LocalTrackUnpublished,
          RoomEvent.TrackMuted,
          RoomEvent.TrackUnmuted,
        ] as const;
        events.forEach((event) => room.on(event, onChange));
        return () => {
          events.forEach((event) => room.off(event, onChange));
        };
      },
      [room],
    ),
    () => room.localParticipant.isMicrophoneEnabled,
  );

  const toggleMicrophone = useCallback(async () => {
    const enable = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(
        enable,
        // 기본 장치 대체가 발동한 뒤의 켜기는 스테일 캡처 기본값 대신 기본 장치를 쓴다
        enable && micFallbackRef.current ? { deviceId: "default" } : undefined,
      );
    } catch (err) {
      // setup 에서 고른 마이크가 그 사이 제거된 경우: Room 캡처 기본값은 생성 시
      // 고정이라 저장값 삭제만으로는 바뀌지 않으므로, 기본 장치를 명시해 1회
      // 재시도한다. 권한 거부 등 다른 원인은 재시도 없이 그대로 실패시킨다.
      const name = err instanceof Error ? err.name : "";
      const deviceGone = name === "NotFoundError" || name === "OverconstrainedError";
      if (!enable || appliedMicId === null || !deviceGone || micFallbackRef.current) throw err;
      micFallbackRef.current = true;
      clearDevicePreferences();
      await room.localParticipant.setMicrophoneEnabled(true, { deviceId: "default" });
    }
  }, [room, appliedMicId]);

  const canPlayAudio = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        room.on(RoomEvent.AudioPlaybackStatusChanged, onChange);
        return () => {
          room.off(RoomEvent.AudioPlaybackStatusChanged, onChange);
        };
      },
      [room],
    ),
    () => room.canPlaybackAudio,
  );

  const startAudio = useCallback(() => room.startAudio(), [room]);

  return {
    room,
    connectionState,
    connectError,
    micEnabled,
    toggleMicrophone,
    canPlayAudio,
    startAudio,
  };
}

/** 원격 오디오 재생 — 구독된 오디오 트랙을 컨테이너에 <audio> 로 부착/해제.
    반환된 ref 를 숨김 div 에 걸어두면 이후는 트랙 이벤트가 관리한다 */
export function useRemoteAudio(room: Room) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleSubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      containerRef.current?.appendChild(element);
    };
    const handleUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((element) => element.remove());
    };
    room.on(RoomEvent.TrackSubscribed, handleSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, handleSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleUnsubscribed);
    };
  }, [room]);

  return containerRef;
}
