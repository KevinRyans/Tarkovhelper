import { TaskProgressStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCompanionUserByTokenHash, touchCompanionTokenUsage } from "@/lib/companion/store";
import { extractCompanionToken, hashCompanionToken } from "@/lib/companion/token";
import { db } from "@/lib/db";

const ingestEventSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    taskName: z.string().min(1).max(180).optional(),
    status: z.string().min(1).max(40).optional(),
    objectiveId: z.string().min(1).max(180).optional(),
    objectiveDone: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((event) => Boolean(event.taskId || event.taskName), {
    message: "Each event needs taskId or taskName",
    path: ["taskId"],
  });

const ingestBodySchema = z.object({
  token: z.string().min(8).optional(),
  source: z.string().max(120).optional(),
  events: z.array(ingestEventSchema).min(1).max(5000),
});

function normalizeTaskName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactTaskName(value: string) {
  return normalizeTaskName(value).replace(/\s+/g, "");
}

function buildTaskNameAliases(value: string) {
  const normalized = normalizeTaskName(value);
  if (!normalized) {
    return [];
  }

  const aliases = new Set<string>([normalized, compactTaskName(normalized)]);
  const withoutArticle = normalized.replace(/^(the|a|an)\s+/, "").trim();
  if (withoutArticle) {
    aliases.add(withoutArticle);
    aliases.add(compactTaskName(withoutArticle));
  }

  const withoutParentheses = normalized.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (withoutParentheses) {
    aliases.add(withoutParentheses);
    aliases.add(compactTaskName(withoutParentheses));
  }

  return Array.from(aliases).filter(Boolean);
}

