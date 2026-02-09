import { TaskProgressStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getNeededItemsForTask } from "@/lib/tasks/logic";
import { getTaskProgressSnapshot } from "@/lib/tasks/progress";
import { getNextTasksByTaskId, getTaskById } from "@/lib/tarkov/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const task = await getTaskById(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const session = await getServerAuthSession();
  const username = new URL(request.url).searchParams.get("username")?.trim();

  let targetUserId = session?.user?.id ?? null;

  if (username) {
    const user = await db.user.findUnique({
      where: { username },
      select: {
        id: true,
        settings: {
          select: {
            privacy: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isOwner = session?.user?.id === user.id;
    if (!isOwner && user.settings?.privacy !== "PUBLIC") {
      return NextResponse.json({ error: "Profile is private" }, { status: 403 });
    }

    targetUserId = user.id;
  }

  let status: TaskProgressStatus = TaskProgressStatus.NOT_STARTED;
  let objectiveDoneMap: Record<string, boolean> = {};

  if (targetUserId) {
    const progress = await getTaskProgressSnapshot(targetUserId, task.id);
    status = progress.status;
    objectiveDoneMap = progress.objectiveDoneMap;
  }

  const [nextTasks, neededItems] = await Promise.all([getNextTasksByTaskId(task.id), Promise.resolve(getNeededItemsForTask(task))]);

  return NextResponse.json(
    {
      task,
      nextTasks,
      neededItems,
      objectiveDoneMap,
      status,
    },
    {
      headers: {
        "cache-control": "private, no-store",
      },
    },
  );
}
