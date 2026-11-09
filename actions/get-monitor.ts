import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ENGINES, resolveEngineKeys } from "../server/lib/engines.js";
import { parseJsonArray, requireBrand } from "../server/lib/said-what.js";

const RANK: Record<string, number> = { contradiction: 4, outdated: 3, unsupported: 2, omission: 1 };

export default defineAction({
  description:
    "Answer Monitor matrix for a brand: each question x engine cell with the latest answer's worst open verdict, plus counts of findings by status.",
  schema: z.object({ brandId: z.string().describe("Brand id") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ brandId }, ctx) => {
    const brand = await requireBrand(brandId, ctx);
    const db = getDb();
    const p = schema.prompts;
    const pr = schema.probes;
    const fi = schema.findings;
    const [prompts, probes, findings] = await Promise.all([
      db.select({ id: p.id, text: p.text, intent: p.intent, stage: p.stage }).from(p).where(and(eq(p.brandId, brand.id), eq(p.active, 1))).limit(30),
      db
        .select({
          id: pr.id, promptId: pr.promptId, engine: pr.engine, runAt: pr.runAt, judgedAt: pr.judgedAt,
          brandMentioned: pr.brandMentioned, mentionRank: pr.mentionRank, competitors: pr.competitors,
        })
        .from(pr)
        .where(eq(pr.brandId, brand.id))
        .orderBy(desc(pr.runAt))
        .limit(400),
      db
        .select({ id: fi.id, probeId: fi.probeId, verdict: fi.verdict, severity: fi.severity, status: fi.status })
        .from(fi)
        .where(eq(fi.brandId, brand.id))
        .limit(500),
    ]);
    const latest = new Map<string, (typeof probes)[number]>();
    for (const probe of probes) {
      const key = `${probe.promptId}:${probe.engine}`;
      if (!latest.has(key)) latest.set(key, probe);
    }
    const usedEngines = [...new Set(probes.map((x) => x.engine))];
    const keys = await resolveEngineKeys();
    const engines = ENGINES.filter((e) => usedEngines.includes(e.id) || e.available(keys)).map((e) => ({ id: e.id, label: e.label }));
    const stageOrder: Record<string, number> = { awareness: 0, consideration: 1 };
    prompts.sort((a, b) => (stageOrder[a.stage] ?? 2) - (stageOrder[b.stage] ?? 2));
    const rows = prompts.map((prompt) => ({
      promptId: prompt.id,
      question: prompt.text,
      intent: prompt.intent,
      stage: prompt.stage,
      cells: engines.map((engine) => {
        const probe = latest.get(`${prompt.id}:${engine.id}`);
        if (!probe) return { engine: engine.id, state: "not_asked" as const };
        const mine = findings.filter((f) => f.probeId === probe.id && f.status !== "dismissed");
        const worst = mine.sort((a, b) => (RANK[b.verdict] ?? 0) - (RANK[a.verdict] ?? 0))[0];
        return {
          engine: engine.id,
          probeId: probe.id,
          state: !probe.judgedAt ? ("unjudged" as const) : worst ? ("drift" as const) : ("match" as const),
          verdict: worst?.verdict ?? null,
          severity: worst?.severity ?? null,
          findingId: worst?.id ?? null,
          findingStatus: worst?.status ?? null,
          openFindings: mine.length,
          brandMentioned: probe.brandMentioned === null ? null : probe.brandMentioned === 1,
          mentionRank: probe.mentionRank,
          competitors: parseJsonArray(probe.competitors).slice(0, 5),
        };
      }),
    }));
    const counts = { new: 0, confirmed: 0, dismissed: 0 } as Record<string, number>;
    for (const f of findings) counts[f.status] = (counts[f.status] ?? 0) + 1;
    const awarenessIds = new Set(prompts.filter((x) => x.stage === "awareness").map((x) => x.id));
    const awarenessCells = [...latest.values()].filter((x) => awarenessIds.has(x.promptId) && x.brandMentioned !== null);
    const visibility = {
      judged: awarenessCells.length,
      mentioned: awarenessCells.filter((x) => x.brandMentioned === 1).length,
    };
    return {
      brand: { id: brand.id, name: brand.name },
      visibility,
      engines,
      rows,
      counts,
      lastRunAt: probes[0]?.runAt ?? null,
      unjudged: probes.filter((x) => !x.judgedAt).length,
    };
  },
});