function extractTaskIdCandidate(value: string) {
  const match = value.match(/\b([a-f0-9]{24})\b/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function resolveByTokenOverlap(taskName: string, rows: Array<{ id: string; normalizedName: string }>) {
  const stopWords = new Set([
    "the",
    "task",
    "quest",
    "part",
    "and",
    "for",
    "with",
    "from",
    "any",
    "find",
    "raid",
    "in",
    "to",
    "of",
  ]);

  const normalized = normalizeTaskName(taskName);
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  if (tokens.length === 0) {
    return null;
  }

  const matches = rows.filter((row) => tokens.every((token) => row.normalizedName.includes(token)));
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

function normalizeStatus(value?: string) {
  if (!value) {
    return null;
  }

  const normalized = value
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .trim();

  if (
    [
      "DONE",
      "COMPLETE",
      "COMPLETED",
      "SUCCESS",
      "SUCCEEDED",
      "READY_TO_HAND_IN",
      "AVAILABLE_FOR_FINISH",
      "FINISHED",
      "TURNED_IN",
      "HAND_IN",
      "HANDIN",
    ].includes(normalized)
  ) {
    return TaskProgressStatus.DONE;
  }

  if (
    [
      "IN_PROGRESS",
      "STARTED",
      "ACTIVE",
      "RUNNING",
      "AVAILABLE",
      "START",
      "PROGRESS",
      "AVAILABLE_FOR_START",
      "NEW",
    ].includes(normalized)
  ) {
    return TaskProgressStatus.IN_PROGRESS;
  }

  if (["NOT_STARTED", "LOCKED", "UNKNOWN", "NONE", "UNAVAILABLE"].includes(normalized)) {
    return TaskProgressStatus.NOT_STARTED;
  }

  return null;
}

function statusRank(status: TaskProgressStatus) {
  if (status === TaskProgressStatus.DONE) {
    return 3;
  }

  if (status === TaskProgressStatus.IN_PROGRESS) {
    return 2;
  }

  return 1;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function extractCompletePrereqIds(taskData: unknown) {
  if (!taskData || typeof taskData !== "object") {
    return [] as string[];
  }

  const raw = taskData as {
    taskRequirements?: Array<{
      status?: unknown;
      task?: { id?: unknown };
    }>;
  };

  if (!Array.isArray(raw.taskRequirements)) {
    return [] as string[];
  }

  const ids: string[] = [];
  for (const req of raw.taskRequirements) {
    const statusValues = Array.isArray(req.status) ? req.status.map((value) => String(value).toLowerCase()) : [];
    if (!statusValues.includes("complete")) {
      continue;
    }

    const id = req.task?.id;
    if (typeof id === "string" && id.length > 0) {
      ids.push(id);
    }
  }

  return ids;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tokenCandidate = typeof payload === "object" && payload && "token" in payload ? (payload as { token?: string }).token : undefined;
  const token = extractCompanionToken(request, tokenCandidate ?? null);

  if (!token) {
    return NextResponse.json({ error: "Missing companion token" }, { status: 401 });
  }

  const tokenHash = hashCompanionToken(token);
  const companion = await getCompanionUserByTokenHash(tokenHash);

  if (!companion) {
    return NextResponse.json({ error: "Invalid companion token" }, { status: 401 });
  }

  const parsed = ingestBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const taskRows = await db.taskCatalog.findMany({
    select: {
      id: true,
      name: true,
      normalizedName: true,
    },
  });

  const taskIdByCanonical = new Map<string, string>();
  const taskIdByName = new Map<string, string | null>();
  const taskLookupRows: Array<{ id: string; normalizedName: string }> = [];

  const registerAlias = (alias: string, taskId: string) => {
    const existing = taskIdByName.get(alias);
    if (existing === undefined) {
      taskIdByName.set(alias, taskId);
      return;
    }

    if (existing !== taskId) {
      taskIdByName.set(alias, null);
    }
  };

  for (const row of taskRows) {
    taskIdByCanonical.set(row.id.toLowerCase(), row.id);

    const aliases = [
      ...buildTaskNameAliases(row.name),
      ...(row.normalizedName ? buildTaskNameAliases(row.normalizedName) : []),
    ];

    for (const alias of aliases) {
      registerAlias(alias, row.id);
    }

    const normalizedForLookup = row.normalizedName ? normalizeTaskName(row.normalizedName) : normalizeTaskName(row.name);
    if (normalizedForLookup) {
      taskLookupRows.push({ id: row.id, normalizedName: normalizedForLookup });
    }
  }

  const taskUpserts = new Map<string, { status: TaskProgressStatus; notes?: string }>();
  const objectiveUpserts = new Map<string, { taskId: string; objectiveId: string; done: boolean }>();
  let skippedUnknownTask = 0;
  let skippedUnknownStatus = 0;
  const unknownTaskSamples: string[] = [];
  const unknownStatusSamples: string[] = [];

  for (const event of parsed.data.events) {
    const eventTaskId = event.taskId?.trim().toLowerCase();
    const extractedTaskIdFromName = event.taskName ? extractTaskIdCandidate(event.taskName) : null;

    let resolvedTaskId =
      (eventTaskId ? taskIdByCanonical.get(eventTaskId) ?? null : null) ??
      (extractedTaskIdFromName ? taskIdByCanonical.get(extractedTaskIdFromName) ?? null : null);

    if (!resolvedTaskId && event.taskName) {
      const aliases = buildTaskNameAliases(event.taskName);
      for (const alias of aliases) {
        const candidate = taskIdByName.get(alias);
        if (candidate) {
          resolvedTaskId = candidate;
          break;
        }
      }
    }

    if (!resolvedTaskId && event.taskName) {
      resolvedTaskId = resolveByTokenOverlap(event.taskName, taskLookupRows);
    }

    if (!resolvedTaskId) {
      skippedUnknownTask += 1;
      if (unknownTaskSamples.length < 10) {
        unknownTaskSamples.push(event.taskId ?? event.taskName ?? "unknown");
      }
      continue;
    }

    const status = normalizeStatus(event.status);
    if (event.status && !status) {
      skippedUnknownStatus += 1;
      if (unknownStatusSamples.length < 10) {
        unknownStatusSamples.push(event.status);
      }
    }

    if (status) {
      const existing = taskUpserts.get(resolvedTaskId);
      if (!existing || statusRank(status) >= statusRank(existing.status)) {
        taskUpserts.set(resolvedTaskId, {
          status,
          notes: event.notes,
        });
      }
    }

    if (event.objectiveId && typeof event.objectiveDone === "boolean") {
      const objectiveKey = `${resolvedTaskId}::${event.objectiveId}`;
      objectiveUpserts.set(objectiveKey, {
        taskId: resolvedTaskId,
        objectiveId: event.objectiveId,
        done: event.objectiveDone,
      });
    }
  }

  const directlyDoneTaskIds = Array.from(taskUpserts.entries())
    .filter(([, value]) => value.status === TaskProgressStatus.DONE)
    .map(([taskId]) => taskId);

  if (directlyDoneTaskIds.length > 0) {
    const catalogRows = await db.taskCatalog.findMany({
      select: {
        id: true,
        taskData: true,
      },
    });

    const prereqByTaskId = new Map<string, string[]>();
    for (const row of catalogRows) {
      prereqByTaskId.set(row.id, extractCompletePrereqIds(row.taskData));
    }

    const inferredDone = new Set<string>();
    const queue = [...directlyDoneTaskIds];

    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }

      const prereqs = prereqByTaskId.get(current) ?? [];
      for (const prereqId of prereqs) {
        if (inferredDone.has(prereqId)) {
          continue;
        }

        inferredDone.add(prereqId);
        queue.push(prereqId);
      }
    }

    for (const taskId of inferredDone) {
      const existing = taskUpserts.get(taskId);
      if (!existing || statusRank(TaskProgressStatus.DONE) >= statusRank(existing.status)) {
        taskUpserts.set(taskId, {
          status: TaskProgressStatus.DONE,
          notes: existing?.notes,
        });
      }
    }
  }

  const incomingTaskIds = Array.from(taskUpserts.keys());
  const existingTaskRows =
    incomingTaskIds.length > 0
      ? await db.taskProgress.findMany({
          where: {
            userId: companion.userId,
            taskId: { in: incomingTaskIds },
          },
          select: {
            taskId: true,
            status: true,
            notes: true,
          },
        })
      : [];

  const existingByTaskId = new Map(existingTaskRows.map((row) => [row.taskId, row]));

  const taskOps = Array.from(taskUpserts.entries()).map(([taskId, value]) =>
    {
      const existing = existingByTaskId.get(taskId);
      const finalStatus =
        existing && statusRank(existing.status) > statusRank(value.status) ? existing.status : value.status;
      const finalNotes = value.notes ?? existing?.notes ?? null;

      return db.taskProgress.upsert({
      where: {
        userId_taskId: {
          userId: companion.userId,
          taskId,
        },
      },
      create: {
        userId: companion.userId,
        taskId,
        status: finalStatus,
        notes: finalNotes,
      },
      update: {
        status: finalStatus,
        notes: finalNotes,
      },
      });
    },
  );

  const objectiveOps = Array.from(objectiveUpserts.values()).map((value) =>
    db.taskObjectiveProgress.upsert({
      where: {
        userId_taskId_objectiveId: {
          userId: companion.userId,
          taskId: value.taskId,
          objectiveId: value.objectiveId,
        },
      },
      create: {
        userId: companion.userId,
        taskId: value.taskId,
        objectiveId: value.objectiveId,
        done: value.done,
      },
      update: {
        done: value.done,
      },
    }),
  );

  for (const ops of chunk(taskOps, 200)) {
    await db.$transaction(ops);
  }

  for (const ops of chunk(objectiveOps, 200)) {
    await db.$transaction(ops);
  }

  await touchCompanionTokenUsage(tokenHash, parsed.data.source ?? "unknown");

  return NextResponse.json({
    ok: true,
    received: parsed.data.events.length,
    taskUpdates: taskOps.length,
    objectiveUpdates: objectiveOps.length,
    skippedUnknownTask,
    skippedUnknownStatus,
    unknownTaskSamples,
    unknownStatusSamples,
  });
}
