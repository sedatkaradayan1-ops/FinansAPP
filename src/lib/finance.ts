// Shared finance domain types used across server functions and UI.

export type AccountType =
  | "bank"
  | "cash"
  | "credit_card"
  | "currency"
  | "gold"
  | "investment"
  | "overdraft"
  | "custom";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  creditLimit: number | null;
  color: string;
  icon: string;
  isEmergencyFund: boolean;
  archived: boolean;
  sortOrder: number;
};

export type AssetKind =
  | "gram_altin"
  | "ceyrek_altin"
  | "yarim_altin"
  | "tam_altin"
  | "usd"
  | "eur"
  | "gbp"
  | "stock"
  | "fund"
  | "custom";

export type Asset = {
  id: string;
  kind: AssetKind;
  label: string;
  quantity: number;
  avgCostTry: number;
};

export type MarketRate = {
  symbol: string;
  price: number;
  source: "api" | "manual" | "fallback";
  updatedAt: string;
};

export type TxType = "income" | "expense" | "transfer" | "investment_buy" | "investment_sell";

export type Transaction = {
  id: string;
  accountId: string | null;
  type: TxType;
  amount: number;
  currency: string;
  merchant: string | null;
  category: string;
  needOrWant: "need" | "want";
  note: string | null;
  occurredOn: string;
  source: string;
  rawInput: string | null;
  confidence: number;
};

export type Bill = {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  dueDay: number;
  lateFee: number;
  priority: "critical" | "normal" | "low";
  accountId: string | null;
  autopay: boolean;
  active: boolean;
  lastPaidPeriod: string | null;
};

export type RecurringIncome = {
  id: string;
  name: string;
  amount: number;
  payDay: number;
  accountId: string | null;
  active: boolean;
};

export type Budget = {
  id: string;
  category: string;
  monthlyLimit: number;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  color: string;
  icon: string;
};

export type Debt = {
  id: string;
  name: string;
  principalRemaining: number;
  originalPrincipal: number;
  interestRate: number;
  monthlyPayment: number;
  dueDay: number;
  monthsRemaining: number | null;
};

// --- Gold asset unit weights (grams) for value calc ------------------------
export const GOLD_GRAMS: Record<string, number> = {
  gram_altin: 1,
  ceyrek_altin: 1.75,
  yarim_altin: 3.5,
  tam_altin: 7.0,
};

export function assetUnitValueTry(asset: Asset, rates: Record<string, number>): number {
  switch (asset.kind) {
    case "gram_altin":
    case "ceyrek_altin":
    case "yarim_altin":
    case "tam_altin": {
      const gramPrice = rates["gram_altin"] ?? 0;
      return gramPrice * GOLD_GRAMS[asset.kind];
    }
    case "usd":
      return rates["usdtry"] ?? 0;
    case "eur":
      return rates["eurtry"] ?? 0;
    case "gbp":
      return rates["gbptry"] ?? 0;
    default:
      return asset.avgCostTry; // stocks/funds/custom: no live price feed, use cost basis
  }
}

export function assetCurrentValueTry(asset: Asset, rates: Record<string, number>): number {
  return assetUnitValueTry(asset, rates) * asset.quantity;
}

export function assetCostValueTry(asset: Asset): number {
  return asset.avgCostTry * asset.quantity;
}

export function assetProfitLoss(asset: Asset, rates: Record<string, number>): number {
  return assetCurrentValueTry(asset, rates) - assetCostValueTry(asset);
}

// --- Net worth ---------------------------------------------------------------

export function accountNetValue(account: Account): number {
  // Credit cards / overdraft carry balance as amount OWED (positive = debt).
  if (account.type === "credit_card" || account.type === "overdraft") {
    return -Math.abs(account.balance);
  }
  return account.balance;
}

export function computeNetWorth(
  accounts: Account[],
  assets: Asset[],
  debts: Debt[],
  rates: Record<string, number>,
): number {
  const accountsTotal = accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + accountNetValue(a), 0);
  const assetsTotal = assets.reduce((sum, a) => sum + assetCurrentValueTry(a, rates), 0);
  const debtsTotal = debts.reduce((sum, d) => sum + d.principalRemaining, 0);
  return accountsTotal + assetsTotal - debtsTotal;
}

// --- Safe to spend -----------------------------------------------------------

export function daysUntilPayday(payDay: number, today: Date = new Date()): number {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  let target = new Date(y, m, payDay);
  if (target.getTime() <= new Date(y, m, d).getTime()) {
    target = new Date(y, m + 1, payDay);
  }
  const diffMs = target.getTime() - new Date(y, m, d).getTime();
  return Math.max(1, Math.round(diffMs / 86_400_000));
}

export type SafeToSpendInput = {
  liquidBalance: number; // cash + bank, excludes emergency fund & credit
  upcomingBillsTotal: number; // bills due before payday
  daysUntilPayday: number;
  emergencyFundBuffer: number; // amount to always keep untouched
};

export function computeSafeToSpend(input: SafeToSpendInput): { total: number; perDay: number } {
  const available = Math.max(
    0,
    input.liquidBalance - input.upcomingBillsTotal - input.emergencyFundBuffer,
  );
  const perDay = available / Math.max(1, input.daysUntilPayday);
  return { total: available, perDay };
}

// --- Financial health score (0-100) ------------------------------------------

