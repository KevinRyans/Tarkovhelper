import Link from "next/link";

import { CompanionSetupCard } from "@/components/companion/companion-setup-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeUnlockImpact, getUpcomingTasks, getOverallTaskProgress as summarize } from "@/lib/tasks/logic";
import { getPlayerContextForUser, getUserProgressMaps } from "@/lib/tasks/progress";
import { getAllTasks, getKappaTasks } from "@/lib/tarkov/service";

export default async function DashboardPage() {
  const session = await getServerAuthSession();

  const [tasks, kappaTasks] = await Promise.all([getAllTasks(), getKappaTasks()]);

  if (!session?.user?.id) {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Escape from Tarkov Helper</CardTitle>
            <CardDescription>Clean task progression, Kappa planner, weapon builder, and AI constraints assistant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Create an account to sync progress per task, objective and build presets.</p>
            <div className="flex gap-2">
              <Link href="/auth/register">
                <Button>Create account</Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="secondary">Log in</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [progress, player, recentBuilds] = await Promise.all([
    getUserProgressMaps(session.user.id),
    getPlayerContextForUser(session.user.id),
    db.build.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { snapshot: true },
      take: 5,
    }),
  ]);

  const summary = summarize(tasks, progress);
  const kappaSummary = summarize(kappaTasks, progress);
  const upcoming = getUpcomingTasks(tasks, progress, player);
  const unlockImpact = computeUnlockImpact(tasks);

  const nextActions = upcoming
    .map((task) => ({
      id: task.id,
      name: task.name,
      trader: task.trader.name,
      unlocks: unlockImpact[task.id] ?? 0,
    }))
    .sort((a, b) => b.unlocks - a.unlocks || a.name.localeCompare(b.name))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[var(--muted)]">Your progress, next best actions, and build workflow.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total task progress</CardDescription>
            <CardTitle>
              {summary.completed}/{summary.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={summary.percent} />
            <p className="text-sm text-[var(--muted)]">{summary.percent}% complete</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Kappa progress</CardDescription>
            <CardTitle>
              {kappaSummary.completed}/{kappaSummary.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={kappaSummary.percent} />
            <p className="text-sm text-[var(--muted)]">{kappaSummary.percent}% Kappa requirements done</p>
            <Link href="/kappa" className="text-sm text-[var(--accent)] hover:underline">
              Open Kappa dashboard
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Profile constraints</CardDescription>
            <CardTitle>Current build/task context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>PMC level: {player.level}</p>
            <p>Flea enabled: {player.fleaUnlocked ? "Yes" : "No"}</p>
            <Link href="/profile" className="text-[var(--accent)] hover:underline">
              Adjust profile settings
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Next best actions</CardTitle>
            <CardDescription>Tasks available now, sorted by unlock impact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {nextActions.length === 0 ? <p className="text-[var(--muted)]">No unlocked tasks right now.</p> : null}
            {nextActions.map((action) => (
              <p key={action.id}>
                <Link href={`/tasks/${action.id}`} className="text-[var(--accent)] hover:underline">
                  {action.name}
                </Link>{" "}
                <span className="text-[var(--muted)]">({action.trader}, unlocks {action.unlocks})</span>
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent builds</CardTitle>
            <CardDescription>Latest saved presets for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentBuilds.length === 0 ? (
              <p className="text-[var(--muted)]">
                No builds yet.{" "}
                <Link href="/builds/new" className="text-[var(--accent)] hover:underline">
                  Create your first build
                </Link>
                .
              </p>
            ) : null}

            {recentBuilds.map((build) => (
              <div key={build.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
                <p className="font-medium">
                  <Link href={`/builds/${build.id}`} className="hover:text-[var(--accent)]">
                    {build.name}
                  </Link>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Patch {build.patch}
                  {build.isPublic ? " | public" : " | private"}
                </p>
                {build.snapshot ? (
                  <div className="mt-1 flex gap-1">
                    <Badge variant="neutral">Recoil {build.snapshot.recoil ?? "-"}</Badge>
                    <Badge variant="neutral">Ergo {build.snapshot.ergo ?? "-"}</Badge>
                    <Badge variant="neutral">Cost {build.snapshot.cost?.toLocaleString("en-US") ?? "-"}</Badge>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <CompanionSetupCard compact />
      </section>
    </div>
  );
}
