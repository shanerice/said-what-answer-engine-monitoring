import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { parseJsonArray, requireBrand } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "List stored engine answers for a brand with the question, its funnel stage, cited URLs, and the approved facts to judge against. Awareness answers get all approved facts (the brand may be described anywhere) plus a visibility check. Use unjudgedOnly for answers still needing a verdict.",
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
        runAt: pr.runAt, judgedAt: pr.judgedAt, promptId: p.id, question: p.text, stage: p.stage, factIds: p.factIds,
      })
      .from(pr)
      .innerJoin(p, eq(p.id, pr.promptId))
      .where(unjudgedOnly ? and(eq(pr.brandId, brand.id), isNull(pr.judgedAt)) : eq(pr.brandId, brand.id))
      .orderBy(desc(pr.runAt))
      .limit(limit);
    const f = schema.facts;
    const approved = await getDb()
      .select({ id: f.id, category: f.category, claim: f.claim, canonicalValue: f.canonicalValue, evidenceQuote: f.evidenceQuote, severity: f.severity })
      .from(f)
      .where(and(eq(f.brandId, brand.id), eq(f.status, "approved")))
      .limit(80);
    const byId = new Map(approved.map((x) => [x.id, x]));
    const rank: Record<string, number> = { critical: 0, high: 1, low: 2 };
    const allFacts = [...approved].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)).slice(0, 30);
    return {
      brand: { id: brand.id, name: brand.name, domain: brand.domain },
      probes: rows.map((r) => {
        const linked = parseJsonArray(r.factIds).map((id) => byId.get(id)).filter(Boolean);
        return {
          id: r.id,
          stage: r.stage,
          engine: r.engine,
          model: r.model,
          question: r.question,
          answerText: r.answerText.slice(0, 4000),
          citedUrls: parseJsonArray(r.citedUrls),
          judged: !!r.judgedAt,
          needsVisibility: r.stage === "awareness",
          facts: r.stage === "awareness" && !linked.length ? allFacts : linked,
        };
      }),
    };
  },
});
