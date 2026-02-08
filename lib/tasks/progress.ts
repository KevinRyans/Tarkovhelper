import { TaskProgressStatus, type PrivacySetting, type UserSettings } from "@prisma/client";

import { db } from "@/lib/db";
import { normalizeTraderLevels, type PlayerContext, type ProgressMaps } from "@/lib/tasks/logic";

export async function getUserProgressMaps(userId: string): Promise<ProgressMaps> {
  const [taskProgress, objectiveProgress] = await Promise.all([
    db.taskProgress.findMany({ where: { userId } }),
    db.taskObjectiveProgress.findMany({ where: { userId } }),
  ]);

  const statusByTaskId = taskProgress.reduce<Record<string, TaskProgressStatus>>((acc, row) => {
    acc[row.taskId] = row.status;
    return acc;
  }, {});

  const objectiveDoneByTaskId = objectiveProgress.reduce<Record<string, Record<string, boolean>>>((acc, row) => {
    const bucket = acc[row.taskId] ?? {};
    bucket[row.objectiveId] = row.done;
    acc[row.taskId] = bucket;
    return acc;
  }, {});

  return { statusByTaskId, objectiveDoneByTaskId };
}

export async function updateTaskProgress(params: {
  userId: string;
  taskId: string;
  status: TaskProgressStatus;
  notes?: string;
}) {
  return db.taskProgress.upsert({
    where: {
      userId_taskId: {
        userId: params.userId,
        taskId: params.taskId,
      },
    },
    create: {
      userId: params.userId,
      taskId: params.taskId,
      status: params.status,
      notes: params.notes,
    },
    update: {
      status: params.status,
      notes: params.notes,
    },
  });
}

export async function setObjectiveProgress(params: {
  userId: string;
  taskId: string;
  objectiveId: string;
  done: boolean;
}) {
  return db.taskObjectiveProgress.upsert({
    where: {
      userId_taskId_objectiveId: {
        userId: params.userId,
        taskId: params.taskId,
        objectiveId: params.objectiveId,
      },
    },
    create: {
      userId: params.userId,
      taskId: params.taskId,
      objectiveId: params.objectiveId,
      done: params.done,
    },
    update: {
      done: params.done,
    },
  });
}

export async function getPlayerContextForUser(userId: string): Promise<PlayerContext> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const level = settings?.level ?? 1;

  return {
    level,
    fleaUnlocked: settings?.fleaUnlocked ?? level >= 15,
    traderLevels: normalizeTraderLevels(settings?.traderLevels),
  };
}

export async function upsertUserSettings(params: {
  userId: string;
  level: number;
  fleaUnlocked: boolean;
  traderLevels: Record<string, number>;
  privacy: PrivacySetting;
}) {
  return db.userSettings.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      level: params.level,
      fleaUnlocked: params.fleaUnlocked,
      traderLevels: params.traderLevels,
      privacy: params.privacy,
    },
    update: {
      level: params.level,
      fleaUnlocked: params.fleaUnlocked,
      traderLevels: params.traderLevels,
      privacy: params.privacy,
    },
  });
}

export async function ensureUserSettings(userId: string): Promise<UserSettings> {
  const existing = await db.userSettings.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  return db.userSettings.create({
    data: {
      userId,
      level: 1,
      fleaUnlocked: false,
      traderLevels: {},
    },
  });
}
