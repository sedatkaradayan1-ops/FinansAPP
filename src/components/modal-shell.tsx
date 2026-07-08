import type { ReactNode } from "react";
import { X } from "lucide-react";

export function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-fkm-border bg-fkm-panel p-6 lg:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="fkm-display text-base font-semibold text-fkm-text">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-fkm-text-secondary hover:bg-fkm-inset"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


