import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { BookOpenText } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

import { requireAuthLoader } from "@/lib/require-auth";
import { AppShell } from "@/components/app-shell";
import { GlassPanel, PanelHeading } from "@/components/glass-panel";
import { listMonthlySnapshots, ensureCurrentMonthSnapshot, type MonthlySnapshotRow } from "@/lib/api/journal.functions";
import { formatTry, periodLabelTr } from "@/lib/format";
import { healthScoreLabel } from "@/lib/finance";

export const Route = createFileRoute("/gunluk")({
  beforeLoad: requireAuthLoader,
  loader: async () => {
    await ensureCurrentMonthSnapshot();
    const snapshots = await listMonthlySnapshots();
    return { snapshots };
  },
  component: JournalPage,
  head: () => ({ meta: [{ title: "Finans Günlüğü — Finans Kontrol Merkezi" }] }),
});

function JournalPage() {
  const { user } = Route.useRouteContext();
  const { snapshots } = Route.useLoaderData() as { snapshots: MonthlySnapshotRow[] };
  const [compareA, setCompareA] = useState<string>(snapshots[0]?.period ?? "");
  const [compareB, setCompareB] = useState<string>(snapshots[1]?.period ?? snapshots[0]?.period ?? "");

  const snapA = snapshots.find((s) => s.period === compareA);
  const snapB = snapshots.find((s) => s.period === compareB);

  const chartData = useMemo(() => [...snapshots].reverse(), [snapshots]);

  return (
    <AppShell activePath="/gunluk" displayName={user.displayName}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="fkm-display text-2xl font-semibold tracking-tight text-fkm-text">
            Finans Günlüğü
          </h1>
          <p className="mt-1 text-sm text-fkm-text-secondary">
            Her ay kalıcı olarak kaydedilir. Herhangi iki ayı karşılaştırabilirsin.
          </p>
        </div>

        <GlassPanel>
          <PanelHeading title="Aylık Gelişim" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis
                  dataKey="period"
                  tickFormatter={(v) => periodLabelTr(v)}
                  tick={{ fill: "#948da3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatTry(v).replace("₺", "")}
                  tick={{ fill: "#948da3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(v: number) => formatTry(Math.round(v))}
                  labelFormatter={(v) => periodLabelTr(v as string)}
                  contentStyle={{
                    backgroundColor: "#131219",
                    border: "1px solid #28242f",
                    borderRadius: 12,
                    color: "#f4f2f7",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#948da3" }} />
                <Bar dataKey="totalIncome" name="Gelir" fill="#4fae8a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="totalExpenses" name="Gider" fill="#e2645a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="totalSavings" name="Tasarruf" fill="#e8527c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-fkm-text-secondary">Ay Karşılaştır</span>
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              className="rounded-xl border border-fkm-border bg-fkm-inset px-3 py-2 text-sm text-fkm-text"
            >
              {snapshots.map((s) => (
                <option key={s.period} value={s.period}>
                  {periodLabelTr(s.period)}
                </option>
              ))}
            </select>
            <span className="text-fkm-text-muted">vs</span>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="rounded-xl border border-fkm-border bg-fkm-inset px-3 py-2 text-sm text-fkm-text"
            >
              {snapshots.map((s) => (
                <option key={s.period} value={s.period}>
                  {periodLabelTr(s.period)}
                </option>
              ))}
            </select>
          </div>

          {snapA && snapB ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <CompareRow label="Gelir" a={snapA.totalIncome} b={snapB.totalIncome} />
              <CompareRow label="Gider" a={snapA.totalExpenses} b={snapB.totalExpenses} inverse />
              <CompareRow label="Tasarruf" a={snapA.totalSavings} b={snapB.totalSavings} />
              <CompareRow label="Net Varlık" a={snapA.netWorth} b={snapB.netWorth} />
              <div>
                <p className="text-xs text-fkm-text-muted">Finansal Sağlık</p>
                <p className="fkm-mono mt-1 text-lg font-semibold text-fkm-text">
                  {snapA.healthScore} ({healthScoreLabel(snapA.healthScore)})
                </p>
                <p className="fkm-mono text-xs text-fkm-text-muted">
                  vs {snapB.healthScore} ({healthScoreLabel(snapB.healthScore)})
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fkm-text-secondary">Karşılaştırma için en az iki ay verisi gerekli.</p>
          )}
        </GlassPanel>

        <GlassPanel>
          <PanelHeading title="Tüm Aylar" />
          <div className="flex flex-col gap-2">
            {snapshots.map((s) => (
              <div
                key={s.period}
                className="flex items-center justify-between rounded-xl border border-fkm-border bg-fkm-inset px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <BookOpenText className="size-4 text-fkm-text-muted" />
                  <span className="text-sm text-fkm-text">{periodLabelTr(s.period)}</span>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="fkm-mono text-fkm-positive">+{formatTry(s.totalIncome)}</span>
                  <span className="fkm-mono text-fkm-negative">-{formatTry(s.totalExpenses)}</span>
                  <span className="fkm-mono text-fkm-text">{s.healthScore}/100</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}

function CompareRow({
  label,
  a,
  b,
  inverse = false,
}: {
  label: string;
  a: number;
  b: number;
  inverse?: boolean;
}) {
  const diff = a - b;
  const better = inverse ? diff < 0 : diff > 0;
  return (
    <div>
      <p className="text-xs text-fkm-text-muted">{label}</p>
      <p className="fkm-mono mt-1 text-lg font-semibold text-fkm-text">{formatTry(a)}</p>
      <p className={`fkm-mono text-xs ${better ? "text-fkm-positive" : "text-fkm-negative"}`}>
        {diff >= 0 ? "+" : ""}
        {formatTry(diff)} vs {formatTry(b)}
      </p>
    </div>
  );
}

