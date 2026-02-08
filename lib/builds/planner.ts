import type { TaskProgressStatus } from "@prisma/client";

import { getTraderOfferMap, getWeaponDetail, getWeapons } from "@/lib/tarkov/service";
import type { TarkovWeapon, TarkovWeaponMod } from "@/lib/tarkov/types";

export type BuildPriority = "LOW_RECOIL" | "HIGH_ERGO" | "BALANCED" | "BEST_VALUE";

export type BuildConstraints = {
  budgetRub: number;
  playerLevel: number;
  traderLevels: Record<string, number>;
  fleaEnabled: boolean;
  priority: BuildPriority;
  patch: string;
};

export type PlannedPart = {
  slotId: string;
  slotName: string;
  itemId: string;
  itemName: string;
  iconLink?: string | null;
  priceRub: number;
  source: "TRADER" | "FLEA" | "UNKNOWN";
  traderName?: string;
  recoilModifier: number;
  ergonomics: number;
};

export type PlannedBuild = {
  weapon: {
    id: string;
    name: string;
    iconLink?: string | null;
  };
  constraints: BuildConstraints;
  parts: PlannedPart[];
  totalCost: number;
  baseCost: number;
  finalStats: {
    recoil: number;
    recoilVertical: number;
    recoilHorizontal: number;
    ergo: number;
    weight: number;
  };
  unavailableSlots: Array<{ slotId: string; slotName: string }>;
  notes: string[];
};

function normalizeRecoilModifier(raw: number | null | undefined) {
  if (raw == null) {
    return 0;
  }

  if (Math.abs(raw) > 2) {
    return raw / 100;
  }

  return raw;
}

type PriceCandidate = {
  priceRub: number;
  source: "TRADER" | "FLEA" | "UNKNOWN";
  traderName?: string;
};

function pickBestPrice(params: {
  mod: TarkovWeaponMod;
  offerMap: Record<string, Array<{ traderName: string; minTraderLevel: number; priceRUB: number; taskUnlock: { id: string; name: string } | null }>>;
  constraints: BuildConstraints;
  completedTaskIds: Set<string>;
}) {
  const traderOffers = params.offerMap[params.mod.id] ?? [];

  const traderCandidate = traderOffers
    .filter((offer) => {
      const currentLL = params.constraints.traderLevels[offer.traderName] ?? 0;
      const llOk = currentLL >= offer.minTraderLevel;
      const unlockOk = !offer.taskUnlock || params.completedTaskIds.has(offer.taskUnlock.id);
      return llOk && unlockOk && offer.priceRUB > 0;
    })
    .sort((a, b) => a.priceRUB - b.priceRUB)[0];

  const fleaPrice = params.mod.lastLowPrice ?? params.mod.avg24hPrice ?? null;

  const candidates: PriceCandidate[] = [];

  if (traderCandidate) {
    candidates.push({
      priceRub: traderCandidate.priceRUB,
      source: "TRADER",
      traderName: traderCandidate.traderName,
    });
  }

  if (params.constraints.fleaEnabled && fleaPrice && fleaPrice > 0) {
    candidates.push({
      priceRub: fleaPrice,
      source: "FLEA",
    });
  }

  if (!candidates.length) {
    const fallback = fleaPrice ?? 0;
    return {
      priceRub: fallback,
      source: fallback > 0 ? (params.constraints.fleaEnabled ? "FLEA" : "UNKNOWN") : "UNKNOWN",
    } satisfies PriceCandidate;
  }

  return candidates.sort((a, b) => a.priceRub - b.priceRub)[0];
}

function scoreCandidate(params: {
  recoilModifier: number;
  ergonomics: number;
  priceRub: number;
  priority: BuildPriority;
}) {
  const recoilGain = -params.recoilModifier * 100;
  const ergoGain = params.ergonomics;
  const costPenalty = params.priceRub / 12000;

  switch (params.priority) {
    case "LOW_RECOIL":
      return recoilGain * 3 + ergoGain * 0.4 - costPenalty;
    case "HIGH_ERGO":
      return ergoGain * 2.6 + recoilGain * 0.8 - costPenalty;
    case "BEST_VALUE":
      return recoilGain * 1.5 + ergoGain * 1.1 - costPenalty * 1.4;
    case "BALANCED":
    default:
      return recoilGain * 2 + ergoGain * 1.3 - costPenalty;
  }
}

function pickWeaponCost(weapon: TarkovWeapon, constraints: BuildConstraints) {
  const traderPrice = weapon.buyFor
    ?.filter((offer) => offer.vendor.name !== "Flea Market" && offer.priceRUB > 0)
    .map((offer) => offer.priceRUB)
    .sort((a, b) => a - b)[0];

  const fleaPrice = weapon.lastLowPrice ?? weapon.avg24hPrice ?? null;

  const candidates: number[] = [];

  if (traderPrice) {
    candidates.push(traderPrice);
  }

  if (constraints.fleaEnabled && fleaPrice) {
    candidates.push(fleaPrice);
  }

  return candidates.length ? Math.min(...candidates) : fleaPrice ?? traderPrice ?? 0;
}

function ensureWeaponProperties(weapon: TarkovWeapon) {
  if (!weapon.properties || weapon.properties.__typename !== "ItemPropertiesWeapon") {
    throw new Error("Selected weapon does not expose weapon properties");
  }

  return weapon.properties;
}

