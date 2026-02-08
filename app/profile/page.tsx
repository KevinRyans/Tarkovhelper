import { redirect } from "next/navigation";

import { ProfileSettings } from "@/components/profile/profile-settings";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { normalizeTraderLevels } from "@/lib/tasks/logic";
import { ensureUserSettings } from "@/lib/tasks/progress";

export default async function ProfilePage() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/profile");
  }

  const [user, settings] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, select: { username: true } }),
    ensureUserSettings(session.user.id),
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Profile Settings</h1>
        <p className="text-sm text-[var(--muted)]">Tune level/trader gates and privacy.</p>
      </div>

      <ProfileSettings
        username={user.username}
        initial={{
          level: settings.level,
          fleaUnlocked: settings.fleaUnlocked,
          traderLevels: normalizeTraderLevels(settings.traderLevels),
          privacy: settings.privacy,
        }}
      />
    </div>
  );
}
