import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconPlayerPlay } from "@tabler/icons-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { AgentButton, askAgent, ENGINE_LABEL, SeverityPill, StatusPill, VerdictPill } from "@/components/said-what/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CELL: Record<string, string> = {
  match: "bg-emerald-500/10 border-emerald-500/30",
  drift: "bg-red-500/10 border-red-500/40",
  unjudged: "bg-muted border-dashed border-border",
  not_asked: "border-dashed border-border",
};

function judgeMessage(brandName: string, brandId: string) {
  return `Judge the unjudged engine answers for ${brandName} (brandId ${brandId}). Load the gtm-fact-taxonomy skill, call list-probes, compare each answer to the approved facts its question tests, and record one verdict per (probe, fact) with save-findings, including matches. Quote the engine verbatim in engineClaim. Then summarize the worst drift for me to review. Do not confirm findings yourself.`;
}

export default function MonitorRoute() {
  const { brandId = "" } = useParams();
  const { data, isPending } = useActionQuery("get-monitor", { brandId });
  const findings = useActionQuery("list-findings", { brandId, status: "all" });
  const brandName = data?.brand.name ?? "this brand";

  const scan = useActionMutation("run-probe", {
    onSuccess: (r) => {
      toast.success(r.message);
      if (r.asked > 0) askAgent(judgeMessage(brandName, brandId));
    },
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Scan failed."),
  });

  if (isPending)
    return (
      <div className="grid gap-3 p-6">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );

  const rows = data?.rows ?? [];
  const engines = data?.engines ?? [];
  const list = findings.data?.findings ?? [];

  return (
    <main className="grid gap-6 p-4 sm:p-6 2xl:grid-cols-[1fr_26rem]">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} questions × {engines.length} engines
            {data?.lastRunAt ? ` · last scan ${new Date(data.lastRunAt).toLocaleString()}` : ""}
          </p>
          <div className="flex gap-2">
            {data?.unjudged ? (
              <AgentButton variant="outline" message={judgeMessage(brandName, brandId)}>
                Judge {data.unjudged} answers
              </AgentButton>
            ) : null}
            <Button size="sm" disabled={!rows.length || scan.isPending} onClick={() => scan.mutate({ brandId, force: false })}>
              <IconPlayerPlay className="size-4" />
              {scan.isPending ? "Asking engines…" : "Run scan"}
            </Button>
          </div>
        </div>

        {!rows.length ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No questions yet. Approve facts on Ground truth, then have the agent write buyer questions.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Buyer question</th>
                  {engines.map((e) => (
                    <th key={e.id} className="w-40 p-3 font-medium">
                      {ENGINE_LABEL[e.id] ?? e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.promptId} className="border-b border-border last:border-0">
                    <td className="p-3 align-top">
                      <span className="block">{row.question}</span>
                      <span className="text-xs text-muted-foreground">{row.intent}</span>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.engine} className="p-2 align-top">
                        {"findingId" in cell && cell.findingId ? (
                          <Link
                            to={`/brands/${brandId}/findings/${cell.findingId}`}
                            className={cn("flex flex-col gap-1 rounded-lg border p-2 transition-opacity hover:opacity-80", CELL[cell.state])}
                          >
                            <span className="flex flex-wrap gap-1">
                              <VerdictPill verdict={cell.verdict ?? "drift"} />
                              {cell.severity ? <SeverityPill severity={cell.severity} /> : null}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {cell.findingStatus}
                              {cell.openFindings > 1 ? ` · +${cell.openFindings - 1} more` : ""}
                            </span>
                          </Link>
                        ) : (
                          <div className={cn("rounded-lg border p-2 text-[11px] text-muted-foreground", CELL[cell.state])}>
                            {cell.state === "match" ? "matches ground truth" : cell.state === "unjudged" ? "awaiting judgment" : "not asked"}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Review queue <span className="font-normal text-muted-foreground">· {data?.counts.new ?? 0} new</span>
        </h2>
        {list.length ? (
          list.map((f) => (
            <Link
              key={f.id}
              to={`/brands/${brandId}/findings/${f.id}`}
              className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <VerdictPill verdict={f.verdict} />
                <SeverityPill severity={f.severity} />
                <StatusPill status={f.status} />
                <span className="text-xs text-muted-foreground">{ENGINE_LABEL[f.engine] ?? f.engine}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm">“{f.engineClaim}”</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Truth: {f.claim} = <span className="font-medium text-foreground">{f.canonicalValue}</span>
              </p>
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No drift found yet.</p>
        )}
      </aside>
    </main>
  );
}
