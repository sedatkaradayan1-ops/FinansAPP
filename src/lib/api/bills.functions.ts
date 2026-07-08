import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import type { Bill, RecurringIncome } from "../finance";

function rowToBill(r: any): Bill {
  return {
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
  };
}

export const listBills = createServerFn({ method: "GET" }).handler(async (): Promise<Bill[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM bills WHERE user_id = ? AND active = 1 ORDER BY due_day ASC")
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToBill);
});

export const createBill = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      category: z.string().default("Abonelik"),
      amount: z.number().positive(),
      currency: z.string().default("TRY"),
      dueDay: z.number().int().min(1).max(31),
      lateFee: z.number().default(0),
      priority: z.enum(["critical", "normal", "low"]).default("normal"),
      accountId: z.string().nullable().optional(),
      autopay: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO bills (id, user_id, name, category, amount, currency, due_day, late_fee, priority, account_id, autopay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        data.name,
        data.category,
        data.amount,
        data.currency,
        data.dueDay,
        data.lateFee,
        data.priority,
        data.accountId ?? null,
        data.autopay ? 1 : 0,
      )
      .run();
    return { id };
  });

export const markBillPaid = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), period: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const bill = await DB.prepare("SELECT * FROM bills WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .first<{ name: string; amount: number; category: string; account_id: string | null }>();
    if (!bill) throw new Error("Fatura bulunamadı");

    await DB.prepare("UPDATE bills SET last_paid_period = ? WHERE id = ? AND user_id = ?")
      .bind(data.period, data.id, userId)
      .run();

    const txId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    await DB.prepare(
      `INSERT INTO transactions (id, user_id, account_id, type, amount, currency, merchant, category, need_or_want, note, occurred_on, source)
       VALUES (?, ?, ?, 'expense', ?, 'TRY', ?, ?, 'need', 'Fatura ödemesi', ?, 'recurring')`,
    )
      .bind(txId, userId, bill.account_id, bill.amount, bill.name, bill.category, today)
      .run();

    if (bill.account_id) {
      await DB.prepare("UPDATE accounts SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?")
        .bind(bill.amount, bill.account_id)
        .run();
    }

    return { ok: true as const };
  });

export const deleteBill = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("UPDATE bills SET active = 0 WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

// --- Recurring income --------------------------------------------------------

function rowToIncome(r: any): RecurringIncome {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    payDay: r.pay_day,
    accountId: r.account_id,
    active: !!r.active,
  };
}

export const listRecurringIncome = createServerFn({ method: "GET" }).handler(async (): Promise<
  RecurringIncome[]
> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM recurring_income WHERE user_id = ? AND active = 1")
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToIncome);
});

export const createRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      amount: z.number().positive(),
      payDay: z.number().int().min(1).max(31),
      accountId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO recurring_income (id, user_id, name, amount, pay_day, account_id) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, data.name, data.amount, data.payDay, data.accountId ?? null)
      .run();
    return { id };
  });

export const deleteRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("UPDATE recurring_income SET active = 0 WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .run();
    return { ok: true as const };
  });

