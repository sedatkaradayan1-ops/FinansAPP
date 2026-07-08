import { useEffect, useState } from "react";

// Instrument gauge — the recurring Tier-1 signature component (design-brief.md).
// A radial dial with a soft conic glow in the brand accent + a count-up
// number. Pure SSR-safe: renders instantly with the final value, then
// animates the sweep/count on mount only (no window access needed).

type GaugeProps = {
  value: number; // 0-100
  label: string;
  displayValue: string; // pre-formatted string shown in the center
  accent?: string;
  size?: number;
};

export function InstrumentGauge({ value, label, displayValue, accent = "#e8527c", size = 168 }: GaugeProps) {
  const [animated, setAnimated] = useState(0);
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(clamped);
      return;
    }
    let raf: number;
    const start = performance.now();
    const duration = 900;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(clamped * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const sweepFraction = 0.75; // 270-degree gauge
  const arcLength = circumference * sweepFraction;
  const offset = arcLength * (1 - animated / 100);
  const rotation = 135; // start angle so the gap sits at the bottom

  return (
    <div className="flex flex-col items-center gap-3" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--fkm-border)"
            strokeWidth={10}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth={10}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 6px ${accent}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="fkm-mono fkm-display text-2xl font-semibold tracking-tight text-fkm-text">
            {displayValue}
          </span>
        </div>
      </div>
      <span className="text-center text-xs font-medium uppercase tracking-wide text-fkm-text-secondary">
        {label}
      </span>
    </div>
  );
}

