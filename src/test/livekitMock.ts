/* ============================================================
   livekit-client 목 — jsdom 에는 WebRTC 가 없어 SDK 를 가짜 Room 으로 대체한다.
   사용법 (vi.mock 팩토리는 호이스팅되므로 동적 import 로 가져온다):
     vi.mock("livekit-client", async () =>
       (await import("../test/livekitMock")).createLiveKitMock(),
     );
   테스트에서는 FakeRoom.* / FakeMedia.* 정적 스위치로 제어하고,
   beforeEach 에서 FakeRoom.reset() + FakeMedia.reset() 을 호출한다.
   이벤트 이름·상태 값은 실제 SDK 의 문자열 값과 동일하게 유지할 것.
   ============================================================ */
import { vi } from "vitest";

type Listener = (...args: unknown[]) => void;

/** getUserMedia 계열이 던지는 DOMException 흉내 — name 으로 원인을 구분한다 */
const domError = (name: string, message: string) => Object.assign(new Error(message), { name });

/** setDeviceId 결과 지시자 — 실제 SDK 의 세 갈래를 재현한다 */
export type SwitchResult = "ok" | "false" | "throw";

/** 획득(createLocalTracks) 결과 지시자 */
export type AcquireResult = "ok" | "no-camera" | "no-mic" | "denied" | "in-use";

/** 로컬 트랙 흉내 — 미리보기 attach/detach·장치 전환·정지·ended 를 재현한다.
    실제 SDK 의 setDeviceId 는 기존 내부 MediaStreamTrack 을 리스너 제거 후 먼저
    중지하므로, 의도적 교체에서는 TrackEvent.Ended 가 발생하지 않는다 —
    하드웨어 제거는 emitEnded() 로만 흉내 낼 것. */
export class FakeLocalTrack {
  stopped = false;
  /** 내부 MediaStreamTrack 생존 여부 — 전환 예외 후에는 false 로 남는다 */
  internalTrackAlive = true;
  private listeners = new Map<string, Set<Listener>>();
  private attached: HTMLMediaElement[] = [];
  /** 내부 MediaStreamTrack 흉내 — 전환 성공으로 교체될 때만 새 객체가 된다.
      화면이 내부 트랙 **동일성**으로 프레임 재확인을 판정하므로 식별자가 안정적이어야 한다 */
  private internalTrack = this.createInternalTrack();

  constructor(
    public kind: "audio" | "video",
    public deviceId: string,
  ) {}

