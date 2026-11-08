import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { parseJsonArray, requireFinding } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Get one finding with the engine's full answer and cited URLs, the canonical fact with its evidence quote and source, and any source forensics.",
  schema: z.object({ id: z.string().describe("Finding id") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => {
    const finding = await requireFinding(id, ctx);
    const db = getDb();
    const [probe] = await db.select().from(schema.probes).where(eq(schema.probes.id, finding.probeId)).limit(1);
    const [prompt] = probe
      ? await db.select().from(schema.prompts).where(eq(schema.prompts.id, probe.promptId)).limit(1)
      : [];
    const [fact] = await db.select().from(schema.facts).where(eq(schema.facts.id, finding.factId)).limit(1);
    const [source] = fact
      ? await db
          .select({ id: schema.sources.id, url: schema.sources.url, title: schema.sources.title, type: schema.sources.type })
          .from(schema.sources)
          .where(eq(schema.sources.id, fact.sourceId))
          .limit(1)
      : [];
    const sr = schema.sourceReviews;
    const reviews = await db.select().from(sr).where(eq(sr.findingId, finding.id)).orderBy(desc(sr.carriesWrongClaim), desc(sr.suspicion)).limit(20);
    return {
      finding: {
        id: finding.id, brandId: finding.brandId, verdict: finding.verdict, severity: finding.severity, status: finding.status,
        engineClaim: finding.engineClaim, rationale: finding.rationale, reviewerNote: finding.reviewerNote,
        remediationBrief: finding.remediationBrief, createdAt: finding.createdAt,
      },
      probe: probe
        ? { id: probe.id, engine: probe.engine, model: probe.model, answerText: probe.answerText, citedUrls: parseJsonArray(probe.citedUrls), runAt: probe.runAt }
        : null,
      question: prompt?.text ?? null,
      fact: fact
        ? { id: fact.id, category: fact.category, claim: fact.claim, canonicalValue: fact.canonicalValue, evidenceQuote: fact.evidenceQuote, severity: fact.severity }
        : null,
      source: source ?? null,
      sourceReviews: reviews.map(({ ownerEmail: _o, orgId: _g, evidence, ...r }) => ({ ...r, evidence: parseJsonArray(evidence) })),
    };
  },
});
