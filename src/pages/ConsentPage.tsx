/* ============================ 약관 동의 (/signup) ============================
   카카오 인증 직후 신규(isNewUser)·복구(isRestored) 유저의 가입 완료 화면.
   (명세: docs/requirements/user/auth.md §약관 동의·회원가입)

   - 동의 항목·필수 여부·버전은 서버 카탈로그(GET /api/v1/consents)가 원천,
     제목·본문은 버전별 불변 자산(consentCopy.ts)에서 버전으로 선택한다.
   - 제출은 카탈로그에서 받은 version 을 그대로 반향 — U005(개정) 시 체크를
     리셋하고 캐시 우회 재조회 후 재동의를 받는다.
   - 카탈로그가 계약과 다르면(타입 누락·중복·미지원 버전 등) 항목을 조용히
     걸러내지 않고 화면 전체를 오류로 처리한다 — 필수 약관이 빠진 채
     CTA 가 활성화되는 것을 막기 위함. */
import { useState } from "react";
import { Navigate } from "react-router";
import type { CatalogItem, ConsentItem, ConsentType } from "../api/client";
import { ERROR_CODES } from "../api/errorCodes";
import { useConsentCatalog, useSignup } from "../api/hooks";
import { isApiError } from "../api/request";
import { clearSignupSession, getSignupSession, setTokens } from "../api/tokenStore";
import { Badge, Button } from "../components/ds";
import { Icon } from "../components/Icon";
import { Checkbox, Display, Wordmark } from "../components/primitives";
import { useNav } from "../hooks/useNav";
import { ROUTES } from "../routes";
import { CONSENT_COPY, CONSENT_ORDER } from "./consentCopy";

const ALL_UNCHECKED: Record<ConsentType, boolean> = {
  privacy: false,
  audio_usage: false,
  resume_usage: false,
  marketing: false,
};

interface ValidItem {
  type: ConsentType;
  required: boolean;
  version: number;
}

type CatalogCheck =
  { ok: true; items: ValidItem[] } | { ok: false; reason: "malformed" | "unsupported-version" };

/** 카탈로그 정제 — 스키마 필드가 전부 optional 이라 런타임 검증이 필요하다.
    타입 4종이 정확히 한 번씩(미지·중복·누락 차단) + required boolean +
    version 양의 정수 + 해당 버전 문안 자산 존재까지 확인하고,
    하나라도 어긋나면 전체를 오류로 반환한다(부분 필터링 금지).
    입력은 unknown — 비배열·null 항목 같은 형태 위반이 렌더 크래시가 아니라
    오류 블록으로 흡수되도록 배열·객체 여부부터 검증한다. */
function validateCatalog(consents: unknown): CatalogCheck {
  if (!Array.isArray(consents)) return { ok: false, reason: "malformed" };
  const seen = new Set<ConsentType>();
  const items: ValidItem[] = [];
  for (const value of consents) {
    if (typeof value !== "object" || value === null) {
      return { ok: false, reason: "malformed" };
    }
    const c = value as CatalogItem;
    if (
      c.type === undefined ||
      !(c.type in CONSENT_COPY) ||
      seen.has(c.type) ||
      typeof c.required !== "boolean" ||
      typeof c.version !== "number" ||
      !Number.isInteger(c.version) ||
      c.version < 1
    ) {
      return { ok: false, reason: "malformed" };
    }
    seen.add(c.type);
    items.push({ type: c.type, required: c.required, version: c.version });
  }
  if (items.length !== CONSENT_ORDER.length || !CONSENT_ORDER.every((t) => seen.has(t))) {
    return { ok: false, reason: "malformed" };
  }
  if (items.some((c) => CONSENT_COPY[c.type][c.version] === undefined)) {
    return { ok: false, reason: "unsupported-version" };
  }
  return {
    ok: true,
    items: [...items].sort((a, b) => CONSENT_ORDER.indexOf(a.type) - CONSENT_ORDER.indexOf(b.type)),
  };
}

function submitErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    switch (e.code) {
      case ERROR_CODES.INVALID_SIGNUP_TOKEN:
        return "가입 유효 시간이 지났어요. 처음부터 다시 로그인해 주세요.";
      case ERROR_CODES.ALREADY_REGISTERED:
        return "이미 가입된 계정이에요. 로그인해서 이용해 주세요.";
      case ERROR_CODES.CONSENT_VERSION_MISMATCH:
        return "약관이 개정되었어요. 변경된 약관을 다시 확인한 뒤 동의해 주세요.";
      case ERROR_CODES.MISSING_REQUIRED_CONSENT:
        return "필수 항목에 모두 동의해야 가입할 수 있어요.";
    }
    // 기타 백엔드 비즈니스 코드는 서버 메시지를 그대로, FE 합성 코드는 일반 안내로
    if (!e.code.startsWith("FE_")) return e.message;
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function ConsentPage() {
  const nav = useNav();
  // 가입 세션은 마운트 시 1회만 캡처 — 성공 시 clearSignupSession() 후에도
  // 렌더가 안정적이어야 대시보드 이동 전에 /login 으로 튕기지 않는다
  const [session] = useState(() => getSignupSession());
  const catalog = useConsentCatalog(session !== null);
  const signup = useSignup();
  // 사전 체크된 동의는 명시적 opt-in 이 아니므로 전부 해제 상태로 시작
  const [checks, setChecks] = useState<Record<ConsentType, boolean>>(ALL_UNCHECKED);
  const [open, setOpen] = useState<ConsentType | null>("privacy");

  if (!session) return <Navigate to={ROUTES.auth} replace />;

  const check = validateCatalog(catalog.data?.consents);
  const items = check.ok ? check.items : [];
  const allOn = items.length > 0 && items.every((c) => checks[c.type]);
  const reqOn = check.ok && items.filter((c) => c.required).every((c) => checks[c.type]);

  const submitError = signup.error;
  const terminal =
    isApiError(submitError) &&
    (submitError.code === ERROR_CODES.INVALID_SIGNUP_TOKEN ||
      submitError.code === ERROR_CODES.ALREADY_REGISTERED);

  // U005 재조회 완료 전 구버전 재제출 차단 — 조회 중에는 입력·제출 전부 잠근다
  const locked = catalog.isFetching;

  const toggle = (t: ConsentType) => setChecks((c) => ({ ...c, [t]: !c[t] }));
  const setAll = (v: boolean) =>
    setChecks({ privacy: v, audio_usage: v, resume_usage: v, marketing: v });

  const handleSubmit = () => {
    if (!reqOn || signup.isPending || locked) return;
    const consents: ConsentItem[] = items.map(
      (c) =>
        checks[c.type]
          ? { type: c.type, agreed: true, version: c.version } // version 은 agreed 항목만 (계약)
          : { type: c.type, agreed: false }, // 노출·거부 증적 — 명시적 false, version 없음
    );
    signup.mutate(
      { signupToken: session.signupToken, consents },
      {
        onSuccess: (data) => {
          if (!data.accessToken || !data.refreshToken) {
            // 계약 위반 — 서버는 이미 signupToken 을 소비했으므로 세션은 죽은 상태
            clearSignupSession();
            nav("auth", { replace: true });
            return;
          }
          setTokens(data.accessToken, data.refreshToken); // 1. 로그인 세션 확보가 먼저
          clearSignupSession(); // 2. 그 다음 임시 토큰 폐기
          nav("dash", { replace: true }); // 3. replace — 뒤로가기로 죽은 동의화면 복귀 방지
        },
        onError: (e) => {
          if (!isApiError(e)) return;
          if (
            e.code === ERROR_CODES.INVALID_SIGNUP_TOKEN ||
            e.code === ERROR_CODES.ALREADY_REGISTERED
          ) {
            clearSignupSession(); // 더 쓸 수 없는 토큰
          }
          if (e.code === ERROR_CODES.CONSENT_VERSION_MISMATCH) {
            setChecks(ALL_UNCHECKED); // 개정 문서 재확인 강제
            void catalog.refetch(); // no-store 재조회 — 완료까지 locked 로 제출 차단
          }
        },
      },
    );
  };

  const restored = session.isRestored;
  const stepLabel = restored ? "계정 복구 · 2 / 2 단계" : "회원가입 · 2 / 2 단계";
  const heading = restored ? "다시 만나서 반가워요" : "약관에 동의하고 시작하세요";
  const subtitle = restored
    ? "탈퇴 유예 기간 중인 계정이에요. 약관에 다시 동의하면 계정과 데이터가 복구돼요."
    : "처음 오셨네요. 안전한 이용을 위해 아래 약관을 확인하고 동의해 주세요.";
  const ctaLabel = signup.isPending
    ? "가입하는 중…"
    : restored
      ? "동의하고 계정 복구하기"
      : "동의하고 시작하기";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-canvas)" }}>
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <Wordmark />
      </div>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 24px 72px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge variant="brand">
            <Icon name="check" size={13} strokeWidth={2.5} /> Kakao 계정 연결됨
          </Badge>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--fg-tertiary)",
            }}
          >
            {stepLabel}
          </span>
        </div>

        {catalog.isError ? (
          <ErrorBlock
            heading="약관을 불러오지 못했어요"
            message={
              isApiError(catalog.error) && !catalog.error.code.startsWith("FE_")
                ? catalog.error.message
                : "약관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            }
            actionLabel="다시 시도"
            onAction={() => void catalog.refetch()}
          />
        ) : catalog.isPending ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
              padding: "72px 0",
            }}
          >
            <span
              className="status-spin"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "3px solid var(--blue-100)",
                borderTopColor: "var(--blue-800)",
                display: "inline-block",
              }}
            />
            <p
              role="status"
              aria-live="polite"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--fg-secondary)",
                margin: 0,
              }}
            >
              약관을 불러오는 중이에요…
            </p>
          </div>
        ) : !check.ok ? (
          check.reason === "unsupported-version" ? (
            <ErrorBlock
              heading="지원하지 않는 약관 버전이에요"
              message="새 약관이 적용되었어요. 화면을 새로고침해 주세요."
              actionLabel="새로고침"
              onAction={() => window.location.reload()}
            />
          ) : (
            <ErrorBlock
              heading="약관을 불러오지 못했어요"
              message="약관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
              actionLabel="다시 시도"
              onAction={() => void catalog.refetch()}
            />
          )
        ) : terminal ? (
          <ErrorBlock
            heading="가입을 진행할 수 없어요"
            message={submitErrorMessage(submitError)}
            actionLabel="다시 로그인하기"
            onAction={() => nav("auth", { replace: true })}
          />
        ) : (
          <>
            <Display size={30} tracking={-0.024} as="h1" style={{ marginTop: 20 }}>
              {heading}
            </Display>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 16,
                fontWeight: 500,
                lineHeight: 1.55,
                color: "var(--fg-secondary)",
                marginTop: 10,
              }}
            >
              {subtitle}
            </p>

            <button
              onClick={() => setAll(!allOn)}
              disabled={locked}
              aria-pressed={allOn}
              className="linkbtn consent-all"
            >
              <Checkbox on={allOn} big />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--fg-strong)",
                  }}
                >
                  약관 전체 동의
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
                  필수 및 선택 항목을 모두 포함해요
                </div>
              </div>
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {items.map((c) => {
                const copy = CONSENT_COPY[c.type][c.version];
                return (
                  <div
                    key={c.type}
                    style={{
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-12)",
                      background: "var(--bg-surface)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 16px",
                      }}
                    >
                      <button
                        className="linkbtn"
                        onClick={() => toggle(c.type)}
                        disabled={locked}
                        aria-label={copy.title}
                        aria-pressed={checks[c.type]}
                      >
                        <Checkbox on={checks[c.type]} />
                      </button>
                      <span
                        style={{
                          flex: 1,
                          fontFamily: "var(--font-sans)",
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--fg-strong)",
                        }}
                      >
                        {copy.title}
                      </span>
                      <Badge variant={c.required ? "brand" : "neutral"}>
                        {c.required ? "필수" : "선택"}
                      </Badge>
                      <button
                        className="linkbtn"
                        onClick={() => setOpen(open === c.type ? null : c.type)}
                        aria-label={`${copy.title} 내용 보기`}
                        aria-expanded={open === c.type}
                        style={{ color: "var(--fg-tertiary)" }}
                      >
                        <Icon name={open === c.type ? "chevron-up" : "chevron-down"} size={18} />
                      </button>
                    </div>
                    {open === c.type && (
                      <div
                        style={{
                          borderTop: "1px solid var(--border-subtle)",
                          background: "var(--bg-subtle)",
                          padding: "14px 16px",
                          fontFamily: "var(--font-sans)",
                          fontSize: 14,
                          fontWeight: 500,
                          lineHeight: 1.65,
                          color: "var(--fg-secondary)",
                          maxHeight: 140,
                          overflow: "auto",
                        }}
                      >
                        {copy.body}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 26 }}>
              <Button
                variant="solid"
                size="lg"
                fullWidth
                disabled={!reqOn || signup.isPending || locked}
                onClick={handleSubmit}
              >
                {ctaLabel}
              </Button>
              {signup.isError && !terminal && (
                <p
                  role="alert"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--red-700)",
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  {submitErrorMessage(submitError)}
                </p>
              )}
              {!reqOn && (
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--fg-tertiary)",
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  필수 항목에 모두 동의해야 시작할 수 있어요.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 카탈로그·가입 오류 공통 블록 — 폼 대신 표시되어 stale 데이터 제출을 차단한다 */
function ErrorBlock({
  heading,
  message,
  actionLabel,
  onAction,
}: {
  heading: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "72px 0",
        textAlign: "center",
      }}
    >
      <Display size={22} tracking={-0.02} as="h1">
        {heading}
      </Display>
      <p
        role="alert"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--fg-secondary)",
          margin: 0,
        }}
      >
        {message}
      </p>
      <Button variant="solid" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
