import type { CSSProperties } from "react";
import {
  ArrowLeft,
  AudioLines,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Info,
  Loader,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pencil,
  Play,
  Repeat2,
  RotateCw,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  VideoOff,
  type LucideIcon,
} from "lucide-react";

/* 사용 아이콘 레지스트리 — 프로토타입 Lucide CDN(kebab-case) 이름 유지.
   새 아이콘이 필요하면 여기에 추가 (전체 임포트 금지: 번들 크기) */
const ICONS: Record<string, LucideIcon> = {
  "arrow-left": ArrowLeft,
  "audio-lines": AudioLines,
  "bar-chart-3": BarChart3,
  bell: Bell,
  check: Check,
  "check-circle-2": CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "corner-down-right": CornerDownRight,
  "credit-card": CreditCard,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  "file-up": FileUp,
  info: Info,
  loader: Loader,
  lock: Lock,
  "log-out": LogOut,
  "message-circle": MessageCircle,
  mic: Mic,
  "more-horizontal": MoreHorizontal,
  pencil: Pencil,
  play: Play,
  "repeat-2": Repeat2,
  "rotate-cw": RotateCw,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  upload: Upload,
  "user-round": UserRound,
  "video-off": VideoOff,
};

/* ---------- Lucide 아이콘 (wanted-icons 대체 · 24그리드 2px 라인 currentColor) ---------- */
export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const Cmp = ICONS[name];
  if (!Cmp && import.meta.env.DEV) {
    console.warn(`[Icon] 등록되지 않은 아이콘: "${name}" — src/components/Icon.tsx의 ICONS에 추가하세요.`);
  }
  return (
    <span
      data-icon=""
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        color: "currentColor",
        flexShrink: 0,
        ...style,
      }}
    >
      {Cmp ? <Cmp size={size} strokeWidth={strokeWidth} /> : null}
    </span>
  );
}
