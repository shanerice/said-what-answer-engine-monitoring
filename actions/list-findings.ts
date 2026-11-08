import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

export default defineAction({
  description: "List drift findings for a brand, most severe first. Filter by status new, confirmed or dismissed.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    status: z.enum(["all", "new", "confirmed", "dismissed"]).default("all").describe('Status filter; defaults to "all"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ brandId, status }, ctx) => {
    const brand = await requireBrand(brandId, ctx);
    const fi = schema.findings;
    const pr = schema.probes;
    const p = schema.prompts;
    const f = schema.facts;
    const rows = await getDb()
      .select({
        id: fi.id, verdict: fi.verdict, severity: fi.severity, status: fi.status, engineClaim: fi.engineClaim,
        engine: pr.engine, question: p.text, claim: f.claim, canonicalValue: f.canonicalValue, createdAt: fi.createdAt,
      })
      .from(fi)
      .innerJoin(pr, eq(pr.id, fi.probeId))
      .innerJoin(p, eq(p.id, pr.promptId))
      .innerJoin(f, eq(f.id, fi.factId))
      .where(status === "all" ? eq(fi.brandId, brand.id) : and(eq(fi.brandId, brand.id), eq(fi.status, status)))
      .orderBy(desc(fi.createdAt))
      .limit(100);
    const order: Record<string, number> = { critical: 0, high: 1, low: 2 };
    rows.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
    return { findings: rows };
  },
});
