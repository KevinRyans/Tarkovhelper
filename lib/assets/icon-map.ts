import { db } from "@/lib/db";
import { env } from "@/lib/config/env";

type IconSeedInput = {
  id: string;
  name?: string | null;
  normalizedName?: string | null;
  iconLink?: string | null;
};

type IconSource = "efticons" | "tarkov.dev" | "fallback" | "wiki";

function trimTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function wikiSlug(normalizedName?: string | null) {
  if (!normalizedName) {
    return "";
  }

  return normalizedName.replace(/\s+/g, "-").toLowerCase();
}

function getIconCandidates(item: IconSeedInput): Array<{ source: IconSource; url: string }> {
  const candidates: Array<{ source: IconSource; url: string }> = [];

  // GitHub API endpoints return JSON, not image bytes. Skip those and rely on tarkov.dev/fallback.
  if (env.EFT_ICONS_BASE_URL && !env.EFT_ICONS_BASE_URL.includes("api.github.com")) {
    candidates.push({
      source: "efticons",
      url: `${trimTrailingSlash(env.EFT_ICONS_BASE_URL)}/${item.id}.png`,
    });
  }

  if (item.iconLink) {
    candidates.push({
      source: "tarkov.dev",
      url: item.iconLink,
    });
  }

  candidates.push({
    source: "fallback",
    url: `https://assets.tarkov.dev/${item.id}-icon.webp`,
  });

  if (env.EFT_WIKI_ICON_BASE_URL && item.normalizedName) {
    candidates.push({
      source: "wiki",
      url: `${trimTrailingSlash(env.EFT_WIKI_ICON_BASE_URL)}/${wikiSlug(item.normalizedName)}.png`,
    });
  }

  return candidates;
}

export async function resolveItemIcon(item: IconSeedInput) {
  const existing = await db.itemAsset.findUnique({
    where: { itemId: item.id },
  });

  if (existing) {
    return existing.url;
  }

  const [selected] = getIconCandidates(item);

  if (!selected) {
    return "/placeholder-item.svg";
  }

  await db.itemAsset.upsert({
    where: { itemId: item.id },
    create: {
      itemId: item.id,
      source: selected.source,
      url: selected.url,
      license: selected.source === "efticons" ? env.EFT_ICONS_LICENSE : undefined,
    },
    update: {
      source: selected.source,
      url: selected.url,
      license: selected.source === "efticons" ? env.EFT_ICONS_LICENSE : undefined,
    },
  });

  return selected.url;
}

export async function seedIconAssetMappings(items: IconSeedInput[]) {
  if (!items.length) {
    return;
  }

  await db.$transaction(
    items.map((item) => {
      const [selected] = getIconCandidates(item);
      if (!selected) {
        return db.itemAsset.upsert({
          where: { itemId: item.id },
          create: {
            itemId: item.id,
            source: "fallback",
            url: "/placeholder-item.svg",
          },
          update: {
            source: "fallback",
            url: "/placeholder-item.svg",
          },
        });
      }

      return db.itemAsset.upsert({
        where: { itemId: item.id },
        create: {
          itemId: item.id,
          source: selected.source,
          url: selected.url,
          license: selected.source === "efticons" ? env.EFT_ICONS_LICENSE : undefined,
        },
        update: {
          source: selected.source,
          url: selected.url,
          license: selected.source === "efticons" ? env.EFT_ICONS_LICENSE : undefined,
        },
      });
    }),
  );
}
