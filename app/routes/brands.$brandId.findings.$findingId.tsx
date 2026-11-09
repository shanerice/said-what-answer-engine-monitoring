import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowLeft, IconCheck, IconCopy, IconExternalLink, IconLock, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import {
  AgentButton, CATEGORY_LABEL, ENGINE_LABEL, hostOf, Pill, SeverityPill, StatusPill, VerdictPill,
} from "@/components/said-what/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const CLASS_LABEL: Record<string, string> = {
  official_current: "Official, current",
  official_stale: "Official, stale",
  third_party_outdated: "Third-party, outdated",
  competitor_authored: "Competitor-authored",
  affiliate_listicle: "Affiliate listicle",
  ugc: "User-generated",
  parasite_hosted: "Suspected parasite page",
  content_farm: "Suspected content farm",
  expired_domain: "Suspected expired domain",
  llm_targeted: "Suspected AI-targeted text",
  citation_mismatch: "Citation mismatch",
};

function Highlighted({ text, needle }: { text: string; needle: string }) {
  const i = needle ? text.toLowerCase().indexOf(needle.toLowerCase().slice(0, 60)) : -1;
  if (i < 0) return <>{text}</>;
  const end = text.toLowerCase().indexOf(needle.toLowerCase(), i) === i ? i + needle.length : i + Math.min(60, needle.length);
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-red-500/20 px-0.5 text-foreground">{text.slice(i, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function SuspicionMeter({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Suspicion ${value} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-2 w-4 rounded-sm ${n <= value ? (value >= 2 ? "bg-red-500" : "bg-amber-500") : "bg-muted"}`} />
      ))}
    </span>
  );
}

export default function FindingRoute() {
  const { brandId = "", findingId = "" } = useParams();
  const { data, isPending } = useActionQuery("get-finding", { id: findingId });
  const [note, setNote] = useState("");
  const review = useActionMutation("review-finding", {
    onSuccess: (r) => toast.success(r.status === "confirmed" ? "Confirmed. Source tracing is unlocked." : `Marked ${r.status}.`),
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Could not save the review."),
  });

  if (isPending || !data)
    return (
      <div className="grid gap-3 p-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );

  const { finding, probe, fact, source, question, sourceReviews } = data;
  const confirmed = finding.status === "confirmed";
  const engineName = probe ? (ENGINE_LABEL[probe.engine] ?? probe.engine) : "Engine";

  return (
    <main className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/brands/${brandId}/monitor`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" /> Answer monitor
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <VerdictPill verdict={finding.verdict} />
          <SeverityPill severity={finding.severity} />
          <StatusPill status={finding.status} />
        </div>
      </div>

      <h1 className="text-lg font-semibold tracking-tight">“{question}”</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-red-500/30 bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">What {engineName} said</h2>
          <p className="mt-2 text-base font-medium">“{finding.engineClaim}”</p>
          {probe ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Full answer · {probe.model} · {new Date(probe.runAt).toLocaleString()}
              </summary>
              <div className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
                <Highlighted text={probe.answerText} needle={finding.engineClaim} />
              </div>
            </details>
          ) : null}
          {probe?.citedUrls.length ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground">Cited {probe.citedUrls.length} sources</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {probe.citedUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] hover:underline">
                    {hostOf(u)}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No citations: this answer came from the model's training data.</p>
          )}
        </section>

        <section className="rounded-xl border border-emerald-500/30 bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">What your pages say</h2>
          {fact ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                {CATEGORY_LABEL[fact.category] ?? fact.category} · {fact.claim}
              </p>
              <p className="mt-1 text-base font-semibold">{fact.canonicalValue}</p>
              <blockquote className="mt-3 border-l-2 border-emerald-500/50 pl-3 text-sm">“{fact.evidenceQuote}”</blockquote>
              {source ? (
                <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                  {source.title || source.url} <IconExternalLink className="size-3" />
                </a>
              ) : null}
            </>
          ) : null}
          {finding.rationale ? <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs">Agent's reasoning: {finding.rationale}</p> : null}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Your call</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The agent flags drift; you decide. Confirming unlocks source forensics.
        </p>
        <Textarea
          rows={2}
          className="mt-3"
          placeholder="Optional note, e.g. “Trial changed to 14 days in March.”"
          defaultValue={finding.reviewerNote ?? ""}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={confirmed ? "default" : "outline"}
            className={confirmed ? "" : "border-red-500/50 text-red-700 dark:text-red-300"}
            disabled={review.isPending}
            onClick={() => review.mutate({ id: finding.id, decision: "confirmed", ...(note ? { note } : {}) })}
          >
            <IconCheck className="size-4" /> Confirm it's wrong
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={review.isPending}
            onClick={() => review.mutate({ id: finding.id, decision: "dismissed", ...(note ? { note } : {}) })}
          >
            <IconX className="size-4" /> Dismiss
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Source forensics</h2>
            <p className="text-xs text-muted-foreground">Why is the engine saying this? Which cited pages carry the wrong claim, and what kind of pages are they?</p>
          </div>
          {confirmed ? (
            <span className="w-56">
            <AgentButton
              workingLabel="Agent tracing sources…"
              doneLabel="Source forensics saved."
              message={`Trace the sources behind confirmed finding ${finding.id}. Load the source-forensics skill. For each cited URL (max 8) call inspect-cited-page, classify it using only observed signals, and save all classifications with save-source-reviews. Then write a correction brief with save-remediation and summarize the top fix for me.`}
            >
              {sourceReviews.length ? "Re-trace sources" : "Trace sources"}
            </AgentButton>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <IconLock className="size-3.5" /> Confirm the finding to unlock
            </span>
          )}
        </div>

        {sourceReviews.length ? (
          <ol className="mt-4 flex flex-col gap-2">
            {sourceReviews.map((r, i) => (
              <li key={r.id} className={`rounded-lg border p-3 ${r.carriesWrongClaim ? "border-red-500/40 bg-red-500/5" : "border-border"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium hover:underline">
                    {hostOf(r.url)}
                  </a>
                  <Pill className="bg-muted text-foreground ring-border">{CLASS_LABEL[r.classification] ?? r.classification}</Pill>
                  <SuspicionMeter value={r.suspicion} />
                  {r.carriesWrongClaim ? <Pill className="bg-red-500/12 text-red-700 ring-red-500/30 dark:text-red-300">carries the wrong claim</Pill> : null}
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {r.evidence.map((ev: string, j: number) => (
                    <li key={j}>{ev}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  <span className="font-medium">Fix:</span> {r.recommendedFix}
                </p>
              </li>
            ))}
          </ol>
        ) : null}

        {finding.remediationBrief ? (
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide">Correction brief (draft)</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(finding.remediationBrief ?? "");
                  toast.success("Brief copied.");
                }}
              >
                <IconCopy className="size-4" /> Copy
              </Button>
            </div>
            <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{finding.remediationBrief}</div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