export async function planWeaponBuild(params: {
  weaponId: string;
  constraints: BuildConstraints;
  progressByTaskId?: Record<string, TaskProgressStatus>;
}) {
  const [weapon, offerMap] = await Promise.all([getWeaponDetail(params.weaponId), getTraderOfferMap()]);

  if (!weapon) {
    throw new Error("Weapon not found");
  }

  const properties = ensureWeaponProperties(weapon);
  const completedTaskIds = new Set(
    Object.entries(params.progressByTaskId ?? {})
      .filter(([, status]) => status === "DONE")
      .map(([taskId]) => taskId),
  );

  const baseCost = pickWeaponCost(weapon, params.constraints);
  let runningCost = baseCost;

  const parts: PlannedPart[] = [];
  const unavailableSlots: Array<{ slotId: string; slotName: string }> = [];

  let recoilMultiplier = 1;
  let ergoDelta = 0;
  let weight = weapon.weight ?? 0;

  for (const slot of properties.slots ?? []) {
    const candidates = (slot.filters?.allowedItems ?? [])
      .map((mod) => {
        const price = pickBestPrice({
          mod,
          offerMap,
          constraints: params.constraints,
          completedTaskIds,
        });

        const modProps = mod.properties;
        const recoilModifier = normalizeRecoilModifier(modProps?.recoilModifier);
        const ergonomics = modProps?.ergonomics ?? 0;

        const score = scoreCandidate({
          recoilModifier,
          ergonomics,
          priceRub: price.priceRub || 1,
          priority: params.constraints.priority,
        });

        return {
          mod,
          score,
          price,
          recoilModifier,
          ergonomics,
        };
      })
      .filter((candidate) => candidate.price.priceRub > 0 || !slot.required)
      .sort((a, b) => b.score - a.score);

    const picked = candidates.find((candidate) => {
      if (params.constraints.budgetRub <= 0) {
        return true;
      }

      return runningCost + candidate.price.priceRub <= params.constraints.budgetRub;
    });

    if (!picked) {
      if (slot.required) {
        unavailableSlots.push({ slotId: slot.id, slotName: slot.name });
      }
      continue;
    }

    runningCost += picked.price.priceRub;
    recoilMultiplier *= 1 + picked.recoilModifier;
    ergoDelta += picked.ergonomics;
    weight += picked.mod.weight ?? 0;

    parts.push({
      slotId: slot.id,
      slotName: slot.name,
      itemId: picked.mod.id,
      itemName: picked.mod.name,
      iconLink: picked.mod.iconLink,
      priceRub: picked.price.priceRub,
      source: picked.price.source,
      traderName: picked.price.traderName,
      recoilModifier: picked.recoilModifier,
      ergonomics: picked.ergonomics,
    });
  }

  const recoilVertical = Math.max(1, Math.round(properties.recoilVertical * recoilMultiplier));
  const recoilHorizontal = Math.max(1, Math.round(properties.recoilHorizontal * recoilMultiplier));
  const recoil = Math.round((recoilVertical + recoilHorizontal) / 2);

  return {
    weapon: {
      id: weapon.id,
      name: weapon.name,
      iconLink: weapon.iconLink,
    },
    constraints: params.constraints,
    parts,
    totalCost: runningCost,
    baseCost,
    finalStats: {
      recoil,
      recoilVertical,
      recoilHorizontal,
      ergo: Math.round((properties.ergonomics + ergoDelta) * 10) / 10,
      weight: Math.round(weight * 100) / 100,
    },
    unavailableSlots,
    notes: [
      `Estimated from tarkov.dev price feeds and trader offers`,
      `Patch profile: ${params.constraints.patch}`,
    ],
  } satisfies PlannedBuild;
}

export async function findWeaponByPrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const weapons = await getWeapons();

  return (
    weapons.find((weapon) => text.includes(weapon.name.toLowerCase())) ??
    weapons.find((weapon) => text.includes((weapon.shortName ?? "").toLowerCase())) ??
    null
  );
}

export function parsePromptToConstraints(prompt: string, base: BuildConstraints) {
  const normalized = prompt.toLowerCase();
  const updated: BuildConstraints = { ...base };

  if (normalized.includes("low recoil") || normalized.includes("lav recoil") || normalized.includes("meta recoil")) {
    updated.priority = "LOW_RECOIL";
  } else if (normalized.includes("ergo") || normalized.includes("snappy") || normalized.includes("ads")) {
    updated.priority = "HIGH_ERGO";
  } else if (normalized.includes("value") || normalized.includes("cheap") || normalized.includes("budget")) {
    updated.priority = "BEST_VALUE";
  }

  const budgetMatch = normalized.match(/(\d[\d\s.,]{3,})\s*(rub|ruble|r)/i);
  if (budgetMatch) {
    const parsed = Number(budgetMatch[1].replace(/[\s.,]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      updated.budgetRub = parsed;
    }
  }

  if (normalized.includes("no flea") || normalized.includes("uten flea")) {
    updated.fleaEnabled = false;
  }

  if (normalized.includes("flea")) {
    updated.fleaEnabled = true;
  }

  return updated;
}
