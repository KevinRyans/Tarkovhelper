"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Privacy = "PUBLIC" | "PRIVATE";

const traderNames = ["Prapor", "Therapist", "Skier", "Peacekeeper", "Mechanic", "Ragman", "Jaeger", "Ref"];

export function ProfileSettings(props: {
  initial: {
    level: number;
    fleaUnlocked: boolean;
    traderLevels: Record<string, number>;
    privacy: Privacy;
  };
  username: string;
}) {
  const [level, setLevel] = useState(props.initial.level);
  const [fleaUnlocked, setFleaUnlocked] = useState(props.initial.fleaUnlocked);
  const [traderLevels, setTraderLevels] = useState<Record<string, number>>(props.initial.traderLevels);
  const [privacy, setPrivacy] = useState<Privacy>(props.initial.privacy);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setTraderLevel(name: string, value: number) {
    setTraderLevels((prev) => ({ ...prev, [name]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level,
        fleaUnlocked,
        traderLevels,
        privacy,
      }),
    });

    setSaving(false);

    if (!response.ok) {
      setMessage("Failed to save settings");
      return;
    }

    setMessage("Settings saved");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Player profile</CardTitle>
          <CardDescription>Controls task availability and build constraints.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--muted)]">PMC level</label>
              <Input
                type="number"
                min={1}
                max={79}
                value={level}
                onChange={(event) => setLevel(Number(event.target.value || 1))}
              />
            </div>

            <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
              <input type="checkbox" checked={fleaUnlocked} onChange={(event) => setFleaUnlocked(event.target.checked)} />
              Flea enabled
            </label>

            <div>
              <label className="text-xs text-[var(--muted)]">Kappa profile privacy</label>
              <Select value={privacy} onChange={(event) => setPrivacy(event.target.value as Privacy)}>
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {traderNames.map((name) => (
              <div key={name}>
                <label className="text-xs text-[var(--muted)]">{name} LL</label>
                <Select value={String(traderLevels[name] ?? 1)} onChange={(event) => setTraderLevel(name, Number(event.target.value))}>
                  <option value="1">LL1</option>
                  <option value="2">LL2</option>
                  <option value="3">LL3</option>
                  <option value="4">LL4</option>
                </Select>
              </div>
            ))}
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
          {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public profile link</CardTitle>
          <CardDescription>Works only when privacy is set to Public.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mono text-sm">/kappa/{props.username}</p>
        </CardContent>
      </Card>
    </div>
  );
}
