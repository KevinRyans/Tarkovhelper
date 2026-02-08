import { env } from "@/lib/config/env";

type GraphQLError = {
  message: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

let tokens = env.TARKOV_DEV_REQUESTS_PER_SECOND;
let lastRefillMs = Date.now();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireToken() {
  while (true) {
    const now = Date.now();
    if (now - lastRefillMs >= 1000) {
      tokens = env.TARKOV_DEV_REQUESTS_PER_SECOND;
      lastRefillMs = now;
    }

    if (tokens > 0) {
      tokens -= 1;
      return;
    }

    await sleep(80);
  }
}

export async function tarkovRequest<TData>(
  query: string,
  variables?: Record<string, unknown>,
  maxAttempts = 3,
): Promise<TData> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      await acquireToken();

      const response = await fetch(env.TARKOV_DEV_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        next: {
          revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
        },
      });

      if (!response.ok) {
        throw new Error(`tarkov.dev responded with ${response.status}`);
      }

      const payload = (await response.json()) as GraphQLResponse<TData>;

      if (payload.errors?.length) {
        throw new Error(payload.errors.map((error) => error.message).join("; "));
      }

      if (!payload.data) {
        throw new Error("Missing data in GraphQL response");
      }

      return payload.data;
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }

      await sleep(attempt * 300);
    }
  }

  throw new Error("Unreachable");
}

export async function fetchPaginatedCollection<TItem>(params: {
  query: string;
  key: string;
  pageSize?: number;
  variables?: Record<string, unknown>;
}) {
  const pageSize = params.pageSize ?? 100;
  let offset = 0;
  const items: TItem[] = [];

  while (true) {
    const data = await tarkovRequest<Record<string, TItem[]>>(params.query, {
      ...params.variables,
      limit: pageSize,
      offset,
    });

    const page = data[params.key] ?? [];
    items.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return items;
}
