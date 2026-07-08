import { createServerFn } from "@tanstack/react-start";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { getDashboardSnapshot } from "./dashboard.functions";
import { daysUntilPayday } from "../finance";
import { formatTry } from "../format";

export type DailyBrief = {
  dateLabel: string;
  lines: string[];
  actionOfTheDay: string;
};

const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export const getDailyBrief = createServerFn({ method: "GET" }).handler(async (): Promise<DailyBrief> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  const snapshot = await getDashboardSnapshot();

  const now = new Date();
  const dateLabel = `${now.getDate()} ${MONTH_NAMES_TR[now.getMonth()]}`;
  const lines: string[] = [];

  const todaysBills = snapshot.upcomingBills.filter((b) => b.dueDay === now.getDate());
  if (todaysBills.length > 0) {
    lines.push(`Bugün ${todaysBills.length} ödemen var: ${todaysBills.map((b) => b.name).join(", ")}.`);
  } else if (snapshot.upcomingBills.length > 0) {
    const next = snapshot.upcomingBills[0];
    lines.push(`Yaklaşan ödemen: ${next.name}, ${next.dueDay}. gün.`);
  }

  lines.push(`Güvenle harcayabileceğin tutar: ${formatTry(Math.round(snapshot.safeToSpend.perDay))}.`);

  // Budget usage for the top expense category this month vs its budget limit
  if (DB) {
    const budgetRows = await DB.prepare("SELECT category, monthly_limit FROM budgets WHERE user_id = ?")
      .bind(userId)
      .all<{ category: string; monthly_limit: number }>();
    for (const b of budgetRows.results ?? []) {
      const spent = snapshot.categoryBreakdown.find((c) => c.category === b.category)?.amount ?? 0;
      if (b.monthly_limit > 0) {
        const pct = Math.round((spent / b.monthly_limit) * 100);
        if (pct >= 50) {
          lines.push(`${b.category} bütçenin %${pct}'sini kullandın.`);
          break;
        }
      }
    }
  }

  // Compare this month's "want" spending (dining/coffee/shopping proxy) vs last month
  if (DB) {
    const now2 = new Date();
    const thisMonthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthDate = new Date(now2.getFullYear(), now2.getMonth() - 1, 1);
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthEnd = thisMonthStart;

    const wantThis = await DB.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id = ? AND type = 'expense' AND need_or_want = 'want' AND occurred_on >= ?",
    )
      .bind(userId, thisMonthStart)
      .first<{ total: number }>();
    const wantLast = await DB.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id = ? AND type = 'expense' AND need_or_want = 'want' AND occurred_on >= ? AND occurred_on < ?",
    )
      .bind(userId, lastMonthStart, lastMonthEnd)
      .first<{ total: number }>();

    if (wantLast && wantLast.total > 0 && wantThis) {
      const diffPct = Math.round(((wantThis.total - wantLast.total) / wantLast.total) * 100);
      if (Math.abs(diffPct) >= 10) {
        lines.push(
          `Bu ay geçen aya göre keyfi harcamalarda %${Math.abs(diffPct)} ${diffPct > 0 ? "daha fazla" : "daha az"} harcadın.`,
        );
      }
    }
  }

  lines.push(`Maaş gününe ${snapshot.daysUntilPayday} gün kaldı.`);

  return {
    dateLabel,
    lines,
    actionOfTheDay: snapshot.recommendation,
  };
});

