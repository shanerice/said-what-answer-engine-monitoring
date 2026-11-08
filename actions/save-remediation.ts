import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireFinding } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Save a markdown correction brief on a confirmed finding: the wrong claim, the canonical fact with its quote, ranked sources with fixes, and a suggested on-site content change. Draft only; nothing is sent.",
  schema: z.object({
    findingId: z.string().describe("Confirmed finding id"),
    brief: z.string().min(40).max(8000).describe("Markdown brief"),
  }),
  run: async ({ findingId, brief }, ctx) => {
    const finding = await requireFinding(findingId, ctx);
    if (finding.status !== "confirmed")
      fail("Only confirmed findings get a remediation brief.", { errorCode: "not_confirmed", statusCode: 409 });
    await getDb().update(schema.findings).set({ remediationBrief: brief }).where(eq(schema.findings.id, findingId));
    return { id: findingId, message: "Brief saved on the finding." };
  },
});
