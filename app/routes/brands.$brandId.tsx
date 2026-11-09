import { requestAgentChatThreadOpen } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { RunsTray } from "@agent-native/toolkit/app/progress";
import { NavLink, Outlet, useParams } from "react-router";

import { cn } from "@/lib/utils";

export default function BrandLayout() {
  const { brandId = "" } = useParams();
  const { data } = useActionQuery("list-facts", { brandId, status: "approved" });
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight">{data?.brand.name ?? "…"}</div>
          <div className="text-xs text-muted-foreground">{data?.brand.domain}</div>
        </div>
        <div className="flex items-center gap-2">
        <RunsTray
          triggerVariant="pill"
          hideWhenIdle={false}
          showRecent
          align="end"
          onOpenThread={(threadId) => requestAgentChatThreadOpen({ threadId })}
        />
        <nav className="flex gap-1" aria-label="Brand sections">
          <NavLink end to={`/brands/${brandId}`} className={tab}>
            Ground truth
          </NavLink>
          <NavLink to={`/brands/${brandId}/monitor`} className={tab}>
            Answer monitor
          </NavLink>
        </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
