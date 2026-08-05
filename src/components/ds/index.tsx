/* ============================================================
   Wanted DS 대체 컴포넌트
   프로토타입이 사용한 WantedDesignSystem_3af39f API와 동일한
   프롭 시그니처로 재구성 (_ds 번들 미포함 대체 구현).
   ============================================================ */
import {
  useEffect,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  type ChangeEventHandler,
} from "react";
import "./ds.css";

/* ---------- Button ---------- */
export function Button({
  variant = "solid",
  size = "md",
  fullWidth,
  leadingIcon,
  disabled,
  onClick,
  style,
  children,
  "aria-label": ariaLabel,
}: {
  "variant"?: "solid" | "assistive" | "outlined" | "text";
  "size"?: "sm" | "md" | "lg";
  "fullWidth"?: boolean;
  "leadingIcon"?: ReactNode;
  "disabled"?: boolean;
  "onClick"?: MouseEventHandler<HTMLButtonElement>;
  "style"?: CSSProperties;
  "children": ReactNode;
  "aria-label"?: string;
}) {
  const cls = [
    "wds-btn",
    `wds-btn--${variant}`,
    `wds-btn--${size}`,
    fullWidth ? "wds-btn--full" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      onClick={onClick}
      style={style}
      aria-label={ariaLabel}
    >
      {leadingIcon}
      {children}
    </button>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  variant = "neutral",
  dot,
  style,
  children,
}: {
  variant?: "brand" | "success" | "danger" | "neutral" | "solid";
  dot?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span className={`wds-badge wds-badge--${variant}`} style={style}>
      {dot && <span className="wds-badge__dot" />}
      {children}
    </span>
  );
}

/* ---------- Tag ---------- */
export function Tag({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return (
    <span className="wds-tag" style={style}>
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="wds-card" style={style}>
      {children}
    </div>
  );
}

/* ---------- Progress ---------- */
export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="wds-progress"
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="wds-progress__fill" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  actions,
  style,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actions?: ReactNode[];
  style?: CSSProperties;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="wds-modal-overlay" onClick={onClose}>
      <div
        className="wds-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="wds-modal__title">{title}</h2>
        <div className="wds-modal__body">{children}</div>
        {actions && actions.length > 0 && (
          <div className="wds-modal__actions">
            {actions.map((a, i) => (
              <div key={i}>{a}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Input ---------- */
export function Input({
  value,
  placeholder,
  disabled,
  trailingIcon,
  onChange,
}: {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  trailingIcon?: ReactNode;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div className={`wds-input-wrap${trailingIcon ? " wds-input-wrap--trailing" : ""}`}>
      <input
        className="wds-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
      />
      {trailingIcon && <span className="wds-input__trailing">{trailingIcon}</span>}
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`wds-switch${checked ? " wds-switch--on" : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <span className="wds-switch__knob" />
    </button>
  );
}

/* ---------- Toast ---------- */
export function Toast({
  tone = "default",
  icon,
  children,
}: {
  tone?: "default" | "success";
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`wds-toast${tone === "success" ? " wds-toast--success" : ""}`}>
      {icon && <span className="wds-toast__icon">{icon}</span>}
      {children}
    </div>
  );
}

/* ---------- Chip ---------- */
export function Chip({
  selected,
  onClick,
  children,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHaspopup,
}: {
  "selected"?: boolean;
  "onClick"?: MouseEventHandler<HTMLButtonElement>;
  "children": ReactNode;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: boolean | "menu" | "listbox";
}) {
  return (
    <button
      type="button"
      className={`wds-chip${selected ? " wds-chip--selected" : ""}`}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
    >
      {children}
    </button>
  );
}

/* ---------- IconButton ---------- */
export function IconButton({
  ariaLabel,
  notification,
  onClick,
  children,
}: {
  ariaLabel: string;
  notification?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button type="button" className="wds-iconbtn" aria-label={ariaLabel} onClick={onClick}>
      {children}
      {notification && <span className="wds-iconbtn__notif" />}
    </button>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      className="wds-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
