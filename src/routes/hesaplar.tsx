import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Plus, Wallet, Landmark, CreditCard, Coins, TrendingUp, Trash2, Pencil, X } from "lucide-react";

import { requireAuthLoader } from "@/lib/require-auth";
import { AppShell } from "@/components/app-shell";
import { GlassPanel, PanelHeading } from "@/components/glass-panel";
import { ModalShell } from "@/components/modal-shell";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "@/lib/api/accounts.functions";
import type { Account, AccountType } from "@/lib/finance";
import { formatTry } from "@/lib/format";

export const Route = createFileRoute("/hesaplar")({
  beforeLoad: requireAuthLoader,
  loader: async () => ({ accounts: await listAccounts() }),
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Hesaplar — Finans Kontrol Merkezi" }] }),
});

const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Banka Hesabı",
  cash: "Nakit",
  credit_card: "Kredi Kartı",
  currency: "Döviz Hesabı",
  gold: "Altın Hesabı",
  investment: "Yatırım Hesabı",
  overdraft: "Kredili Mevduat",
  custom: "Özel",
};

const TYPE_ICON: Record<AccountType, typeof Wallet> = {
  bank: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  currency: Coins,
  gold: Coins,
  investment: TrendingUp,
  overdraft: CreditCard,
  custom: Wallet,
};

const COLOR_OPTIONS = ["#e8527c", "#4fae8a", "#c9a227", "#d9a441", "#948da3", "#6b8ce8"];

function AccountsPage() {
  const { user } = Route.useRouteContext();
  const { accounts } = Route.useLoaderData() as { accounts: Account[] };
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  async function refresh() {
    router.invalidate();
  }

  return (
    <AppShell activePath="/hesaplar" displayName={user.displayName}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="fkm-display text-2xl font-semibold tracking-tight text-fkm-text">Hesaplar</h1>
            <p className="mt-1 text-sm text-fkm-text-secondary">
              Sınırsız sayıda banka, nakit, kart ve yatırım hesabı ekle.
            </p>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-full bg-fkm-accent px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            <Plus className="size-4" />
            Hesap Ekle
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onChange={refresh} />
          ))}
          {accounts.length === 0 && (
            <GlassPanel className="col-span-full text-center">
              <p className="text-sm text-fkm-text-secondary">
                Henüz hesap eklemedin. Yukarıdaki "Hesap Ekle" butonuyla başla.
              </p>
            </GlassPanel>
          )}
        </div>
      </div>

      {formOpen && (
        <AccountFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function AccountCard({ account, onChange }: { account: Account; onChange: () => void }) {
  const Icon = TYPE_ICON[account.type];
  const isDebt = account.type === "credit_card" || account.type === "overdraft";
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    await deleteAccount({ data: { id: account.id } });
    onChange();
  }

  return (
    <GlassPanel>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${account.color}22` }}
          >
            <Icon className="size-5" style={{ color: account.color }} />
          </div>
          <div>
            <p className="text-sm font-medium text-fkm-text">{account.name}</p>
            <p className="text-xs text-fkm-text-muted">{TYPE_LABEL[account.type]}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg p-1.5 text-fkm-text-muted hover:bg-fkm-inset hover:text-fkm-text"
            aria-label="Düzenle"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-fkm-text-muted hover:bg-fkm-inset hover:text-fkm-negative"
            aria-label="Sil"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <p
        className={`fkm-mono mt-4 text-2xl font-semibold ${isDebt ? "text-fkm-negative" : "text-fkm-text"}`}
      >
        {isDebt ? "-" : ""}
        {formatTry(Math.abs(account.balance))}
      </p>
      {account.isEmergencyFund && (
        <span className="mt-2 inline-block rounded-full bg-fkm-positive/15 px-2.5 py-1 text-xs font-medium text-fkm-positive">
          Acil Durum Fonu
        </span>
      )}
      {editing && (
        <AccountEditModal
          account={account}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChange();
          }}
        />
      )}
    </GlassPanel>
  );
}

function AccountEditModal({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [balance, setBalance] = useState(String(account.balance));
  const [isEmergencyFund, setIsEmergencyFund] = useState(account.isEmergencyFund);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateAccount({
      data: { id: account.id, balance: parseFloat(balance) || 0, isEmergencyFund },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title={`${account.name} — Düzenle`} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Bakiye</label>
      <input
        type="number"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
      />
      <label className="mt-4 flex items-center gap-2 text-sm text-fkm-text-secondary">
        <input
          type="checkbox"
          checked={isEmergencyFund}
          onChange={(e) => setIsEmergencyFund(e.target.checked)}
          className="size-4 rounded border-fkm-border"
        />
        Acil durum fonu olarak işaretle
      </label>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
      >
        Kaydet
      </button>
    </ModalShell>
  );
}

function AccountFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [balance, setBalance] = useState("0");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [isEmergencyFund, setIsEmergencyFund] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await createAccount({
      data: {
        name: name.trim(),
        type,
        currency: "TRY",
        balance: parseFloat(balance) || 0,
        color,
        icon: "wallet",
        isEmergencyFund,
      },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell title="Yeni Hesap" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Hesap Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Ziraat Vadesiz"
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text placeholder:text-fkm-text-muted focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">Hesap Türü</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          >
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fkm-text-secondary">
            {type === "credit_card" || type === "overdraft" ? "Mevcut Borç" : "Bakiye"}
          </label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-full rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3 text-sm text-fkm-text focus:border-fkm-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-fkm-text-secondary">Renk</label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="size-8 rounded-full border-2"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "#f4f2f7" : "transparent",
                }}
                aria-label={`Renk ${c}`}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-fkm-text-secondary">
          <input
            type="checkbox"
            checked={isEmergencyFund}
            onChange={(e) => setIsEmergencyFund(e.target.checked)}
            className="size-4 rounded border-fkm-border"
          />
          Acil durum fonu olarak işaretle
        </label>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mt-1 w-full rounded-xl bg-fkm-accent px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          Hesabı Kaydet
        </button>
      </div>
    </ModalShell>
  );
}





