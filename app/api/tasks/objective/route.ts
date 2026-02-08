import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { setObjectiveProgress } from "@/lib/tasks/progress";

const schema = z.object({
  taskId: z.string().min(1),
  objectiveId: z.string().min(1),
  done: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const row = await setObjectiveProgress({
    userId: session.user.id,
    taskId: parsed.data.taskId,
    objectiveId: parsed.data.objectiveId,
    done: parsed.data.done,
  });

  return NextResponse.json({ objectiveProgress: row });
}
