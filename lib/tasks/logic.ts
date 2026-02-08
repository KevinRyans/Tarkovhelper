import { TaskProgressStatus } from "@prisma/client";

import type { TarkovTask } from "@/lib/tarkov/types";

export type TraderLevelMap = Record<string, number>;

export type ProgressMaps = {
  statusByTaskId: Record<string, TaskProgressStatus>;
  objectiveDoneByTaskId: Record<string, Record<string, boolean>>;
};

export type PlayerContext = {
  level: number;
  fleaUnlocked: boolean;
  traderLevels: TraderLevelMap;
};

export type NeededItemOption = {
  id: string;
  name: string;
  iconLink?: string | null;
};

export type TaskNeededItem =
  | {
      kind: "REQUIRED";
      id: string;
      name: string;
      count: number;
      iconLink?: string | null;
    }
  | {
      kind: "ANY_OF";
      groupId: string;
      count: number;
      foundInRaid?: boolean;
      options: NeededItemOption[];
    };

export function normalizeTraderLevels(value: unknown): TraderLevelMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return entries.reduce<TraderLevelMap>((acc, [name, level]) => {
    const parsed = Number(level);
    if (Number.isFinite(parsed)) {
      acc[name] = parsed;
    }
    return acc;
  }, {});
}

function compareNumber(compareMethod: string, left: number, right: number) {
  const method = compareMethod.toLowerCase();

  if (method.includes("greater") && method.includes("equal")) {
    return left >= right;
  }

  if (method.includes("greater")) {
    return left > right;
  }

  if (method.includes("less") && method.includes("equal")) {
    return left <= right;
  }

  if (method.includes("less")) {
    return left < right;
  }

  if (method.includes("equal")) {
    return left === right;
  }

  return left >= right;
}

export function isTaskDone(taskId: string, progress: ProgressMaps) {
  return progress.statusByTaskId[taskId] === TaskProgressStatus.DONE;
}

export function getMissingPrerequisiteTaskIds(task: TarkovTask, progress: ProgressMaps) {
  const missing: string[] = [];

  for (const req of task.taskRequirements) {
    const requiresComplete = req.status.some((status) => status.toLowerCase() === "complete");
    if (!requiresComplete) {
      continue;
    }

    if (!isTaskDone(req.task.id, progress)) {
      missing.push(req.task.id);
    }
  }

  return missing;
}

export function getMissingTraderRequirements(task: TarkovTask, player: PlayerContext) {
  const missing: string[] = [];

  for (const req of task.traderRequirements) {
    const requirementType = req.requirementType.toLowerCase();

    if (requirementType.includes("playerlevel")) {
      const ok = compareNumber(req.compareMethod, player.level, req.value);
      if (!ok) {
        missing.push(`Reach player level ${req.value}`);
      }
      continue;
    }

    if (requirementType.includes("loyaltylevel")) {
      const traderLevel = player.traderLevels[req.trader.name] ?? 0;
      const ok = compareNumber(req.compareMethod, traderLevel, req.value);
      if (!ok) {
        missing.push(`${req.trader.name} LL ${req.value}`);
      }
    }
  }

  return missing;
}

export function isTaskUnlocked(task: TarkovTask, progress: ProgressMaps, player: PlayerContext) {
  if (isTaskDone(task.id, progress)) {
    return false;
  }

  const missingTaskReqs = getMissingPrerequisiteTaskIds(task, progress);
  if (missingTaskReqs.length > 0) {
    return false;
  }

  const missingTraderReqs = getMissingTraderRequirements(task, player);
  return missingTraderReqs.length === 0;
}

export function buildDependencyGraph(tasks: TarkovTask[]) {
  const dependents = new Map<string, string[]>();

  for (const task of tasks) {
    for (const req of task.taskRequirements) {
      const list = dependents.get(req.task.id) ?? [];
      list.push(task.id);
      dependents.set(req.task.id, list);
    }
  }

  return dependents;
}

export function computeUnlockImpact(tasks: TarkovTask[]) {
  const graph = buildDependencyGraph(tasks);
  const score: Record<string, number> = {};

  for (const task of tasks) {
    score[task.id] = graph.get(task.id)?.length ?? 0;
  }

  return score;
}

