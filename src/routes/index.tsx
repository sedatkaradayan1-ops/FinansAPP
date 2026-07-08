import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wallet,
  Landmark,
  CreditCard,
  Coins,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { requireAuthLoader } from "@/lib/require-auth";
import { AppShell } from "@/components/app-shell";
import { GlassPanel, PanelHeading } from "@/components/glass-panel";
import { InstrumentGauge } from "@/components/instrument-gauge";
import { CountUpNumber } from "@/components/count-up-number";
import { getDashboardSnapshot, type DashboardSnapshot } from "@/lib/api/dashboard.functions";
import { getDailyBrief, type DailyBrief } from "@/lib/api/daily-brief.functions";
import { formatTry, formatDayMonthTr } from "@/lib/format";
import { healthScoreLabel } from "@/lib/finance";

export const Route = createFileRoute("/")({
  beforeLoad: requireAuthLoader,
  loader: async () => {
    const [snapshot, brief] = await Promise.all([getDashboardSnapshot(), getDailyBrief()]);
    return { snapshot, brief };
  },
  component: Dashboard,
  head: () => ({ meta: [{ title: "Finans Kontrol Merkezi" }] }),
});

const ACCOUNT_ICONS: Record<string, typeof Wallet> = {
  bank: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  currency: Coins,
  gold: Coins,
  investment: TrendingUp,
  overdraft: CreditCard,
  custom: Wallet,
};

