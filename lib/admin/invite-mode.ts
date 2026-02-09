import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

const INVITE_MODE_STATE_KEY = "invite-only-mode";

function parseInviteMode(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return undefined;
  }

  const enabled = (meta as { enabled?: unknown }).enabled;
  if (typeof enabled === "boolean") {
    return enabled;
  }

  return undefined;
}

export async function getInviteOnlyMode() {
  const row = await db.syncState.findUnique({
    where: { key: INVITE_MODE_STATE_KEY },
    select: { meta: true },
  });

  const override = parseInviteMode(row?.meta);
  if (typeof override === "boolean") {
    return override;
  }

  return env.INVITE_ONLY_MODE;
}

export async function setInviteOnlyMode(enabled: boolean) {
  await db.syncState.upsert({
    where: { key: INVITE_MODE_STATE_KEY },
    create: {
      key: INVITE_MODE_STATE_KEY,
      lastRunAt: new Date(),
      meta: { enabled },
    },
    update: {
      lastRunAt: new Date(),
      meta: { enabled },
    },
  });
}

