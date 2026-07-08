import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";
import { requireUserId } from "../auth.server";
import { getDashboardSnapshot } from "./dashboard.functions";
import { currentPeriod } from "../format";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

function rowToNotification(r: any): NotificationRow {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    read: !!r.read,
    createdAt: r.created_at,
  };
}

export const listNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationRow[]> => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) return [];
    const rows = await DB.prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(userId)
      .all();
    return (rows.results ?? []).map(rowToNotification);
  },
);

export const markNotificationRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { DB } = bindings();
    if (!DB) throw new Error("Veritabanı bağlantısı yok");
    await DB.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?")
      .bind(data.id, userId)
      .run();
    return { ok: true as const };
  });

// Regenerates the notification feed from the current live snapshot — called
// whenever the notifications page loads, so alerts always reflect today's
// real state (bill due soon, overspending, cash shortage predicted, goal
// reached). Avoids duplicate spam by checking existing unread items per kind.
export const refreshNotifications = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const { DB } = bindings();
  if (!DB) throw new Error("Veritabanı bağlantısı yok");
  const snapshot = await getDashboardSnapshot();
  const period = currentPeriod();

  async function upsertKind(kind: string, title: string, body: string) {
    const existing = await DB!.prepare(
      "SELECT id FROM notifications WHERE user_id = ? AND kind = ? AND created_at >= datetime('now', '-1 day')",
    )
      .bind(userId, kind)
      .first<{ id: string }>();
    if (existing) return;
    await DB!.prepare(
      "INSERT INTO notifications (id, user_id, kind, title, body) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), userId, kind, title, body)
      .run();
  }

  const today = new Date().getDate();
  const dueToday = snapshot.upcomingBills.filter((b) => b.dueDay === today);
  for (const bill of dueToday) {
    await upsertKind(
      "bill_due",
      "Ödeme günü geldi",
      `${bill.name} ödemesi bugün (${bill.amount.toLocaleString("tr-TR")} TL).`,
    );
  }

  if (snapshot.shortageDay) {
    await upsertKind(
      "cash_shortage",
      "Nakit açığı riski",
      `${snapshot.shortageDay.date.split("-").reverse().join(".")} tarihinde bakiyenin eksiye düşmesi öngörülüyor.`,
    );
  }

  for (const budgetCat of snapshot.categoryBreakdown) {
    const budgetRow = await DB.prepare(
      "SELECT monthly_limit FROM budgets WHERE user_id = ? AND category = ?",
    )
      .bind(userId, budgetCat.category)
      .first<{ monthly_limit: number }>();
    if (budgetRow && budgetCat.amount > budgetRow.monthly_limit) {
      await upsertKind(
        "budget_exceeded",
        "Bütçe aşıldı",
        `${budgetCat.category} kategorisinde bu ayki bütçeni aştın.`,
      );
    }
  }

  for (const goal of snapshot.goals) {
    if (goal.currentAmount >= goal.targetAmount) {
      await upsertKind("goal_reached", "Hedefe ulaşıldı", `"${goal.name}" hedefine ulaştın, tebrikler.`);
    }
  }

  return { ok: true as const };
});

