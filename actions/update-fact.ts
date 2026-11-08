import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { owner } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Edit, approve or reject one ground-truth fact. Only approved facts are monitored.",
  schema: z.object({
    id: z.string().describe("Fact id"),
    status: z.enum(["draft", "approved", "rejected"]).optional().describe("New status; omit to keep"),
    canonicalValue: z.string().min(1).optional().describe("Corrected canonical value; omit to keep"),
    claim: z.string().min(3).optional().describe("Corrected claim wording; omit to keep"),
    note: z.string().optional().describe("Reviewer note; omit to keep"),
  }),
  run: async ({ id, ...patch }, ctx) => {
    const { ownerEmail } = owner(ctx);
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (!Object.keys(set).length) fail("Nothing to update.", { errorCode: "empty_patch" });
    const f = schema.facts;
    const [row] = await getDb()
      .update(f)
      .set(set)
      .where(and(eq(f.id, id), eq(f.ownerEmail, ownerEmail)))
      .returning({ id: f.id, status: f.status, canonicalValue: f.canonicalValue });
    if (!row) fail("Fact not found.", { errorCode: "not_found", statusCode: 404 });
    return row;
  },
});
