import { defineAction, fail } from "@agent-native/core/action";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ENGINES, engineById } from "../server/lib/engines.js";
import { requireBrand } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Ask answer engines a brand's active questions and store each answer with its cited URLs. Reuses answers from the last 24 hours unless force is true. Next: judge new probes with list-probes + save-findings.",
  schema: z.object({
    brandId: z.string().describe("Brand id"),
    engines: z
      .array(z.string())
      .optional()
      .describe("Engine ids from list-engines; omit to use every engine with a key"),
    promptIds: z.array(z.string()).optional().describe("Limit to these prompt ids; omit for all active prompts"),
    force: z.boolean().default(false).describe("Re-ask even if a fresh answer exists; defaults to false"),
  }),
  run: async (args, ctx) => {
    const brand = await requireBrand(args.brandId, ctx);
    const engines = (args.engines?.length ? args.engines.map((id) => engineById(id)) : ENGINES).filter(
      (e): e is NonNullable<typeof e> => !!e && e.available(),
    );
    if (!engines.length)
      fail("No answer engine has an API key. Add ANTHROPIC_API_KEY (or PERPLEXITY_API_KEY / OPENAI_API_KEY) to .env.", {
        errorCode: "no_engines",
      });
    const p = schema.prompts;
    let prompts = await getDb()
      .select({ id: p.id, text: p.text })
      .from(p)
      .where(and(eq(p.brandId, brand.id), eq(p.active, 1)))
      .limit(30);
    if (args.promptIds?.length) prompts = prompts.filter((x) => args.promptIds!.includes(x.id));
    if (!prompts.length)
      fail("No active questions. Save some with save-prompts first.", { errorCode: "no_prompts" });

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const pr = schema.probes;
    let asked = 0;
    let reused = 0;
    const errors: string[] = [];
    const jobs = prompts.flatMap((prompt) => engines.map((engine) => ({ prompt, engine })));
    // Small concurrency so a scan of 10 prompts x 2 engines finishes in under a minute.
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { prompt, engine } = job;
        if (!args.force) {
          const [fresh] = await getDb()
            .select({ id: pr.id })
            .from(pr)
            .where(and(eq(pr.promptId, prompt.id), eq(pr.engine, engine.id), gt(pr.runAt, since)))
            .orderBy(desc(pr.runAt))
            .limit(1);
          if (fresh) {
            reused++;
            continue;
          }
        }
        try {
          const answer = await engine.ask(prompt.text);
          await getDb().insert(pr).values({
            id: crypto.randomUUID(),
            brandId: brand.id,
            promptId: prompt.id,
            engine: engine.id,
            model: answer.model,
            answerText: answer.answerText || "(empty answer)",
            citedUrls: JSON.stringify(answer.citedUrls),
            runAt: new Date().toISOString(),
            ownerEmail: brand.ownerEmail,
            orgId: brand.orgId,
          });
          asked++;
        } catch (e) {
          errors.push(`${engine.id} / "${prompt.text.slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (!asked && !reused && errors.length)
      fail(`Every engine call failed. First error: ${errors[0]}`, { errorCode: "engine_failed", details: { errors: errors.slice(0, 5) } });
    return {
      asked,
      reused,
      engines: engines.map((e) => e.id),
      errors: errors.slice(0, 5),
      nextRequiredAction: "list-probes",
      message: `Asked ${asked} new questions (${reused} reused). Judge unjudged probes against approved facts, then save-findings.`,
    };
  },
});
