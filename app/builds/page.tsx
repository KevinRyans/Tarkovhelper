import Link from "next/link";

import { BuildsBrowser } from "@/components/builds/builds-browser";
import { Button } from "@/components/ui/button";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export default async function BuildsPage() {
  const session = await getServerAuthSession();

  const where = session?.user?.id
    ? {
        OR: [{ isPublic: true }, { userId: session.user.id }],
      }
    : { isPublic: true };

  const builds = await db.build.findMany({
    where,
    include: {
      author: {
        select: {
          username: true,
        },
      },
      snapshot: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Builds</h1>
          <p className="text-sm text-[var(--muted)]">Browse, compare, and reuse saved builds.</p>
        </div>

        <Link href="/builds/new">
          <Button>Create new build</Button>
        </Link>
      </div>

      <BuildsBrowser
        builds={builds.map((build) => ({
          id: build.id,
          name: build.name,
          patch: build.patch,
          isPublic: build.isPublic,
          createdAt: build.createdAt.toISOString(),
          author: { username: build.author.username },
          snapshot: build.snapshot
            ? {
                recoil: build.snapshot.recoil,
                ergo: build.snapshot.ergo,
                cost: build.snapshot.cost,
                weight: build.snapshot.weight,
              }
            : null,
          tags: build.tags,
        }))}
      />
    </div>
  );
}
