/* ============================================================
   livekit-client 목 — jsdom 에는 WebRTC 가 없어 SDK 를 가짜 Room 으로 대체한다.
   사용법 (vi.mock 팩토리는 호이스팅되므로 동적 import 로 가져온다):
     vi.mock("livekit-client", async () =>
       (await import("../test/livekitMock")).createLiveKitMock(),
     );
   테스트에서는 FakeRoom.instances / FakeRoom.connectBehavior 로 제어한다.
   이벤트 이름·상태 값은 실제 SDK 의 문자열 값과 동일하게 유지할 것.
   ============================================================ */
import { vi } from "vitest";

type Listener = (...args: unknown[]) => void;

export class FakeRoom {
  /** 생성 순서대로 쌓인다 — StrictMode 이중 마운트로 여분이 생기니 마지막 것을 쓸 것 */
  static instances: FakeRoom[] = [];
  /** "fail" 이면 connect 가 거부된다 — beforeEach 에서 "ok" 로 리셋 */
  static connectBehavior: "ok" | "fail" = "ok";
  /** "fail" 이면 setMicrophoneEnabled 가 거부된다 (권한 거부 흉내) */
  static micBehavior: "ok" | "fail" = "ok";
  /** "fail" 이면 startAudio 가 거부된다 (자동재생 재개 실패 흉내) */
  static audioBehavior: "ok" | "fail" = "ok";

  static reset() {
    FakeRoom.instances = [];
    FakeRoom.connectBehavior = "ok";
    FakeRoom.micBehavior = "ok";
    FakeRoom.audioBehavior = "ok";
  }

  private listeners = new Map<string, Set<Listener>>();
  state = "disconnected";
  canPlaybackAudio = true;
  localParticipant: {
    isMicrophoneEnabled: boolean;
    setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  };
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio = vi.fn(async () => {
    if (FakeRoom.audioBehavior === "fail") throw new Error("audio blocked");
    this.setCanPlaybackAudio(true); // 실제 SDK 처럼 성공 시 재생 가능 상태로 전환
  });

  constructor() {
    FakeRoom.instances.push(this);
    this.localParticipant = {
      isMicrophoneEnabled: false,
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
        if (FakeRoom.micBehavior === "fail") throw new Error("permission denied");
        this.localParticipant.isMicrophoneEnabled = enabled;
        this.emit(enabled ? "localTrackPublished" : "localTrackUnpublished");
      }),
    };
    this.connect = vi.fn(async () => {
      if (FakeRoom.connectBehavior === "fail") throw new Error("connect refused");
      this.setState("connected");
    });
    this.disconnect = vi.fn(async () => {
      this.setState("disconnected");
    });
  }

  setState(next: string) {
    this.state = next;
    this.emit("connectionStateChanged", next);
  }

  setCanPlaybackAudio(next: boolean) {
    this.canPlaybackAudio = next;
    this.emit("audioPlaybackChanged");
  }

  on(event: string, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }

  off(event: string, cb: Listener) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    [...(this.listeners.get(event) ?? [])].forEach((cb) => cb(...args));
  }
}

/** 원격 트랙 흉내 — attach 가 만든 요소들을 detach 가 그대로 반환한다 */
export function makeFakeAudioTrack() {
  const elements: HTMLMediaElement[] = [];
  return {
    kind: "audio",
    attach: () => {
      const el = document.createElement("audio");
      elements.push(el);
      return el;
    },
    detach: () => elements.splice(0),
  };
}

export const createLiveKitMock = () => ({
  Room: FakeRoom,
  RoomEvent: {
    ConnectionStateChanged: "connectionStateChanged",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    AudioPlaybackStatusChanged: "audioPlaybackChanged",
  },
  ConnectionState: {
    Disconnected: "disconnected",
    Connecting: "connecting",
    Connected: "connected",
    Reconnecting: "reconnecting",
    SignalReconnecting: "signalReconnecting",
  },
  Track: { Kind: { Audio: "audio", Video: "video" } },
});
