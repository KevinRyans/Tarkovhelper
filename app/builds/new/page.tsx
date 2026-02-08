import { redirect } from "next/navigation";

import { BuildBuilder } from "@/components/builds/build-builder";
import { getServerAuthSession } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { normalizeTraderLevels } from "@/lib/tasks/logic";
import { getWeapons } from "@/lib/tarkov/service";

export default async function NewBuildPage({ searchParams }: { searchParams: Promise<{ weaponId?: string }> }) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/builds/new");
  }

  const [params, weapons, settings] = await Promise.all([
    searchParams,
    getWeapons(),
    db.userSettings.findUnique({ where: { userId: session.user.id } }),
  ]);

  const traderLevels = normalizeTraderLevels(settings?.traderLevels);
  const playerLevel = settings?.level ?? 15;

  const mappedWeapons = weapons
    .map((weapon) => {
      if (!weapon.properties || weapon.properties.__typename !== "ItemPropertiesWeapon") {
        return null;
      }

      return {
        id: weapon.id,
        name: weapon.name,
        shortName: weapon.shortName,
        iconLink: weapon.iconLink,
        basePrice: weapon.avg24hPrice,
        recoilVertical: weapon.properties.recoilVertical,
        recoilHorizontal: weapon.properties.recoilHorizontal,
        ergonomics: weapon.properties.ergonomics,
      };
    })
    .filter((weapon): weapon is NonNullable<typeof weapon> => Boolean(weapon));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Weapon Builder</h1>
        <p className="text-sm text-[var(--muted)]">
          Constraint-aware planner with deterministic part selection and optional AI intent interpretation.
        </p>
      </div>

      <BuildBuilder
        weapons={mappedWeapons}
        initialWeaponId={params.weaponId}
        initialConstraints={{
          budgetRub: 300000,
          playerLevel,
          traderLevels,
          fleaEnabled: settings?.fleaUnlocked ?? playerLevel >= 15,
          priority: "BALANCED",
          patch: "current",
        }}
        canUseAI={Boolean(env.OPENAI_API_KEY)}
      />
    </div>
  );
}
