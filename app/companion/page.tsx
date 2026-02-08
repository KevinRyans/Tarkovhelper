import Link from "next/link";
import { headers } from "next/headers";

import { CompanionGuideCard } from "@/components/companion/companion-guide-card";
import { CompanionSetupCard } from "@/components/companion/companion-setup-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth/session";
import { env } from "@/lib/config/env";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function resolveApiBaseUrl() {
  if (env.NEXTAUTH_URL) {
    return stripTrailingSlash(env.NEXTAUTH_URL);
  }

  const incomingHeaders = await headers();
  const forwardedHost = incomingHeaders.get("x-forwarded-host");
  const forwardedProto = incomingHeaders.get("x-forwarded-proto");
  const host = incomingHeaders.get("host");

  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  if (host) {
    const protocol = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

export default async function CompanionPage() {
  const session = await getServerAuthSession();
  const apiBaseUrl = await resolveApiBaseUrl();

  if (!session?.user?.id) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Companion Sync Setup</CardTitle>
            <CardDescription>Sign in to create a sync token and connect the background agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-x-2">
            <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
              Log in
            </Link>
            <span className="text-[var(--muted)]">or</span>
            <Link href="/auth/register" className="text-[var(--accent)] hover:underline">
              create account
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Companion Sync</h1>
        <p className="text-sm text-[var(--muted)]">Connect a local EFT log watcher to sync task progress automatically.</p>
      </div>

      <CompanionSetupCard />

      <section className="grid gap-4 lg:grid-cols-2">
        <CompanionGuideCard apiBaseUrl={apiBaseUrl} />

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>What this can and cannot sync.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--muted)]">
            <p>Data coverage depends on what EFT logs contain and retain on disk.</p>
            <p>Old progress can be backfilled only if historical logs still exist.</p>
            <p>Unknown quest names/IDs are skipped safely and reported by the ingest API.</p>
            <p>The sync badge auto-refreshes every 15 seconds. Hard-refresh the page if needed.</p>
            <p>Rotate token any time if you want to revoke old agent access.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
