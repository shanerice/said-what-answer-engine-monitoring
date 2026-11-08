import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { owner } from "../server/lib/said-what.js";

export default defineAction({
  description:
    "Read one stored source page's text (paged in 30,000-character chunks) so facts can be extracted with verbatim evidence quotes.",
  schema: z.object({
    id: z.string().describe("Source id from list-facts (sources list) or ingest-sources"),
    offset: z.coerce.number().int().min(0).default(0).describe("Character offset; defaults to 0"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id, offset }, ctx) => {
    const { ownerEmail } = owner(ctx);
    const s = schema.sources;
    const [row] = await getDb()
      .select()
      .from(s)
      .where(and(eq(s.id, id), eq(s.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row) fail("Source not found.", { errorCode: "not_found", statusCode: 404 });
    const text = row.fetchedText ?? "";
    const chunk = text.slice(offset, offset + 30_000);
    return {
      id: row.id,
      url: row.url,
      type: row.type,
      title: row.title,
      offset,
      totalCharacters: text.length,
      hasMore: offset + 30_000 < text.length,
      text: chunk,
    };
  },
});
