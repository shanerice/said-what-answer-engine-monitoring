import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireFinding } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Human review of a drift finding: confirm it is really wrong (unlocks source tracing) or dismiss it. Only call this when the user has decided; never confirm on your own judgment.",
  schema: z.object({
    id: z.string().describe("Finding id"),
    decision: z.enum(["confirmed", "dismissed", "new"]).describe('"confirmed", "dismissed", or "new" to reopen'),
    note: z.string().max(500).optional().describe("Reviewer note"),
  }),
  run: async ({ id, decision, note }, ctx) => {
    const finding = await requireFinding(id, ctx);
    const fi = schema.findings;
    const [row] = await getDb()
      .update(fi)
      .set({ status: decision, ...(note !== undefined ? { reviewerNote: note } : {}) })
      .where(and(eq(fi.id, finding.id), eq(fi.ownerEmail, finding.ownerEmail)))
      .returning({ id: fi.id, status: fi.status });
    if (!row) fail("Finding not found.", { errorCode: "not_found", statusCode: 404 });
    return {
      ...row,
      ...(decision === "confirmed" ? { nextRequiredAction: "inspect-cited-page" } : {}),
    };
  },
});
