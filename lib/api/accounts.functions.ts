import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import type { Account, AccountType } from "../finance";

function rowToAccount(r: any): Account {
  return {
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
  };
}

export const listAccounts = createServerFn({ method: "GET" }).handler(async (): Promise<Account[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare(
    "SELECT * FROM accounts WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, created_at ASC",
  )
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToAccount);
});

const accountTypeEnum = z.enum([
  "bank",
  "cash",
  "credit_card",
  "currency",
  "gold",
  "investment",
  "overdraft",
  "custom",
]);

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(80),
      type: accountTypeEnum,
      currency: z.string().min(1).max(8).default("TRY"),
      balance: z.number().default(0),
      creditLimit: z.number().nullable().optional(),
      color: z.string().default("#e8527c"),
      icon: z.string().default("wallet"),
      isEmergencyFund: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance, credit_limit, color, icon, is_emergency_fund)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        data.name,
        data.type,
        data.currency,
        data.balance,
        data.creditLimit ?? null,
        data.color,
        data.icon,
        data.isEmergencyFund ? 1 : 0,
      )
      .run();
    return { id };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(80).optional(),
      balance: z.number().optional(),
      creditLimit: z.number().nullable().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      isEmergencyFund: z.boolean().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");

    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { sets.push("name = ?"); values.push(data.name); }
    if (data.balance !== undefined) { sets.push("balance = ?"); values.push(data.balance); }
    if (data.creditLimit !== undefined) { sets.push("credit_limit = ?"); values.push(data.creditLimit); }
    if (data.color !== undefined) { sets.push("color = ?"); values.push(data.color); }
    if (data.icon !== undefined) { sets.push("icon = ?"); values.push(data.icon); }
    if (data.isEmergencyFund !== undefined) { sets.push("is_emergency_fund = ?"); values.push(data.isEmergencyFund ? 1 : 0); }
    if (data.archived !== undefined) { sets.push("archived = ?"); values.push(data.archived ? 1 : 0); }
    if (sets.length === 0) return { ok: true as const };
    sets.push("updated_at = datetime('now')");

    await DB.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
      .bind(...values, data.id, userId)
      .run();
    return { ok: true as const };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("UPDATE accounts SET archived = 1 WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .run();
    return { ok: true as const };
  });

