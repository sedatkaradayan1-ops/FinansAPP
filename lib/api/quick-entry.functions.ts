import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { parseQuickEntry, type ParsedTransactionDraft } from "../quick-entry-parser";

export const previewQuickEntry = createServerFn({ method: "POST" })
  .inputValidator(z.object({ text: z.string().min(1).max(300) }))
  .handler(async ({ data }): Promise<ParsedTransactionDraft> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    let rules: Record<string, { category: string; needOrWant: "need" | "want" }> = {};
    if (DB) {
      const rows = await DB.prepare(
        "SELECT merchant_key, category, need_or_want FROM category_rules WHERE user_id = ?",
      )
        .bind(userId)
        .all<{ merchant_key: string; category: string; need_or_want: "need" | "want" }>();
      for (const r of rows.results ?? []) {
        rules[r.merchant_key] = { category: r.category, needOrWant: r.need_or_want };
      }
    }
    return parseQuickEntry(data.text, rules);
  });

export const commitQuickEntry = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      type: z.enum(["income", "expense", "transfer", "investment_buy", "investment_sell"]),
      amount: z.number().positive(),
      merchant: z.string().min(1),
      category: z.string().min(1),
      needOrWant: z.enum(["need", "want"]),
      occurredOn: z.string(),
      accountId: z.string().nullable().optional(),
      rawInput: z.string(),
      confidence: z.number(),
      assetKind: z
        .enum(["gram_altin", "ceyrek_altin", "yarim_altin", "tam_altin", "usd", "eur", "gbp"])
        .optional(),
      assetQuantity: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");

    const txId = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO transactions
        (id, user_id, account_id, type, amount, currency, merchant, category, need_or_want, note, occurred_on, source, raw_input, confidence)
       VALUES (?, ?, ?, ?, ?, 'TRY', ?, ?, ?, NULL, ?, 'quick_entry', ?, ?)`,
    )
      .bind(
        txId,
        userId,
        data.accountId ?? null,
        data.type,
        data.amount,
        data.merchant,
        data.category,
        data.needOrWant,
        data.occurredOn,
        data.rawInput,
        data.confidence,
      )
      .run();

    if (data.accountId) {
      const account = await DB.prepare("SELECT type FROM accounts WHERE id = ? AND user_id = ?")
        .bind(data.accountId, userId)
        .first<{ type: string }>();
      if (account) {
        const isCreditLike = account.type === "credit_card" || account.type === "overdraft";
        let delta = 0;
        if (data.type === "income" || data.type === "investment_sell") delta = data.amount;
        else if (data.type === "expense" || data.type === "investment_buy") {
          delta = isCreditLike ? data.amount : -data.amount;
        }
        await DB.prepare("UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?")
          .bind(delta, data.accountId)
          .run();
      }
    }

    // Investment moves also adjust the underlying asset holding.
    if ((data.type === "investment_buy" || data.type === "investment_sell") && data.assetKind) {
      const qty = data.assetQuantity && data.assetQuantity > 0 ? data.assetQuantity : 0;
      const signedQty = data.type === "investment_buy" ? qty : -qty;
      const unitCost = qty > 0 ? data.amount / qty : 0;
      const existing = await DB.prepare(
        "SELECT id, quantity, avg_cost_try FROM assets WHERE user_id = ? AND kind = ? LIMIT 1",
      )
        .bind(userId, data.assetKind)
        .first<{ id: string; quantity: number; avg_cost_try: number }>();

      if (existing) {
        const newQuantity = existing.quantity + signedQty;
        let newAvgCost = existing.avg_cost_try;
        if (signedQty > 0) {
          const totalOld = existing.quantity * existing.avg_cost_try;
          const totalNew = signedQty * unitCost;
          newAvgCost = newQuantity > 0 ? (totalOld + totalNew) / newQuantity : existing.avg_cost_try;
        }
        await DB.prepare(
          "UPDATE assets SET quantity = ?, avg_cost_try = ?, updated_at = datetime('now') WHERE id = ?",
        )
          .bind(Math.max(0, newQuantity), newAvgCost, existing.id)
          .run();
      } else if (signedQty > 0) {
        await DB.prepare(
          `INSERT INTO assets (id, user_id, kind, label, quantity, avg_cost_try) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(crypto.randomUUID(), userId, data.assetKind, data.merchant, signedQty, unitCost)
          .run();
      }
    }

    // Learn category preference (remember forever) for plain expenses.
    if (data.type === "expense") {
      const { normalizeMerchantKey } = await import("../finance");
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

    return { id: txId };
  });

