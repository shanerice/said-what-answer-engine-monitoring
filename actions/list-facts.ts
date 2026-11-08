import { defineAction } from "@agent-native/core/action";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "List a brand's ground truth: its sources (id, url, type, size) and facts (draft, approved, rejected).",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    status: z.enum(["all", "draft", "approved", "rejected"]).default("all").describe('Fact status filter; defaults to "all"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ brandId, status }, ctx) => {
    const brand = await requireBrand(brandId, ctx);
    const s = schema.sources;
    const f = schema.facts;
    const db = getDb();
    const [sources, facts] = await Promise.all([
      db
        .select({ id: s.id, url: s.url, type: s.type, title: s.title, httpStatus: s.httpStatus, fetchedAt: s.fetchedAt })
        .from(s)
        .where(eq(s.brandId, brand.id))
        .orderBy(asc(s.createdAt))
        .limit(50),
      db
        .select()
        .from(f)
        .where(status === "all" ? eq(f.brandId, brand.id) : and(eq(f.brandId, brand.id), eq(f.status, status)))
        .orderBy(asc(f.category), asc(f.createdAt))
        .limit(200),
    ]);
    return {
      brand: { id: brand.id, name: brand.name, domain: brand.domain, category: brand.category },
      sources,
      facts: facts.map(({ ownerEmail: _o, orgId: _g, ...rest }) => rest),
    };
  },
});
