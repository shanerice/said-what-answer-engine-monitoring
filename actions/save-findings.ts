import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

const VERDICTS = ["match", "contradiction", "outdated", "omission", "unsupported"] as const;

export default defineAction({
  description:
    "Record judgments for engine answers. verdicts: one per (probe, fact) the answer actually addresses, including matches; non-match verdicts become findings for human review. visibility: one per awareness probe (is the brand mentioned, its rank, competitors named). Marks every probe it covers as judged.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    verdicts: z
      .array(
        z.object({
          probeId: z.string().describe("Probe id from list-probes"),
          factId: z.string().describe("Approved fact id the verdict is about"),
          verdict: z.enum(VERDICTS).describe(`One of: ${VERDICTS.join(", ")}`),
          engineClaim: z.string().max(400).default("").describe("Verbatim excerpt of what the engine said, max 40 words; empty for match"),
          rationale: z.string().max(600).optional().describe("One or two sentences explaining the verdict"),
          severity: z.enum(["critical", "high", "low"]).optional().describe("Override the fact's severity; omit to inherit"),
        }),
      )
      .max(80)
      .default([])
      .describe("Fact verdicts, 0-80. For awareness answers, only facts the answer states something about"),
    visibility: z
      .array(
        z.object({
          probeId: z.string().describe("Awareness probe id"),
          brandMentioned: z.boolean().describe("True if the answer names the brand"),
          mentionRank: z.number().int().min(1).optional().describe("1-based position of the brand among products the answer recommends; omit if not mentioned or unranked"),
          competitors: z.array(z.string()).max(15).default([]).describe("Other products the answer names, in order"),
        }),
      )
      .max(40)
      .default([])
      .describe("Brand visibility for awareness probes"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const db = getDb();
    if (!args.verdicts.length && !args.visibility.length)
      fail("Send at least one verdict or visibility entry.", { errorCode: "empty" });
    const probeIds = [...new Set([...args.verdicts.map((v) => v.probeId), ...args.visibility.map((v) => v.probeId)])];
    const factIds = [...new Set(args.verdicts.map((v) => v.factId))];
    const pr = schema.probes;
    const f = schema.facts;
    const [probes, facts] = await Promise.all([
      db.select({ id: pr.id, answerText: pr.answerText }).from(pr).where(and(inArray(pr.id, probeIds), eq(pr.brandId, brand.id))),
      factIds.length
        ? db.select({ id: f.id, severity: f.severity }).from(f).where(and(inArray(f.id, factIds), eq(f.brandId, brand.id)))
        : Promise.resolve([] as { id: string; severity: string }[]),
    ]);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const sev = new Map(facts.map((x) => [x.id, x.severity]));
    const bad = [
      ...args.verdicts.filter((v) => !probeMap.has(v.probeId) || !sev.has(v.factId)),
      ...args.visibility.filter((v) => !probeMap.has(v.probeId)),
    ];
    if (bad.length)
      fail("Unknown probeId or factId for this brand.", { errorCode: "not_found", statusCode: 404, details: { bad: bad.slice(0, 5) } });
    const rows = args.verdicts
      .filter((v) => v.verdict !== "match")
      .map((v) => {
        if (!v.engineClaim.trim())
          fail(`engineClaim is required for a ${v.verdict} verdict.`, { errorCode: "missing_claim" });
        return {
          id: crypto.randomUUID(),
          brandId: brand.id,
          probeId: v.probeId,
          factId: v.factId,
          verdict: v.verdict,
          severity: v.severity ?? sev.get(v.factId) ?? "high",
          engineClaim: v.engineClaim.trim(),
          rationale: v.rationale ?? null,
          status: "new",
          ownerEmail: brand.ownerEmail,
          orgId: brand.orgId,
        };
      });
    await db.transaction(async (tx) => {
      if (rows.length) await tx.insert(schema.findings).values(rows);
      await tx.update(pr).set({ judgedAt: new Date().toISOString() }).where(inArray(pr.id, probeIds));
      for (const v of args.visibility) {
        await tx
          .update(pr)
          .set({
            brandMentioned: v.brandMentioned ? 1 : 0,
            mentionRank: v.brandMentioned ? (v.mentionRank ?? null) : null,
            competitors: JSON.stringify(v.competitors),
          })
          .where(eq(pr.id, v.probeId));
      }
    });
    return {
      findings: rows.length,
      matches: args.verdicts.length - rows.length,
      visibility: args.visibility.length,
      ids: rows.map((r) => r.id),
      message: rows.length
        ? `${rows.length} findings await human review on the Answer Monitor. Do not trace sources until a reviewer confirms one.`
        : "All answers matched the approved facts.",
    };
  },
});