  private createInternalTrack() {
    const internal = {
      getSettings: () => ({ deviceId: this.deviceId }),
    } as { readyState: MediaStreamTrackState; getSettings: () => { deviceId: string } };
    // 화살표 getter 로 클래스 this 를 캡처 — readyState 는 생존 여부를 실시간 반영
    Object.defineProperty(internal, "readyState", {
      get: () => (this.internalTrackAlive ? "live" : "ended") as MediaStreamTrackState,
    });
    return internal;
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

  private emit(event: string, ...args: unknown[]) {
    [...(this.listeners.get(event) ?? [])].forEach((cb) => cb(...args));
  }

  /** 사용자/하드웨어 제거 전용 — TrackEvent.Ended 를 발생시킨다 */
  emitEnded() {
    this.internalTrackAlive = false;
    this.emit("ended", this);
  }

  stop = vi.fn(() => {
    this.stopped = true;
    this.internalTrackAlive = false;
  });

  attach = vi.fn((element?: HTMLMediaElement) => {
    const el = element ?? document.createElement(this.kind === "video" ? "video" : "audio");
    this.attached.push(el);
    return el;
  });

  detach = vi.fn((element?: HTMLMediaElement) => {
    if (element) {
      this.attached = this.attached.filter((e) => e !== element);
      return [element];
    }
    return this.attached.splice(0);
  });

  setDeviceId = vi.fn(async (deviceId: string | { exact?: string; ideal?: string }) => {
    const requested =
      typeof deviceId === "string" ? deviceId : (deviceId.exact ?? deviceId.ideal ?? "");
    // 실제 SDK: 리스너를 떼고 기존 내부 트랙을 먼저 중지한다 (Ended 미발생)
    this.internalTrackAlive = false;
    const result = FakeMedia.nextSwitchResult(this.kind, requested);
    if (result === "throw") throw domError("NotFoundError", "Requested device not found");
    // 새 내부 트랙 획득 — 교체됐으므로 식별자도 새로 만든다.
    // "false" 는 트랙은 살아 있으나 요청 장치가 적용되지 않은 경우
    this.internalTrackAlive = true;
    this.internalTrack = this.createInternalTrack();
    if (result === "false") return false;
    this.deviceId = requested;
    return true;
  });

  get mediaStreamTrack() {
    return this.internalTrack;
  }
}

/** 장치 접근 목 — createLocalTracks/createAudioAnalyser/열거의 동작 스위치와 결과 큐 */
export class FakeMedia {
  /** 획득 결과 — acquireResults 큐가 비면 이 값 적용. no-camera 는 video 요청만 실패 */
  static trackBehavior: AcquireResult = "ok";
  /** 호출별 획득 결과 큐 (예: ["in-use", "ok"] = 결합 실패 → 마이크 단독 성공) */
  static acquireResults: AcquireResult[] = [];
  /** 호출 순서별 전환 결과 큐 — 비면 "ok" */
  static switchQueue: SwitchResult[] = [];
  /** "kind:deviceId" 키별 전환 결과 큐 — switchQueue 보다 우선 */
  static switchResults = new Map<string, SwitchResult[]>();
  /** "fail" 이면 getLocalDevices 가 거부된다 (열거 실패 흉내) */
  static enumerateBehavior: "ok" | "fail" = "ok";
  /** createAudioAnalyser().calculateVolume() 이 반환할 값 (0..1) */
  static volume = 0;
  /** 생성된 로컬 트랙 누적 — stop 여부 검증에 사용 */
  static tracks: FakeLocalTrack[] = [];
  static analyserCleanup = vi.fn(async () => {});
  static devices: Record<
    string,
    { deviceId: string; kind: string; label: string; groupId: string }[]
  > = {};

  static reset() {
    FakeMedia.trackBehavior = "ok";
    FakeMedia.acquireResults = [];
    FakeMedia.switchQueue = [];
    FakeMedia.switchResults = new Map();
    FakeMedia.enumerateBehavior = "ok";
    FakeMedia.volume = 0;
    FakeMedia.tracks = [];
    FakeMedia.analyserCleanup.mockClear();
    FakeMedia.createLocalTracks.mockClear();
    FakeMedia.createAudioAnalyser.mockClear();
    FakeMedia.devices = {
      audioinput: [
        { deviceId: "mic-default", kind: "audioinput", label: "내장 마이크", groupId: "g1" },
        { deviceId: "mic-usb", kind: "audioinput", label: "USB 마이크", groupId: "g2" },
      ],
      videoinput: [
        { deviceId: "cam-default", kind: "videoinput", label: "내장 카메라", groupId: "g1" },
        { deviceId: "cam-usb", kind: "videoinput", label: "외장 웹캠", groupId: "g2" },
      ],
    };
  }

  static nextSwitchResult(kind: string, deviceId: string): SwitchResult {
    const keyed = FakeMedia.switchResults.get(`${kind}:${deviceId}`);
    if (keyed?.length) return keyed.shift()!;
    return FakeMedia.switchQueue.shift() ?? "ok";
  }

  static createLocalTracks = vi.fn(
    async (options?: { audio?: boolean; video?: boolean | { deviceId?: { exact?: string } } }) => {
      const behavior = FakeMedia.acquireResults.shift() ?? FakeMedia.trackBehavior;
      if (behavior === "denied") throw domError("NotAllowedError", "Permission denied");
      if (behavior === "in-use") throw domError("NotReadableError", "Device in use");
      if (behavior === "no-mic" && options?.audio)
        throw domError("NotFoundError", "Requested device not found");
      if (behavior === "no-camera" && options?.video)
        throw domError("NotFoundError", "Requested device not found");
      const tracks: FakeLocalTrack[] = [];
      if (options?.audio)
        tracks.push(new FakeLocalTrack("audio", FakeMedia.devices.audioinput?.[0]?.deviceId ?? ""));
      if (options?.video) {
        // 재획득 요청은 exact deviceId 를 지정한다 — 요청 장치를 그대로 반영
        const requested =
          typeof options.video === "object" ? options.video.deviceId?.exact : undefined;
        tracks.push(
          new FakeLocalTrack(
            "video",
            requested ?? FakeMedia.devices.videoinput?.[0]?.deviceId ?? "",
          ),
        );
      }
      FakeMedia.tracks.push(...tracks);
      return tracks;
    },
  );