const PIE_COLORS = ["#e8527c", "#4fae8a", "#c9a227", "#d9a441", "#948da3"];

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { snapshot, brief } = Route.useLoaderData() as { snapshot: DashboardSnapshot; brief: DailyBrief };

  return (
    <AppShell activePath="/" displayName={user.displayName}>
      <div className="flex flex-col gap-6">
        <DailyBriefCard brief={brief} />

        {/* Hero instrument row: Net worth + Health score gauge + Safe to spend gauge */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          <GlassPanel className="flex flex-col justify-between">
            <PanelHeading title="Net Varlık" />
            <p className="fkm-mono fkm-display text-4xl font-semibold tracking-tight text-fkm-text">
              <CountUpNumber value={snapshot.netWorth} format={(n) => formatTry(Math.round(n))} />
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-fkm-text-secondary">
              <span>Likit: {formatTry(Math.round(snapshot.liquidBalance))}</span>
              <span>Acil Fon: {formatTry(Math.round(snapshot.emergencyFundTotal))}</span>
            </div>
          </GlassPanel>

          <GlassPanel className="flex flex-col items-center justify-center">
            <InstrumentGauge
              value={snapshot.healthScore}
              label={`Finansal Sağlık: ${healthScoreLabel(snapshot.healthScore)}`}
              displayValue={`${snapshot.healthScore}`}
              accent="#e8527c"
            />
          </GlassPanel>

          <GlassPanel className="flex flex-col items-center justify-center">
            <InstrumentGauge
              value={Math.min(100, (snapshot.safeToSpend.perDay / 2000) * 100)}
              label="Güvenle Harcanabilir (Günlük)"
              displayValue={formatTry(Math.round(snapshot.safeToSpend.perDay))}
              accent="#4fae8a"
            />
          </GlassPanel>
        </div>

        {/* Accounts / Assets horizontal rail */}
        <GlassPanel>
          <PanelHeading title="Hesaplar ve Varlıklar" />
          <div className="flex gap-3 overflow-x-auto pb-1">
            {snapshot.accounts.map((account) => {
              const Icon = ACCOUNT_ICONS[account.type] ?? Wallet;
              const isDebt = account.type === "credit_card" || account.type === "overdraft";
              return (
                <div
                  key={account.id}
                  className="flex min-w-[180px] shrink-0 flex-col gap-2 rounded-2xl border border-fkm-border bg-fkm-inset p-4"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${account.color}22` }}
                    >
                      <Icon className="size-4" style={{ color: account.color }} />
                    </div>
                    <span className="truncate text-sm font-medium text-fkm-text">{account.name}</span>
                  </div>
                  <p
                    className={`fkm-mono text-lg font-semibold ${
                      isDebt ? "text-fkm-negative" : "text-fkm-text"
                    }`}
                  >
                    {isDebt ? "-" : ""}
                    {formatTry(Math.abs(account.balance))}
                  </p>
                </div>
              );
            })}
            {snapshot.accounts.length === 0 && (
              <p className="py-4 text-sm text-fkm-text-secondary">
                Henüz hesap eklemedin. Ayarlar &gt; Hesaplar bölümünden ekleyebilirsin.
              </p>
            )}
          </div>
        </GlassPanel>

        {/* Cash flow sparkline + Upcoming payments */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <GlassPanel>
            <PanelHeading title="30 Günlük Nakit Akışı" />
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshot.cashFlow30d}>
                  <defs>
                    <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8527c" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#e8527c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatDayMonthTr(v)}
                    tick={{ fill: "#948da3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={6}
                  />
                  <Tooltip
                    formatter={(v: number) => formatTry(Math.round(v))}
                    labelFormatter={(v) => formatDayMonthTr(v as string)}
                    contentStyle={{
                      backgroundColor: "#131219",
                      border: "1px solid #28242f",
                      borderRadius: 12,
                      color: "#f4f2f7",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="projectedBalance"
                    stroke="#e8527c"
                    strokeWidth={2}
                    fill="url(#cashFlowGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {snapshot.shortageDay && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-fkm-negative/30 bg-fkm-negative/10 px-3 py-2 text-xs text-fkm-negative">
                <AlertTriangle className="size-4 shrink-0" />
                {formatDayMonthTr(snapshot.shortageDay.date)} tarihinde bakiye açığı riski var.
              </div>
            )}
          </GlassPanel>

          <GlassPanel>
            <PanelHeading title="Yaklaşan Ödemeler" />
            <ul className="flex flex-col gap-2">
              {snapshot.upcomingBills.map((bill) => (
                <li
                  key={bill.id}
                  className="flex items-center justify-between rounded-xl border border-fkm-border bg-fkm-inset px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm text-fkm-text">{bill.name}</p>
                    <p className="text-xs text-fkm-text-muted">Her ayın {bill.dueDay}. günü</p>
                  </div>
                  <span className="fkm-mono text-sm font-medium text-fkm-text">
                    {formatTry(bill.amount)}
                  </span>
                </li>
              ))}
              {snapshot.upcomingBills.length === 0 && (
                <p className="py-3 text-sm text-fkm-text-secondary">Yaklaşan ödemen yok.</p>
              )}
            </ul>
          </GlassPanel>
        </div>

        {/* Spending breakdown + investment allocation */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassPanel>
            <PanelHeading title="Harcama Dağılımı" />
            {snapshot.categoryBreakdown.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={snapshot.categoryBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {snapshot.categoryBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => formatTry(Math.round(v))}
                        contentStyle={{
                          backgroundColor: "#131219",
                          border: "1px solid #28242f",
                          borderRadius: 12,
                          color: "#f4f2f7",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                  {snapshot.categoryBreakdown.slice(0, 5).map((c, i) => (
                    <li key={c.category} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-fkm-text-secondary">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        {c.category}
                      </span>
                      <span className="fkm-mono text-fkm-text">{formatTry(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-6 text-sm text-fkm-text-secondary">Bu ay henüz harcama kaydı yok.</p>
            )}
          </GlassPanel>

          <GlassPanel>
            <PanelHeading title="Yatırım Dağılımı" />
            {snapshot.investmentAllocation.length > 0 ? (
              <div className="flex flex-col gap-3">
                {snapshot.investmentAllocation.map((a, i) => {
                  const total = snapshot.investmentAllocation.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? (a.value / total) * 100 : 0;
                  return (
                    <div key={a.label}>
                      <div className="mb-1 flex justify-between text-xs text-fkm-text-secondary">
                        <span>{a.label}</span>
                        <span className="fkm-mono">{formatTry(Math.round(a.value))}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-fkm-inset">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 flex items-center justify-between border-t border-fkm-border pt-3 text-sm">
                  <span className="text-fkm-text-secondary">Toplam Kar/Zarar</span>
                  <span
                    className={`fkm-mono flex items-center gap-1 font-medium ${
                      snapshot.assetsTotalProfitLoss >= 0 ? "text-fkm-positive" : "text-fkm-negative"
                    }`}
                  >
                    {snapshot.assetsTotalProfitLoss >= 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {formatTry(Math.round(snapshot.assetsTotalProfitLoss))}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-6 text-sm text-fkm-text-secondary">Henüz varlık eklemedin.</p>
            )}
          </GlassPanel>
        </div>

        {/* Today's Recommendation */}
        <GlassPanel className="border-fkm-accent/30 bg-gradient-to-br from-fkm-accent/10 to-transparent">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-fkm-accent/20">
              <Sparkles className="size-4 text-fkm-accent" />
            </div>
            <div>
              <p className="fkm-display text-sm font-semibold text-fkm-text">Bugünün Önerisi</p>
              <p className="mt-1 text-sm text-fkm-text-secondary">{snapshot.recommendation}</p>
            </div>
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}

function DailyBriefCard({ brief }: { brief: DailyBrief }) {
  return (
    <GlassPanel className="border-fkm-border bg-fkm-panel">
      <div className="mb-2 flex items-center gap-2">
        <span className="fkm-display text-sm font-semibold text-fkm-text">
          Günlük Finans Brifingi
        </span>
        <span className="fkm-mono text-xs text-fkm-text-muted">{brief.dateLabel}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {brief.lines.map((line, i) => (
          <li key={i} className="flex gap-2 text-sm text-fkm-text-secondary">
            <span className="text-fkm-accent">•</span>
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-xl bg-fkm-inset px-3 py-2.5 text-sm text-fkm-text">
        <span className="font-medium text-fkm-accent">Bugünkü en doğru finansal aksiyon: </span>
        {brief.actionOfTheDay}
      </div>
    </GlassPanel>
  );
}

