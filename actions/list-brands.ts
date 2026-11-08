import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { owner } from "../server/lib/said-what.js";

export default defineAction({
  description: "List the brands the current user monitors, newest first.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const { ownerEmail } = owner(ctx);
    const b = schema.brands;
    const brands = await getDb()
      .select({ id: b.id, name: b.name, domain: b.domain, category: b.category })
      .from(b)
      .where(eq(b.ownerEmail, ownerEmail))
      .orderBy(desc(b.createdAt))
      .limit(50);
    return { brands };
  },
});
