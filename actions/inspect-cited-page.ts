import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { excerptAround, fetchPage, pageSignals, requireFinding } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Source forensics, step 1: fetch one URL an engine cited for a CONFIRMED finding and return observed signals (host, dates, author, redirects, affiliate/sponsored links, hidden or AI-directed text) plus excerpts that contain the wrong claim or the canonical value. Fails unless the finding is confirmed.",
  schema: z.object({
    findingId: z.string().describe("Confirmed finding id"),
    url: z.string().url().describe("One URL from the finding's citedUrls"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ findingId, url }, ctx) => {
    const finding = await requireFinding(findingId, ctx);
    if (finding.status !== "confirmed")
      fail("A reviewer must confirm this finding before its sources are traced.", {
        errorCode: "not_confirmed",
        statusCode: 409,
      });
    const db = getDb();
    const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, finding.brandId)).limit(1);
    const [fact] = await db.select().from(schema.facts).where(eq(schema.facts.id, finding.factId)).limit(1);
    let page;
    try {
      page = await fetchPage(url);
    } catch (e) {
      return {
        url,
        finalUrl: url,
        status: 0,
        title: null,
        signals: [`fetch failed: ${e instanceof Error ? e.message : String(e)}`],
        wrongClaimExcerpts: [],
        canonicalExcerpts: [],
        textSample: "",
      };
    }
    const { signals, hiddenText, isOfficial } = pageSignals(page, brand?.domain ?? "");
    const claimWords = finding.engineClaim
      .split(/[.;,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6)
      .slice(0, 4);
    return {
      url,
      finalUrl: page.finalUrl,
      status: page.status,
      title: page.title,
      isOfficial,
      signals,
      hiddenText,
      wrongClaimExcerpts: excerptAround(page.text, claimWords),
      canonicalExcerpts: excerptAround(page.text, fact ? [fact.canonicalValue] : []),
      textSample: page.text.slice(0, 2500),
    };
  },
});
