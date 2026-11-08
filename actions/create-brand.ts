import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { owner } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Create a brand to monitor. Returns its id; next call ingest-sources with the brand's own URLs.",
  schema: z.object({
    name: z.string().min(1).describe('Brand or product name, e.g. "Acme"'),
    domain: z.string().min(3).describe('Primary domain without protocol, e.g. "acme.com"'),
    category: z.string().optional().describe('Market category, e.g. "project management software"; omit if unknown'),
  }),
  run: async (args, ctx) => {
    const o = owner(ctx);
    const row = {
      id: crypto.randomUUID(),
      name: args.name.trim(),
      domain: args.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase(),
      category: args.category ?? null,
      ...o,
    };
    await getDb().insert(schema.brands).values(row);
    return { id: row.id, name: row.name, domain: row.domain, nextRequiredAction: "ingest-sources" };
  },
});
