import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDashboardSnapshot } from "./dashboard.functions";
import { formatTry, formatPercent } from "../format";
import { healthScoreLabel } from "../finance";

// Deterministic, data-grounded finance assistant. No external LLM call — it
// answers directly from the user's real snapshot (safe-to-spend, cash flow
// forecast, gold/asset holdings, health score) so it always stays accurate
// and instant, matching "should answer using my real financial data".

export type AssistantAnswer = { answer: string };

function normalize(q: string): string {
  return q.toLocaleLowerCase("tr-TR").trim();
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator(z.object({ question: z.string().min(1).max(500) }))
  .handler(async ({ data }): Promise<AssistantAnswer> => {
    const snapshot = await getDashboardSnapshot();
    const q = normalize(data.question);

    // "Bugün ne kadar harcayabilirim?"
    if (q.includes("ne kadar harca") || q.includes("harcayabilir")) {
      return {
        answer: `Bugün güvenle ${formatTry(Math.round(snapshot.safeToSpend.perDay))} harcayabilirsin. Bu, maaş gününe kadar (${snapshot.daysUntilPayday} gün) kalan likit bakiyenden yaklaşan ödemeler düşülerek hesaplandı.`,
      };
    }

    // "Maaş gelene kadar yeter mi?"
    if (q.includes("yeter mi") || q.includes("maaşa kadar") || q.includes("maaşa yeter")) {
      if (snapshot.shortageDay) {
        return {
          answer: `Hayır, mevcut tahmine göre ${snapshot.shortageDay.date.split("-").reverse().join(".")} tarihinde bakiyenin eksiye düşmesi bekleniyor. Harcamalarını kısman veya bir ödemeyi ertelemen gerekebilir.`,
        };
      }
      return {
        answer: `Evet, mevcut harcama hızınla maaş gününe (${snapshot.daysUntilPayday} gün sonra) kadar bakiyenin yeterli görünüyor. Güvenle harcanabilir günlük tutar: ${formatTry(Math.round(snapshot.safeToSpend.perDay))}.`,
      };
    }

    // "Altın satmalı mıyım?"
    if (q.includes("altın sat") || q.includes("altını sat")) {
      const goldAssets = snapshot.assets.filter((a) => a.kind.includes("altin"));
      if (goldAssets.length === 0) {
        return { answer: "Şu anda kayıtlı bir altın varlığın görünmüyor, satılacak bir şey yok." };
      }
      if (snapshot.shortageDay) {
        return {
          answer:
            "Nakit akışı tahminine göre önümüzdeki günlerde bir açık oluşabilir. Altın varlığının bir kısmını satmak bu açığı kapatmana yardımcı olabilir, ama önce diğer likit hesaplarını kontrol et.",
        };
      }
      return {
        answer:
          "Nakit akışında görünen bir risk yok, bu yüzden altını acil ihtiyaç için satmana gerek görünmüyor. Uzun vadeli bir hedefin varsa altını tutmaya devam edebilirsin.",
      };
    }

    // "Bu ay nerede gereksiz harcadım?"
    if (q.includes("gereksiz") || q.includes("nerede harca")) {
      const top = snapshot.categoryBreakdown[0];
      if (!top) return { answer: "Bu ay için henüz yeterli harcama verisi yok." };
      return {
        answer: `Bu ay en çok ${top.category} kategorisinde harcadın: ${formatTry(top.amount)}. Bu kategoriyi gözden geçirmek tasarruf potansiyeli yaratabilir.`,
      };
    }

    // "Nasıl daha fazla birikim yaparım?"
    if (q.includes("birikim yap") || q.includes("nasıl birik") || q.includes("tasarruf")) {
      const savingsRate = snapshot.healthInputs.savingsRate;
      return {
        answer: `Şu anki tasarruf oranın gelirinin ${formatPercent(Math.max(0, savingsRate))}'i. Harcama planındaki en yüksek kategoriyi %10 kısarak ve otomatik bir birikim hedefi oluşturarak bu oranı artırabilirsin.`,
      };
    }

    // "Bu telefonu alabilir miyim?" (generic large purchase)
    if (q.includes("alabilir miyim") || q.includes("satın alabilir")) {
      const amountMatch = data.question.match(/(\d{1,3}(\.\d{3})*(,\d+)?|\d+)/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/\./g, "").replace(",", ".")) : null;
      if (amount) {
        const monthsOfSafe = amount / Math.max(1, snapshot.safeToSpend.perDay * 30);
        if (amount <= snapshot.safeToSpend.total) {
          return {
            answer: `Evet, ${formatTry(amount)} tutarındaki bu harcama güvenle harcanabilir tutarının içinde kalıyor.`,
          };
        }
        return {
          answer: `${formatTry(amount)} tutarı şu anki güvenle harcanabilir tutarını (${formatTry(Math.round(snapshot.safeToSpend.total))}) aşıyor. Yaklaşık ${Math.ceil(monthsOfSafe)} ay biriktirerek almanı öneririm, ya da bir hedefe böl.`,
        };
      }
      return {
        answer: `Güvenle harcanabilir tutarın ${formatTry(Math.round(snapshot.safeToSpend.total))}. Bu tutarın içinde kalan bir harcama şu an için güvenli.`,
      };
    }

    // Health score question
    if (q.includes("sağlık skoru") || q.includes("finansal durum")) {
      return {
        answer: `Finansal sağlık skorun ${snapshot.healthScore}/100 (${healthScoreLabel(snapshot.healthScore)}). Tasarruf oranı, acil durum fonu, borç/gelir oranı ve bütçe uyumuna göre hesaplanıyor.`,
      };
    }

    // Fallback: general status summary
    return {
      answer: `Net varlığın ${formatTry(Math.round(snapshot.netWorth))}, güvenle harcanabilir tutarın ${formatTry(Math.round(snapshot.safeToSpend.total))} ve finansal sağlık skorun ${snapshot.healthScore}/100. Daha spesifik bir soru sorarsan (ör. "bugün ne kadar harcayabilirim?") daha net bir cevap verebilirim.`,
    };
  });