export function getUpcomingTasks(tasks: TarkovTask[], progress: ProgressMaps, player: PlayerContext) {
  return tasks.filter((task) => isTaskUnlocked(task, progress, player));
}

export function getBlockedTasks(tasks: TarkovTask[], progress: ProgressMaps, player: PlayerContext) {
  return tasks
    .filter((task) => !isTaskDone(task.id, progress))
    .map((task) => ({
      task,
      missingTaskReqIds: getMissingPrerequisiteTaskIds(task, progress),
      missingTraderReqs: getMissingTraderRequirements(task, player),
    }))
    .filter((row) => row.missingTaskReqIds.length > 0 || row.missingTraderReqs.length > 0);
}

export function getFastestPathToKappa(tasks: TarkovTask[]) {
  const kappaTasks = tasks.filter((task) => task.kappaRequired);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const result: TarkovTask[] = [];

  function dfs(task: TarkovTask) {
    if (visited.has(task.id)) {
      return;
    }

    visited.add(task.id);

    for (const req of task.taskRequirements) {
      const prereq = taskMap.get(req.task.id);
      if (prereq?.kappaRequired) {
        dfs(prereq);
      }
    }

    result.push(task);
  }

  for (const task of kappaTasks) {
    dfs(task);
  }

  return result;
}

export function getNeededItemsForTask(task: TarkovTask): TaskNeededItem[] {
  const required = new Map<string, { id: string; name: string; count: number; iconLink?: string | null }>();
  const anyOfGroups: TaskNeededItem[] = [];

  for (const objective of task.objectives) {
    const count = objective.count ?? 1;

    if (objective.__typename === "TaskObjectiveItem" && objective.items?.length) {
      const options = Array.from(
        objective.items.reduce<Map<string, NeededItemOption>>((acc, item) => {
          acc.set(item.id, {
            id: item.id,
            name: item.name,
            iconLink: item.iconLink,
          });
          return acc;
        }, new Map()),
      ).map(([, value]) => value);

      anyOfGroups.push({
        kind: "ANY_OF",
        groupId: objective.id,
        count,
        foundInRaid: objective.foundInRaid,
        options: options.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    if (objective.__typename === "TaskObjectiveBuildItem" && objective.item) {
      const existing = required.get(objective.item.id);
      required.set(objective.item.id, {
        id: objective.item.id,
        name: objective.item.name,
        iconLink: objective.item.iconLink,
        count: (existing?.count ?? 0) + count,
      });
    }

    if (objective.__typename === "TaskObjectiveQuestItem" && objective.questItem) {
      const existing = required.get(objective.questItem.id);
      required.set(objective.questItem.id, {
        id: objective.questItem.id,
        name: objective.questItem.name,
        iconLink: objective.questItem.iconLink,
        count: (existing?.count ?? 0) + count,
      });
    }

    if (objective.__typename === "TaskObjectiveMark" && objective.markerItem) {
      const existing = required.get(objective.markerItem.id);
      required.set(objective.markerItem.id, {
        id: objective.markerItem.id,
        name: objective.markerItem.name,
        iconLink: objective.markerItem.iconLink,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const requiredItems: TaskNeededItem[] = Array.from(required.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((item) => ({
      kind: "REQUIRED",
      ...item,
    }));

  return [...requiredItems, ...anyOfGroups];
}

export function getStrictRequiredItemsForTask(task: TarkovTask) {
  return getNeededItemsForTask(task)
    .filter((item): item is Extract<TaskNeededItem, { kind: "REQUIRED" }> => item.kind === "REQUIRED")
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function getOverallTaskProgress(tasks: TarkovTask[], progress: ProgressMaps) {
  const total = tasks.length;
  const completed = tasks.filter((task) => isTaskDone(task.id, progress)).length;
  const inProgress = tasks.filter((task) => progress.statusByTaskId[task.id] === TaskProgressStatus.IN_PROGRESS).length;
  const remaining = total - completed;

  return {
    total,
    completed,
    inProgress,
    remaining,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
