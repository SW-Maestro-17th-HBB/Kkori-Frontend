/* ============================ 마이페이지 (/account) ============================ */
import { Fragment, useRef, useState } from "react";
import { useProfile, useSubscription, useUpdateProfileName } from "../api/hooks";
import { errorMessage } from "../api/request";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Progress,
  Switch,
  Toast,
} from "../components/ds";
import { Icon } from "../components/Icon";
import { Display, SectionLabel } from "../components/primitives";
import { TopNav } from "../components/TopNav";
import { useNav } from "../hooks/useNav";

type TabId = "profile" | "billing" | "notif";
type NotifId = "report" | "analyze" | "weekly" | "marketing";

const NOTIF_LABELS: Record<NotifId, string> = {
  report: "리포트 완료 알림",
  analyze: "이력서 분석 완료 알림",
  weekly: "주간 리포트 요약",
  marketing: "마케팅 정보 수신",
};

export function MyPage({ tab }: { tab?: TabId }) {
  const nav = useNav();
  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
    error: profileErrorDetail,
    refetch: refetchProfile,
  } = useProfile();
  const { data: sub } = useSubscription();

  const [active, setActive] = useState<TabId>(tab ?? "profile");
  const [notif, setNotif] = useState<Record<NotifId, boolean>>({
    report: true,
    analyze: true,
    weekly: true,
    marketing: false,
  });
  const [toast, setToast] = useState<{ msg: string; tone: "default" | "success" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [delOpen, setDelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "" });
  const displayName = profile?.name ?? "";
  const updateName = useUpdateProfileName();
  const trimmedName = form.name.trim();
  // 코드 포인트 기준 1~100자 — 백엔드 계약(PATCH /api/v1/user)과 동일 기준으로 선검증
  const nameLength = [...trimmedName].length;
  const nameValid = nameLength >= 1 && nameLength <= 100;

  const showToast = (msg: string, tone: "default" | "success") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const today = new Date()
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, ".")
    .replace(/\.$/, "");

  const onToggle = (id: NotifId, v: boolean) => {
    setNotif((n) => ({ ...n, [id]: v }));
    if (id === "marketing") {
      showToast(
        v ? `${today} 마케팅 정보 수신에 동의했어요` : `${today} 마케팅 정보 수신을 해제했어요`,
        v ? "success" : "default",
      );
    } else {
      showToast(`${NOTIF_LABELS[id]} 알림을 ${v ? "켰어요" : "껐어요"}`, "default");
    }
  };

  const tabs: [TabId, string][] = [
    ["profile", "프로필"],
    ["billing", "구독·결제"],
    ["notif", "알림 설정"],
  ];

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <TopNav active={null} />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 40px 60px" }}>
        <SectionLabel>계정</SectionLabel>
        <Display size={32} tracking={-0.025} style={{ marginTop: 8, marginBottom: 24 }}>
          마이페이지
        </Display>

        {/* 프로필 요약 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "20px 22px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-16)",
            marginBottom: 20,
          }}
        >
          <Avatar initials={profile?.initials ?? ""} size={56} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 19,
                fontWeight: 700,
                color: "var(--fg-strong)",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13.5,
                fontWeight: 500,
                color: "var(--fg-tertiary)",
                marginTop: 4,
              }}
            >
              {profile?.email ?? ""}
            </div>
          </div>
          {profile?.kakaoLinked && (
            <Badge variant="brand">
              <Icon name="check" size={13} strokeWidth={2.5} /> 카카오 연결됨
            </Badge>
          )}
        </div>

        {/* 탭 */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: "1px solid var(--border-subtle)",
            marginBottom: 24,
          }}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className="linkbtn"
              onClick={() => setActive(id)}
              style={{
                padding: "12px 16px",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                color: active === id ? "var(--blue-800)" : "var(--fg-secondary)",
                borderBottom: active === id ? "2px solid var(--blue-800)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {active === "profile" && (
          <Card>
            <SectionLabel style={{ marginBottom: 4 }}>기본 정보</SectionLabel>
            {profilePending ? (
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--fg-tertiary)",
                  marginTop: 14,
                }}
              >
                프로필을 불러오는 중…
              </p>
            ) : profileError ? (
              <Fragment>
                <p
                  role="alert"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--fg-tertiary)",
                    marginTop: 14,
                  }}
                >
                  프로필을 불러오지 못했어요. {errorMessage(profileErrorDetail)}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Button variant="assistive" onClick={() => void refetchProfile()}>
                    다시 시도
                  </Button>
                </div>
              </Fragment>
            ) : !editing ? (
              <Fragment>
                <div style={{ marginTop: 8 }}>
                  {(
                    [
                      ["이름", displayName],
                      ["이메일", profile?.email ?? ""],
                      ["가입일", profile?.joinedAt ?? ""],
                    ] as [string, string][]
                  ).map(([k, v], i, a) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 0",
                        borderBottom: i < a.length - 1 ? "1px solid var(--border-subtle)" : "none",
                      }}
                    >
                      <span
                        style={{
                          width: 96,
                          flexShrink: 0,
                          fontFamily: "var(--font-sans)",
                          fontSize: 14,
                          fontWeight: 500,
                          color: "var(--fg-tertiary)",
                        }}
                      >
                        {k}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontFamily: "var(--font-sans)",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--fg-strong)",
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <Button
                    variant="assistive"
                    leadingIcon={<Icon name="pencil" size={15} />}
                    onClick={() => {
                      setForm({ name: displayName });
                      setEditing(true);
                    }}
                  >
                    프로필 수정
                  </Button>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--fg-secondary)",
                        marginBottom: 7,
                      }}
                    >
                      이름
                    </label>
                    <Input
                      value={form.name}
                      placeholder="이름을 입력하세요"
                      onChange={(e) => setForm({ name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontFamily: "var(--font-sans)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--fg-secondary)",
                        marginBottom: 7,
                      }}
                    >
                      이메일
                    </label>
                    <Input
                      value={profile?.email ?? ""}
                      disabled
                      trailingIcon={<Icon name="lock" size={16} />}
                    />
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--fg-tertiary)",
                        marginTop: 7,
                      }}
                    >
                      카카오 계정 이메일은 변경할 수 없어요.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
                  <Button
                    variant="solid"
                    disabled={!nameValid || updateName.isPending}
                    onClick={() =>
                      updateName.mutate(trimmedName, {
                        onSuccess: () => {
                          setEditing(false);
                          showToast("프로필을 저장했어요", "success");
                        },
                        onError: () =>
                          showToast(
                            "이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요",
                            "default",
                          ),
                      })
                    }
                  >
                    {updateName.isPending ? "저장 중…" : "저장하기"}
                  </Button>
                  <Button
                    variant="assistive"
                    disabled={updateName.isPending}
                    onClick={() => setEditing(false)}
                  >
                    취소
                  </Button>
                </div>
              </Fragment>
            )}
          </Card>
        )}

        {active === "profile" && (
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "16px 20px",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-12)",
              background: "var(--bg-surface)",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--fg-strong)",
                }}
              >
                회원 탈퇴
              </div>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--fg-secondary)",
                  marginTop: 4,
                }}
              >
                탈퇴 후 3일까지는 되살릴 수 있어요. 3일이 지나면 모든 데이터가 영구 삭제돼요.
              </div>
            </div>
            <button
              className="linkbtn"
              onClick={() => setDelOpen(true)}
              style={{
                flexShrink: 0,
                height: 40,
                padding: "0 16px",
                borderRadius: "var(--radius-btn-md)",
                border: "1px solid var(--red-600)",
                color: "var(--red-700)",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              회원 탈퇴
            </button>
          </div>
        )}

        {active === "billing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                background: "var(--bg-brand-subtle)",
                border: "1px solid transparent",
                borderRadius: "var(--radius-16)",
                padding: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <SectionLabel style={{ color: "var(--blue-800)" }}>현재 플랜</SectionLabel>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 26,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                        color: "var(--fg-strong)",
                      }}
                    >
                      무료 플랜
                    </span>
                    <Badge variant="brand">Free</Badge>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--fg-secondary)",
                      marginTop: 8,
                    }}
                  >
                    이번 달 실전 모의 면접{" "}
                    <b style={{ color: "var(--blue-800)", fontWeight: 700 }}>
                      {sub?.usedRealInterviews ?? 0} / {sub?.maxRealInterviews ?? 0}회
                    </b>{" "}
                    사용
                  </p>
                </div>
                <Button variant="solid" onClick={() => {}}>
                  Pro로 업그레이드
                </Button>
              </div>
              <div style={{ marginTop: 18 }}>
                <Progress
                  value={sub ? (sub.usedRealInterviews / sub.maxRealInterviews) * 100 : 0}
                />
              </div>
            </div>
            <Card>
              <SectionLabel style={{ marginBottom: 14 }}>결제 수단</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 28,
                    borderRadius: "var(--radius-4)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-subtle)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--fg-tertiary)",
                  }}
                >
                  <Icon name="credit-card" size={16} />
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--fg-secondary)",
                  }}
                >
                  등록된 결제 수단이 없어요
                </span>
                <Button variant="assistive" size="sm">
                  카드 등록
                </Button>
              </div>
            </Card>
            <Card>
              <SectionLabel style={{ marginBottom: 6 }}>결제 내역</SectionLabel>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--fg-tertiary)",
                  padding: "10px 0",
                  margin: 0,
                }}
              >
                아직 결제 내역이 없어요.
              </p>
            </Card>
          </div>
        )}

        {active === "notif" && (
          <Card>
            <SectionLabel style={{ marginBottom: 6 }}>알림 설정</SectionLabel>
            {(
              [
                ["report", "리포트 완료 알림", "면접이 끝나고 리포트가 준비되면 알려드려요"],
                ["analyze", "이력서 분석 완료 알림", "업로드한 이력서 분석이 끝나면 알려드려요"],
                ["weekly", "주간 리포트 요약", "매주 연습 통계를 이메일로 받아봐요"],
                ["marketing", "마케팅 정보 수신", "신규 기능·이벤트 소식을 받아봐요"],
              ] as [NotifId, string, string][]
            ).map(([id, t, d], i, a) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 0",
                  borderBottom: i < a.length - 1 ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--fg-strong)",
                    }}
                  >
                    {t}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-secondary)",
                      marginTop: 4,
                    }}
                  >
                    {d}
                  </div>
                </div>
                <Switch checked={notif[id]} onChange={(v) => onToggle(id, v)} />
              </div>
            ))}
          </Card>
        )}

        <Modal
          open={delOpen}
          onClose={() => setDelOpen(false)}
          title="정말 탈퇴하시겠어요?"
          actions={[
            <Button variant="assistive" fullWidth onClick={() => setDelOpen(false)}>
              취소
            </Button>,
            <button
              className="linkbtn"
              onClick={() => {
                setDelOpen(false);
                nav("landing");
              }}
              style={{
                width: "100%",
                height: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-12)",
                background: "var(--red-600)",
                color: "#fff",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              탈퇴하기
            </button>,
          ]}
        >
          <span style={{ color: "var(--fg-secondary)" }}>
            탈퇴 후 <b style={{ color: "var(--fg-strong)", fontWeight: 700 }}>3일 이내</b>에 다시
            로그인하면 이력서·리포트·개인정보를 그대로 되살릴 수 있어요. 3일이 지나면 모든 데이터가
            영구 삭제되며 복구할 수 없어요.
          </span>
        </Modal>

        {toast && (
          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: 32,
              transform: "translateX(-50%)",
              zIndex: 1100,
              animation: "hbb-toast-in 200ms ease",
            }}
          >
            <Toast
              tone={toast.tone}
              icon={<Icon name={toast.tone === "success" ? "check-circle-2" : "info"} size={18} />}
            >
              {toast.msg}
            </Toast>
          </div>
        )}
      </div>
    </div>
  );
}
