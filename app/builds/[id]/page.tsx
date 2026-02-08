import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function BuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();

  const build = await db.build.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          username: true,
        },
      },
      parts: true,
      snapshot: true,
    },
  });

  if (!build) {
    notFound();
  }

  const isOwner = session?.user?.id === build.author.id;
  if (!build.isPublic && !isOwner) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
        This build is private.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{build.name}</CardTitle>
          <CardDescription>
            by @{build.author.username} • patch {build.patch}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1">
            {build.tags.map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
              </Badge>
            ))}
            <Badge variant={build.isPublic ? "accent" : "neutral"}>{build.isPublic ? "Public" : "Private"}</Badge>
          </div>

          {build.description ? <p className="text-[var(--muted)]">{build.description}</p> : null}

          {build.snapshot ? (
            <div className="grid gap-2 md:grid-cols-4">
              <Badge variant="neutral">Recoil {build.snapshot.recoil ?? "-"}</Badge>
              <Badge variant="neutral">Ergo {build.snapshot.ergo ?? "-"}</Badge>
              <Badge variant="neutral">Cost {build.snapshot.cost?.toLocaleString("en-US") ?? "-"}</Badge>
              <Badge variant="neutral">Weight {build.snapshot.weight ?? "-"}</Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parts</CardTitle>
          <CardDescription>Slot-by-slot configuration snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {build.parts.map((part) => (
            <div key={part.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
              <div className="flex items-center gap-2">
                <Image
                  src={`/api/icons/${part.itemId}`}
                  alt={part.itemName ?? part.itemId}
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded object-cover"
                />
                <div>
                  <p className="text-sm font-medium">{part.slotKey}</p>
                  <p className="text-xs text-[var(--muted)]">{part.itemName ?? part.itemId}</p>
                </div>
              </div>

              <p className="text-xs text-[var(--muted)]">
                {part.priceRub ? `${part.priceRub.toLocaleString("en-US")} RUB` : "-"}
                {part.source ? ` • ${part.source}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link href="/builds" className="text-sm text-[var(--accent)] hover:underline">
        Back to builds
      </Link>
    </div>
  );
}
