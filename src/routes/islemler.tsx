import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Trash2, Pencil } from "lucide-react";

import { requireAuthLoader } from "@/lib/require-auth";
import { AppShell } from "@/components/app-shell";
import { GlassPanel } from "@/components/glass-panel";
import { ModalShell } from "@/components/modal-shell";
import {
  listTransactions,
  deleteTransaction,
  recategorizeTransaction,
} from "@/lib/api/transactions.functions";
import type { Transaction } from "@/lib/finance";
import { formatTry, formatDateTr } from "@/lib/format";

export const Route = createFileRoute("/islemler")({
  beforeLoad: requireAuthLoader,
  loader: async () => ({ transactions: await listTransactions({ data: { limit: 200 } }) }),
  component: TransactionsPage,
  head: () => ({ meta: [{ title: "İşlemler — Finans Kontrol Merkezi" }] }),
});

const TYPE_META: Record<
  string,
  { label: string; icon: typeof ArrowUpRight; color: string }
> = {
  income: { label: "Gelir", icon: ArrowDownRight, color: "text-fkm-positive" },
  expense: { label: "Gider", icon: ArrowUpRight, color: "text-fkm-negative" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, color: "text-fkm-text-secondary" },
  investment_buy: { label: "Yatırım Alımı", icon: ArrowUpRight, color: "text-fkm-gold" },
  investment_sell: { label: "Yatırım Satışı", icon: ArrowDownRight, color: "text-fkm-gold" },
};

function TransactionsPage() {
  const { user } = Route.useRouteContext();
  const { transactions } = Route.useLoaderData() as { transactions: Transaction[] };
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [editing, setEditing] = useState<Transaction | null>(null);

  function refresh() {
    router.invalidate();
  }

  const filtered = transactions.filter((t) => {
    if (filter === "all") return true;
    return t.type === filter;
  });

  const grouped = groupByDate(filtered);

  return (
    <AppShell activePath="/islemler" displayName={user.displayName}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="fkm-display text-2xl font-semibold tracking-tight text-fkm-text">İşlemler</h1>
          <p className="mt-1 text-sm text-fkm-text-secondary">
            Tüm gelir, gider ve yatırım hareketlerin tek listede.
          </p>
        </div>

        <div className="flex gap-2">
          {[
            { value: "all", label: "Tümü" },
            { value: "income", label: "Gelirler" },
            { value: "expense", label: "Giderler" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value as any)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "border-fkm-accent bg-fkm-accent/15 text-fkm-accent"
                  : "border-fkm-border text-fkm-text-secondary hover:bg-fkm-inset"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5">
          {Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fkm-text-muted">
                {formatDateTr(date)}
              </p>
              <div className="flex flex-col gap-2">
                {txs.map((tx) => {
                  const meta = TYPE_META[tx.type];
                  const Icon = meta.icon;
                  return (
                    <GlassPanel key={tx.id} className="flex items-center justify-between !p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-fkm-inset">
                          <Icon className={`size-4 ${meta.color}`} />
                        </div>
                        <div>
                          <p className="text-sm text-fkm-text">{tx.merchant ?? meta.label}</p>
                          <p className="text-xs text-fkm-text-muted">
                            {tx.category} · {tx.needOrWant === "need" ? "İhtiyaç" : "İstek"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`fkm-mono text-sm font-semibold ${meta.color}`}>
                          {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                          {formatTry(tx.amount)}
                        </span>
                        <button
                          onClick={() => setEditing(tx)}
                          className="rounded-lg p-1.5 text-fkm-text-muted hover:bg-fkm-inset hover:text-fkm-text"
                          aria-label="Kategoriyi düzenle"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await deleteTransaction({ data: { id: tx.id } });
                            refresh();
                          }}
                          className="rounded-lg p-1.5 text-fkm-text-muted hover:bg-fkm-inset hover:text-fkm-negative"
                          aria-label="Sil"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <GlassPanel className="flex flex-col items-center gap-3 py-10 text-center">
              <img src="/assets/empty-wallet.png" alt="" className="size-24 opacity-80" />
              <p className="text-sm text-fkm-text-secondary">
                Henüz işlem yok. Sağ alttaki "Hızlı İşlem Ekle" ile başlayabilirsin.
              </p>
            </GlassPanel>
          )}
        </div>
      </div>

      {editing && (
        <RecategorizeModal
          tx={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  for (const t of transactions) {
    if (!groups[t.occurredOn]) groups[t.occurredOn] = [];
    groups[t.occurredOn].push(t);
  }
  return groups;
}

function RecategorizeModal({
  tx,
  onClose,
  onSaved,
}: {
  tx: Transaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(tx.category);
  const [needOrWant, setNeedOrWant] = useState<"need" | "want">(tx.needOrWant);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await recategorizeTransaction({
      data: { id: tx.id, category, needOrWant, rememberForMerchant: true },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title="Kategoriyi Düzenle" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Kategori</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Tür</label>
          <select
            value={needOrWant}
            onChange={(e) => setNeedOrWant(e.target.value as "need" | "want")}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          >
            <option value="need">İhtiyaç</option>
            <option value="want">İstek</option>
          </select>
        </div>
        <p className="text-xs text-fkm-text-muted">
          Bu değişiklik "{tx.merchant}" için hatırlanacak ve sonraki işlemlerde otomatik uygulanacak.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-1 w-full rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Kaydet ve Hatırla
        </button>
      </div>
    </ModalShell>
  );
}


