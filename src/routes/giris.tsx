import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/giris")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Giriş — Finans Kontrol Merkezi" }] }),
});

function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"checking" | "login" | "register">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/register-status")
      .then((r) => r.json())
      .then((json: { hasUser: boolean }) => setMode(json.hasUser ? "login" : "register"))
      .catch(() => setMode("login"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "register") {
      if (password.length < 6) {
        setError("Şifre en az 6 karakter olmalı.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Şifreler eşleşmiyor.");
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { displayName, password } : { password },
        ),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json.error === "WRONG_PASSWORD"
            ? "Şifre yanlış."
            : json.error === "ALREADY_REGISTERED"
              ? "Bu uygulama zaten kurulmuş. Giriş yapmayı dene."
              : json.error === "NO_ACCOUNT"
                ? "Hesap bulunamadı."
                : "Bir şeyler ters gitti. Tekrar dene.",
        );
        setLoading(false);
        return;
      }
      router.navigate({ to: "/" });
      router.invalidate();
    } catch {
      setError("Bağlantı hatası. Tekrar dene.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-fkm-bg px-4">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(700px circle at 50% 0%, color-mix(in oklab, var(--fkm-accent) 16%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-fkm-border bg-fkm-panel p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-fkm-accent/15">
            <Lock className="size-5 text-fkm-accent" />
          </div>
          <h1 className="fkm-display text-xl font-semibold tracking-tight text-fkm-text">
            Finans Kontrol Merkezi
          </h1>
          <p className="mt-1 text-sm text-fkm-text-secondary">
            {mode === "register"
              ? "Kişisel finans işletim sistemini kur"
              : "Devam etmek için giriş yap"}
          </p>
        </div>

        {mode === "checking" ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-fkm-text-secondary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "register" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">
                  Adın
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Örn. Ahmet"
                  className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
                  required
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
                required
              />
            </div>
            {mode === "register" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">
                  Şifre (tekrar)
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-fkm-negative">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "register" ? (
                "Kurulumu Tamamla"
              ) : (
                "Giriş Yap"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

