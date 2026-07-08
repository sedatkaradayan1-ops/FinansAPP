import { useEffect, useState } from "react";
import { Plus, X, Loader2, Check, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";

import { previewQuickEntry, commitQuickEntry } from "@/lib/api/quick-entry.functions";
import { listAccounts } from "@/lib/api/accounts.functions";
import type { Account } from "@/lib/finance";
import type { ParsedTransactionDraft } from "@/lib/quick-entry-parser";
import { formatTry } from "@/lib/format";

const TX_TYPE_LABEL: Record<string, string> = {
  income: "Gelir",
  expense: "Gider",
  transfer: "Transfer",
  investment_buy: "Yatırım Alımı",
  investment_sell: "Yatırım Satışı",
};

export function QuickEntryLauncher() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ParsedTransactionDraft | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open && accounts.length === 0) {
      listAccounts().then(setAccounts).catch(() => {});
    }
  }, [open, accounts.length]);

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const result = await previewQuickEntry({ data: { text } });
      setDraft(result);
      if (!accountId && accounts.length > 0) {
        const defaultAccount =
          accounts.find((a) => a.type === "bank") ?? accounts.find((a) => a.type === "cash") ?? accounts[0];
        setAccountId(defaultAccount?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!draft) return;
    setSaving(true);
    try {
      await commitQuickEntry({
        data: {
          type: draft.type,
          amount: draft.amount,
          merchant: draft.merchant,
          category: draft.category,
          needOrWant: draft.needOrWant,
          occurredOn: draft.occurredOn,
          accountId,
          rawInput: draft.rawInput,
          confidence: draft.confidence,
          assetKind: draft.assetKind,
          assetQuantity: draft.assetQuantity,
        },
      });
      setSavedFlash(true);
      setTimeout(() => {
        setSavedFlash(false);
        setOpen(false);
        setText("");
        setDraft(null);
      }, 900);
    } finally {
      setSaving(false);
    }
  }

  const TypeIcon =
    draft?.type === "income"
      ? ArrowDownRight
      : draft?.type === "expense"
        ? ArrowUpRight
        : ArrowLeftRight;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Hızlı işlem ekle"
        className="fixed right-5 bottom-6 z-30 flex items-center gap-2 rounded-full bg-fkm-accent px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_rgba(232,82,124,0.6)] transition-transform active:scale-95 lg:right-10 lg:bottom-10"
      >
        <Plus className="size-4" />
        Hızlı İşlem Ekle
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-fkm-border bg-fkm-panel p-6 lg:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="fkm-display text-base font-semibold text-fkm-text">Hızlı İşlem Ekle</h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="rounded-lg p-1.5 text-fkm-text-secondary hover:bg-fkm-inset"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleParse();
                }}
                placeholder="Örn. Migros 1450, Maaş yattı 72000, 1 gram altın aldım 6500"
                className="w-full flex-1 rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
              />
              <button
                onClick={handleParse}
                disabled={loading || !text.trim()}
                className="shrink-0 rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Ayrıştır"}
              </button>
            </div>

            {draft && (
              <div className="mt-5 rounded-2xl border border-fkm-border bg-fkm-inset p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TypeIcon
                      className={`size-4 ${
                        draft.type === "income" ? "text-fkm-positive" : "text-fkm-negative"
                      }`}
                    />
                    <span className="text-sm font-medium text-fkm-text">
                      {TX_TYPE_LABEL[draft.type]}
                    </span>
                  </div>
                  <span className="fkm-mono text-lg font-semibold text-fkm-text">
                    {formatTry(draft.amount)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-fkm-text-muted">Yer / Kaynak</p>
                    <p className="mt-0.5 text-sm text-fkm-text">{draft.merchant}</p>
                  </div>
                  <div>
                    <p className="text-fkm-text-muted">Kategori</p>
                    <p className="mt-0.5 text-sm text-fkm-text">{draft.category}</p>
                  </div>
                </div>

                {accounts.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-fkm-text-muted">Hesap</p>
                    <select
                      value={accountId ?? ""}
                      onChange={(e) => setAccountId(e.target.value || null)}
                      className="w-full rounded-lg border border-fkm-border bg-fkm-panel px-3 py-2 text-sm text-fkm-text"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {draft.needsConfirmation && (
                  <p className="mt-3 text-xs text-fkm-warning">
                    Emin olamadım, lütfen tutarı ve kategoriyi kontrol et.
                  </p>
                )}

                <button
                  onClick={handleConfirm}
                  disabled={saving || draft.amount <= 0}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-fkm-positive px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  {savedFlash ? (
                    <>
                      <Check className="size-4" /> Kaydedildi
                    </>
                  ) : saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Onayla ve Kaydet"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

