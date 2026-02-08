import { TaskProgressStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { updateTaskProgress } from "@/lib/tasks/progress";

const schema = z.object({
  taskId: z.string().min(1),
  status: z.nativeEnum(TaskProgressStatus),
  notes: z.string().max(1000).optional(),
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

  const row = await updateTaskProgress({
    userId: session.user.id,
    taskId: parsed.data.taskId,
    status: parsed.data.status,
    notes: parsed.data.notes,
  });

  return NextResponse.json({ progress: row });
}
