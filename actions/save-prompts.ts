import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

const INTENTS = ["trial", "pricing", "security", "status", "limits", "integrations", "comparison", "general"] as const;

export default defineAction({
  description:
    "Save buyer-style questions to ask answer engines about a brand, each linked to the approved fact ids it tests.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    prompts: z
      .array(
        z.object({
          text: z.string().min(8).describe('Question as a buyer would type it, e.g. "Does Acme have a free trial?"'),
          intent: z.enum(INTENTS).default("general").describe(`One of: ${INTENTS.join(", ")}`),
          factIds: z.array(z.string()).min(1).describe("Approved fact ids this question tests"),
        }),
      )
      .min(1)
      .max(20)
      .describe("Questions, 1-20"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const rows = args.prompts.map((p) => ({
      id: crypto.randomUUID(),
      brandId: brand.id,
      text: p.text,
      intent: p.intent,
      factIds: JSON.stringify(p.factIds),
      ownerEmail: brand.ownerEmail,
      orgId: brand.orgId,
    }));
    await getDb().insert(schema.prompts).values(rows);
    return { saved: rows.length, ids: rows.map((r) => r.id), nextRequiredAction: "run-probe" };
  },
});
