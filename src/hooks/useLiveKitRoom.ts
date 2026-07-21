/* ============================================================
   LiveKit 룸 연결 훅 — Room 생명주기(접속·해제)와 상태를 React 로 노출.
   화면은 이 훅만 쓰고 livekit-client API 를 직접 만지지 않는다.
   상태는 effect 동기화 대신 useSyncExternalStore 로 Room 이벤트를 구독한다.
   ============================================================ */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import type { LiveKitSession } from "../api/types";

export { ConnectionState };

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
  // Room 인스턴스는 마운트 수명 동안 고정 — 접속/해제 사이클을 반복해도 재사용한다
  const [room] = useState(() => new Room());
  const [connectError, setConnectError] = useState<string | null>(null);

  // 접속·해제 — 세션이 준비되면 접속, 언마운트(또는 세션 교체) 시 해제.
  // StrictMode 이중 마운트: cleanup 의 disconnect 가 진행 중인 connect 를 중단시키고
  // 두 번째 마운트에서 새로 접속한다 (SDK 가 순서를 보장).
  useEffect(() => {
    if (!session) return;
    let active = true;
    room.connect(session.url, session.token).catch((err: unknown) => {
      if (active) setConnectError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      active = false;
      void room.disconnect();
    };
  }, [room, session]);

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
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
  }, [room]);

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
