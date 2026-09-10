/* ---------- 상단 네비게이션 (앱 셸) — 프로토타입 lib.jsx TopNav 이식 ---------- */
import { Fragment, useState } from "react";
import { useNavigate } from "react-router";
import { useLogout, useProfile } from "../api/hooks";
import {
  formatRelativeTime,
  useNotificationActions,
  useNotifications,
  type AppNotification,
  type NotificationTone,
} from "../api/notifications";
import type { NavKey } from "../routes";
import { useNav } from "../hooks/useNav";
import { useNow } from "../hooks/useNow";
import { Avatar, IconButton } from "./ds";
import { Icon } from "./Icon";
import { Wordmark } from "./primitives";

export type TopNavActive = "home" | "resume" | "report" | null;

const TONE_STYLE: Record<NotificationTone, { color: string; background: string }> = {
  done: { color: "var(--green-600)", background: "var(--bg-success-subtle)" },
  ing: { color: "var(--blue-800)", background: "var(--bg-brand-subtle)" },
  fail: { color: "var(--red-600)", background: "var(--bg-danger-subtle)" },
};

/** 알림 드롭다운 — 열려 있는 동안만 마운트되어 상대 시간 시계(useNow)도 그동안만 돈다 */
function NotificationPanel({
  items,
  onSelect,
  onMarkAllRead,
  onClear,
}: {
  items: AppNotification[];
  onSelect: (item: AppNotification) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const now = useNow();
  const hasUnread = items.some((n) => n.unread);
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        width: 340,
        zIndex: 41,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-16)",
        boxShadow: "var(--shadow-pop)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--fg-strong)",
          }}
        >
          알림
        </span>
        <button
          className="linkbtn"
          onClick={onMarkAllRead}
          disabled={!hasUnread}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 600,
            color: hasUnread ? "var(--blue-800)" : "var(--fg-tertiary)",
          }}
        >
          모두 읽음
        </button>
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {items.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <Icon name="bell-off" size={22} style={{ color: "var(--fg-tertiary)" }} />
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--fg-default)",
              }}
            >
              새 알림이 없어요
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
              }}
            >
              이력서 분석과 리포트 생성이 끝나면 여기서 알려드려요
            </span>
          </div>
        ) : (
          items.map((n, i) => {
            const tone = TONE_STYLE[n.tone];
            return (
              <button
                key={n.key}
                className="linkbtn notif-row"
                onClick={() => onSelect(n)}
                style={{
                  width: "100%",
                  display: "flex",
                  gap: 12,
                  padding: "14px 16px",
                  borderTop: i ? "1px solid var(--border-subtle)" : "none",
                  background: n.unread ? "var(--bg-brand-subtle)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "var(--radius-full)",
                    flexShrink: 0,
                    background: tone.background,
                    color: tone.color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={n.icon} size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-sans)",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--fg-strong)",
                      lineHeight: 1.4,
                    }}
                  >
                    {n.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--fg-secondary)",
                      marginTop: 3,
                    }}
                  >
                    {n.desc}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-sans)",
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: "var(--fg-tertiary)",
                      marginTop: 5,
                    }}
                  >
                    {formatRelativeTime(n.at, now)}
                  </span>
                </span>
                {n.unread && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "var(--blue-800)",
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
      {items.length > 0 && (
        <button
          className="linkbtn notif-foot"
          onClick={onClear}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderTop: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--fg-secondary)",
            textAlign: "center",
          }}
        >
          모두 지우기
        </button>
      )}
    </div>
  );
}

export function TopNav({ active }: { active: TopNavActive }) {
  const nav = useNav();
  const navigate = useNavigate();
  const logout = useLogout();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifs = useNotifications();
  const { markRead, markAllRead, clear } = useNotificationActions();
  const { data: profile } = useProfile();
  const hasUnread = notifs.some((n) => n.unread);

  const links: { id: TopNavActive; label: string; href: NavKey }[] = [
    { id: "home", label: "홈", href: "dash" },
    { id: "resume", label: "이력서", href: "resume" },
    { id: "report", label: "리포트", href: "reportList" },
  ];

  return (
    <header
      style={{
        height: 60,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          height: "100%",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          gap: 28,
        }}
      >
        <button className="linkbtn" onClick={() => nav("dash")}>
          <Wordmark size={19} />
        </button>
        <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {links.map((l) => (
            <button
              key={l.id}
              className="linkbtn navlink"
              onClick={() => nav(l.href)}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                padding: "4px 0",
                color: active === l.id ? "var(--fg-strong)" : "var(--fg-secondary)",
              }}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <IconButton
              ariaLabel="알림"
              notification={hasUnread}
              onClick={() => setNotifOpen((o) => !o)}
            >
              <Icon name="bell" size={20} />
            </IconButton>
            {notifOpen && (
              <Fragment>
                <div
                  onClick={() => setNotifOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <NotificationPanel
                  items={notifs}
                  onSelect={(n) => {
                    markRead(n.key);
                    setNotifOpen(false);
                    navigate(n.href);
                  }}
                  onMarkAllRead={markAllRead}
                  onClear={clear}
                />
              </Fragment>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button
              className="linkbtn profile-chip"
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "4px 10px 4px 5px",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Avatar initials={profile?.initials ?? ""} size={28} />
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--fg-strong)",
                }}
              >
                {profile?.name ?? ""}
              </span>
              <Icon
                name={menuOpen ? "chevron-up" : "chevron-down"}
                size={16}
                style={{ color: "var(--fg-tertiary)" }}
              />
            </button>
            {menuOpen && (
              <Fragment>
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: 260,
                    zIndex: 41,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-16)",
                    boxShadow: "var(--shadow-pop)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "16px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <Avatar initials={profile?.initials ?? ""} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: 15,
                          fontWeight: 700,
                          color: "var(--fg-strong)",
                        }}
                      >
                        {profile?.name ?? ""}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: "var(--fg-tertiary)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {profile?.email ?? ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "6px" }}>
                    <button
                      className="linkbtn menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        nav("mypage");
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-8)",
                        fontFamily: "var(--font-sans)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--fg-default)",
                      }}
                    >
                      <Icon name="user-round" size={18} style={{ color: "var(--fg-secondary)" }} />{" "}
                      마이페이지
                    </button>
                  </div>
                  <div style={{ padding: "6px", borderTop: "1px solid var(--border-subtle)" }}>
                    <button
                      className="linkbtn menu-item menu-item--danger"
                      // 메뉴를 닫지 않는다 — 진행 문구·비활성 상태가 보여야 하고,
                      // 완료 시 랜딩 이동이 어차피 이 화면을 벗어난다
                      onClick={() => logout.mutate()}
                      disabled={logout.isPending}
                      aria-busy={logout.isPending}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-8)",
                        fontFamily: "var(--font-sans)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--red-700)",
                      }}
                    >
                      <Icon name="log-out" size={18} />{" "}
                      {logout.isPending ? "로그아웃 중…" : "로그아웃"}
                    </button>
                  </div>
                </div>
              </Fragment>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
