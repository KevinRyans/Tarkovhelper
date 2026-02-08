import { unstable_cache } from "next/cache";

import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { fetchPaginatedCollection, tarkovRequest } from "@/lib/tarkov/client";
import {
  FLEA_ITEMS_QUERY,
  TASKS_PAGE_QUERY,
  TRADERS_PAGE_QUERY,
  WEAPON_DETAIL_QUERY,
  WEAPONS_PAGE_QUERY,
} from "@/lib/tarkov/queries";
import type { FleaItem, TarkovTask, TarkovWeapon, TraderCatalog, TraderOffer } from "@/lib/tarkov/types";

type WeaponDetailResponse = {
  item: TarkovWeapon | null;
};

type FleaItemsResponse = {
  items: FleaItem[];
};

type FleaSearchCacheEntry = {
  data: FleaItem[] | null;
  expiresAt: number;
  pending: Promise<FleaItem[]> | null;
};

async function fetchTasksUncached() {
  try {
    const catalogRows = await db.taskCatalog.findMany({
      select: {
        taskData: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (catalogRows.length > 0) {
      return catalogRows.map((row) => row.taskData as unknown as TarkovTask);
    }
  } catch (error) {
    console.warn("Task catalog fallback to live API", error);
  }

  return fetchPaginatedCollection<TarkovTask>({
    query: TASKS_PAGE_QUERY,
    key: "tasks",
    pageSize: 128,
  });
}

type TaskCacheState = {
  data: TarkovTask[] | null;
  expiresAt: number;
  pending: Promise<TarkovTask[]> | null;
};

const globalForTaskCache = globalThis as unknown as {
  taskCacheState?: TaskCacheState;
};

const taskCacheState =
  globalForTaskCache.taskCacheState ??
  ({
    data: null,
    expiresAt: 0,
    pending: null,
  } satisfies TaskCacheState);

if (!globalForTaskCache.taskCacheState) {
  globalForTaskCache.taskCacheState = taskCacheState;
}

export async function getAllTasks() {
  const now = Date.now();
  if (taskCacheState.data && taskCacheState.expiresAt > now) {
    return taskCacheState.data;
  }

  if (taskCacheState.pending) {
    return taskCacheState.pending;
  }

  taskCacheState.pending = fetchTasksUncached()
    .then((tasks) => {
      taskCacheState.data = tasks;
      taskCacheState.expiresAt = Date.now() + env.TARKOV_CACHE_REVALIDATE_SECONDS * 1000;
      return tasks;
    })
    .finally(() => {
      taskCacheState.pending = null;
    });

  return taskCacheState.pending;
}

export async function getTaskById(taskId: string) {
  const tasks = await getAllTasks();
  return tasks.find((task) => task.id === taskId) ?? null;
}

export async function getKappaTasks() {
  const tasks = await getAllTasks();
  return tasks.filter((task) => task.kappaRequired);
}

async function fetchWeaponsUncached() {
  const items = await fetchPaginatedCollection<TarkovWeapon>({
    query: WEAPONS_PAGE_QUERY,
    key: "items",
    pageSize: 64,
  });

  return items.filter((weapon) => weapon.properties?.__typename === "ItemPropertiesWeapon");
}

export const getWeapons = unstable_cache(fetchWeaponsUncached, ["weapons:all:v1"], {
  revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
  tags: ["items", "weapons"],
});

export async function getWeaponDetail(weaponId: string) {
  const data = await tarkovRequest<WeaponDetailResponse>(WEAPON_DETAIL_QUERY, { id: weaponId });
  if (!data.item || data.item.properties?.__typename !== "ItemPropertiesWeapon") {
    return null;
  }
  return data.item;
}

async function fetchTradersUncached() {
  return fetchPaginatedCollection<TraderCatalog>({
    query: TRADERS_PAGE_QUERY,
    key: "traders",
    pageSize: 10,
  });
}

export const getTraders = unstable_cache(fetchTradersUncached, ["traders:all:v1"], {
  revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
  tags: ["traders"],
});

export type TraderOfferMapEntry = TraderOffer & {
  traderName: string;
};

async function fetchOfferMapUncached() {
  const traders = await getTraders();
  const map = new Map<string, TraderOfferMapEntry[]>();

  for (const trader of traders) {
    for (const level of trader.levels) {
      for (const offer of level.cashOffers ?? []) {
        const row: TraderOfferMapEntry = {
          ...offer,
          traderName: trader.name,
        };

        const list = map.get(offer.item.id) ?? [];
        list.push(row);
        map.set(offer.item.id, list);
      }
    }
  }

  return Array.from(map.entries()).reduce<Record<string, TraderOfferMapEntry[]>>((acc, [itemId, offers]) => {
    acc[itemId] = offers;
    return acc;
  }, {});
}

export const getTraderOfferMap = unstable_cache(fetchOfferMapUncached, ["traders:offers:v1"], {
  revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
  tags: ["traders", "offers"],
});

const globalForFleaCache = globalThis as unknown as {
  fleaSearchCache?: Map<string, FleaSearchCacheEntry>;
  fleaPreloadCache?: {
    data: FleaItem[] | null;
    expiresAt: number;
    pending: Promise<FleaItem[]> | null;
  };
};

const fleaSearchCache = globalForFleaCache.fleaSearchCache ?? new Map<string, FleaSearchCacheEntry>();
if (!globalForFleaCache.fleaSearchCache) {
  globalForFleaCache.fleaSearchCache = fleaSearchCache;
}

const fleaPreloadCache =
  globalForFleaCache.fleaPreloadCache ??
  ({
    data: null,
    expiresAt: 0,
    pending: null,
  } satisfies {
    data: FleaItem[] | null;
    expiresAt: number;
    pending: Promise<FleaItem[]> | null;
  });

if (!globalForFleaCache.fleaPreloadCache) {
  globalForFleaCache.fleaPreloadCache = fleaPreloadCache;
}

function fleaCacheTtlMs() {
  return Math.min(env.TARKOV_CACHE_REVALIDATE_SECONDS, 600) * 1000;
}

function toFleaItemFromCatalog(row: {
  id: string;
  name: string;
  shortName: string | null;
  iconLink: string | null;
  typeTags: string[];
  avg24hPrice: number | null;
  lastLowPrice: number | null;
}): FleaItem {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName ?? undefined,
    iconLink: row.iconLink,
    types: row.typeTags,
    avg24hPrice: row.avg24hPrice,
    lastLowPrice: row.lastLowPrice,
    low24hPrice: row.lastLowPrice,
    high24hPrice: row.avg24hPrice,
    changeLast48h: null,
    changeLast48hPercent: null,
    historicalPrices: [],
  };
}

export async function searchFleaItems(name: string, limit = 30) {
  const query = name.trim();
  if (!query) {
    return [];
  }

  const cacheKey = `${query.toLowerCase()}::${limit}`;
  const now = Date.now();
  const cached = fleaSearchCache.get(cacheKey);

  if (cached?.data && cached.expiresAt > now) {
    return cached.data;
  }

  if (cached?.pending) {
    return cached.pending;
  }

  const entry: FleaSearchCacheEntry =
    cached ?? {
      data: null,
      expiresAt: 0,
      pending: null,
    };

  entry.pending = tarkovRequest<FleaItemsResponse>(FLEA_ITEMS_QUERY, {
    name: query,
    limit,
    offset: 0,
  })
    .then((data) => {
      entry.data = data.items ?? [];
      entry.expiresAt = Date.now() + fleaCacheTtlMs();
      return entry.data;
    })
    .finally(() => {
      entry.pending = null;
    });

  fleaSearchCache.set(cacheKey, entry);

  return entry.pending;
}

async function fetchFleaPreloadUncached(limit = 80) {
  try {
    const rows = await db.itemCatalog.findMany({
      where: {
        OR: [{ avg24hPrice: { not: null } }, { lastLowPrice: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        iconLink: true,
        typeTags: true,
        avg24hPrice: true,
        lastLowPrice: true,
      },
      orderBy: [{ avg24hPrice: "desc" }, { lastLowPrice: "desc" }],
      take: limit,
    });

    return rows.map(toFleaItemFromCatalog);
  } catch (error) {
    console.warn("Flea preload fallback to live API", error);
    return searchFleaItems("ammo", Math.min(limit, 40));
  }
}

export async function getFleaPreloadItems(limit = 80) {
  const now = Date.now();

  if (fleaPreloadCache.data && fleaPreloadCache.expiresAt > now) {
    return fleaPreloadCache.data.slice(0, limit);
  }

  if (fleaPreloadCache.pending) {
    const data = await fleaPreloadCache.pending;
    return data.slice(0, limit);
  }

  fleaPreloadCache.pending = fetchFleaPreloadUncached(Math.max(limit, 80))
    .then((items) => {
      fleaPreloadCache.data = items;
      fleaPreloadCache.expiresAt = Date.now() + fleaCacheTtlMs();
      return items;
    })
    .finally(() => {
      fleaPreloadCache.pending = null;
    });

  const data = await fleaPreloadCache.pending;
  return data.slice(0, limit);
}

export async function getFleaCatalogLastUpdated() {
  try {
    const state = await db.syncState.findUnique({
      where: { key: "tarkov-sync" },
      select: { lastRunAt: true },
    });
    return state?.lastRunAt ?? null;
  } catch {
    return null;
  }
}

export async function getFleaDefaultSnapshot(limit = 80) {
  const [items, syncedAt] = await Promise.all([getFleaPreloadItems(limit), getFleaCatalogLastUpdated()]);

  return {
    items,
    lastUpdated: syncedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function getTaskMapAndTraderFacets() {
  const tasks = await getAllTasks();
  const traders = new Set<string>();
  const maps = new Set<string>();

  for (const task of tasks) {
    if (task.trader?.name) {
      traders.add(task.trader.name);
    }
    if (task.map?.name) {
      maps.add(task.map.name);
    }
  }

  return {
    traders: Array.from(traders).sort((a, b) => a.localeCompare(b)),
    maps: Array.from(maps).sort((a, b) => a.localeCompare(b)),
  };
}

export async function getSearchIndex() {
  const [tasks, weapons] = await Promise.all([getAllTasks(), getWeapons()]);

  return {
    tasks: tasks.slice(0, 2000).map((task) => ({
      id: task.id,
      name: task.name,
      trader: task.trader?.name,
      map: task.map?.name,
      href: `/tasks/${task.id}`,
      type: "task" as const,
    })),
    items: weapons.slice(0, 300).map((item) => ({
      id: item.id,
      name: item.name,
      href: `/builds/new?weaponId=${item.id}`,
      type: "item" as const,
    })),
  };
}
