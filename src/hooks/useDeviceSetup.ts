/* ============================================================
   면접 전 장비 점검 훅 — 룸 접속 없이 로컬에서 마이크·카메라 트랙을
   미리 획득해 미리보기·레벨 미터·장치 선택을 제공한다 (publish 안 함).
   마이크는 필수, 카메라는 선택(없어도 음성 면접 진행).
   정책 원천: docs/requirements/session/device-setup.md

   비동기 조정 모델:
   - start·장치 전환·자동 재조정은 컨트롤러에서 직렬화한다(진행 중 추가
     전환은 차단 — UI 도 busy 로 select 를 잠근다).
   - ended·devicechange 는 pending 플래그로 병합하고, 진행 중 작업이
     끝난 뒤 한 번 더 재조정한다 (이벤트 유실 없음).
   - generation 은 start()·언마운트에만 사용 — 폐기 세대가 만든 독립
     트랙만 즉시 stop() 하고, 공유 LocalTrack 은 stale 판정으로 stop
     하지 않는다.
   화면은 이 훅만 쓰고 livekit-client API 를 직접 만지지 않는다.
   ============================================================ */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createAudioAnalyser, createLocalTracks, Room, Track, TrackEvent } from "livekit-client";
import type { LocalAudioTrack, LocalTrack, LocalVideoTrack } from "livekit-client";

export type DeviceCheckError =
  "permission-denied" | "mic-not-found" | "device-in-use" | "unsupported" | "mic-lost" | "unknown";

/** 전환·복구 결과에 대한 일시 안내 코드 — 문구 매핑은 화면 몫 */
export type DeviceNotice = "mic-switch-failed" | "camera-switch-failed" | "mic-auto-switched";

export interface DeviceSetupSnapshot {
  phase: "idle" | "starting" | "ready" | "error";
  /** phase 가 "error" 일 때만 원인 코드 */
  error: DeviceCheckError | null;
  /** 미리보기용 카메라 트랙 — ready 인데 null 이면 카메라 사용 불가(음성 진행) */
  videoTrack: LocalVideoTrack | null;
  /** 마이크 입력 레벨 (0..1) — ready 가 아니면 0 */
  micVolume: number;
  /** 실입력 감지 — 레벨이 임계치를 한 번 넘어야 true (장치 전환 시 리셋, PRD 기능 2) */
  micInputDetected: boolean;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  cameraId: string | null;
  micId: string | null;
  /** 마이크 전환·자동 복구 진행 중 — 이 동안 유효한 마이크가 없을 수 있다 */
  micBusy: boolean;
  cameraBusy: boolean;
  notice: DeviceNotice | null;
}

export interface DeviceSetupState extends DeviceSetupSnapshot {
  /** 면접 시작 가능 — 마이크 확보 + 실입력 감지 + 전환·복구 중 아님 (카메라는 무관) */
  canStart: boolean;
  /** 장비 점검 시작·재시도 — 사용자 제스처 안에서 호출해야 권한 프롬프트가 뜬다 */
  start: () => Promise<void>;
  selectMic: (deviceId: string) => Promise<void>;
  selectCamera: (deviceId: string) => Promise<void>;
}

/** getUserMedia 실패 원인 → 화면 안내용 코드 (DOMException.name 기준) */
function mapDeviceError(err: unknown): DeviceCheckError {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError") return "permission-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "mic-not-found";
  if (name === "NotReadableError" || name === "AbortError") return "device-in-use";
  if (name === "SecurityError" || name === "DeviceUnsupportedError") return "unsupported";
  return "unknown";
}

const trackDeviceId = (track: LocalTrack): string | null =>
  track.mediaStreamTrack.getSettings().deviceId ?? null;

/** 기본 장치 선택 규칙 — deviceId "default" 우선, 없으면 열거된 첫 번째 (PRD 기능 3) */
const pickDefaultDevice = (
  devices: MediaDeviceInfo[],
  excludeId?: string | null,
): string | null => {
  const usable = devices.filter((d) => d.deviceId && d.deviceId !== excludeId);
  return usable.find((d) => d.deviceId === "default")?.deviceId ?? usable[0]?.deviceId ?? null;
};

/** "마이크 정상" 확정 임계치 (calculateVolume 0..1 기준) — 실측 조정 여지.
    일반 발화는 0.1 이상, 억제된 무음 노이즈는 0.01 미만으로 측정된다 */
const MIC_INPUT_THRESHOLD = 0.04;

const INITIAL: DeviceSetupSnapshot = {
  phase: "idle",
  error: null,
  videoTrack: null,
  micVolume: 0,
  micInputDetected: false,
  cameras: [],
  mics: [],
  cameraId: null,
  micId: null,
  micBusy: false,
  cameraBusy: false,
  notice: null,
};

