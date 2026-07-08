import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";

export const updateUserSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      displayName: z.string().min(1).max(60).optional(),
      paydayDay: z.number().int().min(1).max(31).optional(),
      monthlyIncomeEstimate: z.number().min(0).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");

    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.displayName !== undefined) { sets.push("display_name = ?"); values.push(data.displayName); }
    if (data.paydayDay !== undefined) { sets.push("payday_day = ?"); values.push(data.paydayDay); }
    if (data.monthlyIncomeEstimate !== undefined) {
      sets.push("monthly_income_estimate = ?");
      values.push(data.monthlyIncomeEstimate);
    }
    if (sets.length === 0) return { ok: true as const };

    await DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, userId)
      .run();
    return { ok: true as const };
  });

