"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

type TaskRow = {
  id: string;
  name: string;
  trader: string;
  map: string;
  minPlayerLevel: number;
  kappaRequired: boolean;
  status: TaskStatus;
  unlocked: boolean;
  blockedByTaskCount: number;
  blockedByTraderCount: number;
  needsItems: boolean;
  questType: string;
};

type Summary = {
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  percent: number;
};

function useDebouncedValue<T>(value: T, delay = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function statusBadge(status: TaskStatus) {
  if (status === "DONE") return <Badge variant="success">Done</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="neutral">Not started</Badge>;
}

function availabilityBadge(task: TaskRow) {
  if (task.status === "DONE") {
    return <Badge variant="success">Completed</Badge>;
  }

  if (task.unlocked) {
    return <Badge variant="accent">Unlocked</Badge>;
  }

  const blockCount = task.blockedByTaskCount + task.blockedByTraderCount;
  return <Badge variant="danger">Blocked ({blockCount})</Badge>;
}

export function TasksExplorer(props: {
  initialRows: TaskRow[];
  traders: string[];
  maps: string[];
  upcoming: Array<{ id: string; name: string; trader: string }>;
  shortestNext: Array<{ id: string; name: string; unlocks: number }>;
  kappaPath: Array<{ id: string; name: string }>;
  summary: Summary;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(props.initialRows);
  const [query, setQuery] = useState("");
  const [trader, setTrader] = useState("all");
  const [map, setMap] = useState("all");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [kappaOnly, setKappaOnly] = useState(false);
  const [needsItemsOnly, setNeedsItemsOnly] = useState(false);
  const debouncedQuery = useDebouncedValue(query);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();

    return rows.filter((task) => {
      if (q) {
        const haystack = `${task.name} ${task.trader} ${task.map} ${task.questType}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (trader !== "all" && task.trader !== trader) {
        return false;
      }

      if (map !== "all" && task.map !== map) {
        return false;
      }

      if (status !== "all" && task.status !== status) {
        return false;
      }

      if (availability === "unlocked" && !task.unlocked) {
        return false;
      }

      if (availability === "blocked" && task.unlocked) {
        return false;
      }

      if (kappaOnly && !task.kappaRequired) {
        return false;
      }

      if (needsItemsOnly && !task.needsItems) {
        return false;
      }

      return true;
    });
  }, [availability, debouncedQuery, kappaOnly, map, needsItemsOnly, rows, status, trader]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 12,
  });

  async function updateStatus(taskId: string, next: TaskStatus) {
    setRows((prev) => prev.map((row) => (row.id === taskId ? { ...row, status: next } : row)));

    const response = await fetch("/api/tasks/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, status: next }),
    });

    if (!response.ok) {
      setRows((prev) => prev.map((row) => (row.id === taskId ? { ...row, status: "NOT_STARTED" } : row)));
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total progress</CardDescription>
            <CardTitle>
              {props.summary.completed}/{props.summary.total} completed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={props.summary.percent} />
            <p className="text-sm text-[var(--muted)]">{props.summary.percent}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Upcoming tasks</CardDescription>
            <CardTitle>Next best actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {props.upcoming.slice(0, 5).map((task) => (
              <p key={task.id}>
                <Link href={`/tasks/${task.id}`} className="text-[var(--accent)] hover:underline">
                  {task.name}
                </Link>{" "}
                <span className="text-[var(--muted)]">({task.trader})</span>
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Plan</CardDescription>
            <CardTitle>Shortest next step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {props.shortestNext.slice(0, 5).map((task) => (
              <p key={task.id}>
                <Link href={`/tasks/${task.id}`} className="text-[var(--accent)] hover:underline">
                  {task.name}
                </Link>{" "}
                <span className="text-[var(--muted)]">(unlocks {task.unlocks})</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Fastest path to Kappa</CardTitle>
          <CardDescription>Prereq-aware order of Kappa-required tasks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {props.kappaPath.slice(0, 20).map((task, index) => (
            <Link key={task.id} href={`/tasks/${task.id}`} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs">
              {index + 1}. {task.name}
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="sticky top-[120px] z-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quests, maps, traders" />

          <Select value={trader} onChange={(event) => setTrader(event.target.value)}>
            <option value="all">All traders</option>
            {props.traders.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>

          <Select value={map} onChange={(event) => setMap(event.target.value)}>
            <option value="all">All maps</option>
            {props.maps.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All status</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </Select>

          <Select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="all">All availability</option>
            <option value="unlocked">Unlocked</option>
            <option value="blocked">Blocked</option>
          </Select>

          <div className="flex items-center gap-2">
            <Button variant={kappaOnly ? "default" : "secondary"} size="sm" onClick={() => setKappaOnly((v) => !v)}>
              Kappa only
            </Button>
            <Button
              variant={needsItemsOnly ? "default" : "secondary"}
              size="sm"
              onClick={() => setNeedsItemsOnly((v) => !v)}
            >
              Needs items
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compact task list</CardTitle>
          <CardDescription>{filtered.length} tasks shown</CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={parentRef} className="h-[68vh] overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const task = filtered[virtualRow.index];

                return (
                  <div
                    key={task.id}
                    className="absolute left-0 top-0 flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="min-w-0">
                      <Link href={`/tasks/${task.id}`} className="line-clamp-1 text-sm font-medium hover:text-[var(--accent)]">
                        {task.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="neutral">{task.trader}</Badge>
                        {task.map ? <Badge variant="neutral">{task.map}</Badge> : null}
                        {task.kappaRequired ? <Badge variant="accent">Kappa</Badge> : null}
                        {task.needsItems ? <Badge variant="warning">Needs items</Badge> : null}
                        {statusBadge(task.status)}
                        {availabilityBadge(task)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <p className="hidden text-xs text-[var(--muted)] lg:block">Lvl {task.minPlayerLevel || 1}</p>
                      {props.canEdit ? (
                        <Select value={task.status} onChange={(event) => updateStatus(task.id, event.target.value as TaskStatus)}>
                          <option value="NOT_STARTED">Not started</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="DONE">Done</option>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
