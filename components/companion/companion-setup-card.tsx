"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const COMPANION_TOKEN_STORAGE_KEY = "companion:lastToken";
const COMPANION_TOKEN_EVENT = "companion-token-created";

type TokenStatusResponse = {
  configured: boolean;
  tokenPreview: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
  lastUsedAt: string | null;
  lastSource: string | null;
};

type TokenCreateResponse = {
  token: string;
  tokenPreview: string;
  createdAt: string;
  rotatedAt: string;
};

export function CompanionSetupCard(props: { compact?: boolean }) {
  const [status, setStatus] = useState<TokenStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const ingestUrl = useMemo(() => (origin ? `${origin}/api/companion/ingest` : "/api/companion/ingest"), [origin]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/companion/token", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        setStatus(null);
        return;
      }
      const payload = (await response.json()) as TokenStatusResponse;
      setStatus(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const handle = window.setInterval(() => {
      void loadStatus();
    }, 15000);

    return () => {
      window.clearInterval(handle);
    };
  }, [loadStatus]);

  async function createToken() {
    setWorking(true);
    try {
      const response = await fetch("/api/companion/token", {
        method: "POST",
      });

      if (!response.ok) {
        setNewToken(null);
        return;
      }

      const payload = (await response.json()) as TokenCreateResponse;
      setNewToken(payload.token);

      try {
        localStorage.setItem(COMPANION_TOKEN_STORAGE_KEY, payload.token);
        window.dispatchEvent(
          new CustomEvent(COMPANION_TOKEN_EVENT, {
            detail: { token: payload.token },
          }),
        );
      } catch {
        // Ignore local storage failures (private mode / blocked storage).
      }

      await loadStatus();
    } finally {
      setWorking(false);
    }
  }

  async function revokeToken() {
    setWorking(true);
    try {
      await fetch("/api/companion/token", {
        method: "DELETE",
      });
      setNewToken(null);

      try {
        localStorage.removeItem(COMPANION_TOKEN_STORAGE_KEY);
        window.dispatchEvent(
          new CustomEvent(COMPANION_TOKEN_EVENT, {
            detail: { token: "" },
          }),
        );
      } catch {
        // Ignore local storage failures.
      }

      await loadStatus();
    } finally {
      setWorking(false);
    }
  }

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
        <CardTitle>Companion Sync</CardTitle>
        <CardDescription>Auto-sync task progress from an optional local background agent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status?.configured ? "success" : "neutral"}>{status?.configured ? "Configured" : "Not configured"}</Badge>
          {status?.lastUsedAt ? <Badge variant="neutral">Last sync {new Date(status.lastUsedAt).toLocaleString()}</Badge> : null}
          {status?.lastSource ? <Badge variant="neutral">Source: {status.lastSource}</Badge> : null}
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input value={ingestUrl} readOnly aria-label="Companion ingest endpoint" />
          <Button variant="secondary" size="sm" onClick={() => copyValue("endpoint", ingestUrl)}>
            {copied === "endpoint" ? "Copied" : "Copy endpoint"}
          </Button>
        </div>

        {status?.configured ? (
          <p className="text-xs text-[var(--muted)]">
            Active token: <span className="mono">{status.tokenPreview}</span>
          </p>
        ) : (
          <p className="text-xs text-[var(--muted)]">No token yet. Generate one to connect the companion agent.</p>
        )}

        {newToken ? (
          <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-xs font-medium">Copy this token now (shown once):</p>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input value={newToken} readOnly aria-label="Generated companion token" />
              <Button variant="secondary" size="sm" onClick={() => copyValue("token", newToken)}>
                {copied === "token" ? "Copied" : "Copy token"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={createToken} disabled={working || loading}>
            {status?.configured ? "Rotate token" : "Generate token"}
          </Button>
          {status?.configured ? (
            <Button size="sm" variant="outline" onClick={revokeToken} disabled={working || loading}>
              Revoke token
            </Button>
          ) : null}
          <Link href="/companion">
            <Button size="sm" variant="secondary">
              Open setup guide
            </Button>
          </Link>
          <a href="/downloads/tarkov-helper-companion.ps1" download>
            <Button size="sm" variant="outline">
              Download Windows companion
            </Button>
          </a>
        </div>

        {!props.compact ? (
          <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
            <li>Generate a token and copy endpoint + token.</li>
            <li>Download the Windows companion script and run a first pass with <code>-BackfillOnly</code>.</li>
            <li>Check for <code>Sent X events (taskUpdates=Y)</code> in PowerShell output.</li>
            <li>Use live mode while playing for continuous updates.</li>
          </ol>
        ) : null}

        {status === null && !loading ? (
          <p className="text-xs text-amber-300">
            Companion token API failed. Run <code>npm run prisma:push</code>, restart <code>npm run dev</code>, and try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
