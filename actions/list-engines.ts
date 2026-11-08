import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ENGINES, resolveEngineKeys } from "../server/lib/engines.js";

export default defineAction({
  description: "List the answer engines this app can probe and whether each has an API key configured.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const keys = await resolveEngineKeys();
    return { engines: ENGINES.map((e) => ({ id: e.id, label: e.label, available: e.available(keys) })) };
  },
});
