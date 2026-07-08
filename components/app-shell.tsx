import { Link, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav-items";
import { QuickEntryLauncher } from "@/components/quick-entry/quick-entry-launcher";

export function AppShell({
  children,
  activePath,
  displayName,
}: {
  children: ReactNode;
  activePath: string;
  displayName: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.navigate({ to: "/giris" });
  }

  return (
    <div className="min-h-dvh bg-fkm-bg">
      {/* Ambient cockpit glow, purely decorative — bespoke generated plate */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-cover bg-top opacity-60 mix-blend-screen"
        style={{ backgroundImage: "url(/assets/ambient-glow.png)" }}
      />

      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-fkm-border bg-fkm-panel/60 backdrop-blur-sm lg:flex">
          <SidebarContent
            activePath={activePath}
            displayName={displayName}
            onLogout={handleLogout}
          />
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-fkm-border bg-fkm-bg/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <span className="fkm-display text-sm font-semibold tracking-tight text-fkm-text">
            Finans Kontrol Merkezi
          </span>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Menüyü aç"
            className="rounded-lg border border-fkm-border p-2 text-fkm-text"
          >
            <Menu className="size-5" />
          </button>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-fkm-border bg-fkm-panel">
              <div className="flex justify-end p-3">
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Menüyü kapat"
                  className="rounded-lg border border-fkm-border p-2 text-fkm-text"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarContent
                activePath={activePath}
                displayName={displayName}
                onLogout={handleLogout}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        <main className="min-h-dvh w-full flex-1 px-4 pt-20 pb-28 lg:px-8 lg:pt-8 lg:pb-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <QuickEntryLauncher />
    </div>
  );
}

function SidebarContent({
  activePath,
  displayName,
  onLogout,
  onNavigate,
}: {
  activePath: string;
  displayName: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-5 pt-6 pb-4">
        <p className="fkm-display text-base font-semibold tracking-tight text-fkm-text">
          Finans Kontrol Merkezi
        </p>
        <p className="mt-0.5 text-xs text-fkm-text-secondary">Hoş geldin, {displayName}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === "/" ? activePath === "/" : activePath.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-fkm-inset text-fkm-text"
                      : "text-fkm-text-secondary hover:bg-fkm-inset/60 hover:text-fkm-text"
                  }`}
                >
                  <Icon className={`size-4 shrink-0 ${isActive ? "text-fkm-accent" : ""}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-fkm-border p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fkm-text-secondary transition-colors hover:bg-fkm-inset/60 hover:text-fkm-text"
        >
          <LogOut className="size-4" />
          Çıkış yap
        </button>
      </div>
    </>
  );
}


