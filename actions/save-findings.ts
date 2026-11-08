import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBrand } from "../server/lib/said-what.js";

const VERDICTS = ["match", "contradiction", "outdated", "omission", "unsupported"] as const;

export default defineAction({
  description:
    "Record drift verdicts for engine answers. Pass one verdict per (probe, fact) pair, including matches; non-match verdicts become findings with status new for human review. Marks each probe judged.",
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
      .min(1)
      .max(80)
      .describe("Verdicts, 1-80"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const db = getDb();
    const probeIds = [...new Set(args.verdicts.map((v) => v.probeId))];
    const factIds = [...new Set(args.verdicts.map((v) => v.factId))];
    const pr = schema.probes;
    const f = schema.facts;
    const [probes, facts] = await Promise.all([
      db.select({ id: pr.id, answerText: pr.answerText }).from(pr).where(and(inArray(pr.id, probeIds), eq(pr.brandId, brand.id))),
      db.select({ id: f.id, severity: f.severity }).from(f).where(and(inArray(f.id, factIds), eq(f.brandId, brand.id))),
    ]);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const sev = new Map(facts.map((x) => [x.id, x.severity]));
    const bad = args.verdicts.filter((v) => !probeMap.has(v.probeId) || !sev.has(v.factId));
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
    });
    return {
      findings: rows.length,
      matches: args.verdicts.length - rows.length,
      ids: rows.map((r) => r.id),
      message: rows.length
        ? `${rows.length} findings await human review on the Answer Monitor. Do not trace sources until a reviewer confirms one.`
        : "All answers matched the approved facts.",
    };
  },
});
