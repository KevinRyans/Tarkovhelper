import { PrivacySetting } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { ensureUserSettings, upsertUserSettings } from "@/lib/tasks/progress";

const schema = z.object({
  level: z.number().int().min(1).max(79),
  fleaUnlocked: z.boolean(),
  traderLevels: z.record(z.string(), z.number().int().min(0).max(4)),
  privacy: z.nativeEnum(PrivacySetting),
});

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await ensureUserSettings(session.user.id);
  return NextResponse.json({ settings });
}

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

  const settings = await upsertUserSettings({
    userId: session.user.id,
    level: parsed.data.level,
    fleaUnlocked: parsed.data.fleaUnlocked,
    traderLevels: parsed.data.traderLevels,
    privacy: parsed.data.privacy,
  });

  return NextResponse.json({ settings });
}
