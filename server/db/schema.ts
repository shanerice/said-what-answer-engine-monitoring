import { sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";

const owned = {
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull().default(sql`now()`),
};

export const brands = pgTable("sw_brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  category: text("category"),
  ...owned,
});

export const sources = pgTable("sw_sources", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("other"),
  title: text("title"),
  fetchedText: text("fetched_text"),
  httpStatus: integer("http_status"),
  fetchedAt: text("fetched_at"),
  ...owned,
});

export const facts = pgTable("sw_facts", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  category: text("category").notNull(),
  claim: text("claim").notNull(),
  canonicalValue: text("canonical_value").notNull(),
  evidenceQuote: text("evidence_quote").notNull(),
  sourceId: text("source_id").notNull(),
  severity: text("severity").notNull().default("high"),
  status: text("status").notNull().default("draft"),
  note: text("note"),
  ...owned,
});

export const prompts = pgTable("sw_prompts", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  text: text("text").notNull(),
  intent: text("intent").notNull().default("general"),
  factIds: text("fact_ids").notNull().default("[]"),
  active: integer("active").notNull().default(1),
  ...owned,
});

export const probes = pgTable("sw_probes", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  promptId: text("prompt_id").notNull(),
  engine: text("engine").notNull(),
  model: text("model").notNull(),
  answerText: text("answer_text").notNull(),
  citedUrls: text("cited_urls").notNull().default("[]"),
  runAt: text("run_at").notNull(),
  judgedAt: text("judged_at"),
  ...owned,
});

export const findings = pgTable("sw_findings", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull(),
  probeId: text("probe_id").notNull(),
  factId: text("fact_id").notNull(),
  verdict: text("verdict").notNull(),
  severity: text("severity").notNull(),
  engineClaim: text("engine_claim").notNull(),
  rationale: text("rationale"),
  status: text("status").notNull().default("new"),
  reviewerNote: text("reviewer_note"),
  remediationBrief: text("remediation_brief"),
  ...owned,
});

export const sourceReviews = pgTable("sw_source_reviews", {
  id: text("id").primaryKey(),
  findingId: text("finding_id").notNull(),
  url: text("url").notNull(),
  finalUrl: text("final_url"),
  classification: text("classification").notNull(),
  suspicion: integer("suspicion").notNull().default(0),
  carriesWrongClaim: integer("carries_wrong_claim").notNull().default(0),
  evidence: text("evidence").notNull().default("[]"),
  recommendedFix: text("recommended_fix").notNull(),
  ...owned,
});
