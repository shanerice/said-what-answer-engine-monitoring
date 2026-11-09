import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

const INTENTS = ["category", "problem", "trial", "pricing", "security", "status", "limits", "integrations", "comparison", "general"] as const;
const STAGES = ["awareness", "consideration"] as const;

export default defineAction({
  description:
    "Save buyer questions for a brand. awareness = generic category/problem questions that never name the brand (tests whether and how the brand shows up); consideration = questions that name the brand and test specific approved fact ids.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    prompts: z
      .array(
        z.object({
          stage: z.enum(STAGES).describe('"awareness" (no brand name, factIds optional) or "consideration" (names the brand, needs factIds)'),
          text: z.string().min(8).describe('Question as a buyer would type it, e.g. "What is the best AI writing assistant for a sales team?"'),
          intent: z.enum(INTENTS).default("general").describe(`One of: ${INTENTS.join(", ")}`),
          factIds: z.array(z.string()).default([]).describe("Approved fact ids this question tests; required for consideration"),
        }),
      )
      .min(1)
      .max(24)
      .describe("Questions, 1-24"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const name = brand.name.toLowerCase();
    for (const p of args.prompts) {
      const names = p.text.toLowerCase().includes(name);
      if (p.stage === "awareness" && names)
        fail(`Awareness questions must not name ${brand.name}: "${p.text}"`, { errorCode: "awareness_names_brand" });
      if (p.stage === "consideration" && !p.factIds.length)
        fail(`Consideration question needs factIds: "${p.text}"`, { errorCode: "missing_fact_ids" });
    }
    const ids = [...new Set(args.prompts.flatMap((p) => p.factIds))];
    if (ids.length) {
      const f = schema.facts;
      const found = await getDb()
        .select({ id: f.id })
        .from(f)
        .where(and(inArray(f.id, ids), eq(f.brandId, brand.id), eq(f.status, "approved")));
      const ok = new Set(found.map((x) => x.id));
      const missing = ids.filter((id) => !ok.has(id));
      if (missing.length)
        fail("Some factIds are not approved facts of this brand.", { errorCode: "unknown_fact_ids", details: { missing: missing.slice(0, 10) } });
    }
    const rows = args.prompts.map((p) => ({
      id: crypto.randomUUID(),
      brandId: brand.id,
      stage: p.stage,
      text: p.text,
      intent: p.intent,
      factIds: JSON.stringify(p.factIds),
      ownerEmail: brand.ownerEmail,
      orgId: brand.orgId,
    }));
    await getDb().insert(schema.prompts).values(rows);
    const awareness = rows.filter((r) => r.stage === "awareness").length;
    return {
      saved: rows.length,
      awareness,
      consideration: rows.length - awareness,
      ids: rows.map((r) => r.id),
      nextRequiredAction: "run-probe",
    };
  },
});
