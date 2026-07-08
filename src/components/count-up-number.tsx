import { useEffect, useRef, useState } from "react";

// Animated count-up for headline financial figures. SSR-safe: renders the
// final formatted value immediately, then counts up client-side only.
export function CountUpNumber({
  value,
  format,
  durationMs = 800,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const startValue = first.current ? 0 : display;
    first.current = false;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startValue + (value - startValue) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <>{format(display)}</>;
}

