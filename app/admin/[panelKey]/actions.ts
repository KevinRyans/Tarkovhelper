"use server";

import { revalidatePath } from "next/cache";

import { isAdminSession, isValidAdminPanelKey } from "@/lib/admin/auth";
import { setInviteOnlyMode } from "@/lib/admin/invite-mode";
import { env } from "@/lib/config/env";
import { createInviteCodes } from "@/lib/invites/service";
import { getServerAuthSession } from "@/lib/auth/session";

async function assertAdminAccess(panelKey: string) {
  if (!isValidAdminPanelKey(panelKey)) {
    throw new Error("Invalid admin panel key");
  }

  const session = await getServerAuthSession();
  if (!isAdminSession(session)) {
    throw new Error("Unauthorized");
  }
}

export async function setInviteOnlyModeAction(panelKey: string, enabled: boolean) {
  await assertAdminAccess(panelKey);
  await setInviteOnlyMode(enabled);
  revalidatePath(`/admin/${panelKey}`);
}

export async function generateInviteCodesAction(panelKey: string, formData: FormData) {
  await assertAdminAccess(panelKey);

  const rawCount = formData.get("count");
  const parsedCount =
    typeof rawCount === "string"
      ? Number.parseInt(rawCount, 10)
      : Number.parseInt(String(rawCount ?? "0"), 10);

  if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
    return;
  }

  const count = Math.min(Math.max(parsedCount, 1), 200);

  await createInviteCodes({
    count,
    prefix: env.INVITE_CODE_PREFIX,
    tokenLength: env.INVITE_CODE_LENGTH,
  });

  revalidatePath(`/admin/${panelKey}`);
}

