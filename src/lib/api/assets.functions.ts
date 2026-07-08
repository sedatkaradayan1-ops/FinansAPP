import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import type { Asset, AssetKind } from "../finance";

function rowToAsset(r: any): Asset {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    quantity: r.quantity,
    avgCostTry: r.avg_cost_try,
  };
}

const assetKindEnum = z.enum([
  "gram_altin",
  "ceyrek_altin",
  "yarim_altin",
  "tam_altin",
  "usd",
  "eur",
  "gbp",
  "stock",
  "fund",
  "custom",
]);

export const listAssets = createServerFn({ method: "GET" }).handler(async (): Promise<Asset[]> => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) return [];
  const rows = await DB.prepare("SELECT * FROM assets WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all();
  return (rows.results ?? []).map(rowToAsset);
});

export const createAsset = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: assetKindEnum,
      label: z.string().min(1).max(80),
      quantity: z.number(),
      avgCostTry: z.number().default(0),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO assets (id, user_id, kind, label, quantity, avg_cost_try) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, data.kind, data.label, data.quantity, data.avgCostTry)
      .run();
    return { id };
  });

export const adjustAsset = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      deltaQuantity: z.number(),
      unitCostTry: z.number().optional(), // for buys, recompute weighted avg cost
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    const existing = await DB.prepare("SELECT * FROM assets WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .first<{ quantity: number; avg_cost_try: number }>();
    if (!existing) throw new Error("Varlık bulunamadı");

    const newQuantity = existing.quantity + data.deltaQuantity;
    let newAvgCost = existing.avg_cost_try;
    if (data.deltaQuantity > 0 && data.unitCostTry !== undefined) {
      const totalOld = existing.quantity * existing.avg_cost_try;
      const totalNew = data.deltaQuantity * data.unitCostTry;
      newAvgCost = newQuantity > 0 ? (totalOld + totalNew) / newQuantity : existing.avg_cost_try;
    }

    await DB.prepare(
      "UPDATE assets SET quantity = ?, avg_cost_try = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    )
      .bind(Math.max(0, newQuantity), newAvgCost, data.id, userId)
      .run();
    return { ok: true as const };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("DELETE FROM assets WHERE id = ? AND user_id = ?").bind(data.id, userId).run();
    return { ok: true as const };
  });

