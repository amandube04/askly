import { cn } from "~/lib/utils";

interface AsklyLogoProps {
  className?: string;
  compact?: boolean;
  /**
   * If true, the animated pulse ring is omitted (useful inside dense product chrome
   * where the breathing motion would be a distraction).
   */
  static?: boolean;
}

export function AsklyLogo({
  className,
  compact = false,
  static: isStatic = false,
}: AsklyLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AsklyLogoMark isStatic={isStatic} />
      {!compact ? (
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.22em] text-stone-300/65">
            Askly
          </p>
          <p className="text-sm font-semibold tracking-tight text-stone-50">
            Form Stack
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface AsklyLogoMarkProps {
  isStatic?: boolean;
  className?: string;
  size?: number;
}

export function AsklyLogoMark({
  isStatic = false,
  className,
  size = 32,
}: AsklyLogoMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-lg border border-stone-300/25 bg-stone-100/4 text-amber-100",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        width={size * 0.72}
        height={size * 0.72}
        fill="none"
        className="overflow-visible"
      >
        <defs>
          <radialGradient id="askly-logo-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF6DC" />
            <stop offset="60%" stopColor="#F5D78A" />
            <stop offset="100%" stopColor="#C99A4A" />
          </radialGradient>
        </defs>

        {/* Outer static ring (faintest) */}
        <circle
          cx="16"
          cy="16"
          r="13.5"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.18"
        />

        {/* Mid static ring */}
        <circle
          cx="16"
          cy="16"
          r="9.5"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.42"
        />

        {/* Inner static ring */}
        <circle
          cx="16"
          cy="16"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.72"
        />

        {/* Animated outward pulse — emanates from center, fades out */}
        {!isStatic ? (
          <circle
            cx="16"
            cy="16"
            r="6"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            className="askly-logo-pulse"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ) : null}

        {/* Diagonal accent — suggests "asking outward" / signal direction */}
        <line
          x1="16"
          y1="16"
          x2="24.5"
          y2="7.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Endpoint dot — the question lands somewhere */}
        <circle cx="24.5" cy="7.5" r="1.4" fill="currentColor" opacity="0.85" />

        {/* Center filled core — the source */}
        <circle cx="16" cy="16" r="2.4" fill="url(#askly-logo-core)" />
      </svg>
    </span>
  );
}
