import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { fetchPage, requireBrand } from "../server/lib/said-what.js";

const SOURCE_TYPES = ["landing", "pricing", "case_study", "docs", "faq", "security", "other"] as const;

export default defineAction({
  description:
    "Fetch the brand's own pages (landing, pricing, docs, FAQ, case studies) and store their text as ground-truth sources. One failed URL does not stop the others.",
  schema: z.object({
    brandId: z.string().describe("Brand id from list-brands"),
    sources: z
      .array(
        z.object({
          url: z.string().url().describe("Absolute https URL on the brand's site"),
          type: z.enum(SOURCE_TYPES).default("other").describe(`Page type: ${SOURCE_TYPES.join(", ")}`),
        }),
      )
      .min(1)
      .max(10)
      .describe("Pages to ingest, 1-10"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const results = await Promise.all(
      args.sources.map(async (s) => {
        try {
          const page = await fetchPage(s.url);
          return { ...s, page, error: null as string | null };
        } catch (e) {
          return { ...s, page: null, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    const now = new Date().toISOString();
    const ingested = [];
    for (const r of results) {
      const row = {
        id: crypto.randomUUID(),
        brandId: brand.id,
        url: r.url,
        type: r.type,
        title: r.page?.title ?? null,
        fetchedText: r.page?.text.slice(0, 120_000) ?? null,
        httpStatus: r.page?.status ?? null,
        fetchedAt: now,
        ownerEmail: brand.ownerEmail,
        orgId: brand.orgId,
      };
      await getDb().insert(schema.sources).values(row);
      ingested.push({
        id: row.id,
        url: row.url,
        type: row.type,
        title: row.title,
        status: row.httpStatus,
        characters: row.fetchedText?.length ?? 0,
        error: r.error,
      });
    }
    return {
      ingested,
      message: `Stored ${ingested.filter((i) => i.characters > 200).length} of ${ingested.length} pages with usable text. Next: read each with get-source and extract facts with save-facts.`,
    };
  },
});