class DeviceSetupController {
  private snap: DeviceSetupSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private audio: LocalAudioTrack | null = null;
  private video: LocalVideoTrack | null = null;
  /** 획득 세대 — deactivate·재시작 시 증가해 뒤늦은 결과를 폐기한다 */
  private generation = 0;
  /** 직렬화 게이트 — start·전환·재조정 중 하나만 실행 */
  private opRunning = false;
  /** 진행 중 도착한 ended·devicechange 를 병합해 두는 플래그 */
  private pendingReconcile = false;
  private stopVolume: (() => void) | null = null;
  private active = false;

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  };

  getSnapshot = () => this.snap;

  private update(patch: Partial<DeviceSetupSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    [...this.listeners].forEach((cb) => cb());
  }

  activate() {
    this.active = true;
    navigator.mediaDevices?.addEventListener("devicechange", this.handleDeviceChange);
  }

  deactivate() {
    this.active = false;
    this.generation += 1;
    navigator.mediaDevices?.removeEventListener("devicechange", this.handleDeviceChange);
    this.teardown();
    this.update(INITIAL);
  }

  start = async () => {
    if (this.opRunning || this.snap.phase === "starting" || this.snap.phase === "ready") return;
    const gen = ++this.generation;
    this.opRunning = true;
    this.update({
      phase: "starting",
      error: null,
      notice: null,
      micVolume: 0,
      micInputDetected: false,
    });
    try {
      let tracks: LocalTrack[];
      try {
        tracks = await createLocalTracks({ audio: true, video: true });
      } catch {
        // 카메라는 선택 — 결합 실패 원인과 무관하게 마이크 단독으로 재확인한다.
        // 이 재확인 때문에 권한 프롬프트 1회는 보장되지 않으며(PRD 기능 1),
        // 실패 안내는 필수 장치인 마이크 단독 시도를 기준으로 한다.
        tracks = await createLocalTracks({ audio: true });
      }
      const audio = tracks.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;
      const video =
        (tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined) ?? null;
      if (gen !== this.generation || !audio) {
        tracks.forEach((t) => t.stop()); // 폐기된 세대(또는 마이크 누락)의 독립 트랙 정리
        if (gen !== this.generation) return;
        throw new Error("no audio track");
      }
      this.audio = audio;
      this.video = video;
      audio.on(TrackEvent.Ended, this.handleTrackEnded);
      video?.on(TrackEvent.Ended, this.handleTrackEnded);
      this.startVolumeMeter();
      this.update({
        phase: "ready",
        error: null,
        videoTrack: video,
        micId: trackDeviceId(audio),
        cameraId: video ? trackDeviceId(video) : null,
      });
      await this.refreshDevices();
    } catch (err) {
      if (gen !== this.generation) return;
      // 부분 획득 자원 정리 — 트랙 확보 후 분석기 생성 등에서 실패하면 필드에 남은
      // 트랙이 재시도 시 새 트랙으로 덮여 영구 누수된다
      this.teardown();
      this.update({ phase: "error", error: mapDeviceError(err), micVolume: 0 });
    } finally {
      this.opRunning = false;
      void this.drainReconcile();
    }
  };

  selectMic = async (deviceId: string) => {
    if (this.opRunning || this.snap.phase !== "ready" || !this.audio) return;
    if (deviceId === this.snap.micId) return;
    const gen = this.generation;
    const prevId = this.snap.micId;
    this.opRunning = true;
    // 새 장치는 미검증 상태 — 입력 감지를 리셋해 다시 확인한다 (PRD 기능 2)
    this.update({ micBusy: true, notice: null, micInputDetected: false });
    try {
      try {
        // exact 제약 — 사용자가 고른 장치를 그대로 요청한다. bare string(ideal)은
        // 브라우저가 조용히 기본 장치로 대체할 수 있어(false 반환) 전환이 무시된다
        const ok = await this.audio.setDeviceId({ exact: deviceId });
        if (gen !== this.generation) return;
        // 성공/false 공통: 트랙이 살아 있으므로 실제 사용 중인 장치 ID 를 반영한다
        this.startVolumeMeter();
        this.update({
          micId: trackDeviceId(this.audio),
          micBusy: false,
          notice: ok ? null : "mic-switch-failed",
        });
        return;
      } catch {
        // 예외 — setDeviceId 는 기존 내부 트랙을 먼저 중지하므로 이전 마이크도
        // 죽었을 수 있다: 이전 장치 → 기본 장치 순으로 재획득을 시도한다
      }
      if (gen !== this.generation) return;
      const recovered = await this.recover(this.audio, this.snap.mics, prevId, deviceId);
      if (gen !== this.generation) return;
      if (recovered) {
        this.startVolumeMeter();
        this.update({
          micId: trackDeviceId(this.audio),
          micBusy: false,
          notice: "mic-switch-failed",
        });
      } else {
        this.invalidate("mic-lost"); // 마이크는 필수 — 복구 실패 시 점검 무효화
      }
    } finally {
      this.opRunning = false;
      if (this.snap.micBusy) this.update({ micBusy: false });
      void this.drainReconcile();
    }
  };

  selectCamera = async (deviceId: string) => {
    if (this.opRunning || this.snap.phase !== "ready") return;
    if (this.video && deviceId === this.snap.cameraId) return;
    const gen = this.generation;
    const prevId = this.snap.cameraId;
    this.opRunning = true;
    this.update({ cameraBusy: true, notice: null });
    try {
      // 카메라 사용 불가 상태 — 전환이 아니라 새 트랙 재획득으로 미리보기를 복구한다
      // (점검 중 연결한 카메라를 선택할 수 있어야 함 — PRD 기능 3 카메라 재획득)
      if (!this.video) {
        try {
          const tracks = await createLocalTracks({ video: { deviceId: { exact: deviceId } } });
          const video =
            (tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined) ??
            null;
          if (gen !== this.generation || !video) {
            tracks.forEach((t) => t.stop());
            if (gen !== this.generation) return;
            throw new Error("no video track");
          }
          this.video = video;
          video.on(TrackEvent.Ended, this.handleTrackEnded);
          this.update({
            videoTrack: video,
            cameraId: trackDeviceId(video),
            cameraBusy: false,
          });
        } catch {
          if (gen !== this.generation) return;
          // 획득 실패 — 카메라는 선택 사항이므로 경고 상태를 유지한다
          this.update({ cameraBusy: false, notice: "camera-switch-failed" });
        }
        return;
      }
      try {
        const ok = await this.video.setDeviceId({ exact: deviceId });
        if (gen !== this.generation) return;
        this.update({
          cameraId: trackDeviceId(this.video),
          cameraBusy: false,
          notice: ok ? null : "camera-switch-failed",
        });
        return;
      } catch {
        // 아래 복구 시도로
      }
      if (gen !== this.generation) return;
      const recovered = await this.recover(this.video, this.snap.cameras, prevId, deviceId);
      if (gen !== this.generation) return;
      if (recovered) {
        this.update({
          cameraId: trackDeviceId(this.video),
          cameraBusy: false,
          notice: "camera-switch-failed",
        });
      } else {
        // 카메라는 선택 — 복구 실패 시 경고 상태로 내려놓고 음성 진행 유지
        this.dropCamera("camera-switch-failed");
      }
    } finally {
      this.opRunning = false;
      if (this.snap.cameraBusy) this.update({ cameraBusy: false });
      void this.drainReconcile();
    }
  };

  /** 이전 장치 → 기본 장치 순 재획득 — 성공 여부만 반환 (PRD 기능 3 전환 실패 처리) */
  private async recover(
    track: LocalAudioTrack | LocalVideoTrack,
    devices: MediaDeviceInfo[],
    prevId: string | null,
    failedId: string | null,
  ): Promise<boolean> {
    const candidates: string[] = [];
    if (prevId && prevId !== failedId) candidates.push(prevId);
    const fallback = pickDefaultDevice(devices, failedId);
    if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
    for (const id of candidates) {
      try {
        if (await track.setDeviceId({ exact: id })) return true;
      } catch {
        // 다음 후보로
      }
    }
    return false;
  }

  private handleTrackEnded = () => {
    this.requestReconcile();
  };

  private handleDeviceChange = () => {
    this.requestReconcile();
  };

  private requestReconcile() {
    if (!this.active) return;
    this.pendingReconcile = true;
    // microtask 로 미뤄 같은 틱에 도착한 이벤트 배치를 하나의 재조정으로 병합한다
    queueMicrotask(() => void this.drainReconcile());
  }

  private async drainReconcile() {
    if (this.opRunning) return; // 진행 중 작업의 finally 가 다시 호출한다 (이벤트 병합)
    while (this.pendingReconcile && this.active && this.snap.phase === "ready") {
      this.pendingReconcile = false;
      this.opRunning = true;
      try {
        await this.reconcile();
      } finally {
        this.opRunning = false;
      }
    }
  }

  /** ended·devicechange 병합 처리 — 목록 재열거 후 상실 장치를 조정한다.
      판단은 이벤트 플래그가 아니라 현재 트랙 상태·목록 기준 — 전환 도중 발화한
      낡은 ended 이벤트가 살아 있는 새 트랙을 죽었다고 오판하지 않게 한다 */
  private async reconcile() {
    const gen = this.generation;
    await this.refreshDevices();
    if (gen !== this.generation || this.snap.phase !== "ready") return;

    const trackDead = (track: LocalTrack) => track.mediaStreamTrack.readyState === "ended";
    const listedGone = (devices: MediaDeviceInfo[], id: string | null) =>
      id !== null && devices.length > 0 && !devices.some((d) => d.deviceId === id);

    // 카메라 상실 — 경고 전환(시작 유지), 자동 전환은 하지 않는다 (PRD 기능 3)
    if (
      this.video !== null &&
      (trackDead(this.video) || listedGone(this.snap.cameras, this.snap.cameraId))
    ) {
      this.dropCamera(null);
    }

    // 마이크 상실 — 기본 마이크 자동 전환, 후보 없거나 실패 시 점검 무효화
    if (
      this.audio === null ||
      !(trackDead(this.audio) || listedGone(this.snap.mics, this.snap.micId))
    ) {
      return;
    }

    this.update({ micBusy: true, micInputDetected: false });
    const fallback = pickDefaultDevice(this.snap.mics, this.snap.micId);
    let recovered = false;
    if (fallback) {
      try {
        recovered = await this.audio.setDeviceId({ exact: fallback });
      } catch {
        recovered = false;
      }
    }
    if (gen !== this.generation) return;
    if (recovered) {
      this.startVolumeMeter();
      this.update({
        micId: trackDeviceId(this.audio),
        micBusy: false,
        notice: "mic-auto-switched",
      });
    } else {
      this.invalidate("mic-lost");
    }
  }

  private async refreshDevices() {
    try {
      const [cams, mics] = await Promise.all([
        Room.getLocalDevices("videoinput", false),
        Room.getLocalDevices("audioinput", false),
      ]);
      if (!this.active) return;
      this.update({ cameras: cams, mics });
    } catch {
      // 열거 실패는 무해 처리 — 기존 목록 유지, 점검 완료 상태에는 영향 없음 (PRD 기능 3)
    }
  }

  private startVolumeMeter() {
    this.stopVolume?.();
    this.stopVolume = null;
    if (!this.audio) return;
    // 장치 전환으로 내부 mediaStreamTrack 이 교체되면 분석기도 다시 만든다
    const { calculateVolume, cleanup } = createAudioAnalyser(this.audio);
    const timer = window.setInterval(() => {
      const next = calculateVolume();
      // 임계치를 한 번 넘으면 실입력 감지 확정 — "마이크 정상" 판정 신호 (PRD 기능 2)
      const detected = this.snap.micInputDetected || next >= MIC_INPUT_THRESHOLD;
      if (next !== this.snap.micVolume || detected !== this.snap.micInputDetected) {
        this.update({ micVolume: next, micInputDetected: detected });
      }
    }, 120);
    this.stopVolume = () => {
      window.clearInterval(timer);
      void cleanup();
    };
  }

  /** 카메라만 내려놓고 음성 진행 유지 — ready 는 그대로 (PRD: 카메라는 선택) */
  private dropCamera(notice: DeviceNotice | null) {
    if (this.video) {
      this.video.off(TrackEvent.Ended, this.handleTrackEnded);
      this.video.stop();
      this.video = null;
    }
    this.update({ videoTrack: null, cameraId: null, cameraBusy: false, notice });
  }

  /** 점검 무효화 — 트랙을 정리하고 error 상태로 (면접 시작 비활성, 다시 점검 유도) */
  private invalidate(error: DeviceCheckError) {
    const { cameras, mics } = this.snap;
    this.teardown();
    this.update({ ...INITIAL, phase: "error", error, cameras, mics });
  }

  private teardown() {
    this.stopVolume?.();
    this.stopVolume = null;
    if (this.audio) {
      this.audio.off(TrackEvent.Ended, this.handleTrackEnded);
      this.audio.stop();
      this.audio = null;
    }
    if (this.video) {
      this.video.off(TrackEvent.Ended, this.handleTrackEnded);
      this.video.stop();
      this.video = null;
    }
  }
}

export function useDeviceSetup(): DeviceSetupState {
  // 컨트롤러는 마운트 수명 동안 고정 — 상태는 useSyncExternalStore 로 구독한다
  const [controller] = useState(() => new DeviceSetupController());

  useEffect(() => {
    controller.activate();
    return () => {
      controller.deactivate();
    };
  }, [controller]);

  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  return {
    ...snap,
    // 마이크 전환·복구 중에는 유효한 마이크가 없는 순간이 있어 시작을 잠그고,
    // 실입력이 감지되어야 활성화한다 (카메라는 무관 — PRD 기능 4)
    canStart:
      snap.phase === "ready" && snap.micId !== null && !snap.micBusy && snap.micInputDetected,
    start: controller.start,
    selectMic: controller.selectMic,
    selectCamera: controller.selectCamera,
  };
}
