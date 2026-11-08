import { fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export type Ctx = { userEmail?: string | null; orgId?: string | null } | undefined;

export function owner(ctx: Ctx) {
  const ownerEmail =
    ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
  return { ownerEmail, orgId: ctx?.orgId ?? null };
}

/** Load a brand the current user owns, or fail 404. */
export async function requireBrand(brandId: string, ctx: Ctx) {
  const { ownerEmail } = owner(ctx);
  const b = schema.brands;
  const [brand] = await getDb()
    .select()
    .from(b)
    .where(and(eq(b.id, brandId), eq(b.ownerEmail, ownerEmail)))
    .limit(1);
  if (!brand)
    fail("Brand not found.", { errorCode: "not_found", statusCode: 404 });
  return brand;
}

export async function requireFinding(findingId: string, ctx: Ctx) {
  const { ownerEmail } = owner(ctx);
  const f = schema.findings;
  const [finding] = await getDb()
    .select()
    .from(f)
    .where(and(eq(f.id, findingId), eq(f.ownerEmail, ownerEmail)))
    .limit(1);
  if (!finding)
    fail("Finding not found.", { errorCode: "not_found", statusCode: 404 });
  return finding;
}

export function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeWs(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", trade: "™", reg: "®", copy: "©",
};

export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|td|th)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property|itemprop)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property|itemprop)=["']${name}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 SaidWhat/0.1";

export type FetchedPage = {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  text: string;
  html: string;
  redirected: boolean;
};

export async function fetchPage(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
    });
    const html = (await res.text()).slice(0, 2_000_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() : null,
      text: htmlToText(html),
      html,
      redirected: res.redirected,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic page signals used by source forensics. Reports only what it observes. */
export function pageSignals(page: FetchedPage, brandDomain: string) {
  const html = page.html;
  const host = safeHost(page.finalUrl);
  const originalHost = safeHost(page.url);
  const signals: string[] = [];
  const published = metaContent(html, [
    "article:published_time", "datePublished", "pubdate", "publish-date", "date",
  ]);
  const modified = metaContent(html, [
    "article:modified_time", "dateModified", "last-modified", "og:updated_time",
  ]);
  const author = metaContent(html, ["author", "article:author"]);
  if (published) signals.push(`published: ${published}`);
  if (modified) signals.push(`modified: ${modified}`);
  if (author) signals.push(`author: ${author}`);
  else signals.push("no author meta tag");
  if (originalHost && host && originalHost !== host)
    signals.push(`redirected across hosts: ${originalHost} → ${host}`);
  const brandHost = brandDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const isOfficial = !!host && (host === brandHost || host.endsWith(`.${brandHost}`));
  signals.push(isOfficial ? "host is the brand's own domain" : "host is third-party");
  const affiliate = html.match(/[?&](ref|aff|affiliate|via|partner|utm_source)=[^"'&\s]+/gi);
  if (affiliate) signals.push(`affiliate-style link parameters: ${affiliate.length}`);
  const sponsored = (html.match(/rel=["'][^"']*sponsored/gi) || []).length;
  if (sponsored) signals.push(`rel="sponsored" links: ${sponsored}`);
  const hiddenBlocks = [
    ...html.matchAll(
      /<([a-z0-9]+)[^>]*(?:style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|left\s*:\s*-\d{3,}px)[^"']*["']|aria-hidden=["']true["'][^>]*class=["'][^"']*(?:sr-only|visually-hidden))[^>]*>([\s\S]{0,600}?)<\/\1>/gi,
    ),
  ]
    .map((m) => htmlToText(m[2] ?? ""))
    .filter((t) => t.length > 40);
  if (hiddenBlocks.length)
    signals.push(`hidden text blocks with substantive text: ${hiddenBlocks.length}`);
  const aiDirected = page.text.match(
    /(ai assistants?|language models?|llms?|chatgpt|claude|perplexity|gemini)[^.\n]{0,80}(should|must|always|recommend|ignore|instead)/gi,
  );
  if (aiDirected) signals.push(`text addressed to AI assistants: ${aiDirected.slice(0, 2).join(" | ")}`);
  const titleLower = (page.title ?? "").toLowerCase();
  if (/\bvs\.?\b|alternative|competitor|compared/.test(titleLower))
    signals.push("comparison/alternatives page title");
  if (/best .* (tools|software|apps)|top \d+/.test(titleLower))
    signals.push("listicle-style title");
  return { host, isOfficial, signals, hiddenText: hiddenBlocks.slice(0, 3) };
}

export function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Find a short window of text around the first match of any needle. */
export function excerptAround(text: string, needles: string[], radius = 220) {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const needle of needles) {
    const n = needle.trim().toLowerCase();
    if (n.length < 3) continue;
    const i = lower.indexOf(n);
    if (i >= 0) {
      out.push(
        `…${text.slice(Math.max(0, i - radius), i + n.length + radius).replace(/\s+/g, " ")}…`,
      );
    }
    if (out.length >= 3) break;
  }
  return out;
}
