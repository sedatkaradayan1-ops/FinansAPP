import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Target } from "lucide-react";

import { requireAuthLoader } from "@/lib/require-auth";
import { AppShell } from "@/components/app-shell";
import { GlassPanel } from "@/components/glass-panel";
import { ModalShell } from "@/components/modal-shell";
import { listGoals, createGoal, contributeToGoal, deleteGoal } from "@/lib/api/planning.functions";
import type { Goal } from "@/lib/finance";
import { formatTry, formatDateTr } from "@/lib/format";

export const Route = createFileRoute("/hedefler")({
  beforeLoad: requireAuthLoader,
  loader: async () => ({ goals: await listGoals() }),
  component: GoalsPage,
  head: () => ({ meta: [{ title: "Birikim Hedefleri — Finans Kontrol Merkezi" }] }),
});

const COLOR_OPTIONS = ["#4fae8a", "#e8527c", "#c9a227", "#d9a441", "#6b8ce8"];

function GoalsPage() {
  const { user } = Route.useRouteContext();
  const { goals } = Route.useLoaderData() as { goals: Goal[] };
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [contributingTo, setContributingTo] = useState<Goal | null>(null);

  function refresh() {
    router.invalidate();
  }

  return (
    <AppShell activePath="/hedefler" displayName={user.displayName}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="fkm-display text-2xl font-semibold tracking-tight text-fkm-text">
              Birikim Hedefleri
            </h1>
            <p className="mt-1 text-sm text-fkm-text-secondary">
              Hedeflerine ne kadar yaklaştığını takip et.
            </p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-full bg-fkm-accent px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            <Plus className="size-4" />
            Hedef Ekle
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const pct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
            return (
              <GlassPanel key={goal.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${goal.color}22` }}
                    >
                      <Target className="size-4" style={{ color: goal.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-fkm-text">{goal.name}</p>
                      {goal.targetDate && (
                        <p className="text-xs text-fkm-text-muted">{formatDateTr(goal.targetDate)}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteGoal({ data: { id: goal.id } });
                      refresh();
                    }}
                    className="rounded-lg p-1 text-fkm-text-muted hover:bg-fkm-inset hover:text-fkm-negative"
                    aria-label="Sil"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="fkm-mono text-fkm-text-secondary">
                    {formatTry(goal.currentAmount)} / {formatTry(goal.targetAmount)}
                  </span>
                  <span className="fkm-mono text-fkm-text-secondary">%{Math.round(pct)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-fkm-inset">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: goal.color }}
                  />
                </div>
                <button
                  onClick={() => setContributingTo(goal)}
                  className="mt-4 w-full rounded-xl border border-fkm-border py-2 text-xs font-medium text-fkm-text transition-colors hover:bg-fkm-inset"
                >
                  Hedefe Ekle
                </button>
              </GlassPanel>
            );
          })}
          {goals.length === 0 && (
            <GlassPanel className="col-span-full text-center">
              <p className="text-sm text-fkm-text-secondary">Henüz bir birikim hedefi eklemedin.</p>
            </GlassPanel>
          )}
        </div>
      </div>

      {formOpen && (
        <GoalFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}
      {contributingTo && (
        <ContributeModal
          goal={contributingTo}
          onClose={() => setContributingTo(null)}
          onSaved={() => {
            setContributingTo(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function GoalFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !targetAmount) return;
    setSaving(true);
    await createGoal({
      data: {
        name: name.trim(),
        targetAmount: parseFloat(targetAmount),
        targetDate: targetDate || null,
        color,
      },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title="Yeni Hedef" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Hedef Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Tatil Fonu"
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">
            Hedef Tutar (TL)
          </label>
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">
            Hedef Tarihi (opsiyonel)
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="size-8 rounded-full border-2"
              style={{ backgroundColor: c, borderColor: color === c ? "#f4f2f7" : "transparent" }}
              aria-label={`Renk ${c}`}
            />
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !targetAmount}
          className="mt-1 w-full rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Hedefi Kaydet
        </button>
      </div>
    </ModalShell>
  );
}

function ContributeModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!amount) return;
    setSaving(true);
    await contributeToGoal({ data: { id: goal.id, amount: parseFloat(amount) } });
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title={`${goal.name} — Ekleme Yap`} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Tutar (TL)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
      />
      <button
        onClick={handleSave}
        disabled={saving || !amount}
        className="mt-4 w-full rounded-xl bg-fkm-positive px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
      >
        Ekle
      </button>
    </ModalShell>
  );
}

