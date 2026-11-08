import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireFinding } from "../server/lib/said-what.js";

export const CLASSIFICATIONS = [
  "official_current", "official_stale", "third_party_outdated", "competitor_authored", "affiliate_listicle",
  "ugc", "parasite_hosted", "content_farm", "expired_domain", "llm_targeted", "citation_mismatch",
] as const;

export default defineAction({
  description:
    "Source forensics, step 2: save the classification of each cited URL for a CONFIRMED finding (replaces earlier reviews for that finding). Evidence must list only observed signals or quotes.",
  schema: z.object({
    findingId: z.string().describe("Confirmed finding id"),
    reviews: z
      .array(
        z.object({
          url: z.string().describe("Cited URL"),
          finalUrl: z.string().optional().describe("URL after redirects"),
          classification: z.enum(CLASSIFICATIONS).describe(`One of: ${CLASSIFICATIONS.join(", ")}`),
          suspicion: z.number().int().min(0).max(3).describe("0 benign to 3 strong manipulation signals"),
          carriesWrongClaim: z.boolean().describe("True if the page itself states the wrong claim"),
          evidence: z.array(z.string()).min(1).max(8).describe("Observed signals and short quotes"),
          recommendedFix: z.string().min(5).describe("One concrete fix"),
        }),
      )
      .min(1)
      .max(12)
      .describe("One review per cited URL"),
  }),
  run: async ({ findingId, reviews }, ctx) => {
    const finding = await requireFinding(findingId, ctx);
    if (finding.status !== "confirmed")
      fail("A reviewer must confirm this finding before its sources are traced.", { errorCode: "not_confirmed", statusCode: 409 });
    const sr = schema.sourceReviews;
    const rows = reviews.map((r) => ({
      id: crypto.randomUUID(),
      findingId,
      url: r.url,
      finalUrl: r.finalUrl ?? null,
      classification: r.classification,
      suspicion: r.suspicion,
      carriesWrongClaim: r.carriesWrongClaim ? 1 : 0,
      evidence: JSON.stringify(r.evidence),
      recommendedFix: r.recommendedFix,
      ownerEmail: finding.ownerEmail,
      orgId: finding.orgId,
    }));
    await getDb().transaction(async (tx) => {
      await tx.delete(sr).where(eq(sr.findingId, findingId));
      await tx.insert(sr).values(rows);
    });
    return { saved: rows.length, findingId, nextRequiredAction: "save-remediation" };
  },
});
