import { TaskProgressStatus } from "@prisma/client";
import { notFound } from "next/navigation";

import { KappaDashboard } from "@/components/kappa/kappa-dashboard";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getFastestPathToKappa,
  getNeededItemsForTask,
  getMissingPrerequisiteTaskIds,
  getMissingTraderRequirements,
  getStrictRequiredItemsForTask,
  normalizeTraderLevels,
} from "@/lib/tasks/logic";
import { getUserProgressMaps } from "@/lib/tasks/progress";
import { getAllTasks } from "@/lib/tarkov/service";

function difficultyFromLevel(level: number | null | undefined) {
  if (!level || level < 20) return "easy" as const;
  if (level < 35) return "medium" as const;
  return "hard" as const;
}

export default async function PublicKappaPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getServerAuthSession();

  const user = await db.user.findUnique({
    where: { username },
    include: {
      settings: true,
    },
  });

  if (!user) {
    notFound();
  }

  const isOwner = viewer?.user?.id === user.id;
  if (!isOwner && user.settings?.privacy !== "PUBLIC") {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
        This user&apos;s Kappa profile is private.
      </div>
    );
  }

  const allTasks = await getAllTasks();
  const kappaTasks = allTasks.filter((task) => task.kappaRequired);
  const progress = await getUserProgressMaps(user.id);

  const player = {
    level: user.settings?.level ?? 1,
    fleaUnlocked: user.settings?.fleaUnlocked ?? (user.settings?.level ?? 1) >= 15,
    traderLevels: normalizeTraderLevels(user.settings?.traderLevels),
  };

  const ordered = getFastestPathToKappa(kappaTasks);
  const orderMap = new Map(ordered.map((task, index) => [task.id, index]));
  const dependentMap = new Map<string, Array<{ id: string; name: string }>>();

  for (const task of allTasks) {
    for (const requirement of task.taskRequirements) {
      const list = dependentMap.get(requirement.task.id) ?? [];
      list.push({ id: task.id, name: task.name });
      dependentMap.set(requirement.task.id, list);
    }
  }

  for (const [taskId, list] of dependentMap.entries()) {
    dependentMap.set(taskId, list.sort((a, b) => a.name.localeCompare(b.name)));
  }

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
        blockedByTasks: blockedByTaskIds.map((id) => kappaTasks.find((value) => value.id === id)?.name ?? id),
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

  const taskDetailsById: Record<
    string,
    {
      task: (typeof kappaTasks)[number];
      nextTasks: Array<{ id: string; name: string }>;
      neededItems: ReturnType<typeof getNeededItemsForTask>;
      objectiveDoneMap: Record<string, boolean>;
    }
  > = {};

  for (const task of kappaTasks) {
    taskDetailsById[task.id] = {
      task,
      nextTasks: dependentMap.get(task.id) ?? [],
      neededItems: getNeededItemsForTask(task),
      objectiveDoneMap: progress.objectiveDoneByTaskId[task.id] ?? {},
    };
  }

  const traders = Array.from(new Set(rows.map((row) => row.trader))).sort((a, b) => a.localeCompare(b));
  const maps = Array.from(new Set(rows.map((row) => row.map).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kappa Progress: @{user.username}</h1>
        <p className="text-sm text-[var(--muted)]">Public profile view.</p>
      </div>

      <KappaDashboard
        rows={rows}
        taskDetailsById={taskDetailsById}
        hoardItems={hoardItems}
        traders={traders}
        maps={maps}
        shareUrl={`/kappa/${user.username}`}
        canEdit={Boolean(isOwner)}
      />
    </div>
  );
}
