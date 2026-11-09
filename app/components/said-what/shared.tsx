import { sendToAgentChat, useAgentChatGenerating } from "@agent-native/core/client/agent-chat";
import { IconLoader2, IconMessageCircle, IconSparkles } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hand an AI-shaped job to the agent. By default it runs as a background agent
 * thread (full agent run with the same actions, tracked in the Runs tray) so the
 * page keeps focus; pass { visible: true } to run it in the sidebar instead.
 */
export function askAgent(message: string, opts: { visible?: boolean } = {}) {
  if (opts.visible) return sendToAgentChat({ message, submit: true, openSidebar: true });
  return sendToAgentChat({ message, submit: true, newTab: true, background: true, openSidebar: false });
}

/** Tracks one background agent run by its tab id; refreshes page data when it ends. */
export function useBackgroundAgentRun(doneLabel?: string) {
  const [tabId, setTabId] = useState<string | null>(null);
  const [generating] = useAgentChatGenerating({ tabId });
  const sawRunning = useRef(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!tabId) return;
    if (generating) {
      sawRunning.current = true;
      return;
    }
    if (!sawRunning.current) return;
    sawRunning.current = false;
    setTabId(null);
    void queryClient.invalidateQueries({ queryKey: ["action"] });
    if (doneLabel) toast.success(doneLabel, { description: "Open the Runs tray to read the agent's notes." });
  }, [generating, tabId, queryClient, doneLabel]);
  // Safety net: never leave a button spinning if the run's end event is missed.
  useEffect(() => {
    if (!tabId) return;
    const timer = setTimeout(() => {
      setTabId(null);
      sawRunning.current = false;
      void queryClient.invalidateQueries({ queryKey: ["action"] });
    }, 5 * 60_000);
    return () => clearTimeout(timer);
  }, [tabId, queryClient]);
  return {
    running: !!tabId,
    start: (message: string) => {
      sawRunning.current = false;
      setTabId(askAgent(message));
    },
  };
}

export function AgentButton({
  children,
  message,
  variant = "default",
  disabled,
  workingLabel = "Agent working…",
  doneLabel,
}: {
  children: ReactNode;
  message: string;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean | undefined;
  workingLabel?: string;
  doneLabel?: string;
}) {
  const run = useBackgroundAgentRun(doneLabel);
  return (
    <span className="inline-flex w-full items-stretch gap-1">
      <Button
        variant={variant}
        size="sm"
        className="flex-1"
        disabled={disabled || run.running}
        onClick={() => run.start(message)}
      >
        {run.running ? <IconLoader2 className="size-4 animate-spin" /> : <IconSparkles className="size-4" />}
        {run.running ? workingLabel : children}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("px-2", run.running && "invisible")}
        disabled={disabled}
        aria-label="Run in the chat sidebar instead"
        title="Run in the chat sidebar instead"
        onClick={() => askAgent(message, { visible: true })}
      >
        <IconMessageCircle className="size-4" />
      </Button>
    </span>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  match: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  omission: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  unsupported: "bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-orange-500/30",
  outdated: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/30",
  contradiction: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/40",
};

export function Pill({ className, children }: { className?: string | undefined; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: string }) {
  return <Pill className={VERDICT_STYLE[verdict] ?? "bg-muted text-muted-foreground ring-border"}>{verdict}</Pill>;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-600 text-white ring-red-600",
  high: "bg-amber-500/15 text-amber-800 dark:text-amber-200 ring-amber-500/40",
  low: "bg-muted text-muted-foreground ring-border",
};

export function SeverityPill({ severity }: { severity: string }) {
  return <Pill className={SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.low}>{severity}</Pill>;
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/12 text-blue-700 dark:text-blue-300 ring-blue-500/30",
  confirmed: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/30",
  dismissed: "bg-muted text-muted-foreground ring-border",
  draft: "bg-muted text-muted-foreground ring-border",
  approved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  rejected: "bg-muted text-muted-foreground line-through ring-border",
};

export function StatusPill({ status }: { status: string }) {
  return <Pill className={STATUS_STYLE[status] ?? STATUS_STYLE.draft}>{status}</Pill>;
}

export const CATEGORY_LABEL: Record<string, string> = {
  trial_refund: "Trial & refund",
  pricing: "Pricing",
  security_compliance: "Security & compliance",
  product_status: "Product status",
  limits: "Limits",
  deployment_integrations: "Deployment & integrations",
  positioning: "Positioning",
};

export const ENGINE_LABEL: Record<string, string> = {
  "claude-web": "Claude + web",
  "claude-memory": "Claude (memory)",
  perplexity: "Perplexity",
  openai: "OpenAI",
};

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
