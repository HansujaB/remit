import {
  FileText,
  Image as ImageIcon,
  Play as Youtube,
  Camera as Instagram,
  Globe,
  Pencil,
} from "lucide-react";

const cx = (...values) => values.filter(Boolean).join(" ");

export function Logo({ small = false }) {
  return (
    <span className={cx("logo", small && "small")}>
      remit<span className="logo-dot">.</span>
      <svg viewBox="0 0 100 10" aria-hidden="true">
        <path d="M3 6Q37 0 97 5M11 9Q53 3 88 7" />
      </svg>
    </span>
  );
}

export function Scribble({ children, single = false }) {
  return (
    <span className="scribble">
      {children}
      <svg viewBox="0 0 240 15" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={
            single
              ? "M3 9 Q80 1 235 7"
              : "M3 9 Q80 1 235 7 M12 13 Q130 5 222 12"
          }
        />
      </svg>
    </span>
  );
}

export function SourceIcon({ platform, size = 14 }) {
  const Icon =
    platform === "Instagram"
      ? Instagram
      : platform === "YouTube"
        ? Youtube
        : platform === "PDF"
          ? FileText
          : platform === "Image"
            ? ImageIcon
            : platform === "Note"
              ? Pencil
              : Globe;
  return platform === "Pinterest" ? (
    <span className="source-letter">p</span>
  ) : platform === "X" ? (
    <span className="source-letter">𝕏</span>
  ) : (
    <Icon size={size} />
  );
}
