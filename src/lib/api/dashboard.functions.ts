import { createServerFn } from "@tanstack/react-start";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import {
  computeNetWorth,
  computeSafeToSpend,
  computeHealthScore,
  daysUntilPayday,
  forecastCashFlow,
  findShortageDay,
  accountNetValue,
  assetCurrentValueTry,
  assetProfitLoss,
  type Account,
  type Asset,
  type Bill,
  type Debt,
  type RecurringIncome,
  type Goal,
  type Budget,
  type ForecastDayPoint,
} from "../finance";

export type DashboardSnapshot = {
  netWorth: number;
  liquidBalance: number;
  emergencyFundTotal: number;
  safeToSpend: { total: number; perDay: number };
  daysUntilPayday: number;
  healthScore: number;
  healthInputs: {
    savingsRate: number;
    emergencyFundMonths: number;
    debtToIncome: number;
    budgetAdherence: number;
    onTimePaymentRate: number;
  };
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  upcomingBills: Array<{ id: string; name: string; amount: number; dueDay: number; priority: string; category: string }>;
  accounts: Account[];
  assets: Asset[];
  assetsTotalValue: number;
  assetsTotalProfitLoss: number;
  investmentAllocation: Array<{ label: string; value: number }>;
  categoryBreakdown: Array<{ category: string; amount: number }>;
  cashFlow30d: ForecastDayPoint[];
  shortageDay: ForecastDayPoint | null;
  goals: Goal[];
  debts: Debt[];
  rates: Record<string, number>;
  recommendation: string;
};

