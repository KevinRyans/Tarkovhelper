"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import type { TaskNeededItem } from "@/lib/tasks/logic";
import type { TarkovTask } from "@/lib/tarkov/types";

const TaskDetail = dynamic(() => import("@/components/tasks/task-detail").then((module) => module.TaskDetail), {
  ssr: false,
});

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

type KappaRow = {
  id: string;
  name: string;
  trader: string;
  map: string;
  status: TaskStatus;
  blockedByTasks: string[];
  blockedByTrader: string[];
  difficulty: "easy" | "medium" | "hard";
  recommendedOrder: number;
};

type HoardItem = {
  id: string;
  name: string;
  count: number;
  iconLink?: string | null;
};

type KappaTaskDetail = {
  task: TarkovTask;
  nextTasks: Array<{ id: string; name: string }>;
  neededItems: TaskNeededItem[];
  objectiveDoneMap: Record<string, boolean>;
};

const MODAL_ANIMATION_MS = 220;

function statusBadge(status: TaskStatus) {
  if (status === "DONE") return <Badge variant="success">Done</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="neutral">Not started</Badge>;
}

function difficultyBadge(level: KappaRow["difficulty"]) {
  if (level === "hard") return <Badge variant="danger">Hard</Badge>;
  if (level === "medium") return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="success">Easy</Badge>;
}

