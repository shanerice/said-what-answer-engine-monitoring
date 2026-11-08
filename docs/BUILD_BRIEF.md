# Said What — Build Brief for Claude Code

Deadline: **Mon Nov 9, 11:59 PM PT** (Builder.io Agent-Native Hackathon). Target: build complete Sunday night; Monday is record + submit only.

Paste this into Claude Code from the repo root:

> Read BUILD_BRIEF.md and AGENTS.md. Start with Phase 0. Work phase by phase, stop at each checkpoint, show me the result, and commit only when I confirm it works.

---

## Phase 0 — Inspect state (5 min)

1. Check whether this repo already contains an Agent-Native app (`package.json` with `@agent-native/core`, an `actions/` folder).
   - **No app yet:** scaffold into a temp folder and move it in, keeping `.git`, `AGENTS.md`, `BUILD_BRIEF.md`, `.agents/`, `workspace/`:
     `npx --yes @agent-native/core@latest create said-what --standalone --template chat`
     then `corepack enable && pnpm install`.
   - **App exists:** list which actions and routes from this brief already exist. Skip finished phases.
2. Ensure `.gitignore` contains `.env`, `.env.*`, `*.db`, `*.sqlite`, `node_modules`. Run `git status` and confirm no secrets are tracked.
3. Read the framework docs before writing code: Actions, Key Concepts (SQL data, live sync), Workspace, Recurring Jobs, Human-in-the-Loop Approvals. Follow the framework's patterns, not generic Express/Next patterns.
4. Confirm `pnpm dev` runs and the template's `hello` action works from chat and UI.

**Checkpoint 0 → commit:** `chore: scaffold Agent-Native app and workspace files`

---

## Phase 1 — Data + ground truth (≈60 min)

### Tables (use the framework's SQL layer)

| Table | Fields |
| --- | --- |
| `brands` | id, name, domain, category, created_at |
| `sources` | id, brand_id, url, type (`landing`,`pricing`,`case_study`,`docs`,`other`), fetched_text, fetched_at, http_status |
| `facts` | id, brand_id, category, claim, canonical_value, evidence_quote, source_id, severity, status (`draft`,`approved`,`rejected`), note |
| `prompts` | id, brand_id, text, intent (`trial`,`pricing`,`security`,`status`,`comparison`,`general`), fact_ids (json), active |
| `probes` | id, prompt_id, engine, model, answer_text, cited_urls (json), run_at, from_cache |
| `findings` | id, probe_id, fact_id, verdict, severity, engine_claim, rationale, status (`new`,`confirmed`,`dismissed`), reviewer_note |
| `source_reviews` | id, finding_id, url, final_url, classification, suspicion, carries_wrong_claim, evidence (json), recommended_fix |

### Actions

- `ingest-sources({ brandName, domain, urls[] })` — fetch each URL server-side, strip nav/footer/script, store text. Record failures; don't throw on one bad URL.
- `extract-facts({ brandId })` — LLM call with the `gtm-fact-taxonomy` skill content in the prompt; structured output validated by zod; **reject any fact whose `evidence_quote` is not a substring of the source text** (normalize whitespace). Insert as `draft`.
- `update-fact({ id, canonical_value?, claim?, status?, note? })`
- `list-facts({ brandId })` (GET, for `useActionQuery`)

### UI: `/` Ground Truth

- Brand header + "Add sources" form (textarea of URLs).
- Facts table grouped by category: claim, canonical value (inline-editable), evidence quote, source link, severity badge, Approve/Reject buttons. All buttons call the actions above.

**Checkpoint 1:** ingest the chosen brand's 4–6 URLs, extract facts, approve 10–20 by hand. Do it once through the UI and once by asking the agent. **Commit:** `feat: ground truth ingestion and fact review`

---

## Phase 2 — Probe + drift + review (≈90 min) — the core

### Engines

Implement an engine adapter interface `ask(prompt) → { answer_text, cited_urls[], model }`. Build two adapters, keys from `.env`:

1. **Citing engine** — Perplexity API (returns citations) *or* Anthropic Messages API with the web search tool. Must return cited URLs.
2. **No-web engine** — a model called without web access (exposes stale training-data drift). `cited_urls` = `[]`.

If a key is missing, the adapter is skipped with a clear message, not a crash.

### Actions

