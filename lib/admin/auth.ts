import type { Session } from "next-auth";

import { env } from "@/lib/config/env";

function normalizeEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

export function getAdminEmail() {
  return normalizeEmail(env.ADMIN_EMAIL);
}

export function isAdminEmail(email: string | null | undefined) {
  const adminEmail = getAdminEmail();
  const currentEmail = normalizeEmail(email);

  return Boolean(adminEmail && currentEmail && adminEmail === currentEmail);
}

export function isAdminSession(session: Session | null) {
  return isAdminEmail(session?.user?.email);
}

export function isValidAdminPanelKey(panelKey: string) {
  const configured = env.ADMIN_PANEL_KEY?.trim();
  if (!configured) {
    return false;
  }

  return configured === panelKey;
}

