"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type SearchResult = {
  id: string;
  name: string;
  href: string;
  type: "task" | "item";
  subtitle?: string;
};

function useDebouncedValue<T>(value: T, delay = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

export function GlobalCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const debounced = useDebouncedValue(query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!debounced.trim()) {
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((res) => res.json())
      .then((data: { results: SearchResult[] }) => {
        if (!active) {
          return;
        }
        setResults(data.results ?? []);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setResults([]);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debounced, open]);

  const visibleResults = debounced.trim() ? results : [];

  const emptyText = useMemo(() => {
    if (!query) return "Start typing to search tasks, traders, maps and weapons";
    if (loading) return "Searching...";
    return "No matches";
  }, [loading, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 min-w-[260px] items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--muted)] lg:flex"
        aria-label="Open global search"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4" />
          Search quests, items, traders...
        </span>
        <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs">Ctrl+K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-16" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] p-3">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type quest, objective, map or weapon..."
                autoFocus
                aria-label="Global search"
              />
            </div>

            <div className="max-h-[60vh] overflow-auto p-2">
              {visibleResults.length === 0 ? (
                <p className="p-3 text-sm text-[var(--muted)]">{emptyText}</p>
              ) : (
                <ul className="space-y-1">
                  {visibleResults.map((result) => (
                    <li key={`${result.type}-${result.id}`}>
                      <Link
                        href={result.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "block rounded-md px-3 py-2 transition-colors",
                          "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                        )}
                      >
                        <p className="text-sm font-medium text-[var(--text)]">{result.name}</p>
                        <p className="text-xs text-[var(--muted)]">{result.type.toUpperCase()} {result.subtitle ? `• ${result.subtitle}` : ""}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
