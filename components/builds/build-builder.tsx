"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type WeaponOption = {
  id: string;
  name: string;
  shortName?: string;
  iconLink?: string | null;
  basePrice?: number | null;
  recoilVertical?: number;
  recoilHorizontal?: number;
  ergonomics?: number;
};

type BuildConstraints = {
  budgetRub: number;
  playerLevel: number;
  traderLevels: Record<string, number>;
  fleaEnabled: boolean;
  priority: "LOW_RECOIL" | "HIGH_ERGO" | "BALANCED" | "BEST_VALUE";
  patch: string;
};

type PlannedBuild = {
  weapon: {
    id: string;
    name: string;
    iconLink?: string | null;
  };
  constraints: BuildConstraints;
  parts: Array<{
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
  }>;
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

const traderNames = ["Prapor", "Therapist", "Skier", "Peacekeeper", "Mechanic", "Ragman", "Jaeger", "Ref"];

function partIconSrc(part: PlannedBuild["parts"][number]) {
  if (part.iconLink && /^https?:\/\//i.test(part.iconLink)) {
    return part.iconLink;
  }

  return `/api/icons/${part.itemId}`;
}

export function BuildBuilder(props: {
  weapons: WeaponOption[];
  initialConstraints: BuildConstraints;
  initialWeaponId?: string;
  canUseAI: boolean;
}) {
  const [weaponId, setWeaponId] = useState(props.initialWeaponId ?? props.weapons[0]?.id ?? "");
  const [constraints, setConstraints] = useState<BuildConstraints>(props.initialConstraints);
  const [plan, setPlan] = useState<PlannedBuild | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("I want a budget low recoil M4A1 build");
  const [aiExplanation, setAiExplanation] = useState("");
  const [buildName, setBuildName] = useState("My Build");
  const [buildDescription, setBuildDescription] = useState("");
  const [buildTags, setBuildTags] = useState("budget");
  const [buildPublic, setBuildPublic] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const selectedWeapon = useMemo(() => props.weapons.find((weapon) => weapon.id === weaponId), [props.weapons, weaponId]);

  function setTraderLevel(name: string, level: number) {
    setConstraints((prev) => ({
      ...prev,
      traderLevels: {
        ...prev.traderLevels,
        [name]: level,
      },
    }));
  }

  async function generateDeterministic() {
    if (!weaponId) return;
    setLoadingPlan(true);
    setSaveMessage(null);

    const response = await fetch("/api/build-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weaponId, constraints }),
    });

    setLoadingPlan(false);

    if (!response.ok) {
      setSaveMessage("Could not generate build. Check constraints and weapon.");
      return;
    }

    const payload = (await response.json()) as { plan: PlannedBuild };
    setPlan(payload.plan);
    setBuildName(`${payload.plan.weapon.name} ${constraints.priority.toLowerCase().replace("_", " ")}`);
    setAiExplanation("");
  }

  async function generateWithAI() {
    setLoadingAI(true);
    setSaveMessage(null);

    const response = await fetch("/api/build-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, constraints }),
    });

    setLoadingAI(false);

    if (!response.ok) {
      setSaveMessage("AI generation failed. Falling back to deterministic mode is recommended.");
      return;
    }

    const payload = (await response.json()) as {
      plan: PlannedBuild;
      explanation: string;
      interpretedConstraints: BuildConstraints;
    };

    setPlan(payload.plan);
    setConstraints(payload.interpretedConstraints);
    setWeaponId(payload.plan.weapon.id);
    setAiExplanation(payload.explanation);
    setBuildName(`${payload.plan.weapon.name} AI preset`);
  }

  async function saveBuild() {
    if (!plan) {
      setSaveMessage("Generate a build first.");
      return;
    }

    setSaveLoading(true);
    setSaveMessage(null);

    const response = await fetch("/api/builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weaponItemId: plan.weapon.id,
        name: buildName,
        description: buildDescription,
        patch: constraints.patch,
        isPublic: buildPublic,
        tags: buildTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        parts: plan.parts.map((part) => ({
          slotKey: part.slotName,
          itemId: part.itemId,
          itemName: part.itemName,
          source: part.source,
          priceRub: part.priceRub,
        })),
        snapshot: {
          recoil: plan.finalStats.recoil,
          ergo: plan.finalStats.ergo,
          cost: plan.totalCost,
          weight: plan.finalStats.weight,
        },
      }),
    });

    setSaveLoading(false);

    if (!response.ok) {
      setSaveMessage("Could not save build.");
      return;
    }

    const payload = await response.json();
    setSaveMessage(`Saved build: ${payload.build.name}`);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Platform</CardTitle>
            <CardDescription>Select weapon base platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={weaponId} onChange={(event) => setWeaponId(event.target.value)}>
              {props.weapons.map((weapon) => (
                <option key={weapon.id} value={weapon.id}>
                  {weapon.shortName ? `${weapon.shortName} — ${weapon.name}` : weapon.name}
                </option>
              ))}
            </Select>

            {selectedWeapon ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
                <p className="font-medium">{selectedWeapon.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  Base recoil {selectedWeapon.recoilVertical ?? "-"}/{selectedWeapon.recoilHorizontal ?? "-"} • ergo {selectedWeapon.ergonomics ?? "-"}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Constraints</CardTitle>
            <CardDescription>Planner respects level, trader LL, flea and budget constraints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <label className="text-xs text-[var(--muted)]">Budget (RUB)</label>
                <Input
                  type="number"
                  value={constraints.budgetRub}
                  onChange={(event) => setConstraints((prev) => ({ ...prev, budgetRub: Number(event.target.value || 0) }))}
                />
              </div>

              <div>
                <label className="text-xs text-[var(--muted)]">Player level</label>
                <Input
                  type="number"
                  min={1}
                  max={79}
                  value={constraints.playerLevel}
                  onChange={(event) => {
                    const level = Number(event.target.value || 1);
                    setConstraints((prev) => ({
                      ...prev,
                      playerLevel: level,
                      fleaEnabled: level >= 15 ? prev.fleaEnabled : false,
                    }));
                  }}
                />
              </div>

              <div>
                <label className="text-xs text-[var(--muted)]">Priority</label>
                <Select
                  value={constraints.priority}
                  onChange={(event) =>
                    setConstraints((prev) => ({ ...prev, priority: event.target.value as BuildConstraints["priority"] }))
                  }
                >
                  <option value="LOW_RECOIL">Meta recoil</option>
                  <option value="BEST_VALUE">Budget recoil</option>
                  <option value="HIGH_ERGO">Ergo snappy</option>
                  <option value="BALANCED">Balanced</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <label className="text-xs text-[var(--muted)]">Patch / wipe</label>
                <Input value={constraints.patch} onChange={(event) => setConstraints((prev) => ({ ...prev, patch: event.target.value }))} />
              </div>

              <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={constraints.fleaEnabled}
                  onChange={(event) => setConstraints((prev) => ({ ...prev, fleaEnabled: event.target.checked }))}
                />
                Flea enabled
              </label>
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              {traderNames.map((name) => (
                <div key={name}>
                  <label className="text-xs text-[var(--muted)]">{name} LL</label>
                  <Select
                    value={String(constraints.traderLevels[name] ?? 1)}
                    onChange={(event) => setTraderLevel(name, Number(event.target.value))}
                  >
                    <option value="1">LL1</option>
                    <option value="2">LL2</option>
                    <option value="3">LL3</option>
                    <option value="4">LL4</option>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={generateDeterministic} disabled={loadingPlan || !weaponId}>
                {loadingPlan ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Generate deterministic build
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>AI Build Agent</CardTitle>
          <CardDescription>
            LLM is used for intent parsing and explanation. Parts are generated by deterministic planner pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="I want an M4 budget low recoil build" />
          <div className="flex items-center gap-2">
            <Button onClick={generateWithAI} disabled={!props.canUseAI || loadingAI}>
              {loadingAI ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Run build agent
            </Button>
            {!props.canUseAI ? <p className="text-xs text-[var(--muted)]">Set OPENAI_API_KEY to enable LLM assist.</p> : null}
          </div>
          {aiExplanation ? <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">{aiExplanation}</pre> : null}
        </CardContent>
      </Card>

      {plan ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{plan.weapon.name}</CardTitle>
              <CardDescription>
                Estimated cost: {plan.totalCost.toLocaleString("en-US")} RUB • source: trader + flea (tarkov.dev)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 md:grid-cols-3">
                <Badge variant="neutral">Recoil {plan.finalStats.recoil}</Badge>
                <Badge variant="neutral">Ergo {plan.finalStats.ergo}</Badge>
                <Badge variant="neutral">Weight {plan.finalStats.weight}</Badge>
              </div>

              <div className="space-y-2">
                {plan.parts.map((part) => (
                  <div key={`${part.slotId}-${part.itemId}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Image
                        src={partIconSrc(part)}
                        alt={part.itemName}
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{part.slotName}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{part.itemName}</p>
                      </div>
                    </div>

                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{part.priceRub.toLocaleString("en-US")} RUB</p>
                      <p>
                        {part.source}
                        {part.traderName ? ` (${part.traderName})` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {plan.unavailableSlots.length ? (
                <div className="rounded-md border border-amber-600/40 bg-amber-600/10 p-2 text-xs text-amber-200">
                  Unavailable slots under constraints: {plan.unavailableSlots.map((slot) => slot.slotName).join(", ")}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Save / Share</CardTitle>
              <CardDescription>Store this build snapshot per patch profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input value={buildName} onChange={(event) => setBuildName(event.target.value)} placeholder="Build name" />
              <Textarea
                value={buildDescription}
                onChange={(event) => setBuildDescription(event.target.value)}
                placeholder="Description"
              />
              <Input value={buildTags} onChange={(event) => setBuildTags(event.target.value)} placeholder="tags comma separated" />
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={buildPublic} onChange={(event) => setBuildPublic(event.target.checked)} />
                Public build
              </label>
              <Button onClick={saveBuild} disabled={saveLoading} className="w-full">
                {saveLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Save build
              </Button>
              {saveMessage ? <p className="text-xs text-[var(--muted)]">{saveMessage}</p> : null}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
