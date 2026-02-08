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

  const commands = useMemo(() => {
    const steamLogsPath = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs";
    const launcherLogsPath = "C:\\Battlestate Games\\EFT (live)\\Logs";

    return {
      quickBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20`,
      steamBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${steamLogsPath}" -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20`,
      launcherBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${launcherLogsPath}" -BackfillOnly -BackfillLogLimit 120 -BackfillFlushEveryLogs 20`,
      fullBackfill: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${steamLogsPath}" -FullBackfill`,
      liveMode: `.\\tarkov-helper-companion.ps1 -ApiBaseUrl "${resolvedBaseUrl}" -CompanionToken "${resolvedToken}" -LogsRoot "${steamLogsPath}"`,
      findLogs: `$paths = @(\n  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs",\n  "C:\\Program Files\\Steam\\steamapps\\common\\Escape from Tarkov\\build\\Logs",\n  "$env:APPDATA\\Battlestate Games\\Escape from Tarkov\\Logs",\n  "$env:LOCALAPPDATA\\Battlestate Games\\Escape from Tarkov\\Logs",\n  "C:\\Battlestate Games\\EFT (live)\\Logs",\n  "D:\\Battlestate Games\\EFT (live)\\Logs"\n)\n$paths | Where-Object { Test-Path $_ }`,
    };
  }, [resolvedBaseUrl, resolvedToken]);

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
        <CardDescription>Background watcher + automatic backfill from existing logs (Steam and launcher).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>1. Generate token in the card above.</p>
        <p>2. Download script: <code>tarkov-helper-companion.ps1</code>.</p>
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

        <CommandBlock title="3. Quick first run (auto-detect logs)" command={commands.quickBackfill} copyId="cmd-quick" copiedId={copied} onCopy={copyValue} />
        <CommandBlock title="4. Steam fallback (manual LogsRoot)" command={commands.steamBackfill} copyId="cmd-steam" copiedId={copied} onCopy={copyValue} />
        <CommandBlock title="5. Battlestate launcher fallback (manual LogsRoot)" command={commands.launcherBackfill} copyId="cmd-launcher" copiedId={copied} onCopy={copyValue} />
        <CommandBlock title="Find your real LogsRoot path" command={commands.findLogs} copyId="cmd-findlogs" copiedId={copied} onCopy={copyValue} />

        <p>
          Optional deeper history scan:
          <code className="ml-1 block rounded bg-[var(--surface-2)] px-2 py-1">{commands.fullBackfill}</code>
        </p>
        <p>
          Optional live mode while playing:
          <code className="ml-1 block rounded bg-[var(--surface-2)] px-2 py-1">{commands.liveMode}</code>
        </p>
        <p>Use script output as source of truth: look for <code>Sent X events (taskUpdates=Y)</code>.</p>
      </CardContent>
    </Card>
  );
}

