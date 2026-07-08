// Quick AI transaction entry — parses Turkish free-text like:
//   "Tahin pekmez 300 TL", "Bugün Migros 1450", "Maaş yattı 72000",
//   "1 gram altın aldım 6500", "Opet 1800"
// into a structured draft transaction. Deterministic rule-based parser (no
// external LLM call needed for the common cases — fast + free); falls back to
// "needs confirmation" when it can't confidently resolve type/amount.
import { normalizeMerchantKey, guessCategory, type TxType } from "./finance";

export type ParsedTransactionDraft = {
  type: TxType;
  amount: number;
  merchant: string;
  category: string;
  needOrWant: "need" | "want";
  occurredOn: string; // YYYY-MM-DD
  confidence: number;
  assetKind?: "gram_altin" | "ceyrek_altin" | "yarim_altin" | "tam_altin" | "usd" | "eur" | "gbp";
  assetQuantity?: number;
  needsConfirmation: boolean;
  rawInput: string;
};

const INCOME_HINTS = ["maaş", "maas", "yattı", "yatti", "gelir", "prim", "ikramiye", "iade", "freelance"];
const GOLD_HINTS: Record<string, "gram_altin" | "ceyrek_altin" | "yarim_altin" | "tam_altin"> = {
  "gram altın": "gram_altin",
  "gram altin": "gram_altin",
  "çeyrek altın": "ceyrek_altin",
  "ceyrek altin": "ceyrek_altin",
  "yarım altın": "yarim_altin",
  "yarim altin": "yarim_altin",
  "tam altın": "tam_altin",
  "tam altin": "tam_altin",
  "cumhuriyet altını": "tam_altin",
};
const CURRENCY_HINTS: Record<string, "usd" | "eur" | "gbp"> = {
  dolar: "usd",
  usd: "usd",
  euro: "eur",
  eur: "eur",
  sterlin: "gbp",
  gbp: "gbp",
};
const BUY_HINTS = ["aldım", "aldim", "satın aldım", "satin aldim"];
const SELL_HINTS = ["sattım", "sattim"];
const TODAY_WORDS = ["bugün", "bugun"];
const YESTERDAY_WORDS = ["dün", "dun"];

function todayIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractAmount(text: string): number | null {
  // Matches "1450", "1.450,50", "1450 TL", "6.500" — Turkish thousands(.) / decimal(,).
  // The grouped-thousands form (\d{1,3}(?:\.\d{3})+) must be tried BEFORE the plain
  // \d+ fallback, and \d+ must be greedy and anchored so "1450" isn't truncated to
  // "145" by an earlier, shorter alternative match.
  const match = text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/);
  if (!match) return null;
  const raw = match[1].replace(/\./g, "").replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function extractQuantity(text: string): number {
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(gram|adet|çeyrek|ceyrek|yarım|yarim|tam)?/i);
  if (match) {
    const n = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

export function parseQuickEntry(
  input: string,
  userRules: Record<string, { category: string; needOrWant: "need" | "want" }>,
): ParsedTransactionDraft {
  const raw = input.trim();
  const lower = raw.toLocaleLowerCase("tr-TR");

  let occurredOn = todayIso();
  if (YESTERDAY_WORDS.some((w) => lower.includes(w))) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    occurredOn = todayIso(d);
  }

  const amount = extractAmount(lower) ?? 0;
  const hasAmount = amount > 0;

  // Gold purchase / sale detection
  for (const [phrase, kind] of Object.entries(GOLD_HINTS)) {
    if (lower.includes(phrase)) {
      const isSell = SELL_HINTS.some((w) => lower.includes(w));
      const quantity = extractQuantity(lower);
      return {
        type: isSell ? "investment_sell" : "investment_buy",
        amount,
        merchant: "Altın",
        category: "Yatırım",
        needOrWant: "need",
        occurredOn,
        confidence: hasAmount ? 0.85 : 0.4,
        assetKind: kind,
        assetQuantity: quantity,
        needsConfirmation: !hasAmount,
        rawInput: raw,
      };
    }
  }

  // FX purchase / sale detection
  for (const [word, kind] of Object.entries(CURRENCY_HINTS)) {
    if (lower.includes(word) && (BUY_HINTS.some((w) => lower.includes(w)) || SELL_HINTS.some((w) => lower.includes(w)))) {
      const isSell = SELL_HINTS.some((w) => lower.includes(w));
      return {
        type: isSell ? "investment_sell" : "investment_buy",
        amount,
        merchant: kind.toUpperCase(),
        category: "Yatırım",
        needOrWant: "need",
        occurredOn,
        confidence: hasAmount ? 0.8 : 0.35,
        assetKind: kind,
        assetQuantity: hasAmount ? amount : 0,
        needsConfirmation: !hasAmount,
        rawInput: raw,
      };
    }
  }

  // Income detection
  if (INCOME_HINTS.some((w) => lower.includes(w))) {
    const merchantGuessRaw = raw
      .replace(/\d{1,3}(\.\d{3})*(,\d+)?/g, "")
      .replace(/tl|try|₺/gi, "")
      .trim();
    return {
      type: "income",
      amount,
      merchant: merchantGuessRaw || "Gelir",
      category: lower.includes("maaş") || lower.includes("maas") ? "Maaş" : "Gelir",
      needOrWant: "need",
      occurredOn,
      confidence: hasAmount ? 0.9 : 0.4,
      needsConfirmation: !hasAmount,
      rawInput: raw,
    };
  }

  // Default: expense. Merchant = text with amount/currency words stripped.
  let merchantGuess = raw
    .replace(/\d{1,3}(\.\d{3})*(,\d+)?/g, "")
    .replace(/tl|try|₺/gi, "")
    .replace(new RegExp(`\\b(${[...TODAY_WORDS, ...YESTERDAY_WORDS].join("|")})\\b`, "gi"), "")
    .trim();
  if (!merchantGuess) merchantGuess = "İşlem";

  const merchantKey = normalizeMerchantKey(merchantGuess);
  const guess = guessCategory(merchantKey, userRules);

  return {
    type: "expense",
    amount,
    merchant: merchantGuess,
    category: guess?.category ?? "Diğer",
    needOrWant: guess?.needOrWant ?? "need",
    occurredOn,
    confidence: hasAmount ? (guess ? Math.min(0.95, 0.6 + guess.confidence * 0.35) : 0.5) : 0.3,
    needsConfirmation: !hasAmount || !guess,
    rawInput: raw,
  };
}


