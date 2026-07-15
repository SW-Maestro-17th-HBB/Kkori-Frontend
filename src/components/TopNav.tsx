/* ---------- 상단 네비게이션 (앱 셸) — 프로토타입 lib.jsx TopNav 이식 ---------- */
import { Fragment, useState } from "react";
import { useNotifications, useProfile } from "../api/hooks";
import type { NavKey } from "../routes";
import { useNav } from "../hooks/useNav";
import { Avatar, IconButton } from "./ds";
import { Icon } from "./Icon";
import { Wordmark } from "./primitives";

export type TopNavActive = "home" | "resume" | "report" | null;

export function TopNav({ active }: { active: TopNavActive }) {
  const nav = useNav();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: notifs = [] } = useNotifications();
  const { data: profile } = useProfile();
  const hasUnread = notifs.some((n) => n.unread);

  const links: { id: TopNavActive; label: string; href: NavKey }[] = [
    { id: "home", label: "홈", href: "dash" },
    { id: "resume", label: "이력서", href: "resume" },
    { id: "report", label: "리포트", href: "reportList" },
  ];

  return (
    <header style={{ height: 60, background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", height: "100%", padding: "0 28px", display: "flex", alignItems: "center", gap: 28 }}>
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
            <IconButton ariaLabel="알림" notification={hasUnread} onClick={() => setNotifOpen((o) => !o)}>
              <Icon name="bell" size={20} />
            </IconButton>
            {notifOpen && (
              <Fragment>
                <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
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
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--fg-strong)" }}>알림</span>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--blue-800)", cursor: "pointer" }}>
                      모두 읽음
                    </span>
                  </div>
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {notifs.map((n, i) => {
                      const toneColor =
                        n.tone === "done" ? "var(--green-600)" : n.tone === "ing" ? "var(--blue-800)" : "var(--fg-secondary)";
                      const toneBg =
                        n.tone === "done" ? "var(--bg-success-subtle)" : n.tone === "ing" ? "var(--bg-brand-subtle)" : "var(--bg-muted)";
                      return (
                        <button
                          key={n.id}
                          className="linkbtn notif-row"
                          onClick={() => {
                            setNotifOpen(false);
                            nav(n.to);
                          }}
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
                              background: toneBg,
                              color: toneColor,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon name={n.icon} size={17} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                            <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--fg-strong)", lineHeight: 1.4 }}>
                              {n.title}
                            </span>
                            <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, color: "var(--fg-secondary)", marginTop: 3 }}>
                              {n.desc}
                            </span>
                            <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 500, color: "var(--fg-tertiary)", marginTop: 5 }}>
                              {n.time}
                            </span>
                          </span>
                          {n.unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--blue-800)", flexShrink: 0, marginTop: 6 }} />}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="linkbtn notif-foot"
                    onClick={() => setNotifOpen(false)}
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
                    모든 알림 보기
                  </button>
                </div>
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
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--fg-strong)" }}>
                {profile?.name ?? ""}
              </span>
              <Icon name={menuOpen ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--fg-tertiary)" }} />
            </button>
            {menuOpen && (
              <Fragment>
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
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
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <Avatar initials={profile?.initials ?? ""} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--fg-strong)" }}>
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
                      <Icon name="user-round" size={18} style={{ color: "var(--fg-secondary)" }} /> 마이페이지
                    </button>
                  </div>
                  <div style={{ padding: "6px", borderTop: "1px solid var(--border-subtle)" }}>
                    <button
                      className="linkbtn menu-item menu-item--danger"
                      onClick={() => {
                        setMenuOpen(false);
                        nav("landing");
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
                        color: "var(--red-700)",
                      }}
                    >
                      <Icon name="log-out" size={18} /> 로그아웃
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
