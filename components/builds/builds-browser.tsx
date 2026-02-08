"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BuildRow = {
  id: string;
  name: string;
  patch: string;
  isPublic: boolean;
  createdAt: string;
  author: {
    username: string;
  };
  snapshot: {
    recoil: number | null;
    ergo: number | null;
    cost: number | null;
    weight: number | null;
  } | null;
  tags: string[];
};

export function BuildsBrowser({ builds }: { builds: BuildRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id);
      }

      if (prev.length === 2) {
        return [prev[1], id];
      }

      return [...prev, id];
    });
  }

  const compared = useMemo(() => builds.filter((build) => selected.includes(build.id)), [builds, selected]);

  return (
    <div className="space-y-4">
      {compared.length === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Compare builds</CardTitle>
            <CardDescription>Side-by-side recoil, ergo, weight and cost.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {compared.map((build) => (
              <div key={build.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="font-medium">{build.name}</p>
                <p className="text-xs text-[var(--muted)]">by @{build.author.username}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p>Recoil: {build.snapshot?.recoil ?? "-"}</p>
                  <p>Ergo: {build.snapshot?.ergo ?? "-"}</p>
                  <p>Weight: {build.snapshot?.weight ?? "-"}</p>
                  <p>Cost: {build.snapshot?.cost?.toLocaleString("en-US") ?? "-"}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {builds.map((build) => (
          <Card key={build.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  <Link href={`/builds/${build.id}`} className="hover:text-[var(--accent)]">
                    {build.name}
                  </Link>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  @{build.author.username} • patch {build.patch}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {build.tags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                  <Badge variant={build.isPublic ? "accent" : "neutral"}>{build.isPublic ? "Public" : "Private"}</Badge>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
                <p>R {build.snapshot?.recoil ?? "-"}</p>
                <p>E {build.snapshot?.ergo ?? "-"}</p>
                <p>C {build.snapshot?.cost?.toLocaleString("en-US") ?? "-"}</p>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.includes(build.id)}
                    onChange={() => toggle(build.id)}
                    aria-label={`Compare ${build.name}`}
                  />
                  Compare
                </label>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
