/**
 * Answer-engine adapters. The engines are the system being monitored, so
 * calling them is a provider read, not the app's own reasoning. Each adapter
 * returns the answer text and the URLs the engine cited.
 */
export type EngineAnswer = { answerText: string; citedUrls: string[]; model: string };
export type Engine = {
  id: string;
  label: string;
  available: () => boolean;
  ask: (question: string) => Promise<EngineAnswer>;
};

const env = (k: string) => process.env[k]?.trim() || undefined;

function dedupe(urls: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || !/^https?:\/\//.test(u)) continue;
    const key = u.replace(/#.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.slice(0, 12);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function anthropic(question: string, model: string, web: boolean): Promise<EngineAnswer> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 1200,
    messages: [{ role: "user", content: question }],
  };
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  else
    body.system =
      "Answer the user's question directly from what you know. Be specific about plans, prices, trials and policies.";
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": env("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
    body,
  );
  const parts: string[] = [];
  const cited: string[] = [];
  const results: string[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") {
      parts.push(block.text);
      for (const c of block.citations ?? []) if (c.url) cited.push(c.url);
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) results.push(r.url);
    }
  }
  return {
    answerText: parts.join("").trim(),
    citedUrls: dedupe([...cited, ...results]),
    model: data.model ?? model,
  };
}

export const ENGINES: Engine[] = [
  {
    id: "claude-web",
    label: "Claude + web search",
    available: () => !!env("ANTHROPIC_API_KEY"),
    ask: (q) => anthropic(q, env("SW_WEB_MODEL") ?? "claude-sonnet-5-5", true),
  },
  {
    id: "claude-memory",
    label: "Claude, no web (training data)",
    available: () => !!env("ANTHROPIC_API_KEY"),
    ask: (q) => anthropic(q, env("SW_MEMORY_MODEL") ?? "claude-haiku-5-5", false),
  },
  {
    id: "perplexity",
    label: "Perplexity Sonar",
    available: () => !!env("PERPLEXITY_API_KEY"),
    ask: async (q) => {
      const model = env("SW_PERPLEXITY_MODEL") ?? "sonar";
      const data = await postJson(
        "https://api.perplexity.ai/chat/completions",
        { authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` },
        { model, messages: [{ role: "user", content: q }] },
      );
      const urls = [
        ...(data.citations ?? []),
        ...((data.search_results ?? []) as { url?: string }[]).map((r) => r.url ?? ""),
      ];
      return {
        answerText: String(data.choices?.[0]?.message?.content ?? "").trim(),
        citedUrls: dedupe(urls),
        model: data.model ?? model,
      };
    },
  },
  {
    id: "openai",
    label: "OpenAI, no web",
    available: () => !!env("OPENAI_API_KEY"),
    ask: async (q) => {
      const model = env("SW_OPENAI_MODEL") ?? "gpt-4o-mini";
      const data = await postJson(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${env("OPENAI_API_KEY")}` },
        { model, messages: [{ role: "user", content: q }] },
      );
      return {
        answerText: String(data.choices?.[0]?.message?.content ?? "").trim(),
        citedUrls: [],
        model: data.model ?? model,
      };
    },
  },
];

export function engineById(id: string) {
  return ENGINES.find((e) => e.id === id);
}