- `generate-prompts({ brandId, count = 10 })` — buyer-style questions covering approved facts, weighted to `critical` categories; include 2–3 comparison/"alternatives to X" prompts.
- `run-probe({ brandId, engines?, replay? })` — for each active prompt × engine, call the adapter and store a probe. **Cache:** if a probe for the same prompt+engine exists from the last 24h, reuse it unless `force: true`. `replay: true` reads only from `seeds/probes.<brand>.json`.
- `detect-drift({ brandId, probeIds? })` — LLM judge per probe against the approved facts linked to its prompt, using the verdict table in `gtm-fact-taxonomy`. Store one finding per (probe, fact) where verdict ≠ `match`. Store `engine_claim` verbatim.
- `review-finding({ id, decision: 'confirmed'|'dismissed', note? })`
- `list-findings({ brandId, status? })`, `get-finding({ id })`
- `export-seed({ brandId })` — writes `seeds/probes.<brand>.json` from stored probes (for replayable demo; commit this file).

### UI

- `/monitor` **Answer Monitor**: matrix rows = prompts, columns = engines. Cell color: green `match`, amber `omission`, red `contradiction`/`outdated`/`unsupported`. Cell click → finding. "Run scan" button calls `run-probe` then `detect-drift`.
- `/findings/:id` **Finding Review**: two columns — left "What <engine> said" (engine_claim highlighted in the full answer); right "What your sources say" (canonical value + evidence quote + source link). Verdict + severity badges. **Confirm** / **Dismiss** buttons with note. "Trace sources" button visible only when status = `confirmed`.

**Checkpoint 2 (hard gate):** at least one real drift finding is visible in the UI for the chosen brand. Run `export-seed` and commit the seed. **Commit:** `feat: answer engine probing, drift detection, and review`

If no drift appears: add comparison and "alternatives to X" prompts, add facts about recently changed terms, and re-run the no-web engine. If still none after 20 minutes, switch brand rather than inventing findings.

---

## Phase 3 — Forensics (≈60 min)

- `trace-sources({ findingId })` — refuse unless finding status is `confirmed`. For each cited URL on the probe (max 8), run the `source-investigator` sub-agent (see `workspace/agents/source-investigator.md`) with the `source-forensics` skill; validate its JSON with zod; store `source_reviews`.
  - Load `workspace/agents/*.md` and `workspace/jobs/*.md` into workspace resources (via `resourcePut` in a one-time seed script, or the Workspace tab) so they appear in the Workspace panel.
  - If sub-agent wiring takes more than 20 minutes, call the LLM directly with the skill content as the system prompt and keep the same JSON contract. Note this in the README.
- `/findings/:id/sources` **Source Forensics**: ranked list — URL, classification badge, suspicion meter (0–3), "carries wrong claim" flag, evidence quotes, recommended fix.

**Checkpoint 3:** confirm one finding in the UI, then ask the agent "Why is it saying that?" and see the forensics view populate. **Commit:** `feat: source forensics for confirmed findings`

---

## Phase 4 — Should-haves (only if Checkpoint 3 is done by 9 PM CT Sunday)

1. `draft-remediation({ findingId })` — returns a markdown correction brief: the wrong claim, the canonical fact with quote, ranked sources with fixes, and a suggested on-site content change. Displayed on the forensics page with a copy button. Draft only, never sent.
2. Recurring job: `workspace/jobs/daily-aeo-scan.md` loaded as a resource. Run locally with `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1` and show it in the Workspace tab.

**Commit:** `feat: remediation brief and daily scan job`

---

## Phase 5 — Polish + README (Monday, ≤ 30 min)

- Nav between the 4 screens; empty states; loading states on scan.
- `README.md`: problem (one paragraph), workflow diagram (copy from the project doc), how actions are shared by UI/agent/job, setup (`pnpm install`, `.env.example`, `pnpm dev`, replay mode), roadmap (multi-brand, alerts, trend charts, deploy).
- `.env.example` with key names only.
- Tag: `git tag demo-v1 && git push --tags`.

---

## Non-negotiables

- One implementation per capability: every button calls an action; the agent calls the same action.
- No fabricated findings or forensics in the demo. Seeds come only from real stored probes.
- Neutral language everywhere (see AGENTS.md).
- Never commit `.env` or the database file.