export const getDashboardSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardSnapshot> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");

    const user = await DB.prepare(
      "SELECT payday_day, monthly_income_estimate FROM users WHERE id = ?",
    )
      .bind(userId)
      .first<{ payday_day: number; monthly_income_estimate: number }>();
    const paydayDay = user?.payday_day ?? 1;

    const [accountsRes, assetsRes, billsRes, incomeRes, goalsRes, debtsRes, budgetsRes, ratesRes] =
      await Promise.all([
        DB.prepare("SELECT * FROM accounts WHERE user_id = ? AND archived = 0").bind(userId).all(),
        DB.prepare("SELECT * FROM assets WHERE user_id = ?").bind(userId).all(),
        DB.prepare("SELECT * FROM bills WHERE user_id = ? AND active = 1").bind(userId).all(),
        DB.prepare("SELECT * FROM recurring_income WHERE user_id = ? AND active = 1").bind(userId).all(),
        DB.prepare("SELECT * FROM goals WHERE user_id = ?").bind(userId).all(),
        DB.prepare("SELECT * FROM debts WHERE user_id = ?").bind(userId).all(),
        DB.prepare("SELECT * FROM budgets WHERE user_id = ?").bind(userId).all(),
        DB.prepare("SELECT * FROM market_rates").all(),
      ]);

    const accounts: Account[] = (accountsRes.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      currency: r.currency,
      balance: r.balance,
      creditLimit: r.credit_limit,
      color: r.color,
      icon: r.icon,
      isEmergencyFund: !!r.is_emergency_fund,
      archived: !!r.archived,
      sortOrder: r.sort_order,
    }));
    const assets: Asset[] = (assetsRes.results ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      quantity: r.quantity,
      avgCostTry: r.avg_cost_try,
    }));
    const bills: Bill[] = (billsRes.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      dueDay: r.due_day,
      lateFee: r.late_fee,
      priority: r.priority,
      accountId: r.account_id,
      autopay: !!r.autopay,
      active: !!r.active,
      lastPaidPeriod: r.last_paid_period,
    }));
    const recurringIncome: RecurringIncome[] = (incomeRes.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      amount: r.amount,
      payDay: r.pay_day,
      accountId: r.account_id,
      active: !!r.active,
    }));
    const goals: Goal[] = (goalsRes.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      targetAmount: r.target_amount,
      currentAmount: r.current_amount,
      targetDate: r.target_date,
      color: r.color,
      icon: r.icon,
    }));
    const debts: Debt[] = (debtsRes.results ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      principalRemaining: r.principal_remaining,
      originalPrincipal: r.original_principal,
      interestRate: r.interest_rate,
      monthlyPayment: r.monthly_payment,
      dueDay: r.due_day,
      monthsRemaining: r.months_remaining,
    }));
    const budgets: Budget[] = (budgetsRes.results ?? []).map((r: any) => ({
      id: r.id,
      category: r.category,
      monthlyLimit: r.monthly_limit,
    }));
    const rates: Record<string, number> = {};
    for (const r of (ratesRes.results ?? []) as any[]) rates[r.symbol] = r.price;

    // This month's transactions for income/expense/category aggregation
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const txRes = await DB.prepare(
      "SELECT type, amount, category, need_or_want, occurred_on FROM transactions WHERE user_id = ? AND occurred_on >= ?",
    )
      .bind(userId, monthStart)
      .all<{ type: string; amount: number; category: string; need_or_want: string; occurred_on: string }>();
    const monthTx = txRes.results ?? [];

    const monthlyIncome =
      monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0) ||
      recurringIncome.reduce((s, i) => s + i.amount, 0);
    const monthlyExpenses = monthTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const monthlySavings = monthlyIncome - monthlyExpenses;

    const categoryMap = new Map<string, number>();
    for (const t of monthTx) {
      if (t.type !== "expense") continue;
      categoryMap.set(t.category, (categoryMap.get(t.category) ?? 0) + t.amount);
    }
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const netWorth = computeNetWorth(accounts, assets, debts, rates);

    const liquidAccounts = accounts.filter(
      (a) => (a.type === "bank" || a.type === "cash") && !a.isEmergencyFund,
    );
    const liquidBalance = liquidAccounts.reduce((s, a) => s + accountNetValue(a), 0);
    const emergencyFundTotal = accounts
      .filter((a) => a.isEmergencyFund)
      .reduce((s, a) => s + accountNetValue(a), 0);

    const dtp = daysUntilPayday(paydayDay);
    const upcomingBillsBeforePayday = bills.filter((b) => {
      const today = now.getDate();
      if (b.dueDay >= today) return b.dueDay - today < dtp;
      return true; // overdue-ish within this cycle, still count as due soon
    });
    const upcomingBillsTotal = upcomingBillsBeforePayday.reduce((s, b) => s + b.amount, 0);

    const safeToSpend = computeSafeToSpend({
      liquidBalance,
      upcomingBillsTotal,
      daysUntilPayday: dtp,
      emergencyFundBuffer: 0, // emergency fund already excluded from liquidBalance via isEmergencyFund flag
    });

    const emergencyFundMonths = monthlyExpenses > 0 ? emergencyFundTotal / monthlyExpenses : 0;
    const debtToIncome =
      monthlyIncome > 0 ? debts.reduce((s, d) => s + d.monthlyPayment, 0) / monthlyIncome : 0;
    const budgetAdherence =
      budgets.length > 0
        ? budgets.filter((b) => (categoryMap.get(b.category) ?? 0) <= b.monthlyLimit).length /
          budgets.length
        : 0.7; // neutral default when no budgets set yet
    const onTimePaymentRate = 0.9; // simple default; refined once payment history accrues

    const savingsRate = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0;
    const healthScore = computeHealthScore({
      savingsRate,
      emergencyFundMonths,
      debtToIncome,
      budgetAdherence,
      onTimePaymentRate,
    });

    const upcomingBills = bills
      .slice()
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 6)
      .map((b) => ({
        id: b.id,
        name: b.name,
        amount: b.amount,
        dueDay: b.dueDay,
        priority: b.priority,
        category: b.category,
      }));

    const cashFlow30d = forecastCashFlow({
      startingBalance: liquidBalance + emergencyFundTotal,
      bills,
      recurringIncome,
      horizonDays: 30,
    });
    const shortageDay = findShortageDay(cashFlow30d);

    const assetsTotalValue = assets.reduce((s, a) => s + assetCurrentValueTry(a, rates), 0);
    const assetsTotalProfitLoss = assets.reduce((s, a) => s + assetProfitLoss(a, rates), 0);

    const allocationMap = new Map<string, number>();
    for (const a of assets) {
      const bucket =
        a.kind.includes("altin") ? "Altın" : a.kind === "usd" || a.kind === "eur" || a.kind === "gbp" ? "Döviz" : "Diğer Yatırım";
      allocationMap.set(bucket, (allocationMap.get(bucket) ?? 0) + assetCurrentValueTry(a, rates));
    }
    const investmentAllocation = Array.from(allocationMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    const recommendation = buildRecommendation({
      shortageDay,
      safeToSpendPerDay: safeToSpend.perDay,
      upcomingBills: upcomingBillsBeforePayday,
      healthScore,
      debts,
    });

    return {
      netWorth,
      liquidBalance,
      emergencyFundTotal,
      safeToSpend,
      daysUntilPayday: dtp,
      healthScore,
      healthInputs: { savingsRate, emergencyFundMonths, debtToIncome, budgetAdherence, onTimePaymentRate },
      monthlyIncome,
      monthlyExpenses,
      monthlySavings,
      upcomingBills,
      accounts,
      assets,
      assetsTotalValue,
      assetsTotalProfitLoss,
      investmentAllocation,
      categoryBreakdown,
      cashFlow30d,
      shortageDay,
      goals,
      debts,
      rates,
      recommendation,
    };
  },
);

function buildRecommendation(input: {
  shortageDay: ForecastDayPoint | null;
  safeToSpendPerDay: number;
  upcomingBills: Bill[];
  healthScore: number;
  debts: Debt[];
}): string {
  if (input.shortageDay) {
    return `${input.shortageDay.date.split("-").reverse().join(".")} tarihinde bakiyenin eksiye düşmesi bekleniyor. Gereksiz harcamaları şimdiden kıs ve mümkünse bir ödemeyi ertele.`;
  }
  if (input.upcomingBills.length >= 2) {
    const critical = input.upcomingBills.find((b) => b.priority === "critical");
    if (critical) {
      return `Bugün ${input.upcomingBills.length} ödemen var. Önce "${critical.name}" ödemesini yap, diğerlerini birkaç gün erteleyebilirsin.`;
    }
    return `Bugün ${input.upcomingBills.length} ödemen var. Öncelik sırasına göre ilerle, günlük ${Math.max(0, Math.round(input.safeToSpendPerDay))} TL güvenle harcanabilir.`;
  }
  if (input.debts.length > 0) {
    return "Bu ay borç ödemelerini zamanında yaparak finansal sağlık skorunu koruyabilirsin.";
  }
  if (input.healthScore >= 80) {
    return "Finansal durumun çok iyi görünüyor. Fazla nakdi bir birikim hedefine veya yatırıma yönlendirmeyi düşünebilirsin.";
  }
  return "Bugün için kritik bir risk görünmüyor. Harcamalarını planına göre sürdür.";
}

