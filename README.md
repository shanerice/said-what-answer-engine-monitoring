# Said What — answer engine monitoring

**Buyers ask ChatGPT, Claude and Perplexity about your trial, pricing and security before they ever reach your site. Said What tells you when those answers are wrong, then shows you why.**

Built for the [Builder.io Agent-Native Hackathon](https://www.builder.io/hackathon) on the [Agent-Native](https://www.agent-native.com/docs/) framework.

## The problem

SEO teams have watched for blackhat and grayhat attacks for years: spun comparison pages, parasite posts on high-authority hosts, expired-domain redirects, hidden text. The same tactics now shape what answer engines tell buyers, and almost nobody is watching. A wrong answer about your free trial or your SOC 2 status loses deals before a buyer ever reaches your site.

## How it works

```
Ingest your pages → Extract facts → You approve facts → Probe engines → Detect drift
                                                                          │
                     Draft fixes ← Trace sources ← You confirm ───────────┘
                                                 └─ or dismiss
```

1. **Ground truth.** Paste your pricing, security, docs and FAQ URLs. The agent extracts go-to-market facts (trial model, pricing, compliance, product status, limits, integrations), and each one must carry a verbatim evidence quote. `save-facts` rejects any quote it can't find on the page. You approve or edit each fact.
2. **Answer monitor.** The agent writes buyer-style questions. `run-probe` asks each engine and stores the answer and its cited URLs: Claude with web search, Claude answering from training data only, plus Perplexity and OpenAI if you add their keys. The agent judges every answer against the approved facts, with one of five verdicts: match, contradiction, outdated, omission or unsupported.
3. **Human review.** Each drift finding shows the engine's claim next to your canonical fact and its evidence quote. **You** confirm or dismiss it; the agent never does.
4. **Source forensics.** Only a confirmed finding unlocks tracing. The agent inspects every cited URL with deterministic signals: host, dates, author, cross-host redirects, affiliate and sponsored links, hidden text, and text addressed to AI assistants. It then classifies each page with a source-forensics playbook adapted from negative-SEO monitoring and writes a correction brief.

## Why Agent-Native

- **One action, every surface.** All 19 domain actions (`actions/*.ts`) are shared by the React UI, the in-app agent, the CLI and MCP. "Approve" in the UI and "approve the trial facts" in chat call the same `update-fact`.
- **Deterministic actions, AI in the agent.** Actions fetch, validate and store. Extraction, question writing, drift judging and forensics run in the agent sidebar, guided by two workspace skills: `.agents/skills/gtm-fact-taxonomy` and `.agents/skills/source-forensics`. The UI's sparkle buttons hand those jobs to the agent with `sendToAgentChat`, in the same thread you can steer.
- **Guardrails in the action layer.** Evidence quotes are verified against the stored page text. `inspect-cited-page`, `save-source-reviews` and `save-remediation` refuse with `not_confirmed` (409) until a human confirms, whether the call comes from the UI, the agent or the CLI.
- **Context-aware.** Navigation exposes `brandId` and `findingId`, so "why is it saying that?" on a finding page needs no ids.
- **Scoped secrets.** Engine keys are registered app secrets (Settings → user scope), with `.env` as the local fallback.

## Run it

Requires Node 22.22+ and pnpm 10.

```bash
pnpm install
cp .env.example .env    # add ANTHROPIC_API_KEY (Perplexity and OpenAI keys are optional)
pnpm dev                # http://localhost:8080 → Brand monitor
```

Key engine settings live in `server/lib/engines.ts` (`MODELS`).

## Roadmap

Scheduled daily scans (`workspace/jobs/daily-aeo-scan.md`), alerts on new critical drift, trend lines per engine, multi-brand competitor comparisons, and a hosted Postgres deploy.

## Language

Said What describes signals, not intent. Classifications such as "suspected parasite page" are hypotheses with evidence, never accusations.
