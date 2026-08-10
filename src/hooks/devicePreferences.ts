/* ============================================================
   장비 점검(/setup)에서 고른 장치를 면접(/live)에 전달하는 저장소.
   같은 탭 새로고침을 살아남도록 sessionStorage 를 쓴다 (탭 간 비공유).
   micId 는 /live 마이크 캡처 기본값, cameraId 는 self-view 로컬 카메라
   획득에 쓰인다. (PRD: session/device-setup.md 기능 4)
   ============================================================ */
const STORAGE_KEY = "hbb.interview.devicePrefs";

export interface DevicePreferences {
  micId?: string;
  cameraId?: string;
}

export function saveDevicePreferences(prefs: DevicePreferences) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ micId: prefs.micId, cameraId: prefs.cameraId }),
    );
  } catch {
    // 저장 실패(시크릿 모드 쿼터 등)해도 기본 장치로 면접은 진행 가능
  }
}

const asId = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export function loadDevicePreferences(): DevicePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const { micId, cameraId } = parsed as Record<string, unknown>;
    const prefs: DevicePreferences = {};
    const mic = asId(micId);
    const cam = asId(cameraId);
    if (mic) prefs.micId = mic;
    if (cam) prefs.cameraId = cam;
    return prefs;
  } catch {
    return {};
  }
}

/** 저장된 장치 하나가 더 이상 유효하지 않을 때(/live fallback) 그 필드만 제거한다 —
    한 장치의 fallback 이 다른 장치의 선호까지 지우지 않는다 */
export function clearDevicePreference(key: keyof DevicePreferences) {
  const prefs = loadDevicePreferences();
  if (!(key in prefs)) return;
  delete prefs[key];
  saveDevicePreferences(prefs);
}

export function clearDevicePreferences() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 제거 실패해도 load 쪽 방어 파싱이 있어 무해
  }
}
