"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const COMPANION_TOKEN_STORAGE_KEY = "companion:lastToken";
const COMPANION_TOKEN_EVENT = "companion-token-created";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function defaultBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return stripTrailingSlash(window.location.origin);
}

type CompanionGuideCardProps = {
  apiBaseUrl: string;
};

type CompanionPlatform = "steam" | "battlestate";

type PlatformConfig = {
  label: string;
  shortLabel: string;
  logsPath: string;
  description: string;
  findLogsCommand: string;
};

const PLATFORM_CONFIG: Record<CompanionPlatform, PlatformConfig> = {
  steam: {
    label: "Steam",
    shortLabel: "Steam",
    logsPath: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs",
    description: "For Steam install under steamapps/common.",
    findLogsCommand: `$paths = @(\n  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs",\n  "C:\\Program Files\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs",\n  "D:\\SteamLibrary\\steamapps\\common\\Escape from Tarkov\\build\\Logs"\n)\n$paths | Where-Object { Test-Path $_ }`,
  },
  battlestate: {
    label: "Battlestate Launcher",
    shortLabel: "Battlestate",
    logsPath: "C:\\Battlestate Games\\EFT (live)\\Logs",
    description: "For non-Steam install from Battlestate launcher.",
    findLogsCommand: `$paths = @(\n  "C:\\Battlestate Games\\EFT (live)\\Logs",\n  "D:\\Battlestate Games\\EFT (live)\\Logs",\n  "$env:APPDATA\\Battlestate Games\\Escape from Tarkov\\Logs",\n  "$env:LOCALAPPDATA\\Battlestate Games\\Escape from Tarkov\\Logs"\n)\n$paths | Where-Object { Test-Path $_ }`,
  },
};

type TokenCreatedEvent = CustomEvent<{
  token?: string;
}>;

function CommandBlock(props: { title: string; command: string; copyId: string; copiedId: string | null; onCopy: (id: string, value: string) => Promise<void> }) {
  return (
    <div className="space-y-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="font-medium">{props.title}</p>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <code className="block overflow-x-auto rounded bg-[var(--surface-3)] px-2 py-1 text-xs">{props.command}</code>
        <Button size="sm" variant="secondary" onClick={() => void props.onCopy(props.copyId, props.command)}>
          {props.copiedId === props.copyId ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function CompanionGuideCard({ apiBaseUrl }: CompanionGuideCardProps) {
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => stripTrailingSlash(apiBaseUrl || ""));
  const [platform, setPlatform] = useState<CompanionPlatform>("steam");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!baseUrl) {
      setBaseUrl(defaultBaseUrl());
    }
  }, [baseUrl]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COMPANION_TOKEN_STORAGE_KEY);
      if (stored) {
        setToken(stored);
      }
    } catch {
      // Ignore storage failures.
    }

    const onTokenCreated = (event: Event) => {
      const detail = (event as TokenCreatedEvent).detail;
      const nextToken = detail?.token?.trim() ?? "";
      setToken(nextToken);
    };

    window.addEventListener(COMPANION_TOKEN_EVENT, onTokenCreated as EventListener);

    return () => {
      window.removeEventListener(COMPANION_TOKEN_EVENT, onTokenCreated as EventListener);
    };
  }, []);

  const resolvedBaseUrl = stripTrailingSlash(baseUrl || defaultBaseUrl() || "http://localhost:3000");
  const resolvedToken = token.trim() || "thp_...";
  const activePlatform = PLATFORM_CONFIG[platform];

  const commands = useMemo(() => {
    return {
      recommendedBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${activePlatform.logsPath}" -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20`,
      quickAutoDetect: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20`,
      fullBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${activePlatform.logsPath}" -FullBackfill`,
      liveMode: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${activePlatform.logsPath}"`,
      findLogs: activePlatform.findLogsCommand,
    };
  }, [activePlatform.findLogsCommand, activePlatform.logsPath, resolvedBaseUrl, resolvedToken]);

  async function copyValue(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup Steps (Windows)</CardTitle>
        <CardDescription>Choose your install type, then copy exact commands for that platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>1. Generate token in the card above.</p>
        <p>2. Download script: <code>tarkov-helper-companion.ps1</code>.</p>
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Install type</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={platform === "steam" ? "default" : "secondary"} onClick={() => setPlatform("steam")}>
              Steam
            </Button>
            <Button
              size="sm"
              variant={platform === "battlestate" ? "default" : "secondary"}
              onClick={() => setPlatform("battlestate")}
            >
              Battlestate
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Selected: <span className="font-medium text-[var(--text)]">{activePlatform.label}</span> | {activePlatform.description}
          </p>
          <code className="block overflow-x-auto rounded bg-[var(--surface-3)] px-2 py-1 text-xs">{activePlatform.logsPath}</code>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={resolvedBaseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            aria-label="Companion API base URL"
          />
          <Button size="sm" variant="secondary" onClick={() => void copyValue("base", resolvedBaseUrl)}>
            {copied === "base" ? "Copied" : "Copy base URL"}
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={token}
            placeholder="thp_..."
            onChange={(event) => setToken(event.target.value)}
            aria-label="Companion token for command autofill"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              try {
                localStorage.removeItem(COMPANION_TOKEN_STORAGE_KEY);
              } catch {
                // Ignore storage failures.
              }
              setToken("");
            }}
          >
            Clear token
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Token field auto-fills after Generate/Rotate token. If empty, rotate token above and it will appear here.
        </p>
        <p>
          If script execution is blocked, run once:
          <code className="ml-1 block rounded bg-[var(--surface-2)] px-2 py-1">Set-ExecutionPolicy -Scope Process Bypass</code>
        </p>

        <CommandBlock
          title={`3. Recommended first run (${activePlatform.shortLabel})`}
          command={commands.recommendedBackfill}
          copyId={`cmd-recommended-${platform}`}
          copiedId={copied}
          onCopy={copyValue}
        />
        <CommandBlock
          title="4. If path fails, try auto-detect"
          command={commands.quickAutoDetect}
          copyId={`cmd-autodetect-${platform}`}
          copiedId={copied}
          onCopy={copyValue}
        />
        <CommandBlock
          title={`Find your real LogsRoot (${activePlatform.shortLabel})`}
          command={commands.findLogs}
          copyId={`cmd-findlogs-${platform}`}
          copiedId={copied}
          onCopy={copyValue}
        />

        <CommandBlock title="Optional deeper history scan" command={commands.fullBackfill} copyId={`cmd-full-${platform}`} copiedId={copied} onCopy={copyValue} />
        <CommandBlock title="Optional live mode while playing" command={commands.liveMode} copyId={`cmd-live-${platform}`} copiedId={copied} onCopy={copyValue} />
        <p>Use script output as source of truth: look for <code>Sent X events (taskUpdates=Y)</code>.</p>
      </CardContent>
    </Card>
  );
}
