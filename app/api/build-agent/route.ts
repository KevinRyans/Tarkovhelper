import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { runBuildAgent } from "@/lib/builds/agent";
import { db } from "@/lib/db";

const constraintsSchema = z.object({
  budgetRub: z.number().int().nonnegative().default(300000),
  playerLevel: z.number().int().min(1).max(79).default(15),
  traderLevels: z.record(z.string(), z.number().int().min(0).max(4)).default({}),
  fleaEnabled: z.boolean().default(true),
  priority: z.enum(["LOW_RECOIL", "HIGH_ERGO", "BALANCED", "BEST_VALUE"]).default("BALANCED"),
  patch: z.string().default("current"),
});

const schema = z.object({
  prompt: z.string().min(3).max(600),
  constraints: constraintsSchema,
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

  const progress = await db.taskProgress.findMany({
    where: { userId: session.user.id },
    select: { taskId: true, status: true },
  });

  const progressByTaskId = progress.reduce<Record<string, "NOT_STARTED" | "IN_PROGRESS" | "DONE">>((acc, row) => {
    acc[row.taskId] = row.status;
    return acc;
  }, {});

  const result = await runBuildAgent({
    prompt: parsed.data.prompt,
    baseConstraints: parsed.data.constraints,
    progressByTaskId,
  });

  return NextResponse.json(result);
}
