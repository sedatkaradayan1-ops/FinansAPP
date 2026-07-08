import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-fkm-border bg-fkm-panel/80 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="fkm-display text-sm font-semibold tracking-wide text-fkm-text-secondary uppercase">
        {title}
      </h2>
      {action}
    </div>
  );
}

