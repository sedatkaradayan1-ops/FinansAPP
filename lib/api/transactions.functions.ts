import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { normalizeMerchantKey, type Transaction, type TxType } from "../finance";

function rowToTx(r: any): Transaction {
  return {
    id: r.id,
    accountId: r.account_id,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    merchant: r.merchant,
    category: r.category,
    needOrWant: r.need_or_want,
    note: r.note,
    occurredOn: r.occurred_on,
    source: r.source,
    rawInput: r.raw_input,
    confidence: r.confidence,
  };
}

const txTypeEnum = z.enum(["income", "expense", "transfer", "investment_buy", "investment_sell"]);

export const listTransactions = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        limit: z.number().int().min(1).max(500).default(200),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        category: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<Transaction[]> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) return [];
    const limit = data?.limit ?? 200;
    let sql = "SELECT * FROM transactions WHERE user_id = ?";
    const params: unknown[] = [userId];
    if (data?.fromDate) {
      sql += " AND occurred_on >= ?";
      params.push(data.fromDate);
    }
    if (data?.toDate) {
      sql += " AND occurred_on <= ?";
      params.push(data.toDate);
    }
    if (data?.category) {
      sql += " AND category = ?";
      params.push(data.category);
    }
    sql += " ORDER BY occurred_on DESC, created_at DESC LIMIT ?";
    params.push(limit);
    const rows = await DB.prepare(sql).bind(...params).all();
    return (rows.results ?? []).map(rowToTx);
  });

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string().nullable().optional(),
      type: txTypeEnum,
      amount: z.number().positive(),
      currency: z.string().default("TRY"),
      merchant: z.string().nullable().optional(),
      category: z.string().default("Diğer"),
      needOrWant: z.enum(["need", "want"]).default("need"),
      note: z.string().nullable().optional(),
      occurredOn: z.string(),
      source: z.string().default("manual"),
      rawInput: z.string().nullable().optional(),
      confidence: z.number().default(1),
      applyToAccountBalance: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();

    await DB.prepare(
      `INSERT INTO transactions
        (id, user_id, account_id, type, amount, currency, merchant, category, need_or_want, note, occurred_on, source, raw_input, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        data.accountId ?? null,
        data.type,
        data.amount,
        data.currency,
        data.merchant ?? null,
        data.category,
        data.needOrWant,
        data.note ?? null,
        data.occurredOn,
        data.source,
        data.rawInput ?? null,
        data.confidence,
      )
      .run();

    // Apply to account balance
    if (data.applyToAccountBalance && data.accountId) {
      const account = await DB.prepare("SELECT type, balance FROM accounts WHERE id = ? AND user_id = ?")
        .bind(data.accountId, userId)
        .first<{ type: string; balance: number }>();
      if (account) {
        const isCreditLike = account.type === "credit_card" || account.type === "overdraft";
        let delta = 0;
        if (data.type === "income") delta = data.amount;
        else if (data.type === "expense" || data.type === "investment_buy") {
          delta = isCreditLike ? data.amount : -data.amount; // credit card expense increases debt
        } else if (data.type === "investment_sell") {
          delta = data.amount;
        }
        await DB.prepare("UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?")
          .bind(delta, data.accountId)
          .run();
      }
    }

    // Learn category preference for this merchant (remember forever).
    if (data.merchant && data.type === "expense") {
      const key = normalizeMerchantKey(data.merchant);
      await DB.prepare(
        `INSERT INTO category_rules (id, user_id, merchant_key, category, need_or_want, hit_count)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(user_id, merchant_key) DO UPDATE SET
           category = excluded.category,
           need_or_want = excluded.need_or_want,
           hit_count = category_rules.hit_count + 1,
           updated_at = datetime('now')`,
      )
        .bind(crypto.randomUUID(), userId, key, data.category, data.needOrWant)
        .run();
    }

    return { id };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

export const recategorizeTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      category: z.string(),
      needOrWant: z.enum(["need", "want"]),
      rememberForMerchant: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");

    const tx = await DB.prepare("SELECT merchant FROM transactions WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .first<{ merchant: string | null }>();

    await DB.prepare("UPDATE transactions SET category = ?, need_or_want = ? WHERE id = ? AND user_id = ?")
      .bind(data.category, data.needOrWant, data.id, userId)
      .run();

    if (data.rememberForMerchant && tx?.merchant) {
      const key = normalizeMerchantKey(tx.merchant);
      await DB.prepare(
        `INSERT INTO category_rules (id, user_id, merchant_key, category, need_or_want, hit_count)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(user_id, merchant_key) DO UPDATE SET
           category = excluded.category,
           need_or_want = excluded.need_or_want,
           hit_count = category_rules.hit_count + 1,
           updated_at = datetime('now')`,
      )
        .bind(crypto.randomUUID(), userId, key, data.category, data.needOrWant)
        .run();
    }

    return { ok: true as const };
  });

export const getCategoryRules = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return {} as Record<string, { category: string; needOrWant: "need" | "want" }>;
  const rows = await DB.prepare("SELECT merchant_key, category, need_or_want FROM category_rules WHERE user_id = ?")
    .bind(userId)
    .all<{ merchant_key: string; category: string; need_or_want: "need" | "want" }>();
  const out: Record<string, { category: string; needOrWant: "need" | "want" }> = {};
  for (const r of rows.results ?? []) {
    out[r.merchant_key] = { category: r.category, needOrWant: r.need_or_want };
  }
  return out;
});

