// Market rates: live gold (gram altın) + FX (USD/EUR/GBP → TRY) with manual
// fallback. Uses a free public API (no key required); on failure falls back to
// seeded approximate values so the app always shows a usable number and keeps
// working (the user can correct any value manually at any time).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import type { MarketRate } from "../finance";

const SYMBOLS = ["gram_altin", "usdtry", "eurtry", "gbptry"] as const;

// Seeded approximate fallback values — used only the first time a symbol has
// never been set (by API or by hand), so the dashboard never shows an empty
// dash. Clearly marked source: 'fallback'; the user should refresh/correct.
const FALLBACK_RATES: Record<(typeof SYMBOLS)[number], number> = {
  gram_altin: 4300,
  usdtry: 34,
  eurtry: 37,
  gbptry: 43,
};

async function fetchLiveRates(): Promise<{ rates: Partial<Record<string, number>>; errors: string[] }> {
  const out: Partial<Record<string, number>> = {};
  const errors: string[] = [];

  // Provider 1: open.er-api.com — free, no key.
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
      const rates = json.rates;
      if (json.result === "success" && rates?.TRY) {
        const usdTry = rates.TRY;
        out.usdtry = usdTry;
        // rates.EUR / rates.GBP are EUR-per-USD / GBP-per-USD (USD base) —
        // divide to get TRY-per-EUR / TRY-per-GBP.
        if (rates.EUR) out.eurtry = usdTry / rates.EUR;
        if (rates.GBP) out.gbptry = usdTry / rates.GBP;
      } else {
        errors.push(`open.er-api.com: unexpected payload (result=${json.result})`);
      }
    } else {
      errors.push(`open.er-api.com: HTTP ${res.status}`);
    }
  } catch (e) {
    errors.push(`open.er-api.com: ${e instanceof Error ? e.message : "unknown error"}`);
  }

  // Provider 2 (fallback): frankfurter.dev — free, no key, ECB-sourced.
  if (out.usdtry === undefined) {
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY,EUR,GBP", {
        signal: AbortSignal.timeout(6000),
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const json = (await res.json()) as { rates?: Record<string, number> };
        const usdTry = json.rates?.TRY;
        if (usdTry) {
          out.usdtry = usdTry;
          if (json.rates?.EUR) out.eurtry = usdTry / json.rates.EUR;
          if (json.rates?.GBP) out.gbptry = usdTry / json.rates.GBP;
        } else {
          errors.push("frankfurter.dev: no TRY rate in payload");
        }
      } else {
        errors.push(`frankfurter.dev: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`frankfurter.dev: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return { rates: out, errors };
}

export const getMarketRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketRate[]> => {
    const { DB } = bindings();
    if (!DB) return [];
    const rows = await DB.prepare("SELECT * FROM market_rates").all<{
      symbol: string;
      price: number;
      source: string;
      updated_at: string;
    }>();
    return (rows.results ?? []).map((r) => ({
      symbol: r.symbol,
      price: r.price,
      source: r.source as MarketRate["source"],
      updatedAt: r.updated_at,
    }));
  },
);

export const refreshMarketRates = createServerFn({ method: "POST" }).handler(async () => {
  await requireUserId();
  const { DB } = bindings();
  if (!DB) throw new Error("Veritabanı bağlantısı yok");

  const { rates: live, errors } = await fetchLiveRates();
  const now = new Date().toISOString();
  let updated = 0;

  for (const [symbol, price] of Object.entries(live)) {
    if (!price) continue;
    await DB.prepare(
      `INSERT INTO market_rates (symbol, price, source, updated_at) VALUES (?, ?, 'api', ?)
       ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, source = 'api', updated_at = excluded.updated_at`,
    )
      .bind(symbol, price, now)
      .run();
    updated++;
  }

  // For any symbol the live API didn't return (API down, or gold — no free
  // feed exists) AND that has never been set before, seed the fallback so the
  // dashboard never shows an empty dash. Never overwrites an existing value.
  for (const symbol of SYMBOLS) {
    if (live[symbol]) continue;
    const existing = await DB.prepare("SELECT price FROM market_rates WHERE symbol = ?")
      .bind(symbol)
      .first<{ price: number }>();
    if (!existing) {
      await DB.prepare(
        `INSERT INTO market_rates (symbol, price, source, updated_at) VALUES (?, ?, 'fallback', ?)`,
      )
        .bind(symbol, FALLBACK_RATES[symbol], now)
        .run();
    }
  }

  return { ok: true as const, updated, errors };
});

export const setManualRate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      symbol: z.enum(SYMBOLS),
      price: z.number().positive(),
    }),
  )
  .handler(async ({ data }) => {
    await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const now = new Date().toISOString();
    await DB.prepare(
      `INSERT INTO market_rates (symbol, price, source, updated_at) VALUES (?, ?, 'manual', ?)
       ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, source = 'manual', updated_at = excluded.updated_at`,
    )
      .bind(data.symbol, data.price, now)
      .run();
    return { ok: true as const };
  });




