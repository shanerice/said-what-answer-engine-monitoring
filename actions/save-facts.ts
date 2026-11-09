import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { normalizeWs, requireBrand } from "../server/lib/said-what.js";

export const FACT_CATEGORIES = [
  "trial_refund", "pricing", "security_compliance", "product_status", "limits", "deployment_integrations", "positioning",
] as const;
const SEVERITY: Record<(typeof FACT_CATEGORIES)[number], "critical" | "high" | "low"> = {
  trial_refund: "critical", pricing: "critical", security_compliance: "critical", product_status: "critical",
  limits: "high", deployment_integrations: "high", positioning: "low",
};

export default defineAction({
  description:
    "Save extracted GTM facts as drafts for human approval. Each evidenceQuote must appear verbatim in its source text; facts that fail that check are rejected and listed, the rest are saved.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    facts: z
      .array(
        z.object({
          sourceId: z.string().describe("Source id the quote comes from"),
          category: z.enum(FACT_CATEGORIES).describe(`One of: ${FACT_CATEGORIES.join(", ")}`),
          claim: z.string().min(3).describe('The checkable claim, e.g. "Free trial length"'),
          canonicalValue: z.string().min(1).describe('Short normalized value, e.g. "14 days"'),
          evidenceQuote: z.string().min(8).max(400).describe("Verbatim quote from the source text, 5-40 words"),
          note: z.string().optional().describe("Optional note, e.g. a conflict with another fact"),
        }),
      )
      .min(1)
      .max(60)
      .describe("Facts to save, 1-60"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const ids = [...new Set(args.facts.map((f) => f.sourceId))];
    const s = schema.sources;
    const rows = await getDb()
      .select({ id: s.id, text: s.fetchedText })
      .from(s)
      .where(and(inArray(s.id, ids), eq(s.brandId, brand.id)));
    const texts = new Map(rows.map((r) => [r.id, normalizeWs(r.text ?? "")]));
    // Re-running extraction must not duplicate facts: same category + same quote = same fact.
    const fx = schema.facts;
    const existing = await getDb()
      .select({ category: fx.category, quote: fx.evidenceQuote })
      .from(fx)
      .where(eq(fx.brandId, brand.id))
      .limit(1000);
    const seen = new Set(existing.map((e) => `${e.category}|${normalizeWs(e.quote)}`));
    let duplicates = 0;
    const rejected: { claim: string; reason: string }[] = [];
    const toInsert = [];
    for (const f of args.facts) {
      const text = texts.get(f.sourceId);
      if (text === undefined) {
        rejected.push({ claim: f.claim, reason: "unknown sourceId for this brand" });
        continue;
      }
      if (!text.includes(normalizeWs(f.evidenceQuote))) {
        rejected.push({ claim: f.claim, reason: "evidenceQuote not found verbatim in source text" });
        continue;
      }
      const key = `${f.category}|${normalizeWs(f.evidenceQuote)}`;
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      toInsert.push({
        id: crypto.randomUUID(),
        brandId: brand.id,
        sourceId: f.sourceId,
        category: f.category,
        claim: f.claim,
        canonicalValue: f.canonicalValue,
        evidenceQuote: f.evidenceQuote,
        severity: SEVERITY[f.category],
        status: "draft",
        note: f.note ?? null,
        ownerEmail: brand.ownerEmail,
        orgId: brand.orgId,
      });
    }
    if (!toInsert.length && !duplicates)
      fail("No facts saved: every evidence quote failed the verbatim check.", {
        errorCode: "no_valid_facts",
        details: { rejected },
      });
    if (!toInsert.length)
      return { saved: 0, duplicates, rejected, message: `All ${duplicates} facts already exist; nothing new saved.` };
    await getDb().insert(schema.facts).values(toInsert);
    return {
      saved: toInsert.length,
      duplicates,
      rejected,
      message: `Saved ${toInsert.length} draft facts${duplicates ? `; skipped ${duplicates} already saved` : ""}${rejected.length ? `; rejected ${rejected.length}` : ""}. A human approves them on the Ground Truth screen or via update-fact.`,
    };
  },
});