  // 인자(트랙)는 무시하지만 vi.fn 이 호출 기록은 남긴다
  static createAudioAnalyser = vi.fn(() => ({
    calculateVolume: () => FakeMedia.volume,
    analyser: {},
    cleanup: FakeMedia.analyserCleanup,
  }));
}

FakeMedia.reset(); // 모듈 로드 시 기본 장치 목록 채움

/** 마이크 발행 결과 지시자 — notfound 는 저장 장치 소멸, denied 는 권한 거부 */
export type MicResult = "ok" | "notfound" | "denied";

export class FakeRoom {
  /** 생성 순서대로 쌓인다 — StrictMode 이중 마운트로 여분이 생기니 마지막 것을 쓸 것 */
  static instances: FakeRoom[] = [];
  /** "fail" 이면 connect 가 거부된다 — beforeEach 에서 "ok" 로 리셋 */
  static connectBehavior: "ok" | "fail" = "ok";
  /** micResults 큐가 비었을 때 적용 — "fail" 이면 setMicrophoneEnabled 가 거부된다 */
  static micBehavior: "ok" | "fail" = "ok";
  /** 호출별 마이크 발행 결과 큐 (예: ["notfound", "ok"] = 저장 장치 소멸 → 기본 장치 성공) */
  static micResults: MicResult[] = [];
  /** "fail" 이면 startAudio 가 거부된다 (자동재생 재개 실패 흉내) */
  static audioBehavior: "ok" | "fail" = "ok";

  /** 실제 SDK 의 static Room.getLocalDevices — FakeMedia.devices 를 반환한다 */
  static getLocalDevices = vi.fn(async (kind?: string) => {
    if (FakeMedia.enumerateBehavior === "fail") throw new Error("enumerate failed");
    return kind ? (FakeMedia.devices[kind] ?? []) : Object.values(FakeMedia.devices).flat();
  });

  static reset() {
    FakeRoom.instances = [];
    FakeRoom.connectBehavior = "ok";
    FakeRoom.micBehavior = "ok";
    FakeRoom.micResults = [];
    FakeRoom.audioBehavior = "ok";
    FakeRoom.getLocalDevices.mockClear();
  }

  private listeners = new Map<string, Set<Listener>>();
  state = "disconnected";
  canPlaybackAudio = true;
  /** 생성자 옵션 그대로 보관 — audioCaptureDefaults 전달 검증용 */
  options: unknown;
  localParticipant: {
    isMicrophoneEnabled: boolean;
    setMicrophoneEnabled: (enabled: boolean, options?: unknown) => Promise<void>;
  };
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio = vi.fn(async () => {
    if (FakeRoom.audioBehavior === "fail") throw new Error("audio blocked");
    this.setCanPlaybackAudio(true); // 실제 SDK 처럼 성공 시 재생 가능 상태로 전환
  });

  constructor(options?: unknown) {
    this.options = options;
    FakeRoom.instances.push(this);
    this.localParticipant = {
      isMicrophoneEnabled: false,
      // 두 번째 인자(캡처 옵션)는 vi.fn 호출 기록으로만 검증한다
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
        const result =
          FakeRoom.micResults.shift() ?? (FakeRoom.micBehavior === "fail" ? "denied" : "ok");
        if (result === "denied") throw domError("NotAllowedError", "permission denied");
        if (result === "notfound") throw domError("NotFoundError", "Requested device not found");
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
  createLocalTracks: FakeMedia.createLocalTracks,
  createAudioAnalyser: FakeMedia.createAudioAnalyser,
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
  TrackEvent: {
    Ended: "ended",
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
