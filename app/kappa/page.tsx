import { TaskProgressStatus } from "@prisma/client";

import { KappaDashboard } from "@/components/kappa/kappa-dashboard";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  getFastestPathToKappa,
  getMissingPrerequisiteTaskIds,
  getMissingTraderRequirements,
  getStrictRequiredItemsForTask,
} from "@/lib/tasks/logic";
import { getPlayerContextForUser, getUserTaskStatusMap } from "@/lib/tasks/progress";
import { db } from "@/lib/db";
import { getKappaTasks } from "@/lib/tarkov/service";

function difficultyFromLevel(level: number | null | undefined) {
  if (!level || level < 20) return "easy" as const;
  if (level < 35) return "medium" as const;
  return "hard" as const;
}

export default async function KappaPage() {
  const session = await getServerAuthSession();
  const kappaTasks = await getKappaTasks();
  const kappaTaskNameById = new Map(kappaTasks.map((task) => [task.id, task.name]));

  const statusByTaskId = session?.user?.id ? await getUserTaskStatusMap(session.user.id) : ({} as Record<string, TaskProgressStatus>);
  const progress = {
    statusByTaskId,
    objectiveDoneByTaskId: {},
  };

  const player = session?.user?.id
    ? await getPlayerContextForUser(session.user.id)
    : {
        level: 1,
        fleaUnlocked: false,
        traderLevels: {},
      };

  const ordered = getFastestPathToKappa(kappaTasks);
  const orderMap = new Map(ordered.map((task, index) => [task.id, index]));

  const rows = kappaTasks
    .map((task) => {
      const blockedByTaskIds = getMissingPrerequisiteTaskIds(task, progress);
      const blockedByTrader = getMissingTraderRequirements(task, player);

      return {
        id: task.id,
        name: task.name,
        trader: task.trader.name,
        map: task.map?.name ?? "",
        status: progress.statusByTaskId[task.id] ?? TaskProgressStatus.NOT_STARTED,
        blockedByTasks: blockedByTaskIds.map((id) => kappaTaskNameById.get(id) ?? id),
        blockedByTrader,
        difficulty: difficultyFromLevel(task.minPlayerLevel),
        recommendedOrder: orderMap.get(task.id) ?? 9999,
      };
    })
    .sort((a, b) => a.recommendedOrder - b.recommendedOrder || a.name.localeCompare(b.name));

  const remaining = rows.filter((row) => row.status !== TaskProgressStatus.DONE);

  const hoardMap = new Map<string, { id: string; name: string; count: number; iconLink?: string | null }>();

  for (const row of remaining.slice(0, 20)) {
    const task = kappaTasks.find((item) => item.id === row.id);
    if (!task) continue;

    for (const item of getStrictRequiredItemsForTask(task)) {
      const existing = hoardMap.get(item.id);
      hoardMap.set(item.id, {
        id: item.id,
        name: item.name,
        count: (existing?.count ?? 0) + item.count,
        iconLink: existing?.iconLink ?? item.iconLink ?? null,
      });
    }
  }

  const hoardItems = Array.from(hoardMap.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  let shareUrl: string | undefined;
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        settings: {
          select: {
            privacy: true,
          },
        },
      },
    });

    if (user?.settings?.privacy === "PUBLIC") {
      shareUrl = `/kappa/${user.username}`;
    }
  }

  const traders = Array.from(new Set(rows.map((row) => row.trader))).sort((a, b) => a.localeCompare(b));
  const maps = Array.from(new Set(rows.map((row) => row.map).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kappa Dashboard</h1>
        <p className="text-sm text-[var(--muted)]">Prereq-aware Kappa planner with remaining quests and hoard list.</p>
      </div>

      <KappaDashboard
        rows={rows}
        hoardItems={hoardItems}
        traders={traders}
        maps={maps}
        shareUrl={shareUrl}
        canEdit={Boolean(session?.user?.id)}
      />
    </div>
  );
}
