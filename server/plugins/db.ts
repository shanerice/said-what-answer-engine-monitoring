import { runMigrations } from "@agent-native/core/db";

const owned = `owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())`;

export default runMigrations(
  [
    {
      version: 1,
      name: "said-what-core",
      sql: `CREATE TABLE IF NOT EXISTS sw_brands (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, category TEXT, ${owned});
CREATE TABLE IF NOT EXISTS sw_sources (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, url TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'other', title TEXT,
  fetched_text TEXT, http_status INTEGER, fetched_at TEXT, ${owned});
CREATE TABLE IF NOT EXISTS sw_facts (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, category TEXT NOT NULL, claim TEXT NOT NULL, canonical_value TEXT NOT NULL,
  evidence_quote TEXT NOT NULL, source_id TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'high', status TEXT NOT NULL DEFAULT 'draft', note TEXT, ${owned});
CREATE TABLE IF NOT EXISTS sw_prompts (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, text TEXT NOT NULL, intent TEXT NOT NULL DEFAULT 'general',
  fact_ids TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, ${owned});
CREATE TABLE IF NOT EXISTS sw_probes (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, prompt_id TEXT NOT NULL, engine TEXT NOT NULL, model TEXT NOT NULL,
  answer_text TEXT NOT NULL, cited_urls TEXT NOT NULL DEFAULT '[]', run_at TEXT NOT NULL, judged_at TEXT, ${owned});
CREATE TABLE IF NOT EXISTS sw_findings (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, probe_id TEXT NOT NULL, fact_id TEXT NOT NULL, verdict TEXT NOT NULL,
  severity TEXT NOT NULL, engine_claim TEXT NOT NULL, rationale TEXT, status TEXT NOT NULL DEFAULT 'new',
  reviewer_note TEXT, remediation_brief TEXT, ${owned});
CREATE TABLE IF NOT EXISTS sw_source_reviews (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, url TEXT NOT NULL, final_url TEXT, classification TEXT NOT NULL,
  suspicion INTEGER NOT NULL DEFAULT 0, carries_wrong_claim INTEGER NOT NULL DEFAULT 0, evidence TEXT NOT NULL DEFAULT '[]',
  recommended_fix TEXT NOT NULL, ${owned});
CREATE INDEX IF NOT EXISTS sw_brands_owner_idx ON sw_brands (owner_email, org_id);
CREATE INDEX IF NOT EXISTS sw_sources_brand_idx ON sw_sources (brand_id);
CREATE INDEX IF NOT EXISTS sw_facts_brand_idx ON sw_facts (brand_id, status);
CREATE INDEX IF NOT EXISTS sw_prompts_brand_idx ON sw_prompts (brand_id);
CREATE INDEX IF NOT EXISTS sw_probes_brand_idx ON sw_probes (brand_id, prompt_id, engine, run_at);
CREATE INDEX IF NOT EXISTS sw_findings_brand_idx ON sw_findings (brand_id, status);
CREATE INDEX IF NOT EXISTS sw_source_reviews_finding_idx ON sw_source_reviews (finding_id)`,
    },
  ],
  { table: "said_what_migrations" },
);
