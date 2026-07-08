import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import type { Budget, Goal, Debt } from "../finance";

// --- Budgets ------------------------------------------------------------------

export const listBudgets = createServerFn({ method: "GET" }).handler(async (): Promise<Budget[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM budgets WHERE user_id = ?").bind(userId).all<{
    id: string;
    category: string;
    monthly_limit: number;
  }>();
  return (rows.results ?? []).map((r) => ({ id: r.id, category: r.category, monthlyLimit: r.monthly_limit }));
});

export const upsertBudget = createServerFn({ method: "POST" })
  .inputValidator(z.object({ category: z.string().min(1), monthlyLimit: z.number().positive() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare(
      `INSERT INTO budgets (id, user_id, category, monthly_limit) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
    )
      .bind(crypto.randomUUID(), userId, data.category, data.monthlyLimit)
      .run();
    return { ok: true as const };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("DELETE FROM budgets WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

// --- Goals --------------------------------------------------------------------

function rowToGoal(r: any): Goal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    currentAmount: r.current_amount,
    targetDate: r.target_date,
    color: r.color,
    icon: r.icon,
  };
}

export const listGoals = createServerFn({ method: "GET" }).handler(async (): Promise<Goal[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToGoal);
});

export const createGoal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      targetAmount: z.number().positive(),
      currentAmount: z.number().default(0),
      targetDate: z.string().nullable().optional(),
      color: z.string().default("#4fae8a"),
      icon: z.string().default("target"),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO goals (id, user_id, name, target_amount, current_amount, target_date, color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, data.name, data.targetAmount, data.currentAmount, data.targetDate ?? null, data.color, data.icon)
      .run();
    return { id };
  });

export const contributeToGoal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), amount: z.number().positive() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare(
      "UPDATE goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?",
    )
      .bind(data.amount, data.id, userId)
      .run();
    return { ok: true as const };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

// --- Debts --------------------------------------------------------------------

function rowToDebt(r: any): Debt {
  return {
    id: r.id,
    name: r.name,
    principalRemaining: r.principal_remaining,
    originalPrincipal: r.original_principal,
    interestRate: r.interest_rate,
    monthlyPayment: r.monthly_payment,
    dueDay: r.due_day,
    monthsRemaining: r.months_remaining,
  };
}

export const listDebts = createServerFn({ method: "GET" }).handler(async (): Promise<Debt[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM debts WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToDebt);
});

export const createDebt = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      principalRemaining: z.number().positive(),
      originalPrincipal: z.number().positive(),
      interestRate: z.number().default(0),
      monthlyPayment: z.number().positive(),
      dueDay: z.number().int().min(1).max(31).default(1),
      monthsRemaining: z.number().int().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO debts (id, user_id, name, principal_remaining, original_principal, interest_rate, monthly_payment, due_day, months_remaining)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        data.name,
        data.principalRemaining,
        data.originalPrincipal,
        data.interestRate,
        data.monthlyPayment,
        data.dueDay,
        data.monthsRemaining ?? null,
      )
      .run();
    return { id };
  });

export const recordDebtPayment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), amount: z.number().positive() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare(
      "UPDATE debts SET principal_remaining = MAX(0, principal_remaining - ?) WHERE id = ? AND user_id = ?",
    )
      .bind(data.amount, data.id, userId)
      .run();
    return { ok: true as const };
  });

export const deleteDebt = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("DELETE FROM debts WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

