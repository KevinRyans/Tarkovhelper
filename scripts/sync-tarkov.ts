import { db } from "../lib/db";
import { seedIconAssetMappings } from "../lib/assets/icon-map";
import { fetchPaginatedCollection } from "../lib/tarkov/client";
import { TASKS_PAGE_QUERY } from "../lib/tarkov/queries";
import type { TarkovTask } from "../lib/tarkov/types";

const ITEM_CATALOG_PAGE_QUERY = `
  query ItemCatalogPage($limit: Int!, $offset: Int!) {
    items(limit: $limit, offset: $offset) {
      id
      name
      normalizedName
      shortName
      types
      iconLink
      avg24hPrice
      lastLowPrice
      weight
      buyFor {
        priceRUB
        vendor {
          name
        }
      }
      properties {
        __typename
      }
    }
  }
`;

type CatalogItem = {
  id: string;
  name: string;
  normalizedName: string;
  shortName?: string;
  types: string[];
  iconLink?: string | null;
  avg24hPrice?: number | null;
  lastLowPrice?: number | null;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function syncTasks() {
  console.log("Syncing tasks...");
  const tasks = await fetchPaginatedCollection<TarkovTask>({
    query: TASKS_PAGE_QUERY,
    key: "tasks",
    pageSize: 128,
  });

  for (const batch of chunk(tasks, 80)) {
    await db.$transaction(
      batch.map((task) =>
        db.taskCatalog.upsert({
          where: { id: task.id },
          create: {
            id: task.id,
            name: task.name,
            normalizedName: task.normalizedName,
            traderName: task.trader.name,
            mapName: task.map?.name,
            minPlayerLevel: task.minPlayerLevel,
            kappaRequired: task.kappaRequired,
            lightkeeperRequired: task.lightkeeperRequired,
            taskData: task,
          },
          update: {
            name: task.name,
            normalizedName: task.normalizedName,
            traderName: task.trader.name,
            mapName: task.map?.name,
            minPlayerLevel: task.minPlayerLevel,
            kappaRequired: task.kappaRequired,
            lightkeeperRequired: task.lightkeeperRequired,
            taskData: task,
            syncedAt: new Date(),
          },
        }),
      ),
    );
  }

  console.log(`Task sync complete: ${tasks.length}`);
}

async function syncItems() {
  console.log("Syncing items...");
  const items = await fetchPaginatedCollection<CatalogItem>({
    query: ITEM_CATALOG_PAGE_QUERY,
    key: "items",
    pageSize: 128,
  });

  for (const batch of chunk(items, 120)) {
    await db.$transaction(
      batch.map((item) =>
        db.itemCatalog.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            name: item.name,
            normalizedName: item.normalizedName,
            shortName: item.shortName,
            typeTags: item.types,
            iconLink: item.iconLink,
            avg24hPrice: item.avg24hPrice,
            lastLowPrice: item.lastLowPrice,
            itemData: item,
          },
          update: {
            name: item.name,
            normalizedName: item.normalizedName,
            shortName: item.shortName,
            typeTags: item.types,
            iconLink: item.iconLink,
            avg24hPrice: item.avg24hPrice,
            lastLowPrice: item.lastLowPrice,
            itemData: item,
            syncedAt: new Date(),
          },
        }),
      ),
    );
  }

  await seedIconAssetMappings(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      normalizedName: item.normalizedName,
      iconLink: item.iconLink,
    })),
  );

  console.log(`Item sync complete: ${items.length}`);
}

async function main() {
  const start = Date.now();
  await syncTasks();
  await syncItems();

  await db.syncState.upsert({
    where: { key: "tarkov-sync" },
    create: {
      key: "tarkov-sync",
      lastRunAt: new Date(),
      meta: { durationMs: Date.now() - start },
    },
    update: {
      lastRunAt: new Date(),
      meta: { durationMs: Date.now() - start },
    },
  });

  console.log(`Sync finished in ${Date.now() - start}ms`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
