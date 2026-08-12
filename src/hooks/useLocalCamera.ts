/* ============================================================
   /live 로컬 카메라(self-view) 훅 — 트랙 획득·정지만 다루고 룸에는
   publish 하지 않는다 (면접 중 전송 미디어는 오디오뿐 — device-setup
   PRD 제약). 룸 연결 상태와 무관하게 동작하므로 재연결 중에도
   self-view 가 유지된다.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { createLocalTracks, Track } from "livekit-client";
import type { LocalVideoTrack } from "livekit-client";
import { clearDevicePreference, loadDevicePreferences } from "./devicePreferences";

/** setup 에서 고른 카메라(exact)로 획득 — 장치가 그 사이 제거된 경우
    (NotFoundError·OverconstrainedError) 저장값을 지우고 기본 카메라로 1회
    재시도한다. exact 제약 필수 — bare string 은 장치가 없어도 브라우저가
    조용히 기본 장치로 대체해 이 fallback(저장값 정리)이 실행되지 않는다. */
async function acquireVideoTrack(): Promise<LocalVideoTrack> {
  const { cameraId } = loadDevicePreferences();
  const acquire = async (video: true | { deviceId: { exact: string } }) => {
    const tracks = await createLocalTracks({ video });
    const track = tracks.find((t): t is LocalVideoTrack => t.kind === Track.Kind.Video);
    if (!track) throw new Error("no video track acquired");
    return track;
  };
  if (!cameraId) return acquire(true);
  try {
    return await acquire({ deviceId: { exact: cameraId } });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name !== "NotFoundError" && name !== "OverconstrainedError") throw err;
    clearDevicePreference("cameraId");
    return acquire(true);
  }
}

export interface LocalCameraState {
  /** 켜짐 상태의 로컬 비디오 트랙 — null 이면 꺼짐 (placeholder 표시) */
  cameraTrack: LocalVideoTrack | null;
  cameraEnabled: boolean;
  /** 명시적 켜기 — 저장된 의도(camIntent) 복원용. 이미 켜져 있으면 no-op,
      획득 중이면 그 시도에 합류한다. 실패는 그대로 던진다 (호출자가 안내) */
  enableCamera: () => Promise<void>;
  /** 토글 — 켜짐이면 정지, 꺼짐이면 획득. 성공 시 새 켜짐 상태를 반환한다 */
  toggleCamera: () => Promise<boolean>;
}

export function useLocalCamera(): LocalCameraState {
  const [cameraTrack, setCameraTrack] = useState<LocalVideoTrack | null>(null);
  // 진행 중 획득 — 완료 전의 끄기·언마운트가 늦게 도착한 트랙을 폐기하게 한다
  const acquiringRef = useRef<{ cancelled: boolean; promise: Promise<void> } | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);

  const disableCamera = useCallback(() => {
    if (acquiringRef.current) {
      acquiringRef.current.cancelled = true;
      acquiringRef.current = null;
    }
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current = null;
      setCameraTrack(null);
    }
  }, []);

  const enableCamera = useCallback(() => {
    if (trackRef.current) return Promise.resolve();
    if (acquiringRef.current) return acquiringRef.current.promise;
    const attempt = { cancelled: false, promise: Promise.resolve() };
    attempt.promise = (async () => {
      try {
        const acquired = await acquireVideoTrack();
        if (attempt.cancelled) {
          acquired.stop(); // 대기 중 끄기·언마운트 — 켜진 채 남기지 않는다
          return;
        }
        trackRef.current = acquired;
        setCameraTrack(acquired);
      } finally {
        if (acquiringRef.current === attempt) acquiringRef.current = null;
      }
    })();
    acquiringRef.current = attempt;
    return attempt.promise;
  }, []);

  const toggleCamera = useCallback(async () => {
    if (trackRef.current) {
      disableCamera();
      return false;
    }
    await enableCamera();
    return trackRef.current !== null;
  }, [disableCamera, enableCamera]);

  // 언마운트 시 정지 — 화면을 떠난 뒤 카메라 사용 표시등이 남지 않게 한다
  useEffect(() => disableCamera, [disableCamera]);

  return { cameraTrack, cameraEnabled: cameraTrack !== null, enableCamera, toggleCamera };
}
