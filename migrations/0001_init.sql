-- Finans Kontrol Merkezi — D1 schema. Additive only; applied by the platform
-- on deploy (app.manifest.json db:true). Bound as env.DB.

-- Single owner auth (password-protected, one user for now, but modelled so
-- multi-user could be added later without a rewrite).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Kullanıcı',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  payday_day INTEGER NOT NULL DEFAULT 1, -- day-of-month salary lands
  monthly_income_estimate REAL NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Accounts: unlimited custom accounts (bank, cash, credit card, currency,
-- gold, investment...).
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- bank | cash | credit_card | currency | gold | investment | overdraft | custom
  currency TEXT NOT NULL DEFAULT 'TRY',
  balance REAL NOT NULL DEFAULT 0,
  credit_limit REAL, -- for credit_card / overdraft
  color TEXT NOT NULL DEFAULT '#e8527c',
  icon TEXT NOT NULL DEFAULT 'wallet',
  is_emergency_fund INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- Assets: gold / fx / stocks / funds / custom holdings with cost basis for
-- profit/loss calc.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- gram_altin | ceyrek_altin | yarim_altin | tam_altin | usd | eur | gbp | stock | fund | custom
  label TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  avg_cost_try REAL NOT NULL DEFAULT 0, -- average acquisition cost per unit, in TRY
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);

-- Market rates cache: latest fetched or manually-entered rate per symbol.
CREATE TABLE IF NOT EXISTS market_rates (
  symbol TEXT PRIMARY KEY, -- gram_altin | ceyrek_altin | usdtry | eurtry | gbptry
  price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- api | manual | fallback
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories: learning system. merchant_key -> category mapping the user can
-- override; overrides are remembered forever.
CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant_key TEXT NOT NULL, -- normalized lowercase merchant text
  category TEXT NOT NULL,
  need_or_want TEXT NOT NULL DEFAULT 'need', -- need | want
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, merchant_key)
);

-- Transactions: income + expense + transfer + investment moves, all unified.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  type TEXT NOT NULL, -- income | expense | transfer | investment_buy | investment_sell
  amount REAL NOT NULL, -- always positive; sign implied by type
  currency TEXT NOT NULL DEFAULT 'TRY',
  merchant TEXT,
  category TEXT NOT NULL DEFAULT 'Diğer',
  need_or_want TEXT NOT NULL DEFAULT 'need',
  note TEXT,
  occurred_on TEXT NOT NULL, -- YYYY-MM-DD
  source TEXT NOT NULL DEFAULT 'manual', -- manual | quick_entry | recurring
  raw_input TEXT, -- original free-text the quick-entry parser saw
  confidence REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(user_id, category);

-- Recurring bills / subscriptions / rent / insurance / loans / utilities.
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Abonelik', -- Kira | Sigorta | Kredi | Fatura | Abonelik | Kredi Kartı | Diğer
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  due_day INTEGER NOT NULL, -- day of month, 1-31
  late_fee REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal', -- critical | normal | low
  account_id TEXT,
  autopay INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_paid_period TEXT, -- YYYY-MM last period marked paid
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);

-- Recurring income (salary etc.)
CREATE TABLE IF NOT EXISTS recurring_income (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  pay_day INTEGER NOT NULL,
  account_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Budget plan per category (monthly envelope amounts).
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  monthly_limit REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, category)
);

-- Savings goals.
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_amount REAL NOT NULL DEFAULT 0,
  target_date TEXT,
  color TEXT NOT NULL DEFAULT '#4fae8a',
  icon TEXT NOT NULL DEFAULT 'target',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Debts / loans (Borç Yönetimi) — separate from bills for principal tracking.
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  principal_remaining REAL NOT NULL,
  original_principal REAL NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0, -- annual %
  monthly_payment REAL NOT NULL,
  due_day INTEGER NOT NULL DEFAULT 1,
  months_remaining INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly Financial Journal — one immutable snapshot per closed month.
CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL, -- YYYY-MM
  total_income REAL NOT NULL DEFAULT 0,
  total_expenses REAL NOT NULL DEFAULT 0,
  total_savings REAL NOT NULL DEFAULT 0,
  net_worth REAL NOT NULL DEFAULT 0,
  health_score INTEGER NOT NULL DEFAULT 0,
  category_breakdown TEXT NOT NULL DEFAULT '{}', -- JSON {category: amount}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, period)
);

-- Notifications / alerts feed.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- bill_due | overspend | salary_received | goal_reached | budget_exceeded | cash_shortage
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

