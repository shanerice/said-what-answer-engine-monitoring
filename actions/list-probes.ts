import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { parseJsonArray, requireBrand } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "List stored engine answers for a brand with the question, the cited URLs, and the approved facts each question tests. Use unjudgedOnly to get the answers that still need a drift verdict.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    unjudgedOnly: z.boolean().default(true).describe("Only answers with no verdict yet; defaults to true"),
    limit: z.coerce.number().int().min(1).max(40).default(20).describe("Max answers, 1-40; defaults to 20"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ brandId, unjudgedOnly, limit }, ctx) => {
    const brand = await requireBrand(brandId, ctx);
    const pr = schema.probes;
    const p = schema.prompts;
    const rows = await getDb()
      .select({
        id: pr.id, engine: pr.engine, model: pr.model, answerText: pr.answerText, citedUrls: pr.citedUrls,
        runAt: pr.runAt, judgedAt: pr.judgedAt, promptId: p.id, question: p.text, factIds: p.factIds,
      })
      .from(pr)
      .innerJoin(p, eq(p.id, pr.promptId))
      .where(unjudgedOnly ? and(eq(pr.brandId, brand.id), isNull(pr.judgedAt)) : eq(pr.brandId, brand.id))
      .orderBy(desc(pr.runAt))
      .limit(limit);
    const factIds = [...new Set(rows.flatMap((r) => parseJsonArray(r.factIds)))];
    const f = schema.facts;
    const facts = factIds.length
      ? await getDb()
          .select({ id: f.id, category: f.category, claim: f.claim, canonicalValue: f.canonicalValue, evidenceQuote: f.evidenceQuote, severity: f.severity })
          .from(f)
          .where(and(inArray(f.id, factIds), eq(f.status, "approved")))
      : [];
    const byId = new Map(facts.map((x) => [x.id, x]));
    return {
      probes: rows.map((r) => ({
        id: r.id,
        engine: r.engine,
        model: r.model,
        question: r.question,
        answerText: r.answerText.slice(0, 4000),
        citedUrls: parseJsonArray(r.citedUrls),
        judged: !!r.judgedAt,
        facts: parseJsonArray(r.factIds).map((id) => byId.get(id)).filter(Boolean),
      })),
    };
  },
});
