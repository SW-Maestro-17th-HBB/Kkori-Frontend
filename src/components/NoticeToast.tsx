/* ---------- 알림 토스트 — 화면 톤(흰 서피스 + 상태색 아이콘 배지)에 맞춘 스타일 ----------
   자동으로 사라지지 않고 사용자가 닫기 버튼으로 직접 닫는다 (읽기 전에 사라지지 않도록).
   테이블의 overflow: hidden 에 잘리지 않도록 body 포털로 화면 상단 중앙에 띄운다. */
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type ToastTone = "error" | "success" | "info";

const TOAST_BADGE: Record<ToastTone, { background: string; color: string; icon: string }> = {
  error: { background: "var(--bg-danger-subtle)", color: "var(--red-600)", icon: "x" },
  success: { background: "var(--bg-success-subtle)", color: "var(--green-600)", icon: "check" },
  info: { background: "var(--bg-brand-subtle)", color: "var(--blue-800)", icon: "info" },
};

/** 제목·설명을 분리해 두 문장이 한 줄에 이어 붙지 않게 한다 (설명은 선택). */
export function NoticeToast({
  tone,
  title,
  description,
  onClose,
}: {
  tone: ToastTone;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  const badge = TOAST_BADGE[tone];
  return createPortal(
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
      }}
    >
      <div
        className="notice-toast"
        style={{
          display: "flex",
          alignItems: description ? "flex-start" : "center",
          gap: 10,
          maxWidth: 480,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-12)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
          padding: "12px 16px",
          fontFamily: "var(--font-sans)",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-full)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: badge.background,
            color: badge.color,
          }}
        >
          <Icon name={badge.icon} size={15} />
        </span>
        <div style={{ wordBreak: "keep-all", lineHeight: 1.5 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-strong)" }}>{title}</div>
          {description && (
            <div
              style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-secondary)", marginTop: 2 }}
            >
              {description}
            </div>
          )}
        </div>
        <button
          type="button"
          className="linkbtn ib-sm"
          aria-label="알림 닫기"
          onClick={onClose}
          style={{ color: "var(--fg-tertiary)", marginLeft: 2, flexShrink: 0 }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
