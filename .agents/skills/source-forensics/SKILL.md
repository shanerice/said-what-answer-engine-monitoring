---
name: source-forensics
description: >-
  Said What runtime skill. Classify the URLs an answer engine cited for a
  CONFIRMED finding, using SEO-manipulation patterns adapted for answer
  engines. Load before inspect-cited-page / save-source-reviews.
scope: both
---

# Source forensics for answer engines

Answer engines repeat what their retrieved and training sources say. A wrong answer usually has a source. Work only on findings whose status is `confirmed`.

## Procedure

1. `get-finding` → the wrong claim, the canonical fact, and `probe.citedUrls`.
2. No cited URLs (a training-data engine) → save nothing; write the brief saying the claim comes from stale training data, and recommend strengthening official pages (plain-text fact near the top, FAQ, "last updated" date).
3. For each cited URL (max 8): `inspect-cited-page`. It returns observed `signals`, `wrongClaimExcerpts`, `canonicalExcerpts`, `hiddenText` and a text sample.
4. Classify each URL with exactly one class below. `carriesWrongClaim` = true only when `wrongClaimExcerpts` (or the text sample) actually states the wrong claim.
5. `suspicion` 0–3: 0 benign, 1 one weak signal, 2 several signals, 3 strong manipulation signals (hidden or AI-directed text, cross-host redirects plus content mismatch).
6. `evidence`: only signals the tool returned and short quotes. Never invent a signal.
7. `save-source-reviews` once with all URLs, then `save-remediation` with a markdown brief: the wrong claim, the truth with its quote, sources ranked (carries claim first, then suspicion), one fix each, and one on-site content change.

## Classes

| Class | What it is | Typical signals | Fix |
| --- | --- | --- | --- |
| `official_current` | Brand's own page, matches the truth | brand host, canonical excerpt present | Strengthen: fact in plain text near top, FAQ markup |
| `official_stale` | Brand's own page with old facts | brand host, old plan names/prices, old docs version | Update or redirect; remove from sitemap; add "last updated" |
| `third_party_outdated` | Legit review/directory/comparison that was once accurate | third-party host, old published date | Ask the publisher to update; send the canonical page |
| `competitor_authored` | Comparison or "alternatives" page by a competitor | competitor host, "vs"/"alternatives" title | Publish an accurate comparison; contact publisher if false |
| `affiliate_listicle` | "Best tools for…" pages monetized by affiliate links | affiliate parameters, rel=sponsored, listicle title | Request correction; supply a facts sheet |
| `ugc` | Reddit, forums, Q&A | community host, user claim | Reply from a disclosed official account; update help center |
| `parasite_hosted` | Unknown author on a high-authority host (Medium, LinkedIn articles, PR wires) | no author, keyword-stuffed title | Report if false; out-rank with official content |
| `content_farm` | Scraped, spun or mass AI-generated pages | no author, generic template, near-duplicate text | Usually no outreach; strengthen official sources |
| `expired_domain` | Domain repurposed or redirecting elsewhere | cross-host redirect, content mismatch | Monitor; no outreach |
| `llm_targeted` | Text aimed at AI crawlers, not humans | hidden text blocks, text addressed to AI assistants | Flag for human review; report to host |
| `citation_mismatch` | Cited page does not contain the claim | no excerpts, fetch failed | Note as engine error; no source fix |

## Language

- Prefix manipulation classes (`parasite_hosted`, `content_farm`, `expired_domain`, `llm_targeted`) with "suspected" in prose.
- Describe signals, not intent: "no author, published 3 days after the price change", never "attacker" or "malicious".
