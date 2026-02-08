"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";

import type { TaskNeededItem } from "@/lib/tasks/logic";
import type { TaskObjective, TarkovTask } from "@/lib/tarkov/types";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

type ItemRef = {
  id: string;
  name: string;
  iconLink?: string | null;
};

function ItemPill(props: {
  item: ItemRef;
  count?: number;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs">
      <Image src={`/api/icons/${props.item.id}`} alt={props.item.name} width={14} height={14} unoptimized className="h-3.5 w-3.5 rounded object-cover" />
      <span className="max-w-[170px] truncate">{props.item.name}</span>
      {props.count ? <span className="text-[var(--muted)]">x{props.count}</span> : null}
    </span>
  );
}

function ItemRow(props: {
  item: ItemRef;
  count?: number;
  rightLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Image src={`/api/icons/${props.item.id}`} alt={props.item.name} width={24} height={24} unoptimized className="h-6 w-6 rounded object-cover" />
        <span className="truncate">{props.item.name}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
        {props.rightLabel ? <span>{props.rightLabel}</span> : null}
        {props.count ? <span>x{props.count}</span> : null}
      </div>
    </div>
  );
}

type ObjectiveItemGroup = {
  key: string;
  label: string;
  options: ItemRef[];
};

function toItemRef(item: { id: string; name: string; iconLink?: string | null } | null | undefined): ItemRef | null {
  if (!item?.id || !item.name) {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    iconLink: item.iconLink,
  };
}

