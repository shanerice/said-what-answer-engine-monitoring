import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowRight, IconRadar } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function BrandsIndexRoute() {
  const navigate = useNavigate();
  const { data, isPending } = useActionQuery("list-brands", {});
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const create = useActionMutation("create-brand", {
    onSuccess: (result) => navigate(`/brands/${result.id}`),
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not add the brand."),
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <IconRadar className="size-4" /> Said What
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          What are answer engines telling buyers about your brand?
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Build ground truth from your own pages, ask ChatGPT-style engines the questions buyers ask, review drift, and trace the
          sources behind wrong answers.
        </p>
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !domain.trim()) return;
            create.mutate({ name: name.trim(), domain: domain.trim() });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Brand</Label>
            <Input id="brand-name" placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-domain">Domain</Label>
            <Input id="brand-domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <Button type="submit" disabled={create.isPending || !name.trim() || !domain.trim()}>
            {create.isPending ? "Adding…" : "Monitor brand"}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        {isPending
          ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : data?.brands.map((b) => (
              <Link
                key={b.id}
                to={`/brands/${b.id}`}
                className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
              >
                <span>
                  <span className="block font-medium">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.domain}</span>
                </span>
                <IconArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
      </section>
    </main>
  );
}
