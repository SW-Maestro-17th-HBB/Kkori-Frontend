/* ============================================================
   장비 점검(/setup)에서 고른 마이크를 면접(/live)에 전달하는 저장소.
   같은 탭 새로고침을 살아남도록 sessionStorage 를 쓴다 (탭 간 비공유).
   카메라는 /live 에서 아직 쓰지 않으므로 저장하지 않는다 — self-view
   연동(후속) 시 스키마를 확장한다. (PRD: session/device-setup.md 기능 4)
   ============================================================ */
const STORAGE_KEY = "hbb.interview.devicePrefs";

export interface DevicePreferences {
  micId?: string;
}

export function saveDevicePreferences(prefs: DevicePreferences) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ micId: prefs.micId }));
  } catch {
    // 저장 실패(시크릿 모드 쿼터 등)해도 기본 장치로 면접은 진행 가능
  }
}

export function loadDevicePreferences(): DevicePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const { micId } = parsed as Record<string, unknown>;
    return typeof micId === "string" && micId.length > 0 ? { micId } : {};
  } catch {
    return {};
  }
}

/** 저장된 장치가 더 이상 유효하지 않을 때(/live fallback) 호출한다 */
export function clearDevicePreferences() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 제거 실패해도 load 쪽 방어 파싱이 있어 무해
  }
}