export type HealthScoreInput = {
  savingsRate: number; // (income-expenses)/income, 0..1 or negative
  emergencyFundMonths: number; // months of expenses covered
  debtToIncome: number; // monthly debt payments / monthly income
  budgetAdherence: number; // 0..1, share of budget categories within limit
  onTimePaymentRate: number; // 0..1
};

export function computeHealthScore(input: HealthScoreInput): number {
  const savingsScore = clamp01((input.savingsRate + 0.1) / 0.4) * 30; // 0..30
  const efScore = clamp01(input.emergencyFundMonths / 6) * 25; // 0..25
  const debtScore = clamp01(1 - input.debtToIncome / 0.4) * 20; // 0..20
  const budgetScore = clamp01(input.budgetAdherence) * 15; // 0..15
  const onTimeScore = clamp01(input.onTimePaymentRate) * 10; // 0..10
  return Math.round(savingsScore + efScore + debtScore + budgetScore + onTimeScore);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function healthScoreLabel(score: number): string {
  if (score >= 80) return "Mükemmel";
  if (score >= 65) return "İyi";
  if (score >= 45) return "Orta";
  if (score >= 25) return "Dikkat";
  return "Kritik";
}

// --- Cash flow forecast -------------------------------------------------------

export type ForecastDayPoint = {
  date: string; // YYYY-MM-DD
  projectedBalance: number;
  events: { label: string; amount: number }[]; // signed, income positive
};

export type ForecastInput = {
  startingBalance: number;
  bills: Bill[];
  recurringIncome: RecurringIncome[];
  horizonDays: number;
  startDate?: Date;
};

export function forecastCashFlow(input: ForecastInput): ForecastDayPoint[] {
  const start = input.startDate ?? new Date();
  const points: ForecastDayPoint[] = [];
  let running = input.startingBalance;

  for (let i = 0; i < input.horizonDays; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayOfMonth = date.getDate();
    const events: { label: string; amount: number }[] = [];

    for (const bill of input.bills) {
      if (!bill.active) continue;
      if (bill.dueDay === dayOfMonth) {
        events.push({ label: bill.name, amount: -bill.amount });
      }
    }
    for (const inc of input.recurringIncome) {
      if (!inc.active) continue;
      if (inc.payDay === dayOfMonth) {
        events.push({ label: inc.name, amount: inc.amount });
      }
    }

    const dayDelta = events.reduce((s, e) => s + e.amount, 0);
    running += dayDelta;
    points.push({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      projectedBalance: Math.round(running * 100) / 100,
      events,
    });
  }
  return points;
}

export function findShortageDay(points: ForecastDayPoint[]): ForecastDayPoint | null {
  return points.find((p) => p.projectedBalance < 0) ?? null;
}

// --- Category / merchant learning --------------------------------------------

export function normalizeMerchantKey(raw: string): string {
  return raw
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-zçğıöşü0-9\s]/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Built-in seed mappings for common Turkish merchants — used before any
// user-specific override exists.
export const DEFAULT_MERCHANT_CATEGORIES: Record<string, { category: string; needOrWant: "need" | "want" }> = {
  migros: { category: "Market", needOrWant: "need" },
  a101: { category: "Market", needOrWant: "need" },
  bim: { category: "Market", needOrWant: "need" },
  sok: { category: "Market", needOrWant: "need" },
  carrefour: { category: "Market", needOrWant: "need" },
  opet: { category: "Ulaşım", needOrWant: "need" },
  shell: { category: "Ulaşım", needOrWant: "need" },
  bp: { category: "Ulaşım", needOrWant: "need" },
  "petrol ofisi": { category: "Ulaşım", needOrWant: "need" },
  starbucks: { category: "Kahve", needOrWant: "want" },
  "kahve dünyası": { category: "Kahve", needOrWant: "want" },
  "gloria jeans": { category: "Kahve", needOrWant: "want" },
  amazon: { category: "Alışveriş", needOrWant: "want" },
  trendyol: { category: "Alışveriş", needOrWant: "want" },
  hepsiburada: { category: "Alışveriş", needOrWant: "want" },
  netflix: { category: "Abonelik", needOrWant: "want" },
  spotify: { category: "Abonelik", needOrWant: "want" },
  "youtube premium": { category: "Abonelik", needOrWant: "want" },
  turkcell: { category: "Fatura", needOrWant: "need" },
  vodafone: { category: "Fatura", needOrWant: "need" },
  "türk telekom": { category: "Fatura", needOrWant: "need" },
  iski: { category: "Fatura", needOrWant: "need" },
  igdas: { category: "Fatura", needOrWant: "need" },
  tahin: { category: "Market", needOrWant: "need" },
  pekmez: { category: "Market", needOrWant: "need" },
  maaş: { category: "Maaş", needOrWant: "need" },
  altın: { category: "Yatırım", needOrWant: "need" },
};

export function guessCategory(
  merchantKey: string,
  userRules: Record<string, { category: string; needOrWant: "need" | "want" }>,
): { category: string; needOrWant: "need" | "want"; confidence: number } | null {
  if (userRules[merchantKey]) {
    return { ...userRules[merchantKey], confidence: 1 };
  }
  // Partial match against user rules (merchant contains a known key)
  for (const key of Object.keys(userRules)) {
    if (merchantKey.includes(key)) return { ...userRules[key], confidence: 0.85 };
  }
  for (const key of Object.keys(DEFAULT_MERCHANT_CATEGORIES)) {
    if (merchantKey.includes(key)) return { ...DEFAULT_MERCHANT_CATEGORIES[key], confidence: 0.7 };
  }
  return null;
}


