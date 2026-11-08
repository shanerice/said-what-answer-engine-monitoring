import { registerRequiredSecret } from "@agent-native/core/secrets";
import { prefetchSecrets, resolveSecret } from "@agent-native/core/server";

/**
 * Answer-engine adapters. The engines are the system being monitored, so
 * calling them is a provider read, not the app's own reasoning. Each adapter
 * returns the answer text and the URLs the engine cited.
 */
export type EngineAnswer = { answerText: string; citedUrls: string[]; model: string };
type Keys = Partial<Record<"ANTHROPIC_API_KEY" | "PERPLEXITY_API_KEY" | "OPENAI_API_KEY", string>>;
export type Engine = {
  id: string;
  label: string;
  available: (keys: Keys) => boolean;
  ask: (question: string, keys: Keys) => Promise<EngineAnswer>;
};

const SECRET_KEYS = ["ANTHROPIC_API_KEY", "PERPLEXITY_API_KEY", "OPENAI_API_KEY"] as const;
type SecretKey = (typeof SECRET_KEYS)[number];

registerRequiredSecret({
  key: "ANTHROPIC_API_KEY",
  label: "Anthropic API key",
  description: "Lets Said What ask Claude (with and without web search) the buyer questions it monitors.",
  docsUrl: "https://console.anthropic.com/settings/keys",
  scope: "user",
  kind: "api-key",
  required: false,
});
registerRequiredSecret({
  key: "PERPLEXITY_API_KEY",
  label: "Perplexity API key",
  description: "Optional. Adds Perplexity Sonar, a citing answer engine, to the monitor.",
  docsUrl: "https://www.perplexity.ai/settings/api",
  scope: "user",
  kind: "api-key",
  required: false,
});
registerRequiredSecret({
  key: "OPENAI_API_KEY",
  label: "OpenAI API key",
  description: "Optional. Adds an OpenAI model (no web) to the monitor.",
  docsUrl: "https://platform.openai.com/api-keys",
  scope: "user",
  kind: "api-key",
  required: false,
});

/** Model ids. Edit here to point an engine at a different model. */
export const MODELS = {
  claudeWeb: "claude-sonnet-5-5",
  claudeMemory: "claude-haiku-5-5",
  perplexity: "sonar",
  openai: "gpt-4o-mini",
};

/** Resolve the engine keys for this request (user, org, workspace, then deploy fallback). */
export async function resolveEngineKeys(): Promise<Partial<Record<SecretKey, string>>> {
  await prefetchSecrets([...SECRET_KEYS]);
  const out: Partial<Record<SecretKey, string>> = {};
  for (const key of SECRET_KEYS) {
    const value = (await resolveSecret(key))?.trim();
    if (value) out[key] = value;
  }
  return out;
}

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

async function anthropic(question: string, model: string, web: boolean, apiKey: string): Promise<EngineAnswer> {
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
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
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
    available: (k) => !!k.ANTHROPIC_API_KEY,
    ask: (q, k) => anthropic(q, MODELS.claudeWeb, true, k.ANTHROPIC_API_KEY!),
  },
  {
    id: "claude-memory",
    label: "Claude, no web (training data)",
    available: (k) => !!k.ANTHROPIC_API_KEY,
    ask: (q, k) => anthropic(q, MODELS.claudeMemory, false, k.ANTHROPIC_API_KEY!),
  },
  {
    id: "perplexity",
    label: "Perplexity Sonar",
    available: (k) => !!k.PERPLEXITY_API_KEY,
    ask: async (q, k) => {
      const model = MODELS.perplexity;
      const data = await postJson(
        "https://api.perplexity.ai/chat/completions",
        { authorization: `Bearer ${k.PERPLEXITY_API_KEY}` },
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
    available: (k) => !!k.OPENAI_API_KEY,
    ask: async (q, k) => {
      const model = MODELS.openai;
      const data = await postJson(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${k.OPENAI_API_KEY}` },
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
