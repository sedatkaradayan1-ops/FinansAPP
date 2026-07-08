import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { formatTry } from "../format";

export type ReportPeriod = "weekly" | "monthly" | "yearly";

export type FinancialReport = {
  period: ReportPeriod;
  fromDate: string;
  toDate: string;
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  topCategories: Array<{ category: string; amount: number }>;
  wantSpending: number;
  needSpending: number;
  wins: string[];
  mistakes: string[];
  suggestions: string[];
};

function rangeForPeriod(period: ReportPeriod): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: Date;
  if (period === "weekly") {
    from = new Date(now);
    from.setDate(now.getDate() - 7);
  } else if (period === "monthly") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
  }
  return { from: from.toISOString().slice(0, 10), to };
}

export const generateReport = createServerFn({ method: "GET" })
  .inputValidator(z.object({ period: z.enum(["weekly", "monthly", "yearly"]) }))
  .handler(async ({ data }): Promise<FinancialReport> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const { from, to } = rangeForPeriod(data.period);

    const rows = await DB.prepare(
      "SELECT type, amount, category, need_or_want FROM transactions WHERE user_id = ? AND occurred_on >= ? AND occurred_on <= ?",
    )
      .bind(userId, from, to)
      .all<{ type: string; amount: number; category: string; need_or_want: string }>();
    const txs = rows.results ?? [];

    const totalIncome = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpenses = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const totalSavings = totalIncome - totalExpenses;

    const categoryMap = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== "expense") continue;
      categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount);
    }
    const topCategories = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const wantSpending = txs
      .filter((t) => t.type === "expense" && t.need_or_want === "want")
      .reduce((s, t) => s + t.amount, 0);
    const needSpending = txs
      .filter((t) => t.type === "expense" && t.need_or_want === "need")
      .reduce((s, t) => s + t.amount, 0);

    const wins: string[] = [];
    const mistakes: string[] = [];
    const suggestions: string[] = [];

    if (totalSavings > 0) {
      wins.push(`Bu dönem ${formatTry(totalSavings)} tasarruf ettin.`);
    } else if (totalSavings < 0) {
      mistakes.push(`Bu dönem gelirinden ${formatTry(Math.abs(totalSavings))} fazla harcadın.`);
    }

    if (topCategories.length > 0) {
      const top = topCategories[0];
      const share = totalExpenses > 0 ? (top.amount / totalExpenses) * 100 : 0;
      if (share > 35) {
        mistakes.push(
          `Harcamalarının %${Math.round(share)}'i tek kategoride yoğunlaşmış: ${top.category}.`,
        );
        suggestions.push(`${top.category} kategorisindeki harcamalarını gözden geçirerek tasarruf sağlayabilirsin.`);
      } else {
        wins.push(`Harcamaların dengeli dağılmış, en yüksek kategori bile ${formatTry(top.amount)} seviyesinde.`);
      }
    }

    if (wantSpending > needSpending * 0.6 && wantSpending > 0) {
      mistakes.push(`Keyfi (istek) harcamaların ${formatTry(wantSpending)} ile oldukça yüksek.`);
      suggestions.push("İstek kategorisindeki harcamaları %20 azaltmayı hedefleyebilirsin.");
    } else if (wantSpending > 0) {
      wins.push("İhtiyaç ve istek harcamaların arasında sağlıklı bir denge var.");
    }

    if (wins.length === 0) wins.push("Bu dönem için öne çıkan bir başarı tespit edilmedi.");
    if (mistakes.length === 0) mistakes.push("Bu dönem için ciddi bir hata tespit edilmedi.");
    if (suggestions.length === 0) suggestions.push("Mevcut finansal disiplinini sürdür.");

    return {
      period: data.period,
      fromDate: from,
      toDate: to,
      totalIncome,
      totalExpenses,
      totalSavings,
      topCategories,
      wantSpending,
      needSpending,
      wins,
      mistakes,
      suggestions,
    };
  });

