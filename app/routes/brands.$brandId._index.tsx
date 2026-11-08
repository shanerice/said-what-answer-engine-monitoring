import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { AgentButton, CATEGORY_LABEL, hostOf, SeverityPill, StatusPill } from "@/components/said-what/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Fact = {
  id: string; category: string; claim: string; canonicalValue: string; evidenceQuote: string;
  sourceId: string; severity: string; status: string; note: string | null;
};

function guessType(url: string) {
  const u = url.toLowerCase();
  if (u.includes("pricing") || u.includes("plans")) return "pricing" as const;
  if (u.includes("security") || u.includes("trust")) return "security" as const;
  if (u.includes("faq") || u.includes("help")) return "faq" as const;
  if (u.includes("docs") || u.includes("documentation")) return "docs" as const;
  if (u.includes("customer") || u.includes("case-stud")) return "case_study" as const;
  try {
    return new URL(url).pathname.length <= 1 ? ("landing" as const) : ("other" as const);
  } catch {
    return "other" as const;
  }
}

export default function GroundTruthRoute() {
  const { brandId = "" } = useParams();
  const queryClient = useQueryClient();
  const params = { brandId, status: "all" as const };
  const queryKey = ["action", "list-facts", params];
  const { data, isPending } = useActionQuery("list-facts", params);
  const [urls, setUrls] = useState("");

  const ingest = useActionMutation("ingest-sources", {
    onSuccess: (r) => {
      setUrls("");
      toast.success(r.message);
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Could not fetch those pages."),
  });

  const update = useActionMutation("update-fact", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: { facts: Fact[] } | undefined) =>
        old ? { ...old, facts: old.facts.map((f) => (f.id === input.id ? { ...f, ...input } : f)) } : old,
      );
      return { previous };
    },
    onError: (e, _i, ctx) => {
      queryClient.setQueryData(queryKey, (ctx as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(e) ?? "Could not update the fact.");
    },
  });

  const facts = (data?.facts ?? []) as Fact[];
  const sources = data?.sources ?? [];
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const grouped = useMemo(() => {
    const m = new Map<string, Fact[]>();
    for (const f of facts) m.set(f.category, [...(m.get(f.category) ?? []), f]);
    return [...m.entries()];
  }, [facts]);
  const approved = facts.filter((f) => f.status === "approved").length;
  const drafts = facts.filter((f) => f.status === "draft").length;
  const brandName = data?.brand.name ?? "this brand";

  if (isPending)
    return (
      <div className="grid gap-3 p-6">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );

  return (
    <main className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[22rem_1fr]">
      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your own pages define the truth. One URL per line.</p>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const list = urls.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)).slice(0, 10);
              if (!list.length) return toast.error("Paste at least one https URL.");
              ingest.mutate({ brandId, sources: list.map((url) => ({ url, type: guessType(url) })) });
            }}
          >
            <Textarea
              rows={4}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://acme.com/pricing\nhttps://acme.com/security"}
              className="font-mono text-xs"
            />
            <Button type="submit" size="sm" disabled={ingest.isPending}>
              {ingest.isPending ? "Fetching pages…" : "Add sources"}
            </Button>
          </form>
          <ul className="mt-3 flex flex-col gap-1.5">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">
                  {s.title || s.url}
                </a>
                <span className={s.httpStatus === 200 ? "text-muted-foreground" : "text-red-600"}>
                  {s.type} · {s.httpStatus ?? "failed"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Next steps</h2>
          <div className="mt-3 flex flex-col gap-2">
            <AgentButton
              disabled={!sources.length}
              message={`Extract GTM facts for ${brandName} (brandId ${brandId}). Load the gtm-fact-taxonomy skill, read every source with get-source, and save drafts with save-facts using verbatim evidence quotes. Then tell me which drafts need my approval, critical ones first.`}
            >
              Extract facts with the agent
            </AgentButton>
            <AgentButton
              variant="outline"
              disabled={!approved}
              message={`Write 10 buyer-style questions for ${brandName} (brandId ${brandId}) that test its approved facts. Weight trial, pricing, security and product-status facts; include 2 "alternatives to ${brandName}" or comparison questions. Phrase them the way a buyer types into ChatGPT, without leading answers. Save them with save-prompts.`}
            >
              Write buyer questions
            </AgentButton>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {approved} approved · {drafts} awaiting review
          </p>
        </section>
      </aside>

      <section className="flex min-w-0 flex-col gap-5">
        {!facts.length ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No facts yet. Add your pricing, security and docs pages, then let the agent extract facts with evidence quotes.
          </div>
        ) : (
          grouped.map(([category, list]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABEL[category] ?? category}
              </h3>
              {list.map((f) => {
                const src = sourceById.get(f.sourceId);
                return (
                  <article
                    key={f.id}
                    className={`rounded-xl border bg-card p-3 ${f.status === "rejected" ? "opacity-50" : ""} ${f.status === "approved" ? "border-emerald-500/40" : "border-border"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{f.claim}</span>
                          <SeverityPill severity={f.severity} />
                          <StatusPill status={f.status} />
                        </div>
                        <Input
                          key={f.canonicalValue}
                          defaultValue={f.canonicalValue}
                          aria-label={`Canonical value for ${f.claim}`}
                          className="mt-2 h-8 max-w-sm font-semibold"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== f.canonicalValue) update.mutate({ id: f.id, canonicalValue: v });
                          }}
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={f.status === "approved" ? "default" : "outline"}
                          onClick={() => update.mutate({ id: f.id, status: "approved" })}
                        >
                          <IconCheck className="size-4" /> Approve
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Reject fact"
                          onClick={() => update.mutate({ id: f.id, status: "rejected" })}
                        >
                          <IconX className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                      “{f.evidenceQuote}”
                      {src ? (
                        <a href={src.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 hover:underline">
                          {hostOf(src.url)}
                          {new URL(src.url).pathname}
                          <IconExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </blockquote>
                    {f.note ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{f.note}</p> : null}
                  </article>
                );
              })}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
