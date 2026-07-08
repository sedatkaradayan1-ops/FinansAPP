import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { getDashboardSnapshot } from "./dashboard.functions";
import { currentPeriod } from "../format";

export type MonthlySnapshotRow = {
  id: string;
  period: string;
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netWorth: number;
  healthScore: number;
  categoryBreakdown: Record<string, number>;
};

function rowToSnapshot(r: any): MonthlySnapshotRow {
  return {
    id: r.id,
    period: r.period,
    totalIncome: r.total_income,
    totalExpenses: r.total_expenses,
    totalSavings: r.total_savings,
    netWorth: r.net_worth,
    healthScore: r.health_score,
    categoryBreakdown: JSON.parse(r.category_breakdown || "{}"),
  };
}

export const listMonthlySnapshots = createServerFn({ method: "GET" }).handler(
  async (): Promise<MonthlySnapshotRow[]> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) return [];
    const rows = await DB.prepare(
      "SELECT * FROM monthly_snapshots WHERE user_id = ? ORDER BY period DESC",
    )
      .bind(userId)
      .all();
    return (rows.results ?? []).map(rowToSnapshot);
  },
);

// Ensures the CURRENT month has a live (recomputed) snapshot row, and that a
// previous month gets frozen automatically once we roll into a new month
// (called opportunistically whenever the journal page loads — "start a new
// month automatically").
export const ensureCurrentMonthSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) throw new Error("Veritabanı bağlantısı yok");
  const period = currentPeriod();
  const snapshot = await getDashboardSnapshot();

  const breakdown: Record<string, number> = {};
  for (const c of snapshot.categoryBreakdown) breakdown[c.category] = c.amount;

  await DB.prepare(
    `INSERT INTO monthly_snapshots
      (id, user_id, period, total_income, total_expenses, total_savings, net_worth, health_score, category_breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, period) DO UPDATE SET
       total_income = excluded.total_income,
       total_expenses = excluded.total_expenses,
       total_savings = excluded.total_savings,
       net_worth = excluded.net_worth,
       health_score = excluded.health_score,
       category_breakdown = excluded.category_breakdown`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      period,
      snapshot.monthlyIncome,
      snapshot.monthlyExpenses,
      snapshot.monthlySavings,
      snapshot.netWorth,
      snapshot.healthScore,
      JSON.stringify(breakdown),
    )
    .run();

  return { ok: true as const, period };
});

