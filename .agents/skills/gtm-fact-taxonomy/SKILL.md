---
name: gtm-fact-taxonomy
description: >-
  Said What runtime skill. Categories, extraction rules, drift verdicts and
  severity for a brand's go-to-market facts. Load before save-facts,
  save-prompts or save-findings.
scope: both
---

# GTM fact taxonomy

## Categories (severity if an engine gets it wrong)

| Category | Extract | Severity |
| --- | --- | --- |
| `trial_refund` | Free trial vs. free plan vs. money-back guarantee; length; card required; what happens at trial end | critical |
| `pricing` | Plan names, starting price, billing period, per-seat vs. usage, contact-sales tiers | critical |
| `security_compliance` | Named certifications, SSO/SAML, SCIM, data residency, encryption | critical |
| `product_status` | Current product name, prior names, acquisitions, deprecated or sunset products | critical |
| `limits` | Seats, projects, usage caps, storage, per-plan limits | high |
| `deployment_integrations` | Cloud vs. self-hosted, platforms, named integrations | high |
| `positioning` | Category, ideal customer, primary use cases | low |

## Extracting facts (save-facts)

1. Read every source with `get-source` (page with `offset` when `hasMore`).
2. One fact = one checkable claim. Split "14-day trial, no card required" into two facts.
3. `canonicalValue` is short and normalized (`14 days`, `not required`, `SOC 2 Type II`).
4. `evidenceQuote` is copied character-for-character from the source text, 5–40 words. The action rejects quotes it cannot find; fix and resend only the rejected ones.
5. Prefer the pricing page for pricing/trial, security/trust pages for compliance, docs for limits and integrations.
6. Two sources disagree → save both with `note: "conflict with <claim>"`. A human decides.
7. Skip adjectives ("fastest", "best-in-class"). Aim for 12–25 facts, critical categories first.

## Writing buyer questions (save-prompts)

- 8–12 questions, phrased the way a buyer types into ChatGPT: "Does Acme have a free trial?", "How much is Acme Pro per user?", "Is Acme SOC 2 compliant?", "What are the best alternatives to Acme?".
- Never put the answer in the question. Link each question to the approved fact ids it tests.

## Judging drift (save-findings)

For each probe from `list-probes`, compare the answer to each linked fact and send one verdict per (probe, fact):

| Verdict | Use when |
| --- | --- |
| `match` | States the canonical value or an equivalent |
| `contradiction` | States a different value for the same fact |
| `outdated` | Matches a plausible earlier state (old plan name, old price, old trial model) |
| `omission` | The question asked about the fact and the answer skipped or dodged it |
| `unsupported` | Asserts something in this category that no fact or source supports |

- `engineClaim`: verbatim excerpt of the engine's wording, max 40 words.
- Ambiguous → prefer `omission` or `unsupported` over `contradiction`.
- Raise severity one level when the wrong claim would push a buyer to a competitor ("no free trial" when there is one). Lower one level for `omission` when the answer links to the official page.
- Never call `review-finding`. A human confirms.