function dedupeItemRefs(items: Array<ItemRef | null>) {
  const map = new Map<string, ItemRef>();

  for (const item of items) {
    if (!item) {
      continue;
    }
    map.set(item.id, item);
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function objectiveItemGroups(objective: TaskObjective): ObjectiveItemGroup[] {
  const groups: ObjectiveItemGroup[] = [];

  if (objective.__typename === "TaskObjectiveItem" && objective.items?.length) {
    groups.push({
      key: "any-item",
      label: `Any of these items (${objective.count ?? 1})${objective.foundInRaid ? " - found in raid" : ""}`,
      options: dedupeItemRefs(objective.items.map((item) => toItemRef(item))),
    });
  }

  if (objective.__typename === "TaskObjectiveBuildItem" && objective.item) {
    groups.push({
      key: "build-item",
      label: `Build and hand over (${objective.count ?? 1})`,
      options: dedupeItemRefs([toItemRef(objective.item)]),
    });
  }

  if (objective.__typename === "TaskObjectiveQuestItem" && objective.questItem) {
    groups.push({
      key: "quest-item",
      label: `Quest item (${objective.count ?? 1})`,
      options: dedupeItemRefs([toItemRef(objective.questItem)]),
    });
  }

  if (objective.__typename === "TaskObjectiveMark" && objective.markerItem) {
    groups.push({
      key: "marker-item",
      label: "Required marker item",
      options: dedupeItemRefs([toItemRef(objective.markerItem)]),
    });
  }

  if (objective.__typename === "TaskObjectiveShoot") {
    if (objective.usingWeapon?.length) {
      groups.push({
        key: "using-weapon",
        label: "Use one of these weapons",
        options: dedupeItemRefs(objective.usingWeapon.map((item) => toItemRef(item))),
      });
    }

    if (objective.usingWeaponMods?.length) {
      objective.usingWeaponMods.forEach((mods, index) => {
        const options = dedupeItemRefs((mods ?? []).map((item) => toItemRef(item)));
        if (!options.length) {
          return;
        }

        groups.push({
          key: `using-mods-${index}`,
          label:
            objective.usingWeaponMods && objective.usingWeaponMods.length > 1
              ? `Weapon mod option ${index + 1}`
              : "Weapon mod requirement",
          options,
        });
      });
    }

    if (objective.wearing?.length) {
      objective.wearing.forEach((set, index) => {
        const options = dedupeItemRefs((set ?? []).map((item) => toItemRef(item)));
        if (!options.length) {
          return;
        }

        groups.push({
          key: `wearing-${index}`,
          label: objective.wearing && objective.wearing.length > 1 ? `Wear set option ${index + 1}` : "Required worn gear",
          options,
        });
      });
    }

    if (objective.notWearing?.length) {
      groups.push({
        key: "not-wearing",
        label: "Do not wear",
        options: dedupeItemRefs(objective.notWearing.map((item) => toItemRef(item))),
      });
    }

    if (objective.requiredKeys?.length) {
      objective.requiredKeys.forEach((set, index) => {
        const options = dedupeItemRefs((set ?? []).map((item) => toItemRef(item)));
        if (!options.length) {
          return;
        }

        groups.push({
          key: `required-keys-${index}`,
          label: objective.requiredKeys && objective.requiredKeys.length > 1 ? `Required key option ${index + 1}` : "Required key",
          options,
        });
      });
    }
  }

  return groups.filter((group) => group.options.length > 0);
}

export function TaskDetail(props: {
  task: TarkovTask;
  nextTasks: Array<{ id: string; name: string }>;
  status: TaskStatus;
  objectiveDoneMap: Record<string, boolean>;
  neededItems: TaskNeededItem[];
  canEdit: boolean;
  onStatusUpdated?: (status: TaskStatus) => void;
}) {
  const [status, setStatus] = useState<TaskStatus>(props.status);
  const [objectiveDone, setObjectiveDone] = useState<Record<string, boolean>>(props.objectiveDoneMap);

  const completePercent = useMemo(() => {
    if (!props.task.objectives.length) {
      return 0;
    }

    const doneCount = props.task.objectives.filter((objective) => objectiveDone[objective.id]).length;
    return Math.round((doneCount / props.task.objectives.length) * 100);
  }, [objectiveDone, props.task.objectives]);

  const requiredItems = useMemo(
    () => props.neededItems.filter((item): item is Extract<TaskNeededItem, { kind: "REQUIRED" }> => item.kind === "REQUIRED"),
    [props.neededItems],
  );

  const anyOfGroups = useMemo(
    () => props.neededItems.filter((item): item is Extract<TaskNeededItem, { kind: "ANY_OF" }> => item.kind === "ANY_OF"),
    [props.neededItems],
  );

  async function updateStatus(nextStatus: TaskStatus) {
    const previousStatus = status;
    setStatus(nextStatus);

    const response = await fetch("/api/tasks/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: props.task.id, status: nextStatus }),
    });

    if (!response.ok) {
      setStatus(previousStatus);
      return;
    }

    props.onStatusUpdated?.(nextStatus);
  }

  async function toggleObjective(objective: TaskObjective, done: boolean) {
    setObjectiveDone((prev) => ({ ...prev, [objective.id]: done }));

    const response = await fetch("/api/tasks/objective", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: props.task.id,
        objectiveId: objective.id,
        done,
      }),
    });

    if (!response.ok) {
      setObjectiveDone((prev) => ({ ...prev, [objective.id]: !done }));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{props.task.name}</CardTitle>
              <CardDescription>
                {props.task.trader.name}
                {props.task.map?.name ? ` - ${props.task.map.name}` : ""}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {props.task.kappaRequired ? <Badge variant="accent">Kappa required</Badge> : null}
              <Badge variant={status === "DONE" ? "success" : status === "IN_PROGRESS" ? "warning" : "neutral"}>{status}</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm text-[var(--muted)]">Objective completion: {completePercent}%</div>

          {props.canEdit ? (
            <Select value={status} onChange={(event) => updateStatus(event.target.value as TaskStatus)}>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </Select>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Objectives</CardTitle>
            <CardDescription>Track each objective directly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {props.task.objectives.map((objective) => {
              const itemGroups = objectiveItemGroups(objective);

              return (
                <label key={objective.id} className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  {props.canEdit ? (
                    <Checkbox
                      checked={Boolean(objectiveDone[objective.id])}
                      onChange={(event) => toggleObjective(objective, event.currentTarget.checked)}
                      aria-label={`Toggle objective ${objective.description}`}
                    />
                  ) : null}
                  <div className="space-y-1">
                    <p className="text-sm">{objective.description}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {objective.__typename}
                      {objective.count ? ` - count ${objective.count}` : ""}
                      {objective.optional ? " - optional" : ""}
                    </p>

                    {itemGroups.length > 0 ? (
                      <div className="space-y-1.5">
                        {itemGroups.map((group) => {
                          const visible = group.options.slice(0, 8);
                          const moreCount = Math.max(0, group.options.length - visible.length);

                          return (
                            <div key={`${objective.id}-${group.key}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                              <p className="mb-1 text-xs text-[var(--muted)]">{group.label}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {visible.map((item) => (
                                  <ItemPill key={`${objective.id}-${group.key}-${item.id}`} item={item} />
                                ))}
                                {moreCount > 0 ? (
                                  <span className="rounded-md border border-[var(--border)] px-1.5 py-1 text-xs text-[var(--muted)]">+{moreCount} more</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {objective.usingWeaponMods?.length || objective.wearing?.length || objective.requiredKeys?.length ? (
                      <p className="text-xs text-[var(--muted)]">
                        If multiple option groups are shown above, complete one valid set per game objective rules.
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Required items</CardTitle>
            <CardDescription>Shows strict items and objective alternatives.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {props.neededItems.length === 0 ? <p className="text-sm text-[var(--muted)]">No explicit item requirements parsed.</p> : null}

            {requiredItems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Strict requirements</p>
                {requiredItems.map((item) => (
                  <ItemRow key={item.id} item={item} count={item.count} />
                ))}
              </div>
            ) : null}

            {anyOfGroups.length > 0 ? (
              <div className="space-y-2">
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Alternatives (any of)</p>
                {anyOfGroups.map((group) => {
                  const visible = group.options.slice(0, 8);
                  const remaining = Math.max(0, group.options.length - visible.length);

                  return (
                    <div key={group.groupId} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs">
                      <p className="font-medium text-[var(--text)]">
                        Hand over any {group.count} item{group.count > 1 ? "s" : ""}
                        {group.foundInRaid ? " (found in raid)" : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {visible.map((option) => (
                          <ItemPill key={option.id} item={option} />
                        ))}
                        {remaining > 0 ? <span className="rounded-md border border-[var(--border)] px-1.5 py-1 text-[var(--muted)]">+{remaining} more</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prerequisites</CardTitle>
            <CardDescription>Tasks and level/trader requirements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {props.task.taskRequirements.length === 0 && props.task.traderRequirements.length === 0 ? (
              <p className="text-[var(--muted)]">No prerequisites</p>
            ) : null}

            {props.task.taskRequirements.map((requirement) => (
              <p key={`${requirement.task.id}-${requirement.status.join("-")}`}>
                Task:{" "}
                <Link href={`/tasks/${requirement.task.id}`} className="text-[var(--accent)] hover:underline">
                  {requirement.task.name}
                </Link>
              </p>
            ))}

            {props.task.traderRequirements.map((requirement) => (
              <p key={requirement.id}>
                {requirement.requirementType}: {requirement.trader.name} {requirement.compareMethod} {requirement.value}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unlocks and next tasks</CardTitle>
            <CardDescription>What this quest opens up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {props.nextTasks.length === 0 ? <p className="text-[var(--muted)]">No direct follow-up tasks found.</p> : null}
            {props.nextTasks.map((task) => (
              <p key={task.id}>
                <Link href={`/tasks/${task.id}`} className="text-[var(--accent)] hover:underline">
                  {task.name}
                </Link>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rewards</CardTitle>
          <CardDescription>Start and finish rewards with icons.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Finish rewards</p>
            <div className="space-y-1.5">
              {props.task.finishRewards?.items?.length ? (
                props.task.finishRewards.items.map((reward) => <ItemRow key={`finish-${reward.item.id}-${reward.count}`} item={reward.item} count={reward.count} />)
              ) : (
                <p className="text-sm text-[var(--muted)]">No item rewards</p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Offer unlocks</p>
              {props.task.finishRewards?.offerUnlock?.length ? (
                props.task.finishRewards.offerUnlock.map((unlock) => (
                  <ItemRow key={`unlock-${unlock.id}`} item={unlock.item} rightLabel={`${unlock.trader.name} LL${unlock.level}`} />
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No offer unlocks</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Start rewards</p>
            <div className="space-y-1.5">
              {props.task.startRewards?.items?.length ? (
                props.task.startRewards.items.map((reward) => <ItemRow key={`start-${reward.item.id}-${reward.count}`} item={reward.item} count={reward.count} />)
              ) : (
                <p className="text-sm text-[var(--muted)]">No start item rewards</p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Offer unlocks</p>
              {props.task.startRewards?.offerUnlock?.length ? (
                props.task.startRewards.offerUnlock.map((unlock) => (
                  <ItemRow key={`start-unlock-${unlock.id}`} item={unlock.item} rightLabel={`${unlock.trader.name} LL${unlock.level}`} />
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No start offer unlocks</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {props.task.wikiLink ? (
        <Link
          href={props.task.wikiLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--border)] px-4 text-sm hover:bg-[var(--surface-2)]"
        >
          Open wiki source
        </Link>
      ) : null}
    </div>
  );
}
