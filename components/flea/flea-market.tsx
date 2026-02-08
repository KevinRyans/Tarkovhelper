"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type FleaItem = {
  id: string;
  name: string;
  shortName?: string;
  iconLink?: string | null;
  types?: string[];
  avg24hPrice: number | null;
  lastLowPrice: number | null;
  low24hPrice: number | null;
  high24hPrice: number | null;
  changeLast48h: number | null;
  changeLast48hPercent: number | null;
  historicalPrices: Array<{ price: number; timestamp: string }>;
};

type ApiPayload = {
  items: FleaItem[];
  lastUpdated?: string;
  preloaded?: boolean;
};

type SortMode = "relevance" | "avg_desc" | "avg_asc" | "low_desc" | "low_asc" | "deal" | "change_up" | "change_down";
type TrendMode = "all" | "rising" | "falling" | "stable";
type PriceBand = "all" | "under_50k" | "50k_200k" | "200k_1m" | "over_1m";

function useDebounced(value: string, delay = 220) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function numericPrice(item: FleaItem) {
  return item.lastLowPrice ?? item.avg24hPrice ?? 0;
}

function dealRatio(item: FleaItem) {
  if (!item.low24hPrice || !item.avg24hPrice || item.avg24hPrice <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return item.low24hPrice / item.avg24hPrice;
}

function trendBucket(item: FleaItem): TrendMode {
  const value = item.changeLast48hPercent ?? 0;
  if (value > 2) {
    return "rising";
  }
  if (value < -2) {
    return "falling";
  }
  return "stable";
}

function matchesPriceBand(item: FleaItem, band: PriceBand) {
  if (band === "all") {
    return true;
  }

  const price = numericPrice(item);
  if (band === "under_50k") return price < 50_000;
  if (band === "50k_200k") return price >= 50_000 && price < 200_000;
  if (band === "200k_1m") return price >= 200_000 && price < 1_000_000;
  return price >= 1_000_000;
}

function relevanceScore(item: FleaItem, query: string) {
  if (!query) {
    return 0;
  }

  const name = item.name.toLowerCase();
  const short = (item.shortName ?? "").toLowerCase();
  const q = query.toLowerCase();

  if (name === q || short === q) {
    return 1000;
  }

  if (name.startsWith(q) || short.startsWith(q)) {
    return 700;
  }

  if (name.includes(q) || short.includes(q)) {
    return 400;
  }

  return 0;
}

export function FleaMarket(props: {
  initialItems: FleaItem[];
  initialLastUpdated: string | null;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FleaItem[]>(props.initialItems);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(props.initialLastUpdated);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [trendMode, setTrendMode] = useState<TrendMode>("all");
  const [priceBand, setPriceBand] = useState<PriceBand>("all");

  const debounced = useDebounced(query);
  const minimumCharsReached = debounced.trim().length >= 2;

  useEffect(() => {
    const currentQuery = debounced.trim();

    if (!currentQuery) {
      setItems(props.initialItems);
      setLastUpdated(props.initialLastUpdated);
      setLoading(false);
      return;
    }

    if (!minimumCharsReached) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/flea?q=${encodeURIComponent(currentQuery)}&limit=70`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: ApiPayload) => {
        setItems(payload.items ?? []);
        setLastUpdated(payload.lastUpdated ?? null);
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }
        setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [debounced, minimumCharsReached, props.initialItems, props.initialLastUpdated]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const type of item.types ?? []) {
        if (type) {
          set.add(type);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    let result = items.filter((item) => {
      if (q) {
        const haystack = `${item.name} ${item.shortName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (typeFilter !== "all" && !(item.types ?? []).includes(typeFilter)) {
        return false;
      }

      if (trendMode !== "all" && trendBucket(item) !== trendMode) {
        return false;
      }

      if (!matchesPriceBand(item, priceBand)) {
        return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sortMode) {
        case "avg_desc":
          return (b.avg24hPrice ?? 0) - (a.avg24hPrice ?? 0);
        case "avg_asc":
          return (a.avg24hPrice ?? Number.MAX_SAFE_INTEGER) - (b.avg24hPrice ?? Number.MAX_SAFE_INTEGER);
        case "low_desc":
          return (b.lastLowPrice ?? 0) - (a.lastLowPrice ?? 0);
        case "low_asc":
          return (a.lastLowPrice ?? Number.MAX_SAFE_INTEGER) - (b.lastLowPrice ?? Number.MAX_SAFE_INTEGER);
        case "deal":
          return dealRatio(a) - dealRatio(b);
        case "change_up":
          return (b.changeLast48hPercent ?? -9999) - (a.changeLast48hPercent ?? -9999);
        case "change_down":
          return (a.changeLast48hPercent ?? 9999) - (b.changeLast48hPercent ?? 9999);
        case "relevance":
        default: {
          if (q) {
            const scoreDelta = relevanceScore(b, q) - relevanceScore(a, q);
            if (scoreDelta !== 0) {
              return scoreDelta;
            }
          }
          return (b.avg24hPrice ?? 0) - (a.avg24hPrice ?? 0);
        }
      }
    });

    return result;
  }, [debounced, items, priceBand, sortMode, trendMode, typeFilter]);

  const bestDeals = useMemo(() => {
    return [...filteredItems]
      .filter((item) => item.low24hPrice && item.avg24hPrice)
      .sort((a, b) => dealRatio(a) - dealRatio(b))
      .slice(0, 5);
  }, [filteredItems]);

  const renderItems = filteredItems.slice(0, 120);

  async function addToWatchlist(itemId: string) {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Flea Market</CardTitle>
          <CardDescription>Preloaded baseline + faster query cache + dropdown filtering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item name (min 2 chars)" />

          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <Select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort items">
              <option value="relevance">Sort: Relevance</option>
              <option value="avg_desc">Sort: Avg price (high-low)</option>
              <option value="avg_asc">Sort: Avg price (low-high)</option>
              <option value="low_desc">Sort: Last low (high-low)</option>
              <option value="low_asc">Sort: Last low (low-high)</option>
              <option value="deal">Sort: Best deal ratio</option>
              <option value="change_up">Sort: Trend up</option>
              <option value="change_down">Sort: Trend down</option>
            </Select>

            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by item type">
              <option value="all">Type: All</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>

            <Select value={trendMode} onChange={(event) => setTrendMode(event.target.value as TrendMode)} aria-label="Filter by trend">
              <option value="all">Trend: All</option>
              <option value="falling">Trend: Falling</option>
              <option value="stable">Trend: Stable</option>
              <option value="rising">Trend: Rising</option>
            </Select>

            <Select value={priceBand} onChange={(event) => setPriceBand(event.target.value as PriceBand)} aria-label="Filter by price band">
              <option value="all">Price: All</option>
              <option value="under_50k">Under 50k</option>
              <option value="50k_200k">50k - 200k</option>
              <option value="200k_1m">200k - 1m</option>
              <option value="over_1m">Over 1m</option>
            </Select>
          </div>

          <p className="text-xs text-[var(--muted)]">
            {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleString()}` : "No cache timestamp yet"} | Showing {renderItems.length}
            {filteredItems.length > renderItems.length ? ` of ${filteredItems.length}` : ""}
          </p>

          {debounced.trim() && !minimumCharsReached ? (
            <p className="text-xs text-[var(--muted)]">Type at least 2 characters for live flea search.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deal finder</CardTitle>
          <CardDescription>Lowest low/avg ratio from the current filtered set.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bestDeals.map((item) => (
            <p key={item.id}>
              {item.name}: {item.low24hPrice?.toLocaleString("en-US") ?? "-"} / {item.avg24hPrice?.toLocaleString("en-US") ?? "-"} RUB
            </p>
          ))}
          {bestDeals.length === 0 ? <p className="text-[var(--muted)]">No matching deals for current filter.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading ? <p className="text-sm text-[var(--muted)]">Loading...</p> : null}

        {!loading && renderItems.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-[var(--muted)]">No items found for current search/filter.</CardContent>
          </Card>
        ) : null}

        {renderItems.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Image src={`/api/icons/${item.id}`} alt={item.name} width={44} height={44} unoptimized className="h-11 w-11 rounded object-cover" />
                <div>
                  <p className="font-medium">{item.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="neutral">Avg {item.avg24hPrice?.toLocaleString("en-US") ?? "-"}</Badge>
                    <Badge variant="neutral">Low {item.lastLowPrice?.toLocaleString("en-US") ?? "-"}</Badge>
                    <Badge variant={item.changeLast48hPercent && item.changeLast48hPercent < 0 ? "success" : "warning"}>
                      {item.changeLast48hPercent?.toFixed(1) ?? "0"}% / 48h
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => addToWatchlist(item.id)}>
                  Add watchlist
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