export function KappaDashboard(props: {
  rows: KappaRow[];
  hoardItems: HoardItem[];
  traders: string[];
  maps: string[];
  shareUrl?: string;
  canEdit: boolean;
  detailUsername?: string;
}) {
  const [rows, setRows] = useState(props.rows);
  const [taskDetailsById, setTaskDetailsById] = useState<Record<string, KappaTaskDetail>>({});
  const [loadingTaskDetailId, setLoadingTaskDetailId] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [trader, setTrader] = useState("all");
  const [map, setMap] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  async function ensureTaskDetails(taskId: string) {
    if (taskDetailsById[taskId] || loadingTaskDetailId === taskId) {
      return;
    }

    setLoadingTaskDetailId(taskId);
    setDetailErrors((prev) => {
      if (!prev[taskId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[taskId];
      return next;
    });

    const params = new URLSearchParams();
    if (props.detailUsername) {
      params.set("username", props.detailUsername);
    }

    const queryString = params.toString();
    const endpoint = `/api/tasks/${taskId}/detail${queryString ? `?${queryString}` : ""}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Task detail request failed (${response.status})`);
      }

      const payload = (await response.json()) as KappaTaskDetail & { status?: TaskStatus };

      setTaskDetailsById((prev) => ({
        ...prev,
        [taskId]: {
          task: payload.task,
          nextTasks: payload.nextTasks,
          neededItems: payload.neededItems,
          objectiveDoneMap: payload.objectiveDoneMap,
        },
      }));

      if (payload.status) {
        setRows((prev) => prev.map((row) => (row.id === taskId ? { ...row, status: payload.status ?? row.status } : row)));
      }
    } catch (error) {
      setDetailErrors((prev) => ({
        ...prev,
        [taskId]: error instanceof Error ? error.message : "Failed to load task detail",
      }));
    } finally {
      setLoadingTaskDetailId((current) => (current === taskId ? null : current));
    }
  }

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openTask(taskId: string) {
    clearCloseTimer();
    setModalTaskId(taskId);
    setModalVisible(false);
    void ensureTaskDetails(taskId);
    window.requestAnimationFrame(() => {
      setModalVisible(true);
    });
  }

  function closeModal() {
    setModalVisible(false);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setModalTaskId(null);
      closeTimerRef.current = null;
    }, MODAL_ANIMATION_MS);
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!modalTaskId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setModalVisible(false);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        setModalTaskId(null);
        closeTimerRef.current = null;
      }, MODAL_ANIMATION_MS);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalTaskId]);

  const total = rows.length;
  const completed = rows.filter((row) => row.status === "DONE").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remainingRows = rows.filter((row) => row.status !== "DONE");
  const remainingCount = remainingRows.length;
  const readyRows = remainingRows.filter((row) => row.blockedByTasks.length + row.blockedByTrader.length === 0);
  const blockedRows = remainingRows.filter((row) => row.blockedByTasks.length + row.blockedByTrader.length > 0);
  const readyCount = readyRows.length;
  const blockedCount = blockedRows.length;

  const nextFive = [...readyRows]
    .sort((a, b) => a.recommendedOrder - b.recommendedOrder || a.name.localeCompare(b.name))
    .slice(0, 5);

  const filtered = (() => {
    const q = query.toLowerCase().trim();
    return remainingRows.filter((row) => {
      if (q && !`${row.name} ${row.trader} ${row.map}`.toLowerCase().includes(q)) return false;
      if (trader !== "all" && row.trader !== trader) return false;
      if (map !== "all" && row.map !== map) return false;
      if (difficulty !== "all" && row.difficulty !== difficulty) return false;
      if (blockedOnly && row.blockedByTasks.length + row.blockedByTrader.length === 0) return false;
      return true;
    });
  })();

  const selectedRow = modalTaskId ? rows.find((row) => row.id === modalTaskId) : null;
  const selectedTaskData = modalTaskId ? taskDetailsById[modalTaskId] : null;

  function updateRowStatus(taskId: string, nextStatus: TaskStatus) {
    setRows((prev) => prev.map((row) => (row.id === taskId ? { ...row, status: nextStatus } : row)));
    if (nextStatus === "DONE") {
      closeModal();
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total completion</CardDescription>
            <CardTitle>
              {completed}/{total}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={percent} />
            <p className="text-xs text-[var(--muted)]">{percent}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Remaining</CardDescription>
            <CardTitle>{remainingCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ready now</CardDescription>
            <CardTitle>{readyCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Blocked</CardDescription>
            <CardTitle>{blockedCount}</CardTitle>
          </CardHeader>
          <CardContent>{props.shareUrl ? <p className="text-xs text-[var(--muted)] mono">Share: {props.shareUrl}</p> : null}</CardContent>
        </Card>
      </section>

      <div className="sticky top-[120px] z-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search remaining quests" />

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

          <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="all">All difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>

          <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={blockedOnly} onChange={(event) => setBlockedOnly(event.target.checked)} />
            Blocked only
          </label>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Remaining Kappa quests</CardTitle>
            <CardDescription>Click a quest to open quick detail modal, no page switch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.map((row) => {
              const blockedTotal = row.blockedByTasks.length + row.blockedByTrader.length;
              return (
                <div key={row.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openTask(row.id)}
                      className="text-left font-medium hover:text-[var(--accent)]"
                      aria-label={`Open ${row.name} details`}
                    >
                      {row.recommendedOrder + 1}. {row.name}
                    </button>

                    <div className="flex flex-wrap gap-1">
                      {statusBadge(row.status)}
                      {difficultyBadge(row.difficulty)}
                      {blockedTotal > 0 ? <Badge variant="danger">Blocked ({blockedTotal})</Badge> : <Badge variant="accent">Ready</Badge>}
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {row.trader}
                    {row.map ? ` | ${row.map}` : ""}
                    <span className="mx-1">|</span>
                    <Link href={`/tasks/${row.id}`} className="hover:text-[var(--accent)] hover:underline">
                      open full page
                    </Link>
                  </p>

                  {blockedTotal > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                      {row.blockedByTasks.slice(0, 2).map((name) => (
                        <p key={`${row.id}-${name}`}>Missing quest: {name}</p>
                      ))}
                      {row.blockedByTrader.slice(0, 2).map((requirement) => (
                        <p key={`${row.id}-${requirement}`}>Missing requirement: {requirement}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {filtered.length === 0 ? <p className="text-sm text-[var(--muted)]">No tasks match your current filters.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Next 5 quests</CardTitle>
              <CardDescription>Best immediate push targets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {nextFive.length === 0 ? <p className="text-[var(--muted)]">No ready Kappa quests right now.</p> : null}
              {nextFive.map((row) => (
                <button key={row.id} type="button" onClick={() => openTask(row.id)} className="block text-left text-[var(--accent)] hover:underline">
                  {row.name}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blocked overview</CardTitle>
              <CardDescription>Quests waiting on prerequisites.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {blockedRows.slice(0, 5).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openTask(row.id)}
                  className="block w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-left hover:border-[var(--accent)]"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-[var(--muted)]">Missing {row.blockedByTasks.length + row.blockedByTrader.length}</p>
                </button>
              ))}
              {blockedRows.length === 0 ? <p className="text-[var(--muted)]">Nothing blocked.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items you should hoard</CardTitle>
              <CardDescription>Upcoming Kappa-related quest item pressure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {props.hoardItems.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Image
                      src={item.iconLink && /^https?:\/\//i.test(item.iconLink) ? item.iconLink : `/api/icons/${item.id}`}
                      alt={item.name}
                      width={28}
                      height={28}
                      unoptimized
                      className="h-7 w-7 rounded object-cover"
                    />
                    <p className="truncate text-sm">{item.name}</p>
                  </div>
                  <Badge variant="neutral">x{item.count}</Badge>
                </div>
              ))}
              {props.hoardItems.length === 0 ? <p className="text-sm text-[var(--muted)]">No item requirements detected.</p> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {selectedRow ? (
        <div
          className={`fixed inset-0 z-50 p-3 transition-opacity duration-200 sm:p-6 ${modalVisible ? "bg-black/70 opacity-100" : "bg-black/0 opacity-0"}`}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`mx-auto flex h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl transition-all duration-200 ease-out ${
              modalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.985] opacity-0"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedRow.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {selectedRow.trader}
                  {selectedRow.map ? ` | ${selectedRow.map}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/tasks/${selectedRow.id}`} className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--surface-2)]">
                  Full page
                </Link>
                <Button variant="secondary" size="sm" onClick={closeModal}>
                  Close
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedTaskData ? (
                <TaskDetail
                  task={selectedTaskData.task}
                  nextTasks={selectedTaskData.nextTasks}
                  status={selectedRow.status}
                  objectiveDoneMap={selectedTaskData.objectiveDoneMap}
                  neededItems={selectedTaskData.neededItems}
                  canEdit={props.canEdit}
                  onStatusUpdated={(status) => updateRowStatus(selectedRow.id, status)}
                />
              ) : (
                <div className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle>Loading task detail...</CardTitle>
                      <CardDescription>Fetching objectives, rewards and item requirements.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-[var(--muted)]">
                        {loadingTaskDetailId === selectedRow.id ? "Please wait a moment." : "Detail not loaded yet."}
                      </p>

                      {detailErrors[selectedRow.id] ? (
                        <div className="space-y-2">
                          <p className="text-amber-300">{detailErrors[selectedRow.id]}</p>
                          <Button size="sm" variant="secondary" onClick={() => void ensureTaskDetails(selectedRow.id)}>
                            Retry
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
