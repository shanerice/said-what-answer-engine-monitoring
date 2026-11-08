import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { IconSparkles } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Hand an AI-shaped job to the agent sidebar, in the same thread the user can steer. */
export function askAgent(message: string) {
  sendToAgentChat({ message, submit: true, openSidebar: true });
}

export function AgentButton({
  children,
  message,
  variant = "default",
  disabled,
}: {
  children: ReactNode;
  message: string;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean | undefined;
}) {
  return (
    <Button variant={variant} size="sm" disabled={disabled} onClick={() => askAgent(message)}>
      <IconSparkles className="size-4" />
      {children}
    </Button>
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
