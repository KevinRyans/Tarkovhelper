import { TaskProgressStatus } from "@prisma/client";

import { TasksExplorer } from "@/components/tasks/tasks-explorer";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  computeUnlockImpact,
  getFastestPathToKappa,
  getNeededItemsForTask,
  getOverallTaskProgress,
  getUpcomingTasks,
  isTaskUnlocked,
} from "@/lib/tasks/logic";
import { getPlayerContextForUser, getUserTaskStatusMap } from "@/lib/tasks/progress";
import { getAllTasks, getTaskMapAndTraderFacets } from "@/lib/tarkov/service";

function inferQuestType(objectives: Array<{ __typename: string }>) {
  if (objectives.some((objective) => objective.__typename === "TaskObjectiveShoot")) {
    return "kill";
  }

  if (objectives.some((objective) => objective.__typename === "TaskObjectiveMark")) {
    return "mark";
  }

  if (
    objectives.some((objective) =>
      ["TaskObjectiveItem", "TaskObjectiveBuildItem", "TaskObjectiveQuestItem"].includes(objective.__typename),
    )
  ) {
    return "fetch";
  }

  return "misc";
}

export default async function TasksPage() {
  const session = await getServerAuthSession();
  const tasks = await getAllTasks();

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

  const rows = tasks
    .map((task) => {
      const status = progress.statusByTaskId[task.id] ?? TaskProgressStatus.NOT_STARTED;
      const unlocked = isTaskUnlocked(task, progress, player);
      const blockedByTaskCount = task.taskRequirements.filter((req) => {
        const needsComplete = req.status.some((statusValue) => statusValue.toLowerCase() === "complete");
        if (!needsComplete) {
          return false;
        }
        return (progress.statusByTaskId[req.task.id] ?? TaskProgressStatus.NOT_STARTED) !== TaskProgressStatus.DONE;
      }).length;

      const blockedByTraderCount = task.traderRequirements.filter((req) => {
        const type = req.requirementType.toLowerCase();
        if (type.includes("playerlevel")) {
          return player.level < req.value;
        }

        if (type.includes("loyaltylevel")) {
          return (player.traderLevels[req.trader.name] ?? 0) < req.value;
        }

        return false;
      }).length;

      return {
        id: task.id,
        name: task.name,
        trader: task.trader.name,
        map: task.map?.name ?? "",
        minPlayerLevel: task.minPlayerLevel ?? 1,
        kappaRequired: task.kappaRequired,
        status,
        unlocked,
        blockedByTaskCount,
        blockedByTraderCount,
        needsItems: getNeededItemsForTask(task).length > 0,
        questType: inferQuestType(task.objectives),
      };
    })
    .sort((a, b) => {
      if (a.status === TaskProgressStatus.DONE && b.status !== TaskProgressStatus.DONE) return 1;
      if (b.status === TaskProgressStatus.DONE && a.status !== TaskProgressStatus.DONE) return -1;
      if (a.unlocked && !b.unlocked) return -1;
      if (b.unlocked && !a.unlocked) return 1;
      return a.name.localeCompare(b.name);
    });

  const upcoming = getUpcomingTasks(tasks, progress, player);
  const unlockImpact = computeUnlockImpact(tasks);

  const shortestNext = upcoming
    .map((task) => ({
      id: task.id,
      name: task.name,
      unlocks: unlockImpact[task.id] ?? 0,
    }))
    .sort((a, b) => b.unlocks - a.unlocks || a.name.localeCompare(b.name));

  const kappaPath = getFastestPathToKappa(tasks).map((task) => ({
    id: task.id,
    name: task.name,
  }));

  const facets = await getTaskMapAndTraderFacets();
  const summary = getOverallTaskProgress(tasks, progress);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tasks Explorer</h1>
        <p className="text-sm text-[var(--muted)]">
          Compact list + deep task detail + smart progression planning. Use Ctrl+K for global search.
        </p>
      </div>

      <TasksExplorer
        initialRows={rows}
        traders={facets.traders}
        maps={facets.maps}
        upcoming={upcoming.map((task) => ({ id: task.id, name: task.name, trader: task.trader.name }))}
        shortestNext={shortestNext}
        kappaPath={kappaPath}
        summary={summary}
        canEdit={Boolean(session?.user?.id)}
      />
    </div>
  );
}
